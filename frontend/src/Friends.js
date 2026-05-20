import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

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

  // --- 追加：トーク開始時のルーム作成ロジック ---
  const handleTalkClick = async (friendEmail) => {
    setLoading(true);
    try {
      // 1. 相手のプロフィールIDを取得
      const { data: friendProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', friendEmail)
        .single();

      if (!friendProfile) {
        alert("相手のプロフィールが見つかりません");
        return;
      }

      // 2. すでにこの相手との1対1ルームが存在するかチェック
      const { data: existingMembers } = await supabase
        .from('room_members')
        .select('room_id')
        .eq('user_id', session.user.id);

      let existingRoomId = null;
      if (existingMembers && existingMembers.length > 0) {
        const myRoomIds = existingMembers.map(m => m.room_id);
        const { data: commonRoom } = await supabase
          .from('room_members')
          .select('room_id')
          .in('room_id', myRoomIds)
          .eq('user_id', friendProfile.id)
          .maybeSingle();
        
        if (commonRoom) existingRoomId = commonRoom.room_id;
      }

      let finalRoomId = existingRoomId;

      // 3. ルームがなければ新規作成
      if (!existingRoomId) {
        const { data: newRoom, error: roomError } = await supabase
          .from('rooms')
          .insert([{ name: '1on1' }])
          .select()
          .single();

        if (roomError) throw roomError;
        finalRoomId = newRoom.id;

        // 自分と相手を登録
        await supabase.from('room_members').insert([
          { room_id: finalRoomId, user_id: session.user.id, status: 'joined' },
          { room_id: finalRoomId, user_id: friendProfile.id, status: 'joined' }
        ]);
      }

      // 4. 親(App.js)の handleStartChat を呼び出す
      onStartChat(friendEmail, finalRoomId);

    } catch (err) {
      console.error(err);
      alert("トークの開始に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #007bff', marginBottom: '15px' }}>
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
          type="email" placeholder="友達のメールアドレスを入力" 
          value={friendEmail} onChange={e => setFriendEmail(e.target.value)}
          style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
        />
        <button onClick={addFriend} disabled={loading} style={{ padding: '10px 15px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          {loading ? '検索中...' : '追加'}
        </button>
      </div>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {friendsList.length === 0 && <p style={{ color: '#888', textAlign: 'center' }}>友達がまだいません</p>}
        {friendsList.map(f => {
          // ★追加: 表示名の判定ロジック
          const displayName = f.profiles?.display_name;

          return (
            <li key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', borderBottom: '1px solid #eee' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {/* ニックネームがある場合は太字で表示 */}
                <span style={{ fontWeight: 'bold', fontSize: '1rem' }}>
                  {displayName || '名前未設定'}
                </span>
                {/* メールアドレスを補足として小さく表示 */}
                <span style={{ fontSize: '0.75rem', color: '#888' }}>
                  {f.friend_email}
                </span>
              </div>
              <div>
                <button 
                  onClick={() => handleTalkClick(f.friend_email)} 
                  disabled={loading}
                  style={{ marginRight: '8px', padding: '5px 12px', cursor: 'pointer' }}
                >
                  トーク
                </button>
                <button onClick={() => deleteFriend(f.id)} style={{ padding: '5px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>削除</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default Friends;