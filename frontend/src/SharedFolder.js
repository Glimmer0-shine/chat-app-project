import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const SharedFolder = ({ session, friendEmail }) => {
  const [uploading, setUploading] = useState(false);
  const [images, setImages] = useState([]);

  // 1. ルームIDの生成（ドットをアンダースコアに置換して安全なパスにする）
  const getRoomId = useCallback(() => {
    if (!session?.user?.email || !friendEmail) return 'public';
    const sorted = [session.user.email, friendEmail].sort();
    return `${sorted[0]}-${sorted[1]}`.replace(/\./g, '_');
  }, [session, friendEmail]);

  const roomId = getRoomId();

  // 2. 画像一覧の取得
  const fetchImages = useCallback(async () => {
    // roomIdというフォルダの中身をリストアップ
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
      // metadataが存在するものだけを「ファイル」として認識（フォルダを除外）
      const filesOnly = data?.filter(item => item.metadata) || [];
      setImages(filesOnly);
    }
  }, [roomId]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  // 3. 画像のアップロード
  const uploadImage = async (event) => {
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) return;

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`; // 重複防止
      const filePath = `${roomId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('shared-folder')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 完了したら一覧を再取得
      fetchImages();
    } catch (error) {
      console.error('Upload error:', error);
      alert('アップロードに失敗しました。');
    } finally {
      setUploading(false);
    }
  };

  // 4. 公開URLの生成
  const getImageUrl = (fileName) => {
    const { data } = supabase.storage
      .from('shared-folder')
      .getPublicUrl(`${roomId}/${fileName}`);
    return data.publicUrl;
  };

  return (
    <div style={{ padding: '10px' }}>
      {/* アップロードエリア */}
      <div style={styles.uploadBox}>
        <input 
          type="file" 
          accept="image/*" 
          id="file-upload"
          onChange={uploadImage} 
          disabled={uploading} 
          style={{ display: 'none' }}
        />
        <label htmlFor="file-upload" style={styles.uploadLabel}>
          {uploading ? '⌛ アップロード中...' : '📷 写真を追加する'}
        </label>
      </div>

      {/* アルバムグリッド */}
      <div style={styles.grid}>
        {images.length === 0 ? (
          <div style={styles.emptyState}>
            <p>まだ写真がありません</p>
            <p style={{ fontSize: '0.8rem', color: '#999' }}>大切な思い出を共有しましょう！</p>
          </div>
        ) : (
          images.map((img) => (
            <div key={img.id} style={styles.imageWrapper}>
              <img 
                src={getImageUrl(img.name)} 
                alt={img.name} 
                style={styles.image} 
                // 読み込みに失敗した場合のハンドリング
                onError={(e) => { e.target.src = 'https://via.placeholder.com/150?text=Error'; }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// スタイル定義をまとめて管理（コードがスッキリします）
const styles = {
  uploadBox: {
    marginBottom: '20px',
    padding: '20px',
    backgroundColor: '#f1f8ff',
    borderRadius: '12px',
    textAlign: 'center',
    border: '2px dashed #007bff44'
  },
  uploadLabel: {
    cursor: 'pointer',
    color: '#007bff',
    fontWeight: 'bold',
    display: 'block'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
    gap: '8px'
  },
  imageWrapper: {
    width: '100%',
    aspectRatio: '1/1',
    overflow: 'hidden',
    borderRadius: '8px',
    backgroundColor: '#eee'
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'transform 0.2s'
  },
  emptyState: {
    gridColumn: '1/-1',
    textAlign: 'center',
    marginTop: '40px',
    color: '#888'
  }
};

export default SharedFolder;