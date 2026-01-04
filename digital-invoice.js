// digital-invoice.js - 디지털 인보이스 목록 페이지 스크립트
const API_BASE = window.API_BASE || 
  ((window.location && window.location.origin)
    ? window.location.origin.replace(/\/$/, '') + '/api'
    : '/api');

// 모바일 감지
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
      issueDate: formatIssueDate(new Date())
    },
    {
      invoiceNo: generateInvoiceNo(new Date(Date.now() - 86400000)), // 어제
      issueDate: formatIssueDate(new Date(Date.now() - 86400000))
    }
  ];

  // 최소 1개는 항상 보장
  if (invoices.length === 0) {
    invoices.push({
      invoiceNo: generateInvoiceNo(),
      issueDate: formatIssueDate()
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

// 인보이스 카드 생성
function createInvoiceCard(invoice, index) {
  const article = document.createElement('article');
  article.className = 'invoice-card is-closed';
  article.setAttribute('data-invoice-no', escapeHtml(invoice.invoiceNo));
  
  article.innerHTML = `
    <div class="envelope">
      <div class="env-flap"></div>
      <div class="env-body">
        <div class="env-brand">
          <div class="brand-text">Pre.pMood</div>
          <div class="brand-tagline">The Art of Modern Heritage</div>
          <div class="brand-crest"></div>
        </div>
      </div>
    </div>
    <div class="letter">
      <div class="letter-top"></div>
      <div class="letter-mid">
        <div class="letter-content-left">
          <strong>INVOICE</strong>
          <div class="invoice-info">
            <span>INVOICE NO. ${escapeHtml(invoice.invoiceNo)}</span>
            <span>ISSUE DATE : ${escapeHtml(invoice.issueDate)}</span>
          </div>
        </div>
        <div class="letter-content-right">
          <div class="brand">Pre.pMood</div>
        </div>
      </div>
      <div class="letter-bottom">
        <div class="brand-text">Pre.pMood</div>
        <div class="brand-tagline">The Art of Modern Heritage</div>
      </div>
    </div>
  `;
  
  return article;
}

// 모바일 클릭 토글 초기화
function initMobileToggle() {
  if (!isMobile) return;
  
  document.addEventListener('click', function(e) {
    const card = e.target.closest('.invoice-card');
    if (!card) {
      // 외부 클릭 시 모든 카드 닫기
      document.querySelectorAll('.invoice-card.is-open').forEach(c => {
        c.classList.remove('is-open');
        c.classList.add('is-closed');
      });
      return;
    }
    
    // 카드 클릭 시 토글
    if (card.classList.contains('is-closed')) {
      // 다른 열린 카드 닫기
      document.querySelectorAll('.invoice-card.is-open').forEach(c => {
        c.classList.remove('is-open');
        c.classList.add('is-closed');
      });
      // 현재 카드 열기
      card.classList.remove('is-closed');
      card.classList.add('is-open');
    } else {
      // 현재 카드 닫기
      card.classList.remove('is-open');
      card.classList.add('is-closed');
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
