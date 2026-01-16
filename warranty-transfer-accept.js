// warranty-transfer-accept.js - 보증서 양도 수락 페이지 스크립트
const API_BASE = window.API_BASE || 
  ((window.location && window.location.origin)
    ? window.location.origin.replace(/\/$/, '') + '/api'
    : '/api');

let transferId = null;
let urlCode = null;

document.addEventListener('DOMContentLoaded', async function() {
  console.log('보증서 양도 수락 페이지 로드됨');
  
  // URL 파라미터 추출
  const urlParams = new URLSearchParams(window.location.search);
  transferId = urlParams.get('transfer_id');
  urlCode = urlParams.get('code');
  
  if (!transferId) {
    showError('양도 요청 ID가 올바르지 않습니다.');
    return;
  }
  
  // 로그인 상태 확인
  const userInfo = await checkLoginStatus();
  if (!userInfo) {
    // 로그인 페이지로 리다이렉트 (returnTo 파라미터 포함)
    const currentUrl = encodeURIComponent(window.location.href);
    window.location.href = `/login.html?returnTo=${currentUrl}`;
    return;
  }
  
  // 사용자 환영 메시지 표시
  displayUserWelcome(userInfo);
  
  // URL에 코드가 있으면 힌트로 표시 (자동 입력하지 않음 - 보안)
  if (urlCode) {
    const codeInput = document.getElementById('transfer-code');
    if (codeInput) {
      codeInput.placeholder = `예: ${urlCode.substring(0, 3)}... (이메일로 받은 코드 입력)`;
    }
  }
  
  // Enter 키로 제출
  const codeInput = document.getElementById('transfer-code');
  if (codeInput) {
    codeInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        handleAccept();
      }
    });
  }
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

// 양도 수락 처리
async function handleAccept() {
  const codeInput = document.getElementById('transfer-code');
  const transferCode = codeInput ? codeInput.value.trim().toUpperCase() : '';
  
  // 입력 검증
  if (!transferCode) {
    alert('양도 코드를 입력하세요.');
    if (codeInput) {
      codeInput.focus();
    }
    return;
  }
  
  if (transferCode.length !== 7) {
    alert('양도 코드는 7자리여야 합니다.');
    if (codeInput) {
      codeInput.focus();
    }
    return;
  }
  
  // 확인
  if (!confirm('보증서 양도를 수락하시겠습니까?\n\n양도가 완료되면 보증서 소유권이 이전됩니다.')) {
    return;
  }
  
  // UI 상태 변경
  showLoading(true);
  hideError();
  hideSuccess();
  
  try {
    const response = await fetch(`${API_BASE}/warranties/transfer/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        transfer_id: parseInt(transferId),
        transfer_code: transferCode
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || `HTTP ${response.status}`);
    }
    
    if (data.success) {
      showSuccess();
    } else {
      throw new Error(data.message || '양도 수락 실패');
    }
  } catch (error) {
    console.error('양도 수락 오류:', error);
    showError(error.message || '양도 수락 중 오류가 발생했습니다.');
  } finally {
    showLoading(false);
  }
}

// 전역 함수로 등록 (onclick에서 사용)
window.handleAccept = handleAccept;

// UI 상태 관리
function showLoading(show) {
  const form = document.getElementById('transfer-form');
  const loading = document.getElementById('loading-state');
  const acceptBtn = document.getElementById('accept-btn');
  
  if (form) form.style.display = show ? 'none' : 'block';
  if (loading) loading.style.display = show ? 'block' : 'none';
  if (acceptBtn) acceptBtn.disabled = show;
}

function showSuccess() {
  const form = document.getElementById('transfer-form');
  const success = document.getElementById('success-message');
  
  if (form) form.style.display = 'none';
  if (success) success.style.display = 'block';
}

function showError(message) {
  const form = document.getElementById('transfer-form');
  const error = document.getElementById('error-message');
  const errorText = document.getElementById('error-text');
  
  if (form) form.style.display = 'none';
  if (error) error.style.display = 'block';
  if (errorText && message) {
    errorText.textContent = escapeHtml(message);
  }
}

function hideError() {
  const error = document.getElementById('error-message');
  if (error) error.style.display = 'none';
}

function hideSuccess() {
  const success = document.getElementById('success-message');
  if (success) success.style.display = 'none';
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
