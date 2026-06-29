import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { theme, commonStyles } from './theme';

const Friends = ({ session, onStartChat, onOpenSettings }) => {
  const [friendEmail, setFriendEmail] = useState('');
  const [friendsList, setFriendsList] = useState([]);
  const [loading, setLoading] = useState(false);

  // 長押しモーダル用State（★こちらは残します）
  const [selectedFriendForMenu, setSelectedFriendForMenu] = useState(null);
  const longPressTimer = useRef(null);

  // --- 1. メインの友達リスト（非表示もブロックもされていない人）を取得 ---
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

    // if (!error) {
    //   setFriendsList(data || []);
    // } else {
    //   console.error("友達リスト取得エラー:", error.message);
    // }
    if (!error && data) {
      // 💡 署名付きURLを一括生成する処理を追加
      const enrichedFriends = await Promise.all(data.map(async (friend) => {
        let signedUrl = '';
        const path = friend.profiles?.avatar_url;

        if (path) {
          const { data: signedData, error: signError } = await supabase.storage
            .from('avatars')
            .createSignedUrl(path, 300); // 5分間有効
          
          if (!signError && signedData) {
            signedUrl = signedData.signedUrl;
          }
        }

        // 既存のデータに avatar_signed_url を合体させて返す
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
  }, [fetchFriends]);

  // --- 2. 友達追加処理 ---
  const addFriend = async () => {
    if (!friendEmail.trim()) return;
    if (friendEmail === session.user.email) {
      alert("自分自身は追加できません");
      return;
    }
    setLoading(true);

    const { data: profile, error: checkError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', friendEmail)
      .maybeSingle();

    if (checkError) {
      console.error("プロフィール検索エラー:", checkError.message);
    }
    
    if (!profile) {
      alert("そのメールアドレスのユーザーは見つかりませんでした。");
      setLoading(false);
      return;
    }

    const isAlreadyFriend = friendsList.some(f => f.friend_email === friendEmail);
    if (isAlreadyFriend) {
      alert("そのユーザーは既に追加されています");
      setLoading(false);
      return;
    }

    // もし過去に非表示やブロックにしていた場合はupsertで解除して再登録
    // 同じユーザーが同じメールアドレスを重複して友達登録できないように
    const { error } = await supabase
      .from('friends')
      .upsert([
        { 
          user_id: session.user.id, 
          friend_email: friendEmail,
          friend_user_id: profile.id,
          is_blocked: false,
          is_hidden: false
        }
      ], { onConflict: 'user_id,friend_email' });

    if (error) {
      alert('追加に失敗しました');
    } else {
      setFriendEmail('');
      alert(friendEmail + ' を追加しました！');
      fetchFriends();
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

  // --- 6. 【メニュー機能】友達削除（主キー特定に伴う最適化版） ---
  const deleteFriend = async (recordId) => {
    setSelectedFriendForMenu(null);
    
    if (!session?.user?.id) {
      alert("セッションが切れています。再ログインしてください。");
      return;
    }

    if (!window.confirm('この友達を削除しますか？\n（連絡帳および管理リストから完全に消去されます）')) return;
    
    try {
      // 確定したfriendsテーブルの主キー（id）を狙い撃ち、かつ安全のため user_id も縛る
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
      
      // UIの微小なハング防止のための短いディレイ
      await new Promise(resolve => setTimeout(resolve, 100));
      fetchFriends();

    } catch (e) {
      console.error("友達削除中に例外が発生しました:", e);
    }
  };

  // --- 7. トーク開始時のルーム作成ロジック ---
  const handleTalkClick = async (friendEmail) => {
    if (loading) return; // 🚀 連打によるルーム二重作成を防止
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
      <div style={styles.headerContainer}>
        <h3 style={{ margin: 0, paddingBottom: '10px' }}>👥 連絡帳</h3>
        
        <button 
          onClick={onOpenSettings} 
          style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', paddingBottom: '10px' }}
          title="設定"
        >
          ⚙️
        </button>
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
        <button 
          onClick={addFriend} 
          disabled={loading} 
          style={{ ...commonStyles.button, width: 'auto', padding: '10px 15px', backgroundColor: '#C0CDDC', color: '#333' }}
        >
          {loading ? '...' : '追加'}
        </button>
      </div>

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
              src={f.avatar_signed_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face'} 
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

      {/* 長押しコンテキストメニューモーダル（★こちらも残しています） */}
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
  headerContainer: {
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    borderBottom: `2px solid ${theme.colors.primary}`, 
    marginBottom: '15px'
  },
  friendItem: {
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: '15px 0', 
    borderBottom: `1px solid ${theme.colors.border}`,
    userSelect: 'none',
    WebkitUserSelect: 'none',
    borderRadius: '4px'
  },
  avatarImage: {
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    objectFit: 'cover',
    marginRight: '12px',
    border: `1px solid ${theme.colors.border}`,
    flexShrink: 0 // 横幅が潰れないようにガード
  },
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
  },
  modalContent: {
    backgroundColor: '#fff', borderRadius: '12px', width: '80%', maxWidth: '280px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column'
  },
  modalTitle: {
    margin: 0, padding: '15px', fontSize: '0.95rem', textAlign: 'center', borderBottom: '1px solid #eee', color: '#333'
  },
  menuButtonList: {
    display: 'flex', flexDirection: 'column'
  },
  menuBtn: {
    padding: '14px', border: 'none', background: 'none', fontSize: '0.9rem', cursor: 'pointer', textAlign: 'center',
    borderBottom: '1px solid #f1f3f5', outline: 'none'
  }
};

export default Friends;