import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import SharedFolder from './SharedFolder';
import SharedDocuments from './SharedDocuments';

const Chat = ({ session, friendEmail, onBack }) => {
  const [subTab, setSubTab] = useState('chat'); // 内部でサブタブを管理
  const [message, setMessage] = useState('');
  const [chatLog, setChatLog] = useState([]);
  const [friendDisplayName, setFriendDisplayName] = useState('');

  const getRoomId = () => {
    if (!session?.user?.email || !friendEmail) return 'public';
    const sorted = [session.user.email, friendEmail].sort();
    return `${sorted[0]}-${sorted[1]}`;
  };

  const roomId = getRoomId();

  useEffect(() => {
    const fetchFriendName = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('email', friendEmail)
        .single();
      if (data) setFriendDisplayName(data.display_name || '');
    };
    fetchFriendName();
  }, [friendEmail]);

  useEffect(() => {
    if (!session?.access_token || !friendEmail) return;
    supabase.realtime.setAuth(session.access_token);
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });
      if (!error) setChatLog(data || []);
    };
    fetchMessages();

    const channel = supabase
      .channel(roomId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          setChatLog((prev) => {
            const exists = prev.find((msg) => msg.id === payload.new.id);
            if (exists) return prev;
            return [...prev, payload.new];
          });
        }
      ).subscribe();
    return () => supabase.removeChannel(channel);
  }, [session, roomId, friendEmail]);

  const sendMessage = async () => {
    if (!message.trim() || !session?.user) return;
    const { error } = await supabase.from('messages').insert([{ text: message, user: session.user.email, room_id: roomId }]);
    if (!error) setMessage('');
  };

  const subTabButtonStyle = (isActive) => ({
    flex: 1, padding: '10px 0', cursor: 'pointer', border: 'none', background: 'none',
    fontSize: '0.85rem', color: isActive ? '#007bff' : '#888',
    borderBottom: isActive ? '2px solid #007bff' : '2px solid transparent',
    transition: '0.2s', fontWeight: isActive ? 'bold' : 'normal'
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 1. チャットヘッダー（最上部固定） */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 15px', borderBottom: '1px solid #eee', backgroundColor: '#fff' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', marginRight: '10px' }}>←</button>
        <span style={{ fontWeight: 'bold' }}>{friendDisplayName || friendEmail}</span>
      </div>

      {/* 2. ルーム内サブタブ */}
      <div style={{ display: 'flex', backgroundColor: '#fff', borderBottom: '1px solid #eee' }}>
        <button onClick={() => setSubTab('chat')} style={subTabButtonStyle(subTab === 'chat')}>トーク</button>
        <button onClick={() => setSubTab('album')} style={subTabButtonStyle(subTab === 'album')}>アルバム</button>
        <button onClick={() => setSubTab('files')} style={subTabButtonStyle(subTab === 'files')}>ファイル</button>
      </div>

      {/* 3. コンテンツエリア */}
      <div style={{ flex: 1, overflowY: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {subTab === 'chat' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#f0f2f5', padding: '15px' }}>
              {chatLog.map((msg, i) => {
                if (msg.is_system) {
                  return (
                    <div key={msg.id || i} style={{ textAlign: 'center', margin: '15px 0' }}>
                      <span style={{ backgroundColor: '#d1d5db', color: '#4b5563', padding: '3px 12px', borderRadius: '12px', fontSize: '0.7rem' }}>{msg.text}</span>
                    </div>
                  );
                }
                const isMe = msg.user === session.user.email;
                return (
                  <div key={msg.id || i} style={{ textAlign: isMe ? 'right' : 'left', marginBottom: '15px' }}>
                    {!isMe && <div style={{ fontSize: '0.65rem', color: '#888', marginLeft: '5px', marginBottom: '2px' }}>{friendDisplayName || msg.user}</div>}
                    <div style={{ 
                      display: 'inline-block', padding: '8px 14px', borderRadius: '18px', 
                      backgroundColor: isMe ? '#007bff' : '#fff', color: isMe ? 'white' : 'black',
                      maxWidth: '80%', textAlign: 'left', boxShadow: isMe ? 'none' : '0 1px 2px rgba(0,0,0,0.1)'
                    }}>
                      {msg.text}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* メッセージ入力エリア */}
            <div style={{ padding: '10px', backgroundColor: '#fff', borderTop: '1px solid #eee', display: 'flex', gap: '10px' }}>
              <input
                style={{ flex: 1, padding: '10px', borderRadius: '20px', border: '1px solid #ddd', outline: 'none' }}
                placeholder="メッセージを入力"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => { if (!e.nativeEvent.isComposing && e.key === 'Enter') sendMessage(); }}
              />
              <button onClick={sendMessage} style={{ backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer' }}>▲</button>
            </div>
          </div>
        )}
        {subTab === 'album' && <SharedFolder session={session} friendEmail={friendEmail} />}
        {subTab === 'files' && <SharedDocuments session={session} friendEmail={friendEmail} />}
      </div>
    </div>
  );
};
export default Chat;