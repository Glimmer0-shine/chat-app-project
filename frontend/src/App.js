import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Auth from './Auth';
import Chat from './Chat'; 

function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    // 現在のログイン状態を取得
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    // ログイン状態の変化を監視（ログイン・ログアウト時に自動で動く）
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ログアウト処理
  const handleLogout = () => supabase.auth.signOut();

  return (
    <div className="App" style={{ padding: '20px' }}>
      {!session ? (
        <Auth />
      ) : (
        <div>
          <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            <span>ようこそ、<strong>{session.user.email}</strong> さん</span>
            <button onClick={handleLogout}>ログアウト</button>
          </header>
          
          <Chat session={session} /> {/* ここでChatを呼び出し、セッションを渡す */}
        </div>
      )}
    </div>
  );
}

export default App;