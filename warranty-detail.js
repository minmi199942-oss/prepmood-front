// warranty-detail.js - 보증서 상세 페이지 스크립트
const API_BASE = window.API_BASE || 
  ((window.location && window.location.origin)
    ? window.location.origin.replace(/\/$/, '') + '/api'
    : '/api');

document.addEventListener('DOMContentLoaded', async function() {
  console.log('보증서 상세 페이지 로드됨');
  
  // 로그인 상태 확인
  const userInfo = await checkLoginStatus();
  if (!userInfo) {
    window.location.href = '/login.html';
    return;
  }

  // 사용자 환영 메시지 표시
  displayUserWelcome(userInfo);

  // URL에서 public_id 추출
  const publicId = extractPublicIdFromUrl();
  if (!publicId) {
    showError('보증서 ID가 올바르지 않습니다.');
    return;
  }

  // 보증서 상세 정보 로드
  await loadWarrantyDetail(publicId);
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

// URL에서 public_id 추출
function extractPublicIdFromUrl() {
  const path = window.location.pathname;
  // /warranty/:public_id 형식에서 추출
  const match = path.match(/\/warranty\/([a-f0-9-]+)/i);
  return match ? match[1] : null;
}

// 보증서 상세 정보 로드
async function loadWarrantyDetail(publicId) {
  showLoading(true);
  
  try {
    const response = await fetch(`${API_BASE}/warranties/${publicId}`, {
      method: 'GET',
      credentials: 'include'
    });

    if (response.status === 404) {
      showError('보증서를 찾을 수 없습니다.');
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (data.success && data.warranty) {
      renderWarrantyDetail(data.warranty);
    } else {
      showError('보증서 정보를 불러올 수 없습니다.');
    }
  } catch (error) {
    console.error('보증서 상세 정보 로드 오류:', error);
    showError('보증서 정보를 불러오는 중 오류가 발생했습니다.');
  } finally {
    showLoading(false);
  }
}

// 보증서 상세 정보 렌더링
function renderWarrantyDetail(warranty) {
  const content = document.getElementById('warranty-detail-content');
  const noWarranty = document.getElementById('no-warranty');
  
  if (!content || !noWarranty) {
    console.error('보증서 상세 컨테이너를 찾을 수 없습니다.');
    return;
  }

  content.style.display = 'block';
  noWarranty.style.display = 'none';

  const createdDate = formatDate(warranty.created_at);
  const verifiedDate = formatDate(warranty.verified_at);
  const productName = warranty.product_name || '제품명 없음';
  
  content.innerHTML = `
    <div class="warranty-detail-card">
      <div class="warranty-detail-header">
        <h2 class="warranty-product-name">${escapeHtml(productName)}</h2>
        <div class="warranty-id-badge">보증서 ID: ${warranty.public_id.substring(0, 8)}...</div>
      </div>
      
      <div class="warranty-detail-info">
        <div class="warranty-info-item">
          <span class="warranty-info-label">제품명</span>
          <span class="warranty-info-value">${escapeHtml(productName)}</span>
        </div>
        
        <div class="warranty-info-item">
          <span class="warranty-info-label">발급일</span>
          <span class="warranty-info-value">${createdDate}</span>
        </div>
        
        <div class="warranty-info-item">
          <span class="warranty-info-label">검증일</span>
          <span class="warranty-info-value">${verifiedDate}</span>
        </div>
        
        <div class="warranty-info-item">
          <span class="warranty-info-label">보증서 번호</span>
          <span class="warranty-info-value warranty-id">${warranty.public_id}</span>
        </div>
      </div>
      
      <div class="warranty-detail-footer">
        <p class="warranty-note">이 보증서는 디지털 방식으로 발급되었으며, 제품의 정품 인증을 확인합니다.</p>
      </div>
    </div>
  `;
}

// 날짜 포맷팅 (ISO 8601 → 한국어 형식)
function formatDate(isoDateString) {
  if (!isoDateString) return '날짜 없음';
  
  try {
    const date = new Date(isoDateString);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    console.error('날짜 포맷팅 오류:', error);
    return isoDateString;
  }
}

// 로딩 상태 표시
function showLoading(show) {
  const loadingElement = document.getElementById('loading-warranty');
  if (loadingElement) {
    loadingElement.style.display = show ? 'block' : 'none';
  }
}

// 에러 상태 표시
function showError(message) {
  const content = document.getElementById('warranty-detail-content');
  const noWarranty = document.getElementById('no-warranty');
  const loadingElement = document.getElementById('loading-warranty');
  
  if (loadingElement) {
    loadingElement.style.display = 'none';
  }
  
  if (content) {
    content.style.display = 'none';
  }
  
  if (noWarranty) {
    noWarranty.style.display = 'block';
    const titleElement = noWarranty.querySelector('.no-warranty-title');
    if (titleElement) {
      titleElement.textContent = message;
    }
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

