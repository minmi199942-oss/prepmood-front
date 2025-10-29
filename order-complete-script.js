// 주문 완료 페이지 스크립트
document.addEventListener('DOMContentLoaded', function() {
  console.log('✅ 주문 완료 페이지 로드됨');
  
  // URL에서 주문 ID 가져오기
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('orderId');
  
  if (orderId) {
    loadOrderDetails(orderId);
  } else {
    console.warn('⚠️ 주문 ID가 없습니다');
    // 주문 ID가 없으면 기본 메시지만 표시
    document.getElementById('order-info-section').style.display = 'none';
  }
});

async function loadOrderDetails(orderId) {
  try {
    console.log('📋 주문 상세 정보 로딩 중...', orderId);
    
    const response = await fetch(`https://prepmood.kr/api/orders/${orderId}`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('주문을 찾을 수 없습니다');
      } else if (response.status === 403) {
        throw new Error('접근 권한이 없습니다');
      }
      throw new Error(`주문 정보 조회 실패: ${response.status}`);
    }
    
    const result = await response.json();
    
    // 서버 응답 우선 사용 (data 필드)
    if (result.success && result.data) {
      // 서버에서 받은 최신 정보로 렌더링
      displayOrderInfoFromServer(result.data, result.order);
      
      // 세션스토리지 정리 (서버가 진실 원천)
      sessionStorage.removeItem('serverCurrencyInfo');
      console.log('✅ 서버 응답 우선 사용, 세션스토리지 정리 완료');
      
    } else if (result.success && result.order) {
      // 기존 호환성 유지 (order 필드만 있는 경우)
      displayOrderInfo(result.order);
      
      // 세션스토리지 정리
      sessionStorage.removeItem('serverCurrencyInfo');
      
    } else {
      throw new Error('주문 정보를 찾을 수 없습니다');
    }
    
  } catch (error) {
    console.error('❌ 주문 정보 로딩 실패:', error);
    
    // 오류 시 사용자에게 알림 + 재시도 옵션 제공
    showOrderError(error.message);
  }
}

function displayOrderInfoFromServer(data, orderDetail) {
  console.log('📋 서버 응답으로 주문 정보 표시:', data);
  
  const orderInfoSection = document.getElementById('order-info-section');
  if (orderInfoSection) {
    orderInfoSection.style.display = 'block';
  }
  
  // 주문 번호
  const orderNumberEl = document.getElementById('order-id');
  if (orderNumberEl && data.order_number) {
    orderNumberEl.textContent = data.order_number;
  }
  
  // 주문 금액 (서버 통화 정보 사용)
  const orderTotalEl = document.getElementById('order-total');
  if (orderTotalEl && data.amount !== undefined) {
    const currency = data.currency || 'KRW';
    const fraction = data.fraction ?? 2;
    orderTotalEl.textContent = formatPriceWithCurrency(data.amount, currency, fraction);
  }
  
  // 주문 상태
  const statusEl = document.getElementById('order-status');
  if (statusEl && data.status) {
    statusEl.textContent = getStatusText(data.status);
  }
  
  // 예상 배송일 (서버 ETA 우선)
  const etaEl = document.getElementById('estimated-delivery');
  if (etaEl && data.eta) {
    const deliveryDate = new Date(data.eta);
    if (!isNaN(deliveryDate.getTime())) {
      etaEl.textContent = deliveryDate.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  } else if (etaEl && orderDetail?.shipping?.estimated_delivery) {
    // fallback: orderDetail 사용
    const deliveryDate = new Date(orderDetail.shipping.estimated_delivery);
    if (!isNaN(deliveryDate.getTime())) {
      etaEl.textContent = deliveryDate.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  }
  
  // 배송 정보 (orderDetail이 있으면 표시)
  if (orderDetail && orderDetail.shipping) {
    displayShippingInfo(orderDetail.shipping, data.currency, data.fraction);
  }
}

function showOrderError(message) {
  const orderInfoSection = document.getElementById('order-info-section');
  if (orderInfoSection) {
    orderInfoSection.style.display = 'none';
  }
  
  // 에러 메시지 표시 (기존 요소가 있으면 사용, 없으면 동적 생성)
  let errorDiv = document.getElementById('order-error');
  if (!errorDiv) {
    errorDiv = document.createElement('div');
    errorDiv.id = 'order-error';
    errorDiv.className = 'order-error-message';
    const main = document.querySelector('main');
    if (main) {
      main.insertBefore(errorDiv, main.firstChild);
    }
  }
  
  errorDiv.innerHTML = `
    <div class="error-content">
      <h2>⚠️ 주문 정보를 불러올 수 없습니다</h2>
      <p>${escapeHtml(message)}</p>
      <div class="error-actions">
        <button id="retry-order-btn" class="retry-btn">다시 시도</button>
        <a href="my-orders.html" class="my-orders-link">내 주문 보기</a>
      </div>
    </div>
  `;
  
  // 재시도 버튼 이벤트
  const retryBtn = document.getElementById('retry-order-btn');
  if (retryBtn) {
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get('orderId');
    retryBtn.addEventListener('click', () => {
      if (orderId) {
        loadOrderDetails(orderId);
      }
    });
  }
}

function displayOrderInfo(order) {
  console.log('📋 주문 정보 표시:', order);
  
  // 주문 정보 섹션 표시
  const orderInfoSection = document.getElementById('order-info-section');
  orderInfoSection.style.display = 'block';
  
  // 주문 번호 (주문번호가 있으면 사용, 없으면 order_id 사용)
  const orderDisplayId = order.order_number || `#${order.order_id}`;
  document.getElementById('order-id').textContent = orderDisplayId;
  
  // 주문 금액
  document.getElementById('order-total').textContent = formatPrice(order.total_price);
  
  // 예상 배송일
  if (order.shipping && order.shipping.estimated_delivery) {
    const deliveryDate = new Date(order.shipping.estimated_delivery);
    document.getElementById('estimated-delivery').textContent = 
      deliveryDate.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
  }
  
  // 배송 정보 표시
  if (order.shipping) {
    displayShippingInfo(order.shipping);
  }
}

function displayShippingInfo(shipping, currency, fraction) {
  const shippingContent = document.getElementById('shipping-info-content');
  
  if (!shipping) {
    if (shippingContent) {
      shippingContent.innerHTML = '<p>배송 정보가 없습니다.</p>';
    }
    return;
  }
  
  if (!shippingContent) return;
  
  // 통화 정보 전달받으면 사용, 없으면 기본값
  const formatCost = (cost) => {
    if (currency && fraction !== undefined) {
      return formatPriceWithCurrency(cost, currency, fraction);
    }
    return formatPrice(cost);
  };
  
  const shippingInfo = `
    <div class="shipping-detail">
      <p><strong>수령인:</strong> ${escapeHtml(shipping.first_name)} ${escapeHtml(shipping.last_name)}</p>
      <p><strong>연락처:</strong> ${escapeHtml(shipping.phone)}</p>
      <p><strong>이메일:</strong> ${escapeHtml(shipping.email)}</p>
      <p><strong>배송 주소:</strong></p>
      <p>${escapeHtml(shipping.address)}</p>
      <p>${escapeHtml(shipping.city)}, ${escapeHtml(shipping.postal_code)}</p>
      <p>${escapeHtml(shipping.country)}</p>
      <p><strong>배송 방법:</strong> ${getShippingMethodText(shipping.method)}</p>
      ${shipping.cost > 0 ? `<p><strong>배송비:</strong> ${formatCost(shipping.cost)}</p>` : '<p><strong>배송비:</strong> 무료</p>'}
    </div>
  `;
  
  shippingContent.innerHTML = shippingInfo;
}

function getShippingMethodText(method) {
  const methods = {
    'standard': '일반 배송 (3-5일)',
    'express': '당일 배송',
    'overnight': '익일 배송'
  };
  return methods[method] || '일반 배송';
}

// 서버 통화 정보로 가격 포맷 (우선순위: 서버 > 세션 > 기본값)
function formatPriceWithCurrency(price, currency, fraction) {
  // 서버에서 받은 통화 정보 우선 사용
  if (currency && fraction !== undefined) {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: fraction,
      maximumFractionDigits: fraction
    }).format(price);
  }
  
  // 세션스토리지 fallback (렌더 후 정리되므로 거의 사용 안 됨)
  const sessionInfo = sessionStorage.getItem('serverCurrencyInfo');
  if (sessionInfo) {
    try {
      const info = JSON.parse(sessionInfo);
      return new Intl.NumberFormat('ko-KR', {
        style: 'currency',
        currency: info.currency || 'KRW',
        minimumFractionDigits: info.fraction ?? 2,
        maximumFractionDigits: info.fraction ?? 2
      }).format(price);
    } catch (e) {
      console.warn('세션스토리지 파싱 실패, 기본값 사용');
    }
  }
  
  // 기본값 (KRW)
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price);
}

// 기존 호환성 유지 함수
function formatPrice(price) {
  return formatPriceWithCurrency(price, 'KRW', 0);
}

function getStatusText(status) {
  const statusMap = {
    'pending': '결제 대기',
    'confirmed': '주문 확인',
    'processing': '처리 중',
    'shipped': '배송 중',
    'delivered': '배송 완료',
    'cancelled': '취소됨',
    'refunded': '환불됨',
    'failed': '결제 실패'
  };
  return statusMap[status] || status;
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
