import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

const SharedDocuments = ({ session, friendEmail }) => {
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState([]);

  const getRoomId = useCallback(() => {
    if (!session?.user?.email || !friendEmail) return 'public';
    const sorted = [session.user.email, friendEmail].sort();
    return `${sorted[0]}-${sorted[1]}`.replace(/\./g, '_');
  }, [session, friendEmail]);

  const roomId = getRoomId();

  // ファイル一覧の取得
  const fetchFiles = useCallback(async () => {
    const { data, error } = await supabase
      .storage
      .from('shared-documents')
      .list(roomId, { 
        limit: 100, 
        order: { column: 'created_at', ascending: false } 
      });

    if (error) {
      console.error('ファイル取得エラー:', error.message);
    } else {
      const filesOnly = data?.filter(item => item.metadata) || [];
      setFiles(filesOnly);
    }
  }, [roomId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const sendSystemMessage = async (text) => {
    const chatRoomId = [session.user.email, friendEmail].sort().join('-');
    await supabase.from('messages').insert([
      { room_id: chatRoomId, user: session.user.email, text: text, is_system: true },
    ]);
  };

  // アップロード
  const uploadFile = async (event) => {
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) return;

      const file = event.target.files[0];
      const fileName = `${Date.now()}_${file.name}`; // ファイル名を保持
      const filePath = `${roomId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('shared-documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      await sendSystemMessage(`📄 ファイル「${file.name}」が共有されました`);
      fetchFiles();
    } catch (error) {
      alert('アップロードに失敗しました。');
    } finally {
      setUploading(false);
    }
  };

  // 削除
  const deleteFile = async (fileName) => {
    if (!window.confirm('このファイルを削除してもよろしいですか？')) return;
    try {
      const fullPath = `${roomId}/${fileName}`;
      const { data, error } = await supabase.storage
        .from('shared-documents')
        .remove([fullPath]);

      if (error) throw error;
      if (data && data.length > 0) {
        await sendSystemMessage(`🗑️ ファイルが削除されました`);
        fetchFiles();
      }
    } catch (error) {
      alert('削除に失敗しました。');
    }
  };

  // ダウンロードURL取得
  const getDownloadUrl = (fileName) => {
    const { data } = supabase.storage
      .from('shared-documents')
      .getPublicUrl(`${roomId}/${fileName}`);
    return data.publicUrl;
  };

  return (
    <div style={{ padding: '10px' }}>
      <div style={styles.uploadBox}>
        <input type="file" id="doc-upload" onChange={uploadFile} disabled={uploading} style={{ display: 'none' }} />
        <label htmlFor="doc-upload" style={styles.uploadLabel}>
          {uploading ? '⌛ アップロード中...' : '➕ ファイルを共有する'}
        </label>
      </div>

      <div style={styles.list}>
        {files.length === 0 ? (
          <p style={styles.empty}>共有されたファイルはありません</p>
        ) : (
          files.map((file) => (
            <div key={file.id} style={styles.fileItem}>
              <div style={styles.fileInfo}>
                <span style={{ marginRight: '10px' }}>📄</span>
                <a 
                  href={getDownloadUrl(file.name)} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  style={styles.fileName}
                >
                  {file.name.split('_').slice(1).join('_')} {/* タイムスタンプ部分を除去して表示 */}
                </a>
              </div>
              <button onClick={() => deleteFile(file.name)} style={styles.deleteBtn}>削除</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const styles = {
  uploadBox: { marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', textAlign: 'center', border: '1px solid #ddd' },
  uploadLabel: { cursor: 'pointer', color: '#28a745', fontWeight: 'bold' },
  list: { display: 'flex', flexDirection: 'column', gap: '10px' },
  fileItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', backgroundColor: 'white', borderRadius: '5px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  fileInfo: { display: 'flex', alignItems: 'center', flex: 1, overflow: 'hidden' },
  fileName: { color: '#007bff', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  deleteBtn: { marginLeft: '10px', padding: '4px 8px', backgroundColor: '#ff4d4f', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' },
  empty: { textAlign: 'center', color: '#999', marginTop: '20px' }
};

export default SharedDocuments;