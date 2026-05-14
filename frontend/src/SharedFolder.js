import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

// roomId (グループ用) を追加で受け取れるように変更
const SharedFolder = ({ session, friendEmail, roomId: propsRoomId }) => {
  const [uploading, setUploading] = useState(false);
  const [images, setImages] = useState([]);

  // ストレージの保存先パス（フォルダ名）を決定
  const getStoragePath = useCallback(() => {
    if (propsRoomId) return propsRoomId; // グループならそのID
    if (!session?.user?.email || !friendEmail) return 'public';
    const sorted = [session.user.email, friendEmail].sort();
    return `${sorted[0]}-${sorted[1]}`.replace(/\./g, '_');
  }, [session, friendEmail, propsRoomId]);

  // 通知を送る先のトークルームIDを決定
  const getChatRoomId = useCallback(() => {
    if (propsRoomId) return propsRoomId; // グループならそのID
    const sorted = [session.user.email, friendEmail].sort();
    return `${sorted[0]}-${sorted[1]}`;
  }, [session, friendEmail, propsRoomId]);

  const storagePath = getStoragePath();
  const chatRoomId = getChatRoomId();

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
    } else {
      // フォルダを除外してファイルのみセット
      const filesOnly = data?.filter(item => item.metadata) || [];
      setImages(filesOnly);
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

  const uploadImage = async (event) => {
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) return;

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${storagePath}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('shared-folder')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 通知メッセージを送る（これがトリガーになって相手の画面も更新される）
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

  const getImageUrl = (fileName) => {
    const { data } = supabase.storage
      .from('shared-folder')
      .getPublicUrl(`${storagePath}/${fileName}`);
    return data.publicUrl;
  };

  return (
    <div style={{ padding: '10px' }}>
      <div style={styles.uploadBox}>
        <input 
           id="file-upload" name="image-upload" type="file" accept="image/*"
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
              <button 
                onClick={() => deleteImage(img.name)}
                style={styles.deleteBtn}
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
    position: 'relative', width: '100%', aspectRatio: '1/1', 
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