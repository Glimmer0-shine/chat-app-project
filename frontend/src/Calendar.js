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
    // 1. 最初のデータ取得
    fetchEvents();

    // 2. リアルタイム監視の設定
    const channel = supabase
      .channel(`calendar-${roomId}`) // ルームごとにユニークな名前
      .on(
        'postgres_changes',
        {
          event: '*', 
          schema: 'public',
          table: 'events',
          filter: `room_id=eq.${roomId}`
        },
        (payload) => {
          console.log("リアルタイムイベント受信:", payload.eventType, payload);
          
          if (payload.eventType === 'INSERT') {
            setEvents((prev) => {
              // ★二重登録防止：すでに同じIDがあれば追加しない
              if (prev.some(e => e.id === payload.new.id)) return prev;
              return [...prev, payload.new];
            });
          } 
          else if (payload.eventType === 'DELETE') {
            // ★削除対応：payload.old.id を使用
            setEvents((prev) => prev.filter(e => e.id !== payload.old.id));
          } 
          else if (payload.eventType === 'UPDATE') {
            setEvents((prev) => prev.map(e => e.id === payload.new.id ? payload.new : e));
          }
        }
      )
      .subscribe();

    // 3. クリーンアップ
    return () => {
      supabase.removeChannel(channel);
    };
    // ★fetchEvents を依存配列から外すか、useCallbackで囲ったものを使用してください
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
    // チャットで使用している messages テーブルの正確なカラム名に合わせます
    const { error } = await supabase.from('messages').insert([{
      text: textContent,              // 'content' ではなく 'text'
      room_id: roomId,
      user: session.user.email,       // 'user_email' ではなく 'user'
      // is_system カラムが DB に存在しない場合は、一旦外すか SQL で追加してください
      is_system: true                 
    }]);

    if (error) {
      console.error("システム通知の送信に失敗しました:", error.message);
    }
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

  const updateEvent = async (id, updates) => {
    const { error } = await supabase.from('events').update(updates).eq('id', id);
    if (!error) fetchEvents();
  };

  const deleteEvent = async (id) => {
    if (!window.confirm("この予定を削除しますか？")) return;
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (!error) fetchEvents();
  };

  return (
    <div style={{ padding: '10px', opacity: loading ? 0.6 : 1, transition: '0.3s' }}>
      
      {/* ヘッダーエリア */}
      <div style={headerStyle}>
        <button onClick={() => setCurrentDate(new Date())} style={todayBtnStyle}>今日</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} style={navBtnStyle}>&lt;</button>
          <button onClick={() => { setIsYearPicker(!isYearPicker); setIsMonthPicker(false); }} style={selectBtnStyle}>{year}年 ▾</button>
          <button onClick={() => { setIsMonthPicker(!isMonthPicker); setIsYearPicker(false); }} style={selectBtnStyle}>{month + 1}月 ▾</button>
          <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} style={navBtnStyle}>&gt;</button>
        </div>
      </div>

      {/* 年月選択パネル */}
      {(isYearPicker || isMonthPicker) && (
        <div style={pickerPanelStyle}>
          {isYearPicker ? 
            [...Array(11).keys()].map(i => {
              const y = year - 5 + i;
              return <button key={y} onClick={() => { setCurrentDate(new Date(y, month, 1)); setIsYearPicker(false); }} style={pickerItemStyle(y === year)}>{y}年</button>;
            }) :
            [...Array(12).keys()].map(m => (
              <button key={m} onClick={() => { setCurrentDate(new Date(year, m, 1)); setIsMonthPicker(false); }} style={pickerItemStyle(m === month)}>{m + 1}月</button>
            ))
          }
        </div>
      )}

      {/* カレンダー格子 */}
      <div style={gridStyle}>
        {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
          <div key={d} style={weekdayHeaderStyle(i)}>{d}</div>
        ))}
        {days.map((date, i) => {
          const dateStr = date?.toLocaleDateString('sv-SE');
          const dayEvents = events.filter(e => e.event_date === dateStr);
          const holidayName = getHoliday(date);
          const isSelected = dateStr === selectedDate?.toLocaleDateString('sv-SE');

          return (
            <div key={i} onClick={() => date && setSelectedDate(date)} style={dayCellStyle(date, isSelected)}>
              <div style={dayNumberContainerStyle}>
                <span style={dayNumberStyle(date, holidayName)}>{date?.getDate()}</span>
                {holidayName && <span style={holidayNameStyle}>{holidayName}</span>}
              </div>
              {dayEvents.map(e => (
                <div key={e.id} style={eventLabelStyle(e.color)}>{e.title}</div>
              ))}
            </div>
          );
        })}
      </div>

      {/* 詳細・編集モーダル */}
      {selectedDate && (
        <div style={modalStyle}>
          <div style={modalHeaderStyle}>
            <strong>{selectedDate.toLocaleDateString()} {getHoliday(selectedDate) && `(${getHoliday(selectedDate)})`}</strong>
            <button onClick={() => setSelectedDate(null)} style={closeBtnStyle}>×</button>
          </div>
          
          {/* 追加フォーム */}
          <div style={addFormContainerStyle}>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '8px' }}>
              <input id="event-time" name="event-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} />
              <input id="event-title" name="event-title" autoComplete="off" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="予定タイトル" style={{ ...inputStyle, flex: 1 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                {colors.map(c => (
                  <button key={c.bg} onClick={() => setColor(c.bg)} style={colorDotStyle(c.bg, color === c.bg)} />
                ))}
              </div>
              <button onClick={addEvent} style={addBtnStyle}>追加</button>
            </div>
          </div>

          {/* 予定一覧 */}
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {events.filter(e => e.event_date === selectedDate.toLocaleDateString('sv-SE')).map(e => (
              <div key={e.id} style={eventItemCardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div>
                    <span style={timeLabelStyle}>{e.event_time?.slice(0, 5) || '--:--'}</span>
                    <span style={eventTitleStyle(e.color)}>{e.title}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={() => { const t = prompt("時刻(HH:MM)", e.event_time); if(t) updateEvent(e.id, {event_time: t}); }} style={actionBtnStyle}>時刻</button>
                    <button onClick={() => { const d = prompt("日付(YYYY-MM-DD)", e.event_date); if(d) updateEvent(e.id, {event_date: d}); }} style={actionBtnStyle}>移動</button>
                    <button onClick={() => deleteEvent(e.id)} style={{ ...actionBtnStyle, color: 'red' }}>削除</button>
                  </div>
                </div>
                {/* 色の後出し変更 */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.65rem', color: '#666' }}>色変更:</span>
                  {colors.map(c => (
                    <button key={c.bg} onClick={() => updateEvent(e.id, { color: c.bg })} style={smallColorDotStyle(c.bg, e.color === c.bg)} />
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
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' };
const todayBtnStyle = { padding: '5px 12px', backgroundColor: '#6c757d', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' };
const navBtnStyle = { padding: '5px 10px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', borderRadius: '4px' };
const selectBtnStyle = { background: 'none', border: 'none', fontWeight: 'bold', cursor: 'pointer', fontSize: '1rem' };
const pickerPanelStyle = { padding: '10px', backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '8px', marginBottom: '10px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px' };
const pickerItemStyle = (active) => ({ padding: '8px 4px', fontSize: '0.8rem', backgroundColor: active ? '#007bff' : '#fff', color: active ? '#fff' : '#333', border: '1px solid #eee', borderRadius: '4px' });

const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', backgroundColor: '#ddd', border: '1px solid #ddd' };
const weekdayHeaderStyle = (i) => ({ textAlign: 'center', padding: '5px', fontSize: '0.7rem', backgroundColor: '#f9f9f9', color: i === 0 ? 'red' : i === 6 ? 'blue' : '#333' });
const dayCellStyle = (date, isSelected) => ({
  height: '85px', backgroundColor: date ? (isSelected ? '#e7f3ff' : 'white') : '#f5f5f5', 
  padding: '2px', overflow: 'hidden', cursor: date ? 'pointer' : 'default',
  border: isSelected ? '2px solid #007bff' : 'none'
});
const dayNumberContainerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' };
const dayNumberStyle = (date, isHoliday) => ({ fontSize: '0.8rem', color: (date?.getDay() === 0 || isHoliday) ? 'red' : date?.getDay() === 6 ? 'blue' : 'black' });
const holidayNameStyle = { fontSize: '0.5rem', color: 'red', transform: 'scale(0.8)', whiteSpace: 'nowrap' };
const eventLabelStyle = (bgColor) => ({ fontSize: '0.6rem', backgroundColor: bgColor || '#dcfce7', padding: '1px 2px', borderRadius: '2px', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });

const modalStyle = { position: 'fixed', bottom: '0', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '600px', padding: '20px', backgroundColor: '#fff', boxShadow: '0 -4px 15px rgba(0,0,0,0.1)', borderRadius: '20px 20px 0 0', zIndex: 1000 };
const modalHeaderStyle = { display: 'flex', justifyContent: 'space-between', marginBottom: '15px' };
const closeBtnStyle = { border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#999' };
const addFormContainerStyle = { marginBottom: '15px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '10px' };
const inputStyle = { padding: '8px', borderRadius: '5px', border: '1px solid #ddd', fontSize: '0.9rem' };
const colorDotStyle = (bg, active) => ({ width: '24px', height: '24px', backgroundColor: bg, border: active ? '2px solid #333' : '1px solid #ddd', borderRadius: '50%', cursor: 'pointer' });
const addBtnStyle = { backgroundColor: '#28a745', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' };

const eventItemCardStyle = { padding: '12px 0', borderBottom: '1px solid #eee' };
const timeLabelStyle = { fontSize: '0.85rem', fontWeight: 'bold', marginRight: '8px', color: '#555' };
const eventTitleStyle = (bg) => ({ backgroundColor: bg, padding: '3px 8px', borderRadius: '4px', fontSize: '0.9rem' });
const actionBtnStyle = { marginLeft: '4px', fontSize: '0.7rem', padding: '3px 7px', cursor: 'pointer', border: '1px solid #eee', background: '#fff', borderRadius: '4px' };
const smallColorDotStyle = (bg, active) => ({ width: '14px', height: '14px', backgroundColor: bg, border: active ? '1px solid #000' : '1px solid #eee', borderRadius: '50%', cursor: 'pointer' });

export default Calendar;