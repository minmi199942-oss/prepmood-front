// digital-invoice.js - 디지털 인보이스 목록 페이지 스크립트
const API_BASE = window.API_BASE || 
  ((window.location && window.location.origin)
    ? window.location.origin.replace(/\/$/, '') + '/api'
    : '/api');

// 모바일 감지 (pointer: coarse)
const isMobile = window.matchMedia('(pointer: coarse)').matches;

document.addEventListener('DOMContentLoaded', async function() {
  console.log('디지털 인보이스 목록 페이지 로드됨');
  
  // 로그인 상태 확인
  const userInfo = await checkLoginStatus();
  if (!userInfo) {
    window.location.href = 'login.html';
    return;
  }

  // 사용자 환영 메시지 표시
  displayUserWelcome(userInfo);

  // 강제 테스트 코드 (기본 구조 확인용)
  const grid = document.getElementById('invoiceGrid');
  if (grid) {
    // 테스트: 기본 구조 확인
    grid.innerHTML = `
      <div class="invoice-card">
        <div class="envelope">
          <div class="env-body"></div>
          <div class="env-flap"></div>
          <div class="letter">
            <div class="letter-mid">
              <div>
                <strong>INVOICE</strong><br>
                INVOICE NO. PM-INV-260103-2305<br>
                ISSUE DATE : 12 Mar 2026
              </div>
              <div class="brand">Pre.pMood</div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // 편지(봉투) 카드 인터랙션 초기화
    initEnvelopeInteractions();
    
    // 나중에 실제 데이터로 교체
    // renderInvoices();
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

// invoiceNo 생성 함수 (PM-INV-YYMMDD-HHMM)
function generateInvoiceNo(date = new Date()) {
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `PM-INV-${year}${month}${day}-${hours}${minutes}`;
}

// issueDate 포맷 함수 (DD Mon YYYY)
function formatIssueDate(date = new Date()) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  
  return `${day} ${month} ${year}`;
}

// 편지(봉투) 카드 인터랙션 초기화
function initEnvelopeInteractions() {
  const envelopes = document.querySelectorAll('.envelope');
  
  envelopes.forEach(envelope => {
    // 모바일: 클릭 토글
    if (isMobile) {
      envelope.addEventListener('click', function(e) {
        e.preventDefault();
        this.classList.toggle('opened');
      });
    }
    
    // 키보드 접근성: Enter/Space로 토글
    envelope.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.classList.toggle('opened');
      }
    });
  });
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
