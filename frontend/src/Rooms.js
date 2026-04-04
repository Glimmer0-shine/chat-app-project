import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const Rooms = ({ session, onSelectRoom }) => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRooms = async () => {
      setLoading(true);
      
      // 1. 自分が関わっているメッセージをすべて取得（本当はもっと効率的なSQLがありますが、まずはJSで処理）
      const { data, error } = await supabase
        .from('messages')
        .select('room_id, created_at, user, text')
        .or(`user.eq.${session.user.email},room_id.ilike.%${session.user.email}%`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("ルーム取得エラー:", error);
      } else {
        // 2. room_id ごとに最新のメッセージだけを抽出して整理
        const latestRooms = [];
        const seenRooms = new Set();

        data?.forEach(msg => {
          if (msg.room_id && msg.room_id !== 'public' && !seenRooms.has(msg.room_id)) {
            seenRooms.add(msg.room_id);
            
            // room_id (emailA-emailB) から相手のメアドを特定
            const emails = msg.room_id.split('-');
            const opponent = emails.find(e => e !== session.user.email);
            
            latestRooms.push({
              roomId: msg.room_id,
              opponent: opponent,
              lastMessage: msg.text,
              time: new Date(msg.created_at).toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit' })
            });
          }
        });
        setRooms(latestRooms);
      }
      setLoading(false);
    };

    fetchRooms();
  }, [session]);

  if (loading) return <p style={{ textAlign: 'center' }}>トーク履歴を読み込み中...</p>;

  return (
    <div style={{ padding: '10px' }}>
      <h3 style={{ borderBottom: '2px solid #007bff', paddingBottom: '10px' }}>💬 トーク一覧</h3>
      {rooms.length === 0 ? (
        <p style={{ color: '#888', textAlign: 'center', marginTop: '20px' }}>
          まだトーク履歴がありません。<br/>「連絡帳」から友達を選んでメッセージを送ってみましょう！
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {rooms.map((room) => (
            <li 
              key={room.roomId} 
              onClick={() => onSelectRoom(room.opponent)}
              style={{ 
                padding: '15px', borderBottom: '1px solid #eee', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: '5px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 'bold' }}>{room.opponent}</span>
                <span style={{ fontSize: '0.8rem', color: '#999' }}>{room.time}</span>
              </div>
              <div style={{ fontSize: '0.9rem', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {room.lastMessage}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Rooms;