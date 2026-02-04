import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

// サーバーのURL（Python側）
const socket = io('http://127.0.0.1:5001');

function App() {
  const [message, setMessage] = useState('');
  const [chatLog, setChatLog] = useState([]);

  useEffect(() => {
    // サーバーからメッセージが届いた時の処理
    socket.on('message', (msg) => {
      setChatLog((prevLog) => [...prevLog, msg]);
    });

    return () => socket.off('message');
  }, []);

  const sendMessage = () => {
    if (message !== "") {
      socket.emit('message', message);
      setMessage(""); // 送信後に空にする
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>リアルタイムチャット</h1>
      <div style={{ border: '1px solid #ccc', height: '200px', overflowY: 'scroll', marginBottom: '10px' }}>
        {chatLog.map((msg, index) => (
          <p key={index}>{msg}</p>
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
}

export default App;