import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { theme } from './theme';

const SharedDocuments = ({ session, friendEmail, roomId: propsRoomId }) => {
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState([]);

  // // ストレージの保存先フォルダ名を決定
  // const getStoragePath = useCallback(() => {
  //   if (propsRoomId) return propsRoomId; // グループならそのUUID
  //   if (!session?.user?.email || !friendEmail) return 'public';
  //   const sorted = [session.user.email, friendEmail].sort();
  //   return `${sorted[0]}-${sorted[1]}`.replace(/\./g, '_'); // 1対1用
  // }, [session, friendEmail, propsRoomId]);

  // // 通知を送る先のトークルームIDを決定
  // const getChatRoomId = useCallback(() => {
  //   if (propsRoomId) return propsRoomId; // グループチャットID
  //   const sorted = [session.user.email, friendEmail].sort();
  //   return `${sorted[0]}-${sorted[1]}`; // 1対1チャットID
  // }, [session, friendEmail, propsRoomId]);

  // const storagePath = getStoragePath();
  const storagePath = propsRoomId;
  // const chatRoomId = getChatRoomId();
  const chatRoomId = propsRoomId;

  // ファイル一覧の取得
  const fetchFiles = useCallback(async () => {
    const { data, error } = await supabase
      .storage
      .from('shared-documents')
      .list(storagePath, { 
        limit: 100, 
        order: { column: 'created_at', ascending: false } 
      });

  //   if (error) {
  //     console.error('ファイル取得エラー:', error.message);
  //   } else {
  //     const filesOnly = data?.filter(item => item.metadata) || [];
  //     setFiles(filesOnly);
  //   }
  // }, [storagePath]);

    if (error) {
      console.error('ファイル取得エラー:', error.message);
      return; // エラー時はここで処理を抜ける
    }

    // 2. 元のコード通り、メタデータがあるもの（ファイルのみ）に絞り込む
    const filesOnly = data?.filter(item => item.metadata) || [];

    if (filesOnly.length === 0) {
      setFiles([]);
      return;
    }

    try {
      // 3. ✨ 絞り込んだファイル全員分の「ストレージ内のフルパス」の配列を作る
      const filePaths = filesOnly.map(item => `${storagePath}/${item.name}`);

      // 4. ✨ 5分間（300秒）有効な署名付きURLを1回の通信でまとめて一括発行する
      const { data: signedUrls, error: signError } = await supabase.storage
        .from('shared-documents')
        .createSignedUrls(filePaths, 300);

      if (signError) throw signError;

      // 5. ✨ 元のファイルデータに、生成した署名付きURL（downloadUrl）を合体させる
      const formattedFiles = filesOnly.map((item, index) => ({
        ...item,
        // signedUrls[index].signedUrl に安全なURLが入っています
        downloadUrl: signedUrls[index]?.signedUrl 
      }));

      // 6. 最終的なデータをstateにセットする
      setFiles(formattedFiles);

    } catch (e) {
      console.error("署名付きURL一括生成エラー:", e);
    }
  }, [storagePath]);

  // ★リアルタイム監視：システムメッセージが来たら再読み込み
  useEffect(() => {
    fetchFiles();

    const channel = supabase
      .channel(`doc_sync_${chatRoomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${chatRoomId}`
        },
        (payload) => {
          // システムメッセージをトリガーに更新
          if (payload.new.is_system) {
            console.log("ドキュメント更新を検知しました");
            fetchFiles();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatRoomId, fetchFiles]);

  const sendSystemMessage = async (text) => {
    await supabase.from('messages').insert([
      { 
        room_id: chatRoomId, 
        user: session.user.email, 
        text: text, 
        is_system: true 
      },
    ]);
  };

  // アップロード
  const uploadFile = async (event) => {
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) return;

      const file = event.target.files[0];
      const fileName = `${Date.now()}_${file.name}`;
      const filePath = `${storagePath}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('shared-documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // ★通知メッセージを投稿
      await sendSystemMessage(`📄 ファイル「${file.name}」が共有されました`);
      fetchFiles();
    } catch (error) {
      console.error('Upload error:', error);
      alert('アップロードに失敗しました。');
    } finally {
      setUploading(false);
    }
  };

  // 削除
  const deleteFile = async (fileName) => {
    if (!window.confirm('このファイルを削除してもよろしいですか？')) return;
    try {
      const fullPath = `${storagePath}/${fileName}`;
      const { data, error } = await supabase.storage
        .from('shared-documents')
        .remove([fullPath]);

      if (error) throw error;
      if (data && data.length > 0) {
        // ★通知メッセージを投稿
        await sendSystemMessage(`🗑️ ファイルが削除されました`);
        fetchFiles();
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('削除に失敗しました。');
    }
  };

  const getDownloadUrl = (fileName) => {
    const { data } = supabase.storage
      .from('shared-documents')
      .getPublicUrl(`${storagePath}/${fileName}`);
    return data.publicUrl;
  };

  const formatFileName = (name) => name.includes('_') ? name.split('_').slice(1).join('_') : name;

  return (
    <div style={{ padding: '10px' }}>
      <div style={styles.uploadBox}>
        <input id="doc-upload" name="document-upload" type="file" onChange={uploadFile} disabled={uploading} style={{ display: 'none' }} />
        <label htmlFor="doc-upload" style={{ ...styles.uploadLabel, color: uploading ? theme.colors.textSub : '#28a745' }}>
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
                <a href={getDownloadUrl(file.name)} target="_blank" rel="noopener noreferrer" style={styles.fileName}>
                  {formatFileName(file.name)}
                </a>
              </div>
              <button onClick={() => deleteFile(file.name)} style={styles.deleteBtn}>
                削除
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
    marginBottom: '20px', padding: '15px', backgroundColor: '#f8f9fa', 
    borderRadius: '8px', textAlign: 'center', border: `1px solid ${theme.colors.border}` 
  },
  uploadLabel: { cursor: 'pointer', fontWeight: 'bold', display: 'block' },
  list: { display: 'flex', flexDirection: 'column', gap: '10px' },
  fileItem: { 
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', 
    backgroundColor: 'white', borderRadius: '5px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' 
  },
  fileInfo: { display: 'flex', alignItems: 'center', flex: 1, overflow: 'hidden' },
  fileName: { 
    color: theme.colors.primary, textDecoration: 'none', whiteSpace: 'nowrap', 
    overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.9rem' 
  },
  deleteBtn: { 
    marginLeft: '10px', padding: '4px 10px', backgroundColor: theme.colors.error, 
    color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' 
  },
  empty: { textAlign: 'center', color: theme.colors.textSub, marginTop: '20px', fontSize: '0.9rem' }
};

export default SharedDocuments;