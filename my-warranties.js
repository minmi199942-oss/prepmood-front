// my-warranties.js - 보증서 목록 페이지 스크립트
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
  console.log('보증서 목록 페이지 로드됨');
  
  // 로그인 상태 확인
  const userInfo = await checkLoginStatus();
  if (!userInfo) {
    window.location.href = 'login.html';
    return;
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
  const status = warranty.status || 'unknown';
  
  // 상태 배지 생성
  const statusBadge = getStatusBadge(status);
  
  // 활성화 버튼 (status = 'issued'인 경우만 표시)
  const activateButton = status === 'issued' ? `
    <button class="btn-activate" onclick="handleActivate(${warranty.id})">
      활성화하기
    </button>
  ` : '';
  
  item.innerHTML = `
    <div class="warranty-content">
      <div class="warranty-info">
        <h3 class="warranty-product-name">${escapeHtml(productName)}</h3>
        <p class="warranty-date">발급일: ${createdDate}</p>
        <p class="warranty-verified">검증일: ${verifiedDate || '-'}</p>
        <div class="warranty-status">${statusBadge}</div>
      </div>
      <div class="warranty-actions">
        ${activateButton}
        <a href="${warranty.detail_url}" class="warranty-detail-link">
          상세보기 →
        </a>
      </div>
    </div>
  `;
  
  return item;
}

// 상태 배지 생성
function getStatusBadge(status) {
  const statusMap = {
    'issued': { label: '발급됨', class: 'badge-info' },
    'issued_unassigned': { label: '미할당', class: 'badge-secondary' },
    'active': { label: '활성화', class: 'badge-success' },
    'suspended': { label: '제재', class: 'badge-warning' },
    'revoked': { label: '환불됨', class: 'badge-danger' }
  };
  
  const { label, class: className } = statusMap[status] || { label: status, class: 'badge-secondary' };
  return `<span class="badge ${className}">${label}</span>`;
}

// 활성화 처리 함수
async function handleActivate(warrantyId) {
  // 동의 확인
  const agreeText = `보증서를 활성화하시겠습니까?\n\n활성화된 보증서는 양도 및 환불 정책이 적용됩니다.`;
  if (!confirm(agreeText)) {
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/warranties/${warrantyId}/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        agree: true
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || `HTTP ${response.status}`);
    }
    
    if (data.success) {
      alert('보증서가 성공적으로 활성화되었습니다.');
      // 목록 새로고침
      await loadWarranties(0, DEFAULT_LIMIT);
    } else {
      throw new Error(data.message || '활성화 실패');
    }
  } catch (error) {
    console.error('보증서 활성화 오류:', error);
    alert(`보증서 활성화에 실패했습니다: ${error.message}`);
  }
}

// 전역 함수로 등록 (onclick에서 사용)
window.handleActivate = handleActivate;

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

