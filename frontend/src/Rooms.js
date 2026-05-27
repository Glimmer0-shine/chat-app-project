import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { theme, commonStyles } from './theme';

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
          // ★RPC 関数 (get_room_members) を呼び出す
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

  if (loading) return <p style={{ textAlign: 'center', padding: '20px', color: theme.colors.textSub }}>読み込み中...</p>;

  return (
    <div style={{ padding: '10px' }}>
      <div style={styles.headerContainer}>
        <h3 style={{ margin: 0 }}>💬 トーク一覧</h3>
        <div style={{ display: 'flex', gap: '8px' }}> 
          <button onClick={() => setIsModalOpen(true)} style={styles.createBtn}>＋作成</button>
          <button onClick={fetchHiddenRooms} style={styles.secondaryBtn}>非表示</button>
        </div>
      </div>

      {rooms.map((room) => {
        const isPending = room.isGroup && room.status === 'pending';
        return (
          <div 
            key={room.roomId} 
            onClick={() => contextMenu.visible ? closeContextMenu() : room.isGroup ? onSelectRoom(null, room.roomId) : onSelectRoom(room.opponentEmail, room.roomId)}
            onContextMenu={(e) => handleContextMenu(e, room.roomId)}
            onTouchStart={(e) => handleTouchStart(e, room.roomId)}
            onTouchEnd={handleTouchEnd}
            style={styles.roomItem}
          >        
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontWeight: 'bold', color: theme.colors.textMain }}>
                {room.isGroup ? `[グループ] ${room.name}` : room.name}
              </span>
              <span style={{ fontSize: '0.7rem', color: theme.colors.textSub }}>{room.time}</span>
            </div>
            <div style={{ 
              ...styles.lastMsg, 
              color: isPending ? theme.colors.primary : theme.colors.textSub 
            }}>
              {room.lastMessage}
            </div>
          </div>
        );
      })}

      {/* モーダル：グループ作成 */}
      {isModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h4 style={{ marginTop: 0 }}>新しいグループを作成</h4>
            <input 
              id="new-group" 
              name="make-new-group" 
              value={newGroupName} 
              onChange={(e) => setNewGroupName(e.target.value)} 
              placeholder="グループ名を入力" 
              style={{ ...commonStyles.input, marginBottom: '15px' }} 
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={createGroup} style={{ ...commonStyles.button, backgroundColor: '#28a745' }}>作成</button>
              <button onClick={() => setIsModalOpen(false)} style={{ ...commonStyles.button, backgroundColor: '#6c757d' }}>キャンセル</button>
            </div>
          </div>
        </div>
      )}

      {/* モーダル：非表示リスト */}
      {isHiddenListOpen && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxHeight: '80%', overflowY: 'auto' }}>
            <h4 style={{ borderBottom: `1px solid ${theme.colors.border}`, paddingBottom: '10px', marginTop: 0 }}>非表示中のトーク</h4>
            {hiddenRooms.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: theme.colors.textSub, padding: '20px', textAlign: 'center' }}>ありません</p>
            ) : (
              hiddenRooms.map((hr) => (
                <div key={hr.room_id} style={styles.hiddenRoomItem}>
                  <span style={{ fontSize: '0.9rem' }}>{hr.rooms?.name === '1on1' ? '1対1トーク' : hr.rooms?.name}</span>
                  <button onClick={() => unhideRoom(hr.room_id)} style={styles.unhideBtn}>再表示</button>
                </div>
              ))
            )}
            <button onClick={() => setIsHiddenListOpen(false)} style={{ ...commonStyles.button, marginTop: '15px', backgroundColor: '#6c757d' }}>閉じる</button>
          </div>
        </div>
      )}

      {/* コンテキストメニュー */}
      {contextMenu.visible && (
        <>
          <div onMouseDown={closeContextMenu} onTouchStart={closeContextMenu} style={styles.invisibleOverlay} />
          <div style={{ ...styles.contextMenu, top: contextMenu.y, right: '20px' }}>
            <div onClick={(e) => hideRoom(e, contextMenu.roomId)} style={styles.contextMenuItem}>トークを非表示</div>
          </div>
        </>
      )}
    </div>
  );
};

// --- スタイル定義 ---
const styles = {
  headerContainer: {
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    borderBottom: `2px solid ${theme.colors.primary}`, 
    paddingBottom: '10px', 
    marginBottom: '15px'
  },
  createBtn: { padding: '5px 15px', fontSize: '0.8rem', backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '20px', cursor: 'pointer' },
  secondaryBtn: { padding: '5px 15px', fontSize: '0.8rem', backgroundColor: '#f0f0f0', color: '#666', border: `1px solid ${theme.colors.border}`, borderRadius: '20px', cursor: 'pointer' },
  roomItem: { padding: '15px', borderBottom: `1px solid ${theme.colors.border}`, cursor: 'pointer', backgroundColor: '#fff', position: 'relative', userSelect: 'none' },
  lastMsg: { fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#fff', padding: '20px', borderRadius: '10px', width: '85%', maxWidth: '400px' },
  hiddenRoomItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${theme.colors.border}` },
  unhideBtn: { backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', padding: '5px 10px', fontSize: '0.75rem', cursor: 'pointer' },
  invisibleOverlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1000 },
  contextMenu: { position: 'fixed', backgroundColor: '#fff', border: `1px solid ${theme.colors.border}`, borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1001, minWidth: '150px', overflow: 'hidden' },
  contextMenuItem: { padding: '12px 20px', fontSize: '0.9rem', cursor: 'pointer', color: theme.colors.error }
};

export default Rooms;