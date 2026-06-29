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
  const [memberCount, setMemberCount] = useState(0); 

  // 【ステート定義】友達状態、ブロック状態、グループ判別フラグ
  const [isFriend, setIsFriend] = useState(true);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isGroupRoom, setIsGroupRoom] = useState(false);

  // 💡 追加：ヘッダー（左上）に表示する現在のルームアイコンURL
  const [headerAvatarUrl, setHeaderAvatarUrl] = useState('');

  // 💡 共通処理：アバターパスから署名付きURLを1件取得するヘルパー
  const getSingleSignedUrl = async (path) => {
    if (!path) return '';
    try {
      const { data, error } = await supabase.storage
        .from('avatars')
        .createSignedUrl(path, 300);
      if (!error && data) return data.signedUrl;
    } catch (e) {
      console.error(e);
    }
    return '';
  };

  // 💡 修正：メンバー一覧とそれぞれの署名付きアバターURLを取得する
  const fetchMembers = useCallback(async (shouldOpenModal = false) => {
    if (!propsRoomId) return;

    try {
      const { data, error } = await supabase
        .rpc('get_room_members', { p_room_id: propsRoomId });

      if (error) throw error;

      if (data) {
        // ✨ 各メンバーのアバターの署名付きURLを非同期で並列取得
        const enrichedMembers = await Promise.all(data.map(async (m) => {
          let signedUrl = '';
          if (m.profiles?.avatar_url) {
            signedUrl = await getSingleSignedUrl(m.profiles.avatar_url);
          }
          return {
            ...m,
            avatarSignedUrl: signedUrl
          };
        }));

        setMembers(enrichedMembers);
        setMemberCount(enrichedMembers.length);

        // 💡 グループではない（1対1チャット）場合、相手のアバターをヘッダー画像に設定
        const isGroup = isGroupRoom; 
        if (!isGroup && session?.user?.id) {
          const opponent = enrichedMembers.find(u => u.user_id !== session.user.id);
          if (opponent?.avatarSignedUrl) {
            setHeaderAvatarUrl(opponent.avatarSignedUrl);
          }
        }

        if (shouldOpenModal) {
          setIsMemberListOpen(true);
        }
      }
    } catch (error) {
      console.error('メンバー取得エラー:', error.message);
    }
  }, [propsRoomId, isGroupRoom, session?.user?.id]);
  
  useEffect(() => {
    const fetchChatInfo = async () => {
      if (!propsRoomId) {
        if (friendEmail) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('email', friendEmail)
            .single();
          if (prof) {
            setFriendDisplayName(prof.display_name || friendEmail);
            if (prof.avatar_url) {
              const url = await getSingleSignedUrl(prof.avatar_url);
              setHeaderAvatarUrl(url);
            }
          }
        }
        return;
      }

      if (session?.user?.id) {
        const { data: memberData } = await supabase
          .from('room_members')
          .select('status')
          .eq('room_id', propsRoomId)
          .eq('user_id', session.user.id)
          .single();
        if (memberData) setMyStatus(memberData.status);
      } else {
        alert('このチャットに参加するにはログインが必要です。');
        return;
      }

      const { data: roomData } = await supabase
        .from('room_members')
        .select('rooms ( name, is_group )')
        .eq('room_id', propsRoomId)
        .eq('user_id', session.user.id)
        .single();

      if (roomData && roomData.rooms) { 
        const isGroup = roomData.rooms.is_group;
        setIsGroupRoom(isGroup); 

        if (isGroup === false) {
          const { data: members, error: rpcError } = await supabase
            .rpc('get_room_members', { p_room_id: propsRoomId });

          let foundName = '';

          if (!rpcError && members) {
            const opponent = members.find(u => u.user_id !== session.user.id);

            if (opponent && opponent.profiles) {
              const prof = typeof opponent.profiles === 'string' ? JSON.parse(opponent.profiles) : opponent.profiles;
              foundName = prof.display_name;
            }
          }

          if (!foundName && friendEmail) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('display_name')
              .eq('email', friendEmail)
              .maybeSingle();
            if (prof) foundName = prof.display_name;
          }

          setFriendDisplayName(foundName || friendEmail || "トーク相手");

          if (friendEmail) {
            const { data: friendData } = await supabase
              .from('friends')
              .select('is_blocked')
              .eq('user_id', session.user.id)
              .eq('friend_email', friendEmail)
              .maybeSingle();

            if (friendData) {
              setIsFriend(!friendData.is_blocked);
              setIsBlocked(!!friendData.is_blocked);
            } else {
              setIsFriend(false);
              setIsBlocked(false);
            }
          }
        } else {
          setFriendDisplayName(roomData.rooms.name);
        }
      }

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
        .eq('room_id', propsRoomId)
        .order('created_at', { ascending: true });

      if (msgError) return;

      const userEmails = [...new Set(messages.map(m => m.user))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('email, display_name, avatar_url')
        .in('email', userEmails);

      // ✨ 各メッセージの送信者プロフィールに、アバターの署名付きURLを追加して合体させる
      const enrichedMessages = await Promise.all(messages.map(async (msg) => {
        const prof = profiles?.find(p => p.email === msg.user);
        let signedUrl = '';
        if (prof?.avatar_url) {
          signedUrl = await getSingleSignedUrl(prof.avatar_url);
        }
        return {
          ...msg,
          profiles: prof ? { ...prof, avatarSignedUrl: signedUrl } : null
        };
      }));
      setChatLog(enrichedMessages);
    };

    fetchMessages();

    const channel = supabase
      .channel(propsRoomId)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages', 
      }, async (payload) => {
        if (payload.new.room_id !== propsRoomId) return;

        // 新しいメッセージの送信者プロファイルを取得
        const { data: prof } = await supabase
          .from('profiles')
          .select('email, display_name, avatar_url')
          .eq('email', payload.new.user)
          .maybeSingle();

        let signedUrl = '';
        if (prof?.avatar_url) {
          signedUrl = await getSingleSignedUrl(prof.avatar_url);
        }

        const enrichedNewMessage = {
          ...payload.new,
          profiles: prof 
            ? { ...prof, avatarSignedUrl: signedUrl } 
            : { email: payload.new.user, display_name: payload.new.user, avatarSignedUrl: '' }
        };

        setChatLog((prev) => {
          const exists = prev.find((msg) => msg.id === payload.new.id);
          if (exists) return prev;
          return [...prev, enrichedNewMessage];
        });
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [session, friendEmail, propsRoomId]);

  // 【追加点】友達追加処理
  const handleAddFriendFromChat = async () => {
    if (!friendEmail) return;
    try {
      const { error } = await supabase
        .from('friends')
        .upsert(
          { user_id: session.user.id, friend_email: friendEmail, is_blocked: false },
          { onConflict: 'user_id,friend_email' }
        );

      if (error) throw error;
      setIsFriend(true);
      setIsBlocked(false);
      alert("友達に追加しました！");
    } catch (error) {
      console.error(error);
      alert("友達追加に失敗しました。");
    }
  };

  // 【追加点】ブロック処理
  const handleBlockFriendFromChat = async () => {
    if (!friendEmail) return;
    if (!window.confirm("このユーザーをブロックしますか？\nブロック中、相手からの新しいメッセージは表示されなくなります。")) return;

    try {
      const { error } = await supabase
        .from('friends')
        .upsert(
          { user_id: session.user.id, friend_email: friendEmail, is_blocked: true },
          { onConflict: 'user_id,friend_email' }
        );

      if (error) throw error;
      setIsFriend(false);
      setIsBlocked(true);
      alert("ブロックしました。");
    } catch (error) {
      console.error(error);
      alert("ブロック処理に失敗しました。");
    }
  };

  // 【追加点】ブロック解除処理
  const handleUnblockFriend = async () => {
    if (!friendEmail) return;
    try {
      const { error } = await supabase
        .from('friends')
        .upsert(
          { user_id: session.user.id, friend_email: friendEmail, is_blocked: false },
          { onConflict: 'user_id,friend_email' }
        );

      if (error) throw error;
      setIsFriend(false); 
      setIsBlocked(false);
      alert("ブロックを解除しました。");
    } catch (error) {
      console.error(error);
      alert("ブロック解除に失敗しました。");
    }
  };

  const handleInviteResponse = async (newStatus) => {
    const { data: myProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', session.user.id)
      .single();
    
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

      await supabase.from('messages').insert([{ 
        room_id: propsRoomId, 
        user: session.user.email, 
        text: `${myName}さんが参加しました`, 
        is_system: true 
      }]);

      setMyStatus('joined');
      alert("グループに参加しました！");
    } else {
      const { error } = await supabase
        .from('room_members')
        .delete()
        .eq('room_id', propsRoomId)
        .eq('user_id', session.user.id);
      if (!error) onBack();
    }
  };

  const handleLeaveGroup = async () => {
    if (!window.confirm("本当にこのグループを脱退しますか？")) return;

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
      .eq('user_id', session.user.id)
      .eq('is_blocked', false); 

    if (!friendRows || friendRows.length === 0) {
      alert("招待できる友達がいません。");
      return;
    }

    const friendEmails = friendRows.map(f => f.friend_email);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, display_name, avatar_url')
      .in('email', friendEmails);

    if (profiles) {
      // ✨ 招待リスト用の友達アバターも署名付きURLを事前に発行して格納
      const enrichedFriends = await Promise.all(profiles.map(async (f) => {
        let signedUrl = '';
        if (f.avatar_url) {
          signedUrl = await getSingleSignedUrl(f.avatar_url);
        }
        return { ...f, avatarSignedUrl: signedUrl };
      }));
      setFriendsList(enrichedFriends);
    } else {
      setFriendsList([]);
    }
    setIsInviteModalOpen(true);
  };

  const executeInvite = async () => {
    if (selectedFriends.length === 0) return;
    
    try {
      const inserts = selectedFriends.map(friendId => ({
        room_id: propsRoomId,
        user_id: friendId,
        status: 'pending'
      }));

      const { error: inviteError } = await supabase.from('room_members').insert(inserts);
      if (inviteError) throw inviteError;

      if (memberCount + selectedFriends.length >= 3) {
        const { error: updateError } = await supabase
          .from('rooms')
          .update({ 
            is_group: true, 
            pair_key: null,
            name: 'グループチャット' 
          })
          .eq('id', propsRoomId)
          .eq('is_group', false); 
        
        if (updateError) console.error("グループ昇格エラー:", updateError.message);
      }

      alert(`${selectedFriends.length}名を招待しました！`);
      setIsInviteModalOpen(false);
      setSelectedFriends([]);
      fetchMembers(); 
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
      room_id: propsRoomId
    }]);
    if (!error) setMessage('');
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${propsRoomId}/${fileName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from('chat-attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: signedData, error: signError } = await supabase.storage
        .from('chat-attachments')
        .createSignedUrl(filePath, 7776000); 

      if (signError) throw signError;
      const secureUrl = signedData.signedUrl;

      const type = file.type.startsWith('image/') ? 'image' : 'document';

      const { error: insertError } = await supabase
        .from('messages')
        .insert([{
          room_id: propsRoomId,
          user: session.user.email,
          text: file.name, 
          file_url: secureUrl, 
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
    fontSize: '0.85rem', color: isActive ? theme.colors.primary : theme.colors.textSub,
    borderBottom: isActive ? `2px solid ${theme.colors.primary}` : '2px solid transparent',
    transition: '0.2s', fontWeight: isActive ? 'bold' : 'normal'
  });

  // 💡 共通アイコン描画コンポーネント（Rooms.jsと同様）
  const renderAvatar = (isGroup, signedUrl) => {
    if (isGroup) {
      return <div style={styles.groupAvatar}>G</div>;
    }
    return (
      <img 
        src={signedUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face'} 
        alt="Avatar" 
        style={styles.avatarImage} 
      />
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <header style={styles.header}>
        <button onClick={onBack} style={styles.backBtn}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 💡 1箇所目修正：左上の対話相手またはグループ名の左側にアイコン追加 */}
          <div style={styles.titleContainer} onClick={() => fetchMembers(true)}>
            {renderAvatar(isGroupRoom, headerAvatarUrl)}
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {friendDisplayName || friendEmail}
              </span>
              {memberCount > 0 && <span style={styles.countText}>({memberCount})</span>}
            </div>
          </div>
        </div>
        {propsRoomId && myStatus === 'joined' && (
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
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
                /* 💡 2箇所目修正：メンバー名の左側にアイコン画像を設ける */
                <div key={i} style={styles.memberRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                    {renderAvatar(false, m.avatarSignedUrl)}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.9rem' }}>
                      {m.profiles?.display_name || m.profiles?.email}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: m.status === 'joined' ? 'green' : 'orange', flexShrink: 0, marginLeft: '5px' }}>
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
                /* 💡 4箇所目修正：招待画面の友達の名前の左側にアイコン画像を設ける */
                <label key={friend.id} style={styles.friendItem}>
                  <input id={`invite-check-${friend.id}`} name="invite-friend" type="checkbox" checked={selectedFriends.includes(friend.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedFriends([...selectedFriends, friend.id]);
                      else setSelectedFriends(selectedFriends.filter(id => id !== friend.id));
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '10px', flex: 1, minWidth: 0 }}>
                    {renderAvatar(false, friend.avatarSignedUrl)}
                    <span style={{ fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {friend.display_name || friend.email}
                    </span>
                  </div>
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

      {/* グループ用の招待バナー */}
      {myStatus === 'pending' && (
        <div style={styles.inviteBanner}>
          <p style={{ fontSize: '0.85rem', margin: '0 0 10px 0', color: '#856404' }}>グループに招待されています。</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button onClick={() => handleInviteResponse('joined')} style={styles.joinBtn}>参加する</button>
            <button onClick={() => handleInviteResponse('rejected')} style={styles.rejectBtn}>拒否する</button>
          </div>
        </div>
      )}

      {/* 1対1チャット用の友達追加・ブロック・ブロック解除バナー */}
      {!isGroupRoom && (
        (!isFriend && !isBlocked) ? (
          <div style={styles.friendActionBanner}>
            <p style={{ fontSize: '0.85rem', margin: '0 0 8px 0', color: '#333' }}>
              このユーザーは連絡帳に登録されていません。
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button onClick={handleAddFriendFromChat} style={styles.addFriendBtn}>追加</button>
              <button onClick={handleBlockFriendFromChat} style={styles.blockFriendBtn}>ブロック</button>
            </div>
          </div>
        ) : (
          isBlocked && (
            <div style={styles.blockedActionBanner}>
              <p style={{ fontSize: '0.85rem', margin: '0 0 8px 0', color: '#c92a2a' }}>
                このユーザーをブロックしています。メッセージは受信されません。
              </p>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button onClick={handleUnblockFriend} style={styles.unblockFriendBtn}>ブロック解除</button>
              </div>
            </div>
          )
        )
      )}

      {/* サブタブ */}
      <div style={{ display: 'flex', backgroundColor: '#fff', borderBottom: `1px solid ${theme.colors.border}`, flexShrink: 0 }}>
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
              {chatLog
                .filter(msg => !(isBlocked && msg.user === friendEmail))
                .map((msg, i) => {
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
                      {/* 💡 3箇所目修正：相手メッセージの場合、送信者名の左隣にアバターを追加してフレックス横並び化 */}
                      {!isMe && (
                        <div style={styles.senderHeaderContainer}>
                          {renderAvatar(false, msg.profiles?.avatarSignedUrl)}
                          <div style={styles.senderName}>{msg.profiles?.display_name || msg.user}</div>
                        </div>
                      )}
                      
                      {/* メッセージの気泡コンテナ（アイコンの右側に揃えるため、相手メッセージの時はmarginでインデントを持たせる） */}
                      <div style={{ 
                        display: 'block',
                        marginLeft: isMe ? '0' : '42px' 
                      }}>
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
            {subTab === 'calendar' && <Calendar session={session} roomId={propsRoomId} />}
            {subTab === 'album' && <SharedFolder session={session} friendEmail={friendEmail} roomId={propsRoomId} />}
            {subTab === 'files' && <SharedDocuments session={session} friendEmail={friendEmail} roomId={propsRoomId} />}
          </>
        )}
      </div>
    </div>
  );
};

// --- スタイル定義 ---
const styles = {
  header: { display: 'flex', alignItems: 'center', padding: '10px 15px', borderBottom: `1px solid ${theme.colors.border}`, backgroundColor: '#fff', gap: '10px' },
  backBtn: { background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', flexShrink: 0 },
  titleContainer: { fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 },
  countText: { fontSize: '0.85rem', color: theme.colors.textSub, fontWeight: 'normal' },
  headerBtn: { padding: '5px 10px', fontSize: '0.75rem', backgroundColor: '#f8f9fa', border: `1px solid ${theme.colors.border}`, borderRadius: '5px', cursor: 'pointer' },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalContent: { backgroundColor: '#fff', padding: '20px', borderRadius: '10px', width: '85%', maxWidth: '300px', textAlign: 'center' },
  modalTitle: { fontSize: '1rem', marginBottom: '15px' },
  // 💡 修正：メンバー一覧をアイコン付きできれいに見せるためフレックスへ
  memberRow: { padding: '8px 0', borderBottom: `1px solid ${theme.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  modalCloseBtn: { ...commonStyles.button, marginTop: '15px', width: '100%', backgroundColor: '#6c757d' },
  friendItem: { display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${theme.colors.border}`, cursor: 'pointer' },
  cancelBtn: { backgroundColor: '#6c757d', color: '#fff', border: 'none', padding: '10px', borderRadius: '5px', cursor: 'pointer' },
  inviteBanner: { backgroundColor: '#fff9db', padding: '15px', textAlign: 'center', borderBottom: '1px solid #ffe066' },
  joinBtn: { backgroundColor: '#28a745', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' },
  rejectBtn: { backgroundColor: theme.colors.error, color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' },
  
  friendActionBanner: { backgroundColor: '#e8f4fd', padding: '12px', textAlign: 'center', borderBottom: '1px solid #bce0fd' },
  addFriendBtn: { backgroundColor: theme.colors.primary, color: '#fff', border: 'none', padding: '6px 18px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer' },
  blockFriendBtn: { backgroundColor: '#6c757d', color: '#fff', border: 'none', padding: '6px 18px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer' },
  
  blockedActionBanner: { backgroundColor: '#fff5f5', padding: '12px', textAlign: 'center', borderBottom: '1px solid #ffe3e3' },
  unblockFriendBtn: { backgroundColor: theme.colors.success, color: '#fff', border: 'none', padding: '6px 18px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer' },
  
  chatArea: { flex: 1, overflowY: 'auto', backgroundColor: '#f0f2f5', padding: '15px' },
  systemMsgContainer: { textAlign: 'center', margin: '15px 0' },
  systemMsgBadge: { backgroundColor: '#d1d5db', color: '#4b5563', padding: '3px 12px', borderRadius: '12px', fontSize: '0.7rem' },
  
  // 💡 追加：相手のメッセージ送信者エリアのラップ
  senderHeaderContainer: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' },
  senderName: { fontSize: '0.75rem', color: '#666', fontWeight: 'bold' },
  
  // 💡 共通アイコンスタイル設定（コンパクトめな30pxに変更してトーク画面等に適合）
  avatarImage: { width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover', border: `1px solid ${theme.colors.border}`, flexShrink: 0 },
  groupAvatar: { width: '30px', height: '30px', borderRadius: '50%', backgroundColor: '#e9ecef', color: '#495057', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 'bold', border: `1px solid ${theme.colors.border}`, flexShrink: 0 },
  
  bubble: { display: 'inline-block', padding: '8px 14px', borderRadius: '18px', maxWidth: '80%', textAlign: 'left' },
  attachedImg: { maxWidth: '100%', maxHeight: '200px', borderRadius: '8px', cursor: 'pointer', display: 'block' },
  inputArea: { padding: '10px', backgroundColor: '#fff', borderTop: `1px solid ${theme.colors.border}`, display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 },
  clipBtn: { cursor: 'pointer', padding: '0 5px', fontSize: '1.4rem' },
  chatInput: { flex: 1, padding: '10px', borderRadius: '20px', border: `1px solid ${theme.colors.border}`, outline: 'none' },
  sendBtn: { backgroundColor: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer' },
  lockedInputArea: { padding: '15px', textAlign: 'center', color: theme.colors.textSub, fontSize: '0.8rem', backgroundColor: '#eee', flexShrink: 0 }
};

export default Chat;