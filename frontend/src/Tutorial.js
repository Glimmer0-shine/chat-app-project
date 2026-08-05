import React, { useState, useRef } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination } from 'swiper/modules';

import 'swiper/css';
import 'swiper/css/pagination';

export default function Tutorial({ onComplete }) {
  const [activeIndex, setActiveIndex] = useState(0);
  // Swiper本体を操作するための参照（Ref）
  const swiperRef = useRef(null);

  const slides = [
    {
      id: 1,
      title: 'Y Talk へようこそ',
      description: '大切な家族や友達と、いつでも気軽にメッセージをやり取りできます。',
      image: '/images/tutorial-3.png',
    },
    {
      id: 2,
      title: 'スケジュールをみんなで共有',
      description: 'カレンダー機能を使って、イベントや予定の調整もスムーズに。',
      image: '/images/tutorial-6.png',
    },
    {
      id: 3,
      title: 'ファイルや思い出をシェア',
      description: '写真やドキュメントを安全に共有・保管できます。',
      image: '/images/tutorial-7.png',
    },
  ];

  // 左ボタン（前へ）の処理
  const handlePrev = () => {
    if (swiperRef.current) {
      swiperRef.current.slidePrev();
    }
  };

  // 右ボタン（次へ）の処理
  const handleNext = () => {
    if (swiperRef.current) {
      swiperRef.current.slideNext();
    }
  };

  return (
    <div style={styles.container}>
      {/* スキップボタン */}
      {activeIndex < slides.length - 1 && (
        <button style={styles.skipButton} onClick={onComplete}>
          スキップ
        </button>
      )}

      {/* ◀ 左矢印ボタン（1ページ目以外で表示） */}
      {activeIndex > 0 && (
        <button style={styles.prevButton} onClick={handlePrev} aria-label="前へ">
          ‹
        </button>
      )}

      {/* ▶ 右矢印ボタン（最後のページ以外で表示） */}
      {activeIndex < slides.length - 1 && (
        <button style={styles.nextButton} onClick={handleNext} aria-label="次へ">
          ›
        </button>
      )}

      <Swiper
        modules={[Pagination]}
        pagination={{ clickable: true }}
        onSwiper={(swiper) => (swiperRef.current = swiper)} // Swiperインスタンスを保持
        onSlideChange={(swiper) => setActiveIndex(swiper.activeIndex)}
        style={{ width: '100%', height: '100%', paddingBottom: '40px' }}
      >
        {slides.map((slide, index) => (
          <SwiperSlide key={slide.id}>
            <div style={styles.slideContent}>
              <img src={slide.image} alt={slide.title} style={styles.slideImage} />
              <h2 style={styles.title}>{slide.title}</h2>
              <p style={styles.description}>{slide.description}</p>
              
              {index === slides.length - 1 && (
                <button style={styles.startButton} onClick={onComplete}>
                  はじめる
                </button>
              )}
            </div>
          </SwiperSlide>
        ))}
      </Swiper>

      {/* Swiperドットの色調整用スタイル */}
      <style>{`
        .swiper-pagination-bullet-active {
          background: #4caf50 !important;
        }
      `}</style>
    </div>
  );
}

// 同一ファイル内のスタイル定義
const styles = {
  container: {
    position: 'relative',
    width: '100%',
    height: '100vh',
    backgroundColor: '#eaf6ff',
    display: 'flex',
    flexDirection: 'column',
  },
  skipButton: {
    position: 'absolute',
    top: '20px',
    right: '20px',
    zIndex: 10,
    background: 'none',
    border: 'none',
    color: '#666',
    fontSize: '14px',
    cursor: 'pointer',
  },
  /* ◀ 左矢印ボタンのスタイル */
  prevButton: {
    position: 'absolute',
    top: '50%',
    left: '15px',
    transform: 'translateY(-50%)',
    zIndex: 10,
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    border: 'none',
    color: '#333',
    fontSize: '28px',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    paddingBottom: '4px', // 記号の上下位置微調整
  },
  /* ▶ 右矢印ボタンのスタイル */
  nextButton: {
    position: 'absolute',
    top: '50%',
    right: '15px',
    transform: 'translateY(-50%)',
    zIndex: 10,
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    border: 'none',
    color: '#333',
    fontSize: '28px',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    paddingBottom: '4px', // 記号の上下位置微調整
  },
  slideContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '0 30px',
    textAlign: 'center',
    boxSizing: 'border-box',
  },
  slideImage: {
    width: '80%',
    maxWidth: '280px',
    marginBottom: '30px',
  },
  title: {
    color: '#333',
    fontSize: '20px',
    marginBottom: '12px',
  },
  description: {
    color: '#666',
    fontSize: '14px',
    lineHeight: '1.6',
  },
  startButton: {
    marginTop: '30px',
    padding: '12px 40px',
    backgroundColor: '#4caf50',
    color: '#fff',
    border: 'none',
    borderRadius: '25px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    boxShadow: '0 4px 10px rgba(76, 175, 80, 0.3)',
  },
};