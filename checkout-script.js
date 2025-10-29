// 체크아웃 페이지 스크립트

// 국가별 규칙 맵
const COUNTRY_RULES = {
  KR: { postalRe: /^\d{5}$/, phoneRe: /^0\d{1,2}-?\d{3,4}-?\d{4}$/, currency: 'KRW', locale: 'ko-KR', postalHint: '5자리 숫자 (예: 12345)', phoneHint: '010-1234-5678' },
  JP: { postalRe: /^(\d{3}-?\d{4})$/, phoneRe: /^0\d{1,3}-?\d{2,4}-?\d{4}$/, currency: 'JPY', locale: 'ja-JP', postalHint: '123-4567', phoneHint: '03-1234-5678' },
  US: { postalRe: /^\d{5}(-\d{4})?$/, phoneRe: /^[0-9\-\(\)\s]{10,20}$/, currency: 'USD', locale: 'en-US', postalHint: '12345 또는 12345-6789', phoneHint: '(415) 555-1234' },
  CN: { postalRe: /^\d{6}$/, phoneRe: /^[0-9\-\s]{8,20}$/, currency: 'CNY', locale: 'zh-CN', postalHint: '6자리 숫자 (예: 100000)', phoneHint: '010-12345678' },
  GB: { postalRe: /^[A-Za-z0-9\s]{3,8}$/, phoneRe: /^[0-9\-\(\)\s]{10,20}$/, currency: 'GBP', locale: 'en-GB', postalHint: 'SW1A 1AA', phoneHint: '020 1234 5678' },
  DE: { postalRe: /^\d{5}$/, phoneRe: /^[0-9\-\s]{8,20}$/, currency: 'EUR', locale: 'de-DE', postalHint: '5자리 숫자 (예: 10115)', phoneHint: '030 12345678' },
  FR: { postalRe: /^\d{5}$/, phoneRe: /^[0-9\s]{10,20}$/, currency: 'EUR', locale: 'fr-FR', postalHint: '5자리 숫자 (예: 75001)', phoneHint: '01 23 45 67 89' },
  IT: { postalRe: /^\d{5}$/, phoneRe: /^[0-9\s]{9,15}$/, currency: 'EUR', locale: 'it-IT', postalHint: '5자리 숫자 (예: 00118)', phoneHint: '06 1234 5678' },
  ES: { postalRe: /^\d{5}$/, phoneRe: /^[0-9\s]{9,15}$/, currency: 'EUR', locale: 'es-ES', postalHint: '5자리 숫자 (예: 28001)', phoneHint: '91 123 45 67' }
};

// 현재 선택된 국가 규칙
let currentCountryRule = COUNTRY_RULES.KR;

// UUID v4 생성 함수
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 결제 모드 플래그 설정 (서버 MOCK_GATEWAY와 동기화 필요)
// MOCK 모드: 모의 결제 (테스트용)
// TOSS 모드: 실제 토스페이먼츠 결제
// 기본값은 MOCK (운영 전환 시 HTML에서 직접 'TOSS'로 설정)
window.__PAYMENT_MODE__ = window.__PAYMENT_MODE__ || 'MOCK';

document.addEventListener('DOMContentLoaded', function() {
  console.log('💳 체크아웃 페이지 로드됨');
  console.log(`🔧 결제 모드: ${window.__PAYMENT_MODE__}`);
  
  // 미니 카트가 로드될 때까지 대기
  if (window.miniCart) {
    initializeCheckoutPage();
  } else {
    // 미니 카트가 아직 로드되지 않았다면 대기
    const checkMiniCart = setInterval(() => {
      if (window.miniCart) {
        clearInterval(checkMiniCart);
        initializeCheckoutPage();
      }
    }, 100);
  }
});

async function initializeCheckoutPage() {
  console.log('💳 체크아웃 페이지 초기화 시작');
  console.log('🔍 window.miniCart:', window.miniCart);
  
  // miniCart가 있는지 확인
  if (!window.miniCart) {
    console.error('❌ miniCart가 없습니다!');
    alert('장바구니를 불러올 수 없습니다.');
    window.location.href = 'cart.html';
    return;
  }
  
  // 로그인 상태 다시 확인
  console.log('🔍 현재 로그인 상태 (초기):', window.miniCart.isLoggedIn);
  await window.miniCart.checkLoginStatus();
  console.log('🔍 현재 로그인 상태 (확인 후):', window.miniCart.isLoggedIn);
  
  // 로그인 상태 확인 후 장바구니 재로드
  if (window.miniCart.isLoggedIn) {
    console.log('🔄 장바구니 다시 로드...');
    await window.miniCart.loadCartFromServer();
  }
  
  // 미니카트에서 장바구니 아이템 가져오기
  const cartItems = window.miniCart.getCartItems();
  console.log('📦 miniCart에서 장바구니 가져옴:', cartItems);
  console.log('📦 장바구니 길이:', cartItems.length);
  console.log('📦 장바구니 아이템 구조 확인:', cartItems.map(item => ({
    product_id: item.product_id,
    id: item.id,
    quantity: item.quantity,
    keys: Object.keys(item)
  })));
  
  // 장바구니가 비어있는지 확인
  if (!cartItems || cartItems.length === 0) {
    console.warn('⚠️ 장바구니가 비어있음');
    alert('장바구니가 비어있습니다. 상품을 추가한 후 다시 시도해주세요.');
    window.location.href = 'catalog.html';
    return;
  }
  
  // 주문 아이템 렌더링
  renderOrderItems(cartItems);
  
  // 이벤트 리스너 등록
  bindEventListeners(cartItems);
  
  // 사용자 정보 자동 입력
  await fillUserInfo();
  
  // 현재 선택된 국가에 따라 규칙 설정
  const countrySelect = document.getElementById('country');
  if (countrySelect) {
    const selectedCountry = countrySelect.value || 'KR';
    currentCountryRule = COUNTRY_RULES[selectedCountry] || COUNTRY_RULES.KR;
    
    // 초기 placeholder 및 title 설정
    const postalCodeInput = document.getElementById('postalCode');
    if (postalCodeInput) {
      postalCodeInput.placeholder = currentCountryRule.postalHint;
      postalCodeInput.title = currentCountryRule.postalHint;
    }
    
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
      phoneInput.placeholder = currentCountryRule.phoneHint;
      phoneInput.title = currentCountryRule.phoneHint;
    }
  }
  
  // 폼 유효성 검사 설정
  setupFormValidation();
  
  // 국가 변경 이벤트 리스너 등록
  setupCountryChangeListener();
  
  console.log('✅ 체크아웃 페이지 초기화 완료');
}

// 국가 변경 이벤트 리스너 설정
function setupCountryChangeListener() {
  const countrySelect = document.getElementById('country');
  if (countrySelect) {
    countrySelect.addEventListener('change', function() {
      const selectedCountry = countrySelect.value;
      currentCountryRule = COUNTRY_RULES[selectedCountry] || COUNTRY_RULES.KR;
      
      console.log('🌍 국가 변경:', selectedCountry, currentCountryRule);
      
      // postalCode placeholder 및 title 업데이트
      const postalCodeInput = document.getElementById('postalCode');
      if (postalCodeInput) {
        postalCodeInput.placeholder = currentCountryRule.postalHint;
        postalCodeInput.title = currentCountryRule.postalHint;
        // 기존 값 초기화
        postalCodeInput.value = '';
      }
      
      // phone placeholder 및 title 업데이트
      const phoneInput = document.getElementById('phone');
      if (phoneInput) {
        phoneInput.placeholder = currentCountryRule.phoneHint;
        phoneInput.title = currentCountryRule.phoneHint;
        // 기존 값 초기화
        phoneInput.value = '';
      }
      
      // 가격 표시 업데이트
      const cartItems = window.checkoutCartItems || [];
      if (cartItems.length > 0) {
        renderOrderItems(cartItems);
      }
    });
  }
}

async function fillUserInfo() {
  try {
    // 사용자 정보 가져오기
    const response = await fetch('https://prepmood.kr/api/auth/me', {
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.success && data.user) {
        const user = data.user;
        
        // 이름 설정 (first_name + last_name)
        if (user.first_name) {
          document.getElementById('firstName').value = user.first_name;
        }
        if (user.last_name) {
          document.getElementById('lastName').value = user.last_name;
        }
        
        // 이메일 설정
        if (user.email) {
          document.getElementById('email').value = user.email;
        }
        
        // 전화번호 설정
        if (user.phone) {
          document.getElementById('phone').value = user.phone;
        }
        
        console.log('✅ 사용자 정보 자동 입력 완료');
      }
    }
  } catch (error) {
    console.error('❌ 사용자 정보 가져오기 실패:', error);
  }
}

function renderOrderItems(cartItems) {
  console.log('🎨 주문 아이템 렌더링 시작');
  console.log('📦 주문 아이템:', cartItems);
  
  const orderItemsContainer = document.getElementById('order-items');
  const subtotalElement = document.getElementById('subtotal');
  const totalElement = document.getElementById('total');
  
  // 총 가격 계산
  const totalPrice = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  // 소계 업데이트
  if (subtotalElement) {
    subtotalElement.textContent = formatPrice(totalPrice);
  }
  
  // 총계 업데이트 (배송비 무료)
  if (totalElement) {
    totalElement.textContent = formatPrice(totalPrice);
  }
  
  // 주문 아이템 렌더링
  if (orderItemsContainer) {
    orderItemsContainer.innerHTML = cartItems.map(item => `
      <div class="order-item">
        <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" class="order-item-image" onerror="this.src='image/default.jpg'">
        <div class="order-item-info">
          <div class="order-item-name">${escapeHtml(item.name)}</div>
          <div class="order-item-details">색상: ${escapeHtml(item.color)} | 수량: ${escapeHtml(item.quantity)}</div>
        </div>
        <div class="order-item-price">${formatPrice(item.price * item.quantity)}</div>
      </div>
    `).join('');
  }
  
  console.log('✅ 주문 아이템 렌더링 완료');
}

function bindEventListeners(cartItems) {
  // 전역 변수로 cartItems 저장
  window.checkoutCartItems = cartItems;
  
  // 주문 완료 버튼
  const completeOrderBtn = document.getElementById('complete-order-btn');
  if (completeOrderBtn) {
    completeOrderBtn.addEventListener('click', handleCompleteOrder);
  }
  
  // 카드 번호 포맷팅
  const cardNumberInput = document.getElementById('cardNumber');
  if (cardNumberInput) {
    cardNumberInput.addEventListener('input', formatCardNumber);
  }
  
  // 만료일 포맷팅
  const expiryDateInput = document.getElementById('expiryDate');
  if (expiryDateInput) {
    expiryDateInput.addEventListener('input', formatExpiryDate);
  }
  
  // CVV 포맷팅
  const cvvInput = document.getElementById('cvv');
  if (cvvInput) {
    cvvInput.addEventListener('input', formatCVV);
  }
}

function setupFormValidation() {
  const forms = document.querySelectorAll('.checkout-form');
  forms.forEach(form => {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
    });
  });
}

function formatCardNumber(e) {
  let value = e.target.value.replace(/\s/g, '').replace(/[^0-9]/gi, '');
  let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
  if (formattedValue.length > 19) {
    formattedValue = formattedValue.substr(0, 19);
  }
  e.target.value = formattedValue;
}

function formatExpiryDate(e) {
  let value = e.target.value.replace(/\D/g, '');
  if (value.length >= 2) {
    value = value.substring(0, 2) + '/' + value.substring(2, 4);
  }
  e.target.value = value;
}

function formatCVV(e) {
  let value = e.target.value.replace(/\D/g, '');
  if (value.length > 3) {
    value = value.substring(0, 3);
  }
  e.target.value = value;
}

function handleCompleteOrder() {
  console.log('💳 주문 완료 처리 시작');
  
  // 중복 클릭 방지
  const completeOrderBtn = document.getElementById('complete-order-btn');
  if (completeOrderBtn && completeOrderBtn.disabled) {
    console.warn('⚠️ 이미 처리 중입니다. 중복 클릭 무시');
    return;
  }
  
  // 폼 유효성 검사
  if (!validateForms()) {
    return;
  }
  
  // 주문 데이터 수집
  const orderData = collectOrderData();
  
  console.log('📋 주문 데이터:', orderData);
  
  // 실제 결제 API 호출 (현재는 시뮬레이션)
  processPayment(orderData);
}

function validateForms() {
  const requiredFields = [
    'firstName', 'lastName', 'email', 'phone', 'address', 'city', 'postalCode', 'country',
    'cardNumber', 'expiryDate', 'cvv', 'cardName'
  ];
  
  let isValid = true;
  const errors = {};
  
  // 필수 필드 검증
  requiredFields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (!field || !field.value.trim()) {
      isValid = false;
      field.style.borderColor = '#e74c3c';
    } else {
      field.style.borderColor = '#ddd';
    }
  });
  
  // 이메일 형식 검사
  const email = document.getElementById('email');
  if (email && email.value && !isValidEmail(email.value)) {
    isValid = false;
    email.style.borderColor = '#e74c3c';
    errors.email = '유효한 이메일 주소를 입력해주세요';
  }
  
  // 국가별 postalCode 검증
  const postalCode = document.getElementById('postalCode');
  if (postalCode && postalCode.value && !currentCountryRule.postalRe.test(postalCode.value)) {
    isValid = false;
    postalCode.style.borderColor = '#e74c3c';
    errors.postalCode = `우편번호 형식이 올바르지 않습니다 (예: ${currentCountryRule.postalHint})`;
  }
  
  // 국가별 phone 검증
  const phone = document.getElementById('phone');
  if (phone && phone.value && !currentCountryRule.phoneRe.test(phone.value)) {
    isValid = false;
    phone.style.borderColor = '#e74c3c';
    errors.phone = `전화번호 형식이 올바르지 않습니다 (예: ${currentCountryRule.phoneHint})`;
  }
  
  // 주소 길이 검증 (10-200자)
  const address = document.getElementById('address');
  if (address && address.value) {
    const addressLength = address.value.trim().length;
    if (addressLength < 10 || addressLength > 200) {
      isValid = false;
      address.style.borderColor = '#e74c3c';
      errors.address = `주소는 10자 이상 200자 이하여야 합니다 (현재: ${addressLength}자)`;
    }
  }
  
  if (!isValid) {
    const errorMessages = Object.values(errors);
    if (errorMessages.length > 0) {
      alert('입력 오류:\n' + errorMessages.join('\n'));
    } else {
      alert('모든 필수 항목을 올바르게 입력해주세요.');
    }
  }
  
  return isValid;
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function collectOrderData() {
  const cartItems = window.checkoutCartItems || [];
  const totalPrice = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  return {
    items: cartItems,
    shipping: {
      recipient_first_name: document.getElementById('firstName').value,
      recipient_last_name: document.getElementById('lastName').value,
      email: document.getElementById('email').value,
      phone: document.getElementById('phone').value,
      address: document.getElementById('address').value,
      city: document.getElementById('city').value,
      postal_code: document.getElementById('postalCode').value,
      country: document.getElementById('country').value,
      method: 'standard',
      cost: 0,
      note: ''
    },
    payment: {
      cardNumber: document.getElementById('cardNumber').value,
      expiryDate: document.getElementById('expiryDate').value,
      cvv: document.getElementById('cvv').value,
      cardName: document.getElementById('cardName').value
    },
    total: totalPrice,
    orderDate: new Date().toISOString()
  };
}

async function processPayment(orderData) {
  // 주문 중복 전송 방지를 위해 버튼 비활성화 + Idempotency 키 생성
  const completeOrderBtn = document.getElementById('complete-order-btn');
  if (completeOrderBtn) {
    completeOrderBtn.disabled = true;
    completeOrderBtn.textContent = '처리 중...';
  }
  
  const idemKey = uuidv4();
  console.log('🔑 Idempotency Key 생성:', idemKey);
  
    try {
      console.log('💳 주문 생성 API 호출 중...');
      
      // product_id 변환 및 검증
      const items = orderData.items.map((item, index) => {
        // product_id 우선순위: product_id > id
        const productId = item.product_id || item.id;
        const parsedProductId = parseInt(productId, 10);
        const parsedQuantity = parseInt(item.quantity, 10);
        
        if (isNaN(parsedProductId) || parsedProductId <= 0) {
          console.error(`❌ 아이템 ${index} product_id 변환 실패:`, {
            original: productId,
            item: item
          });
        }
        
        if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
          console.error(`❌ 아이템 ${index} quantity 변환 실패:`, {
            original: item.quantity,
            item: item
          });
        }
        
        return {
          product_id: parsedProductId,
          quantity: parsedQuantity
        };
      }).filter(item => !isNaN(item.product_id) && item.product_id > 0 && !isNaN(item.quantity) && item.quantity > 0);
      
      if (items.length === 0) {
        throw new Error('유효한 상품 정보가 없습니다. 장바구니를 확인해주세요.');
      }
      
      const requestPayload = {
        items: items,
        shipping: orderData.shipping
      };
      
      console.log('📤 전송할 데이터:', {
        items: requestPayload.items,
        shippingKeys: Object.keys(requestPayload.shipping),
        addressLength: requestPayload.shipping.address?.length || 0
      });
      
      // 주문 생성 API 호출 (Idempotency 키 포함)
      const response = await fetch('https://prepmood.kr/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idemKey
        },
        credentials: 'include',
        body: JSON.stringify(requestPayload)
      });
    
    if (!response.ok) {
      let errorData;
      const contentType = response.headers.get('content-type');
      
      try {
        if (contentType && contentType.includes('application/json')) {
          errorData = await response.json();
        } else {
          const errorText = await response.text();
          errorData = { message: errorText };
        }
      } catch (e) {
        errorData = { message: '알 수 없는 오류가 발생했습니다.' };
      }

      console.error('❌ 서버 응답 에러:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });

      // 상세 에러 메시지 구성
      let errorMessage = `주문 생성 실패 (${response.status})`;
      
      if (errorData.code === 'VALIDATION_ERROR' && errorData.details) {
        // 검증 오류인 경우 필드별 에러 표시
        const fieldErrors = Object.entries(errorData.details)
          .map(([field, msg]) => `${field}: ${msg}`)
          .join('\n');
        errorMessage = `입력 오류:\n${fieldErrors}`;
      } else if (errorData.details && typeof errorData.details === 'object') {
        // details 객체의 message 사용
        const detailsMsg = errorData.details.message || JSON.stringify(errorData.details);
        errorMessage = detailsMsg;
      } else if (errorData.message) {
        errorMessage = errorData.message;
      }

      alert(errorMessage);
      throw new Error(errorMessage);
    }
    
    const result = await response.json();
    console.log('✅ 주문 생성 성공:', result);
    
    // 서버 응답에서 통화 정보 추출
    const serverCurrency = result.data?.currency || 'KRW';
    const serverFraction = result.data?.fraction ?? 2;
    const serverEta = result.data?.eta;
    
    // 서버 통화 정보를 세션스토리지에 저장
    const info = {
      currency: serverCurrency,
      fraction: serverFraction,
      eta: serverEta
    };
    sessionStorage.setItem('serverCurrencyInfo', JSON.stringify(info));
    console.log('💾 서버 통화 정보 세션스토리지 저장:', info);
    
    // 서버 통화 정보를 전역 변수로도 저장 (가격 표시용)
    window.serverCurrencyInfo = info;
    
    // 장바구니 비우기
    window.miniCart.clearCart();
    
    // 주문 완료 페이지로 이동 (주문 ID와 ETA 전달)
    const orderId = result.data?.order_number || result.order?.order_id || result.orderId;
    const etaParam = info.eta ? `&eta=${encodeURIComponent(info.eta)}` : '';
    window.location.href = `order-complete.html?orderId=${orderId}${etaParam}`;
    
  } catch (error) {
    console.error('❌ 주문 생성 실패:', error);
    alert('주문 생성에 실패했습니다. 잠시 후 다시 시도해주세요.');
    
    // 오류 시 버튼 복구
    if (completeOrderBtn) {
      completeOrderBtn.disabled = false;
      completeOrderBtn.textContent = '주문 완료';
    }
  }
}

// 서버 응답 기반 가격 포맷팅 (세션스토리지 우선, 전역 변수 fallback, 프런트 규칙 최종 fallback)
function formatPrice(price) {
  // 세션스토리지에서 서버 통화 정보 확인
  const sessionInfo = sessionStorage.getItem('serverCurrencyInfo');
  if (sessionInfo) {
    try {
      const info = JSON.parse(sessionInfo);
      return new Intl.NumberFormat('ko-KR', {
        style: 'currency',
        currency: info.currency,
        minimumFractionDigits: info.fraction,
        maximumFractionDigits: info.fraction
      }).format(price);
    } catch (e) {
      console.warn('세션스토리지 파싱 오류:', e);
    }
  }
  
  // 전역 변수에서 서버 통화 정보 확인
  if (window.serverCurrencyInfo) {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: window.serverCurrencyInfo.currency,
      minimumFractionDigits: window.serverCurrencyInfo.fraction,
      maximumFractionDigits: window.serverCurrencyInfo.fraction
    }).format(price);
  }
  
  // 서버 정보가 없으면 프런트 규칙 사용 (최종 fallback)
  return new Intl.NumberFormat(currentCountryRule.locale, {
    style: 'currency',
    currency: currentCountryRule.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}






