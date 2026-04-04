import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Auth from './Auth';
import Chat from './Chat'; 
import Friends from './Friends';
import Profile from './Profile';
import Rooms from './Rooms';

function App() {
  const [session, setSession] = useState(null);
  const [activeTab, setActiveTab] = useState('friends');
  const [currentChatFriend, setCurrentChatFriend] = useState(null);
  const [showProfile, setShowProfile] = useState(false);

  // ★ 追加: タブのスタイルを計算する関数
  const tabStyle = (isActive) => ({
    flex: 1,
    padding: '12px',
    cursor: 'pointer',
    backgroundColor: isActive ? '#007bff' : '#f0f0f0',
    color: isActive ? 'white' : 'black',
    border: 'none',
    borderRadius: '5px',
    transition: '0.3s',
    fontWeight: isActive ? 'bold' : 'normal'
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

  const handleStartChat = (friendEmail) => {
    setCurrentChatFriend(friendEmail);
    setActiveTab('chat');
    setShowProfile(false); // トーク開始時はプロフィールを閉じる
  };

  const handleLogout = () => supabase.auth.signOut();

  return (
    <div className="App" style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      {!session ? (
        <Auth />
      ) : (
        <div>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <span style={{ fontSize: '0.9rem' }}>👤 <strong>{session.user.email}</strong></span>
            <button onClick={handleLogout} style={{ padding: '5px 10px' }}>ログアウト</button>
          </header>

          {/* タブメニュー */}
          <nav style={{ display: 'flex', gap: '5px', marginBottom: '20px' }}>
            <button 
              onClick={() => { setActiveTab('friends'); setShowProfile(false); }} 
              style={tabStyle(activeTab === 'friends' && !showProfile)}
            >
              連絡帳
            </button>
            <button 
              onClick={() => { setActiveTab('chat'); setShowProfile(false); }} 
              style={tabStyle(activeTab === 'chat' && !showProfile)}
            >
              トーク
            </button>
          </nav>

          {/* 表示するコンテンツの切り替え */}
          <div style={{ border: '1px solid #eee', borderRadius: '10px', padding: '10px', minHeight: '450px', backgroundColor: '#fff' }}>
            {showProfile ? (
              <Profile session={session} onBack={() => setShowProfile(false)} />
            ) : (
              activeTab === 'friends' ? (
                <Friends 
                  session={session} 
                  onStartChat={handleStartChat} 
                  onOpenSettings={() => setShowProfile(true)} 
                />
              ) : (
                // ★ ここを修正：相手を選んでいれば Chat、選んでいなければ Rooms を表示
                currentChatFriend ? (
                  <div style={{ position: 'relative' }}>
                    <button 
                      onClick={() => setCurrentChatFriend(null)} 
                      style={{ marginBottom: '10px', background: 'none', border: 'none', color: '#007bff', cursor: 'pointer' }}
                    >
                      ← 一覧に戻る
                    </button>
                    <Chat session={session} friendEmail={currentChatFriend} />
                  </div>
                ) : (
                  <Rooms session={session} onSelectRoom={(email) => setCurrentChatFriend(email)} />
                )
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;