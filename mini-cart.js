// mini-cart.js - 미니 카트 기능

class MiniCart {
  constructor() {
    this.cartItems = this.loadCartItems();
    this.init();
  }

  init() {
    // 헤더가 로드될 때까지 대기
    let attempts = 0;
    const waitForHeader = setInterval(() => {
      const cartToggle = document.getElementById('cart-toggle');
      attempts++;
      
      if (cartToggle) {
        clearInterval(waitForHeader);
        this.bindEvents();
        this.updateCartDisplay();
        this.renderMiniCart();
        console.log('✅ 미니 카트 초기화 완료 (시도 횟수:', attempts, ')');
      } else if (attempts > 50) {
        // 5초 후에도 안 되면 포기
        clearInterval(waitForHeader);
        console.error('❌ 장바구니 버튼을 찾을 수 없습니다!');
      }
    }, 100);
  }

  bindEvents() {
    // 장바구니 토글 버튼
    const cartToggle = document.getElementById('cart-toggle');
    const miniCart = document.getElementById('mini-cart');
    const miniCartClose = document.getElementById('mini-cart-close');
    const overlay = document.getElementById('mini-cart-overlay');

    console.log('🔗 이벤트 바인딩 중...', {
      cartToggle: !!cartToggle,
      miniCart: !!miniCart,
      miniCartClose: !!miniCartClose,
      overlay: !!overlay
    });

    if (cartToggle) {
      cartToggle.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('🛒 장바구니 버튼 클릭됨!');
        this.toggleMiniCart();
      });
      console.log('✅ 장바구니 버튼 이벤트 리스너 추가 완료');
    } else {
      console.error('❌ 장바구니 버튼을 찾을 수 없습니다!');
    }

    if (miniCartClose) {
      miniCartClose.addEventListener('click', () => {
        this.closeMiniCart();
      });
    }

    if (overlay) {
      overlay.addEventListener('click', () => {
        this.closeMiniCart();
      });
    }

    // 장바구니로 이동 버튼
    const viewCartBtn = document.getElementById('view-cart-btn');
    if (viewCartBtn) {
      viewCartBtn.addEventListener('click', () => {
        window.location.href = 'cart.html';
      });
    }

    // 체크아웃 버튼
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', () => {
        alert('체크아웃 기능은 준비 중입니다.');
      });
    }
  }

  toggleMiniCart() {
    const miniCart = document.getElementById('mini-cart');
    const overlay = document.getElementById('mini-cart-overlay');
    
    if (miniCart && overlay) {
      const isActive = miniCart.classList.contains('active');
      
      if (isActive) {
        this.closeMiniCart();
      } else {
        this.openMiniCart();
      }
    }
  }

  openMiniCart() {
    const miniCart = document.getElementById('mini-cart');
    const overlay = document.getElementById('mini-cart-overlay');
    
    if (miniCart && overlay) {
      miniCart.classList.add('active');
      overlay.classList.add('active');
      
      // 스크롤 방지 (프라다 스타일)
      document.body.style.overflow = 'hidden';
      
      console.log('✅ 미니 카트 열림 + 스크롤 방지');
    }
  }

  closeMiniCart() {
    const miniCart = document.getElementById('mini-cart');
    const overlay = document.getElementById('mini-cart-overlay');
    
    if (miniCart && overlay) {
      miniCart.classList.remove('active');
      overlay.classList.remove('active');
      
      // 스크롤 복원 (프라다 스타일)
      document.body.style.overflow = '';
      
      console.log('✅ 미니 카트 닫힘 + 스크롤 복원');
    }
  }

  loadCartItems() {
    const saved = localStorage.getItem('cartItems');
    return saved ? JSON.parse(saved) : [];
  }

  saveCartItems() {
    localStorage.setItem('cartItems', JSON.stringify(this.cartItems));
  }

  addToCart(product) {
    console.log('🛒 addToCart 호출됨:', product);
    
    const existingItem = this.cartItems.find(item => 
      item.productId === product.id && 
      item.size === product.size && 
      item.color === product.color
    );

    if (existingItem) {
      existingItem.quantity += 1;
      console.log('📦 기존 상품 수량 증가:', existingItem);
    } else {
      const newItem = {
        id: Date.now(),
        productId: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        size: product.size || 'ONE SIZE',
        color: product.color || 'DEFAULT',
        quantity: 1,
        addedAt: new Date().toISOString()
      };
      this.cartItems.push(newItem);
      console.log('✨ 새 상품 추가:', newItem);
    }

    this.saveCartItems();
    this.updateCartDisplay();
    
    // 항상 미니 카트 렌더링 (열려있든 닫혀있든)
    this.renderMiniCart();
    console.log('✅ 장바구니 렌더링 완료, 총', this.cartItems.length, '개 상품');
  }

  removeFromCart(itemId) {
    this.cartItems = this.cartItems.filter(item => item.id !== itemId);
    this.saveCartItems();
    this.updateCartDisplay();
    this.renderMiniCart();
  }

  updateQuantity(itemId, newQuantity) {
    const item = this.cartItems.find(item => item.id === itemId);
    if (item) {
      if (newQuantity <= 0) {
        this.removeFromCart(itemId);
      } else {
        item.quantity = newQuantity;
        this.saveCartItems();
        this.updateCartDisplay();
        this.renderMiniCart();
      }
    }
  }

  // 로그아웃 시 장바구니 숨기기 (데이터는 보존)
  hideCartForLogout() {
    this.updateCartDisplay();
    this.renderMiniCart();
    console.log('🛒 로그아웃 상태 - 장바구니 숨김 (데이터 보존)');
  }

  // 로그인 시 장바구니 복원
  restoreCartForLogin() {
    this.updateCartDisplay();
    this.renderMiniCart();
    console.log('🛒 로그인 상태 - 장바구니 복원');
  }

  updateCartDisplay() {
    const totalItems = this.cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const badge = document.getElementById('cart-badge');
    
    if (badge) {
      if (totalItems > 0) {
        badge.textContent = totalItems > 99 ? '99+' : totalItems;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  renderMiniCart() {
    console.log('🎨 renderMiniCart 호출됨, 현재 장바구니:', this.cartItems);
    
    const content = document.getElementById('mini-cart-content');
    const count = document.getElementById('mini-cart-count');
    const total = document.getElementById('mini-cart-total');
    const headerTitle = document.querySelector('.mini-cart-header h3');
    
    console.log('🔍 요소 확인:', {
      content: !!content,
      count: !!count,
      total: !!total,
      headerTitle: !!headerTitle
    });
    
    if (!content) {
      console.error('❌ mini-cart-content를 찾을 수 없습니다!');
      return;
    }

    // 총 아이템 수 업데이트
    const totalItems = this.cartItems.reduce((sum, item) => sum + item.quantity, 0);
    if (count) count.textContent = totalItems;
    
    // 헤더 제목 업데이트: "선택 항목 (3)" 형태로 변경
    if (headerTitle) {
      headerTitle.textContent = `선택 항목 (${totalItems})`;
    }

    // 총 가격 계산
    const totalPrice = this.cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    if (total) total.textContent = this.formatPrice(totalPrice);

    console.log('📊 장바구니 통계:', { totalItems, totalPrice });

    // 아이템 렌더링
    if (this.cartItems.length === 0) {
      content.innerHTML = '<div class="empty-cart">장바구니가 비어있습니다.</div>';
      console.log('📭 장바구니가 비어있습니다');
      return;
    }

    content.innerHTML = this.cartItems.map(item => `
      <div class="mini-cart-item">
        <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" onerror="this.src='image/default.jpg'">
        <div class="mini-cart-item-info">
          <div class="mini-cart-item-name">${escapeHtml(item.name)}</div>
          <div class="mini-cart-item-details">
            <div class="mini-cart-item-color">색상: ${escapeHtml(item.color)}</div>
            <div class="mini-cart-item-quantity">수량: ${escapeHtml(item.quantity)}</div>
          </div>
          <div class="mini-cart-item-price">${this.formatPrice(item.price)}</div>
          <button class="mini-cart-item-remove" onclick="miniCart.removeFromCart('${escapeHtml(item.id)}')">제거</button>
        </div>
      </div>
    `).join('');
    
    console.log('✅ 미니 카트 렌더링 완료:', this.cartItems.length, '개 상품');
  }

  formatPrice(price) {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0
    }).format(price);
  }

  getCartItems() {
    return this.cartItems;
  }

  getCartCount() {
    return this.cartItems.reduce((sum, item) => sum + item.quantity, 0);
  }

  getCartTotal() {
    return this.cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }
}

// MiniCart 클래스를 전역으로 노출
window.MiniCart = MiniCart;

// 전역 인스턴스 생성
let miniCart;

// 초기화 함수
function initializeMiniCart() {
  if (!window.miniCart) {
    miniCart = new MiniCart();
    window.miniCart = miniCart;
    console.log('✅ 미니 카트 초기화 완료 (mini-cart.js)');
  }
}

// DOM 로드 완료 후 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeMiniCart);
} else {
  // 이미 DOM이 로드된 경우 즉시 초기화
  initializeMiniCart();
}



