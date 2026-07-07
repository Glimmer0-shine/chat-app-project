import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { theme } from './theme';

// 💡 修正：引数に onOpenRoom を追加（親コンポーネントから画面遷移の処理を受け取る）
const Notifications = ({ session, onClose, onRefreshFriends, onOpenRoom }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!session?.user?.id) return;
    
    // 1. 友達申請の取得
    const fetchFriends = async () => {
      const { data, error } = await supabase
        .from('friend_requests')
        .select(`
          id,
          sender_id,
          created_at,
          profiles!sender_id ( display_name, email, avatar_url )
        `)
        .eq('receiver_id', session.user.id)
        .eq('status', 'pending');

      if (error) return [];

      return await Promise.all((data || []).map(async (req) => {
        let signedUrl = '';
        const path = req.profiles?.avatar_url;
        if (path) {
          const { data: signedData } = await supabase.storage.from('avatars').createSignedUrl(path, 300);
          if (signedData) signedUrl = signedData.signedUrl;
        }
        return {
          type: 'friend',
          id: `friend_${req.id}`, 
          originalId: req.id,
          senderId: req.sender_id,
          email: req.profiles?.email,
          title: req.profiles?.display_name || '名前未設定',
          message: '友達申請が届いています',
          avatarUrl: signedUrl,
          createdAt: new Date(req.created_at).getTime()
        };
      }));
    };

    // 2. ルーム招待の取得
    const fetchRooms = async () => {
      const { data, error } = await supabase
        .from('room_members')
        .select(`
          room_id,
          invited_at,
          rooms!inner ( name, is_group )
        `)
        .eq('user_id', session.user.id)
        .eq('status', 'pending');

      if (error){
        console.error("🚨 ルーム招待取得エラー:", error.message);
        return [];
      }

      return (data || []).map(inv => ({
        type: 'room',
        id: `room_${inv.room_id}`,
        originalId: inv.room_id,
        senderId: null,
        email: null,
        title: inv.rooms?.name || 'グループチャット',
        message: 'グループに招待されています',
        avatarUrl: null, 
        createdAt: new Date(inv.invited_at).getTime()
      }));
    };

    const [friendReqs, roomInvites] = await Promise.all([fetchFriends(), fetchRooms()]);
    const combined = [...friendReqs, ...roomInvites].sort((a, b) => b.createdAt - a.createdAt);
    
    setNotifications(combined);
  }, [session]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // --- 友達申請の処理（変更なし） ---
  const handleFriendResponse = async (requestId, senderId, senderEmail, action) => {
    if (loading) return;
    setLoading(true);

    try {
      if (action === 'accept') {
        const { error: friendError } = await supabase
          .from('friends')
          .upsert([
            { user_id: session.user.id, friend_email: senderEmail, friend_user_id: senderId, is_blocked: false, is_hidden: false }
          ], { onConflict: 'user_id,friend_email' });

        if (friendError) throw friendError;

        await supabase.from('friend_requests').update({ status: 'accepted' }).eq('id', requestId);
        alert("友達申請を承認しました！");
      } else {
        await supabase.from('friend_requests').delete().eq('id', requestId);
        alert("友達申請を見送りました。");
      }

      fetchNotifications();
      if (onRefreshFriends) onRefreshFriends();
    } catch (err) {
      console.error(err);
      alert("処理に失敗しました: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ※ handleRoomResponse は削除しました（Chat.js側で処理するため）

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button onClick={onClose} style={styles.backBtn}>← 戻る</button>
        <h3 style={{ margin: 0 }}>🔔 あなたへのお知らせ</h3>
        <div style={{ width: '45px' }} />
      </div>

      <div style={{ padding: '10px' }}>
        {notifications.length === 0 ? (
          <p style={styles.emptyText}>新しい通知はありません</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {notifications.map((notif) => (
              <li key={notif.id} style={styles.requestItem}>
                
                {notif.type === 'room' ? (
                  <div style={styles.groupAvatar}>G</div>
                ) : (
                  <img 
                    src={notif.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face'} 
                    alt="Avatar" 
                    style={styles.avatarImage} 
                  />
                )}

                <div style={styles.infoArea}>
                  <span style={styles.userName}>{notif.title}</span>
                  {notif.email && <span style={styles.userEmail}>{notif.email}</span>}
                  <span style={styles.msgText}>{notif.message}</span>
                </div>
                
                <div style={styles.btnArea}>
                  {/* 💡 修正：通知タイプによって表示するボタンを出し分け */}
                  {notif.type === 'friend' ? (
                    <>
                      <button 
                        onClick={() => handleFriendResponse(notif.originalId, notif.senderId, notif.email, 'accept')}
                        disabled={loading}
                        style={{ ...styles.actionBtn, backgroundColor: '#06C755', color: '#fff' }}
                      >
                        承認
                      </button>
                      <button 
                        onClick={() => handleFriendResponse(notif.originalId, notif.senderId, notif.email, 'reject')}
                        disabled={loading}
                        style={{ ...styles.actionBtn, backgroundColor: '#e2e8f0', color: '#333' }}
                      >
                        拒否
                      </button>
                    </>
                  ) : (
                    <button 
                      onClick={() => {
                        onClose(); // 通知センターを閉じる
                        if (onOpenRoom) onOpenRoom(notif.originalId); // 親コンポーネントに遷移を指示
                      }}
                      style={{ ...styles.actionBtn, backgroundColor: theme.colors.primary, color: '#fff', padding: '6px 16px' }}
                    >
                      トークを見る
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#fff', zIndex: 1000, overflowY: 'auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', borderBottom: `2px solid ${theme.colors.primary}` },
  backBtn: { background: 'none', border: 'none', fontSize: '1rem', cursor: 'pointer', color: theme.colors.primary, fontWeight: 'bold' },
  emptyText: { color: theme.colors.textSub, textAlign: 'center', marginTop: '40px', fontSize: '0.9rem' },
  requestItem: { display: 'flex', alignItems: 'center', padding: '15px 0', borderBottom: `1px solid ${theme.colors.border}` },
  avatarImage: { width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', marginRight: '10px', flexShrink: 0 },
  groupAvatar: { width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#C0CDDC', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem', marginRight: '10px', flexShrink: 0 },
  infoArea: { display: 'flex', flexDirection: 'column', flex: 1, marginRight: '10px' },
  userName: { fontWeight: 'bold', fontSize: '0.95rem', color: theme.colors.textMain },
  userEmail: { fontSize: '0.75rem', color: theme.colors.textSub },
  msgText: { fontSize: '0.8rem', color: '#555', marginTop: '2px' },
  btnArea: { display: 'flex', gap: '5px' },
  actionBtn: { border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer' }
};

export default Notifications;