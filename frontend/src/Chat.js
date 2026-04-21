import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const Chat = ({ session, friendEmail }) => {
  const [message, setMessage] = useState('');
  const [chatLog, setChatLog] = useState([]);
  const [friendDisplayName, setFriendDisplayName] = useState('');

  // 二人のメールアドレスから一意のルームIDを作成
  const getRoomId = () => {
    if (!session?.user?.email || !friendEmail) return 'public';
    const sorted = [session.user.email, friendEmail].sort();
    return `${sorted[0]}-${sorted[1]}`;
  };

  const roomId = getRoomId();

  // ★追加: 相手の名前を取得するuseEffect
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
        .eq('room_id', roomId) // ★現在のルームIDでフィルタ
        .order('created_at', { ascending: true });

      if (!error) setChatLog(data || []);
    };

    fetchMessages();

    const channel = supabase
      .channel(roomId) // チャンネル名もルームIDにする
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, // ★自分たちの変更だけ検知
        (payload) => {
          setChatLog((prev) => {
            // すでに同じIDのメッセージがあれば追加しない（beforeの知恵）
            const exists = prev.find((msg) => msg.id === payload.new.id);
            if (exists) return prev;
            return [...prev, payload.new];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, roomId, friendEmail]);

  const sendMessage = async () => {
    if (!message.trim() || !session?.user) return;

    const { error } = await supabase.from('messages').insert([
      {
        text: message,
        user: session.user.email,
        room_id: roomId // 必須の追加
      },
    ]);

    // エラーがなければ空にする（前回の丁寧なやり方）
    if (!error) {
      setMessage('');
    } else {
      alert('送信に失敗しました');
    }
  };

  if (!friendEmail) return <div style={{ padding: '20px', textAlign: 'center' }}>連絡帳から友達を選んでトークを開始してください</div>;

  return (
    <div>
      <div style={{ padding: '10px', borderBottom: '1px solid #ddd', marginBottom: '10px', fontWeight: 'bold' }}>
        対話中: {friendDisplayName || friendEmail}
      </div>
      <div style={{ height: '350px', overflowY: 'scroll', backgroundColor: '#f9f9f9', padding: '10px' }}>
        {chatLog.map((msg, i) => {
          // --- ここから追加 ---
          // 1. まずシステムメッセージ（通知）かどうかを判定
          if (msg.is_system) {
            return (
              <div key={msg.id || i} style={{ textAlign: 'center', margin: '15px 0' }}>
                <span style={{ 
                  backgroundColor: '#e0e0e0', 
                  color: '#666', 
                  padding: '4px 15px', 
                  borderRadius: '20px', 
                  fontSize: '0.75rem',
                  display: 'inline-block'
                }}>
                  {msg.text}
                </span>
              </div>
            );
          }
          
          // 修正部分: 送信者が自分なら「自分の名前」、相手なら「相手の名前」を出す
          const isMe = msg.user === session.user.email;
          const senderName = isMe ? '自分' : (friendDisplayName || msg.user);

          // システムメッセージでない場合は、通常のメッセージ（自分 or 相手）を表示
          return (
            // <div key={msg.id || i} style={{ textAlign: msg.user === session.user.email ? 'right' : 'left', marginBottom: '10px' }}>
            <div key={msg.id || i} style={{ textAlign: isMe ? 'right' : 'left', marginBottom: '10px' }}>
              {/* 名前を表示 */}
              <div style={{ fontSize: '0.7rem', color: '#888' }}>{senderName}</div>
              <div style={{ 
                display: 'inline-block', 
                padding: '8px 12px', 
                borderRadius: '10px', 
                backgroundColor: msg.user === session.user.email ? '#007bff' : '#eee', 
                color: msg.user === session.user.email ? 'white' : 'black' 
              }}>
                {msg.text}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', marginTop: '10px' }}>
        <input
          style={{ flex: 1, padding: '10px' }}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter') {
              sendMessage();
            }
          }}
        />
        <button onClick={sendMessage}>送信</button>
      </div>
    </div>
  );
};
export default Chat;