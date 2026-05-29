import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { theme, commonStyles } from './theme';

const Friends = ({ session, onStartChat, onOpenSettings }) => {
  const [friendEmail, setFriendEmail] = useState('');
  const [friendsList, setFriendsList] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchFriends = useCallback(async () => {
    if (!session?.user?.id) return;
    
    // ★修正: profilesテーブルからdisplay_nameを一緒に取得する
    const { data, error } = await supabase
      .from('friends')
      .select(`
        id,
        friend_email,
        created_at,
        profiles!friend_email (
          display_name
        )
      `)
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (!error) {
      setFriendsList(data || []);
    } else {
      console.error("友達リスト取得エラー:", error.message);
    }
  }, [session]);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

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

    const { error } = await supabase
      .from('friends')
      .insert([{ 
        user_id: session.user.id, 
        friend_email: friendEmail,
        friend_user_id: profile.id 
      }]);

    if (error) {
      alert('追加に失敗しました');
    } else {
      setFriendEmail('');
      alert(friendEmail + ' を追加しました！');
      fetchFriends();
    }
    setLoading(false);
  };

  const deleteFriend = async (id) => {
    if (!window.confirm('この友達を削除しますか？')) return;
    const { error } = await supabase.from('friends').delete().eq('id', id);
    if (!error) fetchFriends();
  };

  // --- トーク開始時のルーム作成ロジック ---
  // const handleTalkClick = async (friendEmail) => {
  //   setLoading(true);
  //   try {
  //     // 1. 相手のプロフィールIDを取得
  //     const { data: friendProfile } = await supabase
  //       .from('profiles')
  //       .select('id')
  //       .eq('email', friendEmail)
  //       .single();

  //     if (!friendProfile) {
  //       alert("相手のプロフィールが見つかりません");
  //       return;
  //     }

  //     // 2. すでにこの相手との1対1ルームが存在するかチェック
  //     const { data: existingMembers } = await supabase
  //       .from('room_members')
  //       .select('room_id')
  //       .eq('user_id', session.user.id);

  //     let existingRoomId = null;
  //     if (existingMembers && existingMembers.length > 0) {
  //       const myRoomIds = existingMembers.map(m => m.room_id);
  //       const { data: commonRoom } = await supabase
  //         .from('room_members')
  //         .select('room_id')
  //         .in('room_id', myRoomIds)
  //         .eq('user_id', friendProfile.id)
  //         .maybeSingle();
        
  //       if (commonRoom) existingRoomId = commonRoom.room_id;
  //     }

  //     let finalRoomId = existingRoomId;

  //     // 3. ルームがなければ新規作成
  //     if (!existingRoomId) {
  //       const { data: newRoom, error: roomError } = await supabase
  //         .from('rooms')
  //         .insert([{ name: '1on1' }])
  //         .select()
  //         .single();

  //       if (roomError) throw roomError;
  //       finalRoomId = newRoom.id;

  //       // 自分と相手を登録
  //       await supabase.from('room_members').insert([
  //         { room_id: finalRoomId, user_id: session.user.id, status: 'joined' },
  //         { room_id: finalRoomId, user_id: friendProfile.id, status: 'joined' }
  //       ]);
  //     }

  //     // 4. 親(App.js)の handleStartChat を呼び出す
  //     onStartChat(friendEmail, finalRoomId);

  //   } catch (err) {
  //     console.error(err);
  //     alert("トークの開始に失敗しました");
  //   } finally {
  //     setLoading(false);
  //   }
  // };
  // --- 修正：トーク開始時のルーム作成ロジック ---
  const handleTalkClick = async (friendEmail) => {
    setLoading(true);
    try {
      // 1. 相手の情報を1回だけ取得（ループ防止のためsingleで完結させる）
      const { data: friendProfile, error: profError } = await supabase
        .from('profiles')
        .select('id, display_name, email')
        .eq('email', friendEmail)
        .single();

      if (profError || !friendProfile) {
        throw new Error("相手のプロフィールが見つかりません");
      }

      // 表示名を確定（名前があれば名前、なければメール）
      const opponentName = friendProfile.display_name || friendProfile.email;

      // 2. ペアキー生成
      const ids = [session.user.id, friendProfile.id].sort();
      const pairKey = `${ids[0]}_${ids[1]}`;

      // 3. 既存検索
      const { data: existingRoom } = await supabase
        .from('rooms')
        .select('id')
        .eq('pair_key', pairKey)
        .maybeSingle();

      let finalRoomId = existingRoom?.id;

      // 4. 新規作成
      if (!finalRoomId) {
        // nameには相手の名前を入れておくが、is_group: false を重要視する
        const { data: newRoom, error: roomError } = await supabase
          .from('rooms')
          .insert([{ 
            name: opponentName, // 固定値ではなく相手の名を入れる
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
    <div style={{ padding: '10px' }}>
      <div style={styles.headerContainer}>
        <h3 style={{ margin: 0, paddingBottom: '10px' }}>👥 連絡帳</h3>
        <button 
          onClick={onOpenSettings} 
          style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}
          title="設定"
        >
          ⚙️
        </button>
      </div>

      <div style={{ display: 'flex', gap: '5px', marginBottom: '20px' }}>
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

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {friendsList.length === 0 && (
          <p style={{ color: theme.colors.textSub, textAlign: 'center', marginTop: '20px' }}>友達がまだいません</p>
        )}
        {friendsList.map(f => (
          <li key={f.id} style={styles.friendItem}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 'bold', fontSize: '1rem', color: theme.colors.textMain }}>
                {f.profiles?.display_name || '名前未設定'}
              </span>
              <span style={{ fontSize: '0.75rem', color: theme.colors.textSub }}>
                {f.friend_email}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={() => handleTalkClick(f.friend_email)} 
                disabled={loading}
                style={{ ...commonStyles.button, width: 'auto', padding: '5px 12px', fontSize: '0.8rem', backgroundColor: '#06C755', color: 'white' }}
              >
                トーク
              </button>
              <button 
                onClick={() => deleteFriend(f.id)} 
                style={{ ...commonStyles.button, width: 'auto', padding: '5px 12px', fontSize: '0.8rem', backgroundColor: '#dc3545', color: 'white', }}
              >
                削除
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

// --- 3. スタイル定義（基準：骨組み・再利用構造のみ） ---
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
    borderBottom: `1px solid ${theme.colors.border}`
  }
};

export default Friends;