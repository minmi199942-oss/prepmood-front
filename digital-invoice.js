// digital-invoice.js - 디지털 인보이스 목록 페이지 스크립트
const API_BASE = window.API_BASE || 
  ((window.location && window.location.origin)
    ? window.location.origin.replace(/\/$/, '') + '/api'
    : '/api');

// 페이지네이션 설정
const DEFAULT_LIMIT = 20;
let currentOffset = 0;
let isLoading = false;
let hasMore = true;

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

  // 편지(봉투) 카드 인터랙션 초기화
  initEnvelopeInteractions();

  // 데모 인보이스 렌더링 (나중에 서버 데이터로 교체)
  renderDemoInvoices();
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

// HTML 이스케이프 (XSS 방지)
function escapeHtml(text) {
  if (text == null || text === undefined) {
    return '';
  }
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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
  const envelopes = document.querySelectorAll('.pm-envelope');
  
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

// 데모 인보이스 렌더링
function renderDemoInvoices() {
  const invoicesList = document.getElementById('invoices-list');
  const noInvoices = document.getElementById('no-invoices');
  
  if (!invoicesList || !noInvoices) {
    console.error('인보이스 목록 컨테이너를 찾을 수 없습니다.');
    return;
  }

  // 데모 데이터 (나중에 서버에서 가져올 데이터)
  const demoInvoices = [
    {
      invoiceNo: generateInvoiceNo(new Date()),
      issueDate: formatIssueDate(new Date())
    },
    {
      invoiceNo: generateInvoiceNo(new Date(Date.now() - 86400000)), // 어제
      issueDate: formatIssueDate(new Date(Date.now() - 86400000))
    }
  ];

  if (demoInvoices.length === 0) {
    invoicesList.style.display = 'none';
    noInvoices.style.display = 'block';
    return;
  }

  invoicesList.style.display = 'grid';
  noInvoices.style.display = 'none';
  invoicesList.innerHTML = '';

  demoInvoices.forEach(invoice => {
    const envelopeCard = createEnvelopeCard(invoice);
    invoicesList.appendChild(envelopeCard);
  });

  // 인터랙션 재초기화
  initEnvelopeInteractions();
}

// 편지(봉투) 카드 생성
function createEnvelopeCard(invoice) {
  const envelope = document.createElement('div');
  envelope.className = 'pm-envelope';
  envelope.setAttribute('tabindex', '0');
  envelope.setAttribute('role', 'button');
  envelope.setAttribute('aria-label', `인보이스 ${invoice.invoiceNo} 열기`);
  
  envelope.innerHTML = `
    <div class="pm-envelope-wrapper">
      <div class="pm-envelope-body">
        <div class="pm-envelope-flap"></div>
        <div class="pm-envelope-letter">
          <div class="pm-letter-header">
            <h2 class="pm-letter-title">INVOICE</h2>
            <div class="pm-letter-brand">Pre.pMood</div>
          </div>
          <div class="pm-letter-content">
            <p class="pm-invoice-info">
              <span class="pm-invoice-info-label">INVOICE NO.</span>
              <span id="invoice-no-${invoice.invoiceNo.replace(/[^a-zA-Z0-9]/g, '-')}" data-invoice-no="${escapeHtml(invoice.invoiceNo)}">${escapeHtml(invoice.invoiceNo)}</span>
            </p>
            <p class="pm-invoice-info">
              <span class="pm-invoice-info-label">ISSUE DATE :</span>
              <span id="issue-date-${invoice.invoiceNo.replace(/[^a-zA-Z0-9]/g, '-')}" data-issue-date="${escapeHtml(invoice.issueDate)}">${escapeHtml(invoice.issueDate)}</span>
            </p>
          </div>
          <div class="pm-letter-footer">
            <div class="pm-footer-brand">Pre.pMood</div>
            <p class="pm-footer-tagline">The Art of Modern Heritage</p>
          </div>
        </div>
      </div>
    </div>
  `;
  
  return envelope;
}

