// api-config.js - API URL 설정

// 로컬/프로덕션 공용 API URL 설정
function getApiBaseUrl() {
  if (window.API_BASE) {
    return window.API_BASE;
  }
  const origin = (window.location && window.location.origin)
    ? window.location.origin.replace(/\/$/, '')
    : '';
  return origin ? `${origin}/api` : '/api';
}

const apiBaseUrl = getApiBaseUrl();
window.API_BASE = apiBaseUrl;
window.getApiBaseUrl = getApiBaseUrl;

console.log('✅ API 설정 로드 완료 - 현재 API_BASE:', apiBaseUrl);
