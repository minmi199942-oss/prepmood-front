// digital-invoice.js - 디지털 인보이스 목록 페이지 스크립트
const API_BASE = window.API_BASE || 
  ((window.location && window.location.origin)
    ? window.location.origin.replace(/\/$/, '') + '/api'
    : '/api');

// 모바일 감지
const isMobile = window.matchMedia('(pointer: coarse)').matches;

// 개발 환경 감지 (스크립트 로드 시점에 한 번만 판별, loadInvoices 등에서 사용)
// localhost / 127.0.0.1 일 때만 true. 운영에서는 절대 true 되지 않음.
function isDevEnvironment() {
  if (typeof window === 'undefined' || !window.location || !window.location.hostname) {
    return false;
  }
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}
const isDevMode = isDevEnvironment();

document.addEventListener('DOMContentLoaded', async function() {
  console.log('디지털 인보이스 목록 페이지 로드됨', { isDevMode, hostname: window.location.hostname });
  
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

  // 인보이스 목록 로드
  await loadInvoices();
  
  // 모바일 클릭 토글 초기화
  initMobileToggle();
  
  // 편지 내용 영역 클릭 이벤트 초기화 (편지가 열렸을 때만 작동)
  initLetterContentClick();
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

// invoiceNo 생성 함수 (PM-INV-YYMMDD-HHmm-{랜덤4자})
// 주의: 실제 서버에서는 backend/utils/invoice-number-generator.js 사용
// 이 함수는 프론트엔드 디스플레이용 (서버에서 받은 invoice_number를 그대로 표시)
function generateInvoiceNo(date = new Date()) {
  // 실제로는 서버에서 생성된 invoice_number를 사용하므로
  // 이 함수는 더미 데이터용으로만 사용됨
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  // 더미 데이터용 랜덤 4자 (실제 서버에서는 crypto.randomInt 사용)
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  
  return `PM-INV-${year}${month}${day}-${hours}${minutes}-${randomSuffix}`;
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

// 로컬 전용 더미 인보이스 (편지 디자인 수정용)
function getDummyInvoice() {
  const issuedAt = new Date('2025-02-15T14:30:00');
  return {
    invoiceId: 0,
    invoiceNumber: generateInvoiceNo(issuedAt),
    issuedAt: issuedAt.toISOString(),
    productName: 'Pre.p Mood 테넌 솔리드 니트 (Light Blue / M)',
    status: 'issued'
  };
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

// 인보이스 목록 로드
async function loadInvoices() {
  const grid = document.getElementById('invoiceGrid');
  const noInvoices = document.getElementById('no-invoices');
  const loadingInvoices = document.getElementById('loading-invoices');
  
  if (!grid) {
    console.error('invoiceGrid를 찾을 수 없습니다.');
    return;
  }

  // 로딩 표시
  if (loadingInvoices) {
    loadingInvoices.style.display = 'block';
  }
  if (grid) {
    grid.style.display = 'none';
  }
  if (noInvoices) {
    noInvoices.style.display = 'none';
  }

  try {
    const response = await fetch(`${API_BASE}/invoices/me?limit=50&offset=0`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // 디버깅: 인보이스 목록 로그 출력
    console.log('[INVOICE_LIST] 인보이스 목록 응답:', data);
    console.log('[INVOICE_LIST] 인보이스 개수:', data.invoices?.length || 0);
    if (data.invoices && data.invoices.length > 0) {
      console.log('[INVOICE_LIST] 인보이스 ID 목록:', data.invoices.map(inv => ({
        invoiceId: inv.invoiceId,
        invoiceNumber: inv.invoiceNumber
      })));
      // invoiceId=2가 있는지 확인
      const invoice2 = data.invoices.find(inv => inv.invoiceId === 2);
      if (invoice2) {
        console.log('[INVOICE_LIST] ✅ invoiceId=2 찾음:', invoice2);
      } else {
        console.log('[INVOICE_LIST] ❌ invoiceId=2 없음');
      }
    }
    
    if (data.success && data.invoices && data.invoices.length > 0) {
      renderInvoices(data.invoices);
      if (noInvoices) {
        noInvoices.style.display = 'none';
      }
    } else {
      // 인보이스가 없는 경우 (개발 환경에서만 더미 1장 표시하여 편지 디자인 수정 가능)
      const invoicesToRender = (isDevMode ? [getDummyInvoice()] : []);
      renderInvoices(invoicesToRender);
      if (noInvoices) {
        noInvoices.style.display = invoicesToRender.length > 0 ? 'none' : 'block';
      }
    }
  } catch (error) {
    console.error('인보이스 목록 로드 오류:', error);
    const invoicesToRender = (isDevMode ? [getDummyInvoice()] : []);
    renderInvoices(invoicesToRender);
    if (noInvoices) {
      noInvoices.style.display = invoicesToRender.length > 0 ? 'none' : 'block';
    }
  } finally {
    if (loadingInvoices) {
      loadingInvoices.style.display = 'none';
    }
  }
}

// 인보이스 렌더링
function renderInvoices(invoices) {
  const grid = document.getElementById('invoiceGrid');
  const noInvoices = document.getElementById('no-invoices');
  
  if (!grid) {
    console.error('invoiceGrid를 찾을 수 없습니다.');
    return;
  }

  // 그리드 표시
  grid.style.display = 'flex';
  
  // 그리드 초기화
  grid.innerHTML = '';
  
  // 카드 렌더링
  invoices.forEach((invoice, index) => {
    // API 응답 데이터를 카드 형식으로 변환
    const invoiceDate = new Date(invoice.issuedAt);
    const card = createInvoiceCard({
      invoiceId: invoice.invoiceId,  // invoiceId 추가
      invoiceNo: invoice.invoiceNumber,
      issueDate: formatIssueDate(invoiceDate),
      productName: invoice.productName || invoice.shippingName || invoice.billingName || '제품명',
      issueDateTime: formatDateTime(invoiceDate),
      isVerified: invoice.status === 'issued'
    }, index);
    grid.appendChild(card);
  });

  // 인보이스가 없는 경우 처리
  if (invoices.length === 0 && noInvoices) {
    grid.style.display = 'none';
  }
}

// 인보이스 카드 생성 (편지 디자인)
function createInvoiceCard(invoice, index) {
  const wrapper = document.createElement('div');
  wrapper.className = 'invoice-letter-card';
  
  // 클릭 시 상세 페이지로 이동은 initLetterContentClick()에서 처리
  // invoiceId는 반드시 invoice_id (숫자)를 사용해야 함 (API가 숫자면 invoice_id로 조회)
  const invoiceId = invoice.invoiceId; // invoice_id만 사용 (invoiceNumber는 fallback 제거)
  if (invoiceId) {
    wrapper.style.cursor = 'pointer';
  }
  
  // 인보이스 데이터에서 정보 추출 (데모 데이터)
  const productName = invoice.productName || '제품명';
  const issueDateTime = invoice.issueDateTime || formatDateTime(new Date(invoice.issueDate || new Date()));
  const isVerified = invoice.isVerified !== undefined ? invoice.isVerified : true;
  
  wrapper.innerHTML = `
    <div class="invoice-letter-card-wrapper">
      <!-- 하단 고정 - 회색 봉투 본체 -->
      <div class="invoice-envelope-body">
        <div class="invoice-envelope-brand">
          <img src="/image/prep2.png" alt="Pre.pMood" class="invoice-envelope-logo">
          <img src="/image/logo2.png" alt="Pre.pMood Logo" class="invoice-envelope-logo-secondary">
        </div>
      </div>

      <!-- 하단 씰 -->
      <div class="invoice-seal-bottom">
        <svg class="invoice-seal-bottom-circle" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M24.699 48.8979C38.0637 48.8979 48.898 38.0637 48.898 24.699C48.898 11.3342 38.0637 0.5 24.699 0.5C11.3342 0.5 0.5 11.3342 0.5 24.699C0.5 38.0637 11.3342 48.8979 24.699 48.8979Z" fill="#CCCCCC" stroke="#CCCCCC" stroke-miterlimit="10"/>
          <!-- 작은 원 (하단) -->
          <svg x="18" y="18" width="15" height="15" viewBox="0 0 7 7" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3.18903 0C1.42803 0 0 1.42803 0 3.18903C0 4.95003 1.42803 6.37799 3.18903 6.37799C4.95003 6.37799 6.37799 4.95003 6.37799 3.18903C6.37799 1.42803 4.95003 0 3.18903 0ZM3.18903 5.44104C1.94503 5.44104 0.937012 4.43303 0.937012 3.18903C0.937012 1.94503 1.94503 0.937012 3.18903 0.937012C4.43303 0.937012 5.44104 1.94503 5.44104 3.18903C5.44104 4.43303 4.43303 5.44104 3.18903 5.44104Z" fill="white"/>
          </svg>
        </svg>
      </div>

      <!-- 그레이 레이어 (greylayer.png) -->
      <div class="invoice-greylayer">
        <img src="/image/greylayer.png" alt="" class="invoice-greylayer-img" width="56" height="156">
      </div>

      <!-- 중간 - 인보이스 내용 영역 -->
      <div class="invoice-letter-content" data-invoice-id="${escapeHtml(invoiceId)}">
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
              <img src="/image/prep3.png" alt="Pre.pMood" class="invoice-content-brand-logo">
            </div>
          </div>
        </div>
      </div>

      <!-- 상단 씰 -->
      <div class="invoice-seal-top">
        <svg class="invoice-seal-top-circle" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M24.699 48.8979C38.0637 48.8979 48.898 38.0637 48.898 24.699C48.898 11.3342 38.0637 0.5 24.699 0.5C11.3342 0.5 0.5 11.3342 0.5 24.699C0.5 38.0637 11.3342 48.8979 24.699 48.8979Z" fill="#CCCCCC" stroke="#CCCCCC" stroke-miterlimit="10"/>
          <!-- 작은 원 (상단) -->
          <svg x="18" y="18" width="15" height="15" viewBox="0 0 7 7" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3.18903 0C1.42803 0 0 1.42803 0 3.18903C0 4.95003 1.42803 6.37799 3.18903 6.37799C4.95003 6.37799 6.37799 4.95003 6.37799 3.18903C6.37799 1.42803 4.95003 0 3.18903 0ZM3.18903 5.44104C1.94503 5.44104 0.937012 4.43303 0.937012 3.18903C0.937012 1.94503 1.94503 0.937012 3.18903 0.937012C4.43303 0.937012 5.44104 1.94503 5.44104 3.18903C5.44104 4.43303 4.43303 5.44104 3.18903 5.44104Z" fill="white"/>
          </svg>
        </svg>
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
        <span class="status-value-wrapper">
          <svg class="invoice-check-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="#0c3008" stroke-width="2" fill="none"/>
            <path d="M8 12l2 2 4-4" stroke="#0c3008" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
          <svg class="invoice-warning-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 22H22L12 2Z" fill="#310809"/>
            <path d="M12 8V14M12 18H12.01" stroke="white" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <span class="status-value">${isVerified ? 'VERIFIED' : 'INVALID'}</span>
        </span>
      </p>
    </div>
  `;
  
  return wrapper;
}

// 모바일 클릭 토글 초기화
function initMobileToggle() {
  if (!isMobile) return;
  
  document.addEventListener('click', function(e) {
    // 내부 요소 클릭 무시 (링크, 버튼 등)
    if (e.target.closest('a, button, input, textarea, select, [data-no-toggle]')) {
      return;
    }
    
    const card = e.target.closest('.invoice-letter-card');
    if (!card) {
      // 외부 클릭 시 모든 카드 닫기
      document.querySelectorAll('.invoice-letter-card[data-open="true"]').forEach(c => {
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
      document.querySelectorAll('.invoice-letter-card[data-open="true"]').forEach(c => {
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

// 편지 내용 영역 클릭 이벤트 초기화
function initLetterContentClick() {
  // 이벤트 위임을 사용하여 동적으로 생성된 편지 내용 영역에도 이벤트 적용
  document.addEventListener('click', function(e) {
    const letterContent = e.target.closest('.invoice-letter-content');
    if (!letterContent) {
      return;
    }
    
    // SVG, 이미지 클릭은 무시
    if (e.target.closest('svg, img')) {
      return;
    }
    
    // 편지가 열린 상태인지 확인
    const card = letterContent.closest('.invoice-letter-card');
    if (!card) {
      return;
    }
    
    // 호버 상태 또는 모바일에서 is-open 클래스 확인
    const isOpen = card.matches(':hover') || 
                   card.classList.contains('is-open') ||
                   (getComputedStyle(letterContent).opacity !== '0' && 
                    getComputedStyle(letterContent).height !== '0px');
    
    // 편지가 열린 상태에서만 상세 페이지로 이동
    if (isOpen) {
      const invoiceId = letterContent.getAttribute('data-invoice-id');
      if (invoiceId) {
        e.preventDefault();
        e.stopPropagation();
        window.location.href = `/invoice-detail.html?invoiceId=${encodeURIComponent(invoiceId)}`;
      }
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
