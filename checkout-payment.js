// checkout-payment.js - 3단계: 결제 방법 선택 및 결제 진행

function isDevHost() {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

/** 배송 정보에서 결제/주문에 쓸 수령인 이름 (recipient_name 우선, 없으면 first/last 조합) */
function getShippingDisplayName(shipping) {
  if (!shipping) return '';
  const name = (shipping.recipient_name || '').trim();
  if (name) return name;
  const first = (shipping.recipient_first_name || '').trim();
  const last = (shipping.recipient_last_name || '').trim();
  return [first, last].filter(Boolean).join(' ').trim() || '';
}

/** 개발 환경 전용 샘플 데이터 (디자인 확인용) */
function getDevSampleData() {
  return {
    shipping: {
      recipient_first_name: '길동',
      recipient_last_name: '홍',
      address: '서울시 강남구 테헤란로 123',
      city: '서울',
      postal_code: '06134',
      country: '대한민국',
      phone: '010-1234-5678'
    },
    items: [
      { name: '디자인용 샘플 상품', image: '/image/hat.jpg', color: 'Black', size: 'M', quantity: 1, price: 25000 }
    ]
  };
}

const API_BASE = (window.API_BASE)
  ? window.API_BASE
  : ((window.location && window.location.origin)
      ? window.location.origin.replace(/\/$/, '') + '/api'
      : '/api');

const TOSS_ERROR_MESSAGES = {
  USER_CANCEL: '결제가 취소되었습니다.',
  USER_ACCOUNT_FROZEN: '해당 계정은 일시적으로 결제가 제한되었습니다.',
  EXCEED_PAYMENT_LIMIT: '결제 한도를 초과했습니다.',
  EXCEED_DAILY_LIMIT: '일일 결제 한도를 초과했습니다.',
  EXCEED_MONTHLY_LIMIT: '월 결제 한도를 초과했습니다.',
  INSUFFICIENT_FUNDS: '잔액이 부족합니다.',
  INVALID_CARD: '유효하지 않은 카드 정보입니다.',
  REJECT_CARD: '카드사가 결제를 거절했습니다.',
  REJECTED_3DS: '3D 인증이 거절되었습니다. 다른 카드로 시도해주세요.',
  FAILED_3DS: '3D 인증에 실패했습니다. 다시 시도해주세요.',
  PAY_PROCESS_CANCELED: '결제가 취소되었습니다.',
  PAY_PROCESS_TIMEOUT: '결제가 제한 시간 안에 완료되지 않았습니다.',
  NETWORK_ERROR: '네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  INTERNAL_SERVER_ERROR: '결제 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  INVALID_REQUEST: '결제 요청 정보가 올바르지 않습니다.'
};

/** 재진입 시 서버에 주문 상태 물어보기. 이미 결제 완료면 order-complete로, 접근 거부면 index로. 진행이면 true 반환. */
async function runRecheckOrderStatus() {
  const orderNumber = sessionStorage.getItem('checkoutLastOrderNumber');
  if (!orderNumber) return true;
  const sessionKey = sessionStorage.getItem('checkoutSessionKey_' + orderNumber);
  if (!sessionKey) return true;
  try {
    const res = await fetch(
      `${API_BASE}/payments/orders/${encodeURIComponent(orderNumber)}/status?checkoutSessionKey=${encodeURIComponent(sessionKey)}`,
      { method: 'GET', credentials: 'include' }
    );
    const data = await res.json().catch(() => ({}));
    if (res.status === 200 && data.success && data.data && data.data.status === 'paid') {
      window.location.replace('order-complete.html?orderId=' + encodeURIComponent(orderNumber));
      return false;
    }
    if (res.status === 403 && data.code === 'SESSION_CONSUMED') {
      window.location.replace('order-complete.html?orderId=' + encodeURIComponent(orderNumber));
      return false;
    }
    if (res.status === 403 || res.status === 404) {
      window.location.replace('index.html');
      return false;
    }
  } catch (e) {
    // 네트워크 오류 시 진행 (기존대로 결제 UI 표시)
  }
  return true;
}

document.addEventListener('DOMContentLoaded', async function() {
  // 재진입 검사: 이미 결제된 주문이면 order-complete로, 권한 없으면 index로 (ORDER_ALREADY_PAID_REVISED_PLAN §4.5)
  const shouldContinue = await runRecheckOrderStatus();
  if (!shouldContinue) return;

  // CSRF 토큰 받기 (GET 요청으로 토큰 발급)
  try {
    const statusRes = await fetch(`${API_BASE}/auth/status`, {
      method: 'GET',
      credentials: 'include'
    });
    
    // 쿠키 확인
    const cookies = document.cookie;
    const hasCSRFToken = cookies.includes('xsrf-token=');
  } catch (error) {
    // CSRF 토큰 발급 실패 (조용히 처리)
  }
  
  // URL 파라미터 확인 (토스페이먼츠 fail URL 처리)
  const urlParams = new URLSearchParams(window.location.search);
  const failStatus = urlParams.get('status');
  const failCode = urlParams.get('code');
  const failMessage = urlParams.get('message');
  
  // 재고 부족으로 결제 확인 실패한 경우 (이니시스 등 리다이렉트, 7번 UX)
  if (failCode === 'INSUFFICIENT_STOCK') {
    alert('고객님, 대단히 죄송합니다. 결제를 진행하시는 동안 선택하신 상품의 재고가 모두 소진되었습니다. 장바구니에서 다시 확인해 주세요.');
    window.history.replaceState({}, '', window.location.pathname);
    window.location.href = 'cart.html';
    return;
  }
  // 결제 실패 URL에서 온 경우
  if (failStatus === 'fail' || failCode) {
    showPaymentFailureMessage(failCode, failMessage);
    // URL에서 실패 파라미터 제거 (뒤로가기 시 재표시 방지)
    window.history.replaceState({}, '', window.location.pathname);
  }
  
  // 세션 스토리지에서 배송 데이터 가져오기
  let shippingDataStr = sessionStorage.getItem('checkoutShippingData');
  let data;

  if (shippingDataStr) {
    data = JSON.parse(shippingDataStr);
  } else if (isDevHost()) {
    data = getDevSampleData();
    Logger.log('🎨 개발 환경: 샘플 데이터로 결제 페이지 디자인 확인');
  } else {
    alert('배송 정보를 찾을 수 없습니다. 처음부터 다시 시작해주세요.');
    window.location.href = 'checkout.html';
    return;
  }

  // 좌측 배송 정보 (review와 동일 형식)
  renderShippingInfoLeft(data.shipping);
  // 우측 주문 요약 (review와 동일 구조: cart-item, summary-rows)
  renderOrderItems(data.items);
  updateOrderSummary(data.items);

  // 이벤트 바인딩
  bindEventListeners(data);
});

// bfcache 복원 시에도 서버 재검사 (ORDER_ALREADY_PAID_REVISED_PLAN §4.5)
window.addEventListener('pageshow', async function(event) {
  if (event.persisted !== true) return;
  const shouldContinue = await runRecheckOrderStatus();
  if (!shouldContinue) return;
  // 이미 렌더된 화면이 복원된 경우, 추가 처리 없음
});

/** 우측 주문 요약: checkout-review와 동일 구조 (cart-item, summary-rows용) */
function renderOrderItems(items) {
  const container = document.getElementById('order-items');
  const subtotalEl = document.getElementById('subtotal');
  const totalEl = document.getElementById('total');
  if (!container) return;

  const fmt = typeof formatPrice === 'function' ? formatPrice : function (n) { return '₩' + new Intl.NumberFormat('ko-KR').format(n); };

  if (!items || items.length === 0) {
    container.innerHTML = '<p class="order-summary-empty">주문할 상품이 없습니다.</p>';
    if (subtotalEl) subtotalEl.textContent = fmt(0);
    if (totalEl) totalEl.textContent = fmt(0);
    return;
  }

  const subtotalPrice = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  if (subtotalEl) subtotalEl.textContent = fmt(subtotalPrice);
  if (totalEl) totalEl.textContent = fmt(subtotalPrice);

  container.innerHTML = items.map(item => {
    let imageSrc = item.image || '';
    if (imageSrc.startsWith('/uploads/') || imageSrc.startsWith('/image/')) {
      // keep
    } else if (imageSrc) {
      imageSrc = imageSrc.startsWith('image/') ? '/' + imageSrc : '/image/' + imageSrc;
    } else {
      imageSrc = '/image/default.jpg';
    }
    const optionParts = [item.color, item.size].filter(function (v) { return (v || '').toString().trim(); }).map(function (v) { return escapeHtml(String(v).trim()); });
    const optionHtml = optionParts.length ? '<p class="cart-item-option">' + optionParts.join(' · ') + '</p>' : '';
    const qty = item.quantity || 1;
    const lineTotal = (item.price || 0) * qty;
    return (
      '<div class="cart-item checkout-summary-item">' +
      '<img src="' + escapeHtml(imageSrc) + '" alt="' + escapeHtml(item.name) + '" class="cart-item-image" onerror="this.src=\'/image/default.jpg\'">' +
      '<div class="cart-item-info">' +
      '<h3 class="cart-item-name">' + escapeHtml(item.name) + '</h3>' +
      optionHtml +
      '<div class="cart-item-details">' +
      '<div class="cart-item-quantity-row"><span class="cart-item-quantity-label">수량</span><span class="cart-qty-value">' + qty + '</span></div>' +
      '</div></div>' +
      '<div class="cart-item-price">' + fmt(lineTotal) + '</div></div>'
    );
  }).join('');
}

function updateOrderSummary(items) {
  const totalPrice = items && items.length ? items.reduce((sum, item) => sum + (item.price * item.quantity), 0) : 0;
  const fmt = typeof formatPrice === 'function' ? formatPrice : function (n) { return '₩' + new Intl.NumberFormat('ko-KR').format(n); };
  const subtotalEl = document.getElementById('subtotal');
  const totalEl = document.getElementById('total');
  if (subtotalEl) subtotalEl.textContent = fmt(totalPrice);
  if (totalEl) totalEl.textContent = fmt(totalPrice);
}

/** 좌측 배송 정보 (checkout-review와 동일 형식: 이름, 이메일, 전화번호, 주소, 도시, 우편번호, 국가) */
function renderShippingInfoLeft(shipping) {
  const container = document.getElementById('shipping-info-payment-left');
  if (!container) return;
  const name = shipping.recipient_name || [shipping.recipient_first_name, shipping.recipient_last_name].filter(Boolean).join(' ').trim() || '-';
  container.innerHTML = `
    <div style="line-height: 1.8;">
      <p><strong>이름:</strong> ${escapeHtml(name)}</p>
      <p><strong>이메일:</strong> ${escapeHtml(shipping.email || '-')}</p>
      <p><strong>전화번호:</strong> ${escapeHtml(shipping.phone || '')}</p>
      <p><strong>주소:</strong> ${escapeHtml(shipping.address || '')}</p>
      <p><strong>도시:</strong> ${escapeHtml(shipping.city || '')}</p>
      <p><strong>우편번호:</strong> ${escapeHtml(shipping.postal_code || '')}</p>
      <p><strong>국가:</strong> ${escapeHtml(shipping.country || '')}</p>
    </div>
  `;
}

function bindEventListeners(data) {
  const proceedBtn = document.getElementById('proceed-payment-btn');
  const paymentRadios = document.querySelectorAll('input[name="payment"]');

  const updateSelectionState = () => {
    const checkedRadio = document.querySelector('input[name="payment"]:checked');
    const isSelected = !!checkedRadio;
    if (proceedBtn) proceedBtn.disabled = !isSelected;
    paymentRadios.forEach(radio => {
      radio.setAttribute('aria-checked', radio.checked ? 'true' : 'false');
    });
  };

  paymentRadios.forEach(radio => {
    radio.addEventListener('change', updateSelectionState);
  });
  updateSelectionState();

  const handlePayment = async function() {
    const errEl = document.getElementById('payment-error');
    if (errEl) {
      errEl.textContent = '';
      errEl.classList.add('hidden');
    }
    const checkedRadio = document.querySelector('input[name="payment"]:checked');
    if (!checkedRadio) {
      alert('결제 방법을 선택해주세요.');
      return;
    }
    const selectedPayment = checkedRadio.value;
    if (selectedPayment === 'toss') {
      await proceedWithTossPayment(data);
    } else if (selectedPayment === 'inicis') {
      await proceedWithInicisPayment(data);
    } else {
      alert('현재 지원되는 결제 방법이 아닙니다.');
    }
  };

  if (proceedBtn) proceedBtn.addEventListener('click', handlePayment);
}

async function proceedWithTossPayment(data) {
  const proceedBtn = document.getElementById('proceed-payment-btn');
  const originalText = proceedBtn?.textContent || '확인 및 진행';

  try {
    if (proceedBtn) {
      proceedBtn.disabled = true;
      proceedBtn.textContent = '처리 중...';
    }
    
    // 1. 주문 생성 (SSOT 함수 사용) — 유효하지 않은 항목이 있으면 주문 전체 중단 (같은 체크아웃 흐름에서 idemKey 유지)
    let idemKey = sessionStorage.getItem('checkoutIdemKey');
    if (!idemKey) {
      idemKey = uuidv4();
      sessionStorage.setItem('checkoutIdemKey', idemKey);
    }

    if (!window.createOrderPayload) {
      throw new Error('checkout-utils.js가 로드되지 않았습니다.');
    }

    let requestPayload;
    try {
      requestPayload = window.createOrderPayload(data.items, data.shipping);
    } catch (payloadError) {
      const msg = (payloadError && payloadError.message) ? String(payloadError.message) : '';
      const isValidationError = /주문할 수 없습니다|유효하지 않아|유효한 상품/.test(msg);
      const displayMsg = isValidationError
        ? '일부 상품 정보가 만료되었거나 올바르지 않습니다. 장바구니를 확인해 주세요.'
        : (msg || '주문 정보를 확인할 수 없습니다. 장바구니를 확인해 주세요.');
      const errEl = document.getElementById('payment-error');
      if (errEl) {
        errEl.textContent = displayMsg;
        errEl.classList.remove('hidden');
      }
      return;
    }

    const createRes = await window.secureFetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idemKey
      },
      credentials: 'include',
      body: JSON.stringify(requestPayload)
    });

    if (!createRes.ok) {
      const errorData = await createRes.json().catch(() => ({}));
      if (createRes.status === 409 && errorData.code === 'ORDER_ALREADY_PAID') {
        const orderNum = errorData.details?.order_number;
        if (orderNum) {
          const guestToken = errorData.details?.guest_access_token;
          const url = guestToken
            ? 'order-complete.html?orderId=' + encodeURIComponent(orderNum) + '&guestToken=' + encodeURIComponent(guestToken)
            : 'order-complete.html?orderId=' + encodeURIComponent(orderNum);
          window.location.replace(url);
          return;
        }
      }
      if (createRes.status === 500 && errorData.code === 'ORDER_ITEMS_MISMATCH') {
        const msg = '선택하신 상품 중 일부의 정보가 변경되어 주문을 완료할 수 없습니다. 최신 상태가 반영된 장바구니로 이동하여 다시 확인해 주세요.';
        if (window.showGlobalErrorBanner) {
          window.showGlobalErrorBanner({
            title: '장바구니 확인',
            message: msg,
            retryLabel: '장바구니로 이동',
            onRetry: function() { window.location.href = 'cart.html'; }
          });
        } else {
          alert(msg);
          window.location.href = 'cart.html';
        }
        return;
      }
      throw new Error(errorData.details?.message || '주문 생성 실패');
    }

    const created = await createRes.json();

    const orderNumber = created.data.order_number;
    const amount = created.data.amount;
    const checkoutSessionKey = created.data?.checkoutSessionKey;
    if (orderNumber) sessionStorage.setItem('checkoutLastOrderNumber', orderNumber);
    if (checkoutSessionKey) {
      sessionStorage.setItem('checkoutSessionKey_' + orderNumber, checkoutSessionKey);
    }

    // 2. 토스페이먼츠 결제 위젯 실행
    // MOCK 모드 체크 (환경변수 또는 설정으로 제어 가능)
    const useMockPayment = false; // 테스트 키 사용 시 false로 설정
    
    if (useMockPayment) {
      // MOCK 결제 처리 (개발/테스트용)
      const confirmRes = await window.secureFetch(`${API_BASE}/payments/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          orderNumber: orderNumber,
          paymentKey: 'mock_key_' + Date.now(),
          amount: amount,
          checkoutSessionKey: checkoutSessionKey || sessionStorage.getItem('checkoutSessionKey_' + orderNumber)
        })
      });
      
      if (!confirmRes.ok) {
        const errorData = await confirmRes.json();
        throw new Error(errorData.details?.message || '결제 확인 실패');
      }
      
      const confirmed = await confirmRes.json();
      
      // ⚠️ 비회원 주문인 경우 guest_order_access_token을 URL 파라미터로 전달
      const guestToken = confirmed.data?.guest_access_token;
      const redirectUrl = guestToken 
        ? `order-complete.html?orderId=${orderNumber}&guestToken=${encodeURIComponent(guestToken)}`
        : `order-complete.html?orderId=${orderNumber}`;
      
      // MOCK 모드에서는 바로 완료 페이지로 이동
      window.location.href = redirectUrl;
      return;
    }
    
    // 실제 토스페이먼츠 위젯 연동
    const clientKey = window.TOSS_CLIENT_KEY;
    
    if (!clientKey) {
      throw new Error('토스페이먼츠 클라이언트 키가 설정되지 않았습니다.');
    }
    
    if (typeof TossPayments === 'undefined') {
      throw new Error('토스페이먼츠 스크립트가 로드되지 않았습니다.');
    }
    
    const toss = TossPayments(clientKey);
    
    // successUrl/failUrl은 절대 URL만 필요 (토스페이먼츠가 자동으로 파라미터 추가)
    const successUrl = `${window.location.origin}/order-complete.html?orderId=${orderNumber}&amount=${amount}`;
    const failUrl = `${window.location.origin}/checkout-payment.html?status=fail`;
    
    try {
      // 위젯 실행 (결제 완료 시 successUrl로 자동 리다이렉트됨)
      const result = await toss.requestPayment('카드', {
        amount: amount,
        orderId: orderNumber,
        orderName: data.items.length === 1 
          ? data.items[0].name 
          : `${data.items[0].name} 외 ${data.items.length - 1}개`,
        customerName: getShippingDisplayName(data.shipping),
        successUrl: successUrl,
        failUrl: failUrl
      });
      
    } catch (error) {
      throw new Error(error.message || '결제 위젯 실행 중 오류가 발생했습니다.');
    }
    
    // 위젯이 열리면 사용자가 결제를 진행하고,
    // 완료 시 successUrl로 자동 리다이렉트됨
    // 결제 확인 및 장바구니 정리는 order-complete-script.js에서 처리됨
    
  } catch (error) {
    let errorMessage = '결제 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
    if (error.message) {
      errorMessage = error.message;
    }
    
    // 토스페이먼츠 에러 코드 매핑
    if (error.message && error.message.includes('잘못된')) {
      errorMessage = '결제 정보가 올바르지 않습니다. 다시 시도해주세요.';
    }
    
    const errEl = document.getElementById('payment-error');
    if (errEl) {
      errEl.textContent = `결제에 실패했습니다: ${errorMessage}`;
      errEl.classList.remove('hidden');
    }
    if (window.showGlobalErrorBanner) {
      window.showGlobalErrorBanner({
        title: '결제 처리 실패',
        message: errorMessage,
        onRetry: () => proceedWithTossPayment(data)
      });
    }
  } finally {
    if (proceedBtn && proceedBtn.disabled) {
      proceedBtn.disabled = false;
      proceedBtn.textContent = originalText;
    }
  }
}

async function proceedWithInicisPayment(data) {
  const proceedBtn = document.getElementById('proceed-payment-btn');
  const originalText = proceedBtn?.textContent || '확인 및 진행';

  try {
    if (proceedBtn) {
      proceedBtn.disabled = true;
      proceedBtn.textContent = '처리 중...';
    }
    
    // 1. 주문 생성 (SSOT 함수 사용) — 유효하지 않은 항목이 있으면 주문 전체 중단 (같은 체크아웃 흐름에서 idemKey 유지)
    let idemKey = sessionStorage.getItem('checkoutIdemKey');
    if (!idemKey) {
      idemKey = uuidv4();
      sessionStorage.setItem('checkoutIdemKey', idemKey);
    }

    if (!window.createOrderPayload) {
      throw new Error('checkout-utils.js가 로드되지 않았습니다.');
    }

    let requestPayload;
    try {
      requestPayload = window.createOrderPayload(data.items, data.shipping);
    } catch (payloadError) {
      const msg = (payloadError && payloadError.message) ? String(payloadError.message) : '';
      const isValidationError = /주문할 수 없습니다|유효하지 않아|유효한 상품/.test(msg);
      const displayMsg = isValidationError
        ? '일부 상품 정보가 만료되었거나 올바르지 않습니다. 장바구니를 확인해 주세요.'
        : (msg || '주문 정보를 확인할 수 없습니다. 장바구니를 확인해 주세요.');
      const errEl = document.getElementById('payment-error');
      if (errEl) {
        errEl.textContent = displayMsg;
        errEl.classList.remove('hidden');
      }
      return;
    }

    const createRes = await window.secureFetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idemKey
      },
      credentials: 'include',
      body: JSON.stringify(requestPayload)
    });

    if (!createRes.ok) {
      const errorData = await createRes.json().catch(() => ({}));
      if (createRes.status === 409 && errorData.code === 'ORDER_ALREADY_PAID') {
        const orderNum = errorData.details?.order_number;
        if (orderNum) {
          const guestToken = errorData.details?.guest_access_token;
          const url = guestToken
            ? 'order-complete.html?orderId=' + encodeURIComponent(orderNum) + '&guestToken=' + encodeURIComponent(guestToken)
            : 'order-complete.html?orderId=' + encodeURIComponent(orderNum);
          window.location.replace(url);
          return;
        }
      }
      if (createRes.status === 500 && errorData.code === 'ORDER_ITEMS_MISMATCH') {
        const msg = '선택하신 상품 중 일부의 정보가 변경되어 주문을 완료할 수 없습니다. 최신 상태가 반영된 장바구니로 이동하여 다시 확인해 주세요.';
        if (window.showGlobalErrorBanner) {
          window.showGlobalErrorBanner({
            title: '장바구니 확인',
            message: msg,
            retryLabel: '장바구니로 이동',
            onRetry: function() { window.location.href = 'cart.html'; }
          });
        } else {
          alert(msg);
          window.location.href = 'cart.html';
        }
        return;
      }
      throw new Error(errorData.details?.message || '주문 생성 실패');
    }

    const created = await createRes.json();
    const orderNumber = created.data.order_number;
    const amount = created.data.amount;
    const checkoutSessionKeyInicis = created.data?.checkoutSessionKey;
    if (orderNumber) sessionStorage.setItem('checkoutLastOrderNumber', orderNumber);
    if (checkoutSessionKeyInicis) {
      sessionStorage.setItem('checkoutSessionKey_' + orderNumber, checkoutSessionKeyInicis);
    }

    // 2. 이니시스 결제창 요청 (서버에서 결제 정보 생성)
    const paymentRes = await window.secureFetch(`${API_BASE}/payments/inicis/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        orderNumber: orderNumber,
        amount: amount,
        orderName: data.items.length === 1 
          ? data.items[0].name 
          : `${data.items[0].name} 외 ${data.items.length - 1}개`,
        buyerName: getShippingDisplayName(data.shipping),
        buyerEmail: data.shipping.email,
        buyerTel: data.shipping.phone
      })
    });
    
    if (!paymentRes.ok) {
      const errorData = await paymentRes.json();
      const errorMessage = errorData.details?.message || '결제 요청 실패';
      
      // 이니시스 설정 미완료인 경우 사용자 친화적 메시지
      if (errorData.code === 'SERVICE_UNAVAILABLE') {
        throw new Error('이니시스 결제 서비스가 아직 준비되지 않았습니다. 토스페이먼츠를 이용해주세요.');
      }
      
      throw new Error(errorMessage);
    }
    
    const paymentData = await paymentRes.json();
    
    // 3. 이니시스 결제창 호출
    if (typeof INIStdPay === 'undefined') {
      throw new Error('이니시스 결제 스크립트가 로드되지 않았습니다.');
    }
    
    // 이니시스 표준결제창 호출
    INIStdPay.pay(paymentData.data.formData);
    
    // 결제 완료/실패는 이니시스가 지정한 returnUrl로 리다이렉트됨
    // (서버에서 설정한 returnUrl로 이동)
    
  } catch (error) {
    let errorMessage = '결제 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
    if (error.message) errorMessage = error.message;
    const errEl = document.getElementById('payment-error');
    if (errEl) {
      errEl.textContent = `결제에 실패했습니다: ${errorMessage}`;
      errEl.classList.remove('hidden');
    }
  } finally {
    if (proceedBtn && proceedBtn.disabled) {
      proceedBtn.disabled = false;
      proceedBtn.textContent = originalText;
    }
  }
}

/**
 * 결제 실패 메시지 표시
 */
function showPaymentFailureMessage(code, message) {
  const resolvedMessage = (() => {
    if (message) {
      try {
        return decodeURIComponent(message);
      } catch (e) {
        return message;
      }
    }
    if (code && TOSS_ERROR_MESSAGES[code]) {
      return TOSS_ERROR_MESSAGES[code];
    }
    if (code) {
      return `결제 실패 (코드: ${code})`;
    }
    return '결제에 실패했습니다.';
  })();

  if (window.showGlobalErrorBanner) {
    window.showGlobalErrorBanner({
      title: '결제를 완료할 수 없습니다',
      message: resolvedMessage,
      onRetry: () => {
        const btn = document.getElementById('proceed-payment-btn');
        if (btn && !btn.disabled) btn.click();
      }
    });
  } else {
    alert(resolvedMessage);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// UUID v4 생성 함수
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}


