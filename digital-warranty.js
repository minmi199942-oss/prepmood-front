// digital-warranty.js - 디지털 보증서 목록 페이지 스크립트
const API_BASE = window.API_BASE || 
  ((window.location && window.location.origin)
    ? window.location.origin.replace(/\/$/, '') + '/api'
    : '/api');

// 페이지네이션 설정
const DEFAULT_LIMIT = 20;
let currentOffset = 0;
let isLoading = false;
let hasMore = true;

document.addEventListener('DOMContentLoaded', async function() {
  console.log('디지털 보증서 목록 페이지 로드됨');
  
  // 개발 모드: localhost/127.0.0.1에서만 로그인 체크 우회
  // 운영 환경에서는 ?dev=true 파라미터를 무시 (보안)
  const isLocalhost = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';
  const isDevMode = isLocalhost; // localhost에서만 개발 모드 활성화
  
  let userInfo = null;
  
  if (!isDevMode) {
    // 프로덕션 모드: 로그인 상태 확인
    userInfo = await checkLoginStatus();
    if (!userInfo) {
      window.location.href = 'login.html';
      return;
    }
  } else {
    // 개발 모드: 더미 사용자 정보
    userInfo = {
      name: '개발자',
      email: 'dev@example.com'
    };
    console.log('개발 모드: 로그인 체크 우회됨');
  }

  // 사용자 환영 메시지 표시
  displayUserWelcome(userInfo);

  // 보증서 목록 로드
  await loadWarranties();
});

// 로그인 상태 확인
async function checkLoginStatus() {
  try {
    const response = await fetch(`${API_BASE}/auth/me`, {
      method: 'GET',
      credentials: 'include'
    });

    if (response.ok) {
      const data = await response.json();
      return data.user;
    }
    return null;
  } catch (error) {
    console.error('로그인 상태 확인 오류:', error);
    return null;
  }
}

// 사용자 환영 메시지 표시
function displayUserWelcome(user) {
  const welcomeText = document.getElementById('user-welcome-text');
  if (welcomeText && user.name) {
    welcomeText.textContent = `${user.name}님 환영합니다!`;
  }
}

// 보증서 목록 로드
async function loadWarranties(offset = 0, limit = DEFAULT_LIMIT) {
  if (isLoading) return;
  
  isLoading = true;
  showLoading(true);
  
  try {
    const response = await fetch(`${API_BASE}/warranties/me?limit=${limit}&offset=${offset}`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (data.success && data.warranties) {
      renderWarranties(data.warranties, offset === 0);
      currentOffset = offset + data.warranties.length;
      hasMore = data.warranties.length === limit && 
                 data.paging && 
                 currentOffset < data.paging.total;
    } else {
      renderWarranties([], true);
      hasMore = false;
    }
  } catch (error) {
    console.error('보증서 목록 로드 오류:', error);
    renderWarranties([], true);
    hasMore = false;
  } finally {
    isLoading = false;
    showLoading(false);
  }
}

// 보증서 목록 렌더링
function renderWarranties(warranties, replace = false) {
  const warrantiesList = document.getElementById('warranties-list');
  const noWarranties = document.getElementById('no-warranties');
  
  if (!warrantiesList || !noWarranties) {
    console.error('보증서 목록 컨테이너를 찾을 수 없습니다.');
    return;
  }

  if (!warranties || warranties.length === 0) {
    warrantiesList.style.display = 'none';
    noWarranties.style.display = 'block';
    return;
  }

  warrantiesList.style.display = 'block';
  noWarranties.style.display = 'none';

  // 기존 내용 제거하고 새로 렌더링 (replace가 true인 경우)
  if (replace) {
    warrantiesList.innerHTML = '';
  }

  // 보증서 항목 추가
  warranties.forEach(warranty => {
    const warrantyItem = createWarrantyItem(warranty);
    warrantiesList.appendChild(warrantyItem);
  });
}

// 보증서 항목 생성
function createWarrantyItem(warranty) {
  const item = document.createElement('div');
  item.className = 'warranty-item';
  
  const createdDate = formatDate(warranty.created_at);
  const verifiedDate = formatDate(warranty.verified_at);
  const productName = warranty.product_name || '제품명 없음';
  
  item.innerHTML = `
    <div class="warranty-content">
      <div class="warranty-info">
        <h3 class="warranty-product-name">${escapeHtml(productName)}</h3>
        <p class="warranty-date">발급일: ${createdDate}</p>
        <p class="warranty-verified">검증일: ${verifiedDate}</p>
      </div>
      <div class="warranty-actions">
        <a href="${warranty.detail_url}" class="warranty-detail-link">
          상세보기 →
        </a>
      </div>
    </div>
  `;
  
  return item;
}

// 날짜 포맷팅 (ISO 8601 → 한국어 형식)
function formatDate(isoDateString) {
  if (!isoDateString) return '날짜 없음';
  
  try {
    const date = new Date(isoDateString);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (error) {
    console.error('날짜 포맷팅 오류:', error);
    return isoDateString;
  }
}

// 로딩 상태 표시
function showLoading(show) {
  const loadingElement = document.getElementById('loading-warranties');
  if (loadingElement) {
    loadingElement.style.display = show ? 'block' : 'none';
  }
}

// HTML 이스케이프 (XSS 방지)
function escapeHtml(text) {
  if (text == null || text === undefined) {
    return '';
  }
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

