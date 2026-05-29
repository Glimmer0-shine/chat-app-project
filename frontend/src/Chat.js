import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import SharedFolder from './SharedFolder';
import SharedDocuments from './SharedDocuments';
import Calendar from './Calendar';
import { theme, commonStyles } from './theme';

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
      // ルームIDがない場合は処理を中断（ガード句）
      if (!propsRoomId) {
        // roomIdがないがfriendEmailがある場合（連絡帳からの初回遷移など）のフォールバック
        if (friendEmail) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('email', friendEmail)
            .single();
          if (prof) setFriendDisplayName(prof.display_name || friendEmail);
        }
        return;
      }

      // 1. 自分のステータス取得
      if (session?.user?.id) {
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

      // 2. 表示名の決定 (is_group カラムによる判定)
      const { data: roomData } = await supabase
        .from('rooms')
        .select('name, is_group') // is_groupを取得
        .eq('id', propsRoomId)
        .single();

      if (roomData) {
        // is_group が false (個人チャット) の場合
        if (roomData.is_group === false) {
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
          // グループチャット (is_group === true) の場合はルーム名をそのまま表示
          setFriendDisplayName(roomData.name);
        }
      }
      
      // 最後にメンバー一覧を更新
      fetchMembers();
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

  // const executeInvite = async () => {
  //   if (selectedFriends.length === 0) return;
  //   const inserts = selectedFriends.map(friendId => ({
  //     room_id: propsRoomId,
  //     user_id: friendId,
  //     status: 'pending'
  //   }));

  //   const { error } = await supabase.from('room_members').insert(inserts);

  //   if (error) {
  //     alert("既に招待済みのユーザーが含まれているか、エラーが発生しました。");
  //   } else {
  //     alert(`${selectedFriends.length}名を招待しました！`);
  //     setIsInviteModalOpen(false);
  //     setSelectedFriends([]);
  //   }
  // };

  const executeInvite = async () => {
    if (selectedFriends.length === 0) return;
    
    try {
      // 1. 招待メンバーを登録
      const inserts = selectedFriends.map(friendId => ({
        room_id: propsRoomId,
        user_id: friendId,
        status: 'pending'
      }));

      const { error: inviteError } = await supabase.from('room_members').insert(inserts);
      if (inviteError) throw inviteError;

      // 2. 現在の合計人数をチェック（現在のメンバー + 新しく招待した人数）
      // memberCount は現在の人数
      if (memberCount + selectedFriends.length >= 3) {
        // 3人以上になるならグループに昇格
        // pair_key を null にすることで、1対1ルームとしての「刻印」を消す
        const { error: updateError } = await supabase
          .from('rooms')
          .update({ 
            is_group: true, 
            pair_key: null,
            name: 'グループチャット' // 1on1 や 個人チャット という名前なら汎用的な名前に変更
          })
          .eq('id', propsRoomId)
          // すでにグループなら更新不要だが、1対1の時だけ更新されるように
          .eq('is_group', false); 
        
        if (updateError) console.error("グループ昇格エラー:", updateError.message);
      }

      alert(`${selectedFriends.length}名を招待しました！`);
      setIsInviteModalOpen(false);
      setSelectedFriends([]);
      fetchMembers(); // メンバー一覧を更新
    } catch (error) {
      console.error(error);
      alert("招待に失敗しました。");
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

  // --- 4. スタイルヘルパー (isActiveを使うためここへ) ---
  const subTabButtonStyle = (isActive) => ({
    flex: 1, padding: '10px 0', cursor: 'pointer', border: 'none', background: 'none',
    fontSize: '0.85rem', color: isActive ? theme.colors.primary : theme.colors.textSub,
    borderBottom: isActive ? `2px solid ${theme.colors.primary}` : '2px solid transparent',
    transition: '0.2s', fontWeight: isActive ? 'bold' : 'normal'
  });

  // --- 5. JSX部分 ---
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <header style={styles.header}>
        <button onClick={onBack} style={styles.backBtn}>←</button>
        <div style={{ flex: 1 }}>
          <div style={styles.titleContainer} onClick={() => fetchMembers(true)}>
            <span>{friendDisplayName || friendEmail}</span>
            {memberCount > 0 && <span style={styles.countText}>({memberCount})</span>}
          </div>
        </div>
        {propsRoomId && myStatus === 'joined' && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={openInviteModal} style={styles.headerBtn}>＋招待</button>
            <button onClick={handleLeaveGroup} style={{...styles.headerBtn, color: theme.colors.error}}>脱退</button>
          </div>
        )}
      </header>

      {/* メンバー一覧モーダル */}
      {isMemberListOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={styles.modalTitle}>メンバー一覧</h3>
            <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
              {members.map((m, i) => (
                <div key={i} style={styles.memberRow}>
                  <span>{m.profiles?.display_name || m.profiles?.email}</span>
                  <span style={{ fontSize: '0.7rem', color: m.status === 'joined' ? 'green' : 'orange' }}>
                    {m.status === 'joined' ? '参加中' : '招待中'}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={() => setIsMemberListOpen(false)} style={styles.modalCloseBtn}>閉じる</button>
          </div>
        </div>
      )}

      {/* 招待モーダル */}
      {isInviteModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={styles.modalTitle}>友達を一括招待</h3>
            <div style={{ maxHeight: '250px', overflowY: 'auto', marginBottom: '15px', textAlign: 'left' }}>
              {friendsList.map(friend => (
                <label key={friend.id} style={styles.friendItem}>
                  <input id={`invite-check-${friend.id}`} name="invite-friend" type="checkbox" checked={selectedFriends.includes(friend.id)}
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
              <button onClick={executeInvite} style={{...commonStyles.button, flex: 1}} disabled={!selectedFriends.length}>招待を送る</button>
              <button onClick={() => {setIsInviteModalOpen(false); setSelectedFriends([]);}} style={{...styles.cancelBtn, flex: 1}}>中止</button>
            </div>
          </div>
        </div>
      )}

      {/* 招待バナー */}
      {myStatus === 'pending' && (
        <div style={styles.inviteBanner}>
          <p style={{ fontSize: '0.85rem', margin: '0 0 10px 0', color: '#856404' }}>グループに招待されています。</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button onClick={() => handleInviteResponse('joined')} style={styles.joinBtn}>参加する</button>
            <button onClick={() => handleInviteResponse('rejected')} style={styles.rejectBtn}>拒否する</button>
          </div>
        </div>
      )}

      {/* サブタブ */}
      <div style={{ display: 'flex', backgroundColor: '#fff', borderBottom: `1px solid ${theme.colors.border}` }}>
        <button onClick={() => setSubTab('chat')} style={subTabButtonStyle(subTab === 'chat')}>トーク</button>
        {myStatus === 'joined' && (
          <>
            <button onClick={() => setSubTab('calendar')} style={subTabButtonStyle(subTab === 'calendar')}>カレンダー</button>
            <button onClick={() => setSubTab('album')} style={subTabButtonStyle(subTab === 'album')}>アルバム</button>
            <button onClick={() => setSubTab('files')} style={subTabButtonStyle(subTab === 'files')}>ファイル</button>
          </>
        )}
      </div>

      {/* コンテンツエリア */}
      <div style={{ flex: 1, overflowY: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {subTab === 'chat' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={styles.chatArea}>
              {chatLog.map((msg, i) => {
                if (msg.is_system) {
                  return (
                    <div key={msg.id || i} style={styles.systemMsgContainer}>
                      <span style={styles.systemMsgBadge}>{msg.text}</span>
                    </div>
                  );
                }
                const isMe = msg.user === session.user.email;
                return (
                  <div key={msg.id || i} style={{ textAlign: isMe ? 'right' : 'left', marginBottom: '15px' }}>
                    {!isMe && <div style={styles.senderName}>{msg.profiles?.display_name || msg.user}</div>}
                    <div style={{ 
                      ...styles.bubble, 
                      backgroundColor: isMe ? theme.colors.primary : '#fff', 
                      color: isMe ? 'white' : 'black',
                      boxShadow: isMe ? 'none' : '0 1px 2px rgba(0,0,0,0.1)'
                    }}>
                      {msg.file_url ? (
                        msg.file_type === 'image' ? (
                          <a href={msg.file_url} target="_blank" rel="noopener noreferrer">
                            <img src={msg.file_url} alt="uploaded" style={styles.attachedImg} />
                          </a>
                        ) : (
                          <a href={msg.file_url} target="_blank" rel="noopener noreferrer" style={{ color: isMe ? 'white' : theme.colors.primary, textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <span>📄</span><span style={{ fontSize: '0.9rem' }}>{msg.text}</span>
                          </a>
                        )
                      ) : (
                        <span>{msg.text}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* メッセージ入力 */}
            {myStatus === 'joined' ? (
              <div style={styles.inputArea}>
                <label htmlFor="file-upload" style={styles.clipBtn}>📎</label>
                <input id="file-upload" type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
                <input id="chat-message" name="message" autoComplete="off" style={styles.chatInput} placeholder="メッセージを入力"
                  value={message} onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => { if (!e.nativeEvent.isComposing && e.key === 'Enter') sendMessage(); }}
                />
                <button onClick={sendMessage} style={styles.sendBtn}>▲</button>
              </div>
            ) : (
              <div style={styles.lockedInputArea}>参加するとメッセージを送信できるようになります</div>
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

// --- 6. スタイル定義 ---
const styles = {
  header: { display: 'flex', alignItems: 'center', padding: '10px 15px', borderBottom: `1px solid ${theme.colors.border}`, backgroundColor: '#fff' },
  backBtn: { background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', marginRight: '10px' },
  titleContainer: { fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' },
  countText: { fontSize: '0.85rem', color: theme.colors.textSub, fontWeight: 'normal' },
  headerBtn: { padding: '5px 10px', fontSize: '0.75rem', backgroundColor: '#f8f9fa', border: `1px solid ${theme.colors.border}`, borderRadius: '5px', cursor: 'pointer' },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#fff', padding: '20px', borderRadius: '10px', width: '85%', maxWidth: '300px', textAlign: 'center' },
  modalTitle: { fontSize: '1rem', marginBottom: '15px' },
  memberRow: { padding: '8px 0', borderBottom: `1px solid ${theme.colors.border}`, display: 'flex', justifyContent: 'space-between' },
  modalCloseBtn: { ...commonStyles.button, marginTop: '15px', width: '100%', backgroundColor: '#6c757d' },
  friendItem: { display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${theme.colors.border}`, cursor: 'pointer' },
  cancelBtn: { backgroundColor: '#6c757d', color: '#fff', border: 'none', padding: '10px', borderRadius: '5px', cursor: 'pointer' },
  inviteBanner: { backgroundColor: '#fff9db', padding: '15px', textAlign: 'center', borderBottom: '1px solid #ffe066' },
  joinBtn: { backgroundColor: '#28a745', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' },
  rejectBtn: { backgroundColor: theme.colors.error, color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' },
  chatArea: { flex: 1, overflowY: 'auto', backgroundColor: '#f0f2f5', padding: '15px' },
  systemMsgContainer: { textAlign: 'center', margin: '15px 0' },
  systemMsgBadge: { backgroundColor: '#d1d5db', color: '#4b5563', padding: '3px 12px', borderRadius: '12px', fontSize: '0.7rem' },
  senderName: { fontSize: '0.65rem', color: '#888', marginLeft: '5px', marginBottom: '2px' },
  bubble: { display: 'inline-block', padding: '8px 14px', borderRadius: '18px', maxWidth: '80%', textAlign: 'left' },
  attachedImg: { maxWidth: '100%', maxHeight: '200px', borderRadius: '8px', cursor: 'pointer', display: 'block' },
  inputArea: { padding: '10px', backgroundColor: '#fff', borderTop: `1px solid ${theme.colors.border}`, display: 'flex', gap: '10px', alignItems: 'center' },
  clipBtn: { cursor: 'pointer', padding: '0 5px', fontSize: '1.4rem' },
  chatInput: { flex: 1, padding: '10px', borderRadius: '20px', border: `1px solid ${theme.colors.border}`, outline: 'none' },
  sendBtn: { backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer' },
  lockedInputArea: { padding: '15px', textAlign: 'center', color: theme.colors.textSub, fontSize: '0.8rem', backgroundColor: '#eee' }
};

export default Chat;