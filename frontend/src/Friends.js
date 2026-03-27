import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const Friends = ({ session, onStartChat, onOpenSettings }) => {
  const [friendEmail, setFriendEmail] = useState('');
  const [friendsList, setFriendsList] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchFriends = useCallback(async () => {
    if (!session?.user?.id) return;
    const { data, error } = await supabase
      .from('friends')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (!error) setFriendsList(data || []);
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

    // 【新機能】profilesテーブルで存在チェック
    const { data: profile, error: checkError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', friendEmail)
      .maybeSingle(); // データがない場合にエラーにせずnullを返す

    if (checkError) {
    console.error("プロフィール検索エラー:", checkError.message);
    }
    
    if (!profile) {
      alert("そのメールアドレスのユーザーは見つかりませんでした。");
      setLoading(false);
      return;
    }

    // すでに友達かどうかのチェック（二重登録防止）
    const isAlreadyFriend = friendsList.some(f => f.friend_email === friendEmail);
    if (isAlreadyFriend) {
      alert("そのユーザーは既に追加されています");
      setLoading(false);
      return;
    }

    // 追加実行
    const { error } = await supabase
      .from('friends')
      .insert([{ 
        user_id: session.user.id, 
        friend_email: friendEmail,
        friend_user_id: profile.id // 相手のUUIDも保存しておく
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

  return (
    <div style={{ padding: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #007bff', marginBottom: '15px' }}>
            <h3 style={{ margin: 0, paddingBottom: '10px' }}>👥 連絡帳</h3>
            {/* 歯車アイコンのボタン */}
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
        {friendsList.map(f => (
          <li key={f.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '15px 0', borderBottom: '1px solid #eee' }}>
            <span style={{ fontWeight: '500' }}>{f.friend_email}</span>
            <div>
              <button onClick={() => onStartChat(f.friend_email)} style={{ marginRight: '8px', padding: '5px 12px', cursor: 'pointer' }}>トーク</button>
              <button onClick={() => deleteFriend(f.id)} style={{ padding: '5px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>削除</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Friends;