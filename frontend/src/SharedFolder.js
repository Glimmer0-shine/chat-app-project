import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { theme } from './theme';

// roomId (グループ用) を追加で受け取れるように変更
const SharedFolder = ({ session, friendEmail, roomId: propsRoomId }) => {
  const [uploading, setUploading] = useState(false);
  const [images, setImages] = useState([]);

  const storagePath = propsRoomId;
  const chatRoomId = propsRoomId;

  // 画像一覧の取得
  const fetchImages = useCallback(async () => {
    const { data, error } = await supabase
      .storage
      .from('shared-folder')
      .list(storagePath, { 
        limit: 100, 
        order: { column: 'created_at', ascending: false } 
      });

    if (error) {
      console.error('画像取得エラー:', error.message);
      return; // エラー時は処理を抜ける
    }

    // 2. 元のコード通り、フォルダを除外してファイルのみに絞り込む
    const filesOnly = data?.filter(item => item.metadata) || [];

    if (filesOnly.length === 0) {
      setImages([]);
      return;
    }

    try {
      // 3. 絞り込んだ画像全員分の「ストレージ内のフルパス」の配列を作る
      const filePaths = filesOnly.map(item => `${storagePath}/${item.name}`);

      // 4. 5分間（300秒）有効な署名付きURLをまとめて一括発行する
      const { data: signedUrls, error: signError } = await supabase.storage
        .from('shared-folder')
        .createSignedUrls(filePaths, 300);

      if (signError) throw signError;

      // 5. 元のデータ構造に、生成した署名付きURL（displayUrl）を合体させる
      const formattedImages = filesOnly.map((item, index) => ({
        ...item,
        displayUrl: signedUrls[index]?.signedUrl 
      }));

      // 6. 最終的なデータをstateにセットする
      setImages(formattedImages);

    } catch (e) {
      console.error("画像URL一括生成エラー:", e);
    }
  }, [storagePath]);

  // ★リアルタイム監視設定
  useEffect(() => {
    fetchImages();

    // messagesテーブルを監視して、システム通知が来たら再読み込みする
    const channel = supabase
      .channel(`album_sync_${chatRoomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${chatRoomId}`
        },
        (payload) => {
          // システムメッセージ（is_system: true）なら画像を更新
          if (payload.new.is_system) {
            console.log("アルバム更新通知を受信しました");
            fetchImages();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatRoomId, fetchImages]);

  // 通知メッセージを送る関数
  const sendSystemMessage = async (text) => {
    await supabase.from('messages').insert([
      {
        room_id: chatRoomId,
        user: session.user.email,
        text: text,
        is_system: true,
      },
    ]);
  };

  // const uploadImage = async (event) => {
  //   try {
  //     setUploading(true);
  //     if (!event.target.files || event.target.files.length === 0) return;

  //     const file = event.target.files[0];
  //     const fileExt = file.name.split('.').pop();
  //     const fileName = `${Date.now()}.${fileExt}`;
  //     const filePath = `${storagePath}/${fileName}`;

  //     const { error: uploadError } = await supabase.storage
  //       .from('shared-folder')
  //       .upload(filePath, file);

  //     if (uploadError) throw uploadError;

  //     // 通知メッセージを送る（これがトリガーになって相手の画面も更新される）
  //     await sendSystemMessage("📷 アルバムに新しい写真が追加されました");
  //     fetchImages();
  //   } catch (error) {
  //     console.error('Upload error:', error);
  //     alert('アップロードに失敗しました。');
  //   } finally {
  //     setUploading(false);
  //   }
  // };
  // 💡 修正：アップロード関数の内部で画像拡張子と不正入力を徹底検証（セキュアバイデザイン）
  const uploadImage = async (event) => {
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) return;

      const file = event.target.files[0];
      
      // 🛡️ バリデーション①：拡張子の取得と安全性チェック
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      if (!fileExt) {
        alert("拡張子のないファイルはアップロードできません。");
        return;
      }

      // 許可する画像拡張子を明示的に絞り込む（安全な画像タイプのみ）
      const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
      if (!allowedExtensions.includes(fileExt)) {
        alert("許可されていないファイル形式です（JPG, JPEG, PNG, GIF, WEBP形式のみアップロード可能です）。");
        return;
      }

      // 異常に長い拡張子によるシステムバッファ溢れ等を防ぐため、拡張子の長さも制限（例: 最大10文字）
      if (fileExt.length > 10) {
        alert("ファイルフォーマットが不正です。");
        return;
      }

      // 🛡️ バリデーション②：ファイル名そのものの長さ制限（UIバグ防止、通知テキストサイズ抑制）
      if (file.name.length > 50) {
        alert("ファイル名が長すぎます（拡張子を含めて50文字以内の画像のみ共有可能です）。");
        return;
      }

      // タイムスタンプを基にした一意なファイル名を安全に構築
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${storagePath}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('shared-folder')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      await sendSystemMessage("📷 アルバムに新しい写真が追加されました");
      fetchImages();
    } catch (error) {
      console.error('Upload error:', error);
      alert('アップロードに失敗しました。');
    } finally {
      setUploading(false);
    }
  };

  const deleteImage = async (fileName) => {
    if (!window.confirm('この写真を削除してもよろしいですか？')) return;

    try {
      const fullPath = `${storagePath}/${fileName}`;
      const { data, error } = await supabase.storage
        .from('shared-folder')
        .remove([fullPath]);

      if (error) throw error;

      if (data && data.length > 0) {
        await sendSystemMessage(`🗑️ 写真が削除されました`);
        fetchImages();
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('削除に失敗しました。');
    }
  };

  // const getImageUrl = (fileName) => {
  //   const { data } = supabase.storage
  //     .from('shared-folder')
  //     .getPublicUrl(`${storagePath}/${fileName}`);
  //   return data.publicUrl;
  // };

  return (
    <div style={{ padding: '10px' }}>
      <div style={styles.uploadBox}>
        <input id="file-upload" name="image-upload" type="file" accept="image/*" onChange={uploadImage} disabled={uploading} style={{ display: 'none' }} />
        <label htmlFor="file-upload" style={{ ...styles.uploadLabel, color: uploading ? theme.colors.textSub : theme.colors.primary }}>
          {uploading ? '⌛ アップロード中...' : '📷 写真を追加する'}
        </label>
      </div>

      <div style={styles.grid}>
        {images.length === 0 ? (
          <div style={styles.emptyState}>
            <p>まだ写真がありません</p>
          </div>
        ) : (
          images.map((img) => (
            <div key={img.id} style={styles.imageWrapper}>
              {/* <img src={getImageUrl(img.name)} alt={img.name} style={styles.image} loading="lazy" /> */}
              {/* 💡 修正：安全に生成された img.displayUrl を直接 src に設定 */}
              <img src={img.displayUrl || ''} alt={img.name} style={styles.image} loading="lazy" />
              <button onClick={() => deleteImage(img.name)} style={styles.deleteBtn}>
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// --- スタイル定義 ---
const styles = {
  uploadBox: {
    marginBottom: '20px', padding: '20px',
    backgroundColor: '#f1f8ff', borderRadius: '12px',
    textAlign: 'center', border: `2px dashed ${theme.colors.primary}44` // themeの色を透過させて使用
  },
  uploadLabel: { cursor: 'pointer', fontWeight: 'bold', display: 'block' },
  grid: { 
    display: 'grid', 
    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', 
    gap: '8px' 
  },
  imageWrapper: { 
    position: 'relative', width: '100%', aspectRatio: '1/1', 
    overflow: 'hidden', borderRadius: '8px', backgroundColor: theme.colors.border 
  },
  image: { width: '100%', height: '100%', objectFit: 'cover' },
  deleteBtn: {
    position: 'absolute', top: '5px', right: '5px',
    width: '24px', height: '24px', borderRadius: '50%',
    backgroundColor: 'rgba(0,0,0,0.6)', color: 'white',
    border: 'none', cursor: 'pointer', fontSize: '16px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: '0.2s'
  },
  emptyState: { gridColumn: '1/-1', textAlign: 'center', marginTop: '40px', color: theme.colors.textSub }
};

export default SharedFolder;