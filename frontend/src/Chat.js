import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import SharedFolder from './SharedFolder';
import SharedDocuments from './SharedDocuments';
import Calendar from './Calendar';

const Chat = ({ session, friendEmail, roomId: propsRoomId, onBack }) => {
  const [subTab, setSubTab] = useState('chat');
  const [message, setMessage] = useState('');
  const [chatLog, setChatLog] = useState([]);
  const [friendDisplayName, setFriendDisplayName] = useState('');
  const [myStatus, setMyStatus] = useState('joined');
  
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [friendsList, setFriendsList] = useState([]);
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [isMemberListOpen, setIsMemberListOpen] = useState(false);
  const [members, setMembers] = useState([]);
  const [memberCount, setMemberCount] = useState(0); // 参加人数用

  const getRoomId = useCallback(() => {
    if (propsRoomId) return propsRoomId;
    if (!session?.user?.email || !friendEmail) return 'public';
    const sorted = [session.user.email, friendEmail].sort();
    return `${sorted[0]}-${sorted[1]}`;
  }, [propsRoomId, session, friendEmail]);

  const roomId = getRoomId();
  
  // useCallbackで囲むことで、依存関係のエラーを解消し、無限ループを防ぎます
  const fetchMembers = useCallback(async (shouldOpenModal = false) => {
    if (!propsRoomId) return;

    try {
      const { data, error } = await supabase
        .rpc('get_room_members', { p_room_id: propsRoomId });

      if (error) throw error;

      if (data) {
        setMembers(data);
        setMemberCount(data.length);
        // 引数が true の時だけモーダルを開くように変更
        if (shouldOpenModal) {
          setIsMemberListOpen(true);
        }
      }
    } catch (error) {
      console.error('メンバー取得エラー:', error.message);
    }
  }, [propsRoomId]); // propsRoomIdが変わった時だけ関数を再生成する
  
  useEffect(() => {
    const fetchChatInfo = async () => {
      // 1. 自分のステータス取得
      if (propsRoomId && session?.user?.id) {
        const { data: memberData } = await supabase
          .from('room_members')
          .select('status')
          .eq('room_id', propsRoomId)
          .eq('user_id', session.user.id)
          .single();
        if (memberData) setMyStatus(memberData.status);
      } else {
        setMyStatus('joined');
      }

      // 2. 表示名の決定 (Rooms.js の成功ロジックを反映)
      if (propsRoomId) {
        const { data: roomData } = await supabase
          .from('rooms')
          .select('name')
          .eq('id', propsRoomId)
          .single();

        if (roomData) {
          // '1on1' という名前なら個人チャットとして相手を探す
          if (roomData.name === '1on1') {
            // Rooms.js と同じ RPC 関数を使用してメンバーを取得
            const { data: members, error: rpcError } = await supabase
              .rpc('get_room_members', { p_room_id: propsRoomId });

            if (!rpcError && members) {
              // 自分以外のメンバーを抽出
              const opponent = members.find(u => u.user_id !== session.user.id);
              if (opponent && opponent.profiles) {
                setFriendDisplayName(opponent.profiles.display_name || opponent.profiles.email);
              } else {
                setFriendDisplayName(friendEmail || "トーク相手");
              }
            }
          } else {
            // グループチャットならそのままルーム名を表示
            setFriendDisplayName(roomData.name);
          }
        }
        fetchMembers();
      } else if (friendEmail) {
        // 連絡帳から（roomIdがない場合）のフォールバック
        const { data: prof } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('email', friendEmail)
          .single();
        if (prof) setFriendDisplayName(prof.display_name || friendEmail);
      }
    };
    fetchChatInfo();
  }, [friendEmail, propsRoomId, session, fetchMembers]);

  useEffect(() => {
    if (!session?.access_token || (!friendEmail && !propsRoomId)) return;
    supabase.realtime.setAuth(session.access_token);

    const fetchMessages = async () => {
      const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });

      if (msgError) return;

      const userEmails = [...new Set(messages.map(m => m.user))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('email, display_name')
        .in('email', userEmails);

      const enrichedMessages = messages.map(msg => ({
        ...msg,
        profiles: profiles?.find(p => p.email === msg.user)
      }));
      setChatLog(enrichedMessages);
    };

    fetchMessages();

    const channel = supabase
      .channel(roomId)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages', 
        filter: `room_id=eq.${roomId}` 
      }, (payload) => {
        setChatLog((prev) => {
          const exists = prev.find((msg) => msg.id === payload.new.id);
          if (exists) return prev;
          return [...prev, payload.new];
        });
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [session, roomId, friendEmail, propsRoomId]);

  const handleInviteResponse = async (newStatus) => {
    // --- 自分の表示名を確定させる (DBのprofilesから直接取得) ---
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', session.user.id)
      .single();
    
    // display_nameがなければメールアドレスをフォールバックにする
    const myName = myProfile?.display_name || session.user.email;

    if (newStatus === 'joined') {
      const { error } = await supabase
        .from('room_members')
        .update({ status: 'joined' })
        .eq('room_id', propsRoomId)
        .eq('user_id', session.user.id);

      if (error) {
        alert("参加処理に失敗しました: " + error.message);
        return;
      }

      // ★修正: ニックネームを使用
      await supabase.from('messages').insert([{ 
        room_id: propsRoomId, 
        user: session.user.email, 
        text: `${myName}さんが参加しました`, 
        is_system: true 
      }]);

      setMyStatus('joined');
      alert("グループに参加しました！");
    } else {
      // ...（拒否処理はそのまま）
    }
  };

  const handleLeaveGroup = async () => {
    if (!window.confirm("本当にこのグループを脱退しますか？")) return;

    // --- 脱退前に名前を取得しておく ---
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', session.user.id)
      .single();
    const myName = myProfile?.display_name || session.user.email;

    const { error } = await supabase
      .from('room_members')
      .delete()
      .eq('room_id', propsRoomId)
      .eq('user_id', session.user.id);
    
    if (!error) {
      // ★修正: ニックネームを使用
      await supabase.from('messages').insert([{ 
        room_id: propsRoomId, 
        user: session.user.email, 
        text: `${myName}さんが脱退しました`, 
        is_system: true 
      }]);
      onBack();
    }
  };

  const openInviteModal = async () => {
    const { data: friendRows } = await supabase
      .from('friends')
      .select('friend_email')
      .eq('user_id', session.user.id);

    if (!friendRows || friendRows.length === 0) {
      alert("招待できる友達がいません。");
      return;
    }

    const friendEmails = friendRows.map(f => f.friend_email);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .in('email', friendEmails);

    setFriendsList(profiles || []);
    setIsInviteModalOpen(true);
  };

  const executeInvite = async () => {
    if (selectedFriends.length === 0) return;
    const inserts = selectedFriends.map(friendId => ({
      room_id: propsRoomId,
      user_id: friendId,
      status: 'pending'
    }));

    const { error } = await supabase.from('room_members').insert(inserts);

    if (error) {
      alert("既に招待済みのユーザーが含まれているか、エラーが発生しました。");
    } else {
      alert(`${selectedFriends.length}名を招待しました！`);
      setIsInviteModalOpen(false);
      setSelectedFriends([]);
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || !session?.user || myStatus !== 'joined') return;
    const { error } = await supabase.from('messages').insert([{ 
      text: message, 
      user: session.user.email, 
      room_id: roomId 
    }]);
    if (!error) setMessage('');
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // 1. ファイル名の準備（重複を避けるためにランダムな値を付加）
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${roomId}/${fileName}`;

    try {
      // 2. Storage（chat-attachmentsバケット）へアップロード
      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 3. 公開URLを取得
      const { data: { publicUrl } } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(filePath);

      // 4. ファイルの種類を判定
      const type = file.type.startsWith('image/') ? 'image' : 'document';

      // 5. messagesテーブルにインサート
      const { error: insertError } = await supabase
        .from('messages')
        .insert([{
          room_id: roomId,
          user: session.user.email,
          text: file.name, // プレビュー用にファイル名を入れる
          file_url: publicUrl,
          file_type: type,
          is_system: false
        }]);

      if (insertError) throw insertError;

    } catch (error) {
      console.error('Error uploading file:', error.message);
      alert('アップロード中にエラーが発生しました。');
    }
  };

  const subTabButtonStyle = (isActive) => ({
    flex: 1, padding: '10px 0', cursor: 'pointer', border: 'none', background: 'none',
    fontSize: '0.85rem', color: isActive ? '#007bff' : '#888',
    borderBottom: isActive ? '2px solid #007bff' : '2px solid transparent',
    transition: '0.2s', fontWeight: isActive ? 'bold' : 'normal'
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 15px', borderBottom: '1px solid #eee', backgroundColor: '#fff' }}>
        {/* 戻るボタン */}
        <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', marginRight: '10px' }}>←</button>
        
        {/* グループ名と人数 */}
        <div style={{ flex: 1 }}>
          <div 
            style={{ fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }} 
            onClick={() => fetchMembers(true)}
          >
            <span>{friendDisplayName || friendEmail}</span>
            {memberCount > 0 && (
              <span style={{ fontSize: '0.85rem', color: '#666', fontWeight: 'normal' }}>
                ({memberCount})
              </span>
            )}
          </div>
        </div>

        {/* 招待・脱退ボタン（条件に合致する場合のみ表示） */}
        {propsRoomId && myStatus === 'joined' && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={openInviteModal} style={styles.headerBtn}>＋招待</button>
            <button onClick={handleLeaveGroup} style={{...styles.headerBtn, color: '#dc3545'}}>脱退</button>
          </div>
        )}
      </div>

      {isMemberListOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={{ fontSize: '1rem', marginBottom: '15px' }}>メンバー一覧</h3>
            <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
              {members.map((m, i) => (
                <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{m.profiles?.display_name || m.profiles?.email}</span>
                  <span style={{ fontSize: '0.7rem', color: m.status === 'joined' ? 'green' : 'orange' }}>
                    {m.status === 'joined' ? '参加中' : '招待中'}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={() => setIsMemberListOpen(false)} style={{ ...styles.cancelBtn, marginTop: '15px', width: '100%' }}>閉じる</button>
          </div>
        </div>
      )}

      {isInviteModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={{ fontSize: '1rem', marginBottom: '15px' }}>友達を一括招待</h3>
            <div style={{ maxHeight: '250px', overflowY: 'auto', marginBottom: '15px', textAlign: 'left' }}>
              {friendsList.map(friend => (
                <label key={friend.id} style={styles.friendItem}>
                  <input 
                    id={`invite-check-${friend.id}`} // ループ内なのでユニークなIDを付与
                    name="invite-friend"
                    type="checkbox" 
                    checked={selectedFriends.includes(friend.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedFriends([...selectedFriends, friend.id]);
                      else setSelectedFriends(selectedFriends.filter(id => id !== friend.id));
                    }}
                  />
                  <span style={{ marginLeft: '10px', fontSize: '0.9rem' }}>{friend.display_name || friend.email}</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={executeInvite} style={styles.inviteSubmitBtn} disabled={!selectedFriends.length}>招待を送る</button>
              <button onClick={() => {setIsInviteModalOpen(false); setSelectedFriends([]);}} style={styles.cancelBtn}>中止</button>
            </div>
          </div>
        </div>
      )}

      {myStatus === 'pending' && (
        <div style={{ backgroundColor: '#fff9db', padding: '15px', textAlign: 'center', borderBottom: '1px solid #ffe066' }}>
          <p style={{ fontSize: '0.85rem', margin: '0 0 10px 0', color: '#856404' }}>
            このグループに招待されています。
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button onClick={() => handleInviteResponse('joined')} style={{ backgroundColor: '#28a745', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}>参加する</button>
            <button onClick={() => handleInviteResponse('rejected')} style={{ backgroundColor: '#dc3545', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}>拒否する</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', backgroundColor: '#fff', borderBottom: '1px solid #eee' }}>
        <button onClick={() => setSubTab('chat')} style={subTabButtonStyle(subTab === 'chat')}>トーク</button>
        {myStatus === 'joined' && (
          <>
            <button onClick={() => setSubTab('calendar')} style={subTabButtonStyle(subTab === 'calendar')}>カレンダー</button>
            <button onClick={() => setSubTab('album')} style={subTabButtonStyle(subTab === 'album')}>アルバム</button>
            <button onClick={() => setSubTab('files')} style={subTabButtonStyle(subTab === 'files')}>ファイル</button>
          </>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {subTab === 'chat' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#f0f2f5', padding: '15px' }}>
              {chatLog.map((msg, i) => {
                if (msg.is_system) {
                  return (
                    <div key={msg.id || i} style={{ textAlign: 'center', margin: '15px 0' }}>
                      <span style={{ backgroundColor: '#d1d5db', color: '#4b5563', padding: '3px 12px', borderRadius: '12px', fontSize: '0.7rem' }}>{msg.text}</span>
                    </div>
                  );
                }
                const isMe = msg.user === session.user.email;
                const senderName = msg.profiles?.display_name || msg.user;
                return (
                  <div key={msg.id || i} style={{ textAlign: isMe ? 'right' : 'left', marginBottom: '15px' }}>
                    {!isMe && <div style={{ fontSize: '0.65rem', color: '#888', marginLeft: '5px', marginBottom: '2px' }}>{senderName}</div>}
                    <div style={{ 
                      display: 'inline-block', padding: '8px 14px', borderRadius: '18px', 
                      backgroundColor: isMe ? '#007bff' : '#fff', color: isMe ? 'white' : 'black',
                      maxWidth: '80%', textAlign: 'left', boxShadow: isMe ? 'none' : '0 1px 2px rgba(0,0,0,0.1)'
                    }}>
                      {msg.file_url ? (
                        msg.file_type === 'image' ? (
                          // 画像の場合
                          <a href={msg.file_url} target="_blank" rel="noopener noreferrer">
                            <img 
                              src={msg.file_url} 
                              alt="uploaded" 
                              style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px', cursor: 'pointer', display: 'block' }} 
                            />
                          </a>
                        ) : (
                          // ドキュメントの場合
                          <a href={msg.file_url} target="_blank" rel="noopener noreferrer" style={{ color: isMe ? 'white' : '#007bff', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span>📄</span>
                            <span style={{ fontSize: '0.9rem' }}>{msg.text}</span>
                          </a>
                        )
                      ) : (
                        // 通常のテキストメッセージ（既存の表示）
                        <span>{msg.text}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {myStatus === 'joined' ? (
              <div style={{ padding: '10px', backgroundColor: '#fff', borderTop: '1px solid #eee', display: 'flex', gap: '10px' }}>
                {/* 📎 クリップボタン（実際のinputは隠してlabelで叩く） */}
                <label htmlFor="file-upload" style={{ cursor: 'pointer', padding: '0 10px', fontSize: '1.4rem' }}>
                  📎
                </label>
                <input 
                  id="file-upload" 
                  type="file" 
                  style={{ display: 'none' }} 
                  onChange={handleFileUpload} 
                />
                <input
                  id="chat-message"
                  name="message"
                  autoComplete="off"
                  style={{ flex: 1, padding: '10px', borderRadius: '20px', border: '1px solid #ddd', outline: 'none' }}
                  placeholder="メッセージを入力"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => { if (!e.nativeEvent.isComposing && e.key === 'Enter') sendMessage(); }}
                />
                <button onClick={sendMessage} style={{ backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer' }}>▲</button>
              </div>
            ) : (
              <div style={{ padding: '15px', textAlign: 'center', color: '#888', fontSize: '0.8rem', backgroundColor: '#eee' }}>
                参加するとメッセージを送信できるようになります
              </div>
            )}
          </div>
        )}
        {myStatus === 'joined' && (
          <>
            {subTab === 'calendar' && <Calendar session={session} roomId={roomId} />}
            {subTab === 'album' && <SharedFolder session={session} friendEmail={friendEmail} roomId={roomId} />}
            {subTab === 'files' && <SharedDocuments session={session} friendEmail={friendEmail} roomId={roomId} />}
          </>
        )}
      </div>
    </div>
  );
};

const styles = {
  headerBtn: { padding: '5px 10px', fontSize: '0.75rem', backgroundColor: '#f8f9fa', border: '1px solid #ddd', borderRadius: '5px', cursor: 'pointer' },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#fff', padding: '20px', borderRadius: '10px', width: '85%', maxWidth: '300px', textAlign: 'center' },
  friendItem: { display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #eee', cursor: 'pointer' },
  inviteSubmitBtn: { flex: 1, backgroundColor: '#007bff', color: '#fff', border: 'none', padding: '10px', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' },
  cancelBtn: { flex: 1, backgroundColor: '#6c757d', color: '#fff', border: 'none', padding: '10px', borderRadius: '5px', cursor: 'pointer' },
};

export default Chat;