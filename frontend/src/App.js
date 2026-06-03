import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Auth from './Auth';
import Chat from './Chat'; 
import Friends from './Friends';
import Profile from './Profile';
import Rooms from './Rooms';
import { theme, commonStyles } from './theme'; // themeをインポート

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
    
    // 【新しく追加した共通関数】ユーザーが退会済みか判定し、退会済みならログアウトさせる
    const checkUserStatus = async (user) => {
      if (!user) return true;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('is_deleted')
          .eq('id', user.id)
          .single();
        
        // 退会フラグが true の場合
        if (!error && data?.is_deleted) {
          alert("このアカウントは退会済みです。");
          await supabase.auth.signOut();
          return false; // 退会しているためNG判定
        }
      } catch (e) {
        console.error("退会チェックエラー:", e);
      }
      return true; // 継続利用OK判定
    };

    const initializeAuth = async () => {
      // A. 認証維持期間のチェック
      const limitDays = parseInt(localStorage.getItem('auth_session_limit') || '0');
      const lastVerified = localStorage.getItem('auth_last_verified');

      if (lastVerified) {
        const diffMs = Date.now() - parseInt(lastVerified);
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        let shouldSignOut = false;

        if (limitDays === 0) {
          // 【設定：毎回】sessionStorage（タブを閉じると消える）がない場合はログアウト
          if (!sessionStorage.getItem('session_active')) {
            shouldSignOut = true;
          }
        } else if (diffDays > limitDays) {
          // 【設定：1ヶ月/半年】期限切れの場合
          alert(`ログイン有効期限（${limitDays}日）が切れたため、再ログインが必要です。`);
          shouldSignOut = true;
        }

        if (shouldSignOut) {
          await supabase.auth.signOut();
          localStorage.removeItem('auth_last_verified');
          sessionStorage.removeItem('session_active');
          setSession(null);
          return; // ログアウトした場合はここで終了
        }
      }

      // B. 既存のセッション取得ロジック
      const { data: { session } } = await supabase.auth.getSession();
      
      // 【変更点】アプリ起動時にセッションがあった場合、退会済みユーザーでないか確認する
      if (session) {
        const isUserActive = await checkUserStatus(session.user);
        if (!isUserActive) {
          setSession(null);
          return; // 退会済みならここで処理を止める
        }
      }

      setSession(session);

      if (session) {
        // セッションが有効なら、アクティブフラグを立てる
        sessionStorage.setItem('session_active', 'true');
        // 初めての利用などでVerifiedがない場合はセット
        if (!lastVerified) {
          localStorage.setItem('auth_last_verified', Date.now().toString());
        }
      }
    };

    initializeAuth();

    // C. 状態変化の監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // 【変更点】ログイン（SIGNED_IN）が発生した瞬間に退会チェックを割り込ませる
      if (session && event === 'SIGNED_IN') {
        const isUserActive = await checkUserStatus(session.user);
        if (!isUserActive) {
          setSession(null);
          return; // 退会済みならこれ以降のログイン処理（セッション保持）をさせない
        }
      }

      setSession(session);
      if (session) {
        sessionStorage.setItem('session_active', 'true');
        // ログイン成功時、またはパスワード変更時などに時刻を更新
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
          localStorage.setItem('auth_last_verified', Date.now().toString());
        }
      } else {
        sessionStorage.removeItem('session_active');
      }
    });

    return () => subscription.unsubscribe();
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

  const handleLogout = () => supabase.auth.signOut();

  if (!session) return <Auth />;

  // --- 6. JSX 部分 ---
  return (
    <div style={styles.container}>
      
      {/* 1. コンテンツ表示エリア */}
      <div style={styles.contentWrapper}>
        
        {/* チャット中でない場合のみ上部ヘッダーを表示 */}
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

        {/* メイン表示切り替え */}
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

      {/* 2. 下部メインタブ */}
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

// --- 7. スタイル定義 (exportの前に配置) ---
// 【修正なし】オリジナルコードのCSSプロパティを一言一句完全に維持しています
const styles = {
  container: {
    maxWidth: '600px',
    margin: '0 auto',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: theme.colors.bgApp, // themeを適用
  },
  contentWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: theme.colors.bgContent, // themeを適用
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '15px 20px',
    borderBottom: `1px solid ${theme.colors.border}`, // themeを適用
    backgroundColor: '#fff',
  },
  logo: {
    fontSize: '0.9rem',
    fontFamily: "cursive",
    color: theme.colors.textMain, // themeを適用
    fontWeight: 'bold',
  },
  footer: {
    display: 'flex',
    borderTop: `1px solid ${theme.colors.border}`, // themeを適用
    backgroundColor: '#fff',
    paddingBottom: 'env(safe-area-inset-bottom)',
  },
  // アクティブ状態によって色が変わるタブ用
  footerTab: (isActive) => ({
    flex: 1,
    padding: '12px 0',
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    fontSize: '0.85rem',
    color: isActive ? theme.colors.primary : theme.colors.textSub, // themeを適用
    transition: '0.2s',
    fontWeight: isActive ? 'bold' : 'normal',
  })
};

export default App;