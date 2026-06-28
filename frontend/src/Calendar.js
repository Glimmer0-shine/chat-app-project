import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import * as holiday_jp from '@holiday-jp/holiday_jp';

const Calendar = ({ session, roomId }) => {
  // --- ステート定義 ---
  const [events, setEvents] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('12:00');
  const [color, setColor] = useState('#dcfce7');
  const [loading, setLoading] = useState(true);
  const [isYearPicker, setIsYearPicker] = useState(false);
  const [isMonthPicker, setIsMonthPicker] = useState(false);

  const colors = [
    { label: '緑', bg: '#dcfce7' },
    { label: '青', bg: '#dbeafe' },
    { label: '赤', bg: '#fee2e2' },
    { label: '黄', bg: '#fef9c3' },
  ];

  // --- データ取得 ---
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('room_id', roomId)
      .order('event_time', { ascending: true });
    if (!error) setEvents(data || []);
    setLoading(false);
  }, [roomId]);

  useEffect(() => {
    fetchEvents();
    const channel = supabase
      .channel(`calendar-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setEvents((prev) => prev.some(e => e.id === payload.new.id) ? prev : [...prev, payload.new]);
          } 
          else if (payload.eventType === 'DELETE') {
            setEvents((prev) => prev.filter(e => e.id !== Number(payload.old.id)));
          } 
          else if (payload.eventType === 'UPDATE') {
            setEvents((prev) => prev.map(e => e.id === payload.new.id ? payload.new : e));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, fetchEvents]);

  // --- ヘルパー関数 ---
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = new Date(year, month, 1).getDay();
  const days = [...Array(startDay).fill(null), ...[...Array(daysInMonth).keys()].map(i => new Date(year, month, i + 1))];

  const getHoliday = (date) => {
    if (!date) return null;
    const holidays = holiday_jp.between(date, date);
    return holidays.length > 0 ? holidays[0].name : null;
  };

  const sendSystemNotification = async (textContent) => {
    const { error } = await supabase.from('messages').insert([{
      text: textContent,
      room_id: roomId,
      user: session.user.email,
      is_system: true                 
    }]);
    if (error) console.error("システム通知の送信に失敗しました:", error.message);
  };

  // --- アクション関数 ---
  const addEvent = async () => {
    if (!title || !selectedDate) return;
    const dateStr = selectedDate.toLocaleDateString('sv-SE');
    const { error } = await supabase.from('events').insert([{
      title, color, event_date: dateStr, event_time: time,
      room_id: roomId, user_id: session.user.id, created_by_email: session.user.email
    }]);
    if (!error) {
      await sendSystemNotification(`📅 予定追加: ${title} (${time})`);
      setTitle(''); fetchEvents();
    }
  };

  // const updateEvent = async (id, updates) => {
  //   const { error } = await supabase.from('events').update(updates).eq('id', id);
  //   if (!error) fetchEvents();
  // };

  // const deleteEvent = async (id) => {
  //   if (!window.confirm("この予定を削除しますか？")) return;
  //   const { error } = await supabase.from('events').delete().eq('id', id);
  //   if (!error) fetchEvents();
  // };

  // 💡 更新処理の修正：通知対応 ＆ 汎用的なテキスト組み立て
  const updateEvent = async (id, updates) => {
    // 1. 通知用に、変更前のイベント情報を特定する
    const targetEvent = events.find(e => e.id === id);
    if (!targetEvent) return;

    const { error } = await supabase.from('events').update(updates).eq('id', id);
    if (!error) {
      // 2. 何が変更されたかに応じて、通知メッセージを動的に作成
      let notificationText = `📝 予定変更 [${targetEvent.title}]: `;
      if (updates.title) notificationText += `タイトルを「${updates.title}」に変更`;
      if (updates.event_time) notificationText += `時刻を ${updates.event_time} に変更`;
      if (updates.event_date) notificationText += `日付を ${updates.event_date} に変更`;
      if (updates.color) notificationText += `ラベルの色を変更`;

      await sendSystemNotification(notificationText);
      fetchEvents();
    }
  };

  // 💡 削除処理の修正：通知対応
  const deleteEvent = async (id) => {
    // 1. 通知用に、削除する前のイベントタイトルを取得しておく
    const targetEvent = events.find(e => e.id === id);
    if (!targetEvent) return;

    if (!window.confirm(`この予定「${targetEvent.title}」を削除しますか？`)) return;

    const { error } = await supabase.from('events').delete().eq('id', id);
    if (!error) {
      await sendSystemNotification(`🗑️ 予定削除: ${targetEvent.title} (${targetEvent.event_time?.slice(0, 5)})`);
      fetchEvents();
    }
  };

  return (
    <div style={{ padding: '10px', opacity: loading ? 0.6 : 1, transition: '0.3s' }}>
      
      {/* ヘッダーエリア */}
      <div style={styles.header}>
        <button onClick={() => setCurrentDate(new Date())} style={styles.todayBtn}>今日</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} style={styles.navBtn}>&lt;</button>
          <button onClick={() => { setIsYearPicker(!isYearPicker); setIsMonthPicker(false); }} style={styles.selectBtn}>{year}年 ▾</button>
          <button onClick={() => { setIsMonthPicker(!isMonthPicker); setIsYearPicker(false); }} style={styles.selectBtn}>{month + 1}月 ▾</button>
          <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} style={styles.navBtn}>&gt;</button>
        </div>
      </div>

      {/* 年月選択パネル */}
      {(isYearPicker || isMonthPicker) && (
        <div style={styles.pickerPanel}>
          {isYearPicker ? 
            [...Array(11).keys()].map(i => {
              const y = year - 5 + i;
              const active = y === year;
              return (
                <button key={y} onClick={() => { setCurrentDate(new Date(y, month, 1)); setIsYearPicker(false); }} 
                  style={{ ...styles.pickerItem, backgroundColor: active ? '#007bff' : '#fff', color: active ? '#fff' : '#333' }}>
                  {y}年
                </button>
              );
            }) :
            [...Array(12).keys()].map(m => {
              const active = m === month;
              return (
                <button key={m} onClick={() => { setCurrentDate(new Date(year, m, 1)); setIsMonthPicker(false); }} 
                  style={{ ...styles.pickerItem, backgroundColor: active ? '#007bff' : '#fff', color: active ? '#fff' : '#333' }}>
                  {m + 1}月
                </button>
              );
            })
          }
        </div>
      )}

      {/* カレンダー格子 */}
      <div style={styles.grid}>
        {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
          <div key={d} style={{ ...styles.weekdayHeader, color: i === 0 ? 'red' : i === 6 ? 'blue' : '#333' }}>{d}</div>
        ))}
        {days.map((date, i) => {
          const dateStr = date?.toLocaleDateString('sv-SE');
          const dayEvents = events.filter(e => e.event_date === dateStr);
          const holidayName = getHoliday(date);
          const isSelected = dateStr === selectedDate?.toLocaleDateString('sv-SE');

          return (
            <div key={i} onClick={() => date && setSelectedDate(date)} 
              style={{ 
                ...styles.dayCell, 
                backgroundColor: date ? (isSelected ? '#e7f3ff' : 'white') : '#f5f5f5', 
                cursor: date ? 'pointer' : 'default',
                border: isSelected ? '2px solid #007bff' : 'none'
              }}>
              <div style={styles.dayNumberContainer}>
                <span style={{ fontSize: '0.8rem', color: (date?.getDay() === 0 || holidayName) ? 'red' : date?.getDay() === 6 ? 'blue' : 'black' }}>
                  {date?.getDate()}
                </span>
                {holidayName && <span style={styles.holidayName}>{holidayName}</span>}
              </div>
              {dayEvents.map(e => (
                <div key={e.id} style={{ ...styles.eventLabel, backgroundColor: e.color || '#dcfce7' }}>{e.title}</div>
              ))}
            </div>
          );
        })}
      </div>

      {/* 詳細・編集モーダル */}
      {selectedDate && (
        <div style={styles.modal}>
          <div style={styles.modalHeader}>
            <strong>{selectedDate.toLocaleDateString()} {getHoliday(selectedDate) && `(${getHoliday(selectedDate)})`}</strong>
            <button onClick={() => setSelectedDate(null)} style={styles.closeBtn}>×</button>
          </div>
          
          <div style={styles.addFormContainer}>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '8px' }}>
              <input id="event-time" name="event-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={styles.input} />
              <input id="event-title" name="event-title" autoComplete="off" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="予定タイトル" style={{ ...styles.input, flex: 1 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                {colors.map(c => (
                  <button key={c.bg} onClick={() => setColor(c.bg)} 
                    style={{ ...styles.colorDot, backgroundColor: c.bg, border: color === c.bg ? '2px solid #333' : '1px solid #ddd' }} 
                  />
                ))}
              </div>
              <button onClick={addEvent} style={styles.addBtn}>追加</button>
            </div>
          </div>

          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {events.filter(e => e.event_date === selectedDate.toLocaleDateString('sv-SE')).map(e => (
              <div key={e.id} style={styles.eventItemCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div>
                    <span style={styles.timeLabel}>{e.event_time?.slice(0, 5) || '--:--'}</span>
                    <span style={{ ...styles.eventTitle, backgroundColor: e.color }}>{e.title}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={() => { const t = prompt("時刻(HH:MM)", e.event_time); if(t) updateEvent(e.id, {event_time: t}); }} style={styles.actionBtn}>時刻変更</button>
                    <button onClick={() => { const d = prompt("日付(YYYY-MM-DD)", e.event_date); if(d) updateEvent(e.id, {event_date: d}); }} style={styles.actionBtn}>移動</button>
                    <button onClick={() => { const newTitle = prompt("新しい予定タイトル", e.title); if(newTitle && newTitle.trim()) updateEvent(e.id, { title: newTitle.trim() }); }} style={styles.actionBtn}>タイトル変更</button>
                    <button onClick={() => deleteEvent(e.id)} style={{ ...styles.actionBtn, color: 'red' }}>削除</button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.65rem', color: '#666' }}>色変更:</span>
                  {colors.map(c => (
                    <button key={c.bg} onClick={() => updateEvent(e.id, { color: c.bg })} 
                      style={{ ...styles.smallColorDot, backgroundColor: c.bg, border: e.color === c.bg ? '1px solid #000' : '1px solid #eee' }} 
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// --- スタイル定義 (一括管理) ---
const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  todayBtn: { padding: '5px 12px', backgroundColor: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' },
  navBtn: { padding: '5px 10px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', borderRadius: '4px' },
  selectBtn: { background: 'none', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' },
  pickerPanel: { padding: '10px', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '10px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px' },
  pickerItem: { padding: '8px 4px', fontSize: '0.8rem', border: '1px solid #eee', borderRadius: '4px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', backgroundColor: '#ddd', border: '1px solid #ddd' },
  weekdayHeader: { textAlign: 'center', padding: '5px', fontSize: '0.7rem', backgroundColor: '#f9f9f9' },
  dayCell: { height: '85px', padding: '2px', overflow: 'hidden' },
  dayNumberContainer: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  holidayName: { fontSize: '0.5rem', color: 'red', transform: 'scale(0.8)', whiteSpace: 'nowrap' },
  eventLabel: { fontSize: '0.6rem', padding: '1px 2px', borderRadius: '2px', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  modal: { position: 'fixed', bottom: '0', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '600px', padding: '20px', backgroundColor: '#fff', boxShadow: '0 -4px 15px rgba(0,0,0,0.1)', borderRadius: '20px 20px 0 0', zIndex: 1000 },
  modalHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '15px' },
  closeBtn: { border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999' },
  addFormContainer: { marginBottom: '15px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '10px' },
  input: { padding: '8px', borderRadius: '5px', border: '1px solid #ddd', fontSize: '0.9rem' },
  colorDot: { width: '24px', height: '24px', borderRadius: '50%', cursor: 'pointer' },
  addBtn: { backgroundColor: '#28a745', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' },
  eventItemCard: { padding: '12px 0', borderBottom: '1px solid #eee' },
  timeLabel: { fontSize: '0.85rem', fontWeight: 'bold', marginRight: '8px', color: '#555' },
  eventTitle: { padding: '3px 8px', borderRadius: '4px', fontSize: '0.9rem' },
  actionBtn: { marginLeft: '4px', fontSize: '0.7rem', padding: '3px 7px', cursor: 'pointer', border: '1px solid #eee', background: '#fff', borderRadius: '4px' },
  smallColorDot: { width: '14px', height: '14px', borderRadius: '50%', cursor: 'pointer' }
};

export default Calendar;