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
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
    };
    getSession();

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
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