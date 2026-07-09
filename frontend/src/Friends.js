import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { theme, commonStyles } from './theme';
import Notifications from './Notifications';

const Friends = ({ session, onStartChat, onOpenSettings }) => {
  const [friendEmail, setFriendEmail] = useState('');
  const [friendsList, setFriendsList] = useState([]);
  const [loading, setLoading] = useState(false);

  // 💡 【新設】通知画面の開閉フラグ、および未読通知バッジ用の状態
  const [showNotifications, setShowNotifications] = useState(false);
  const [hasNewNotifications, setHasNewNotifications] = useState(false);

  // 長押しモーダル用State
  const [selectedFriendForMenu, setSelectedFriendForMenu] = useState(null);
  const longPressTimer = useRef(null);

  // --- 💡 【新設】検索回数制限のチェック用ヘルパー関数 ---
  const checkAndIncrementSearchCount = () => {
    const today = new Date().toLocaleDateString(); // 例: "2026/6/29"
    const storedDate = localStorage.getItem('search_date');
    let count = parseInt(localStorage.getItem('search_count') || '0', 10);

    // 日付が変わっていたらカウントをリセット
    if (storedDate !== today) {
      localStorage.setItem('search_date', today);
      count = 0;
    }

    if (count >= 10) {
      alert("本日のメールアドレス検索試行回数が上限（10回）に達しました。");
      return false;
    }

    // カウントを1増やして保存
    localStorage.setItem('search_count', String(count + 1));
    return true;
  };

  // // 💡 【新設】自分宛ての保留中の申請があるかチェック（バッジ用）
  // const checkUnreadNotifications = useCallback(async () => {
  //   if (!session?.user?.id) return;
  //   const { count, error } = await supabase
  //     .from('friend_requests')
  //     .select('*', { count: 'exact', head: true })
  //     .eq('receiver_id', session.user.id)
  //     .eq('status', 'pending');

  //   if (!error) {
  //     setHasNewNotifications(count > 0);
  //   }
  // }, [session]);

  // 💡 【修正】友達申請とルーム招待の両方をチェックする
  const checkUnreadNotifications = useCallback(async () => {
    if (!session?.user?.id) return;
    
    // 友達申請の未読チェック
    const { count: friendReqCount } = await supabase
      .from('friend_requests')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', session.user.id)
      .eq('status', 'pending');

    // ルーム招待の未読チェック
    const { count: roomInviteCount } = await supabase
      .from('room_members')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .eq('status', 'pending');

    // どちらか1つでもあればバッジを表示
    setHasNewNotifications((friendReqCount > 0) || (roomInviteCount > 0));
  }, [session]);

  // --- 1. メインの友達リストを取得 ---
  const fetchFriends = useCallback(async () => {
    if (!session?.user?.id) return;
    
    const { data, error } = await supabase
      .from('friends')
      .select(`
        id,
        friend_email,
        created_at,
        is_blocked,
        is_hidden,
        profiles!friend_email (
          display_name,
          avatar_url
        )
      `)
      .eq('user_id', session.user.id)
      .eq('is_blocked', false)
      .eq('is_hidden', false)
      .order('created_at', { ascending: false });

    if (!error && data) {
      const enrichedFriends = await Promise.all(data.map(async (friend) => {
        let signedUrl = '';
        const path = friend.profiles?.avatar_url;

        if (path) {
          const { data: signedData, error: signError } = await supabase.storage
            .from('avatars')
            .createSignedUrl(path, 300);
          
          if (!signError && signedData) {
            signedUrl = signedData.signedUrl;
          }
        }

        return {
          ...friend,
          avatar_signed_url: signedUrl
        };
      }));

      setFriendsList(enrichedFriends);
    } else if (error) {
      console.error("友達リスト取得エラー:", error.message);
    }
  }, [session]);

  useEffect(() => {
    fetchFriends();
    checkUnreadNotifications();
  }, [fetchFriends, checkUnreadNotifications]);

  // // --- 2. 友達追加（検索）処理 ---
  // const addFriend = async () => {
  //   if (!friendEmail.trim()) return;
  //   if (friendEmail === session.user.email) {
  //     alert("自分自身は追加できません");
  //     return;
  //   }

  //   // 💡 【新設】検索前に本日の試行回数（10回）をチェック
  //   if (!checkAndIncrementSearchCount()) {
  //     return;
  //   }

  //   setLoading(true);

  //   // 💡 【修正】相手のプロフィールを取得する際、allow_email_search が true である条件を追加
  //   const { data: profile, error: checkError } = await supabase
  //     .from('profiles')
  //     .select('id, email, allow_email_search')
  //     .eq('email', friendEmail)
  //     .eq('allow_email_search', true) // 🔍 検索許可が true の人のみヒットさせる
  //     .maybeSingle();

  //   if (checkError) {
  //     console.error("プロフィール検索エラー:", checkError.message);
  //   }
    
  //   if (!profile) {
  //     // 💡 検索OFFにしている場合も「見つかりませんでした」に統一することで、アカウントの存在自体を隠匿・保護します
  //     alert("そのメールアドレスのユーザーは見つかりませんでした、または検索が許可されていません。");
  //     setLoading(false);
  //     return;
  //   }

  //   const isAlreadyFriend = friendsList.some(f => f.friend_email === friendEmail);
  //   if (isAlreadyFriend) {
  //     alert("そのユーザーは既に追加されています");
  //     setLoading(false);
  //     return;
  //   }

  //   const { error } = await supabase
  //     .from('friends')
  //     .upsert([
  //       { 
  //         user_id: session.user.id, 
  //         friend_email: friendEmail,
  //         friend_user_id: profile.id,
  //         is_blocked: false,
  //         is_hidden: false
  //       }
  //     ], { onConflict: 'user_id,friend_email' });

  //   if (error) {
  //     alert('追加に失敗しました');
  //   } else {
  //     setFriendEmail('');
  //     alert(friendEmail + ' を追加しました！');
  //     fetchFriends();
  //   }
  //   setLoading(false);
  // };

  const addFriendRequest = async () => {
    if (!friendEmail.trim()) return;
    if (friendEmail === session.user.email) {
      alert("自分自身は追加できません");
      return;
    }

    if (!checkAndIncrementSearchCount()) {
      return;
    }

    setLoading(true);

    // 相手のプロフィールを取得（検索許可されている人のみ）
    const { data: profile, error: checkError } = await supabase
      .from('profiles')
      .select('id, email, allow_email_search')
      .eq('email', friendEmail)
      .eq('allow_email_search', true)
      .maybeSingle();

    if (checkError) {
      console.error("プロフィール検索エラー:", checkError.message);
    }
    
    if (!profile) {
      alert("そのメールアドレスのユーザーは見つかりませんでした、または検索が許可されていません。");
      setLoading(false);
      return;
    }

    // 既に友達リストにいるかチェック
    const isAlreadyFriend = friendsList.some(f => f.friend_email === friendEmail);
    if (isAlreadyFriend) {
      alert("そのユーザーは既に追加されています");
      setLoading(false);
      return;
    }

    // 💡 既に申請中、あるいは過去に拒否されたレコードがあるか確認
    const { data: existingReq } = await supabase
      .from('friend_requests')
      .select('status')
      .eq('sender_id', session.user.id)
      .eq('receiver_id', profile.id)
      .maybeSingle();

    if (existingReq) {
      if (existingReq.status === 'pending') {
        alert("既に友達申請を送信済みです（相手の承認待ちです）。");
      } else {
        alert("既に申請手続きが行われています。");
      }
      setLoading(false);
      return;
    }

    // 💡 friend_requests テーブルへ申請データをupsert/insert
    const { error } = await supabase
      .from('friend_requests')
      .upsert([
        { 
          sender_id: session.user.id, 
          receiver_id: profile.id,
          status: 'pending'
        }
      ], { onConflict: 'sender_id,receiver_id' });

    if (error) {
      alert('友達申請の送信に失敗しました');
    } else {
      setFriendEmail('');
      alert(friendEmail + ' へ友達申請を送信しました！相手が承認すると連絡帳に表示されます。');
    }
    setLoading(false);
  };

  // --- 3. 長押しイベントのハンドラー ---
  const handleTouchStart = (friend) => {
    longPressTimer.current = setTimeout(() => {
      setSelectedFriendForMenu(friend);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  // --- 4. 【メニュー機能】非表示処理 ---
  const handleHideFriend = async (friend) => {
    setSelectedFriendForMenu(null);
    if (!window.confirm(`${friend.profiles?.display_name || friend.friend_email}さんを非表示にしますか？`)) return;

    const { error } = await supabase
      .from('friends')
      .update({ is_hidden: true })
      .eq('id', friend.id)
      .eq('user_id', session.user.id);

    if (!error) {
      alert("非表示にしました。");
      fetchFriends();
    } else {
      alert("処理に失敗しました");
    }
  };

  // --- 5. 【メニュー機能】ブロック処理 ---
  const handleBlockFriend = async (friend) => {
    setSelectedFriendForMenu(null);
    if (!window.confirm(`${friend.profiles?.display_name || friend.friend_email}さんをブロックしますか？\nトークのメッセージが受信されなくなります。`)) return;

    const { error } = await supabase
      .from('friends')
      .update({ is_blocked: true })
      .eq('id', friend.id)
      .eq('user_id', session.user.id);

    if (!error) {
      alert("ブロックしました。");
      fetchFriends();
    } else {
      alert("処理に失敗しました");
    }
  };

  // --- 6. 【メニュー機能】友達削除 ---
  const deleteFriend = async (recordId) => {
    setSelectedFriendForMenu(null);
    if (!session?.user?.id) {
      alert("セッションが切れています。再ログインしてください。");
      return;
    }
    if (!window.confirm('この友達を削除しますか？\n（連絡帳および管理リストから完全に消去されます）')) return;
    
    try {
      const { error, count } = await supabase
        .from('friends')
        .delete({ count: 'exact' })
        .eq('id', recordId)
        .eq('user_id', session.user.id);
      
      if (error) {
        alert("削除に失敗しました: " + error.message);
        return;
      }
      if (count === 0) {
        alert("削除対象のデータが見つからなかったか、権限がありません。");
        return;
      }

      alert("削除しました。");
      await new Promise(resolve => setTimeout(resolve, 100));
      fetchFriends();
    } catch (e) {
      console.error("友達削除中に例外が発生しました:", e);
    }
  };

  // --- 7. トーク開始時のルーム作成ロジック ---
  const handleTalkClick = async (friendEmail) => {
    if (loading) return;
    setLoading(true);
    try {
      const { data: friendProfile, error: profError } = await supabase
        .from('profiles')
        .select('id, display_name, email')
        .eq('email', friendEmail)
        .single();

      if (profError || !friendProfile) {
        throw new Error("相手のプロフィールが見つかりません");
      }

      const opponentName = friendProfile.display_name || friendProfile.email;
      const ids = [session.user.id, friendProfile.id].sort();
      const pairKey = `${ids[0]}_${ids[1]}`;

      const { data: existingRoom } = await supabase
        .from('rooms')
        .select('id')
        .eq('pair_key', pairKey)
        .maybeSingle();

      let finalRoomId = existingRoom?.id;

      if (!finalRoomId) {
        const { data: newRoom, error: roomError } = await supabase
          .from('rooms')
          .insert([{ 
            name: opponentName, 
            pair_key: pairKey,
            is_group: false 
          }])
          .select()
          .single();

        if (roomError) throw roomError;
        finalRoomId = newRoom.id;

        await supabase.from('room_members').insert([
          { room_id: finalRoomId, user_id: session.user.id, status: 'joined' },
          { room_id: finalRoomId, user_id: friendProfile.id, status: 'joined' }
        ]);
      }

      onStartChat(friendEmail, finalRoomId);
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '10px', height: '100%', position: 'relative' }}>
      {/* 💡 【新設】通知画面がONなら、上からオーバーレイ展開 */}
      {showNotifications && (
        <Notifications 
          session={session} 
          onClose={() => {
            setShowNotifications(false);
            checkUnreadNotifications(); // 閉じたときにもう一度バッジを更新
          }} 
          onRefreshFriends={fetchFriends}
          onOpenRoom={(roomId) => {
            onStartChat(null, roomId); // 相手のメールアドレスはnull、ルームIDのみ渡す
          }}
        />
      )}

      <div style={styles.headerContainer}>
        <h3 style={{ margin: 0, paddingBottom: '10px' }}>👥 連絡帳</h3>
        {/* <button 
          onClick={onOpenSettings} 
          style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', paddingBottom: '10px' }}
          title="設定"
        >
          ⚙️
        </button> */}
        {/* ボタン配置エリア */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {/* 💡 ベルマーク通知ボタン（id, name, htmlFor最適化） */}
          <button
            id="notification-bell-btn"
            name="notification-bell"
            onClick={() => setShowNotifications(true)}
            style={styles.bellBtn}
            title="通知センターを開く"
          >
            🔔
            {hasNewNotifications && <span style={styles.badge} />}
          </button>

          <button 
            id="settings-trigger-btn"
            name="settings-trigger"
            onClick={onOpenSettings} 
            style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', paddingBottom: '10px' }}
            title="設定"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* 友達追加入力フォーム */}
      <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
        <input 
          id="friend-search"
          name="friend-search"
          autoComplete="off"
          type="email" 
          placeholder="友達のメールアドレスを入力" 
          value={friendEmail} 
          onChange={e => setFriendEmail(e.target.value)}
          style={{ ...commonStyles.input, flex: 1 }}
        />
        {/* <button 
          onClick={addFriend} 
          disabled={loading} 
          style={{ ...commonStyles.button, width: 'auto', padding: '10px 15px', backgroundColor: '#C0CDDC', color: '#333' }}
        >
          {loading ? '...' : '追加'}
        </button> */}
        <button 
          onClick={addFriendRequest} 
          disabled={loading} 
          style={{ ...commonStyles.button, width: 'auto', padding: '10px 15px', backgroundColor: '#C0CDDC', color: '#333' }}
        >
          {loading ? '...' : '申請'}
        </button>
      </div>

      {/* <p style={{ fontSize: '0.75rem', color: theme.colors.textSub, margin: '0 0 10px 5px' }}>
        💡 友達を追加するには、メールアドレスを検索して申請を送ります。
      </p> */}
      <p style={{ fontSize: '0.75rem', color: theme.colors.textSub, margin: '0 0 10px 5px' }}>
        💡 友達の名前を長押しすると、メニューを開きます。
      </p>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {friendsList.length === 0 && (
          <p style={{ color: theme.colors.textSub, textAlign: 'center', marginTop: '20px' }}>友達がまだいません</p>
        )}
        {friendsList.map(f => (
          <li 
            key={f.id} 
            style={styles.friendItem}
            onTouchStart={() => handleTouchStart(f)}
            onTouchEnd={handleTouchEnd}
            onMouseDown={() => handleTouchStart(f)}
            onMouseUp={handleTouchEnd}
            onMouseLeave={handleTouchEnd}
          >
            <img 
              src={f.avatar_signed_url || '/images/default-avatar.png'} 
              alt="Avatar" 
              style={styles.avatarImage} 
            />
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, cursor: 'pointer' }}>
              <span style={{ fontWeight: 'bold', fontSize: '1rem', color: theme.colors.textMain }}>
                {f.profiles?.display_name || '名前未設定'}
              </span>
              <span style={{ fontSize: '0.75rem', color: theme.colors.textSub }}>
                {f.friend_email}
              </span>
            </div>
            <span style={{ fontSize: '1.2rem', color: '#ccc', paddingRight: '10px' }}>⋮</span>
          </li>
        ))}
      </ul>

      {/* 長押しコンテキストメニューモーダル */}
      {selectedFriendForMenu && (
        <div style={styles.modalOverlay} onClick={() => setSelectedFriendForMenu(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h4 style={styles.modalTitle}>
              {selectedFriendForMenu.profiles?.display_name || selectedFriendForMenu.friend_email}
            </h4>
            <div style={styles.menuButtonList}>
              <button 
                onClick={() => {
                  const email = selectedFriendForMenu.friend_email;
                  setSelectedFriendForMenu(null);
                  handleTalkClick(email);
                }} 
                style={{ ...styles.menuBtn, color: '#06C755', fontWeight: 'bold' }}
              >
                トークを開く
              </button>
              <button onClick={() => handleHideFriend(selectedFriendForMenu)} style={styles.menuBtn}>
                非表示
              </button>
              <button onClick={() => handleBlockFriend(selectedFriendForMenu)} style={{ ...styles.menuBtn, color: theme.colors.error }}>
                ブロック
              </button>
              <button onClick={() => deleteFriend(selectedFriendForMenu.id)} style={{ ...styles.menuBtn, color: '#777' }}>
                友達削除
              </button>
              <button onClick={() => setSelectedFriendForMenu(null)} style={{ ...styles.menuBtn, backgroundColor: '#f1f3f5' }}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  headerContainer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${theme.colors.primary}`, marginBottom: '15px' },
  bellBtn: { background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', paddingBottom: '10px', position: 'relative', display: 'flex', alignItems: 'center' },
  badge: { position: 'absolute', top: '2px', right: '-2px', width: '8px', height: '8px', backgroundColor: '#FF3B30', borderRadius: '50%', border: '1px solid #fff' },
  friendItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', borderBottom: `1px solid ${theme.colors.border}`, userSelect: 'none', WebkitUserSelect: 'none', borderRadius: '4px' },
  avatarImage: { width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', marginRight: '12px', border: `1px solid ${theme.colors.border}`, flexShrink: 0 },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 },
  modalContent: { backgroundColor: '#fff', borderRadius: '12px', width: '80%', maxWidth: '280px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' },
  modalTitle: { margin: 0, padding: '15px', fontSize: '0.95rem', textAlign: 'center', borderBottom: '1px solid #eee', color: '#333' },
  menuButtonList: { display: 'flex', flexDirection: 'column' },
  menuBtn: { padding: '14px', border: 'none', background: 'none', fontSize: '0.9rem', cursor: 'pointer', textAlign: 'center', borderBottom: '1px solid #f1f3f5', outline: 'none' }
};

export default Friends;