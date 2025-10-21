// 체크아웃 페이지 스크립트
document.addEventListener('DOMContentLoaded', function() {
  console.log('💳 체크아웃 페이지 로드됨');
  
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

function initializeCheckoutPage() {
  console.log('💳 체크아웃 페이지 초기화 시작');
  
  // 장바구니가 비어있는지 확인
  const cartItems = window.miniCart.getCartItems();
  if (cartItems.length === 0) {
    alert('장바구니가 비어있습니다. 상품을 추가한 후 다시 시도해주세요.');
    window.location.href = 'catalog.html';
    return;
  }
  
  // 주문 아이템 렌더링
  renderOrderItems();
  
  // 이벤트 리스너 등록
  bindEventListeners();
  
  // 폼 유효성 검사 설정
  setupFormValidation();
  
  console.log('✅ 체크아웃 페이지 초기화 완료');
}

function renderOrderItems() {
  console.log('🎨 주문 아이템 렌더링 시작');
  
  const cartItems = window.miniCart.getCartItems();
  const orderItemsContainer = document.getElementById('order-items');
  const subtotalElement = document.getElementById('subtotal');
  const totalElement = document.getElementById('total');
  
  console.log('📦 주문 아이템:', cartItems);
  
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

function bindEventListeners() {
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
  }
  
  if (!isValid) {
    alert('모든 필수 항목을 올바르게 입력해주세요.');
  }
  
  return isValid;
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function collectOrderData() {
  const cartItems = window.miniCart.getCartItems();
  const totalPrice = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  return {
    items: cartItems,
    shipping: {
      firstName: document.getElementById('firstName').value,
      lastName: document.getElementById('lastName').value,
      email: document.getElementById('email').value,
      phone: document.getElementById('phone').value,
      address: document.getElementById('address').value,
      city: document.getElementById('city').value,
      postalCode: document.getElementById('postalCode').value,
      country: document.getElementById('country').value
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

function processPayment(orderData) {
  // 로딩 상태 표시
  const completeOrderBtn = document.getElementById('complete-order-btn');
  if (completeOrderBtn) {
    completeOrderBtn.disabled = true;
    completeOrderBtn.textContent = '처리 중...';
  }
  
  // 실제 결제 API 호출 시뮬레이션
  setTimeout(() => {
    console.log('✅ 결제 처리 완료');
    
    // 장바구니 비우기
    window.miniCart.clearCart();
    
    // 주문 완료 페이지로 이동
    window.location.href = 'order-complete.html';
  }, 2000);
}

function formatPrice(price) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price);
}






