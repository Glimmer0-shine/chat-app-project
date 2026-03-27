import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

const Profile = ({ session, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

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

        if (data) setProfile(data);
        setLoading(false);
    };
    getProfile();
  }, [session]);

  const handleLogout = () => supabase.auth.signOut();

  if (loading) return <p>読み込み中...</p>;

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', marginBottom: '10px' }}>
        ← 連絡帳に戻る
      </button>
      <h3 style={{ borderBottom: '2px solid #007bff', paddingBottom: '10px' }}>⚙️ マイプロフィール</h3>
      <div style={{ margin: '30px 0', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '10px' }}>
        <p style={{ color: '#666', marginBottom: '5px' }}>ログイン中のメールアドレス</p>
        <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{profile?.email}</p>
      </div>
      
      {/* 将来的にここで名前の編集などが可能 */}
      <p style={{ fontSize: '0.8rem', color: '#888' }}>
        アカウント作成日: {new Date(profile?.created_at).toLocaleDateString()}
      </p>

      <button 
        onClick={handleLogout} 
        style={{ marginTop: '40px', padding: '10px 20px', width: '100%', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
      >
        ログアウト
      </button>
    </div>
  );
};

export default Profile;