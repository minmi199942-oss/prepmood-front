// checkout-payment.js - 3단계: 결제 방법 선택 및 결제 진행

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

document.addEventListener('DOMContentLoaded', async function() {
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
  
  // 결제 실패 URL에서 온 경우
  if (failStatus === 'fail' || failCode) {
    showPaymentFailureMessage(failCode, failMessage);
    // URL에서 실패 파라미터 제거 (뒤로가기 시 재표시 방지)
    window.history.replaceState({}, '', window.location.pathname);
  }
  
  // 세션 스토리지에서 배송 데이터 가져오기
  const shippingDataStr = sessionStorage.getItem('checkoutShippingData');
  
  if (!shippingDataStr) {
    alert('배송 정보를 찾을 수 없습니다. 처음부터 다시 시작해주세요.');
    window.location.href = 'checkout.html';
    return;
  }
  
  const data = JSON.parse(shippingDataStr);
  
  // 주문 요약 업데이트
  renderOrderItems(data.items);
  updateOrderSummary(data.items);
  renderShippingSummary(data.shipping);
  
  // 이벤트 바인딩
  bindEventListeners(data);
});

function renderOrderItems(items) {
  const container = document.getElementById('order-items');
  
  if (!container) {
    return;
  }
  
  if (!items || items.length === 0) {
    container.innerHTML = '<p style="font-size: 13px; color: #666;">주문할 상품이 없습니다.</p>';
    return;
  }
  
  container.innerHTML = items.map(item => {
    const formattedPrice = new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0
    }).format(item.price * item.quantity);
    
    // ⚠️ 이미지 경로 처리: /uploads/products/로 시작하면 그대로 사용, 아니면 /image/ 추가
    let imageSrc = item.image || '';
    if (imageSrc.startsWith('/uploads/')) {
      // 업로드된 이미지 (새로 추가/수정된 이미지)
      imageSrc = imageSrc;
    } else if (imageSrc.startsWith('/image/')) {
      // 기존 이미지 경로
      imageSrc = imageSrc;
    } else if (imageSrc) {
      // 상대 경로인 경우
      imageSrc = imageSrc.startsWith('image/') ? '/' + imageSrc : '/image/' + imageSrc;
    } else {
      // 이미지가 없는 경우 기본 이미지
      imageSrc = '/image/default.jpg';
    }
    
    return `
      <div class="order-item">
        <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(item.name)}" onerror="this.src='/image/default.jpg'">
        <div class="item-details">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="item-meta">${escapeHtml(item.size || '')} ${escapeHtml(item.color || '')} · 수량 ${item.quantity}</div>
        </div>
        <div class="item-price">${formattedPrice}</div>
      </div>
    `;
  }).join('');
}

function updateOrderSummary(items) {
  const totalPrice = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  const formattedTotal = new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0
  }).format(totalPrice);
  
  const subtotalEl = document.getElementById('subtotal');
  const totalEl = document.getElementById('total');
  
  if (subtotalEl) {
    subtotalEl.textContent = formattedTotal;
  }
  
  if (totalEl) {
    totalEl.textContent = formattedTotal;
  }
}

function renderShippingSummary(shipping) {
  const container = document.getElementById('shipping-details');
  
  if (!container) {
    return;
  }
  
  container.innerHTML = `
    ${escapeHtml(shipping.recipient_first_name)} ${escapeHtml(shipping.recipient_last_name)}<br>
    ${escapeHtml(shipping.address)}, ${escapeHtml(shipping.city)}<br>
    ${escapeHtml(shipping.postal_code)}, ${escapeHtml(shipping.country)}<br>
    ${escapeHtml(shipping.phone)}
  `;
}

function bindEventListeners(data) {
  // 데스크톱 버튼
  const proceedBtnDesktop = document.getElementById('proceed-payment-desktop');
  // 모바일 버튼
  const proceedBtnMobile = document.getElementById('proceed-payment-mobile');
  
  const paymentRadios = document.querySelectorAll('input[name="payment"]');

  const updateSelectionState = () => {
    const checkedRadio = document.querySelector('input[name="payment"]:checked');
    const isSelected = !!checkedRadio;

    if (proceedBtnDesktop) {
      proceedBtnDesktop.disabled = !isSelected;
    }
    if (proceedBtnMobile) {
      proceedBtnMobile.disabled = !isSelected;
    }

    paymentRadios.forEach(radio => {
      radio.setAttribute('aria-checked', radio.checked ? 'true' : 'false');
    });
  };

  paymentRadios.forEach(radio => {
    radio.addEventListener('change', updateSelectionState);
  });

  updateSelectionState();

  const handlePayment = async function() {
    // 에러 영역 리셋 (새로운 결제 시도 시 이전 에러 제거)
    const errorDesktop = document.getElementById('payment-error');
    const errorMobile = document.getElementById('payment-error-mobile');
    if (errorDesktop) {
      errorDesktop.textContent = '';
      errorDesktop.classList.add('hidden');
    }
    if (errorMobile) {
      errorMobile.textContent = '';
      errorMobile.classList.add('hidden');
    }
    
    // 선택된 결제 방법 확인
    const checkedRadio = document.querySelector('input[name="payment"]:checked');
    if (!checkedRadio) {
      alert('결제 방법을 선택해주세요.');
      return;
    }
    
    const selectedPayment = checkedRadio.value;
    
    if (selectedPayment === 'toss') {
      // 토스페이먼츠 결제 진행
      await proceedWithTossPayment(data);
    } else if (selectedPayment === 'inicis') {
      // 이니시스 결제 진행
      await proceedWithInicisPayment(data);
    } else {
      alert('현재 지원되는 결제 방법이 아닙니다.');
    }
  };
  
  if (proceedBtnDesktop) {
    proceedBtnDesktop.addEventListener('click', handlePayment);
  }
  
  if (proceedBtnMobile) {
    proceedBtnMobile.addEventListener('click', handlePayment);
  }
}

async function proceedWithTossPayment(data) {
  // 버튼 참조를 함수 스코프 상단에서 선언 (finally에서 접근 가능하도록)
  const proceedBtnDesktop = document.getElementById('proceed-payment-desktop');
  const proceedBtnMobile = document.getElementById('proceed-payment-mobile');
  const originalDesktopText = proceedBtnDesktop?.textContent || '확인 및 진행';
  const originalMobileText = proceedBtnMobile?.textContent || '확인 및 진행';
  
  try {
    // 버튼 비활성화 (데스크톱 + 모바일 모두)
    if (proceedBtnDesktop) {
      proceedBtnDesktop.disabled = true;
      proceedBtnDesktop.textContent = '처리 중...';
    }
    
    if (proceedBtnMobile) {
      proceedBtnMobile.disabled = true;
      proceedBtnMobile.textContent = '처리 중...';
    }
    
    // 1. 주문 생성 (SSOT 함수 사용)
    const idemKey = uuidv4();
    
    if (!window.createOrderPayload) {
      throw new Error('checkout-utils.js가 로드되지 않았습니다.');
    }
    
    const requestPayload = window.createOrderPayload(data.items, data.shipping);
    
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
      const errorData = await createRes.json();
      throw new Error(errorData.details?.message || '주문 생성 실패');
    }
    
    const created = await createRes.json();
    
    const orderNumber = created.data.order_number;
    const amount = created.data.amount;
    
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
          amount: amount
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
      // 위젯 실행 전에 페이지 제목 영역을 오버레이 아래로 보내기
      // 토스페이먼츠 위젯 오버레이는 특정 z-index 범위에 있으므로, 제목 영역을 그 아래로 이동
      const paymentHeader = document.querySelector('.checkout-payment-header');
      if (paymentHeader) {
        // position을 relative로 설정하고 z-index를 낮춰서 오버레이 아래로
        const originalPosition = paymentHeader.style.position;
        const originalZIndex = paymentHeader.style.zIndex;
        paymentHeader.style.position = 'relative';
        paymentHeader.style.zIndex = '0';
        paymentHeader.style.transition = 'opacity 0.3s ease, z-index 0s';
        
        // 오류 발생 시 원복을 위해 저장
        paymentHeader.dataset.originalPosition = originalPosition || '';
        paymentHeader.dataset.originalZIndex = originalZIndex || '';
      }
      
      // 위젯 실행 (결제 완료 시 successUrl로 자동 리다이렉트됨)
      const result = await toss.requestPayment('카드', {
        amount: amount,
        orderId: orderNumber,
        orderName: data.items.length === 1 
          ? data.items[0].name 
          : `${data.items[0].name} 외 ${data.items.length - 1}개`,
        customerName: `${data.shipping.recipient_first_name} ${data.shipping.recipient_last_name}`,
        successUrl: successUrl,
        failUrl: failUrl
      });
      
    } catch (error) {
      // 오류 발생 시 제목 영역 스타일 원복
      const paymentHeader = document.querySelector('.checkout-payment-header');
      if (paymentHeader) {
        paymentHeader.style.position = paymentHeader.dataset.originalPosition || '';
        paymentHeader.style.zIndex = paymentHeader.dataset.originalZIndex || '';
        paymentHeader.style.transition = '';
        delete paymentHeader.dataset.originalPosition;
        delete paymentHeader.dataset.originalZIndex;
      }
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
    
    // 에러 메시지를 버튼 위에 표시
    const errorDesktop = document.getElementById('payment-error');
    const errorMobile = document.getElementById('payment-error-mobile');
    const displayMessage = `결제에 실패했습니다: ${errorMessage}`;
    
    if (errorDesktop) {
      errorDesktop.textContent = displayMessage;
      errorDesktop.classList.remove('hidden');
    }
    if (errorMobile) {
      errorMobile.textContent = displayMessage;
      errorMobile.classList.remove('hidden');
    }
    
    // 글로벌 에러 배너도 표시 (추가 안내용)
    if (window.showGlobalErrorBanner) {
      window.showGlobalErrorBanner({
        title: '결제 처리 실패',
        message: errorMessage,
        onRetry: () => proceedWithTossPayment(data)
      });
    }
  } finally {
    // 에러 발생 시 항상 버튼 복구 (리다이렉트되지 않은 경우에만)
    // window.location.href로 이동하면 이 코드는 실행되지 않지만, 안전을 위해 추가
    if (proceedBtnDesktop && proceedBtnDesktop.disabled) {
      proceedBtnDesktop.disabled = false;
      proceedBtnDesktop.textContent = originalDesktopText;
    }
    
    if (proceedBtnMobile && proceedBtnMobile.disabled) {
      proceedBtnMobile.disabled = false;
      proceedBtnMobile.textContent = originalMobileText;
    }
  }
}

async function proceedWithInicisPayment(data) {
  const proceedBtnDesktop = document.getElementById('proceed-payment-desktop');
  const proceedBtnMobile = document.getElementById('proceed-payment-mobile');
  const originalDesktopText = proceedBtnDesktop?.textContent || '확인 및 진행';
  const originalMobileText = proceedBtnMobile?.textContent || '확인 및 진행';
  
  try {
    // 버튼 비활성화
    if (proceedBtnDesktop) {
      proceedBtnDesktop.disabled = true;
      proceedBtnDesktop.textContent = '처리 중...';
    }
    if (proceedBtnMobile) {
      proceedBtnMobile.disabled = true;
      proceedBtnMobile.textContent = '처리 중...';
    }
    
    // 1. 주문 생성 (SSOT 함수 사용)
    const idemKey = uuidv4();
    
    if (!window.createOrderPayload) {
      throw new Error('checkout-utils.js가 로드되지 않았습니다.');
    }
    
    const requestPayload = window.createOrderPayload(data.items, data.shipping);
    
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
      const errorData = await createRes.json();
      throw new Error(errorData.details?.message || '주문 생성 실패');
    }
    
    const created = await createRes.json();
    const orderNumber = created.data.order_number;
    const amount = created.data.amount;
    
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
        buyerName: `${data.shipping.recipient_first_name} ${data.shipping.recipient_last_name}`,
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
    if (error.message) {
      errorMessage = error.message;
    }
    
    const errorDesktop = document.getElementById('payment-error');
    const errorMobile = document.getElementById('payment-error-mobile');
    const displayMessage = `결제에 실패했습니다: ${errorMessage}`;
    
    if (errorDesktop) {
      errorDesktop.textContent = displayMessage;
      errorDesktop.classList.remove('hidden');
    }
    if (errorMobile) {
      errorMobile.textContent = displayMessage;
      errorMobile.classList.remove('hidden');
    }
  } finally {
    // 에러 발생 시 버튼 복구
    if (proceedBtnDesktop && proceedBtnDesktop.disabled) {
      proceedBtnDesktop.disabled = false;
      proceedBtnDesktop.textContent = originalDesktopText;
    }
    if (proceedBtnMobile && proceedBtnMobile.disabled) {
      proceedBtnMobile.disabled = false;
      proceedBtnMobile.textContent = originalMobileText;
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
        const desktopBtn = document.getElementById('proceed-payment-desktop');
        if (desktopBtn && !desktopBtn.disabled) {
          desktopBtn.click();
          return;
        }
        const mobileBtn = document.getElementById('proceed-payment-mobile');
        if (mobileBtn && !mobileBtn.disabled) {
          mobileBtn.click();
        }
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


