import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const Rooms = ({ session, onSelectRoom }) => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const fetchAllRooms = useCallback(async () => {
    if (!session?.user?.email) return;
    setLoading(true);

    // --- 1. 正式なグループを取得 (JOINを使って1回で取得) ---
    const { data: memberData, error: memberError } = await supabase
      .from('room_members')
      .select('room_id, status, rooms(id, name)')
      .eq('user_id', session.user.id);

    if (memberError) {
      console.error("データ取得エラー:", memberError);
      setLoading(false);
      return;
    }

    const formalGroups = memberData?.map(m => ({
      roomId: m.rooms?.id,
      name: m.rooms?.name || '不明なグループ',
      status: m.status,
      isGroup: true,
      lastMessage: m.status === 'pending' ? '招待が届いています' : 'グループに参加しました',
      time: ''
    })).filter(g => g.roomId) || [];

    // --- 2. 1対1チャットを取得 ---
    const { data: msgData } = await supabase
      .from('messages')
      .select('room_id, created_at, user, text')
      .or(`user.eq.${session.user.email},room_id.ilike.%${session.user.email}%`)
      .order('created_at', { ascending: false });

    const latest1on1 = [];
    const seenRooms = new Set();
    const myEmail = session.user.email.toLowerCase();

    msgData?.forEach(msg => {
      if (!msg || !msg.room_id) return; 

      const isFormalGroup = formalGroups.some(g => g.roomId === msg.room_id);
      const is1on1Layout = msg.room_id.includes('@') && msg.room_id.includes('-');

      if (is1on1Layout && !isFormalGroup && !seenRooms.has(msg.room_id)) {
        seenRooms.add(msg.room_id);
        const opponentEmail = msg.room_id.toLowerCase().replace(myEmail, "").replace("-", "");
        
        if (opponentEmail && opponentEmail !== myEmail) {
          latest1on1.push({
            roomId: msg.room_id,
            opponentEmail: opponentEmail,
            lastMessage: msg.text,
            time: new Date(msg.created_at).toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit' }),
            isGroup: false
          });
        }
      }
    });

    const opponentEmails = latest1on1.map(r => r.opponentEmail);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('email, display_name')
      .in('email', opponentEmails);

    const final1on1 = latest1on1.map(room => {
      const profile = profiles?.find(p => p.email.toLowerCase() === room.opponentEmail.toLowerCase());
      return { ...room, name: profile?.display_name || room.opponentEmail };
    });

    setRooms([...formalGroups, ...final1on1]);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    if (session?.user?.id) {
      fetchAllRooms();
      const channel = supabase
        .channel(`room_changes_${session.user.id}`)
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'room_members', filter: `user_id=eq.${session.user.id}` }, 
            () => fetchAllRooms()
        )
        .subscribe();
      return () => supabase.removeChannel(channel);
    }
  }, [session?.user?.id, fetchAllRooms]);

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .insert([{ name: newGroupName, created_by: session.user.id }])
      .select().single();
    if (roomError) return alert("作成失敗");
    await supabase.from('room_members').insert([{ 
      room_id: roomData.id, 
      user_id: session.user.id,
      status: 'joined' 
    }]);
    setNewGroupName('');
    setIsModalOpen(false);
    fetchAllRooms();
  };

  if (loading) return <p style={{ textAlign: 'center', padding: '20px' }}>読み込み中...</p>;

  return (
    <div style={{ padding: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #007bff', paddingBottom: '10px', marginBottom: '15px' }}>
        <h3 style={{ margin: 0 }}>💬 トーク一覧</h3>
        <button onClick={() => setIsModalOpen(true)} style={createBtnStyle}>＋新グループ</button>
      </div>

      {isModalOpen && (
        <div style={modalOverlayStyle}>
          <div style={modalStyle}>
            <h4>新しいグループを作成</h4>
            <input 
              value={newGroupName} 
              onChange={(e) => setNewGroupName(e.target.value)} 
              placeholder="グループ名を入力"
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
              <button onClick={createGroup} style={confirmBtnStyle}>作成</button>
              <button onClick={() => setIsModalOpen(false)} style={cancelBtnStyle}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {rooms.map((room) => {
        const isPending = room.isGroup && room.status === 'pending';
        return (
          <div 
            key={room.roomId} 
            onClick={() => {
              room.isGroup ? onSelectRoom(null, room.roomId) : onSelectRoom(room.opponentEmail);
            }}
            style={{ ...roomItemStyle, backgroundColor: '#fff' }}
          >        
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 'bold' }}>
                {room.isGroup ? `[グループ] ${room.name}` : room.name}
              </span>
              <span style={{ fontSize: '0.7rem', color: '#999' }}>{room.time}</span>
            </div>
            <div style={{ ...lastMsgStyle, color: isPending ? '#007bff' : '#666' }}>
              {room.lastMessage}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const createBtnStyle = { padding: '5px 12px', fontSize: '0.8rem', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '20px', cursor: 'pointer' };
const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
const modalStyle = { backgroundColor: '#fff', padding: '20px', borderRadius: '10px', width: '80%', maxWidth: '400px' };
const inputStyle = { width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #ddd' };
const confirmBtnStyle = { flex: 1, padding: '10px', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '5px' };
const cancelBtnStyle = { flex: 1, padding: '10px', backgroundColor: '#6c757d', color: '#fff', border: 'none', borderRadius: '5px' };
const roomItemStyle = { padding: '15px', borderBottom: '1px solid #eee', cursor: 'pointer' };
const lastMsgStyle = { fontSize: '0.85rem', color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

export default Rooms;