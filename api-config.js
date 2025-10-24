// api-config.js - API URL 설정

// 로컬 개발용 API URL 설정
function getApiBaseUrl() {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3000/api';
  }
  return 'https://prepmood.kr/api';
}

// 전역으로 노출
window.getApiBaseUrl = getApiBaseUrl;

console.log('✅ API 설정 로드 완료 - 로컬/프로덕션 자동 감지');
