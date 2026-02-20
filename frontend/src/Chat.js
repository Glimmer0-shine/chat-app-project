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
    <div>
      <div style={{ height: '300px', border: '1px solid #ccc', overflowY: 'scroll', marginBottom: '10px', padding: '10px' }}>
        {chatLog.map((msg, index) => (
          <div key={index}>
            <strong>{msg.user}:</strong> {msg.text}
          </div>
        ))}
      </div>
      <input 
        value={message} 
        onChange={(e) => setMessage(e.target.value)} 
        placeholder="メッセージを入力"
      />
      <button onClick={sendMessage}>送信</button>
    </div>
  );
};

export default Chat;