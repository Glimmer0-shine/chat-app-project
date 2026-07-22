import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { theme, commonStyles } from './theme';

const Profile = ({ session, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [profile, setProfile] = useState(null);
  
  // 基本情報用
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  
  // 💡 【新設】メールアドレス検索の許可フラグ（初期値はtrue）
  const [allowEmailSearch, setAllowEmailSearch] = useState(true);
  
  // 認証維持期間（0: 毎回, 30: 1ヶ月, 180: 半年）
  const [sessionLimit, setSessionLimit] = useState(() => {
    return localStorage.getItem('auth_session_limit') || '0';
  });

  // 各フォーム・アコーディオンの開閉管理
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showFriendManagement, setShowFriendManagement] = useState(false);

  // メールアドレス変更用ステート
  const [newEmail, setNewEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');

  // パスワード変更用ステート
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // アバター操作用モーダルの開閉状態
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);

  // 友達管理用ステート
  const [settingsTab, setSettingsTab] = useState('hidden'); 
  const [hiddenFriends, setHiddenFriends] = useState([]);
  const [blockedFriends, setBlockedFriends] = useState([]);

  // --- 1. プロフィール取得 ---
  useEffect(() => {
    if (!session?.user?.id) return;

    let isMounted = true; 
    const getProfile = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle(); 

        if (isMounted && !error && data) {
          setProfile(data);
          setDisplayName(data.display_name || '');
          
          // 💡 【修正】DBから取得した検索許可設定をステートに反映（nullの場合はデフォルトのtrueにする）
          setAllowEmailSearch(data.allow_email_search !== false);

          if (data.avatar_url) {
            const { data: signedData, error: signError } = await supabase.storage
              .from('avatars')
              .createSignedUrl(data.avatar_url, 300); // 5分間有効

            if (!signError && signedData && isMounted) {
              setAvatarUrl(signedData.signedUrl);
            } else if (isMounted) {
              setAvatarUrl('');
            }
          } else {
            setAvatarUrl('');
          }
        }
      } catch (e) {
        console.error("プロフィール取得例外:", e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    getProfile();

    return () => { isMounted = false; };
  }, [session?.user?.id]); 

  // --- 2. 非表示リスト & ブロックリストを取得する関数 ---
  const fetchManagementLists = useCallback(async () => {
    if (!session?.user?.id) return;

    try {
      const { data: hiddenData, error: hError } = await supabase
        .from('friends')
        .select('id, friend_email, profiles!friend_email(display_name)')
        .eq('user_id', session.user.id)
        .eq('is_hidden', true);
      if (!hError) setHiddenFriends(hiddenData || []);

      const { data: blockedData, error: bError } = await supabase
        .from('friends')
        .select('id, friend_email, profiles!friend_email(display_name)')
        .eq('user_id', session.user.id)
        .eq('is_blocked', true);
      if (!bError) setBlockedFriends(blockedData || []);
    } catch (e) {
      console.error("リスト取得例外:", e);
    }
  }, [session?.user?.id]); 

  useEffect(() => {
    if (showFriendManagement && session?.user?.id) {
      fetchManagementLists();
    }
  }, [showFriendManagement, fetchManagementLists, session?.user?.id]);

  // --- 3. 各アコーディオンの切り替え制御 ---
  const toggleAccordion = (type) => {
    setNewEmail('');
    setConfirmEmail('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');

    if (type === 'email') {
      setShowEmailForm(!showEmailForm);
      setShowPasswordForm(false);
      setShowFriendManagement(false);
    } else if (type === 'password') {
      setShowPasswordForm(!showPasswordForm);
      setShowEmailForm(false);
      setShowFriendManagement(false);
    } else if (type === 'management') {
      setShowFriendManagement(!showFriendManagement);
      setShowEmailForm(false);
      setShowPasswordForm(false);
    }
  };

  // --- 4. 画像アップロード・削除処理 ---
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

      await supabase
        .from('profiles')
        .update({ avatar_url: filePath })
        .eq('id', session.user.id);

      const { data: signedData, error: signError } = await supabase.storage
        .from('avatars')
        .createSignedUrl(filePath, 300);

      if (signError) throw signError;

      setAvatarUrl(signedData.signedUrl);
      alert('プロフィール画像を更新しました！');
    } catch (error) {
      alert('画像アップロード失敗: ' + error.message);
    } finally {
      setUpdating(false);
    }
  };

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

  // --- 5. セキュリティ認証＆更新系処理 ---
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

  // const handleEmailUpdate = async (e) => {
  //   e.preventDefault();
  //   if (!newEmail || !confirmEmail) return alert('全ての項目を入力してください。');
  //   if (newEmail === session.user.email) return alert('現在のメールアドレスと同じです。');
  //   if (newEmail !== confirmEmail) return alert('新しいメールアドレスと確認用が一致しません。');

  //   try {
  //     setUpdating(true);
  //     const { error: emailError } = await supabase.auth.updateUser({ email: newEmail });
  //     if (emailError) throw emailError;

  //     const { error: dbEmailError } = await supabase
  //       .from('profiles')
  //       .update({ email: newEmail })
  //       .eq('id', session.user.id);

  //     if (dbEmailError) throw dbEmailError;

  //     alert('メールアドレスと関連データを更新しました！次回から新しいアドレスでログインしてください。');
  //     setNewEmail('');
  //     setConfirmEmail('');
  //     setShowEmailForm(false);
  //   } catch (error) {
  //     alert('変更に失敗しました: ' + error.message);
  //   } finally {
  //     setUpdating(false);
  //   }
  // };

  // =========================================================================
  // 💡 新コード（メールアドレスのサニタイズ・厳格なバリデーションを追加）
  // =========================================================================
  const handleEmailUpdate = async (e) => {
    e.preventDefault();

    // 1. サニタイズ
    const cleanedNewEmail = newEmail.trim();
    const cleanedConfirmEmail = confirmEmail.trim();

    // 2. 入力チェック
    if (!cleanedNewEmail || !cleanedConfirmEmail) {
      alert('全ての項目を入力してください。');
      return;
    }

    // 3. バリデーション：文字数制限（国際規格254文字）
    if (cleanedNewEmail.length > 254) {
      alert("入力されたメールアドレスが長すぎます。");
      return;
    }

    // 4. バリデーション：正規表現による形式チェック（前回解説した暗号ルールです！）
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanedNewEmail)) {
      alert("新しいメールアドレスの形式が正しくありません。");
      return;
    }

    // 5. ビジネスロジックチェック
    if (cleanedNewEmail === session.user.email) {
      alert('現在のメールアドレスと同じです。');
      return;
    }
    if (cleanedNewEmail !== cleanedConfirmEmail) {
      alert('新しいメールアドレスと確認用が一致しません。');
      return;
    }

    try {
      setUpdating(true);
      // Supabaseの認証用アドレスを更新
      const { error: emailError } = await supabase.auth.updateUser({ email: cleanedNewEmail });
      if (emailError) throw emailError;

      // 自作のデータベース（profilesテーブル）も同期して更新
      const { error: dbEmailError } = await supabase
        .from('profiles')
        .update({ email: cleanedNewEmail })
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

  // const handlePasswordUpdate = async (e) => {
  //   e.preventDefault();
  //   if (!currentPassword || !newPassword || !confirmPassword) return alert('全ての項目を入力してください。');
  //   if (newPassword.length < 6) return alert('新しいパスワードは6文字以上必要です。');
  //   if (newPassword !== confirmPassword) return alert('新しいパスワードと確認用が一致しません。');

  //   try {
  //     setUpdating(true);
  //     await verifyCurrentPassword(currentPassword);

  //     const { error: pwdError } = await supabase.auth.updateUser({ password: newPassword });
  //     if (pwdError) throw pwdError;

  //     alert('パスワードを正常に更新しました。');
  //     setCurrentPassword('');
  //     setNewPassword('');
  //     setConfirmPassword('');
  //     setShowPasswordForm(false);
  //   } catch (error) {
  //     alert('変更に失敗しました: ' + error.message);
  //   } finally {
  //     setUpdating(false);
  //   }
  // };

  // =========================================================================
  // 💡 新コード（パスワードのバリデーション強化）
  // =========================================================================
  const handlePasswordUpdate = async (e) => {
    e.preventDefault();

    // 💡 パスワードは「スペースそのものをパスワードとして使いたい人」がいる可能性があるため、
    // あえて trim() はせず、そのままバリデーションにかけます。
    if (!currentPassword || !newPassword || !confirmPassword) {
      alert('全ての項目を入力してください。');
      return;
    }

    // 最低文字数のバリデーション（安全性を高めるため、一般的な推奨値である6〜8文字以上に設定）
    if (newPassword.length < 8) {
      alert('新しいパスワードは6文字以上必要です。');
      return;
    }

    // 最大文字数のバリデーション（極端に長いパスワードによるサーバー過負荷：Dos攻撃を防ぐための上限設定）
    if (newPassword.length > 72) {
      alert('新しいパスワードは72文字以内で設定してください。');
      return;
    }

    if (newPassword === currentPassword) {
      alert('新しいパスワードが現在のパスワードと同じです。変更してください。');
      return;
    }

    if (newPassword !== confirmPassword) {
      alert('新しいパスワードと確認用が一致しません。');
      return;
    }

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

  // const handleGeneralUpdate = async () => {
  //   try {
  //     setUpdating(true);
  //     // 💡 【修正】更新データに allow_email_search を追加
  //     const { error: profileError } = await supabase
  //       .from('profiles')
  //       .update({ 
  //         display_name: displayName,
  //         allow_email_search: allowEmailSearch
  //       })
  //       .eq('id', session.user.id);
  //     if (profileError) throw profileError;

  //     localStorage.setItem('auth_session_limit', sessionLimit);
  //     localStorage.setItem('auth_last_verified', Date.now().toString());

  //     alert('プロフィール情報を更新しました！');
  //     // 保存が成功したら、親コンポーネントから受け取った「戻る処理」を実行する
  //     if (onBack) onBack();
  //   } catch (error) {
  //     alert('更新に失敗しました: ' + error.message);
  //   } finally {
  //     setUpdating(false);
  //   }
  // };

  // =========================================================================
  // 💡 新コード（表示名のサニタイズ・バリデーションを追加）
  // =========================================================================
  const handleGeneralUpdate = async () => {
    // 1. 表示名の前後の空白を除去（サニタイズ）
    const cleanedDisplayName = displayName.trim();

    // 2. バリデーション：表示名が空っぽになっていないかチェック
    // if (!cleanedDisplayName) {
    //   alert("表示名を入力してください。");
    //   return;
    // }

    // 3. バリデーション：文字数制限（画面崩れを防ぐため、最大20文字程度に制限）
    if (cleanedDisplayName.length > 20) {
      alert("表示名は20文字以内で入力してください。");
      return;
    }

    try {
      setUpdating(true);
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          display_name: cleanedDisplayName, // サニタイズ済みの文字列を保存
          allow_email_search: allowEmailSearch
        })
        .eq('id', session.user.id);
      if (profileError) throw profileError;

      localStorage.setItem('auth_session_limit', sessionLimit);
      localStorage.setItem('auth_last_verified', Date.now().toString());

      alert('プロフィール情報を更新しました！');
      if (onBack) onBack();
    } catch (error) {
      alert('更新に失敗しました: ' + error.message);
    } finally {
      setUpdating(false);
    }
  };

  // --- 6. 友達管理アコーディオン内の操作ロジック ---
  const handleUpdateStatus = async (id, updates, successMessage) => {
    if (!session?.user?.id) return;
    const { error } = await supabase
      .from('friends')
      .update(updates)
      .eq('id', id)
      .eq('user_id', session.user.id);

    if (!error) {
      alert(successMessage);
      fetchManagementLists();
    } else {
      alert("処理に失敗しました");
    }
  };

  const deleteFriendFromManagement = async (id) => {
    if (!session?.user?.id) return;
    if (!window.confirm('この友達を削除しますか？\n（連絡帳および管理リストから完全に消去されます）')) return;
    
    const { error } = await supabase
      .from('friends')
      .delete()
      .eq('id', id)
      .eq('user_id', session.user.id);

    if (!error) {
      alert("削除しました。");
      fetchManagementLists();
    } else {
      alert("削除に失敗しました");
    }
  };

  // --- 7. 退会処理 ---
  const handleDeleteAccount = async () => {
    if (!session?.user?.id) return;
    const confirm1 = window.confirm("本当に退会しますか？この操作は取り消せません。");
    if (!confirm1) return;
    
    const confirm2 = window.prompt("退会する場合は「退会します」と入力してください。");
    if (confirm2 !== "退会します") {
      alert("入力内容が一致しないため、キャンセルしました。");
      return;
    }

    try {
      setUpdating(true);
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ is_deleted: true })
        .eq('id', session.user.id);

      if (profileError) throw profileError;

      localStorage.removeItem('auth_last_verified');
      sessionStorage.removeItem('session_active');

      await supabase.auth.signOut();
      alert('退会処理が完了しました。ご利用ありがとうございました。');
    } catch (error) {
      alert('退会処理中にエラーが発生しました: ' + error.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_last_verified');
    sessionStorage.removeItem('session_active');
    supabase.auth.signOut();
  };

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
              src={avatarUrl || '/images/default-avatar.png'} 
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

        {/* 💡 【新設】プライバシー設定（メールアドレス検索のオン/オフ） */}
        <div style={styles.infoGroup}>
          <label htmlFor="allow-email-search-checkbox" style={styles.label}>プライバシー設定</label>
          <label htmlFor="allow-email-search-checkbox" style={styles.checkboxContainer}>
            <input 
              id="allow-email-search-checkbox"
              name="allow-email-search"
              type="checkbox"
              checked={allowEmailSearch}
              onChange={(e) => setAllowEmailSearch(e.target.checked)}
              style={styles.checkbox}
            />
            <span style={styles.checkboxText}>他のユーザーからのメールアドレス検索を許可する</span>
          </label>
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
            <option value="180">6ヶ月間維持</option>
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
            onClick={() => toggleAccordion('email')} 
            style={styles.accordionToggle}
          >
            ✉️ メールアドレスを変更する {showEmailForm ? '▲' : '▼'}
          </button>
          
          {showEmailForm && (
            <form onSubmit={handleEmailUpdate} style={styles.accordionContent}>
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
            onClick={() => toggleAccordion('password')} 
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

        <hr style={styles.hr} />

        {/* 👥 友達管理エリア */}
        <h4 style={{ margin: '0 0 15px 0', color: theme.colors.textMain }}>👥 友達管理</h4>

        <div style={styles.accordionGroup}>
          <button 
            type="button" 
            onClick={() => toggleAccordion('management')} 
            style={styles.accordionToggle}
          >
            ⚙️ 非表示・ブロックユーザー管理 {showFriendManagement ? '▲' : '▼'}
          </button>

          {showFriendManagement && (
            <div style={styles.accordionContent}>
              <div style={styles.settingTabs}>
                <button 
                  type="button"
                  onClick={() => setSettingsTab('hidden')} 
                  style={styles.settingTabBtn(settingsTab === 'hidden')}
                >
                  非表示 ({hiddenFriends.length})
                </button>
                <button 
                  type="button"
                  onClick={() => setSettingsTab('blocked')} 
                  style={styles.settingTabBtn(settingsTab === 'blocked')}
                >
                  ブロック ({blockedFriends.length})
                </button>
              </div>

              <div style={styles.listContainer}>
                {settingsTab === 'hidden' ? (
                  hiddenFriends.length === 0 ? (
                    <p style={styles.emptyText}>非表示のユーザーはいません</p>
                  ) : (
                    hiddenFriends.map(f => (
                      <div key={f.id} style={styles.manageRow}>
                        <div style={styles.manageInfo}>
                          <span style={styles.manageName}>{f.profiles?.display_name || '名前未設定'}</span>
                          <span style={styles.manageEmail}>{f.friend_email}</span>
                        </div>
                        <div style={styles.manageActions}>
                          <button type="button" onClick={() => handleUpdateStatus(f.id, { is_hidden: false }, "非表示を解除しました")} style={styles.actionBtn}>解除</button>
                          <button type="button" onClick={() => deleteFriendFromManagement(f.id)} style={styles.actionDeleteBtn}>削除</button>
                        </div>
                      </div>
                    ))
                  )
                ) : (
                  blockedFriends.length === 0 ? (
                    <p style={styles.emptyText}>ブロック中のユーザーはいません</p>
                  ) : (
                    blockedFriends.map(f => (
                      <div key={f.id} style={styles.manageRow}>
                        <div style={styles.manageInfo}>
                          <span style={styles.manageName}>{f.profiles?.display_name || '名前未設定'}</span>
                          <span style={styles.manageEmail}>{f.friend_email}</span>
                        </div>
                        <div style={styles.manageActions}>
                          <button type="button" onClick={() => handleUpdateStatus(f.id, { is_blocked: false }, "ブロックを解除しました")} style={styles.actionBtn}>解除</button>
                          <button type="button" onClick={() => deleteFriendFromManagement(f.id)} style={styles.actionDeleteBtn}>削除</button>
                        </div>
                      </div>
                    ))
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <p style={styles.dateText}>
        アカウント作成日: {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '---'}
      </p>      
      
      <button onClick={handleLogout} style={styles.logoutBtn}>
        ログアウト
      </button>

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
  readOnlyEmail: { width: '100%', boxSizing: 'border-box', padding: '10px', backgroundColor: '#e9ecef', borderRadius: '8px', fontSize: '0.9rem', color: '#495057', border: '1px solid #ced4da', outline: 'none' },
  
  // 💡 【新設】チェックボックス用のスタイル
  checkboxContainer: { display: 'flex', alignItems: 'center', cursor: 'pointer', marginTop: '5px' },
  checkbox: { width: '18px', height: '18px', cursor: 'pointer', marginRight: '10px' },
  checkboxText: { fontSize: '0.85rem', color: theme.colors.textMain },

  logoutBtn: { 
    ...commonStyles.button, 
    marginTop: '30px', 
    backgroundColor: 'transparent', 
    color: theme.colors.error, 
    border: `1px solid ${theme.colors.error}` 
  },
  hr: { border: 'none', borderTop: `1px solid ${theme.colors.border}`, margin: '20px 0' },
  deleteAccBtn: { background: 'none', border: 'none', color: '#FB3C02', fontSize: '0.75rem', textDecoration: 'underline', cursor: 'pointer', padding: '10px' },
  accordionGroup: { marginBottom: '15px', border: `1px solid ${theme.colors.border}`, borderRadius: '8px', overflow: 'hidden' },
  accordionToggle: { width: '100%', padding: '12px 15px', textAlign: 'left', backgroundColor: '#f8f9fa', border: 'none', fontSize: '0.9rem', fontWeight: 'bold', color: '#333', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  accordionContent: { padding: '15px', backgroundColor: '#fff', borderTop: `1px solid ${theme.colors.border}` },
  
  settingTabs: { display: 'flex', borderBottom: '1px solid #eee', backgroundColor: '#f8f9fa', marginBottom: '10px', borderRadius: '4px', overflow: 'hidden' },
  settingTabBtn: (isActive) => ({
    flex: 1, padding: '10px 0', border: 'none', background: 'none', fontSize: '0.8rem', cursor: 'pointer',
    color: isActive ? theme.colors.primary : '#666', borderBottom: isActive ? `2px solid ${theme.colors.primary}` : '2px solid transparent',
    fontWeight: isActive ? 'bold' : 'normal', transition: '0.2s'
  }),
  listContainer: { maxHeight: '240px', overflowY: 'auto' },
  emptyText: { color: '#999', fontSize: '0.8rem', padding: '20px 0', textAlign: 'center', margin: 0 },
  manageRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f3f5' },
  manageInfo: { display: 'flex', flexDirection: 'column', textAlign: 'left', flex: 1, marginRight: '10px' },
  manageName: { fontWeight: 'bold', fontSize: '0.85rem', color: '#333' },
  manageEmail: { fontSize: '0.7rem', color: '#888' },
  manageActions: { display: 'flex', gap: '5px' },
  actionBtn: { padding: '3px 8px', fontSize: '0.7rem', backgroundColor: '#f1f3f5', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' },
  actionDeleteBtn: { padding: '3px 8px', fontSize: '0.7rem', backgroundColor: '#fff5f5', color: theme.colors.error, border: '1px solid #ffa8a8', borderRadius: '4px', cursor: 'pointer' },
  
  dateText: { color: '#aaa', fontSize: '0.75rem', marginTop: '20px' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#fff', padding: '20px', borderRadius: '12px', width: '85%', maxWidth: '350px' },
  modalMenu: { display: 'flex', flexDirection: 'column', gap: '10px' },
  modalMenuBtn: { display: 'block', width: '100%', padding: '12px', textAlign: 'center', backgroundColor: '#f8f9fa', border: 'none', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 'bold', cursor: 'pointer', boxSizing: 'border-box', textDecoration: 'none', color: '#333' },
  modalCancelBtn: { width: '100%', padding: '12px', textAlign: 'center', backgroundColor: '#e9ecef', border: 'none', borderRadius: '8px', fontSize: '0.9rem', color: '#6c757d', cursor: 'pointer', marginTop: '5px' }
};

export default Profile;