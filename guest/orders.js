// guest/orders.js - 비회원 주문 조회 페이지 스크립트
const API_BASE = window.API_BASE || 
  ((window.location && window.location.origin)
    ? window.location.origin.replace(/\/$/, '') + '/api'
    : '/api');

let orderNumber = null;
let orderId = null;

document.addEventListener('DOMContentLoaded', async function() {
  console.log('비회원 주문 조회 페이지 로드됨');
  
  // URL 파라미터에서 order 추출
  const urlParams = new URLSearchParams(window.location.search);
  orderNumber = urlParams.get('order');
  
  if (!orderNumber) {
    showError('주문번호가 올바르지 않습니다.');
    return;
  }
  
  // 주문 상세 정보 로드
  await loadOrderDetail();
});

// 주문 상세 정보 로드
async function loadOrderDetail() {
  showLoading(true);
  hideError();
  hideContent();
  
  try {
    const response = await fetch(`${API_BASE}/guest/orders/${encodeURIComponent(orderNumber)}`, {
      method: 'GET',
      credentials: 'include' // httpOnly Cookie 전송
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      
      if (response.status === 401 || response.status === 410) {
        throw new Error(data.message || '세션이 만료되었거나 유효하지 않습니다.');
      } else if (response.status === 403) {
        throw new Error('접근 권한이 없습니다.');
      } else if (response.status === 404) {
        throw new Error('주문을 찾을 수 없습니다.');
      } else {
        throw new Error(data.message || `HTTP ${response.status}`);
      }
    }
    
    const result = await response.json();
    
    if (!result.success || !result.data) {
      throw new Error('주문 정보를 불러올 수 없습니다.');
    }
    
    const orderData = result.data;
    
    // orderId 저장 (Claim API 호출용)
    orderId = orderData.order?.order_id;
    
    // 주문 정보 렌더링
    renderOrderDetail(orderData);
    
  } catch (error) {
    console.error('주문 상세 정보 로드 오류:', error);
    showError(error.message || '주문 정보를 불러오는 중 오류가 발생했습니다.');
  } finally {
    showLoading(false);
  }
}

// 주문 상세 정보 렌더링
function renderOrderDetail(data) {
  const { order, payment, shipping, items, shipments, shipping_status } = data;
  
  // 1. 주문 요약 (Order Summary)
  renderOrderSummary(order, payment, shipping, items);
  
  // 2. 디지털 인보이스 (PDF)
  renderInvoiceSection(order);
  
  // 3. 디지털 정품 인증서 - 등록하기
  renderAuthenticitySection(order);
  
  // 4. 디지털 워런티 (Warranty)
  renderWarrantySection();
  
  // 5. 소유 기록 (Ownership Record)
  renderOwnershipRecord(order);
  
  // 6. 배송 상태 트래킹
  renderShippingTracking(shipments, shipping_status);
  
  // 7. 브랜드 메시지
  renderBrandMessage();
  
  showContent();
}

// 1. 주문 요약 (Order Summary)
function renderOrderSummary(order, payment, shipping, items) {
  const summaryContent = document.getElementById('order-summary-content');
  if (!summaryContent) return;
  
  const orderDate = order.order_date ? new Date(order.order_date).toLocaleDateString('ko-KR') : '-';
  const buyerName = shipping?.name || '-';
  
  // 상품명/옵션 목록
  const productsList = items.map(item => {
    const options = [item.color, item.size].filter(Boolean).join(' / ');
    return `${escapeHtml(item.product_name || '-')}${options ? ` (${escapeHtml(options)})` : ''}`;
  }).join('<br>');
  
  // 결제수단 마스킹 (일부 마스킹 처리)
  const paymentMethod = payment ? maskPaymentMethod(payment.method || payment.gateway || '-') : '-';
  
  summaryContent.innerHTML = `
    <dl>
      <dt>주문번호</dt>
      <dd>${escapeHtml(order.order_number || '-')}</dd>
      <dt>주문일</dt>
      <dd>${orderDate}</dd>
      <dt>구매자명</dt>
      <dd>${escapeHtml(buyerName)}</dd>
      <dt>상품명 / 옵션</dt>
      <dd>${productsList}</dd>
      <dt>결제금액</dt>
      <dd><strong>${formatPrice(order.total_price)}</strong></dd>
      <dt>결제수단</dt>
      <dd>${paymentMethod}</dd>
    </dl>
  `;
}

// 2. 디지털 인보이스 (PDF)
function renderInvoiceSection(order) {
  const invoiceCard = document.getElementById('invoice-card');
  const invoiceContent = document.getElementById('invoice-content');
  if (!invoiceCard || !invoiceContent) return;
  
  // TODO: 인보이스 정보 조회 API 추가 필요
  // 현재는 주문 ID로 인보이스가 있는지 확인 불가
  // 일단 항상 표시하고, 다운로드 버튼은 인보이스가 있을 때만 활성화
  invoiceCard.style.display = 'block';
  invoiceContent.innerHTML = `
    <p>디지털 인보이스를 다운로드할 수 있습니다.</p>
    <button id="download-invoice-btn" class="btn-primary" onclick="downloadInvoice(${order.order_id})">
      PDF 다운로드
    </button>
  `;
}

// 3. 디지털 정품 인증서 - 등록하기
function renderAuthenticitySection(order) {
  const authenticityCard = document.getElementById('authenticity-card');
  const authenticityContent = document.getElementById('authenticity-content');
  if (!authenticityCard || !authenticityContent) return;
  
  authenticityCard.style.display = 'block';
  
  // 주문이 Claim 완료되었는지 확인 (order.user_id가 있으면 이미 등록됨)
  if (order.user_id) {
    authenticityContent.innerHTML = `
      <p>이미 등록된 디지털 인보이스입니다.</p>
    `;
  } else {
    authenticityContent.innerHTML = `
      <p>이 주문을 회원 계정에 연동하면 보증서를 활성화하고 관리할 수 있습니다.</p>
      <button id="claim-btn" class="btn-primary" onclick="handleClaim()">
        등록하기
      </button>
    `;
  }
}

// 4. 디지털 워런티 (Warranty)
function renderWarrantySection() {
  const warrantyCard = document.getElementById('warranty-card');
  const warrantyContent = document.getElementById('warranty-content');
  if (!warrantyCard || !warrantyContent) return;
  
  warrantyCard.style.display = 'block';
  warrantyContent.innerHTML = `
    <div class="warranty-links">
      <a href="/warranty-as.html" target="_blank" rel="noopener noreferrer" class="warranty-link">
        AS 관련사항
      </a>
      <span class="separator">|</span>
      <a href="/care-guideline.html" target="_blank" rel="noopener noreferrer" class="warranty-link">
        케어 가이드라인
      </a>
    </div>
  `;
}

// 5. 소유 기록 (Ownership Record)
function renderOwnershipRecord(order) {
  const ownershipCard = document.getElementById('ownership-card');
  const ownershipContent = document.getElementById('ownership-content');
  if (!ownershipCard || !ownershipContent) return;
  
  const orderDate = order.order_date ? new Date(order.order_date).toLocaleDateString('ko-KR') : '-';
  
  ownershipCard.style.display = 'block';
  ownershipContent.innerHTML = `
    <dl>
      <dt>최초 구매자 기록</dt>
      <dd>${escapeHtml(order.order_number || '-')}</dd>
      <dt>소유일</dt>
      <dd>${orderDate}</dd>
    </dl>
    <p class="ownership-note">이 기록은 Pre.pMood 서버에 안전하게 보관됩니다.</p>
  `;
}

// 6. 배송 상태 트래킹
function renderShippingTracking(shipments, shipping_status) {
  const shipmentsCard = document.getElementById('shipments-card');
  const shipmentsList = document.getElementById('shipments-list');
  
  if (!shipmentsCard || !shipmentsList) return;
  
  // 배송 상태 표시 (shipments가 없어도 표시)
  if (shipping_status || (shipments && shipments.length > 0)) {
    shipmentsCard.style.display = 'block';
    let html = '';
    
    // 배송 상태 표시
    if (shipping_status) {
      html += `
        <div class="shipment-status">
          <dl>
            <dt>배송 상태</dt>
            <dd>${getShippingStatusBadge(shipping_status)}</dd>
          </dl>
        </div>
      `;
    }
    
    // 배송 상세 정보 (shipments가 있는 경우)
    if (shipments && shipments.length > 0) {
      html += shipments.map(shipment => {
        const trackingUrl = getTrackingUrl(shipment.carrier_code, shipment.tracking_number);
        
        return `
          <div class="shipment-item">
            <dl>
              <dt>배송사</dt>
              <dd>${escapeHtml(shipment.carrier_name || shipment.carrier_code || '-')}</dd>
              <dt>송장번호</dt>
              <dd>
                ${trackingUrl && shipment.tracking_number
                  ? `<a href="${trackingUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(shipment.tracking_number)}</a>`
                  : escapeHtml(shipment.tracking_number || '-')}
              </dd>
            </dl>
          </div>
        `;
      }).join('');
    }
    
    shipmentsList.innerHTML = html;
  }
}

// 7. 브랜드 메시지
function renderBrandMessage() {
  const brandMessageCard = document.getElementById('brand-message-card');
  const brandMessageContent = document.getElementById('brand-message-content');
  if (!brandMessageCard || !brandMessageContent) return;
  
  brandMessageContent.innerHTML = `
    <p class="brand-message">This digital record represents your ownership of a genuine Pre.pMood product.</p>
    <p class="brand-message">Timeless design, securely recorded.</p>
  `;
}

// 결제수단 마스킹 처리
function maskPaymentMethod(method) {
  if (!method || method === '-') return '-';
  
  // 카드 번호 형식인 경우 마스킹
  if (/^\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}$/.test(method.replace(/\s/g, ''))) {
    return method.replace(/(\d{4}[\s-]?)(\d{4}[\s-]?)(\d{4}[\s-]?)(\d{4})/, '$1****-****-$4');
  }
  
  // 일반 결제수단명은 그대로 표시
  return escapeHtml(method);
}

// 인보이스 다운로드 (TODO: API 구현 필요)
async function downloadInvoice(orderId) {
  try {
    // TODO: 인보이스 다운로드 API 호출
    alert('인보이스 다운로드 기능은 준비 중입니다.');
  } catch (error) {
    console.error('인보이스 다운로드 오류:', error);
    alert('인보이스 다운로드에 실패했습니다.');
  }
}

// 전역 함수로 등록
window.downloadInvoice = downloadInvoice;

// Claim 처리
async function handleClaim() {
  // 로그인 상태 확인
  const userInfo = await checkLoginStatus();
  if (!userInfo) {
    // 로그인 페이지로 리다이렉트 (returnTo 파라미터 포함)
    const currentUrl = encodeURIComponent(window.location.href);
    window.location.href = `/login.html?returnTo=${currentUrl}`;
    return;
  }
  
  if (!orderId) {
    alert('주문 정보를 불러올 수 없습니다. 페이지를 새로고침해주세요.');
    return;
  }
  
  if (!confirm('이 주문을 회원 계정에 연동하시겠습니까?\n\n연동 후 보증서를 활성화하고 관리할 수 있습니다.')) {
    return;
  }
  
  try {
    // 1. Claim token 발급
    const tokenResponse = await fetch(`${API_BASE}/orders/${orderId}/claim-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    
    const tokenData = await tokenResponse.json();
    
    if (!tokenResponse.ok) {
      throw new Error(tokenData.message || 'Claim token 발급에 실패했습니다.');
    }
    
    if (!tokenData.success || !tokenData.data?.claim_token) {
      throw new Error('Claim token을 받을 수 없습니다.');
    }
    
    const claimToken = tokenData.data.claim_token;
    
    // 2. Claim API 호출
    const claimResponse = await fetch(`${API_BASE}/orders/${orderId}/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        claim_token: claimToken
      })
    });
    
    const claimData = await claimResponse.json();
    
    if (!claimResponse.ok) {
      throw new Error(claimData.message || '주문 연동에 실패했습니다.');
    }
    
    if (claimData.success) {
      alert('주문이 성공적으로 회원 계정에 연동되었습니다!\n\n이제 보증서를 활성화하고 관리할 수 있습니다.');
      // 내 보증서 페이지로 이동
      window.location.href = '/my-warranties.html';
    } else {
      throw new Error(claimData.message || '주문 연동에 실패했습니다.');
    }
    
  } catch (error) {
    console.error('Claim 처리 오류:', error);
    alert(`주문 연동에 실패했습니다: ${error.message}`);
  }
}

// 전역 함수로 등록
window.handleClaim = handleClaim;

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

// UI 상태 관리
function showLoading(show) {
  const loading = document.getElementById('loading-state');
  if (loading) loading.style.display = show ? 'block' : 'none';
}

function showContent() {
  const content = document.getElementById('order-content');
  if (content) content.style.display = 'block';
}

function hideContent() {
  const content = document.getElementById('order-content');
  if (content) content.style.display = 'none';
}

function showError(message) {
  const error = document.getElementById('error-message');
  const errorText = document.getElementById('error-text');
  
  if (error) error.style.display = 'block';
  if (errorText && message) {
    errorText.textContent = escapeHtml(message);
  }
}

function hideError() {
  const error = document.getElementById('error-message');
  if (error) error.style.display = 'none';
}

// 유틸리티 함수
function formatPrice(price) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0
  }).format(price);
}

function getOrderStatusBadge(status) {
  const statusMap = {
    'pending': { label: '결제 대기', class: 'badge-warning' },
    'paid': { label: '결제 완료', class: 'badge-success' },
    'confirmed': { label: '결제 완료', class: 'badge-success' },
    'processing': { label: '상품 준비중', class: 'badge-info' },
    'shipping': { label: '배송중', class: 'badge-primary' },
    'shipped': { label: '배송중', class: 'badge-primary' },
    'delivered': { label: '배송 완료', class: 'badge-secondary' },
    'cancelled': { label: '취소됨', class: 'badge-danger' },
    'refunded': { label: '환불됨', class: 'badge-danger' }
  };
  
  const { label, class: className } = statusMap[status] || { label: status, class: 'badge-secondary' };
  return `<span class="badge ${className}">${label}</span>`;
}

// 배송 상태 배지
function getShippingStatusBadge(status) {
  const statusMap = {
    'preparing': { text: '준비중', class: 'status-preparing' },
    'shipping': { text: '배송중', class: 'status-shipping' },
    'delivered': { text: '배송완료', class: 'status-delivered' }
  };
  
  const statusInfo = statusMap[status] || { text: status || '-', class: 'status-unknown' };
  return `<span class="status-badge ${statusInfo.class}">${escapeHtml(statusInfo.text)}</span>`;
}

function getPaymentStatusBadge(status) {
  const statusMap = {
    'initiated': { label: '결제 시작', class: 'badge-info' },
    'authorized': { label: '승인됨', class: 'badge-success' },
    'captured': { label: '결제 완료', class: 'badge-success' },
    'failed': { label: '결제 실패', class: 'badge-danger' },
    'cancelled': { label: '취소됨', class: 'badge-warning' },
    'refunded': { label: '환불됨', class: 'badge-danger' }
  };
  
  const { label, class: className } = statusMap[status] || { label: status, class: 'badge-secondary' };
  return `<span class="badge ${className}">${label}</span>`;
}

function getTrackingUrl(carrierCode, trackingNumber) {
  if (!carrierCode || !trackingNumber) return null;
  
  const carrierTemplates = {
    'CJ': 'https://www.cjlogistics.com/ko/tool/parcel/tracking?param={tracking_number}',
    'HANJIN': 'https://www.hanjin.co.kr/kor/CMS/DeliveryMgr/WaybillSch?mCode=MN038&schLang=KR&wblnum={tracking_number}',
    'ILYANG': 'https://ilyanglogis.com/delivery/delivery_search.jsp?dlvry_type=1&dlvry_num={tracking_number}',
    'KGB': 'https://www.cvsnet.co.kr/invoice/tracking.do?invoice_no={tracking_number}'
  };
  
  const template = carrierTemplates[carrierCode];
  if (!template) return null;
  
  return template.replace('{tracking_number}', encodeURIComponent(trackingNumber));
}

function escapeHtml(text) {
  if (text == null || text === undefined) {
    return '';
  }
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
