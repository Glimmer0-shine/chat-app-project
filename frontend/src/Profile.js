import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const Profile = ({ session, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false); // 保存中のローディング用
  const [profile, setProfile] = useState(null);
  const [displayName, setDisplayName] = useState(''); // 入力中の名前

  useEffect(() => {
    const getProfile = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (error) {
        console.error("プロフィール取得エラー:", error.message);
      }

      if (data) {
        setProfile(data);
        setDisplayName(data.display_name || ''); // 既存の名前があればセット
      }
      setLoading(false);
    };
    getProfile();
  }, [session]);

  // プロフィール更新関数
  const handleUpdate = async () => {
    try {
      setUpdating(true);
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: displayName }) // SQLで追加したカラムを指定
        .eq('id', session.user.id);

      if (error) throw error;
      alert('プロフィールを更新しました！');
    } catch (error) {
      console.error('更新エラー:', error.message);
      alert('更新に失敗しました。');
    } finally {
      setUpdating(false);
    }
  };

  const handleLogout = () => supabase.auth.signOut();

  if (loading) return <p style={{ textAlign: 'center', marginTop: '50px' }}>読み込み中...</p>;

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <button onClick={onBack} style={styles.backBtn}>
        ← 連絡帳に戻る
      </button>

      <h3 style={styles.header}>⚙️ マイプロフィール</h3>

      <div style={styles.card}>
        <div style={{ marginBottom: '20px' }}>
          <p style={styles.label}>メールアドレス</p>
          <p style={styles.emailText}>{profile?.email}</p>
        </div>

        <div style={{ marginBottom: '20px', textAlign: 'left' }}>
          <label style={styles.label}>表示名（ニックネーム）</label>
          <input 
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="未設定（メールアドレスが表示されます）"
            style={styles.input}
          />
        </div>

        <button 
          onClick={handleUpdate} 
          disabled={updating}
          style={{ ...styles.saveBtn, opacity: updating ? 0.6 : 1 }}
        >
          {updating ? '保存中...' : 'プロフィールを保存'}
        </button>
      </div>
      
      <p style={styles.dateText}>
        アカウント作成日: {new Date(profile?.created_at).toLocaleDateString()}
      </p>

      <button onClick={handleLogout} style={styles.logoutBtn}>
        ログアウト
      </button>
    </div>
  );
};

const styles = {
  backBtn: { background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', marginBottom: '10px' },
  header: { borderBottom: '2px solid #007bff', paddingBottom: '10px', marginBottom: '20px' },
  card: { margin: '20px 0', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' },
  label: { color: '#666', fontSize: '0.8rem', marginBottom: '5px', display: 'block' },
  emailText: { fontSize: '1rem', fontWeight: 'bold', wordBreak: 'break-all' },
  input: {
    width: '100%', padding: '10px', marginTop: '5px',
    borderRadius: '5px', border: '1px solid #ddd', boxSizing: 'border-box'
  },
  saveBtn: {
    marginTop: '10px', padding: '10px', width: '100%',
    backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold'
  },
  dateText: { fontSize: '0.8rem', color: '#888', marginTop: '20px' },
  logoutBtn: {
    marginTop: '30px', padding: '10px 20px', width: '100%',
    backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer'
  }
};

export default Profile;