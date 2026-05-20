import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Auth from './Auth';
import Chat from './Chat'; 
import Friends from './Friends';
import Profile from './Profile';
import Rooms from './Rooms';

function App() {
  // --- 1. ステート定義 (初期値としてlocalStorageを読み込む) ---
  const [session, setSession] = useState(null);
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'friends');
  const [currentChatFriend, setCurrentChatFriend] = useState(() => localStorage.getItem('currentChatFriend') || null);
  const [currentChatRoomId, setCurrentChatRoomId] = useState(() => localStorage.getItem('currentChatRoomId') || null);
  const [showProfile, setShowProfile] = useState(() => localStorage.getItem('showProfile') === 'true');
  // const [myDisplayName, setMyDisplayName] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);


  // 下部タブのスタイル
  const footerTabStyle = (isActive) => ({
    flex: 1,
    padding: '12px 0',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: isActive ? '#007bff' : '#888',
    border: 'none',
    fontWeight: isActive ? 'bold' : 'normal',
    fontSize: '0.9rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  });

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

  // --- 3. useEffect 2: リロード時の「戻し」処理 (初回のみ) ---
  useEffect(() => {
    // トーク中、またはプロフィール中にリロードされた場合、強制的に一覧画面へ戻す
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

  // --- 5. useEffect 4: 状態が変わるたびに localStorage に保存 ---
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
    localStorage.setItem('currentChatFriend', currentChatFriend || '');
    localStorage.setItem('currentChatRoomId', currentChatRoomId || '');
    localStorage.setItem('showProfile', showProfile);
  }, [activeTab, currentChatFriend, currentChatRoomId, showProfile]);

  const handleStartChat = (friendEmail, roomId = null) => {
    // friendEmailは1対1の場合のみ、roomIdはグループと1対1両方で使う
    setCurrentChatFriend(friendEmail);
    setCurrentChatRoomId(roomId); 
    setShowProfile(false);
    // トーク一覧から選んだ場合は、タブを「トーク」のままにしておきたいので activeTab は変えない
  };

  const handleLogout = () => supabase.auth.signOut();

  if (!session) return <Auth />;

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f5f5f5' }}>
      
      {/* 1. コンテンツ表示エリア (チャット中ならここが全画面) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#fff' }}>
        
        {/* チャット中でない場合のみ上部ヘッダーを表示 */}
        {!currentChatFriend && !showProfile && (
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderBottom: '1px solid #eee' }}>
            <span style={{ fontSize: '0.9rem', fontFamily: "cursive" }}>
              🍀Y Talk
            </span>
            <button onClick={handleLogout} style={{ padding: '5px 10px', fontSize: '0.8rem' }}>ログアウト</button>
          </header>
        )}

        {/* メイン表示切り替え */}
        <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          {showProfile ? (
            <Profile session={session} onBack={() => setShowProfile(false)} />
          ) : (currentChatFriend || currentChatRoomId) ? (
            // App.js の Chat コンポーネントを呼び出している部分
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
                // ↓ ここが重要！ 戻った後に一覧をリフレッシュする処理
                // if (activeTab === 'rooms') {
                //   // Rooms.js に再取得を促す仕組み（後述のRooms.jsの修正とセット）
                // }
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
              key={refreshKey} // ★重要：これが変わると Rooms が新しく作り直される
              session={session} 
              onSelectRoom={handleStartChat} 
            />
          )}
        </div>
      </div>

      {/* 2. 下部メインタブ (個別チャット中・プロフィール編集中は非表示) */}
      {!currentChatFriend && !currentChatRoomId && !showProfile && (
        <footer style={{ 
          display: 'flex', 
          borderTop: '1px solid #eee', 
          backgroundColor: '#fff', 
          paddingBottom: 'env(safe-area-inset-bottom)' 
        }}>
          <button onClick={() => setActiveTab('friends')} style={footerTabStyle(activeTab === 'friends')}>
            <span style={{ fontSize: '1.2rem' }}>👥</span>
            連絡帳
          </button>
          <button onClick={() => setActiveTab('rooms')} style={footerTabStyle(activeTab === 'rooms')}>
            <span style={{ fontSize: '1.2rem' }}>💬</span>
            トーク
          </button>
        </footer>
      )}
    </div>
  );
}

export default App;