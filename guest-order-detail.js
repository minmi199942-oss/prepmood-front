// guest-order-detail.js - 비회원 주문 조회 페이지 스크립트
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
    
    // Claim 버튼 표시 (비회원 주문이므로 항상 표시)
    showClaimSection();
    
  } catch (error) {
    console.error('주문 상세 정보 로드 오류:', error);
    showError(error.message || '주문 정보를 불러오는 중 오류가 발생했습니다.');
  } finally {
    showLoading(false);
  }
}

// 주문 상세 정보 렌더링
function renderOrderDetail(data) {
  const { order, shipping, items, shipments } = data;
  
  // 주문 정보
  const orderInfoList = document.getElementById('order-info-list');
  if (orderInfoList) {
    orderInfoList.innerHTML = `
      <dt>주문번호</dt>
      <dd>${escapeHtml(order.order_number || '-')}</dd>
      <dt>주문일시</dt>
      <dd>${order.order_date ? new Date(order.order_date).toLocaleString('ko-KR') : '-'}</dd>
      <dt>결제일시</dt>
      <dd>${order.paid_at ? new Date(order.paid_at).toLocaleString('ko-KR') : '-'}</dd>
      <dt>주문 상태</dt>
      <dd>${getOrderStatusBadge(order.status)}</dd>
      <dt>총 주문 금액</dt>
      <dd><strong>${formatPrice(order.total_price)}</strong></dd>
    `;
  }
  
  // 배송지 정보
  const shippingInfoList = document.getElementById('shipping-info-list');
  if (shippingInfoList) {
    const fullName = [shipping.first_name, shipping.last_name].filter(Boolean).join(' ') || '-';
    shippingInfoList.innerHTML = `
      <dt>이름</dt>
      <dd>${escapeHtml(fullName)}</dd>
      <dt>이메일</dt>
      <dd>${escapeHtml(shipping.email || '-')}</dd>
      <dt>전화번호</dt>
      <dd>${escapeHtml(shipping.phone || '-')}</dd>
      <dt>주소</dt>
      <dd>${escapeHtml(shipping.address || '-')}</dd>
      <dt>도시</dt>
      <dd>${escapeHtml(shipping.city || '-')}</dd>
      <dt>우편번호</dt>
      <dd>${escapeHtml(shipping.postal_code || '-')}</dd>
      <dt>국가</dt>
      <dd>${escapeHtml(shipping.country || 'KR')}</dd>
    `;
  }
  
  // 주문 항목
  const orderItemsTbody = document.getElementById('order-items-tbody');
  if (orderItemsTbody) {
    orderItemsTbody.innerHTML = items.map(item => `
      <tr>
        <td>${escapeHtml(item.product_name || '-')}</td>
        <td>${escapeHtml(item.color || '-')} / ${escapeHtml(item.size || '-')}</td>
        <td>${item.quantity}</td>
        <td>${formatPrice(item.price)}</td>
      </tr>
    `).join('');
  }
  
  // 배송 정보
  if (shipments && shipments.length > 0) {
    const shipmentsCard = document.getElementById('shipments-card');
    const shipmentsList = document.getElementById('shipments-list');
    
    if (shipmentsCard) shipmentsCard.style.display = 'block';
    if (shipmentsList) {
      shipmentsList.innerHTML = shipments.map(shipment => {
        const trackingUrl = getTrackingUrl(shipment.carrier_code, shipment.tracking_number);
        const shippedDate = shipment.shipped_at 
          ? new Date(shipment.shipped_at).toLocaleString('ko-KR')
          : '-';
        const deliveredDate = shipment.delivered_at
          ? new Date(shipment.delivered_at).toLocaleString('ko-KR')
          : '-';
        
        return `
          <div class="shipment-item">
            <dl>
              <dt>택배사</dt>
              <dd>${escapeHtml(shipment.carrier_name || shipment.carrier_code || '-')}</dd>
              <dt>송장번호</dt>
              <dd>
                ${trackingUrl && shipment.tracking_number
                  ? `<a href="${trackingUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(shipment.tracking_number)}</a>`
                  : escapeHtml(shipment.tracking_number || '-')}
              </dd>
              <dt>발송일시</dt>
              <dd>${shippedDate}</dd>
              ${deliveredDate !== '-' ? `
              <dt>배송완료일시</dt>
              <dd>${deliveredDate}</dd>
              ` : ''}
            </dl>
          </div>
        `;
      }).join('');
    }
  }
  
  showContent();
}

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

function showClaimSection() {
  const claimSection = document.getElementById('claim-section');
  if (claimSection) claimSection.style.display = 'block';
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
