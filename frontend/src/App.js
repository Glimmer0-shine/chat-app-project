import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Auth from './Auth';
import Chat from './Chat'; 
import Friends from './Friends';
import Profile from './Profile';
import Rooms from './Rooms';
import SplashScreen from './SplashScreen'; // 🚀 新規追加
import Tutorial from './Tutorial';         // 🚀 新規追加
import { theme, commonStyles } from './theme';

// コンポーネント外で処理ロック用フラグを管理（無限ループ・二重通信を物理的に防止）
let isCheckingStatus = false;
let isInitializing = false; // 🚀 起動処理の重複を防ぐためのフラグ
let hasCheckedNicknameInSession = false; // 🛡️ セキュアバイデザイン：同一セッション内でのニックネーム二重チェック防止

function App() {
  // --- 0. 画面表示ステート ('splash' | 'tutorial' | 'app') ---
  const [appPhase, setAppPhase] = useState('splash');

  // --- 1. ステート定義 ---
  const [session, setSession] = useState(null);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'friends');
  const [currentChatFriend, setCurrentChatFriend] = useState(() => localStorage.getItem('currentChatFriend') || null);
  const [currentChatRoomId, setCurrentChatRoomId] = useState(() => localStorage.getItem('currentChatRoomId') || null);
  const [showProfile, setShowProfile] = useState(() => localStorage.getItem('showProfile') === 'true');
  const [refreshKey, setRefreshKey] = useState(0);

  // --- 4.5. 新規ユーザー・ニックネーム未設定ユーザーの自動リダイレクト ---
  const checkNickname = async (userId) => {
    if (!userId || hasCheckedNicknameInSession) return;
    
    try {
      hasCheckedNicknameInSession = true;
      
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error("[App.js] ニックネームチェックエラー:", error.message);
        hasCheckedNicknameInSession = false;
        return;
      }

      if (!profile || !profile.display_name) {
        console.log("[App.js] ⚠️ ニックネーム未設定を検知。プロフィール画面へ誘導します。");
        alert("ニックネームが未設定です。ニックネームを設定してみましょう！");
        setShowProfile(true);
      }
    } catch (e) {
      console.error("[App.js] ニックネームチェック例外:", e);
      hasCheckedNicknameInSession = false;
    }
  };

  // --- 1.5 起動シーケンスの制御 (スプラッシュ ➔ チュートリアル) ---
  useEffect(() => {
    const splashTimer = setTimeout(() => {
      // 過去にチュートリアルを見たことがあるかチェック
      const hasSeen = localStorage.getItem('has_seen_tutorial');
      if (hasSeen === 'true') {
        setAppPhase('app'); // すでに見たことがある場合はアプリ本体へ
      } else {
        setAppPhase('tutorial'); // 初めての場合はチュートリアル画面へ
      }
    }, 2500); // 2.5秒間ロゴを表示

    // もし2.5秒経つ前に画面が破棄されたら、予約したタイマーを取り消す。画面上に存在しないコンポーネントに対して2.5秒後に状態変更（setAppPhase）を行おうさせないように。
    return () => clearTimeout(splashTimer);
  }, []);

  const handleCompleteTutorial = () => {
    localStorage.setItem('has_seen_tutorial', 'true');
    setAppPhase('app');
  };

  // --- 2. useEffect: セッション管理 ---
  useEffect(() => {
    console.log("[App.js] 🔐 認証管理 useEffect が起動しました");

    const checkUserStatus = async (user) => {
      if (!user) return true;

      if (isCheckingStatus) {
        console.log("[App.js] ⚠️ 退会チェック: すでに通信中のため、割り込みを防止しました");
        return true; 
      }

      isCheckingStatus = true; 
      console.log(`[App.js] 🔄 DB問い合わせ開始: profiles チェック中... (ID: ${user.id})`);

      const timeoutPromise = new Promise((resolve) => 
        setTimeout(() => resolve({ timeout: true }), 3000)
      );

      const dbPromise = supabase
        .from('profiles')
        .select('is_deleted')
        .eq('id', user.id)
        .maybeSingle();

      try {
        const result = await Promise.race([dbPromise, timeoutPromise]);

        if (result && result.timeout) {
          console.warn("[App.js] ⏳ DB問い合わせが3秒間応答しなかったため、安全のためにチェックをスキップしてログインを通します。");
          isCheckingStatus = false;
          return true; 
        }

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
          localStorage.removeItem('auth_last_verified');
          sessionStorage.removeItem('session_active');
          hasCheckedNicknameInSession = false;
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
      if (isInitializing) {
        console.log("[App.js] ⚠️ initializeAuth: すでに初期化が進行中のため、2回目の実行をスキップします");
        return;
      }
      isInitializing = true; 
      console.log("[App.js] 🚀 initializeAuth 処理を開始します");

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
          isCheckingStatus = true; 
          
          await supabase.auth.signOut();
          localStorage.removeItem('auth_last_verified');
          sessionStorage.removeItem('session_active');
          hasCheckedNicknameInSession = false;
          setSession(null);
          
          isCheckingStatus = false; 
          isInitializing = false;
          return; 
        }
      }

      console.log("[App.js] 🔍 既存のセッション（自動ログイン）を確認します...");
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      console.log("[App.js] 既存セッション確認結果:", initialSession ? "あり" : "なし");
      
      if (initialSession) {
        const isUserActive = await checkUserStatus(initialSession.user);
        if (!isUserActive) {
          setSession(null);
          isInitializing = false; 
          return; 
        }
      }

      setSession(initialSession);

      if (initialSession) {
        sessionStorage.setItem('session_active', 'true');
        if (!lastVerified) {
          localStorage.setItem('auth_last_verified', Date.now().toString());
        }
        await checkNickname(initialSession.user.id);
      }
      console.log("[App.js] 🎉 initializeAuth が無事に完了しました");
      isInitializing = false; 
    };

    initializeAuth();

    console.log("[App.js] 🎧 onAuthStateChange の監視リスナーを登録します");
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      console.log(`[App.js] 🔔 認証イベント検知: [${event}]`);

      if (currentSession && event === 'SIGNED_IN' && !isInitializing) {
        console.log("[App.js] 🚪 ログインイベントに伴い、退会チェックを通します");
        const isUserActive = await checkUserStatus(currentSession.user);
        if (!isUserActive) {
          setSession(null);
          return; 
        }
        await checkNickname(currentSession.user.id);
      }

      setSession(currentSession);
      if (currentSession) {
        sessionStorage.setItem('session_active', 'true');
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          localStorage.setItem('auth_last_verified', Date.now().toString());
        }
      } else {
        sessionStorage.removeItem('session_active');
        hasCheckedNicknameInSession = false; 
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

  // --- 5. ハンドラー ---
  const handleStartChat = (friendEmail, roomId = null) => {
    setCurrentChatFriend(friendEmail);
    setCurrentChatRoomId(roomId); 
    setShowProfile(false);
  };

  const handleLogout = async () => {
    console.log("[App.js] 🚪 手動ログアウトがクリックされました");
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("[App.js] Supabaseログアウト中の例外:", e);
    } finally {
      localStorage.removeItem('auth_last_verified');
      sessionStorage.removeItem('session_active');
      hasCheckedNicknameInSession = false;
      setSession(null);
    }
  };

  // ==========================================
  // 画面レンダリング分岐
  // ==========================================

  // ① スプラッシュ画面表示中
  if (appPhase === 'splash') {
    return <SplashScreen />;
  }

  // ② チュートリアル画面表示中（初回のみ）
  if (appPhase === 'tutorial') {
    return <Tutorial onComplete={handleCompleteTutorial} />;
  }

  // ③ チュートリアル完了後 ➔ ログインなしなら Auth 画面を表示
  if (!session) {
    console.log("[App.js] 🔐 セッションなし: Auth 画面を表示します");
    return <Auth />;
  }

  // ④ ログイン済み ➔ メインアプリ画面を表示
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