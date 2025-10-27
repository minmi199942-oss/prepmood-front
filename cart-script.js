// 장바구니 페이지 스크립트
document.addEventListener('DOMContentLoaded', function() {
  Logger.log('🛒 장바구니 페이지 로드됨');
  
  // 미니 카트가 로드될 때까지 대기
  if (window.miniCart) {
    initializeCartPage();
  } else {
    // 미니 카트가 아직 로드되지 않았다면 대기
    const checkMiniCart = setInterval(() => {
      if (window.miniCart) {
        clearInterval(checkMiniCart);
        initializeCartPage();
      }
    }, 100);
  }
});

// 장바구니 데이터를 글로벌 변수로 저장
let globalCartItems = [];

async function initializeCartPage() {
  Logger.log('🛒 장바구니 페이지 초기화 시작');
  
  // 장바구니 아이템 렌더링 (내부에서 서버 데이터 로드)
  await renderCartItems();
  
  // 이벤트 리스너 등록
  bindEventListeners();
  
  Logger.log('✅ 장바구니 페이지 초기화 완료');
}

async function renderCartItems() {
  Logger.log('🎨 장바구니 아이템 렌더링 시작');
  
  // 직접 서버에서 장바구니 데이터 로드
  let cartItems = [];
  try {
    const response = await fetch('https://prepmood.kr/api/cart', {
      credentials: 'include'
    });
    const data = await response.json();
    
    if (data.success) {
      cartItems = data.items || [];
      globalCartItems = cartItems; // 글로벌 변수에 저장
      Logger.log('🛒 직접 서버에서 장바구니 로드:', cartItems.length, '개 상품');
    } else {
      Logger.log('❌ 서버에서 장바구니 로드 실패:', data.message);
    }
  } catch (error) {
    Logger.error('❌ 장바구니 로드 오류:', error);
  }
  
  const cartItemsContainer = document.getElementById('cart-items');
  const cartItemCount = document.getElementById('cart-item-count');
  const cartTotal = document.getElementById('cart-total');
  
  Logger.log('📦 장바구니 아이템:', cartItems);
  Logger.log('📦 장바구니 아이템 길이:', cartItems.length);
  
  // 총 아이템 수 업데이트
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  if (cartItemCount) {
    cartItemCount.textContent = totalItems;
  }
  
  // 총 가격 업데이트
  const totalPrice = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  if (cartTotal) {
    cartTotal.textContent = formatPrice(totalPrice);
  }
  
  // 장바구니가 비어있는 경우
  if (cartItems.length === 0) {
    if (cartItemsContainer) {
      cartItemsContainer.innerHTML = `
        <div class="empty-cart">
          <h2>장바구니가 비어있습니다</h2>
          <p>쇼핑을 계속하시려면 아래 버튼을 클릭하세요.</p>
          <a href="catalog.html" class="continue-shopping">쇼핑 계속하기</a>
        </div>
      `;
    }
    return;
  }
  
  // 장바구니 아이템 렌더링
  if (cartItemsContainer) {
    cartItemsContainer.innerHTML = cartItems.map(item => `
      <div class="cart-item" data-item-id="${escapeHtml(item.id)}">
        <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" class="cart-item-image" onerror="this.src='image/default.jpg'">
        <div class="cart-item-info">
          <h3 class="cart-item-name">${escapeHtml(item.name)}</h3>
          <div class="cart-item-price">${formatPrice(item.price)}</div>
          <div class="cart-item-details">
            <div class="cart-item-color">색상: ${escapeHtml(item.color)}</div>
            <div class="cart-item-quantity">수량: ${escapeHtml(item.quantity)}</div>
          </div>
          <div class="cart-item-actions">
            <button class="cart-item-edit" onclick="editCartItem('${escapeHtml(item.item_id)}')">수정</button>
            <button class="cart-item-remove" onclick="removeCartItem('${escapeHtml(item.item_id)}')">제거</button>
          </div>
        </div>
      </div>
    `).join('');
  }
  
  Logger.log('✅ 장바구니 아이템 렌더링 완료');
}

function bindEventListeners() {
  // 체크아웃 버튼
  const checkoutBtn = document.getElementById('checkout-btn');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', handleCheckout);
  }
  
  // 도움말 아이템들
  const helpItems = document.querySelectorAll('.help-item');
  helpItems.forEach(item => {
    item.addEventListener('click', function() {
      // 도움말 토글 기능 (향후 구현)
      Logger.log('도움말 클릭됨:', this.textContent.trim());
    });
  });
}

async function editCartItem(itemId) {
  Logger.log('✏️ 장바구니 아이템 수정:', itemId);
  
  // 현재는 간단한 수량 수정만 지원
  const newQuantity = prompt('수량을 입력하세요:');
  if (newQuantity && !isNaN(newQuantity) && parseInt(newQuantity) > 0) {
    await window.miniCart.updateQuantity(itemId, parseInt(newQuantity));
    // 서버에서 최신 데이터 로드 후 렌더링
    await renderCartItems();
  }
}

async function removeCartItem(itemId) {
  Logger.log('🗑️ 장바구니 아이템 제거:', itemId);
  
  if (confirm('이 상품을 장바구니에서 제거하시겠습니까?')) {
    await window.miniCart.removeFromCart(itemId);
    // 서버에서 최신 데이터 로드 후 렌더링
    await renderCartItems();
  }
}

function handleCheckout() {
  Logger.log('💳 체크아웃 시작');
  
  // 서버에서 로드한 장바구니 데이터 사용
  if (globalCartItems.length === 0) {
    alert('장바구니가 비어있습니다. 상품을 추가한 후 다시 시도해주세요.');
    return;
  }
  
  Logger.log('✅ 장바구니 확인 완료:', globalCartItems.length, '개 상품');
  
  // 체크아웃 페이지로 이동
  window.location.href = 'checkout.html';
}

function formatPrice(price) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price);
}

// 전역 함수로 노출
window.editCartItem = editCartItem;
window.removeCartItem = removeCartItem;
