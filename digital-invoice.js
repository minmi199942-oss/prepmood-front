// digital-invoice.js - 디지털 인보이스 목록 페이지 스크립트
const API_BASE = window.API_BASE || 
  ((window.location && window.location.origin)
    ? window.location.origin.replace(/\/$/, '') + '/api'
    : '/api');

// 모바일 감지
const isMobile = window.matchMedia('(pointer: coarse)').matches;

document.addEventListener('DOMContentLoaded', async function() {
  console.log('디지털 인보이스 목록 페이지 로드됨');
  
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

  // 인보이스 렌더링 (최소 1개 더미 카드 보장)
  renderInvoices();
  
  // 모바일 클릭 토글 초기화
  initMobileToggle();
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

// invoiceNo 생성 함수 (PM-INV-YYMMDD-HHmm)
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

// DATE 포맷 함수 (YYYY-MM-DD HH:MM:SS)
function formatDateTime(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 인보이스 렌더링
function renderInvoices() {
  const grid = document.getElementById('invoiceGrid');
  const noInvoices = document.getElementById('no-invoices');
  
  if (!grid) {
    console.error('invoiceGrid를 찾을 수 없습니다.');
    return;
  }

  // 더미 데이터 (나중에 서버에서 가져올 데이터)
  const invoices = [
    {
      invoiceNo: generateInvoiceNo(new Date()),
      issueDate: formatIssueDate(new Date()),
      productName: '제품명',
      issueDateTime: formatDateTime(new Date()),
      isVerified: true
    },
    {
      invoiceNo: generateInvoiceNo(new Date(Date.now() - 86400000)), // 어제
      issueDate: formatIssueDate(new Date(Date.now() - 86400000)),
      productName: '제품명',
      issueDateTime: formatDateTime(new Date(Date.now() - 86400000)),
      isVerified: false
    }
  ];

  // 최소 1개는 항상 보장
  if (invoices.length === 0) {
    invoices.push({
      invoiceNo: generateInvoiceNo(),
      issueDate: formatIssueDate(),
      productName: '제품명',
      issueDateTime: formatDateTime(),
      isVerified: true
    });
  }

  // 그리드 초기화
  grid.innerHTML = '';
  
  // 카드 렌더링
  invoices.forEach((invoice, index) => {
    const card = createInvoiceCard(invoice, index);
    grid.appendChild(card);
  });

  // no-invoices 숨김
  if (noInvoices) {
    noInvoices.style.display = 'none';
  }
}

// 인보이스 카드 생성 (편지 디자인)
function createInvoiceCard(invoice, index) {
  const wrapper = document.createElement('div');
  wrapper.className = 'invoice-letter-card';
  
  // 인보이스 데이터에서 정보 추출 (데모 데이터)
  const productName = invoice.productName || '제품명';
  const issueDateTime = invoice.issueDateTime || formatDateTime(new Date(invoice.issueDate || new Date()));
  const isVerified = invoice.isVerified !== undefined ? invoice.isVerified : true;
  
  wrapper.innerHTML = `
    <div class="invoice-letter-card-wrapper">
      <!-- 하단 고정 - 회색 봉투 본체 -->
      <div class="invoice-envelope-body">
        <div class="invoice-envelope-brand">
          <img src="image/prep2.png" alt="Pre.pMood" class="invoice-envelope-logo">
          <img src="image/logo2.png" alt="Pre.pMood Logo" class="invoice-envelope-logo-secondary">
        </div>
      </div>

      <!-- 중간 - 인보이스 내용 영역 -->
      <div class="invoice-letter-content">
        <div class="invoice-letter-content-inner">
          <div class="invoice-letter-content-grid">
            <div class="invoice-letter-content-left">
              <p class="invoice-title">INVOICE</p>
              <p class="invoice-meta">
                <span class="invoice-no-label">IN</span><span class="invoice-no-value">VOICE NO. </span><span class="invoice-no-value">${escapeHtml(invoice.invoiceNo)}</span>
              </p>
              <p class="invoice-meta">
                <span class="issue-date-label">ISSU</span><span class="issue-date-value">E DATE : </span><span class="issue-date-value">${escapeHtml(invoice.issueDate)}</span>
              </p>
            </div>
            <div class="invoice-letter-content-right">
              <img src="image/prep3.png" alt="Pre.pMood" class="invoice-content-brand-logo">
            </div>
          </div>
        </div>
      </div>

      <!-- 전체 흰색 레이어 - 상단 씰, 스트립, 하단 씰을 모두 감싸는 -->
      <div class="invoice-seal-complete-white-wrapper">
        <div class="invoice-seal-complete-white-layer"></div>
      </div>

      <!-- 하단 씰 - 고정 -->
      <div class="invoice-seal-bottom">
        <div class="invoice-seal-bottom-wrapper">
          <div class="invoice-seal-bottom-white-band"></div>
          <div class="invoice-seal-circle">
            <div class="invoice-seal-circle-inner">
              <div class="invoice-seal-circle-core"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 하단 연결부 -->
      <div class="invoice-connector-bottom">
        <div class="invoice-connector-outer">
          <div class="invoice-connector-outer-white"></div>
          <div class="invoice-connector-inner"></div>
        </div>
      </div>

      <!-- 상단 씰 + 상단 연결부 그룹 -->
      <div class="invoice-seal-top-group">
        <div class="invoice-seal-top-wrapper">
          <div class="invoice-seal-top-white-band"></div>
          <!-- 상단 씰 -->
          <div class="invoice-seal-top">
            <div class="invoice-seal-circle">
              <div class="invoice-seal-circle-inner">
                <div class="invoice-seal-circle-core"></div>
              </div>
            </div>
          </div>

          <!-- 상단 연결부 -->
          <div class="invoice-connector-top">
            <div class="invoice-connector-outer">
              <div class="invoice-connector-top-white"></div>
              <div class="invoice-connector-top-inner"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 상단 뚜껑 -->
      <div class="invoice-envelope-flap"></div>
    </div>

    <!-- 카드 밑 정보 영역 -->
    <div class="invoice-card-info-footer">
      <p class="product-info">
        <span class="info-label">PRODUCT NAME:</span> 
        <span class="info-value">${escapeHtml(productName)}</span>
      </p>
      <p class="product-info">
        <span class="info-label">DATE:</span> 
        <span class="info-value">${escapeHtml(issueDateTime)}</span>
      </p>
      <p class="status ${isVerified ? 'verified' : 'invalid'}">
        <span class="status-label">STATUS:</span>
        <svg class="invoice-check-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="#0c3008" stroke-width="2" fill="none"/>
          <path d="M8 12l2 2 4-4" stroke="#0c3008" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
        <svg class="invoice-warning-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L2 22H22L12 2Z" fill="#310809"/>
          <path d="M12 8V14M12 18H12.01" stroke="white" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <span class="status-value">${isVerified ? 'VERIFIED' : 'INVALID'}</span>
      </p>
    </div>
  `;
  
  return wrapper;
}

// 모바일 클릭 토글 초기화
function initMobileToggle() {
  if (!isMobile) return;
  
  document.addEventListener('click', function(e) {
    const card = e.target.closest('.invoice-card');
    if (!card) {
      // 외부 클릭 시 모든 카드 닫기
      document.querySelectorAll('.invoice-card[data-open="true"]').forEach(c => {
        c.classList.remove('is-open');
        c.classList.add('is-closed');
        c.setAttribute('data-open', 'false');
      });
      return;
    }
    
    // 카드 클릭 시 토글
    const isOpen = card.getAttribute('data-open') === 'true';
    if (!isOpen) {
      // 다른 열린 카드 닫기
      document.querySelectorAll('.invoice-card[data-open="true"]').forEach(c => {
        c.classList.remove('is-open');
        c.classList.add('is-closed');
        c.setAttribute('data-open', 'false');
      });
      // 현재 카드 열기
      card.classList.remove('is-closed');
      card.classList.add('is-open');
      card.setAttribute('data-open', 'true');
    } else {
      // 현재 카드 닫기
      card.classList.remove('is-open');
      card.classList.add('is-closed');
      card.setAttribute('data-open', 'false');
    }
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
