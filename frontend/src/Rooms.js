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

  // --- 1. ルーム一覧の取得 (非表示・削除ガード付き) ---
  const fetchAllRooms = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);

    try {
      // 💡 修正：is_hidden が false かつ is_deleted が false（またはnull）のものだけ取得
      const { data: roomData, error: roomError } = await supabase
        .from('room_members')
        .select(`
          room_id,
          status,
          is_hidden,
          is_deleted,
          rooms ( id, name, is_group ) 
        `)
        .eq('user_id', session.user.id)
        .eq('is_hidden', false)
        .eq('is_deleted', false);

      if (roomError) throw roomError;

      const formattedRooms = await Promise.all(roomData.map(async (m) => {
        const roomId = m.room_id;
        const isGroup = m.rooms?.is_group ?? true; 
        let displayName = m.rooms?.name || '不明なルーム';
        let opponentEmail = null;

        if (!isGroup) {
          const { data: members, error: rpcError } = await supabase
            .rpc('get_room_members', { p_room_id: roomId });

          if (!rpcError && members) {
            const opponent = members.find(u => u.user_id !== session.user.id);
            if (opponent && opponent.profiles) {
              displayName = opponent.profiles.display_name || opponent.profiles.email;
              opponentEmail = opponent.profiles.email;
            } else {
              displayName = "相手不在";
            }
          }
        }

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

      setRooms(formattedRooms.sort((a, b) => (b.time || '').localeCompare(a.time || '')));
    } catch (err) {
      console.error("データ取得エラー:", err);
    } finally {
      setLoading(false);
    }
  }, [session]);

  // useEffect(() => {
  //   if (session?.user?.id) {
  //     fetchAllRooms();
  //     const channel = supabase
  //       .channel(`room_changes_${session.user.id}`)
  //       .on('postgres_changes', 
  //           { event: '*', schema: 'public', table: 'room_members', filter: `user_id=eq.${session.user.id}` }, 
  //           () => fetchAllRooms()
  //       )
  //       .subscribe();
  //     return () => supabase.removeChannel(channel);
  //   }
  // }, [session?.user?.id, fetchAllRooms]);

  // ↓RLSの設定が上手くいったら、上記を消して下記を採用する。動作確認を行う。
  useEffect(() => {
    // 💡 session.access_token があるかもチェック条件に加える
    if (session?.user?.id && session?.access_token) {
      
      // 💡 通信を開始する前に、明示的に入館証（トークン）をセットする！
      supabase.realtime.setAuth(session.access_token);

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
  }, [session, fetchAllRooms]); // 💡 依存配列に session 全体を指定

  // --- グループ作成 ---
  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .insert([{ name: newGroupName, created_by: session.user.id, is_group: true }])
      .select().single();
    
    if (roomError) return alert("作成失敗");
    
    await supabase.from('room_members').insert([{ 
      room_id: roomData.id, 
      user_id: session.user.id,
      status: 'joined',
      is_hidden: false,
      is_deleted: false
    }]);
    
    setNewGroupName('');
    setIsModalOpen(false);
    fetchAllRooms();
  };

  // // --- メニュー制御 ---
  // const handleContextMenu = (e, roomId) => {
  //   e.preventDefault();
  //   const clickY = e.pageY || e.touches?.[0].pageY;
  //   setContextMenu({ visible: true, x: 0, y: clickY, roomId: roomId });
  // };
  // --- メニュー制御 ---
  const handleContextMenu = (e, roomId) => {
    // 💡 追記：ブラウザ側がキャンセル不可（cancelable=false）と言っている時は preventDefault を呼ばない
    if (e.cancelable) {
      e.preventDefault();
    }
    const clickY = e.pageY || e.touches?.[0].pageY;
    setContextMenu({ visible: true, x: 0, y: clickY, roomId: roomId });
  };

  const handleTouchStart = (e, roomId) => {
    pressTimer = setTimeout(() => handleContextMenu(e, roomId), 700);
  };
  // 🚀 新設：指が動いた（スクロールした）ら、長押しタイマーをキャンセルする
  const handleTouchMove = () => {
    clearTimeout(pressTimer);
  };
  const handleTouchEnd = () => clearTimeout(pressTimer);
  const closeContextMenu = () => setContextMenu({ ...contextMenu, visible: false });

  // --- 非表示・再表示・削除ロジック ---
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

  // const fetchHiddenRooms = async () => {
  //   // 💡 修正：非表示(is_hidden=true)だが、まだ削除されていない(is_deleted=false)ものを取得
  //   const { data, error } = await supabase
  //     .from('room_members')
  //     .select(`
  //       room_id,
  //       rooms ( name )
  //     `)
  //     .eq('user_id', session.user.id)
  //     .eq('is_hidden', true)
  //     .eq('is_deleted', false);

  //   if (!error) setHiddenRooms(data || []);
  //   setIsHiddenListOpen(true);
  // };

  const fetchHiddenRooms = async () => {
    // 💡 修正：is_hidden=true かつ is_deleted=false のものを取得
    // 後続の動的名前取得のために、rooms から is_group も一緒にセレクトします
    const { data, error } = await supabase
      .from('room_members')
      .select(`
        room_id,
        rooms ( name, is_group )
      `)
      .eq('user_id', session.user.id)
      .eq('is_hidden', true)
      .eq('is_deleted', false);

    if (error) {
      console.error("非表示トーク取得エラー:", error);
      return;
    }

    try {
      // ✨ 取得した非表示ルーム一覧をループして、個人チャットの場合は相手の名前を動的に取得する
      const formattedHiddenRooms = await Promise.all((data || []).map(async (hr) => {
        const roomId = hr.room_id;
        const isGroup = hr.rooms?.is_group ?? true;
        let displayName = hr.rooms?.name || '不明なルーム';

        // 💡 グループでない（個人チャット）なら、通常一覧と同じロジックで相手の最新名を取得
        if (!isGroup) {
          const { data: members, error: rpcError } = await supabase
            .rpc('get_room_members', { p_room_id: roomId });

          if (!rpcError && members) {
            const opponent = members.find(u => u.user_id !== session.user.id);
            if (opponent && opponent.profiles) {
              // ニックネームがあればそれ、無ければメールアドレスを表示
              displayName = opponent.profiles.display_name || opponent.profiles.email;
            } else {
              displayName = "相手不在";
            }
          }
        }

        // モーダル表示用にデータを整形して返す
        return {
          room_id: roomId,
          displayName: displayName // ✨ 動的に作った名前を格納
        };
      }));

      setHiddenRooms(formattedHiddenRooms);
      setIsHiddenListOpen(true);
    } catch (err) {
      console.error("非表示リストの整形エラー:", err);
    }
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

  // 🚀 新設：非表示リストからトークルームを論理削除する
  const deleteRoomFromHidden = async (roomId) => {
    if (!window.confirm("このトークを削除しますか？\n（リストおよび一覧から完全に消去されます）")) return;

    const { error } = await supabase
      .from('room_members')
      .update({ is_deleted: true }) // 削除フラグをONにする
      .eq('room_id', roomId)
      .eq('user_id', session.user.id);

    if (!error) {
      alert("削除しました。");
      setHiddenRooms(prev => prev.filter(r => r.room_id !== roomId));
      fetchAllRooms();
    } else {
      alert("削除に失敗しました");
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
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={styles.roomItem}
          >        
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontWeight: 'bold', color: theme.colors.textMain }}>
                {room.isGroup ? `${room.name}` : room.name}
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
                  {/* <span style={{ fontSize: '0.9rem' }}>{hr.rooms?.name === '1on1' ? '1対1トーク' : hr.rooms?.name}</span> */}
                  <span style={{ fontSize: '0.9rem' }}>{hr.displayName}</span>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={() => unhideRoom(hr.room_id)} style={styles.unhideBtn}>再表示</button>
                    {/* 💡 削除ボタンを追加 */}
                    <button onClick={() => deleteRoomFromHidden(hr.room_id)} style={styles.deleteBtn}>削除</button>
                  </div>
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
  hiddenRoomItem: { display: 'flex', justifycontent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${theme.colors.border}` },
  unhideBtn: { backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', padding: '5px 10px', fontSize: '0.75rem', cursor: 'pointer' },
  deleteBtn: { backgroundColor: '#fff5f5', color: theme.colors.error, border: `1px solid #ffa8a8`, borderRadius: '4px', padding: '5px 10px', fontSize: '0.75rem', cursor: 'pointer' },
  invisibleOverlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1000 },
  contextMenu: { position: 'fixed', backgroundColor: '#fff', border: `1px solid ${theme.colors.border}`, borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1001, minWidth: '150px', overflow: 'hidden' },
  contextMenuItem: { padding: '12px 20px', fontSize: '0.9rem', cursor: 'pointer', color: theme.colors.error }
};

export default Rooms;