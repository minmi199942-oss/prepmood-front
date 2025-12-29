/**
 * 관리자 페이지 공통 레이아웃 컴포넌트
 * 
 * 기능:
 * - 헤더/네비게이션 동적 생성
 * - 현재 페이지 활성화 표시
 * - 로그아웃 기능 통합
 * - 권한 체크 통합
 */

const API_BASE = '/api';

// 네비게이션 메뉴 구조
// Phase 2 전까지 inquiries는 비활성화 (404 피로도 방지)
const NAV_MENU = [
  { id: 'products', label: '상품 관리', href: 'products.html' },
  { id: 'orders', label: '주문 관리', href: 'orders.html' },
  // { id: 'inquiries', label: '고객 문의', href: 'inquiries.html' }, // Phase 2에서 활성화 예정
];

/**
 * 헤더 생성
 * @param {string} currentPage - 현재 페이지 ID ('products', 'orders', 'inquiries')
 */
function renderAdminHeader(currentPage) {
  const header = document.createElement('header');
  header.className = 'admin-header';
  
  header.innerHTML = `
    <div class="admin-header-content">
      <h1>Pre.pMood 관리자</h1>
      <nav class="admin-nav">
        ${NAV_MENU.map(item => `
          <a href="${item.href}" 
             class="${item.id === currentPage ? 'active' : ''}" 
             data-page="${item.id}">
            ${item.label}
          </a>
        `).join('')}
        <a href="../index.html">사이트로 이동</a>
        <a href="#" id="logoutBtn" class="logout-btn">로그아웃</a>
      </nav>
    </div>
  `;
  
  // body 시작 부분에 헤더 삽입
  document.body.insertBefore(header, document.body.firstChild);
  
  // 로그아웃 버튼 이벤트
  const logoutBtn = header.querySelector('#logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
}

/**
 * 로그아웃 처리
 */
async function handleLogout(e) {
  e.preventDefault();
  
  try {
    const response = await fetch(`${API_BASE}/admin/logout`, {
      method: 'POST',
      credentials: 'include'
    });
    
    if (response.ok) {
      window.location.href = 'login.html';
    } else {
      // 로그아웃 실패해도 로그인 페이지로 이동
      window.location.href = 'login.html';
    }
  } catch (error) {
    // 로깅 정책: Phase 0 준수 (error 객체 전체 덤프 금지)
    // 에러 발생해도 로그인 페이지로 이동
    window.location.href = 'login.html';
  }
}

/**
 * 관리자 권한 확인
 * @returns {Promise<boolean>} 권한이 있으면 true
 */
async function checkAdminAccess() {
  try {
    const response = await fetch(`${API_BASE}/admin/check`, {
      credentials: 'include'  // JWT 쿠키 포함
    });

    if (!response.ok) {
      alert('관리자 권한이 없습니다.');
      window.location.href = 'login.html';
      return false;
    }

    // 성공 시 응답 바디 파싱 생략 (실제로 필요 없음)
    // 운영 안정성: 파싱 예외 위험 제거
    return true;

  } catch (error) {
    // 로깅 정책: Phase 0 준수 (error 객체 전체 덤프 금지)
    alert('로그인이 필요합니다.');
    window.location.href = 'login.html';
    return false;
  }
}

/**
 * 초기화 함수
 * @param {string} currentPage - 현재 페이지 ID
 * @param {boolean} skipAuthCheck - 권한 체크 스킵 여부 (기본: false)
 */
async function initAdminLayout(currentPage, skipAuthCheck = false) {
  // 1. 권한 체크 (스킵 옵션이 없으면)
  if (!skipAuthCheck) {
    const hasAccess = await checkAdminAccess();
    if (!hasAccess) {
      return false; // 권한 없으면 초기화 중단
    }
  }
  
  // 2. 헤더 렌더링
  renderAdminHeader(currentPage);
  
  return true;
}

// 전역으로 export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initAdminLayout, checkAdminAccess, handleLogout };
}

