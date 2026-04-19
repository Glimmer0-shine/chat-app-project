import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Auth from './Auth';
import Chat from './Chat'; 
import Friends from './Friends';
import Profile from './Profile';
import Rooms from './Rooms';
import SharedFolder from './SharedFolder';
import SharedDocuments from './SharedDocuments';

function App() {
  const [session, setSession] = useState(null);
  const [activeTab, setActiveTab] = useState('friends');
  const [currentChatFriend, setCurrentChatFriend] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [subTab, setSubTab] = useState('chat'); // 'chat' または 'album'

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
    setSubTab('chat'); // 追加
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
                currentChatFriend ? (
                  <div>
                    {/* サブメニューヘッダー */}
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #ddd', paddingBottom: '5px' }}>
                      <button 
                        onClick={() => setCurrentChatFriend(null)} 
                        style={{ background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', marginRight: '10px' }}
                      >
                        ← 戻る
                      </button>
                      <div style={{ flex: 1, textAlign: 'center', fontWeight: 'bold' }}>{currentChatFriend}</div>
                    </div>

                    {/* チャット・アルバムの切り替えタブ */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                      <button 
                        onClick={() => setSubTab('chat')}
                        style={{ 
                          flex: 1, padding: '8px', cursor: 'pointer',
                          border: 'none', borderRadius: '20px',
                          backgroundColor: subTab === 'chat' ? '#e7f3ff' : 'transparent',
                          color: subTab === 'chat' ? '#007bff' : '#666',
                          fontWeight: subTab === 'chat' ? 'bold' : 'normal'
                        }}
                      >
                        💬 トーク
                      </button>
                      <button 
                        onClick={() => setSubTab('album')}
                        style={{ 
                          flex: 1, padding: '8px', cursor: 'pointer',
                          border: 'none', borderRadius: '20px',
                          backgroundColor: subTab === 'album' ? '#e7f3ff' : 'transparent',
                          color: subTab === 'album' ? '#007bff' : '#666',
                          fontWeight: subTab === 'album' ? 'bold' : 'normal'
                        }}
                      >
                        🖼️ アルバム
                      </button>
                      <button 
                        onClick={() => setSubTab('files')}
                        style={{ 
                          flex: 1, padding: '8px', cursor: 'pointer',
                          border: 'none', borderRadius: '20px',
                          backgroundColor: subTab === 'album' ? '#e7f3ff' : 'transparent',
                          color: subTab === 'album' ? '#007bff' : '#666',
                          fontWeight: subTab === 'album' ? 'bold' : 'normal'
                        }}
                      >
                        📁 ファイル
                      </button>
                    </div>

                    {/* コンテンツ表示 */}
                    {subTab === 'chat' && <Chat session={session} friendEmail={currentChatFriend} />}
                    {subTab === 'album' && <SharedFolder session={session} friendEmail={currentChatFriend} />}
                    {subTab === 'files' && <SharedDocuments session={session} friendEmail={currentChatFriend} />}
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