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
    // 개발 환경에서만 로그 출력
    if (this.isDevelopment) {
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

// API 기본 경로 (현재 origin 기준)
(function() {
  const origin = (window.location && window.location.origin)
    ? window.location.origin.replace(/\/$/, '')
    : '';
  const apiBase = origin ? `${origin}/api` : '/api';
  window.API_BASE = apiBase;
})();

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

const DEFAULT_FETCH_TIMEOUT = 15000;

/**
 * CSRF 토큰 자동 포함 fetch wrapper
 * - 모든 POST/PUT/DELETE 요청에 X-XSRF-TOKEN 헤더 자동 추가
 * - 쿠키에서 xsrf-token을 읽어 헤더에 포함
 */
function secureFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const csrfToken = getCookie('xsrf-token');
  const timeoutMs = options.timeoutMs || DEFAULT_FETCH_TIMEOUT;
  const hasIdempotencyKey = () => {
    const headers = options.headers;
    if (!headers) return false;
    if (headers instanceof Headers) {
      return headers.has('X-Idempotency-Key');
    }
    const normalized = Object.keys(headers).reduce((acc, key) => {
      acc[key.toLowerCase()] = headers[key];
      return acc;
    }, {});
    return normalized['x-idempotency-key'] !== undefined;
  };

  const isIdempotent = options.idempotent !== undefined
    ? options.idempotent
    : ['GET', 'HEAD', 'OPTIONS'].includes(method) || hasIdempotencyKey();

  const maxAttempts = isIdempotent ? 2 : 1;
  let attempt = 0;
  let lastError;

  const baseOptions = { ...options };

  const executeFetch = async () => {
    const headers = baseOptions.headers instanceof Headers
      ? new Headers(baseOptions.headers)
      : new Headers(baseOptions.headers || {});

    if (['POST', 'PUT', 'DELETE'].includes(method) && csrfToken) {
      headers.set('X-XSRF-TOKEN', csrfToken);
    }

    const controller = new AbortController();
    let didTimeout = false;

    const timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);

    const externalSignal = baseOptions.signal;
    const abortHandler = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', abortHandler, { once: true });
      }
    }

    try {
      const fetchOptions = {
        ...baseOptions,
        headers,
        signal: controller.signal,
        // 쿠키를 항상 포함하도록 기본값 설정
        // null/undefined만 'include'로 대체 (의도적인 'omit' 등은 유지)
        credentials: baseOptions.credentials ?? 'include'
      };
      delete fetchOptions.timeoutMs;
      delete fetchOptions.idempotent;

      return await fetch(url, fetchOptions);
    } catch (error) {
      if (didTimeout) {
        error.__timeout = true;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', abortHandler);
      }
    }
  };

  const shouldRetry = (error) => {
    if (!isIdempotent) return false;
    if (error.__timeout) return true;
    if (error.name === 'TypeError') return true; // 네트워크 오류
    return false;
  };

  const run = async () => {
    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        return await executeFetch();
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts || !shouldRetry(error)) {
          throw error;
        }
        Logger.warn('secureFetch retry', { url, method, attempt });
      }
    }
    throw lastError;
  };

  return run();
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

// ====================================
// 글로벌 에러 배너
// ====================================

function hideGlobalErrorBanner() {
  const existing = document.querySelector('.global-error-banner');
  if (existing) {
    existing.remove();
  }
}

function showGlobalErrorBanner({
  title = '오류가 발생했습니다',
  message = '',
  retryLabel = '다시 시도',
  onRetry = null,
  duration = 6000
} = {}) {
  hideGlobalErrorBanner();

  const banner = document.createElement('div');
  banner.className = 'global-error-banner';
  banner.style.cssText = `
    position: fixed;
    top: calc(var(--header-height, 72px) + 24px);
    left: 50%;
    transform: translateX(-50%);
    max-width: min(480px, calc(100% - 32px));
    background: #fee;
    color: #c0392b;
    border: 1px solid #f5b7b1;
    box-shadow: 0 8px 24px rgba(192, 57, 43, 0.18);
    padding: 16px 20px;
    border-radius: 8px;
    display: flex;
    align-items: flex-start;
    gap: 16px;
    z-index: 2147483647;
  `;

  const content = document.createElement('div');
  content.style.flex = '1';

  const titleEl = document.createElement('div');
  titleEl.style.fontWeight = '600';
  titleEl.style.marginBottom = '4px';
  titleEl.textContent = title;

  const messageEl = document.createElement('div');
  messageEl.style.whiteSpace = 'pre-line';
  messageEl.style.fontSize = '14px';
  messageEl.style.lineHeight = '1.5';
  messageEl.textContent = message;

  content.appendChild(titleEl);
  if (message) {
    content.appendChild(messageEl);
  }

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.flexDirection = 'column';
  actions.style.gap = '8px';

  if (onRetry) {
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.textContent = retryLabel;
    retryBtn.style.cssText = `
      background: #c0392b;
      color: #fff;
      border: none;
      border-radius: 4px;
      padding: 8px 14px;
      cursor: pointer;
      font-weight: 600;
    `;
    retryBtn.addEventListener('click', () => {
      hideGlobalErrorBanner();
      onRetry();
    });
    actions.appendChild(retryBtn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = '닫기';
  closeBtn.style.cssText = `
    background: transparent;
    color: #c0392b;
    border: none;
    cursor: pointer;
    font-weight: 600;
    padding: 8px 0;
  `;
  closeBtn.addEventListener('click', hideGlobalErrorBanner);
  actions.appendChild(closeBtn);

  banner.appendChild(content);
  banner.appendChild(actions);

  document.body.appendChild(banner);

  if (duration > 0) {
    setTimeout(() => {
      if (document.body.contains(banner)) {
        hideGlobalErrorBanner();
      }
    }, duration);
  }

  return banner;
}

window.showGlobalErrorBanner = showGlobalErrorBanner;
window.hideGlobalErrorBanner = hideGlobalErrorBanner;