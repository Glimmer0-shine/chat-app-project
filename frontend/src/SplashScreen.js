import React from 'react';

export default function SplashScreen() {
  return (
    <div style={styles.container}>
      <div style={styles.logoWrapper}>
        {/* 送っていただいたY Talkのロゴ画像パスに指定してください */}
        <img src="/images/logo-Image.png" alt="Y Talk Logo" style={styles.logoImage} />
      </div>
      
      {/* フェードイン・フェードアウト用のアニメーション定義 */}
      <style>{`
        @keyframes fadeInOut {
          0% { opacity: 0; transform: scale(0.95); }
          30% { opacity: 1; transform: scale(1); }
          70% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}

// 同一ファイル内のスタイル定義
const styles = {
  container: {
    width: '100%',
    height: '100vh',
    // background: "linear-gradient(180deg, #AED8F2 0%, #A8D4EE 50%, #A4D0EB 100%)",
    backgroundColor: '#A7D1ED',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoWrapper: {
    animation: 'fadeInOut 2.5s ease-in-out forwards',
    textAlign: 'center',
  },
  logoImage: {
    width: '100%',
    height: 'auto',
  },
};