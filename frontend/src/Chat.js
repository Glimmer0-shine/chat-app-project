import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const Chat = ({ session }) => {
  const [message, setMessage] = useState('');
  const [chatLog, setChatLog] = useState([]);

  useEffect(() => {
    if (!session?.access_token) return;

    supabase.realtime.setAuth(session.access_token);

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true });

      if (!error) setChatLog(data || []);
    };

    fetchMessages();

    const channel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          setChatLog((prev) => {
            const exists = prev.find((msg) => msg.id === payload.new.id);
            if (exists) return prev;
            return [...prev, payload.new];
          });
        }
      )
      .subscribe((status) => {
        console.log('★Realtime:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session]);

  const sendMessage = async () => {
    if (!message.trim() || !session?.user) return;

    const { error } = await supabase.from('messages').insert([
      {
        text: message,
        user: session.user.email,
      },
    ]);

    if (!error) setMessage('');
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div
        style={{
          height: '400px',
          border: '1px solid #ddd',
          overflowY: 'scroll',
          padding: '20px',
          backgroundColor: '#f9f9f9',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {chatLog.map((msg, index) => {
          const isMe = msg.user === session?.user?.email;

          return (
            <div
              key={msg.id || index}
              style={{
                alignSelf: isMe ? 'flex-end' : 'flex-start',
                marginBottom: '10px',
                maxWidth: '70%',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: '#666' }}>
                {msg.user}
              </div>
              <div
                style={{
                  backgroundColor: isMe ? '#007bff' : '#e9ecef',
                  color: isMe ? 'white' : 'black',
                  padding: '10px 15px',
                  borderRadius: '15px',
                }}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '10px', display: 'flex', gap: '5px' }}>
        <input
          style={{ flex: 1, padding: '10px' }}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
        />
        <button onClick={sendMessage}>送信</button>
      </div>
    </div>
  );
};

export default Chat;