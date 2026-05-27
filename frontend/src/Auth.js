import { useState } from 'react';
import { supabase } from './supabaseClient';
import { theme, commonStyles } from './theme'; // themeとcommonStylesをインポート

const Auth = () => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (isRegister) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) alert(error.message);
      else alert('登録確認メールを送りました（設定をOFFにしていればそのままログイン可能です）');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
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
            style={commonStyles.input} // 共通のinputスタイルを適用
          />
        </div>

        <div style={styles.inputGroup}>
          <label htmlFor="auth-password" style={styles.label}>パスワード</label>
          <input
            id="auth-password"
            name="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            type="password"
            placeholder="パスワードを入力"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={commonStyles.input} // 共通のinputスタイルを適用
          />
        </div>

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
        onClick={() => setIsRegister(!isRegister)} 
        style={styles.switchButton}
      >
        {isRegister ? '既にアカウントをお持ちの方' : '新しくアカウントを作る'}
      </button>
    </div>
  );
};

// --- スタイル定義 (exportの前に配置) ---
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
    gap: '20px', // 入力項目間の余白
    textAlign: 'left', // ラベルを左寄せにするため
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