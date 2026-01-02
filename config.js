// config.js - 환경 설정 통합 관리
// ⚠️ 이 파일은 프로젝트의 모든 환경 설정을 한 곳에서 관리합니다.

// ============================================
// 1. TOSS 결제 클라이언트 키 설정
// ============================================
// ⚠️ 중요: 여기서 사용하는 키는 반드시 "publishable key (공개 가능한 키)"여야 합니다.
// Secret Key는 절대 여기에 두지 마세요. 서버 환경변수에서만 관리합니다.
// TOSS 문서에서 "이 키는 비밀키입니다"라고 명시된 키는 절대 사용하지 마세요.

window.TOSS_CLIENT_KEY = (function() {
  const hostname = window.location.hostname;
  
  // 프로덕션 환경 (prepmood.kr)
  if (hostname === 'prepmood.kr' || hostname === 'www.prepmood.kr') {
    // TODO: 실제 라이브 publishable 키로 변경 필요
    // return 'live_gck_...';  // 라이브 publishable 키
    return 'test_gck_jExPeJWYVQx2kJAGjDxx349R5gvN';  // 임시: 테스트 키
  }
  
  // 개발/테스트 환경
  return 'test_gck_jExPeJWYVQx2kJAGjDxx349R5gvN';
})();

// ============================================
// 2. API Base URL 설정
// ============================================
// 현재 구조: same-origin (프론트와 백엔드가 같은 도메인)
// 예: prepmood.kr (프론트) → prepmood.kr/api (백엔드)
//
// 나중에 프론트와 백엔드를 분리할 경우 (예: api.prepmood.kr)
// 아래 주석을 해제하고 수정하면 됩니다:
// window.API_BASE = 'https://api.prepmood.kr';

if (!window.API_BASE) {
  const origin = window.location.origin || '';
  window.API_BASE = origin ? `${origin.replace(/\/$/, '')}/api` : '/api';
}

// ============================================
// 3. 관리자 경로 설정
// ============================================
// ⚠️ 이 경로는 관리 편의를 위한 것이며, 보안을 위한 것이 아닙니다.
// 실질적인 보안은 서버 측 인증/권한 체크로 처리됩니다.
// (URL 숨기기로 보안을 대체하지 않습니다)

window.ADMIN_PATH = '/admin-qhf25za8';

// ============================================
// 4. Google reCAPTCHA Site Key 설정
// ============================================
// ⚠️ Site Key는 공개되어도 되는 키입니다 (Public Key).
// 하지만 환경별로 다른 키를 사용하거나, 나중에 변경할 수 있도록
// 여기서 중앙 관리합니다.
// Secret Key는 절대 여기에 두지 마세요. 서버 환경변수에서만 관리합니다.

window.RECAPTCHA_SITE_KEY = (function() {
  const hostname = window.location.hostname;
  
  // 프로덕션 환경 (prepmood.kr)
  if (hostname === 'prepmood.kr' || hostname === 'www.prepmood.kr') {
    // TODO: 실제 라이브 Site Key로 변경 필요
    // return '6Lc...';  // 라이브 Site Key
    return '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';  // 임시: 테스트 키 (항상 통과)
  }
  
  // 개발/테스트 환경
  return '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';  // 테스트 키
})();

// ============================================
// 로드 확인 (개발 환경에서만)
// ============================================
if (window.Logger && window.Logger.isDevelopment) {
  window.Logger.log('✅ config.js 로드 완료', {
    TOSS_CLIENT_KEY: window.TOSS_CLIENT_KEY ? '설정됨' : '미설정',
    API_BASE: window.API_BASE,
    ADMIN_PATH: window.ADMIN_PATH,
    RECAPTCHA_SITE_KEY: window.RECAPTCHA_SITE_KEY ? '설정됨' : '미설정'
  });
}

