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

const API_BASE = (window.API_BASE)
  ? window.API_BASE
  : ((window.location && window.location.origin)
      ? window.location.origin.replace(/\/$/, '') + '/api'
      : '/api');

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
  
  // 로그인 상태 다시 확인 (비회원 주문 지원)
  console.log('🔍 현재 로그인 상태 (초기):', window.miniCart.isLoggedIn);
  await window.miniCart.checkLoginStatus();
  console.log('🔍 현재 로그인 상태 (확인 후):', window.miniCart.isLoggedIn);
  
  // ⚠️ 로그인 여부와 관계없이 장바구니 로드 (회원: 서버, 비회원: localStorage)
  console.log('🔄 장바구니 다시 로드...');
  await window.miniCart.loadCartFromServer();
  
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
  
  // 장바구니가 비어있는지 확인 (개발 환경에서는 빈 장바구니로 페이지 표시 허용)
  const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (!cartItems || cartItems.length === 0) {
    if (!isDev) {
      console.warn('⚠️ 장바구니가 비어있음');
      alert('장바구니가 비어있습니다. 상품을 추가한 후 다시 시도해주세요.');
      window.location.href = 'catalog.html';
      return;
    }
    console.warn('⚠️ [개발] 장바구니 비어있음 - 체크아웃 페이지 표시 허용');
  }

  // 주문 아이템 렌더링
  renderOrderItems(cartItems || []);
  
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
  
  // 한국일 때 전화번호 자동 하이픈 적용 (초기화 마지막에 한 번 더 적용)
  syncPhoneAutoFormat();
  
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
        // 한국 전화번호 자동 하이픈 포맷팅
        if (selectedCountry === 'KR') {
          setupPhoneAutoFormat(phoneInput);
        } else {
          // 다른 국가일 경우 이벤트 리스너 제거
          phoneInput.removeEventListener('input', formatKoreanPhone);
        }
      }
      
      // 가격 표시 업데이트
      const cartItems = window.checkoutCartItems || [];
      if (cartItems.length > 0) {
        renderOrderItems(cartItems);
      }
      // 주소 찾기 버튼: 한국일 때만 표시
      updateAddressSearchButtonVisibility();
      // 전화번호 자동 하이픈: 한국일 때만
      syncPhoneAutoFormat();
    });
  }
  updateAddressSearchButtonVisibility();
}

/** 현재 국가에 맞춰 전화번호 자동 하이픈 포맷 적용/해제 */
function syncPhoneAutoFormat() {
  const countrySelect = document.getElementById('country');
  const phoneInput = document.getElementById('phone');
  if (!countrySelect || !phoneInput) return;
  var country = (countrySelect.value || '').trim();
  // 국가 미선택 시 기본 한국으로 포맷 적용
  if (country === 'KR' || country === '') {
    setupPhoneAutoFormat(phoneInput);
  } else {
    phoneInput.removeEventListener('input', formatKoreanPhone);
  }
}

/** 국가가 한국(KR)일 때만 주소 찾기 버튼 표시 */
function updateAddressSearchButtonVisibility() {
  const wrap = document.getElementById('checkout-address-btn-wrap');
  const countrySelect = document.getElementById('country');
  if (!wrap || !countrySelect) return;
  wrap.style.display = (countrySelect.value === 'KR') ? '' : 'none';
}

/** 카카오 우편번호 API로 주소 검색 후 입력란에 반영 */
function handleAddressSearch() {
  const countrySelect = document.getElementById('country');
  if (countrySelect && countrySelect.value !== 'KR') {
    alert('한국 주소만 검색할 수 있습니다. 국가를 대한민국으로 선택해 주세요.');
    return;
  }
  if (typeof kakao === 'undefined' || !kakao.Postcode) {
    alert('주소 검색 서비스를 불러올 수 없습니다. 페이지를 새로고침 후 다시 시도해 주세요.');
    return;
  }
  new kakao.Postcode({
    oncomplete: function (data) {
      var addr = data.roadAddress || data.jibunAddress || '';
      if (data.buildingName) {
        addr += (addr ? ' ' : '') + data.buildingName;
      }
      var postalEl = document.getElementById('postalCode');
      var addressEl = document.getElementById('address');
      var cityEl = document.getElementById('city');
      if (postalEl) postalEl.value = data.zonecode || '';
      if (addressEl) addressEl.value = addr.trim();
      if (cityEl && (data.sido || data.sigungu)) {
        cityEl.value = [data.sido, data.sigungu].filter(Boolean).join(' ');
      }
      clearCheckoutError('checkout-addressError');
      clearCheckoutError('checkout-postalCodeError');
      var detailEl = document.getElementById('addressDetail');
      if (detailEl) detailEl.focus();
      else if (addressEl) addressEl.focus();
    }
  }).open();
}

/** 기본주소 + 상세주소를 합쳐 서버에 보낼 주소 문자열 반환 */
function getFullAddress() {
  var addr = document.getElementById('address');
  var detail = document.getElementById('addressDetail');
  var base = (addr && addr.value) ? addr.value.trim() : '';
  var extra = (detail && detail.value) ? detail.value.trim() : '';
  if (!extra) return base;
  return base ? base + ' ' + extra : extra;
}

async function fillUserInfo() {
  window.__checkout_is_logged_in__ = false;
  try {
    const response = await fetch(`${API_BASE}/auth/me`, {
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.success && data.user) {
        const user = data.user;
        
        if (user.name) {
          document.getElementById('name').value = user.name;
        }
        if (user.email) {
          const emailEl = document.getElementById('email');
          emailEl.value = user.email;
          emailEl.setAttribute('readonly', 'readonly');
          emailEl.classList.add('input-readonly');
        }
        if (user.phone) {
          document.getElementById('phone').value = user.phone;
        }
        var emailBtnWrap = document.getElementById('checkout-email-btn-wrap');
        if (emailBtnWrap) emailBtnWrap.style.display = 'none';
        const verifyBlock = document.getElementById('checkout-email-verify-block');
        if (verifyBlock) verifyBlock.style.display = 'none';
        window.__checkout_is_logged_in__ = true;
        console.log('✅ 사용자 정보 자동 입력 완료 (회원, 이메일 읽기 전용)');
      } else {
        window.__checkout_is_logged_in__ = false;
      }
    } else {
      window.__checkout_is_logged_in__ = false;
    }
  } catch (error) {
    console.error('❌ 사용자 정보 가져오기 실패:', error);
    window.__checkout_is_logged_in__ = false;
  }
  var emailBtnWrap = document.getElementById('checkout-email-btn-wrap');
  if (emailBtnWrap) emailBtnWrap.style.display = (window.__checkout_is_logged_in__ === true) ? 'none' : '';
  updateCheckoutCTAState();
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
    orderItemsContainer.innerHTML = cartItems.map(item => {
      // ⚠️ 이미지 경로 처리: /uploads/products/로 시작하면 그대로 사용, 아니면 /image/ 추가
      let imageSrc = item.image || '';
      if (imageSrc.startsWith('/uploads/')) {
        imageSrc = imageSrc;
      } else if (imageSrc.startsWith('/image/')) {
        imageSrc = imageSrc;
      } else if (imageSrc) {
        imageSrc = imageSrc.startsWith('image/') ? '/' + imageSrc : '/image/' + imageSrc;
      } else {
        imageSrc = '/image/default.jpg';
      }
      
      const detailText = [item.color, item.quantity + '개'].filter(Boolean).map(function (v) { return escapeHtml(String(v)); }).join(' · ');
      return `
      <div class="order-item">
        <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(item.name)}" class="order-item-image" onerror="this.src='/image/default.jpg'">
        <div class="order-item-info">
          <div class="order-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
          <div class="order-item-details">${detailText}</div>
        </div>
        <div class="order-item-price">${formatPrice(item.price * item.quantity)}</div>
      </div>
    `;
    }).join('');
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
  
  // 이미 가입된 이메일 모달: 로그인 / 다른 이메일
  const modalLoginBtn = document.getElementById('checkout-modal-login-btn');
  if (modalLoginBtn) {
    modalLoginBtn.addEventListener('click', function() {
      window.location.href = '/login.html?returnTo=' + encodeURIComponent('/checkout.html');
    });
  }
  const modalOtherBtn = document.getElementById('checkout-modal-other-email-btn');
  if (modalOtherBtn) {
    modalOtherBtn.addEventListener('click', function() {
      const modal = document.getElementById('checkout-already-registered-modal');
      if (modal) modal.style.display = 'none';
      resetEmailVerificationUI();
      const emailEl = document.getElementById('email');
      if (emailEl) emailEl.focus();
    });
  }
  
  // 이메일 변경 시 인증 UI 초기화
  const emailEl = document.getElementById('email');
  if (emailEl) {
    emailEl.addEventListener('input', resetEmailVerificationUI);
    emailEl.addEventListener('change', resetEmailVerificationUI);
  }
  // 배송 폼 입력 시 폼 오류 메시지 및 해당 필드 error 클래스 제거
  const shippingForm = document.getElementById('shipping-form');
  if (shippingForm) {
    shippingForm.addEventListener('input', function (e) {
      if (e.target && (e.target.id === 'verify-code' || e.target.id === 'email')) return;
      clearCheckoutError('checkout-formError');
      if (e.target && e.target.classList && e.target.classList.contains('error')) e.target.classList.remove('error');
    });
    shippingForm.addEventListener('change', function (e) {
      clearCheckoutError('checkout-formError');
      if (e.target && e.target.classList && e.target.classList.contains('error')) e.target.classList.remove('error');
    });
  }
  // 입력란 focus 시 해당 필드 오류 메시지 즉시 숨김 (register.html과 동일)
  ['name', 'email', 'country', 'phone', 'address', 'addressDetail', 'city', 'postalCode'].forEach(function (fieldId) {
    const el = document.getElementById(fieldId);
    if (el) {
      el.addEventListener('focus', function () { clearCheckoutError('checkout-' + fieldId + 'Error'); });
      el.addEventListener('blur', function () { validateFieldOnBlur(fieldId); });
    }
  });
  const verifyCodeEl = document.getElementById('verify-code');
  if (verifyCodeEl) {
    verifyCodeEl.addEventListener('focus', function () { clearCheckoutError('checkout-codeError'); });
    verifyCodeEl.addEventListener('input', function () { clearCheckoutError('checkout-codeError'); if (verifyCodeEl.classList.contains('error')) verifyCodeEl.classList.remove('error'); });
  }
  
  // 코드 보내기 (이메일 우측 버튼)
  const requestVerifyBtn = document.getElementById('checkout-request-verify-btn');
  if (requestVerifyBtn) {
    requestVerifyBtn.addEventListener('click', handleRequestVerify);
  }
  const confirmVerifyBtn = document.getElementById('checkout-confirm-verify-btn');
  if (confirmVerifyBtn) {
    confirmVerifyBtn.addEventListener('click', handleConfirmVerify);
  }
  // 주소 찾기 (카카오 우편번호)
  const addressSearchBtn = document.getElementById('checkout-address-search-btn');
  if (addressSearchBtn) {
    addressSearchBtn.addEventListener('click', handleAddressSearch);
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

async function handleCompleteOrder() {
  console.log('✅ 1단계: 배송 정보 확인');
  
  const completeOrderBtn = document.getElementById('complete-order-btn');
  if (completeOrderBtn && completeOrderBtn.disabled) {
    console.warn('⚠️ 이미 처리 중입니다. 중복 클릭 무시');
    return;
  }
  
  if (!validateShippingForms()) {
    return;
  }
  
  const isLoggedIn = window.__checkout_is_logged_in__ === true;
  const emailEl = document.getElementById('email');
  const email = (emailEl && emailEl.value) ? emailEl.value.trim().toLowerCase() : '';
  
  if (!isLoggedIn && email) {
    try {
      completeOrderBtn.disabled = true;
      completeOrderBtn.textContent = '확인 중...';
      const checkRes = await fetch(`${API_BASE}/auth/check-email?email=${encodeURIComponent(email)}`, { credentials: 'include' });
      const checkData = await checkRes.json();
      if (!checkData.success) {
        showCheckoutError('checkout-emailError', checkData.message || '이메일 확인 중 오류가 발생했습니다.');
        return;
      }
      if (checkData.registered) {
        showAlreadyRegisteredModal();
        return;
      }
      const verified = getCheckoutEmailVerified();
      if (verified !== email) {
        showCheckoutError('checkout-formError', '이메일 인증을 완료해주세요. 아래에서 인증 요청 후 코드를 입력해 주세요.');
        const block = document.getElementById('checkout-email-verify-block');
        if (block) block.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    } finally {
      completeOrderBtn.disabled = false;
      completeOrderBtn.textContent = '확인';
    }
  }
  
  const shippingData = collectShippingData();
  if (!isLoggedIn) {
    shippingData.email_verified = true;
  }
  console.log('📋 배송 데이터:', shippingData);
  
  sessionStorage.setItem('checkoutShippingData', JSON.stringify(shippingData));
  window.location.href = 'checkout-review.html';
}

function getCheckoutEmailVerified() {
  try {
    const raw = sessionStorage.getItem('checkoutEmailVerified');
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj && obj.email && obj.at && (Date.now() - obj.at < 30 * 60 * 1000)) {
      return obj.email.trim().toLowerCase();
    }
    sessionStorage.removeItem('checkoutEmailVerified');
    return null;
  } catch (e) {
    return null;
  }
}

function setCheckoutEmailVerified(email) {
  sessionStorage.setItem('checkoutEmailVerified', JSON.stringify({
    email: (email || '').trim().toLowerCase(),
    at: Date.now()
  }));
}

function clearCheckoutEmailVerified() {
  sessionStorage.removeItem('checkoutEmailVerified');
}

/** 오류 메시지 표시 (register.html과 동일 형식) */
var CHECKOUT_ERROR_INPUT_MAP = {
  'checkout-emailError': 'email', 'checkout-codeError': 'verify-code',
  'checkout-nameError': 'name', 'checkout-countryError': 'country',
  'checkout-phoneError': 'phone', 'checkout-addressError': 'address',
  'checkout-addressDetailError': 'addressDetail',
  'checkout-cityError': 'city', 'checkout-postalCodeError': 'postalCode'
};

function showCheckoutError(elementId, message) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
  const inputId = CHECKOUT_ERROR_INPUT_MAP[elementId];
  if (inputId) {
    const input = document.getElementById(inputId);
    if (input) input.classList.add('error');
  }
}

function clearCheckoutError(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = '';
  el.style.display = 'none';
  const inputId = CHECKOUT_ERROR_INPUT_MAP[elementId];
  if (inputId) {
    const input = document.getElementById(inputId);
    if (input) input.classList.remove('error');
  }
}

function clearAllCheckoutErrors() {
  Object.keys(CHECKOUT_ERROR_INPUT_MAP).forEach(clearCheckoutError);
  clearCheckoutError('checkout-formError');
  document.querySelectorAll('.form-group input.error, .form-group select.error').forEach(function (el) { el.classList.remove('error'); });
}

/** blur 시 해당 필드만 검사해 입력란 밑에 빨간 오류 메시지 표시 */
function validateFieldOnBlur(fieldId) {
  const field = document.getElementById(fieldId);
  const errorEl = document.getElementById('checkout-' + fieldId + 'Error');
  if (!field || !errorEl) return;
  var value = (field.value || '').trim();
  var rule = currentCountryRule;
  var countrySelect = document.getElementById('country');
  if (countrySelect && countrySelect.value) {
    rule = COUNTRY_RULES[countrySelect.value] || COUNTRY_RULES.KR;
  }
  if (fieldId === 'name') {
    if (!value) { showCheckoutError('checkout-nameError', '이름을 입력해주세요.'); return; }
    clearCheckoutError('checkout-nameError');
    return;
  }
  if (fieldId === 'email') {
    if (!value) { showCheckoutError('checkout-emailError', '이메일을 입력해주세요.'); return; }
    if (!isValidEmail(value)) { showCheckoutError('checkout-emailError', '유효한 이메일 주소를 입력해주세요.'); return; }
    clearCheckoutError('checkout-emailError');
    return;
  }
  if (fieldId === 'country') {
    if (!value) { showCheckoutError('checkout-countryError', '국가를 선택해주세요.'); return; }
    clearCheckoutError('checkout-countryError');
    return;
  }
  if (fieldId === 'phone') {
    if (!value) { showCheckoutError('checkout-phoneError', '전화번호를 입력해주세요.'); return; }
    if (!rule.phoneRe.test(value)) { showCheckoutError('checkout-phoneError', '전화번호 형식이 올바르지 않습니다 (예: ' + rule.phoneHint + ')'); return; }
    clearCheckoutError('checkout-phoneError');
    return;
  }
  if (fieldId === 'address' || fieldId === 'addressDetail') {
    var full = getFullAddress();
    if (!full) { showCheckoutError('checkout-addressError', '주소를 입력해주세요.'); return; }
    if (full.length < 10) { showCheckoutError('checkout-addressError', '주소는 10자 이상 200자 이하여야 합니다 (현재: ' + full.length + '자).'); return; }
    if (full.length > 200) { showCheckoutError('checkout-addressDetailError', '전체 주소가 200자를 초과합니다 (현재: ' + full.length + '자).'); return; }
    clearCheckoutError('checkout-addressError');
    clearCheckoutError('checkout-addressDetailError');
    return;
  }
  if (fieldId === 'city') {
    if (!value) { showCheckoutError('checkout-cityError', '도시를 입력해주세요.'); return; }
    clearCheckoutError('checkout-cityError');
    return;
  }
  if (fieldId === 'postalCode') {
    if (!value) { showCheckoutError('checkout-postalCodeError', '우편번호를 입력해주세요.'); return; }
    if (!rule.postalRe.test(value)) { showCheckoutError('checkout-postalCodeError', '우편번호 형식이 올바르지 않습니다 (예: ' + rule.postalHint + ')'); return; }
    clearCheckoutError('checkout-postalCodeError');
  }
}

/** 이메일 변경 시 인증 UI 초기화: 블록 숨김, 코드/버튼/뱃지 리셋, 모달 닫기 */
function resetEmailVerificationUI() {
  clearCheckoutEmailVerified();
  clearCheckoutError('checkout-emailError');
  clearCheckoutError('checkout-codeError');
  const verifyBlock = document.getElementById('checkout-email-verify-block');
  if (verifyBlock) verifyBlock.style.display = 'none';
  const codeInput = document.getElementById('verify-code');
  if (codeInput) codeInput.value = '';
  const confirmBtn = document.getElementById('checkout-confirm-verify-btn');
  if (confirmBtn) confirmBtn.style.display = 'none';
  const badge = document.getElementById('email-verified-badge');
  if (badge) badge.style.display = 'none';
  const requestBtn = document.getElementById('checkout-request-verify-btn');
  if (requestBtn) requestBtn.disabled = false;
  const modal = document.getElementById('checkout-already-registered-modal');
  if (modal) modal.style.display = 'none';
  updateCheckoutCTAState();
}

/** 비회원 + 미가입 이메일 + 미인증 시 확인 버튼 비활성 및 안내 문구 표시 */
function updateCheckoutCTAState() {
  const btn = document.getElementById('complete-order-btn');
  const hint = document.getElementById('checkout-cta-hint');
  if (!btn) return;
  const isLoggedIn = window.__checkout_is_logged_in__ === true;
  const emailEl = document.getElementById('email');
  const email = (emailEl && emailEl.value) ? emailEl.value.trim().toLowerCase() : '';
  const verified = getCheckoutEmailVerified();
  const needVerify = !isLoggedIn && email && verified !== email;
  if (needVerify) {
    btn.disabled = true;
    if (hint) hint.style.display = 'block';
  } else {
    btn.disabled = false;
    if (hint) hint.style.display = 'none';
  }
}

async function handleRequestVerify() {
  const emailEl = document.getElementById('email');
  const email = (emailEl && emailEl.value) ? emailEl.value.trim() : '';
  clearCheckoutError('checkout-emailError');
  if (!email || !isValidEmail(email)) {
    showCheckoutError('checkout-emailError', '유효한 이메일을 입력해주세요.');
    return;
  }
  const btn = document.getElementById('checkout-request-verify-btn');
  if (btn) btn.disabled = true;
  try {
    const checkRes = await fetch(`${API_BASE}/auth/check-email?email=${encodeURIComponent(email)}`, { credentials: 'include' });
    const checkData = await checkRes.json();
    if (checkData.registered) {
      showAlreadyRegisteredModal();
      return;
    }
    const sendRes = await fetch(`${API_BASE}/send-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: email })
    });
    const sendData = await sendRes.json();
    if (sendData.success) {
      const verifyBlock = document.getElementById('checkout-email-verify-block');
      if (verifyBlock) verifyBlock.style.display = 'block';
      document.getElementById('checkout-confirm-verify-btn').style.display = 'inline-block';
      document.getElementById('verify-code').focus();
      alert('인증 코드가 발송되었습니다. 이메일을 확인해주세요.');
    } else {
      showCheckoutError('checkout-emailError', sendData.message || '인증 코드 발송에 실패했습니다.');
    }
  } catch (e) {
    showCheckoutError('checkout-emailError', '요청 중 오류가 발생했습니다.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleConfirmVerify() {
  const emailEl = document.getElementById('email');
  const codeEl = document.getElementById('verify-code');
  const email = (emailEl && emailEl.value) ? emailEl.value.trim() : '';
  const code = (codeEl && codeEl.value) ? codeEl.value.replace(/\D/g, '') : '';
  clearCheckoutError('checkout-codeError');
  if (!email || !isValidEmail(email)) {
    showCheckoutError('checkout-emailError', '이메일을 확인해주세요.');
    return;
  }
  if (code.length !== 6) {
    showCheckoutError('checkout-codeError', '6자리 인증 코드를 입력해주세요.');
    return;
  }
  const btn = document.getElementById('checkout-confirm-verify-btn');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: email, code: code })
    });
    const data = await res.json();
    if (data.success) {
      setCheckoutEmailVerified(email);
      document.getElementById('email-verified-badge').style.display = 'inline-block';
      document.getElementById('checkout-confirm-verify-btn').style.display = 'none';
      updateCheckoutCTAState();
      alert('인증이 완료되었습니다.');
    } else {
      showCheckoutError('checkout-codeError', data.message || '인증 코드가 일치하지 않습니다.');
    }
  } catch (e) {
    showCheckoutError('checkout-codeError', '확인 중 오류가 발생했습니다.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function saveCheckoutSnapshotForLogin(shippingData) {
  sessionStorage.setItem('checkoutShippingData', JSON.stringify(shippingData));
  const draft = {
    data: shippingData,
    expiresAt: Date.now() + 30 * 60 * 1000
  };
  try {
    localStorage.setItem('checkoutShippingDataDraft', JSON.stringify(draft));
  } catch (e) {
    Logger.warn('checkout draft localStorage 저장 실패', e);
  }
}

function showAlreadyRegisteredModal() {
  const modal = document.getElementById('checkout-already-registered-modal');
  if (!modal) return;
  const shippingData = collectShippingData();
  saveCheckoutSnapshotForLogin(shippingData);
  modal.style.display = 'flex';
}

function validateShippingForms() {
  const requiredFields = [
    'name', 'email', 'phone', 'address', 'city', 'postalCode', 'country'
  ];
  let isValid = true;
  const errors = {};
  clearCheckoutError('checkout-formError');
  requiredFields.forEach(function (fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    if (!field.value.trim()) {
      isValid = false;
      field.classList.add('error');
    } else {
      field.classList.remove('error');
    }
  });
  const email = document.getElementById('email');
  if (email && email.value && !isValidEmail(email.value)) {
    isValid = false;
    email.classList.add('error');
    errors.email = '유효한 이메일 주소를 입력해주세요.';
  }
  const postalCode = document.getElementById('postalCode');
  if (postalCode && postalCode.value && !currentCountryRule.postalRe.test(postalCode.value)) {
    isValid = false;
    postalCode.classList.add('error');
    errors.postalCode = '우편번호 형식이 올바르지 않습니다 (예: ' + currentCountryRule.postalHint + ')';
  }
  const phone = document.getElementById('phone');
  if (phone && phone.value && !currentCountryRule.phoneRe.test(phone.value)) {
    isValid = false;
    phone.classList.add('error');
    errors.phone = '전화번호 형식이 올바르지 않습니다 (예: ' + currentCountryRule.phoneHint + ')';
  }
  const fullAddress = getFullAddress();
  if (fullAddress) {
    const addressLength = fullAddress.length;
    if (addressLength < 10 || addressLength > 200) {
      isValid = false;
      const addressEl = document.getElementById('address');
      const detailEl = document.getElementById('addressDetail');
      if (addressEl) addressEl.classList.add('error');
      if (detailEl) detailEl.classList.add('error');
      errors.address = addressLength > 200
        ? '전체 주소가 200자를 초과합니다 (현재: ' + addressLength + '자).'
        : '주소는 10자 이상 200자 이하여야 합니다 (현재: ' + addressLength + '자).';
      if (addressLength > 200) {
        clearCheckoutError('checkout-addressError');
        showCheckoutError('checkout-addressDetailError', errors.address);
      } else {
        clearCheckoutError('checkout-addressDetailError');
        showCheckoutError('checkout-addressError', errors.address);
      }
    }
  } else {
    const addressEl = document.getElementById('address');
    if (addressEl && !addressEl.value.trim()) {
      isValid = false;
      addressEl.classList.add('error');
      errors.address = '주소를 입력해주세요.';
    }
  }
  if (!isValid) {
    const errorMessages = Object.values(errors);
    const formErrorEl = document.getElementById('checkout-formError');
    if (formErrorEl) {
      formErrorEl.textContent = errorMessages.length > 0 ? errorMessages.join(' ') : '모든 필수 항목을 올바르게 입력해주세요.';
      formErrorEl.style.display = 'block';
      formErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
  return isValid;
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function collectShippingData() {
  const cartItems = window.checkoutCartItems || [];
  const totalPrice = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  return {
    items: cartItems,
    shipping: {
      recipient_name: document.getElementById('name').value.trim(),
      email: document.getElementById('email').value,
      phone: document.getElementById('phone').value,
      address: getFullAddress(),
      city: document.getElementById('city').value,
      postal_code: document.getElementById('postalCode').value,
      country: document.getElementById('country').value,
      method: 'standard',
      cost: 0,
      note: ''
    },
    total: totalPrice,
    orderDate: new Date().toISOString()
  };
}

function collectOrderData() {
  const cartItems = window.checkoutCartItems || [];
  const totalPrice = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  return {
    items: cartItems,
    shipping: {
      recipient_name: document.getElementById('name').value.trim(),
      email: document.getElementById('email').value,
      phone: document.getElementById('phone').value,
      address: getFullAddress(),
      city: document.getElementById('city').value,
      postal_code: document.getElementById('postalCode').value,
      country: document.getElementById('country').value,
      method: 'standard',
      cost: 0,
      note: ''
    },
    // payment 필드 제거 (현재 MOCK 모드에서 사용 안 함, 향후 토스 위젯으로 대체)
    payment: {},
    total: totalPrice,
    orderDate: new Date().toISOString()
  };
}

function validateForms() {
  const requiredFields = [
    'name', 'email', 'phone', 'address', 'city', 'postalCode', 'country',
    'cardNumber', 'expiryDate', 'cvv', 'cardName'
  ];
  
  let isValid = true;
  const errors = {};
  
  // 필수 필드 검증
  requiredFields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (!field) return; // 필드가 없으면 건너뛰기 (카드 필드 등)
    if (!field.value.trim()) {
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
    errors.email = '유효한 이메일을 입력해주세요.';
    email.style.borderColor = '#e74c3c';
  }
  
  if (!isValid) {
    alert('모든 필수 항목을 입력해주세요.');
  }
  
  return isValid;
}

async function processPayment(orderData) {
  // 주문 중복 전송 방지를 위해 버튼 비활성화 + Idempotency 키 생성
  const completeOrderBtn = document.getElementById('complete-order-btn');
  const originalBtnText = completeOrderBtn?.textContent || '주문 완료';
  
  if (completeOrderBtn) {
    completeOrderBtn.disabled = true;
    completeOrderBtn.textContent = '처리 중...';
  }
  
  const idemKey = uuidv4();
  console.log('🔑 Idempotency Key 생성:', idemKey);
  
  try {
      console.log('💳 주문 생성 API 호출 중...');
      
      // 주문 payload 생성 (SSOT 함수 사용)
      if (!window.createOrderPayload) {
        throw new Error('checkout-utils.js가 로드되지 않았습니다.');
      }
      
      const requestPayload = window.createOrderPayload(orderData.items, orderData.shipping);
      
      console.log('📤 전송할 데이터:', {
        items: requestPayload.items,
        shippingKeys: Object.keys(requestPayload.shipping),
        addressLength: requestPayload.shipping.address?.length || 0
      });
      
      // 주문 생성 API 호출 (Idempotency 키 + CSRF 토큰 포함)
      const response = await window.secureFetch(`${API_BASE}/orders`, {
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

      // 409 에러는 중복 요청 → 자동으로 주문 내역 페이지로 이동
      if (response.status === 409) {
        console.log('⚠️ 중복 주문 감지 → 주문 내역 페이지로 이동');
        // 리다이렉트 전 버튼 복구 (사용자가 뒤로가기 시 대비)
        if (completeOrderBtn) {
          completeOrderBtn.disabled = false;
          completeOrderBtn.textContent = originalBtnText;
        }
        window.location.href = 'my-orders.html?notice=duplicated';
        return;
      }

      // 기타 에러 메시지 구성
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

      // 상태코드별 사용자 친화적 메시지
      if (response.status === 400) {
        errorMessage = '입력값을 다시 확인해주세요.';
      } else if (response.status === 401 || response.status === 403) {
        // 401/403은 인증/권한 문제일 수 있으나, 비회원 주문도 가능하므로 일반적인 에러 메시지 사용
        errorMessage = '주문 생성 권한이 없거나 세션이 만료되었습니다.';
      } else if (response.status >= 500) {
        errorMessage = '일시적 오류입니다. 잠시 후 다시 시도해주세요.';
      }

      if (window.showGlobalErrorBanner) {
        window.showGlobalErrorBanner({
          title: '주문 생성 실패',
          message: errorMessage,
          onRetry: () => {
            const btn = document.getElementById('complete-order-btn');
            if (btn) {
              btn.click();
            }
          }
        });
      } else {
      alert(errorMessage);
      }
      
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
    
    // 장바구니 동기화 (서버 상태 기반)
    if (window.miniCart && typeof window.miniCart.sync === 'function') {
      await window.miniCart.sync();
    }
    
    // 주문 완료 페이지로 이동 (주문 ID와 ETA 전달)
    const orderId = result.data?.order_number || result.order?.order_id || result.orderId;
    const etaParam = info.eta ? `&eta=${encodeURIComponent(info.eta)}` : '';
    // 성공 시 리다이렉트되므로 버튼 복구 불필요
    window.location.href = `order-complete.html?orderId=${orderId}${etaParam}`;
    
  } catch (error) {
    console.error('❌ 주문 생성 실패:', error);
    
    // 사용자 친화적 에러 메시지
    let errorMessage = '주문 생성에 실패했습니다. 잠시 후 다시 시도해주세요.';
    if (error.message && !error.message.includes('주문 생성에 실패했습니다')) {
      errorMessage = error.message;
    }
    if (window.showGlobalErrorBanner) {
      window.showGlobalErrorBanner({
        title: '주문 생성 실패',
        message: errorMessage,
        onRetry: () => {
          const btn = document.getElementById('complete-order-btn');
          if (btn) {
            btn.click();
          }
        }
      });
    } else {
      alert(errorMessage);
    }
  } finally {
    // 에러 발생 시 항상 버튼 복구 (리다이렉트되지 않은 경우에만)
    // window.location.href로 이동하면 이 코드는 실행되지 않지만, 안전을 위해 추가
    if (completeOrderBtn && completeOrderBtn.disabled) {
      completeOrderBtn.disabled = false;
      completeOrderBtn.textContent = originalBtnText;
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

// 한국 전화번호 자동 하이픈 포맷팅 함수
function formatKoreanPhone(event) {
  const input = event.target;
  let value = input.value.replace(/[^\d]/g, ''); // 숫자만 추출
  
  // 한국 전화번호 형식에 맞춰 하이픈 추가
  if (value.length <= 3) {
    value = value;
  } else if (value.length <= 7) {
    // 010-1234 또는 02-1234
    value = value.slice(0, 3) + '-' + value.slice(3);
  } else if (value.length <= 10) {
    // 010-1234-5678 또는 02-1234-5678
    if (value.startsWith('02')) {
      // 서울 지역번호 (02)
      value = value.slice(0, 2) + '-' + value.slice(2, 6) + '-' + value.slice(6);
    } else {
      // 일반 지역번호 (031, 032 등) 또는 휴대폰 (010, 011 등)
      value = value.slice(0, 3) + '-' + value.slice(3, 7) + '-' + value.slice(7);
    }
  } else {
    // 11자리 이상 (010-1234-5678)
    if (value.startsWith('02')) {
      // 서울 지역번호는 10자리까지만
      value = value.slice(0, 2) + '-' + value.slice(2, 6) + '-' + value.slice(6, 10);
    } else {
      // 일반 지역번호 또는 휴대폰
      value = value.slice(0, 3) + '-' + value.slice(3, 7) + '-' + value.slice(7, 11);
    }
  }
  
  input.value = value;
}

// 전화번호 자동 포맷팅 설정
function setupPhoneAutoFormat(phoneInput) {
  // 기존 이벤트 리스너 제거 (중복 방지)
  phoneInput.removeEventListener('input', formatKoreanPhone);
  // 새로운 이벤트 리스너 추가
  phoneInput.addEventListener('input', formatKoreanPhone);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}






