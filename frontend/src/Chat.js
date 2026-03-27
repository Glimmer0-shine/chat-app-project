import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const Chat = ({ session, friendEmail }) => {
  const [message, setMessage] = useState('');
  const [chatLog, setChatLog] = useState([]);

  // 二人のメールアドレスから一意のルームIDを作成
  const getRoomId = () => {
    if (!session?.user?.email || !friendEmail) return 'public';
    const sorted = [session.user.email, friendEmail].sort();
    return `${sorted[0]}-${sorted[1]}`;
  };

  const roomId = getRoomId();

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
        対話中: {friendEmail}
      </div>
      <div style={{ height: '350px', overflowY: 'scroll', backgroundColor: '#f9f9f9', padding: '10px' }}>
        {chatLog.map((msg, i) => (
          <div key={msg.id || i} style={{ textAlign: msg.user === session.user.email ? 'right' : 'left', marginBottom: '10px' }}>
            <div style={{ fontSize: '0.7rem', color: '#888' }}>{msg.user}</div>
            <div style={{ display: 'inline-block', padding: '8px 12px', borderRadius: '10px', backgroundColor: msg.user === session.user.email ? '#007bff' : '#eee', color: msg.user === session.user.email ? 'white' : 'black' }}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', marginTop: '10px' }}>
        <input
          style={{ flex: 1, padding: '10px' }}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            // 【課題解決】IME（日本語入力）の変換確定中なら送信しない
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