import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const SharedFolder = ({ session, friendEmail }) => {
  const [uploading, setUploading] = useState(false);
  const [images, setImages] = useState([]);

  const getRoomId = useCallback(() => {
    if (!session?.user?.email || !friendEmail) return 'public';
    const sorted = [session.user.email, friendEmail].sort();
    return `${sorted[0]}-${sorted[1]}`.replace(/\./g, '_');
  }, [session, friendEmail]);

  const roomId = getRoomId();

  const fetchImages = useCallback(async () => {
    const { data, error } = await supabase
      .storage
      .from('shared-folder')
      .list(roomId, { 
        limit: 100, 
        order: { column: 'created_at', ascending: false } 
      });

    if (error) {
      console.error('画像取得エラー:', error.message);
    } else {
      const filesOnly = data?.filter(item => item.metadata) || [];
      setImages(filesOnly);
    }
  }, [roomId]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  // ★追加機能：トークルームに通知メッセージを送る
  const sendSystemMessage = async (text) => {
    const chatRoomId = [session.user.email, friendEmail].sort().join('-');
    await supabase.from('messages').insert([
      {
        room_id: chatRoomId,
        user: session.user.email,
        text: text,
        is_system: true, // ★システムメッセージとして保存
      },
    ]);
  };

  const uploadImage = async (event) => {
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) return;

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${roomId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('shared-folder')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // ★追加：通知メッセージの投稿
      await sendSystemMessage("📷 アルバムに新しい写真が追加されました");

      fetchImages();
    } catch (error) {
      console.error('Upload error:', error);
      alert('アップロードに失敗しました。');
    } finally {
      setUploading(false);
    }
  };

  // ★修正：画像の削除
  const deleteImage = async (fileName) => {
    if (!window.confirm('この写真を削除してもよろしいですか？')) return;

    try {
      const fullPath = `${roomId}/${fileName}`;
      console.log("★削除試行パス:", fullPath);

      const { data, error } = await supabase.storage
        .from('shared-folder')
        .remove([fullPath]); // 配列で渡す必要があります

      if (error) throw error;

      // dataが空配列で返ってくる場合は削除失敗（ファイルが見つからない等）
      if (data && data.length > 0) {
        console.log("★削除成功:", data);
        await sendSystemMessage(`🗑️ 写真が削除されました`);
        fetchImages();
      } else {
        console.warn("★削除対象が見つかりませんでした");
      }

    } catch (error) {
      console.error('Delete error:', error);
      alert('削除に失敗しました。');
    }
  };

  const getImageUrl = (fileName) => {
    const { data } = supabase.storage
      .from('shared-folder')
      .getPublicUrl(`${roomId}/${fileName}`);
    return data.publicUrl;
  };

  return (
    <div style={{ padding: '10px' }}>
      <div style={styles.uploadBox}>
        <input 
          type="file" accept="image/*" id="file-upload"
          onChange={uploadImage} disabled={uploading} style={{ display: 'none' }}
        />
        <label htmlFor="file-upload" style={styles.uploadLabel}>
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
              <img 
                src={getImageUrl(img.name)} 
                alt={img.name} 
                style={styles.image} 
              />
              {/* ★追加：削除ボタン */}
              <button 
                onClick={() => deleteImage(img.name)}
                style={styles.deleteBtn}
                title="削除"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const styles = {
  uploadBox: {
    marginBottom: '20px', padding: '20px',
    backgroundColor: '#f1f8ff', borderRadius: '12px',
    textAlign: 'center', border: '2px dashed #007bff44'
  },
  uploadLabel: { cursor: 'pointer', color: '#007bff', fontWeight: 'bold', display: 'block' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' },
  imageWrapper: { 
    position: 'relative', // 削除ボタン配置用
    width: '100%', aspectRatio: '1/1', 
    overflow: 'hidden', borderRadius: '8px', backgroundColor: '#eee' 
  },
  image: { width: '100%', height: '100%', objectFit: 'cover' },
  deleteBtn: {
    position: 'absolute', top: '5px', right: '5px',
    width: '24px', height: '24px', borderRadius: '50%',
    backgroundColor: 'rgba(0,0,0,0.6)', color: 'white',
    border: 'none', cursor: 'pointer', fontSize: '16px',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  emptyState: { gridColumn: '1/-1', textAlign: 'center', marginTop: '40px', color: '#888' }
};

export default SharedFolder;