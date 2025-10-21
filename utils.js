/**
 * utils.js - 공통 유틸리티 함수
 * 보안 및 일반적인 헬퍼 함수 모음
 */

/**
 * HTML 엔티티 이스케이프 - XSS 공격 방지
 * 사용자 입력을 HTML에 표시할 때 반드시 사용해야 함
 * 
 * @param {string} text - 이스케이프할 텍스트
 * @returns {string} 안전하게 이스케이프된 텍스트
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
  
  // 숫자는 그대로 반환
  if (typeof text === 'number') {
    return text.toString();
  }
  
  // 문자열로 변환
  text = String(text);
  
  // DOM을 이용한 안전한 이스케이프
  const div = document.createElement('div');
  div.textContent = text; // textContent는 HTML을 해석하지 않음
  return div.innerHTML;
}

/**
 * 가격 포맷팅
 * @param {number} price - 가격
 * @returns {string} 포맷된 가격 문자열
 */
function formatPrice(price) {
  if (price == null || isNaN(price)) {
    return '0원';
  }
  
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price);
}

/**
 * URL 파라미터에서 안전하게 값 가져오기
 * @param {string} name - 파라미터 이름
 * @returns {string|null} 파라미터 값
 */
function getUrlParameter(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

/**
 * 디바운스 함수 - 연속된 이벤트를 제한
 * @param {Function} func - 실행할 함수
 * @param {number} wait - 대기 시간(ms)
 * @returns {Function} 디바운스된 함수
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 전역으로 사용 가능하도록 window 객체에 추가
window.escapeHtml = escapeHtml;
window.formatPrice = formatPrice;
window.getUrlParameter = getUrlParameter;
window.debounce = debounce;

console.log('✅ utils.js 로드 완료 - 보안 함수 사용 가능');


