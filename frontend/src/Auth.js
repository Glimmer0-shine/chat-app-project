import { useState } from 'react';
import { supabase } from './supabaseClient';
import { theme, commonStyles } from './theme'; // themeとcommonStylesをインポート

const Auth = () => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState(''); // 💡 修正：登録時のメールアドレス確認用ステート
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState(''); // 新規登録時のパスワード確認用ステート
  const [isRegister, setIsRegister] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    // 🛡️ セキュアバイデザイン①：サニタイズ（前後の空白を除去）
    const cleanedEmail = email.trim();
    const cleanedConfirmEmail = confirmEmail.trim();

    // 🛡️ セキュアバイデザイン②：入力必須チェック
    if (!cleanedEmail) {
      alert("メールアドレスを入力してください。");
      setLoading(false);
      return;
    }

    // 🛡️ セキュアバイデザイン③：文字数制限（国際規格254文字）のバリデーション
    if (cleanedEmail.length > 254) {
      alert("メールアドレスが長すぎます。");
      setLoading(false);
      return;
    }

    // 🛡️ セキュアバイデザイン④：正規表現による形式チェック
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanedEmail)) {
      alert("メールアドレスの形式が正しくありません。");
      setLoading(false);
      return;
    }

    if (isRegister) {
      // 🛡️ セキュアバイデザイン⑤：新規登録時のみ「メールアドレス確認」の整合性を検証
      if (!cleanedConfirmEmail) {
        alert("確認用のメールアドレスを入力してください。");
        setLoading(false);
        return;
      }
      if (cleanedEmail !== cleanedConfirmEmail) {
        alert("メールアドレスと確認用が一致しません。");
        setLoading(false);
        return;
      }

      // 🛡️ セキュアバイデザイン⑥：新規登録時のパスワード強度チェック（最低8文字以上）
      if (password.length < 8) {
        alert("セキュリティ向上のため、パスワードは8文字以上で設定してください。");
        setLoading(false);
        return;
      }

      // Supabaseの設定に合わせた4種（大文字・小文字・数字・記号）の網羅性チェック
      const hasUpperCase = /[A-Z]/.test(password); // 半角英大文字
      const hasLowerCase = /[a-z]/.test(password); // 半角英小文字
      const hasNumber    = /[0-9]/.test(password); // 半角数字
      
      // 💡 正規表現のエスケープ警告を完全に回避した、安全な記号判定（前回のロジック）
      const symbols = "!@#$%^&*()_+-=[]{};':\"\\|,.<>/?~`";
      const hasSymbol = [...password].some(char => symbols.includes(char));

      if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSymbol) {
        alert(
          "パスワードの強度が不足しています。\n" +
          "「半角英大文字」「半角英小文字」「半角数字」「半角記号」を、それぞれ最低1文字以上含めてください。"
        );
        setLoading(false);
        return;
      }

      // 🛡️ セキュアバイデザイン⑦：登録時のパスワード入力ミス（タイポ）防止チェック
      if (password !== confirmPassword) {
        alert("確認用のパスワードが一致しません。もう一度入力してください。");
        setLoading(false);
        return;
      }

      // 境界防御をすべてクリアした安全なクリーンデータで登録
      const { error } = await supabase.auth.signUp({ 
        email: cleanedEmail, 
        password 
      });

      if (error) {
        alert(error.message);
      } else {
        alert('登録確認メールを送りました（設定をOFFにしていればそのままログイン可能です）');
        // 新規登録成功後にステートをクリア
        setEmail('');
        setConfirmEmail('');
        setPassword('');
        setConfirmPassword('');
      }
    } else {
      // ログイン処理（安全にサニタイズされたクリーンなアドレスを送信）
      const { error } = await supabase.auth.signInWithPassword({ 
        email: cleanedEmail, 
        password 
      });

      if (error) {
        alert(error.message);
      }
    }
    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>{isRegister ? 'ユーザー登録' : 'ログイン'}</h2>
      
      <form onSubmit={handleAuth} style={styles.form}>
        <div style={styles.inputGroup}>
          <label htmlFor="auth-email" style={styles.label}>メールアドレス</label>
          <input
            id="auth-email"
            name="email"
            autoComplete="email"
            type="email"
            placeholder="example@mail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={commonStyles.input}
          />
        </div>

        {/* 💡 修正：新規登録（ユーザー登録）モードのときだけ「メールアドレスの確認入力」を表示 */}
        {isRegister && (
          <div style={styles.inputGroup}>
            <label htmlFor="auth-confirm-email" style={styles.label}>メールアドレス（確認）</label>
            <input
              id="auth-confirm-email"
              name="confirmEmail"
              autoComplete="email"
              type="email"
              placeholder="example@mail.com"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              required
              style={commonStyles.input}
            />
          </div>
        )}

        <div style={styles.inputGroup}>
          <label htmlFor="auth-password" style={styles.label}>
            パスワード {isRegister && <span style={styles.helperText}>（8字以上、半角、大/小/数/記を含む）</span>}
          </label>
          <input
            id="auth-password"
            name="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            type="password"
            placeholder="パスワードを入力"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={commonStyles.input}
          />
        </div>

        {/* 新規登録時のみパスワードの確認入力を表示 */}
        {isRegister && (
          <div style={styles.inputGroup}>
            <label htmlFor="auth-confirm-password" style={styles.label}>パスワード（確認）</label>
            <input
              id="auth-confirm-password"
              name="confirmPassword"
              autoComplete="new-password"
              type="password"
              placeholder="パスワードを再入力"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              style={commonStyles.input}
            />
          </div>
        )}

        <button 
          disabled={loading} 
          style={{ 
            ...commonStyles.button, 
            marginTop: '10px',
            backgroundColor: loading ? '#ccc' : theme.colors.primary 
          }}
        >
          {loading ? '処理中...' : isRegister ? '登録する' : 'ログインする'}
        </button>
      </form>

      <button 
        onClick={() => {
          setIsRegister(!isRegister);
          // モード切り替え時に入力値を綺麗にリセットして安全性を維持
          setEmail('');
          setConfirmEmail('');
          setPassword('');
          setConfirmPassword('');
        }} 
        style={styles.switchButton}
      >
        {isRegister ? '既にアカウントをお持ちの方' : '新しくアカウントを作る'}
      </button>
    </div>
  );
};

// --- スタイル定義 ---
const styles = {
  container: {
    padding: '40px 20px',
    textAlign: 'center',
    maxWidth: '400px',
    margin: '0 auto',
  },
  title: {
    marginBottom: '30px',
    color: theme.colors.textMain,
    fontSize: '1.5rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px', 
    textAlign: 'left', 
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '0.9rem',
    fontWeight: 'bold',
    color: theme.colors.textMain,
    marginLeft: '4px',
  },
  helperText: {
    fontSize: '0.75rem',
    fontWeight: 'normal',
    color: '#E53E3E',
  },
  switchButton: {
    marginTop: '20px',
    backgroundColor: 'transparent',
    border: 'none',
    color: theme.colors.primary,
    cursor: 'pointer',
    fontSize: '0.9rem',
    textDecoration: 'underline',
  }
};

export default Auth;