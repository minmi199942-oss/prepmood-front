// header-scroll.js - 프라다 스타일 헤더 스크롤 동작 제어

(function() {
  'use strict';

  let lastScrollY = window.scrollY;
  let ticking = false;
  const HEADER_HOVER_ZONE = 80; // 마우스 감지 영역 (px)
  const SCROLL_THRESHOLD = 10; // 스크롤 감지 임계값
  const SCROLL_DELTA_THRESHOLD = 5; // 스크롤 방향 감지 임계값

  const header = document.querySelector('header.main-header');
  if (!header) {
    console.warn('header-scroll.js: header.main-header를 찾을 수 없습니다.');
    return;
  }

  /**
   * 헤더 표시/숨김 처리
   */
  function handleScroll() {
    const currentScrollY = window.scrollY;
    const scrollDelta = currentScrollY - lastScrollY;

    // 장바구니가 열려있으면 헤더 항상 표시
    const miniCart = document.getElementById('mini-cart');
    if (miniCart && miniCart.classList.contains('active')) {
      header.classList.remove('header--hidden');
      lastScrollY = currentScrollY;
      return;
    }

    // 스크롤이 맨 위에 있으면 헤더 표시
    if (currentScrollY < SCROLL_THRESHOLD) {
      header.classList.remove('header--hidden');
      lastScrollY = currentScrollY;
      return;
    }

    // 아래로 빠르게 스크롤 → 헤더 숨김
    if (scrollDelta > SCROLL_DELTA_THRESHOLD) {
      header.classList.add('header--hidden');
    }
    // 위로 스크롤 → 헤더 표시
    else if (scrollDelta < -SCROLL_DELTA_THRESHOLD) {
      header.classList.remove('header--hidden');
    }

    lastScrollY = currentScrollY;
  }

  /**
   * 상단 영역 마우스 호버 시 헤더 표시
   */
  function handleMouseMove(e) {
    // 장바구니가 열려있으면 무시
    const miniCart = document.getElementById('mini-cart');
    if (miniCart && miniCart.classList.contains('active')) {
      return;
    }

    // 상단 80px 영역에 마우스가 있으면 헤더 표시
    if (e.clientY <= HEADER_HOVER_ZONE) {
      header.classList.remove('header--hidden');
    }
  }

  // 스크롤 이벤트 (requestAnimationFrame + throttle 패턴)
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        handleScroll();
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });

  // 마우스 이동 이벤트
  document.addEventListener('mousemove', handleMouseMove, { passive: true });

  // 초기 상태: 헤더 표시
  header.classList.remove('header--hidden');

  console.log('✅ header-scroll.js 초기화 완료');
})();

