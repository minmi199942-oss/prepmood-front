// ====================================
// 유틸리티 함수들
// ====================================

/**
 * HTML 엔티티 이스케이프 - XSS 공격 방지
 * 사용자 입력을 HTML에 표시할 때 반드시 사용해야 함
 * 
 * @param {string} text - 이스케이프할 텍스트
 * @returns {string} - 이스케이프된 텍스트
 * 
 * 예시:
 * escapeHtml('<script>alert("xss")</script>') 
 * → '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 */
function escapeHtml(text) {
  // null, undefined 체크
  if (text == null || text === undefined) {
    return '';
  }
  
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 가격 포맷팅 (원 단위)
 * @param {number} price - 가격
 * @returns {string} - 포맷된 가격 문자열
 */
function formatPrice(price) {
  if (typeof price !== 'number') {
    return '0원';
  }
  return new Intl.NumberFormat('ko-KR').format(price) + '원';
}

/**
 * URL 파라미터 가져오기
 * @param {string} name - 파라미터 이름
 * @returns {string|null} - 파라미터 값
 */
function getUrlParameter(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

// ====================================
// 프로덕션 로깅 시스템
// ====================================

/**
 * 개발/프로덕션 환경 구분 로깅
 * 프로덕션에서는 console.log 비활성화하여 성능 향상
 */
const Logger = {
  isDevelopment: window.location.hostname === 'localhost' || 
                 window.location.hostname === '127.0.0.1' ||
                 window.location.hostname.includes('dev'),
  
  log: function(...args) {
    // 중요한 로그는 프로덕션에서도 출력
    if (this.isDevelopment || args[0]?.includes('🔄') || args[0]?.includes('✅') || args[0]?.includes('📦')) {
      console.log(...args);
    }
  },
  
  error: function(...args) {
    // 에러는 항상 로깅 (디버깅 필요)
    console.error(...args);
  },
  
  warn: function(...args) {
    if (this.isDevelopment) {
      console.warn(...args);
    }
  },
  
  info: function(...args) {
    if (this.isDevelopment) {
      console.info(...args);
    }
  }
};

// 전역으로 사용 가능하도록 window 객체에 추가
window.escapeHtml = escapeHtml;
window.formatPrice = formatPrice;
window.getUrlParameter = getUrlParameter;
window.Logger = Logger;

// 기존 console.log를 Logger.log로 대체하는 헬퍼
window.log = Logger.log;
window.logError = Logger.error;
window.logWarn = Logger.warn;
window.logInfo = Logger.info;

// ====================================
// CSRF 보호 fetch wrapper
// ====================================

/**
 * CSRF 토큰 자동 포함 fetch wrapper
 * - 모든 POST/PUT/DELETE 요청에 X-XSRF-TOKEN 헤더 자동 추가
 * - 쿠키에서 xsrf-token을 읽어 헤더에 포함
 */
function secureFetch(url, options = {}) {
  // CSRF 토큰 가져오기
  const csrfToken = getCookie('xsrf-token');
  
  // POST/PUT/DELETE 요청에 CSRF 헤더 추가
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'DELETE'].includes(method) && csrfToken) {
    options.headers = options.headers || {};
    options.headers['X-XSRF-TOKEN'] = csrfToken;
  }
  
  return fetch(url, options);
}

/**
 * 쿠키에서 값 가져오기
 * @param {string} name - 쿠키 이름
 * @returns {string|null} - 쿠키 값
 */
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop().split(';').shift();
  }
  return null;
}

// 전역으로 사용 가능하도록 노출
window.secureFetch = secureFetch;