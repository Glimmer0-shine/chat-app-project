import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { theme, commonStyles } from './theme';

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
    <div style={styles.container}>
      <div style={{ textAlign: 'left' }}>
        <button onClick={onBack} style={styles.backBtn}>← 戻る</button>
      </div>

      <h3 style={styles.header}>⚙️ マイプロフィール</h3>

      <div style={styles.card}>
        <div style={styles.infoGroup}>
          <label style={styles.label}>メールアドレス</label>
          <p style={styles.emailText}>{profile?.email}</p>
        </div>

        <div style={styles.infoGroup}>
          <label htmlFor="nickname" style={styles.label}>表示名（ニックネーム）</label>
          <input 
            id="nickname"
            name="nickname"
            autoComplete="name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="未設定"
            style={commonStyles.input}
          />
        </div>

        <button 
          onClick={handleUpdate} 
          disabled={updating}
          style={{ ...commonStyles.button, marginTop: '10px', opacity: updating ? 0.6 : 1 }}
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
  container: { padding: '20px', textAlign: 'center' },
  backBtn: { background: 'none', border: 'none', color: theme.colors.primary, cursor: 'pointer', marginBottom: '10px', fontSize: '0.9rem' },
  header: { borderBottom: `2px solid ${theme.colors.primary}`, paddingBottom: '10px', marginBottom: '20px', color: theme.colors.textMain },
  card: { margin: '20px 0', padding: '20px', backgroundColor: '#fff', borderRadius: '12px', border: `1px solid ${theme.colors.border}`, textAlign: 'left' },
  infoGroup: { marginBottom: '20px' },
  label: { color: theme.colors.textSub, fontSize: '0.8rem', marginBottom: '8px', display: 'block', fontWeight: 'bold' },
  emailText: { fontSize: '1rem', color: theme.colors.textMain, wordBreak: 'break-all', fontWeight: '500' },
  dateText: { fontSize: '0.8rem', color: theme.colors.textSub, marginTop: '20px' },
  logoutBtn: { 
    ...commonStyles.button, 
    marginTop: '30px', 
    backgroundColor: 'transparent', 
    color: theme.colors.error, 
    border: `1px solid ${theme.colors.error}` 
  }
};

export default Profile;