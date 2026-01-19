// 주문 완료 페이지 스크립트
const API_BASE = (window.API_BASE)
  ? window.API_BASE
  : ((window.location && window.location.origin)
      ? window.location.origin.replace(/\/$/, '') + '/api'
      : '/api');

document.addEventListener('DOMContentLoaded', async function() {
  // URL 파라미터 확인
  const urlParams = new URLSearchParams(window.location.search);
  const paymentKey = urlParams.get('paymentKey');
  const orderId = urlParams.get('orderId'); // 토스페이먼츠 successUrl에서 orderId로 전달
  const amount = urlParams.get('amount');
  const guestToken = urlParams.get('guestToken'); // ⚠️ 비회원 주문 토큰

  const authStatus = await fetchAuthStatus();
  const isAuthenticated = authStatus?.authenticated;
  
  // 토스페이먼츠 success URL에서 온 경우 (paymentKey가 있으면)
  if (paymentKey && orderId && amount) {
    if (!isAuthenticated) {
      showOrderError('결제 확인을 위해 로그인이 필요합니다. 로그인 후 다시 시도해주세요.');
      return;
    }
    handleTossPaymentSuccess(paymentKey, orderId, amount);
    return;
  }
  
  // 일반 주문 완료 페이지 (orderId만 있는 경우)
  if (orderId) {
    // ⚠️ 비회원 주문인 경우 (guestToken이 있으면)
    if (guestToken) {
      await loadGuestOrderDetails(orderId, guestToken);
    } else if (!isAuthenticated) {
      // 비회원이지만 토큰이 없는 경우
      showOrderError('주문 정보를 확인하려면 로그인이 필요합니다.');
      return;
    } else {
      // 회원 주문
      loadOrderDetails(orderId);
    }
  } else {
    console.warn('⚠️ 주문 ID가 없습니다');
    // 주문 ID가 없으면 기본 메시지만 표시
    document.getElementById('order-info-section').style.display = 'none';
  }
});

async function fetchAuthStatus() {
  try {
    const response = await window.secureFetch(`${API_BASE}/auth/status`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.warn('auth status 확인 실패', error.message);
    return { authenticated: false };
  }
}

// ⚠️ 비회원 주문 조회 (guest_order_access_token 사용)
async function loadGuestOrderDetails(orderNumber, guestToken) {
  try {
    // 1. 세션 토큰 발급 (guest_order_access_token으로 세션 교환)
    // ⚠️ fetch는 302 Redirect를 자동으로 따라가지 않으므로, redirect: 'manual' 옵션 사용
    const sessionResponse = await fetch(`${API_BASE}/guest/orders/session?token=${encodeURIComponent(guestToken)}`, {
      method: 'GET',
      credentials: 'include',
      redirect: 'manual' // 302 Redirect를 수동으로 처리
    });
    
    if (sessionResponse.status === 302) {
      // 302 Redirect는 정상 (세션 발급 후 리다이렉트)
      // Location 헤더에서 order 파라미터 추출
      const location = sessionResponse.headers.get('Location');
      if (location) {
        try {
          const url = new URL(location, window.location.origin);
          const redirectedOrder = url.searchParams.get('order');
          if (redirectedOrder) {
            // 세션 토큰이 쿠키에 설정되었으므로 바로 조회 가능
            await loadGuestOrderDetailsBySession(redirectedOrder);
            return;
          }
        } catch (urlError) {
          console.warn('리다이렉트 URL 파싱 실패:', urlError);
        }
      }
      // Location 헤더가 없거나 order 파라미터가 없으면 원래 orderNumber 사용
      await loadGuestOrderDetailsBySession(orderNumber);
      return;
    }
    
    if (!sessionResponse.ok) {
      const errorData = await sessionResponse.json().catch(() => ({}));
      console.warn('비회원 주문 세션 발급 실패', sessionResponse.status, errorData);
      showOrderError(errorData.message || '주문 정보를 불러올 수 없습니다. 이메일로 발송된 링크를 사용해주세요.');
      return;
    }
    
    // 200 OK 응답인 경우 (일반적으로는 302가 나와야 함)
    const sessionData = await sessionResponse.json();
    if (sessionData.success) {
      // 세션 발급 성공 시 주문 조회
      await loadGuestOrderDetailsBySession(orderNumber);
    } else {
      showOrderError(sessionData.message || '주문 정보를 불러올 수 없습니다.');
    }
    
  } catch (error) {
    console.error('비회원 주문 조회 오류:', error);
    showOrderError('주문 정보를 불러오는 중 오류가 발생했습니다.');
  }
}

// ⚠️ 비회원 주문 조회 (세션 토큰 사용)
async function loadGuestOrderDetailsBySession(orderNumber) {
  try {
    const response = await fetch(`${API_BASE}/guest/orders/${orderNumber}`, {
      credentials: 'include' // 세션 토큰이 httpOnly 쿠키로 전송됨
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        showOrderError('세션이 만료되었습니다. 이메일로 발송된 링크를 다시 사용해주세요.');
        return;
      }
      if (response.status === 404) {
        showOrderError('주문을 찾을 수 없습니다. 주문 번호를 확인해주세요.');
        return;
      }
      const errMessage = `주문 정보 조회 실패: ${response.status}`;
      throw new Error(errMessage);
    }
    
    const result = await response.json();
    if (result.success && result.data) {
      // ⚠️ 비회원 주문 응답 형식: result.data.order, result.data.items, result.data.shipping 등
      // displayOrderInfoFromServer는 첫 번째 인자로 data 객체, 두 번째 인자로 orderDetail 객체를 받음
      // 비회원 응답 형식에 맞게 변환
      const orderData = result.data.order || {
        order_number: result.data.order_number,
        order_date: result.data.order_date,
        total_price: result.data.total_price,
        status: result.data.status,
        paid_at: result.data.paid_at
      };
      
      // displayOrderInfoFromServer 호출 (회원과 동일한 형식으로 변환)
      displayOrderInfoFromServer({
        order_number: orderData.order_number,
        amount: orderData.total_price,
        currency: result.data.payment?.currency || 'KRW',
        fraction: 0,
        status: orderData.status,
        eta: null
      }, {
        order: orderData,
        shipping: result.data.shipping,
        items: result.data.items,
        payment: result.data.payment,
        shipments: result.data.shipments || []
      });
    } else {
      showOrderError('주문 정보를 불러올 수 없습니다.');
    }
  } catch (error) {
    console.error('비회원 주문 조회 오류:', error);
    showOrderError('주문 정보를 불러오는 중 오류가 발생했습니다.');
  }
}

async function loadOrderDetails(orderId) {
  try {
    const response = await fetch(`${API_BASE}/orders/${orderId}`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        console.warn('주문 정보 조회 권한 없음', response.status);
        showOrderError('주문 정보를 확인하려면 로그인이 필요합니다.');
        return;
      }
      if (response.status === 404) {
        showOrderError('주문을 찾을 수 없습니다. 주문 번호를 확인해주세요.');
        return;
      }
      const errMessage = `주문 정보 조회 실패: ${response.status}`;
      throw new Error(errMessage);
    }
    
    const result = await response.json();
    
    // 서버 응답 우선 사용 (data 필드)
    if (result.success && result.data) {
      // 서버에서 받은 최신 정보로 렌더링
      displayOrderInfoFromServer(result.data, result.order);
      
      // 세션스토리지 정리 (서버가 진실 원천)
      sessionStorage.removeItem('serverCurrencyInfo');
      
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
    showOrderError(error.message || '주문 정보를 불러오는 중 오류가 발생했습니다.');
  }
}

function displayOrderInfoFromServer(data, orderDetail) {
  const orderInfoSection = document.getElementById('order-info-section');
  if (!orderInfoSection) {
    console.error('❌ order-info-section을 찾을 수 없습니다');
    return;
  }
  
  // showPaymentProcessing()에서 innerHTML을 교체했을 수 있으므로, HTML 구조를 다시 생성
  orderInfoSection.style.display = 'block';
  
  // HTML 구조가 없으면 다시 생성
  if (!document.getElementById('order-id')) {
    orderInfoSection.innerHTML = `
      <h2 class="order-info-title">주문 정보</h2>
      <div class="order-info-content">
        <div class="order-info-item">
          <span class="order-info-label">주문 번호:</span>
          <span class="order-info-value" id="order-id">-</span>
        </div>
        <div class="order-info-item">
          <span class="order-info-label">주문 금액:</span>
          <span class="order-info-value" id="order-total">-</span>
        </div>
        <div class="order-info-item">
          <span class="order-info-label">예상 배송일:</span>
          <span class="order-info-value" id="estimated-delivery">-</span>
        </div>
      </div>
      <div class="shipping-info-section">
        <h3 class="shipping-info-title">배송 정보</h3>
        <div class="shipping-info-content" id="shipping-info-content">
          <!-- 배송 정보가 여기에 표시됩니다 -->
        </div>
      </div>
    `;
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
      <p><strong>수령인:</strong> ${escapeHtml(shipping.recipient_name || `${shipping.first_name || ''} ${shipping.last_name || ''}`.trim())}</p>
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

/**
 * 토스페이먼츠 결제 성공 처리
 * successUrl에서 paymentKey, orderId, amount를 받아 서버에 결제 확인 요청
 */
async function handleTossPaymentSuccess(paymentKey, orderId, amount) {
  try {
    // 로딩 상태 표시
    showPaymentProcessing();
    
    // 서버에 결제 확인 요청 (타임아웃 60초로 증가 - processPaidOrder가 오래 걸릴 수 있음)
    const response = await window.secureFetch(`${API_BASE}/payments/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      timeoutMs: 60000, // 60초로 증가 (기본값: 15초)
      body: JSON.stringify({
        orderNumber: orderId,
        paymentKey: paymentKey,
        amount: parseFloat(amount)
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.details?.message || '결제 확인에 실패했습니다.');
    }
    
    const result = await response.json();
    
    // ⚠️ 비회원 주문인 경우 guest_order_access_token을 URL 파라미터로 전달
    const guestToken = result.data?.guest_access_token;
    if (guestToken) {
      // 비회원 주문: guestToken과 함께 주문 조회
      await loadGuestOrderDetails(orderId, guestToken);
    } else {
      // 회원 주문: 기존 방식대로 조회
      await loadOrderDetails(orderId);
    }
    
    // 성공 메시지 표시
    showPaymentSuccess();
    
  } catch (error) {
    console.error('❌ 결제 확인 실패:', error);
    showPaymentError(error.message || '결제 확인 중 오류가 발생했습니다.');
  }
}

/**
 * 결제 처리 중 상태 표시
 */
function showPaymentProcessing() {
  const orderInfoSection = document.getElementById('order-info-section');
  if (orderInfoSection) {
    orderInfoSection.style.display = 'block';
    orderInfoSection.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <div class="loading-spinner" style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #111; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;"></div>
        <p style="color: #666; font-size: 16px;">결제 확인 중...</p>
      </div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;
  }
}

/**
 * 결제 성공 메시지 표시
 */
function showPaymentSuccess() {
  // 이미 loadOrderDetails에서 주문 정보가 표시되므로 추가 메시지는 생략
  // 필요시 토스트 메시지나 배너 추가 가능
}

/**
 * 결제 에러 메시지 표시
 */
function showPaymentError(message) {
  const orderInfoSection = document.getElementById('order-info-section');
  if (orderInfoSection) {
    orderInfoSection.style.display = 'block';
    orderInfoSection.innerHTML = `
      <div class="error-content" style="text-align: center; padding: 40px;">
        <h2 style="color: #e74c3c; margin-bottom: 16px;">⚠️ 결제 확인 실패</h2>
        <p style="color: #666; margin-bottom: 24px;">${escapeHtml(message)}</p>
        <div class="error-actions" style="display: flex; gap: 12px; justify-content: center;">
          <button id="retry-payment-btn" class="retry-btn" style="padding: 10px 20px; background: #111; color: #fff; border: none; border-radius: 4px; cursor: pointer;">다시 시도</button>
          <a href="my-orders.html" class="my-orders-link" style="padding: 10px 20px; background: #f0f0f0; color: #111; text-decoration: none; border-radius: 4px;">내 주문 보기</a>
        </div>
      </div>
    `;
    
    // 재시도 버튼 이벤트
    const retryBtn = document.getElementById('retry-payment-btn');
    if (retryBtn) {
      const urlParams = new URLSearchParams(window.location.search);
      const paymentKey = urlParams.get('paymentKey');
      const orderId = urlParams.get('orderId');
      const amount = urlParams.get('amount');
      
      retryBtn.addEventListener('click', () => {
        if (paymentKey && orderId && amount) {
          handleTossPaymentSuccess(paymentKey, orderId, amount);
        }
      });
    }
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
