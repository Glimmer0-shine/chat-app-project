import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const Rooms = ({ session, onSelectRoom }) => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRooms = async () => {
      if (!session?.user?.email) return;
      setLoading(true);
      
      const { data, error } = await supabase
        .from('messages')
        .select('room_id, created_at, user, text')
        .or(`user.eq.${session.user.email},room_id.ilike.%${session.user.email}%`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("ルーム取得エラー:", error);
      } else {
        const latestRoomsData = [];
        const seenRooms = new Set();
        const myEmail = session.user.email.toLowerCase();

        data?.forEach(msg => {
          if (msg.room_id && msg.room_id !== 'public' && !seenRooms.has(msg.room_id)) {
            seenRooms.add(msg.room_id);
            
            // 相手特定アルゴリズム
            // ルームID（例: "a@ex.com-b@ex.com"）から、自分のメアド部分を消して
            // 残ったハイフンを掃除することで、相手を特定する。
            
            let opponentEmail = "";
            const roomIdLower = msg.room_id.toLowerCase();
            
            if (roomIdLower.includes(myEmail)) {
              // 自分のメアド部分を空文字に置換し、残ったハイフンを削る
              opponentEmail = roomIdLower.replace(myEmail, "").replace("-", "");
            }

            // 【デバッグログ】
            // console.log("解析結果:", { 
            //   roomId: msg.room_id, 
            //   me: myEmail, 
            //   opponent: opponentEmail 
            // });

            if (opponentEmail && opponentEmail !== myEmail) {
              latestRoomsData.push({
                roomId: msg.room_id,
                opponentEmail: opponentEmail,
                lastMessage: msg.text,
                time: new Date(msg.created_at).toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit' })
              });
            } else {
              console.warn("有効な相手が見つかりませんでした:", msg.room_id);
            }
          }
        });

        // ニックネーム取得
        const opponentEmails = latestRoomsData.map(r => r.opponentEmail);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('email, display_name')
          .in('email', opponentEmails);

        // 合体
        const finalRooms = latestRoomsData.map(room => {
          const profile = profiles?.find(p => p.email.toLowerCase() === room.opponentEmail.toLowerCase());
          return {
            ...room,
            opponentName: profile?.display_name || room.opponentEmail
          };
        });

        setRooms(finalRooms);
      }
      setLoading(false);
    };

    fetchRooms();
  }, [session]);

  if (loading) return <p style={{ textAlign: 'center' }}>トーク履歴を読み込み中...</p>;


  return (
    <div style={{ padding: '10px' }}>
      <h3 style={{ borderBottom: '2px solid #007bff', paddingBottom: '10px', marginBottom: '15px' }}>💬 トーク一覧</h3>
      {rooms.length === 0 ? (
        <p style={{ color: '#888', textAlign: 'center', marginTop: '20px' }}>トーク履歴はありません。</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {rooms.map((room) => (
            <li 
              key={room.roomId} 
              onClick={() => onSelectRoom(room.opponentEmail)}
              style={{ 
                padding: '15px', borderBottom: '1px solid #eee', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: '5px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold' }}>{room.opponentName}</span>
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