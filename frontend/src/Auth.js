import { useState } from 'react';
import { supabase } from './supabaseClient';

const Auth = () => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false); // ログインと登録の切り替え用

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (isRegister) {
      // ユーザー登録
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) alert(error.message);
      else alert('登録確認メールを送りました（設定をOFFにしていればそのままログイン可能です）');
    } else {
      // ログイン
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h2>{isRegister ? 'ユーザー登録' : 'ログイン'}</h2>
      <form onSubmit={handleAuth}>
        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        /><br />
        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        /><br />
        <button disabled={loading}>
          {loading ? '処理中...' : isRegister ? '登録する' : 'ログインする'}
        </button>
      </form>
      <button onClick={() => setIsRegister(!isRegister)} style={{ marginTop: '10px' }}>
        {isRegister ? '既にアカウントをお持ちの方' : '新しくアカウントを作る'}
      </button>
    </div>
  );
};

export default Auth;