// header-scroll.js - 프라다 스타일 헤더 스크롤 동작 제어

(function() {
  'use strict';

  let lastScrollY = window.scrollY;
  let ticking = false;
  let scrollHandler = null;
  let mouseMoveHandler = null;
  const HEADER_HOVER_ZONE = 80; // 마우스 감지 영역 (px)
  const SCROLL_THRESHOLD = 10; // 스크롤 감지 임계값
  const SCROLL_DELTA_THRESHOLD = 5; // 스크롤 방향 감지 임계값

  /**
   * 헤더 스크롤 동작 초기화
   * header-loader.js에서 헤더가 로드된 후 호출
   */
  window.initHeaderScroll = function() {
    const header = document.querySelector('header.main-header');
    if (!header) {
      console.warn('header-scroll.js: header.main-header를 찾을 수 없습니다.');
      return false;
    }

    // 이미 초기화되었으면 중복 실행 방지
    if (scrollHandler && mouseMoveHandler) {
      console.log('header-scroll.js: 이미 초기화되었습니다.');
      return true;
    }

    /**
     * 헤더 표시/숨김 처리
     */
    function handleScroll() {
      const currentScrollY = window.scrollY;
      const scrollDelta = currentScrollY - lastScrollY;

      // 모바일 메뉴가 열려있으면 헤더 항상 표시
      const mobileMenu = document.getElementById('mobile-slide-menu');
      if (mobileMenu && mobileMenu.classList.contains('active')) {
        header.classList.remove('header--hidden');
        lastScrollY = currentScrollY;
        return;
      }

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
      // 모바일 메뉴가 열려있으면 무시
      const mobileMenu = document.getElementById('mobile-slide-menu');
      if (mobileMenu && mobileMenu.classList.contains('active')) {
        return;
      }

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

    // 스크롤 이벤트 핸들러 생성 (requestAnimationFrame + throttle 패턴)
    scrollHandler = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    // 마우스 이동 이벤트 핸들러 생성
    mouseMoveHandler = handleMouseMove;

    // 이벤트 리스너 등록
    window.addEventListener('scroll', scrollHandler, { passive: true });
    document.addEventListener('mousemove', mouseMoveHandler, { passive: true });

    // 초기 상태: 헤더 표시
    header.classList.remove('header--hidden');

    console.log('✅ header-scroll.js 초기화 완료');
    return true;
  };

  // DOMContentLoaded 시점에 헤더가 이미 있다면 자동 초기화 (fallback)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // header-loader.js가 실행되지 않은 경우를 대비한 fallback
      setTimeout(() => {
        if (!scrollHandler && !mouseMoveHandler) {
          window.initHeaderScroll();
        }
      }, 500);
    });
  } else {
    // 이미 DOM이 로드된 경우
    setTimeout(() => {
      if (!scrollHandler && !mouseMoveHandler) {
        window.initHeaderScroll();
      }
    }, 500);
  }
})();

