// mini-cart.js - 미니 카트 기능

// 중복 선언 방지
if (typeof MiniCart === 'undefined') {

const API_BASE = (window.API_BASE)
  ? window.API_BASE
  : ((window.location && window.location.origin)
      ? window.location.origin.replace(/\/$/, '') + '/api'
      : '/api');

class MiniCart {
  constructor() {
    this.cartItems = [];
    this.isLoggedIn = false;
    this.init();
  }

  async init() {
    // 헤더가 로드될 때까지 대기
    let attempts = 0;
    const waitForHeader = setInterval(async () => {
      const cartToggle = document.getElementById('cart-toggle');
      attempts++;
      
      if (cartToggle) {
        clearInterval(waitForHeader);
        this.bindEvents();
        
        // 로그인 상태 확인 및 장바구니 로드
        await this.checkLoginStatus();
        if (this.isLoggedIn) {
          await this.loadCartFromServer();
        }
        
        this.updateCartDisplay();
        this.renderMiniCart();
        Logger.log('✅ 미니 카트 초기화 완료 (시도 횟수:', attempts, ')');
      } else if (attempts > 100) {
        // 10초 후에도 안 되면 포기하고, 헤더 로드 이벤트 리스너로 재시도
        clearInterval(waitForHeader);
        console.warn('⚠️ 장바구니 버튼 초기 발견 실패, 헤더 로드 대기 중...');
        
        // 헤더가 나중에 로드될 수 있으므로 DOMContentLoaded와 MutationObserver로 재시도
        this.retryInitOnHeaderLoad();
      }
    }, 100);
  }

  // 헤더 로드 후 재시도 메서드
  retryInitOnHeaderLoad() {
    // DOMContentLoaded가 이미 발생했을 수도 있으므로 즉시 체크
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      const cartToggle = document.getElementById('cart-toggle');
      if (cartToggle && !cartToggle.hasAttribute('data-bind-attempted')) {
        console.log('🔄 헤더 로드 후 재시도 - 미니 카트 이벤트 바인딩');
        this.bindEvents();
        cartToggle.setAttribute('data-bind-attempted', 'true');
      }
    }

    // DOMContentLoaded 이벤트 리스너
    if (document.readyState !== 'complete') {
      document.addEventListener('DOMContentLoaded', () => {
        const cartToggle = document.getElementById('cart-toggle');
        if (cartToggle && !cartToggle.hasAttribute('data-bind-attempted')) {
          console.log('🔄 DOMContentLoaded 후 재시도 - 미니 카트 이벤트 바인딩');
          this.bindEvents();
          cartToggle.setAttribute('data-bind-attempted', 'true');
        }
      });
    }

    // MutationObserver로 헤더 컨테이너 감시
    const headerContainer = document.getElementById('header-container');
    if (headerContainer) {
      const observer = new MutationObserver(() => {
        const cartToggle = document.getElementById('cart-toggle');
        if (cartToggle && !cartToggle.hasAttribute('data-bind-attempted')) {
          console.log('🔄 헤더 컨테이너 변경 감지 - 미니 카트 이벤트 바인딩');
          this.bindEvents();
          cartToggle.setAttribute('data-bind-attempted', 'true');
          observer.disconnect(); // 성공하면 관찰 중지
        }
      });

      observer.observe(headerContainer, {
        childList: true,
        subtree: true
      });

      // 10초 후에도 안 되면 관찰 중지
      setTimeout(() => {
        observer.disconnect();
      }, 10000);
    }
  }

  bindEvents() {
    // 장바구니 토글 버튼
    const cartToggle = document.getElementById('cart-toggle');
    const miniCart = document.getElementById('mini-cart');
    const miniCartClose = document.getElementById('mini-cart-close');
    const overlay = document.getElementById('mini-cart-overlay');

    Logger.log('🔗 이벤트 바인딩 중...', {
      cartToggle: !!cartToggle,
      miniCart: !!miniCart,
      miniCartClose: !!miniCartClose,
      overlay: !!overlay
    });

    if (cartToggle) {
      // 기존 이벤트 리스너 제거 (중복 방지)
      const newCartToggle = cartToggle.cloneNode(true);
      cartToggle.parentNode.replaceChild(newCartToggle, cartToggle);
      
      // 새 요소에 이벤트 리스너 추가
      newCartToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        Logger.log('🛒 장바구니 버튼 클릭됨!');
        this.toggleMiniCart();
      });
      Logger.log('✅ 장바구니 버튼 이벤트 리스너 추가 완료');
    } else {
      console.warn('⚠️ 장바구니 버튼을 찾을 수 없습니다. 헤더가 아직 로드되지 않았을 수 있습니다.');
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
        window.location.href = 'checkout.html';
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
      
      Logger.log('✅ 미니 카트 열림 + 스크롤 방지');
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
      
      Logger.log('✅ 미니 카트 닫힘 + 스크롤 복원');
    }
  }

  // 로그인 상태 확인 - 401 오류 처리 개선 (정상적인 동작)
  async checkLoginStatus() {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        credentials: 'include'
      });
      
      // 401 오류인 경우 로그인하지 않은 것으로 처리 (정상적인 동작)
      if (response.status === 401) {
        this.isLoggedIn = false;
        return false;
      }
      
      if (!response.ok) {
        this.isLoggedIn = false;
        return false;
      }
      
      const data = await response.json();
      this.isLoggedIn = data.success && data.user;
      return this.isLoggedIn;
    } catch (error) {
      this.isLoggedIn = false;
      return false;
    }
  }

  // 서버에서 장바구니 로드
  async loadCartFromServer() {
    if (!this.isLoggedIn) {
      this.cartItems = [];
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/cart`, {
        credentials: 'include'
      });
      const data = await response.json();
      
      if (data.success) {
        this.cartItems = data.items || [];
        Logger.log('🛒 서버에서 장바구니 로드:', this.cartItems.length, '개 상품');
      } else {
        this.cartItems = [];
      }
    } catch (error) {
      console.error('❌ 장바구니 로드 실패:', error);
      this.cartItems = [];
    }
  }

  async addToCart(product) {
    Logger.log('🛒 addToCart 호출됨:', product);
    
    // 로그인 상태 확인
    const isLoggedIn = await this.checkLoginStatus();
    if (!isLoggedIn) {
      alert('로그인이 필요한 서비스입니다.');
      window.location.href = 'login.html';
      return false;
    }

    try {
      const response = await fetch(`${API_BASE}/cart/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          productId: product.id,
          quantity: product.quantity || 1,
          size: product.size,
          color: product.color
        })
      });

      const data = await response.json();
      
      if (data.success) {
        // 서버에서 장바구니 다시 로드
        await this.loadCartFromServer();
        this.updateCartDisplay();
        this.renderMiniCart();
        Logger.log('✅ 장바구니에 추가됨:', data.message);
        return true;
      } else {
        alert(data.message || '장바구니 추가에 실패했습니다.');
        return false;
      }
    } catch (error) {
      console.error('❌ 장바구니 추가 오류:', error);
      alert('서버와의 통신에 실패했습니다.');
      return false;
    }
  }

  async removeFromCart(itemId) {
    if (!this.isLoggedIn) return;

    try {
      const response = await fetch(`${API_BASE}/cart/item/${itemId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const data = await response.json();
      
      if (data.success) {
        // 서버에서 장바구니 다시 로드
        await this.loadCartFromServer();
        this.updateCartDisplay();
        this.renderMiniCart();
        console.log('✅ 장바구니에서 삭제됨:', data.message);
      } else {
        alert(data.message || '삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('❌ 장바구니 삭제 오류:', error);
      alert('서버와의 통신에 실패했습니다.');
    }
  }

  async updateQuantity(itemId, newQuantity) {
    if (!this.isLoggedIn) return;

    if (newQuantity <= 0) {
      await this.removeFromCart(itemId);
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/cart/item/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ quantity: newQuantity })
      });

      const data = await response.json();
      
      if (data.success) {
        // 서버에서 장바구니 다시 로드
        await this.loadCartFromServer();
        this.updateCartDisplay();
        this.renderMiniCart();
        console.log('✅ 수량 변경됨:', data.message);
      } else {
        alert(data.message || '수량 변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('❌ 수량 변경 오류:', error);
      alert('서버와의 통신에 실패했습니다.');
    }
  }

  // 로그아웃 시 장바구니 숨기기
  async hideCartForLogout() {
    this.isLoggedIn = false;
    this.cartItems = [];
    this.updateCartDisplay();
    this.renderMiniCart();
    console.log('🛒 로그아웃 상태 - 장바구니 숨김');
  }

  // 로그인 시 장바구니 복원
  async restoreCartForLogin() {
    await this.checkLoginStatus();
    if (this.isLoggedIn) {
      await this.loadCartFromServer();
      this.updateCartDisplay();
      this.renderMiniCart();
      console.log('🛒 로그인 상태 - 장바구니 복원');
    }
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
        <img src="image/${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" onerror="this.src='image/default.jpg'">
        <div class="mini-cart-item-info">
          <div class="mini-cart-item-name">${escapeHtml(item.name)}</div>
          <div class="mini-cart-item-details">
            <div class="mini-cart-item-color">색상: ${escapeHtml(item.color || 'DEFAULT')}</div>
            <div class="mini-cart-item-quantity">수량: ${escapeHtml(item.quantity)}</div>
          </div>
          <div class="mini-cart-item-price">${this.formatPrice(item.price)}</div>
          <button class="mini-cart-item-remove" onclick="miniCart.removeFromCart('${escapeHtml(item.item_id)}')">제거</button>
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

  async sync() {
    try {
      await this.checkLoginStatus();
      if (!this.isLoggedIn) {
        this.cartItems = [];
        this.updateCartDisplay();
        this.renderMiniCart();
        Logger.log('🛒 sync: 로그인하지 않아 장바구니를 비웠습니다.');
        return;
      }
      await this.loadCartFromServer();
      this.updateCartDisplay();
      this.renderMiniCart();
      Logger.log('🛒 sync: 서버 상태와 장바구니 동기화 완료');
    } catch (error) {
      console.error('❌ 장바구니 동기화 실패:', error);
    }
  }

  // 장바구니 비우기
  async clearCart() {
    if (!this.isLoggedIn) {
      this.cartItems = [];
      this.updateCartDisplay();
      this.renderMiniCart();
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/cart/clear`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const data = await response.json();
      
      if (data.success) {
        this.cartItems = [];
        this.updateCartDisplay();
        this.renderMiniCart();
        Logger.log('✅ 장바구니 비우기 완료');
      } else {
        console.error('❌ 장바구니 비우기 실패:', data.message);
      }
    } catch (error) {
      console.error('❌ 장바구니 비우기 오류:', error);
      // 오류가 발생해도 로컬은 비우기
      this.cartItems = [];
      this.updateCartDisplay();
      this.renderMiniCart();
    }

    await this.sync();
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

} // MiniCart 클래스 중복 선언 방지 종료



