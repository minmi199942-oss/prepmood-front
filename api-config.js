// api-config.js - API URL 설정

// 로컬 개발용 API URL 설정
function getApiBaseUrl() {
  // 모든 환경에서 프로덕션 API 사용
  return 'https://prepmood.kr/api';
}

// 전역으로 노출
window.getApiBaseUrl = getApiBaseUrl;

console.log('✅ API 설정 로드 완료 - 로컬/프로덕션 자동 감지');
