import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Auth from './Auth';
import Chat from './Chat'; 
import Friends from './Friends';
import Profile from './Profile';
import Rooms from './Rooms';
import { theme, commonStyles } from './theme';

// コンポーネント外で処理ロック用フラグを管理（無限ループ・二重通信を物理的に防止）
let isCheckingStatus = false;
let isInitializing = false; // 🚀 起動処理の重複を防ぐためのフラグ

function App() {
  // --- 1. ステート定義 ---
  const [session, setSession] = useState(null);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'friends');
  const [currentChatFriend, setCurrentChatFriend] = useState(() => localStorage.getItem('currentChatFriend') || null);
  const [currentChatRoomId, setCurrentChatRoomId] = useState(() => localStorage.getItem('currentChatRoomId') || null);
  const [showProfile, setShowProfile] = useState(() => localStorage.getItem('showProfile') === 'true');
  const [refreshKey, setRefreshKey] = useState(0);

  // --- 2. useEffect: セッション管理 ---
  useEffect(() => {
    console.log("[App.js] 🔐 認証管理 useEffect が起動しました");

    // ユーザーが退会済みか判定する共通関数（タイムアウト救済機能付き）
    const checkUserStatus = async (user) => {
      if (!user) return true;

      if (isCheckingStatus) {
        console.log("[App.js] ⚠️ 退会チェック: すでに通信中のため、割り込みを防止しました");
        return true; 
      }

      isCheckingStatus = true; 
      console.log(`[App.js] 🔄 DB問い合わせ開始: profiles チェック中... (ID: ${user.id})`);

      // 🕒 対策：Supabaseの迷子ハングに巻き込まれないよう、3秒で強制突破するタイムアウトを用意
      const timeoutPromise = new Promise((resolve) => 
        setTimeout(() => resolve({ timeout: true }), 3000)
      );

      // 実際のDB問い合わせ
      const dbPromise = supabase
        .from('profiles')
        .select('is_deleted')
        .eq('id', user.id)
        .maybeSingle();

      try {
        // レース（競争）させて、3秒経ってもDBから返事がなければタイムアウト側が勝つ
        const result = await Promise.race([dbPromise, timeoutPromise]);

        if (result && result.timeout) {
          console.warn("[App.js] ⏳ DB問い合わせが3秒間応答しなかったため、安全のためにチェックをスキップしてログインを通します。");
          isCheckingStatus = false;
          return true; // 固まらせないために救済
        }

        // 通常通りDBから返事が返ってきた場合
        const { data, error } = result;
        console.log("[App.js] 🟢 DB問い合わせ完了:", { data, error });

        if (error) {
          console.error("[App.js] プロフィール取得エラー:", error.message);
          return true; 
        }

        if (data?.is_deleted) {
          console.warn("[App.js] 🚨 退会済みユーザーを検知");
          alert("このアカウントは退会済みです。");
          await supabase.auth.signOut();
          return false; 
        }
      } catch (e) {
        console.error("[App.js] 退会チェック例外:", e);
      } finally {
        isCheckingStatus = false; 
      }
      return true; 
    };

    const initializeAuth = async () => {
      // 🚀 対策：すでに1回目が処理中なら、ReactのStrict Modeによる2回目の同時実行をここで完全にシャットアウト
      if (isInitializing) {
        console.log("[App.js] ⚠️ initializeAuth: すでに初期化が進行中のため、2回目の実行をスキップします");
        return;
      }
      isInitializing = true; // 🔒 ロック開始
      console.log("[App.js] 🚀 initializeAuth 処理を開始します");

      // A. 認証維持期間のチェック
      const limitDays = parseInt(localStorage.getItem('auth_session_limit') || '0');
      const lastVerified = localStorage.getItem('auth_last_verified');
      console.log("[App.js] ログイン維持期間の設定状況:", { limitDays, lastVerified });

      if (lastVerified) {
        const diffMs = Date.now() - parseInt(lastVerified);
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        let shouldSignOut = false;

        if (limitDays === 0) {
          if (!sessionStorage.getItem('session_active')) {
            console.log("[App.js] ⏰ 設定「毎回」: sessionStorage がないためログアウト対象");
            shouldSignOut = true;
          }
        } else if (diffDays > limitDays) {
          console.log(`[App.js] ⏰ 有効期限切れ: ${diffDays.toFixed(1)}日経過（制限:${limitDays}日）`);
          alert(`ログイン有効期限（${limitDays}日）が切れたため、再ログインが必要です。`);
          shouldSignOut = true;
        }

        if (shouldSignOut) {
          console.log("[App.js] 🧹 期限切れのため、Supabaseとローカルストレージをクリアします");
          
          // 🚀 対策：これからログアウトするので、直後のonAuthStateChangeによる退会チェックが暴発しないようロック
          isCheckingStatus = true; 
          
          await supabase.auth.signOut();
          localStorage.removeItem('auth_last_verified');
          sessionStorage.removeItem('session_active');
          setSession(null);
          
          // 🔓 処理が完了したので両方のロックを解除
          isCheckingStatus = false; 
          isInitializing = false;
          return; 
        }
      }

      // B. 既存のセッション取得ロジック
      console.log("[App.js] 🔍 既存のセッション（自動ログイン）を確認します...");
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      console.log("[App.js] 既存セッション確認結果:", initialSession ? "あり" : "なし");
      
      if (initialSession) {
        const isUserActive = await checkUserStatus(initialSession.user);
        if (!isUserActive) {
          setSession(null);
          isInitializing = false; // 🔓 途中で抜ける場合もロックを解除
          return; 
        }
      }

      setSession(initialSession);

      if (initialSession) {
        sessionStorage.setItem('session_active', 'true');
        if (!lastVerified) {
          localStorage.setItem('auth_last_verified', Date.now().toString());
        }
      }
      console.log("[App.js] 🎉 initializeAuth が無事に完了しました");
      isInitializing = false; // 🔓 正常に最後まで完了したのでロックを解除
    };

    initializeAuth();

    // C. 状態変化 of 認証の監視
    console.log("[App.js] 🎧 onAuthStateChange の監視リスナーを登録します");
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      console.log(`[App.js] 🔔 認証イベント検知: [${event}]`);

      // if (currentSession && event === 'SIGNED_IN') {
      if (currentSession && event === 'SIGNED_IN' && !isInitializing) {
        console.log("[App.js] 🚪 ログインイベントに伴い、退会チェックを通します");
        const isUserActive = await checkUserStatus(currentSession.user);
        if (!isUserActive) {
          setSession(null);
          return; 
        }
      }

      setSession(currentSession);
      if (currentSession) {
        sessionStorage.setItem('session_active', 'true');
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          localStorage.setItem('auth_last_verified', Date.now().toString());
        }
      } else {
        sessionStorage.removeItem('session_active');
      }
    });

    return () => {
      console.log("[App.js] 🔌 認証管理リスナーを解除します");
      subscription.unsubscribe();
    };
  }, []);

  // --- 3. useEffect: リロード時の「戻し」処理 ---
  useEffect(() => {
    const isChatting = localStorage.getItem('currentChatFriend') || localStorage.getItem('currentChatRoomId');
    const isViewingProfile = localStorage.getItem('showProfile') === 'true';

    if (isChatting) {
      setCurrentChatFriend(null);
      setCurrentChatRoomId(null);
      setActiveTab('rooms');
    } else if (isViewingProfile) {
      setShowProfile(false);
      setActiveTab('friends');
    }
  }, []);

  // --- 4. useEffect: localStorage への保存 ---
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
    localStorage.setItem('currentChatFriend', currentChatFriend || '');
    localStorage.setItem('currentChatRoomId', currentChatRoomId || '');
    localStorage.setItem('showProfile', showProfile);
  }, [activeTab, currentChatFriend, currentChatRoomId, showProfile]);

  // --- 4.5. 新規ユーザー・ニックネーム未設定ユーザーの自動リダイレクト ---
  useEffect(() => {
    // セッションがない（ログインしていない）なら何もしない
    if (!session?.user?.id) return;

    const checkNickname = async () => {
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', session.user.id)
          .maybeSingle();

        if (error) {
          console.error("[App.js] ニックネームチェックエラー:", error.message);
          return;
        }

        // プロフィールの行自体がない、または表示名（ニックネーム）が空の場合
        if (!profile || !profile.display_name) {
          console.log("[App.js] ⚠️ ニックネーム未設定を検知。プロフィール画面へ誘導します。");
          alert("ニックネームが未設定です。ニックネームを設定してみましょう！");
          setShowProfile(true);
        }
      } catch (e) {
        console.error("[App.js] ニックネームチェック例外:", e);
      }
    };

    checkNickname();
  }, [session?.user?.id]);

  // --- 5. ハンドラー ---
  const handleStartChat = (friendEmail, roomId = null) => {
    setCurrentChatFriend(friendEmail);
    setCurrentChatRoomId(roomId); 
    setShowProfile(false);
  };

  const handleLogout = () => {
    console.log("[App.js] 🚪 手動ログアウトがクリックされました");
    supabase.auth.signOut();
  };

  if (!session) {
    console.log("[App.js] 🔐 セッションなし: Auth 画面を表示します");
    return <Auth />;
  }

  // --- 6. JSX 部分 ---
  return (
    <div style={styles.container}>
      <div style={styles.contentWrapper}>
        {!currentChatFriend && !showProfile && (
          <header style={styles.header}>
            <span style={styles.logo}>🍀Y Talk</span>
            <button 
              onClick={handleLogout} 
              style={{ ...commonStyles.button, padding: '5px 10px', fontSize: '0.8rem', backgroundColor: '#eee', color: '#333' }}
            >
              ログアウト
            </button>
          </header>
        )}

        <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          {showProfile ? (
            <Profile session={session} onBack={() => setShowProfile(false)} />
          ) : (currentChatFriend || currentChatRoomId) ? (
            <Chat 
              session={session} 
              friendEmail={currentChatFriend} 
              roomId={currentChatRoomId}
              onBack={() => {
                setCurrentChatFriend(null);
                setCurrentChatRoomId(null);
                localStorage.removeItem('currentChatFriend');
                localStorage.removeItem('currentChatRoomId');
                setRefreshKey(prev => prev + 1);
              }}
            />
          ) : activeTab === 'friends' ? (
            <Friends 
              session={session} 
              onStartChat={handleStartChat} 
              onOpenSettings={() => setShowProfile(true)} 
            />
          ) : (
            <Rooms 
              key={refreshKey} 
              session={session} 
              onSelectRoom={handleStartChat} 
            />
          )}
        </div>
      </div>

      {!currentChatFriend && !currentChatRoomId && !showProfile && (
        <footer style={styles.footer}>
          <button onClick={() => setActiveTab('friends')} style={styles.footerTab(activeTab === 'friends')}>
            <span style={{ fontSize: '1.2rem' }}>👥</span>
            連絡帳
          </button>
          <button onClick={() => setActiveTab('rooms')} style={styles.footerTab(activeTab === 'rooms')}>
            <span style={{ fontSize: '1.2rem' }}>💬</span>
            トーク
          </button>
        </footer>
      )}
    </div>
  );
}

const styles = {
  container: { maxWidth: '600px', margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: theme.colors.bgApp },
  contentWrapper: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: theme.colors.bgContent },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderBottom: `1px solid ${theme.colors.border}`, backgroundColor: '#fff' },
  logo: { fontSize: '0.9rem', fontFamily: "cursive", color: theme.colors.textMain, fontWeight: 'bold' },
  footer: { display: 'flex', borderTop: `1px solid ${theme.colors.border}`, backgroundColor: '#fff', paddingBottom: 'env(safe-area-inset-bottom)' },
  footerTab: (isActive) => ({ flex: 1, padding: '12px 0', border: 'none', backgroundColor: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontSize: '0.85rem', color: isActive ? theme.colors.primary : theme.colors.textSub, transition: '0.2s', fontWeight: isActive ? 'bold' : 'normal' })
};

export default App;