// invoice-detail.js - 인보이스 상세 페이지 스크립트
const API_BASE = window.API_BASE || 
  ((window.location && window.location.origin)
    ? window.location.origin.replace(/\/$/, '') + '/api'
    : '/api');

document.addEventListener('DOMContentLoaded', async function() {
  console.log('인보이스 상세 페이지 로드됨');
  
  // 개발 모드 감지:
  // 1. URL에 ?dev=true 파라미터가 있으면
  // 2. 로컬 파일(file://) 또는 localhost에서 실행 중이면
  const urlParams = new URLSearchParams(window.location.search);
  const isLocalFile = window.location.protocol === 'file:';
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const devMode = urlParams.get('dev') === 'true' || isLocalFile || isLocalhost;
  
  // 로그인 상태 확인 (개발 모드가 아닐 때만)
  let userInfo = null;
  if (!devMode) {
    userInfo = await checkLoginStatus();
    if (!userInfo) {
      window.location.href = '/login.html';
      return;
    }
  } else {
    console.log('[개발 모드] 로그인 체크 우회');
    // 개발 모드일 때는 더미 사용자 정보
    userInfo = { name: '개발자' };
  }

  // 사용자 환영 메시지 표시 (새 HTML 구조에서는 요소가 없으므로 주석 처리)
  // displayUserWelcome(userInfo);

  // URL에서 invoiceId 또는 invoiceNumber 추출
  const invoiceId = extractInvoiceIdFromUrl();
  
  // 개발 모드이고 invoiceId가 없으면 더미 ID 사용
  if (devMode && !invoiceId) {
    console.log('[개발 모드] invoiceId가 없어서 더미 ID 사용');
  }

  // 인보이스 상세 정보 로드 (invoiceId가 없어도 개발 모드에서는 더미 데이터 표시)
  await loadInvoiceDetail(invoiceId, devMode);
  
  // 하단 액션 버튼 이벤트 리스너
  setupActionButtons();
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

// URL에서 invoiceId 추출
function extractInvoiceIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  // query 파라미터에서 invoiceId 또는 invoiceNumber 가져오기
  return urlParams.get('invoiceId') || urlParams.get('invoiceNumber') || null;
}

// 인보이스 상세 정보 로드
async function loadInvoiceDetail(invoiceId, devMode = false) {
  showLoading(true);
  
  // 개발 모드일 때는 더미 데이터 사용
  if (devMode) {
    console.log('[개발 모드] 더미 데이터 사용');
    setTimeout(() => {
      const dummyInvoice = createDummyInvoice(invoiceId);
      renderInvoiceDetail(dummyInvoice);
      showLoading(false);
    }, 500); // 0.5초 지연 (로딩 효과)
    return;
  }
  
  // 프로덕션 모드에서 invoiceId가 없으면 에러
  if (!invoiceId) {
    showError('인보이스 ID가 올바르지 않습니다.');
    showLoading(false);
    return;
  }
  
  try {
    // GET /api/invoices/:invoiceId 또는 GET /api/invoices/:invoiceNumber
    const response = await fetch(`${API_BASE}/invoices/${encodeURIComponent(invoiceId)}`, {
      method: 'GET',
      credentials: 'include'
    });

    if (response.status === 404) {
      showError('인보이스를 찾을 수 없습니다.');
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (data.success && data.invoice) {
      renderInvoiceDetail(data.invoice);
    } else {
      showError('인보이스 정보를 불러올 수 없습니다.');
    }
  } catch (error) {
    console.error('인보이스 상세 정보 로드 오류:', error);
    showError('인보이스 정보를 불러오는 중 오류가 발생했습니다.');
  } finally {
    showLoading(false);
  }
}

// 개발 모드용 더미 인보이스 데이터 생성
function createDummyInvoice(invoiceId) {
  return {
    invoice_id: invoiceId || 'PM-2026-000128',
    invoice_number: invoiceId || 'PM-2026-000128',
    invoiceNumber: invoiceId || 'PM-2026-000128',
    issued_at: new Date().toISOString(),
    issuedAt: new Date().toISOString(),
    status: 'issued',
    currency: 'KRW',
    net_amount: 1500000,
    netAmount: 1500000,
    tax_amount: 700000,
    taxAmount: 700000,
    total_amount: 2300000,
    totalAmount: 2300000,
    payment_method: 'Credit Card',
    paymentMethod: 'Credit Card',
    membership_id: 'PM.2026.123456',
    membershipId: 'PM.2026.123456',
    payload_json: JSON.stringify({
      items: [
        {
          product_name: 'Solid Heavyweight Vest(PM-VST-026)',
          quantity: 1,
          subtotal: 1500000,
          currency: 'KRW',
          warranty_id: 'dummy-warranty-1'
        },
        {
          product_name: 'London Liberty Toile Blouson',
          quantity: 1,
          subtotal: 700000,
          currency: 'USD',
          warranty_id: 'dummy-warranty-2'
        },
        {
          product_name: 'Le Stripe Suit Blouson',
          quantity: 3,
          subtotal: 2300000,
          currency: 'EUR',
          warranty_id: 'dummy-warranty-3'
        }
      ],
      billing: {
        name: 'BORI',
        email: 'testuser1234@naver.com',
        address: '서울시 강남구 테헤란로 123'
      },
      shipping: {
        name: 'BORI',
        email: 'testuser1234@naver.com',
        address: '서울시 강남구 테헤란로 123'
      },
      amounts: {
        net: 1500000,
        tax: 700000,
        total: 2300000
      },
      currency: 'KRW',
      order_number: 'BORI_204949'
    })
  };
}

// 인보이스 상세 정보 렌더링 (Figma 디자인 기반)
function renderInvoiceDetail(invoice) {
  const content = document.getElementById('invoice-detail-content');
  const noInvoice = document.getElementById('no-invoice');
  
  if (!content || !noInvoice) {
    console.error('인보이스 상세 컨테이너를 찾을 수 없습니다.');
    return;
  }

  content.style.display = 'block';
  noInvoice.style.display = 'none';

  const issuedDate = formatIssueDate(invoice.issued_at || invoice.issuedAt);
  const invoiceNumber = invoice.invoice_number || invoice.invoiceNumber || 'N/A';
  
  // payload_json에서 정보 추출 (먼저 추출해야 함)
  let payload = null;
  if (invoice.payload_json) {
    try {
      payload = typeof invoice.payload_json === 'string' 
        ? JSON.parse(invoice.payload_json) 
        : invoice.payload_json;
    } catch (e) {
      console.warn('payload_json 파싱 실패:', e);
    }
  }

  const items = payload?.items || [];
  const billing = payload?.billing || {};
  const shipping = payload?.shipping || {};
  const amounts = payload?.amounts || {};
  
  // 액션 버튼 표시
  const actionButtons = document.getElementById('action-buttons');
  if (actionButtons) {
    actionButtons.style.display = 'flex';
  }
  
  // 금액 정보
  const subtotal = invoice.net_amount || invoice.netAmount || amounts.net || 0;
  const tax = invoice.tax_amount || invoice.taxAmount || amounts.tax || 0;
  const total = invoice.total_amount || invoice.totalAmount || amounts.total || 0;
  
  // 통화 (기본 KRW)
  const currency = invoice.currency || payload?.currency || 'KRW';
  
  content.innerHTML = `
    <!-- 헤더 (2열) -->
    <div class="invoice-detail-header">
      <div class="invoice-header-left">
        <h1 class="invoice-header-title">INVOICE</h1>
        <div class="invoice-header-meta">
          <div>INVOICE NO. ${escapeHtml(invoiceNumber)}</div>
          <div>ISSU DATE : ${escapeHtml(issuedDate)}</div>
        </div>
      </div>
      <div class="invoice-header-right">
        <div class="invoice-brand-name">Pre.pMood</div>
      </div>
    </div>

    <!-- DESCRIPTION 섹션 -->
    <div class="invoice-description-section">
      <h2 class="invoice-section-title">DESCRIPTION</h2>
      <table class="invoice-items-table">
        <thead>
          <tr>
            <th>상품명</th>
            <th>수량</th>
            <th>금액</th>
          </tr>
        </thead>
        <tbody>
          ${items.length > 0 ? items.map((item, index) => {
            const itemName = escapeHtml(item.product_name || 'N/A');
            const quantity = item.quantity || 0;
            const subtotalAmount = parseFloat(item.subtotal || 0);
            const itemCurrency = item.currency || currency;
            return `
              <tr>
                <td>${itemName}</td>
                <td>*${quantity}</td>
                <td>${formatCurrency(subtotalAmount, itemCurrency)}</td>
              </tr>
            `;
          }).join('') : '<tr><td colspan="3">주문 항목이 없습니다.</td></tr>'}
        </tbody>
      </table>
    </div>

    <!-- Financial Summary (오른쪽 정렬) -->
    <div class="invoice-summary-section">
      <div class="invoice-summary-container">
        <div class="invoice-summary-row">
          <span class="invoice-summary-label">Subtotal</span>
          <span class="invoice-summary-value">${formatCurrency(subtotal, currency)}</span>
        </div>
        <div class="invoice-summary-row">
          <span class="invoice-summary-label">Tax</span>
          <span class="invoice-summary-value">${formatCurrency(tax, currency)}</span>
        </div>
        <div class="invoice-summary-row">
          <span class="invoice-summary-label">Payment Method</span>
          <span class="invoice-summary-value">${escapeHtml(invoice.payment_method || invoice.paymentMethod || 'Credit Card')}</span>
        </div>
        <div class="invoice-summary-row total">
          <span class="invoice-summary-label">Total</span>
          <span class="invoice-summary-value">${formatCurrency(total, currency)}</span>
        </div>
      </div>
    </div>

    <!-- Footer (2열: Company & Customer) -->
    <div class="invoice-detail-footer">
      <!-- 회사 정보 -->
      <div class="invoice-footer-section">
        <h3 class="invoice-footer-title">PRE.PMOOD</h3>
        <div class="invoice-footer-info">
          <div class="invoice-footer-row">
            <span class="invoice-footer-label">COMPANY NAME</span>
            <span class="invoice-footer-value">PRE.PMOOD</span>
          </div>
          <div class="invoice-footer-row">
            <span class="invoice-footer-label">BUSINESS ADDRESS</span>
            <span class="invoice-footer-value">Online Boutique</span>
          </div>
          <div class="invoice-footer-row">
            <span class="invoice-footer-label">EMAIL</span>
            <span class="invoice-footer-value">clientcare@prepmood.kr</span>
          </div>
        </div>
      </div>

      <!-- 고객 정보 -->
      <div class="invoice-footer-section">
        <h3 class="invoice-footer-title">CUSTOMER</h3>
        <div class="invoice-footer-info">
          <div class="invoice-footer-row">
            <span class="invoice-footer-label">NAME</span>
            <span class="invoice-footer-value">${escapeHtml(invoice.billing_name || invoice.shipping_name || billing.name || shipping.name || 'N/A')}</span>
          </div>
          <div class="invoice-footer-row">
            <span class="invoice-footer-label">ID</span>
            <span class="invoice-footer-value">${escapeHtml(invoice.membership_id || invoice.membershipId || 'N/A')}</span>
          </div>
          <div class="invoice-footer-row">
            <span class="invoice-footer-label">ADDRESS</span>
            <span class="invoice-footer-value">
              ${maskEmail(invoice.billing_email || invoice.shipping_email || billing.email || shipping.email || 'N/A')}
            </span>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // 보증서 보기 버튼 생성 및 정렬 (렌더링 후)
  setTimeout(() => {
    const warrantyButtonsColumn = document.getElementById('warranty-buttons-column');
    const documentContainer = content.closest('.invoice-document-container');
    const descriptionSection = content.querySelector('.invoice-description-section');
    const table = content.querySelector('.invoice-items-table');
    
    if (warrantyButtonsColumn && documentContainer && descriptionSection && table && items.length > 0) {
      // 문서 컨테이너 상단부터 테이블 첫 번째 데이터 행까지의 높이 계산
      const containerRect = documentContainer.getBoundingClientRect();
      const sectionTitle = descriptionSection.querySelector('.invoice-section-title');
      const tableHeader = table.querySelector('thead tr');
      const firstTableRow = table.querySelector('tbody tr');
      
      let offsetTop = 0;
      
      // DESCRIPTION 섹션 시작 위치까지의 높이 (헤더 + 패딩 등)
      if (descriptionSection && containerRect) {
        const sectionRect = descriptionSection.getBoundingClientRect();
        offsetTop = sectionRect.top - containerRect.top;
      }
      
      // 섹션 제목 높이
      if (sectionTitle) {
        offsetTop += sectionTitle.offsetHeight || 0;
        // 제목의 margin-bottom도 고려
        const titleStyle = window.getComputedStyle(sectionTitle);
        const titleMarginBottom = parseInt(titleStyle.marginBottom) || 0;
        offsetTop += titleMarginBottom;
      }
      
      // 테이블 헤더 높이
      if (tableHeader) {
        offsetTop += tableHeader.offsetHeight || 0;
      }
      
      // 보증서 버튼 컬럼 생성
      warrantyButtonsColumn.innerHTML = items.map((item, index) => {
        const warrantyId = item.warranty_id || '';
        return warrantyId ? `
          <div class="warranty-button-row">
            <button class="warranty-view-btn" data-item-index="${index}" data-warranty-id="${escapeHtml(warrantyId)}">
              보증서 보기
            </button>
          </div>
        ` : '<div class="warranty-button-row"></div>';
      }).join('');
      
      // 오프셋 적용 (DESCRIPTION 섹션 제목 + 테이블 헤더 높이)
      warrantyButtonsColumn.style.paddingTop = `${offsetTop}px`;
      warrantyButtonsColumn.style.display = 'flex';
      
      // 각 버튼의 높이를 테이블 행과 맞추기
      const tableRows = table.querySelectorAll('tbody tr');
      const buttonRows = warrantyButtonsColumn.querySelectorAll('.warranty-button-row');
      
      tableRows.forEach((row, index) => {
        if (buttonRows[index]) {
          buttonRows[index].style.minHeight = `${row.offsetHeight}px`;
        }
      });
      
      // 보증서 보기 버튼 이벤트 리스너 추가
      const warrantyButtons = warrantyButtonsColumn.querySelectorAll('.warranty-view-btn');
      warrantyButtons.forEach((btn) => {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          const warrantyId = btn.getAttribute('data-warranty-id');
          const itemIndex = parseInt(btn.getAttribute('data-item-index'));
          const item = items[itemIndex];
          
          if (warrantyId && item) {
            window.location.href = `/warranty-detail.html?warrantyId=${encodeURIComponent(warrantyId)}`;
          } else {
            console.warn('보증서 ID가 없습니다:', item);
          }
        });
      });
    }
  }, 100);
}

// ISSUE DATE 포맷 함수 (DD Mon YYYY 형식)
function formatIssueDate(dateInput) {
  if (!dateInput) return '';
  
  try {
    const date = new Date(dateInput);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = String(date.getDate()).padStart(2, '0');
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    
    return `${day} ${month} ${year}`;
  } catch (error) {
    console.error('날짜 포맷팅 오류:', error);
    return dateInput;
  }
}

// 통화 포맷팅 (예: $ 1.500.000 KRW)
function formatCurrency(amount, currency = 'KRW') {
  if (typeof amount === 'string') {
    amount = parseFloat(amount);
  }
  if (isNaN(amount)) amount = 0;
  
  // 천단위 구분자 (점 사용)
  const formattedAmount = amount.toLocaleString('ko-KR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  
  // 통화 코드 매핑
  const currencyMap = {
    'KRW': 'KRW',
    'USD': 'USD',
    'EUR': 'EUR',
    'JPY': 'JPY'
  };
  
  const currencyCode = currencyMap[currency] || currency;
  
  return `$ ${formattedAmount} ${currencyCode}`;
}

// 주소 포맷팅
function formatAddress(address) {
  if (!address) return 'N/A';
  
  if (typeof address === 'string') {
    return escapeHtml(address);
  }
  
  // address 객체인 경우
  const parts = [];
  if (address.address) parts.push(address.address);
  if (address.city) parts.push(address.city);
  if (address.postal_code) parts.push(address.postal_code);
  if (address.country) parts.push(address.country);
  
  return parts.length > 0 ? escapeHtml(parts.join(' ')) : 'N/A';
}

// 이메일 마스킹 함수
// 규칙:
// - 1~2자: 1자만 노출, 나머지 마스킹 (예: 1*@naver.com)
// - 3~5자: 앞 2자 노출, 나머지 마스킹 (예: ab***@naver.com)
// - 6~9자: 앞 3자 노출, 나머지 마스킹 (예: abc***@gmail.com)
// - 10자 이상: 앞 4자 노출, 나머지 마스킹 (예: abcd******@gmail.com)
function maskEmail(email) {
  if (!email || typeof email !== 'string') return 'N/A';
  
  const emailParts = email.split('@');
  if (emailParts.length !== 2) return escapeHtml(email); // 유효하지 않은 이메일 형식
  
  const [localPart, domain] = emailParts;
  const localLength = localPart.length;
  
  let visibleChars = 0;
  let maskedPart = '';
  
  if (localLength <= 2) {
    // 1~2자: 1자만 노출
    visibleChars = 1;
    maskedPart = localPart.substring(0, 1) + '*';
  } else if (localLength <= 5) {
    // 3~5자: 앞 2자 노출
    visibleChars = 2;
    maskedPart = localPart.substring(0, 2) + '***';
  } else if (localLength <= 9) {
    // 6~9자: 앞 3자 노출
    visibleChars = 3;
    maskedPart = localPart.substring(0, 3) + '***';
  } else {
    // 10자 이상: 앞 4자 노출
    visibleChars = 4;
    maskedPart = localPart.substring(0, 4) + '******';
  }
  
  return escapeHtml(maskedPart + '@' + domain);
}

// 로딩 상태 표시
function showLoading(show) {
  const loadingElement = document.getElementById('loading-invoice');
  const contentElement = document.getElementById('invoice-detail-content');
  
  if (loadingElement) {
    loadingElement.style.display = show ? 'block' : 'none';
  }
  if (contentElement) {
    contentElement.style.display = show ? 'none' : 'block';
  }
}

// 에러 상태 표시
function showError(message) {
  const content = document.getElementById('invoice-detail-content');
  const noInvoice = document.getElementById('no-invoice');
  const loadingElement = document.getElementById('loading-invoice');
  
  if (loadingElement) {
    loadingElement.style.display = 'none';
  }
  
  if (content) {
    content.style.display = 'none';
  }
  
  if (noInvoice) {
    noInvoice.style.display = 'block';
    const titleElement = noInvoice.querySelector('.no-invoice-title');
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

// 하단 액션 버튼 설정
function setupActionButtons() {
  // 결제 영수증 다운로드
  const downloadReceiptBtn = document.getElementById('download-receipt-btn');
  if (downloadReceiptBtn) {
    downloadReceiptBtn.addEventListener('click', function() {
      // TODO: 결제 영수증 다운로드 기능 구현
      console.log('결제 영수증 다운로드');
      alert('결제 영수증 다운로드 기능은 준비 중입니다.');
    });
  }
  
  // 보증서 일괄 다운로드
  const downloadAllWarrantiesBtn = document.getElementById('download-all-warranties-btn');
  if (downloadAllWarrantiesBtn) {
    downloadAllWarrantiesBtn.addEventListener('click', function() {
      // TODO: 보증서 일괄 다운로드 기능 구현
      console.log('보증서 일괄 다운로드');
      alert('보증서 일괄 다운로드 기능은 준비 중입니다.');
    });
  }
  
  // 목록으로 돌아가기
  const backToListBtn = document.getElementById('back-to-list-btn');
  if (backToListBtn) {
    backToListBtn.addEventListener('click', function() {
      window.location.href = '/digital-invoice.html';
    });
  }
}
