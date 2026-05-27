// theme.js
export const theme = {
  colors: {
    primary: '#007bff',      // メインの青
    secondary: '#6c757d',    // グレー（キャンセル等）
    success: '#28a745',      // 緑（追加・完了）
    danger: '#dc3545',       // 赤（削除・拒否）
    bgApp: '#f5f5f5',        // アプリ外側の背景
    bgContent: '#ffffff',    // 画面自体の背景
    border: '#eeeeee',       // 区切り線
    textMain: '#333333',     // メイン文字
    textSub: '#888888',      // 補足文字・時間
  },
  radius: {
    s: '4px',
    m: '8px',
    l: '20px',               // 丸みのあるボタンやモーダル用
    round: '50%',
  },
  spacing: {
    s: '5px',
    m: '10px',
    l: '15px',
    xl: '20px',
  }
};

// 共通でよく使うスタイルセット
export const commonStyles = {
  button: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: theme.radius.m,
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 'bold',
  },
  input: {
    width: '100%',
    padding: theme.spacing.m,
    borderRadius: theme.radius.s,
    border: `1px solid #ddd`,
    fontSize: '0.9rem',
    outline: 'none',
    boxSizing: 'border-box'
  },
  modalOverlay: {
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', 
    justifyContent: 'center', alignItems: 'center', zIndex: 1000
  }
};