import { useState, useEffect } from 'react';
import io from 'socket.io-client';

const socket = io('http://localhost:5001', { transports: ['websocket'] });

const Chat = ({ session }) => {
  const [message, setMessage] = useState('');
  const [chatLog, setChatLog] = useState([]);

  useEffect(() => {
    // 1. 過去の履歴を取得
    fetch('http://localhost:5001/messages')
      .then(res => res.json())
      .then(data => setChatLog(data));

    // 2. リアルタイムメッセージの受信
    socket.on('message', (msg) => {
      setChatLog((prevLog) => [...prevLog, msg]);
    });

    return () => socket.off('message');
  }, []);

  const sendMessage = () => {
    if (message.trim() === '') return;

    // ログイン中のユーザー情報を付けて送信
    const msgData = {
      text: message,
      user: session.user.email, // Guestではなくメールアドレスを使う
    };

    socket.emit('message', msgData);
    setMessage('');
  };

return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ 
        height: '400px', 
        border: '1px solid #ddd', 
        overflowY: 'scroll', 
        padding: '20px', 
        backgroundColor: '#f9f9f9',
        display: 'flex',
        flexDirection: 'column' // 縦に並べる
      }}>
        {chatLog.map((msg, index) => {
          // 自分のメッセージかどうかを判定
          const isMe = msg.user === session.user.email;

          return (
            <div key={index} style={{ 
              alignSelf: isMe ? 'flex-end' : 'flex-start', // 右か左に寄せる
              marginBottom: '10px',
              maxWidth: '70%'
            }}>
              <div style={{ 
                fontSize: '0.8rem', 
                color: '#666', 
                textAlign: isMe ? 'right' : 'left' 
              }}>
                {msg.user}
              </div>
              <div style={{ 
                backgroundColor: isMe ? '#007bff' : '#e9ecef', // 自分の色は青、相手はグレー
                color: isMe ? 'white' : 'black',
                padding: '10px 15px',
                borderRadius: isMe ? '15px 15px 0 15px' : '15px 15px 15px 0', // 吹き出しっぽく
                wordBreak: 'break-word'
              }}>
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
          placeholder="メッセージを入力"
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()} // Enterキーでも送信可能に
        />
        <button onClick={sendMessage} style={{ padding: '10px 20px' }}>送信</button>
      </div>
    </div>
  );
};

export default Chat;