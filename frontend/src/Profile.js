import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { theme, commonStyles } from './theme';

const Profile = ({ session, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [profile, setProfile] = useState(null);
  
  // 基本情報用
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  
  // 認証維持期間（0: 毎回, 30: 1ヶ月, 180: 半年）
  const [sessionLimit, setSessionLimit] = useState(() => {
    return localStorage.getItem('auth_session_limit') || '0';
  });

  // セキュリティ変更フォームの開閉管理
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // メールアドレス変更用ステート
  const [newEmail, setNewEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');

  // パスワード変更用ステート
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // アバター操作用モーダルの開閉状態
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);

  useEffect(() => {
    const getProfile = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      if (!error && data) {
        setProfile(data);
        setDisplayName(data.display_name || '');
        setAvatarUrl(data.avatar_url || '');
      }
      setLoading(false);
    };
    getProfile();
  }, [session]);

  // --- 画像アップロード処理 ---
  const handleAvatarUpload = async (e) => {
    try {
      setUpdating(true);
      setIsAvatarModalOpen(false);
      const file = e.target.files[0];
      if (!file) return;

      const fileExt = file.name.split('.').pop();
      const filePath = `${session.user.id}/avatar_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', session.user.id);

      setAvatarUrl(publicUrl);
      alert('プロフィール画像を更新しました！');
    } catch (error) {
      alert('画像アップロード失敗: ' + error.message);
    } finally {
      setUpdating(false);
    }
  };

  // --- 画像削除処理 ---
  const handleDeleteAvatar = async () => {
    setIsAvatarModalOpen(false);
    if (!avatarUrl) return;
    if (!window.confirm('プロフィール画像を削除してもよろしいですか？')) return;
    
    try {
      setUpdating(true);
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', session.user.id);

      if (error) throw error;
      setAvatarUrl('');
      alert('画像を削除しました。');
    } catch (error) {
      alert('削除に失敗しました: ' + error.message);
    } finally {
      setUpdating(false);
    }
  };

  // --- パスワードによる本人再認証ヘルパー ---
  const verifyCurrentPassword = async (password) => {
    if (!password) {
      throw new Error('現在のパスワードを入力してください。');
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: password,
    });
    if (error) {
      throw new Error('現在のパスワードが正しくありません。');
    }
  };

  // --- メールアドレスの変更実行 ---
  const handleEmailUpdate = async (e) => {
    e.preventDefault();
    if (!newEmail || !confirmEmail) return alert('全ての項目を入力してください。');
    if (newEmail === session.user.email) return alert('現在のメールアドレスと同じです。');
    if (newEmail !== confirmEmail) return alert('新しいメールアドレスと確認用が一致しません。');

    try {
      setUpdating(true);

      const { error: emailError } = await supabase.auth.updateUser({ email: newEmail });
      if (emailError) throw emailError;

      const { error: dbEmailError } = await supabase
        .from('profiles')
        .update({ email: newEmail })
        .eq('id', session.user.id);

      if (dbEmailError) throw dbEmailError;

      alert('メールアドレスと関連データを更新しました！次回から新しいアドレスでログインしてください。');
      setNewEmail('');
      setConfirmEmail('');
      setShowEmailForm(false);
    } catch (error) {
      alert('変更に失敗しました: ' + error.message);
    } finally {
      setUpdating(false);
    }
  };

  // --- パスワードの変更実行 ---
  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) return alert('全ての項目を入力してください。');
    if (newPassword.length < 6) return alert('新しいパスワードは6文字以上必要です。');
    if (newPassword !== confirmPassword) return alert('新しいパスワードと確認用が一致しません。');

    try {
      setUpdating(true);
      await verifyCurrentPassword(currentPassword);

      const { error: pwdError } = await supabase.auth.updateUser({ password: newPassword });
      if (pwdError) throw pwdError;

      alert('パスワードを正常に更新しました。');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
    } catch (error) {
      alert('変更に失敗しました: ' + error.message);
    } finally {
      setUpdating(false);
    }
  };

  // --- 一般設定の保存処理 ---
  const handleGeneralUpdate = async () => {
    try {
      setUpdating(true);
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', session.user.id);
      if (profileError) throw profileError;

      localStorage.setItem('auth_session_limit', sessionLimit);
      localStorage.setItem('auth_last_verified', Date.now().toString());

      alert('プロフィール情報を更新しました！');
    } catch (error) {
      alert('更新に失敗しました: ' + error.message);
    } finally {
      setUpdating(false);
    }
  };

  // --- 退会処理（データ保持・フラグON方式） ---
  const handleDeleteAccount = async () => {
    const confirm1 = window.confirm("本当に退会しますか？この操作は取り消せません。");
    if (!confirm1) return;
    
    const confirm2 = window.prompt("退会する場合は「退会します」と入力してください。");
    if (confirm2 !== "退会します") {
      alert("入力内容が一致しないため、キャンセルしました。");
      return;
    }

    try {
      setUpdating(true);

      // 1. profiles テーブルの退会フラグを true に更新（物理削除はしない）
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ is_deleted: true })
        .eq('id', session.user.id);

      if (profileError) throw profileError;

      // 2. 即座にログアウトさせる
      await supabase.auth.signOut();
      
      alert('退会処理が完了しました。ご利用ありがとうございました。');
    } catch (error) {
      alert('退会処理中にエラーが発生しました: ' + error.message);
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
        {/* 画像アップロード部分 */}
        <div style={styles.avatarSection}>
          <div style={styles.avatarWrapper}>
            <img 
              src={avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face'} 
              alt="Avatar" 
              style={styles.avatarImage} 
            />
            <button 
              type="button"
              onClick={() => setIsAvatarModalOpen(true)} 
              style={styles.avatarLabelBtn}
              disabled={updating}
            >
              {updating ? '...' : '📷'}
            </button>
          </div>
        </div>

        {/* 表示名設定 */}
        <div style={styles.infoGroup}>
          <label htmlFor="display-name" style={styles.label}>表示名（ニックネーム）</label>
          <input 
            id="display-name"
            name="display-name"
            autoComplete="username"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={commonStyles.input}
          />
        </div>

        {/* 認証維持期間設定 */}
        <div style={styles.infoGroup}>
          <label htmlFor="session-limit" style={styles.label}>ログイン維持期間</label>
          <select 
            id="session-limit"
            name="session-limit"
            value={sessionLimit} 
            onChange={(e) => setSessionLimit(e.target.value)}
            style={{ ...commonStyles.input, cursor: 'pointer' }}
          >
            <option value="0">アプリを閉じるたびに認証（毎回）</option>
            <option value="30">1ヶ月間維持</option>
            <option value="180">半年間維持</option>
          </select>
        </div>

        {/* 一般設定の保存ボタン */}
        <button 
          onClick={handleGeneralUpdate} 
          disabled={updating}
          style={{ ...commonStyles.button, marginBottom: '25px', opacity: updating ? 0.6 : 1 }}
        >
          {updating ? '更新中...' : '基本設定を保存する'}
        </button>

        <hr style={styles.hr} />

        {/* 🔐 セキュリティ設定エリア */}
        <h4 style={{ margin: '0 0 15px 0', color: theme.colors.textMain }}>🔐 セキュリティ変更</h4>

        {/* メールアドレス変更 */}
        <div style={styles.accordionGroup}>
          <button 
            type="button" 
            onClick={() => { setShowEmailForm(!showEmailForm); setShowPasswordForm(false); }} 
            style={styles.accordionToggle}
          >
            ✉️ メールアドレスを変更する {showEmailForm ? '▲' : '▼'}
          </button>
          
          {showEmailForm && (
            <form onSubmit={handleEmailUpdate} style={styles.accordionContent}>
              {/* ★修正ポイント: labelエラーを解消するために input (readOnly) に変更 */}
              <div style={styles.infoGroup}>
                <label htmlFor="current-email-display" style={styles.subLabel}>現在のメールアドレス</label>
                <input 
                  id="current-email-display"
                  name="current-email"
                  type="email"
                  value={session.user.email}
                  readOnly
                  style={styles.readOnlyEmail}
                />
              </div>
              <div style={styles.infoGroup}>
                <label htmlFor="new-email-input" style={styles.subLabel}>新しいメールアドレス</label>
                <input 
                  id="new-email-input"
                  name="email"
                  autoComplete="email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  style={commonStyles.input}
                  required
                />
              </div>
              <div style={styles.infoGroup}>
                <label htmlFor="confirm-email-input" style={styles.subLabel}>新しいメールアドレス（確認用）</label>
                <input 
                  id="confirm-email-input"
                  name="confirm-email"
                  autoComplete="email"
                  type="email"
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  style={commonStyles.input}
                  required
                />
              </div>
              <button type="submit" disabled={updating} style={{ ...commonStyles.button, backgroundColor: theme.colors.primary }}>
                {updating ? '手続き中...' : 'メールアドレスを変更する'}
              </button>
            </form>
          )}
        </div>

        {/* パスワード変更 */}
        <div style={styles.accordionGroup}>
          <button 
            type="button" 
            onClick={() => { setShowPasswordForm(!showPasswordForm); setShowEmailForm(false); }} 
            style={styles.accordionToggle}
          >
            🔑 パスワードを変更する {showPasswordForm ? '▲' : '▼'}
          </button>

          {showPasswordForm && (
            <form onSubmit={handlePasswordUpdate} style={styles.accordionContent}>
              <div style={styles.infoGroup}>
                <label htmlFor="current-password-input" style={styles.subLabel}>現在のパスワード</label>
                <input 
                  id="current-password-input"
                  name="current-password"
                  autoComplete="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  style={commonStyles.input}
                  required
                />
              </div>
              <div style={styles.infoGroup}>
                <label htmlFor="new-password-input" style={styles.subLabel}>新しいパスワード</label>
                <input 
                  id="new-password-input"
                  name="new-password"
                  autoComplete="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={commonStyles.input}
                  placeholder="6文字以上"
                  required
                />
              </div>
              <div style={styles.infoGroup}>
                <label htmlFor="confirm-password-input" style={styles.subLabel}>新しいパスワード（確認用）</label>
                <input 
                  id="confirm-password-input"
                  name="confirm-password"
                  autoComplete="new-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={commonStyles.input}
                  required
                />
              </div>
              <button type="submit" disabled={updating} style={{ ...commonStyles.button, backgroundColor: '#28a745' }}>
                {updating ? '手続き中...' : 'パスワードを変更する'}
              </button>
            </form>
          )}
        </div>
      </div>

      <p style={styles.dateText}>
        アカウント作成日: {new Date(profile?.created_at).toLocaleDateString()}
      </p>      
      
      <button onClick={handleLogout} style={styles.logoutBtn}>
        ログアウト
      </button>

      {/* 退会ボタン */}
      <div style={{ marginTop: '40px' }}>
        <button onClick={handleDeleteAccount} style={styles.deleteAccBtn}>
          退会してアカウントを削除する
        </button>
      </div>

      {/* 画像操作用のモーダル */}
      {isAvatarModalOpen && (
        <div style={styles.modalOverlay} onClick={() => setIsAvatarModalOpen(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ marginTop: 0, marginBottom: '20px', textAlign: 'center' }}>プロフィール画像の変更</h4>
            
            <div style={styles.modalMenu}>
              <label htmlFor="avatar-file-modal" style={styles.modalMenuBtn}>
                📂 デバイスから画像を選ぶ
              </label>
              <input 
                id="avatar-file-modal" 
                name="avatar-file-modal"
                type="file" 
                accept="image/*" 
                onChange={handleAvatarUpload} 
                style={{ display: 'none' }} 
              />

              {avatarUrl && (
                <button onClick={handleDeleteAvatar} style={{ ...styles.modalMenuBtn, color: theme.colors.error }}>
                  🗑️ プロフィール画像を削除する
                </button>
              )}

              <button onClick={() => setIsAvatarModalOpen(false)} style={styles.modalCancelBtn}>
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
  container: { padding: '20px', textAlign: 'center', maxWidth: '500px', margin: '0 auto' },
  backBtn: { background: 'none', border: 'none', color: theme.colors.primary, cursor: 'pointer', marginBottom: '10px', fontSize: '0.9rem' },
  header: { borderBottom: `2px solid ${theme.colors.primary}`, paddingBottom: '10px', marginBottom: '20px', color: theme.colors.textMain },
  card: { margin: '20px 0', padding: '20px', backgroundColor: '#fff', borderRadius: '12px', border: `1px solid ${theme.colors.border}`, textAlign: 'left' },
  avatarSection: { display: 'flex', justifyContent: 'center', marginBottom: '25px' },
  avatarWrapper: { position: 'relative', width: '100px', height: '100px' },
  avatarImage: { width: '100px', height: '100px', borderRadius: '50%', objectFit: 'cover', border: `2px solid ${theme.colors.primary}` },
  avatarLabelBtn: { 
    position: 'absolute', bottom: 0, right: 0, backgroundColor: theme.colors.primary, 
    color: '#fff', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', 
    alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid #fff',
    fontSize: '0.9rem', padding: 0
  },
  infoGroup: { marginBottom: '20px' },
  label: { color: theme.colors.textSub, fontSize: '0.8rem', marginBottom: '8px', display: 'block', fontWeight: 'bold' },
  subLabel: { color: theme.colors.textSub, fontSize: '0.75rem', marginBottom: '6px', display: 'block' },
  // 読み取り専用メールのスタイルをinput用に微調整
  readOnlyEmail: { width: '100%', boxSizing: 'border-box', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '8px', fontSize: '0.9rem', color: '#495057', border: '1px solid #ced4da', outline: 'none' },
  logoutBtn: { 
    ...commonStyles.button, 
    marginTop: '30px', 
    backgroundColor: 'transparent', 
    color: theme.colors.error, 
    border: `1px solid ${theme.colors.error}` 
  },
  hr: { border: 'none', borderTop: `1px solid ${theme.colors.border}`, margin: '20px 0' },
  deleteAccBtn: { background: 'none', border: 'none', color: '#bbb', fontSize: '0.75rem', textDecoration: 'underline', cursor: 'pointer', padding: '10px' },
  accordionGroup: { marginBottom: '15px', border: `1px solid ${theme.colors.border}`, borderRadius: '8px', overflow: 'hidden' },
  accordionToggle: { width: '100%', padding: '12px 15px', textAlign: 'left', backgroundColor: '#f8f9fa', border: 'none', fontSize: '0.9rem', fontWeight: 'bold', color: '#333', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  accordionContent: { padding: '15px', backgroundColor: '#fff', borderTop: `1px solid ${theme.colors.border}` },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#fff', padding: '20px', borderRadius: '12px', width: '85%', maxWidth: '350px' },
  modalMenu: { display: 'flex', flexDirection: 'column', gap: '10px' },
  modalMenuBtn: { display: 'block', width: '100%', padding: '12px', textAlign: 'center', backgroundColor: '#f8f9fa', border: 'none', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 'bold', cursor: 'pointer', boxSizing: 'border-box', textDecoration: 'none', color: '#333' },
  modalCancelBtn: { width: '100%', padding: '12px', textAlign: 'center', backgroundColor: '#e9ecef', border: 'none', borderRadius: '8px', fontSize: '0.9rem', color: '#6c757d', cursor: 'pointer', marginTop: '5px' }
};

export default Profile;