import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const Rooms = ({ session, onSelectRoom }) => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, roomId: null });
  const [isHiddenListOpen, setIsHiddenListOpen] = useState(false);
  const [hiddenRooms, setHiddenRooms] = useState([]);
  let pressTimer;

  // --- 1. ルーム一覧の取得 (1対1・グループ統合版) ---
  const fetchAllRooms = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);


    try {
      // 自分が参加しており、かつ非表示ではないルームを名簿から取得
      const { data: memberData, error: memberError } = await supabase
        .from('room_members')
        .select(`
          room_id,
          status,
          is_hidden,
          rooms ( id, name )
        `)
        .eq('user_id', session.user.id)
        .eq('is_hidden', false);

      if (memberError) throw memberError;
      


      // 各ルームの「相手の名前」と「最新メッセージ」を補完
      // --- Rooms.js の fetchAllRooms 内を修正 ---

      const formattedRooms = await Promise.all(memberData.map(async (m) => {
        const roomId = m.room_id;
        const isGroup = m.rooms?.name !== '1on1';
        let displayName = m.rooms?.name || '不明なグループ';
        let opponentEmail = null;

        if (!isGroup) {
          // ★前回作成した RPC 関数 (get_room_members) を呼び出す
          const { data: members, error: rpcError } = await supabase
            .rpc('get_room_members', { p_room_id: roomId });

          if (rpcError) {
            console.error("RPCエラー:", rpcError);
          }

          // 自分以外のメンバーを抽出
          const opponent = members?.find(u => u.user_id !== session.user.id);

          if (opponent && opponent.profiles) {
            displayName = opponent.profiles.display_name || opponent.profiles.email;
            opponentEmail = opponent.profiles.email;
          } else {
            displayName = "相手不在";
          }
        }

        // 最新メッセージ取得（ここは今のままでOK）
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('text, created_at')
          .eq('room_id', roomId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        return {
          roomId: roomId,
          name: displayName,
          opponentEmail: opponentEmail,
          isGroup: isGroup,
          status: m.status,
          lastMessage: lastMsg?.text || (m.status === 'pending' ? '招待が届いています' : 'メッセージはありません'),
          time: lastMsg ? new Date(lastMsg.created_at).toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : ''
        };
      }));

      // メッセージの新しい順にソート（時間が無いものは後ろへ）
      setRooms(formattedRooms.sort((a, b) => (b.time || '').localeCompare(a.time || '')));
    } catch (err) {
      console.error("データ取得エラー:", err);
    } finally {
      setLoading(false);
    }
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

  // --- グループ作成 ---
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

  // --- メニュー制御 ---
  const handleContextMenu = (e, roomId) => {
    e.preventDefault();
    const clickY = e.pageY || e.touches?.[0].pageY;
    setContextMenu({ visible: true, x: 0, y: clickY, roomId: roomId });
  };

  const handleTouchStart = (e, roomId) => {
    pressTimer = setTimeout(() => handleContextMenu(e, roomId), 700);
  };
  const handleTouchEnd = () => clearTimeout(pressTimer);
  const closeContextMenu = () => setContextMenu({ ...contextMenu, visible: false });

  // --- 非表示・再表示ロジック ---
  const hideRoom = async (e, roomId) => {
    e.stopPropagation();
    if (!window.confirm("このトークを非表示にしますか？")) return;

    const { error } = await supabase
      .from('room_members')
      .update({ is_hidden: true })
      .eq('room_id', roomId)
      .eq('user_id', session.user.id);

    if (error) alert("非表示に失敗しました");
    else fetchAllRooms();
    closeContextMenu();
  };

  const fetchHiddenRooms = async () => {
    const { data, error } = await supabase
      .from('room_members')
      .select(`
        room_id,
        rooms ( name )
      `)
      .eq('user_id', session.user.id)
      .eq('is_hidden', true);

    if (!error) setHiddenRooms(data || []);
    setIsHiddenListOpen(true);
  };

  const unhideRoom = async (roomId) => {
    const { error } = await supabase
      .from('room_members')
      .update({ is_hidden: false })
      .eq('room_id', roomId)
      .eq('user_id', session.user.id);

    if (!error) {
      setHiddenRooms(prev => prev.filter(r => r.room_id !== roomId));
      fetchAllRooms();
    }
  };

  if (loading) return <p style={{ textAlign: 'center', padding: '20px' }}>読み込み中...</p>;

  return (
    <div style={{ padding: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #007bff', paddingBottom: '10px', marginBottom: '15px' }}>
        <h3 style={{ margin: 0 }}>💬 トーク一覧</h3>
        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}> 
          <button onClick={() => setIsModalOpen(true)} style={createBtnStyle}>＋作成</button>
          <button onClick={fetchHiddenRooms} style={secondaryBtnStyle}>非表示</button>
        </div>
      </div>

      {/* --- ルーム一覧 --- */}
      {rooms.map((room) => {
        const isPending = room.isGroup && room.status === 'pending';
        return (
          <div 
            key={room.roomId} 
            onClick={() => {
              if (contextMenu.visible) return closeContextMenu();
              room.isGroup ? onSelectRoom(null, room.roomId) : onSelectRoom(room.opponentEmail, room.roomId);
            }}
            onContextMenu={(e) => handleContextMenu(e, room.roomId)}
            onTouchStart={(e) => handleTouchStart(e, room.roomId)}
            onTouchEnd={handleTouchEnd}
            style={{ ...roomItemStyle, backgroundColor: '#fff', position: 'relative', userSelect: 'none' }}
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

      {/* --- 各種モーダル・メニュー --- */}
      {isModalOpen && (
        <div style={modalOverlayStyle}>
          <div style={modalStyle}>
            <h4>新しいグループを作成</h4>
            <input id="new-group" name="make-new-group" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="グループ名を入力" style={inputStyle} />
            <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
              <button onClick={createGroup} style={confirmBtnStyle}>作成</button>
              <button onClick={() => setIsModalOpen(false)} style={cancelBtnStyle}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {isHiddenListOpen && (
        <div style={modalOverlayStyle}>
          <div style={{ ...modalStyle, maxHeight: '80%', overflowY: 'auto' }}>
            <h4 style={{ borderBottom: '1px solid #eee', pb: '10px' }}>非表示中のトーク</h4>
            {hiddenRooms.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: '#888', padding: '20px' }}>ありません</p>
            ) : (
              hiddenRooms.map((hr) => (
                <div key={hr.room_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: '1px solid #f9f9f9' }}>
                  <span style={{ fontSize: '0.9rem' }}>{hr.rooms?.name === '1on1' ? '1対1トーク' : hr.rooms?.name}</span>
                  <button onClick={() => unhideRoom(hr.room_id)} style={unhideBtnStyle}>再表示</button>
                </div>
              ))
            )}
            <button onClick={() => setIsHiddenListOpen(false)} style={{ ...cancelBtnStyle, width: '100%', marginTop: '15px' }}>閉じる</button>
          </div>
        </div>
      )}

      {contextMenu.visible && (
        <>
          <div onMouseDown={closeContextMenu} onTouchStart={closeContextMenu} style={overlayInvisibleStyle} />
          <div style={{ ...contextMenuStyle, top: contextMenu.y, right: '20px', position: 'fixed' }}>
            <div onClick={(e) => hideRoom(e, contextMenu.roomId)} style={contextMenuItemStyle}>トークを非表示</div>
          </div>
        </>
      )}
    </div>
  );
};

// --- スタイル定義 ---
const createBtnStyle = { padding: '5px 12px', fontSize: '0.8rem', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '20px', cursor: 'pointer' };
const secondaryBtnStyle = { padding: '5px 12px', fontSize: '0.8rem', backgroundColor: '#f0f0f0', color: '#666', border: '1px solid #ccc', borderRadius: '20px', cursor: 'pointer' };
const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
const modalStyle = { backgroundColor: '#fff', padding: '20px', borderRadius: '10px', width: '80%', maxWidth: '400px' };
const inputStyle = { width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '5px', border: '1px solid #ddd' };
const confirmBtnStyle = { flex: 1, padding: '10px', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' };
const cancelBtnStyle = { flex: 1, padding: '10px', backgroundColor: '#6c757d', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' };
const unhideBtnStyle = { backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', padding: '5px 10px', fontSize: '0.75rem', cursor: 'pointer' };
const roomItemStyle = { padding: '15px', borderBottom: '1px solid #eee', cursor: 'pointer' };
const lastMsgStyle = { fontSize: '0.85rem', color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const overlayInvisibleStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1000 };
const contextMenuStyle = { backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1001, minWidth: '150px', overflow: 'hidden' };
const contextMenuItemStyle = { padding: '12px 20px', fontSize: '0.9rem', cursor: 'pointer', color: '#dc3545', backgroundColor: '#fff' };

export default Rooms;