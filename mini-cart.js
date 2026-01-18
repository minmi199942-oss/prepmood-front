// mini-cart.js - 미니 카트 기능

// 중복 선언 방지
if (typeof MiniCart === 'undefined') {

const API_BASE = (window.API_BASE)
  ? window.API_BASE
  : ((window.location && window.location.origin)
      ? window.location.origin.replace(/\/$/, '') + '/api'
      : '/api');

const debugLog = (...args) => {
  if (window.Logger && window.Logger.isDevelopment) {
    window.Logger.log(...args);
  }
};

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
        
        // 로그인 상태 확인 및 장바구니 로드 (비회원 주문 지원)
        await this.checkLoginStatus();
        // ⚠️ 로그인 여부와 관계없이 장바구니 로드 (회원: 서버, 비회원: localStorage)
        await this.loadCartFromServer();
        
        // ⚠️ 로그인 후 비회원 장바구니 동기화 (다음 페이지에서 동기화 예정인 경우)
        if (sessionStorage.getItem('guest_cart_sync_pending') === '1') {
          sessionStorage.removeItem('guest_cart_sync_pending');
          if (this.isLoggedIn && typeof this.syncGuestCartToServer === 'function') {
            try {
              const syncResult = await this.syncGuestCartToServer();
              if (syncResult && syncResult.synced > 0) {
                if (syncResult.success) {
                  debugLog(`✅ 비회원 장바구니 동기화 완료 (지연): ${syncResult.synced}개 상품`);
                } else {
                  debugLog(`⚠️ 비회원 장바구니 부분 동기화 (지연): ${syncResult.synced}/${syncResult.total}개 성공`);
                }
              }
            } catch (syncError) {
              console.error('❌ 비회원 장바구니 동기화 중 오류 (지연):', syncError);
            }
          }
        }
        
        this.updateCartDisplay();
        this.renderMiniCart();
        debugLog('✅ 미니 카트 초기화 완료 (시도 횟수:', attempts, ')');
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
        debugLog('🔄 헤더 로드 후 재시도 - 미니 카트 이벤트 바인딩');
        this.bindEvents();
        cartToggle.setAttribute('data-bind-attempted', 'true');
      }
    }

    // DOMContentLoaded 이벤트 리스너
    if (document.readyState !== 'complete') {
      document.addEventListener('DOMContentLoaded', () => {
        const cartToggle = document.getElementById('cart-toggle');
        if (cartToggle && !cartToggle.hasAttribute('data-bind-attempted')) {
          debugLog('🔄 DOMContentLoaded 후 재시도 - 미니 카트 이벤트 바인딩');
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
          debugLog('🔄 헤더 컨테이너 변경 감지 - 미니 카트 이벤트 바인딩');
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

    debugLog('🔗 이벤트 바인딩 중...', {
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
        debugLog('🛒 장바구니 버튼 클릭됨!');
        this.toggleMiniCart();
      });
      debugLog('✅ 장바구니 버튼 이벤트 리스너 추가 완료');
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
      
      // body 클래스 추가 (CSS에서 헤더 강제 표시용)
      document.body.classList.add('mini-cart-open');
      
      // 헤더 강제 표시
      const header = document.querySelector('header.main-header');
      if (header) {
        header.classList.remove('header--hidden');
      }
      
      // 스크롤 방지 (프라다 스타일)
      document.body.style.overflow = 'hidden';
      
      debugLog('✅ 미니 카트 열림 + 스크롤 방지 + 헤더 표시');
    }
  }

  closeMiniCart() {
    const miniCart = document.getElementById('mini-cart');
    const overlay = document.getElementById('mini-cart-overlay');
    
    if (miniCart && overlay) {
      miniCart.classList.remove('active');
      overlay.classList.remove('active');
      
      // body 클래스 제거
      document.body.classList.remove('mini-cart-open');
      
      // 스크롤 복원 (프라다 스타일)
      document.body.style.overflow = '';
      
      debugLog('✅ 미니 카트 닫힘 + 스크롤 복원');
    }
  }

  // 로그인 상태 확인 - 401 오류 처리 개선 (정상적인 동작)
  async checkLoginStatus() {
    try {
      const response = await fetch(`${API_BASE}/auth/status`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        this.isLoggedIn = false;
        return false;
      }
      
      const data = await response.json();
      this.isLoggedIn = data.success && data.authenticated && !!data.user;
      return this.isLoggedIn;
    } catch (error) {
      this.isLoggedIn = false;
      return false;
    }
  }

  // 서버에서 장바구니 로드
  async loadCartFromServer() {
    const isLoggedIn = await this.checkLoginStatus();
    
    if (!isLoggedIn) {
      // ⚠️ 비회원: localStorage에서 로드
      this.loadCartFromLocalStorage();
      return;
    }

    // 회원: 서버에서 로드
    try {
      const response = await fetch(`${API_BASE}/cart`, {
        credentials: 'include'
      });
      const data = await response.json();
      
      if (data.success) {
        this.cartItems = data.items || [];
        debugLog('🛒 서버에서 장바구니 로드:', this.cartItems.length, '개 상품');
      } else {
        this.cartItems = [];
      }
    } catch (error) {
      console.error('❌ 장바구니 로드 실패:', error);
      this.cartItems = [];
    }
  }

  // 비회원 장바구니 로드 (localStorage)
  loadCartFromLocalStorage() {
    try {
      const cartKey = 'guest_cart';
      const cartItems = JSON.parse(localStorage.getItem(cartKey) || '[]');
      this.cartItems = cartItems;
      debugLog('🛒 localStorage에서 장바구니 로드:', this.cartItems.length, '개 상품');
    } catch (error) {
      console.error('❌ localStorage 장바구니 로드 실패:', error);
      this.cartItems = [];
    }
  }

  async addToCart(product) {
    debugLog('🛒 addToCart 호출됨:', product);
    
    // 로그인 상태 확인
    const isLoggedIn = await this.checkLoginStatus();
    
    if (!isLoggedIn) {
      // ⚠️ 비회원 주문 지원: localStorage에 저장
      debugLog('🛒 비회원 장바구니 추가 (localStorage)');
      return this.addToCartLocalStorage(product);
    }

    // 회원: 서버에 저장
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
        debugLog('✅ 장바구니에 추가됨:', data.message);
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

  // 비회원 장바구니 추가 (localStorage)
  addToCartLocalStorage(product) {
    try {
      const cartKey = 'guest_cart';
      let cartItems = JSON.parse(localStorage.getItem(cartKey) || '[]');
      
      // 기존 아이템 확인 (같은 상품, 사이즈, 색상)
      const existingIndex = cartItems.findIndex(item => 
        item.id === product.id && 
        item.size === product.size && 
        item.color === product.color
      );
      
      if (existingIndex >= 0) {
        // 기존 아이템 수량 증가
        cartItems[existingIndex].quantity += (product.quantity || 1);
      } else {
        // 새 아이템 추가
        cartItems.push({
          id: product.id,
          product_id: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
          size: product.size,
          color: product.color,
          quantity: product.quantity || 1,
          item_id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` // 임시 ID
        });
      }
      
      localStorage.setItem(cartKey, JSON.stringify(cartItems));
      this.cartItems = cartItems; // 현재 인스턴스에도 반영
      this.updateCartDisplay();
      this.renderMiniCart();
      debugLog('✅ 비회원 장바구니에 추가됨 (localStorage)');
      return true;
    } catch (error) {
      console.error('❌ localStorage 장바구니 추가 오류:', error);
      alert('장바구니 추가에 실패했습니다.');
      return false;
    }
  }

  async removeFromCart(itemId) {
    const isLoggedIn = await this.checkLoginStatus();
    
    if (!isLoggedIn) {
      // ⚠️ 비회원: localStorage에서 제거
      this.removeFromCartLocalStorage(itemId);
      return;
    }

    // 회원: 서버에서 제거
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
        debugLog('✅ 장바구니에서 삭제됨:', data.message);
      } else {
        alert(data.message || '삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('❌ 장바구니 삭제 오류:', error);
      alert('서버와의 통신에 실패했습니다.');
    }
  }

  async updateQuantity(itemId, newQuantity) {
    const isLoggedIn = await this.checkLoginStatus();
    
    if (newQuantity <= 0) {
      await this.removeFromCart(itemId);
      return;
    }

    if (!isLoggedIn) {
      // ⚠️ 비회원: localStorage에서 수량 업데이트
      this.updateQuantityLocalStorage(itemId, newQuantity);
      return;
    }

    // 회원: 서버에서 수량 업데이트
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
        debugLog('✅ 수량 변경됨:', data.message);
      } else {
        alert(data.message || '수량 변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('❌ 수량 변경 오류:', error);
      alert('서버와의 통신에 실패했습니다.');
    }
  }

  // 비회원 장바구니 수량 업데이트 (localStorage)
  updateQuantityLocalStorage(itemId, newQuantity) {
    try {
      const cartKey = 'guest_cart';
      let cartItems = JSON.parse(localStorage.getItem(cartKey) || '[]');
      
      // 아이템 찾아서 수량 업데이트
      const itemIndex = cartItems.findIndex(item => item.item_id === itemId);
      if (itemIndex >= 0) {
        cartItems[itemIndex].quantity = newQuantity;
        localStorage.setItem(cartKey, JSON.stringify(cartItems));
        this.cartItems = cartItems; // 현재 인스턴스에도 반영
        this.updateCartDisplay();
        this.renderMiniCart();
        debugLog('✅ 비회원 장바구니 수량 업데이트 완료 (localStorage)');
      }
    } catch (error) {
      console.error('❌ localStorage 수량 업데이트 오류:', error);
      alert('수량 업데이트에 실패했습니다.');
    }
  }

  // 비회원 장바구니를 서버 장바구니로 동기화 (로그인 시 호출)
  async syncGuestCartToServer() {
    // ⚠️ 중복 실행 방지: sessionStorage 락 사용
    const syncLockKey = 'guest_cart_sync_in_progress';
    if (sessionStorage.getItem(syncLockKey) === '1') {
      debugLog('⚠️ 장바구니 동기화가 이미 진행 중입니다. 중복 실행 방지.');
      return { success: false, error: '동기화가 이미 진행 중입니다.', synced: 0 };
    }

    // ⚠️ 락 해제 보장: finally 블록으로 감싸기
    try {
      // 동기화 시작 락 설정
      sessionStorage.setItem(syncLockKey, '1');

      const cartKey = 'guest_cart';
      const guestCartItems = JSON.parse(localStorage.getItem(cartKey) || '[]');
      
      if (!guestCartItems || guestCartItems.length === 0) {
        debugLog('🛒 동기화할 비회원 장바구니 없음');
        return { success: true, synced: 0 };
      }

      debugLog('🔄 비회원 장바구니 서버 동기화 시작:', guestCartItems.length, '개 상품');
      
      let syncedCount = 0;
      const errors = [];
      const failed = [];

      // 각 아이템을 서버 장바구니에 추가
      for (const item of guestCartItems) {
        try {
          const productId = item.product_id || item.id;
          const size = item.size || null;
          const color = item.color || null;
          const quantity = item.quantity || 1;
          
          // ⚠️ 필수 필드 검증: product_id, size, color가 없으면 동기화 불가
          if (!productId) {
            failed.push({ 
              product_id: productId, 
              size: size, 
              color: color, 
              reason: 'product_id가 없습니다.' 
            });
            debugLog(`⚠️ 장바구니 동기화 건너뜀: product_id 없음`);
            continue;
          }
          
          const response = await fetch(`${API_BASE}/cart/add`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include', // ⚠️ 인증 포함: JWT 쿠키 전송
            body: JSON.stringify({
              productId: productId,
              quantity: quantity,
              size: size,
              color: color
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = `HTTP ${response.status}`;
            try {
              const errorData = JSON.parse(errorText);
              errorMessage = errorData.message || errorMessage;
            } catch (e) {
              errorMessage = errorText || errorMessage;
            }
            
            failed.push({ 
              product_id: productId, 
              size: size, 
              color: color, 
              reason: errorMessage 
            });
            errors.push({ productId, size, color, error: errorMessage });
            debugLog(`⚠️ 장바구니 동기화 실패: ${productId} (${size}/${color}) - ${errorMessage}`);
            continue;
          }

          const data = await response.json();
          
          if (data.success) {
            syncedCount++;
            debugLog(`✅ 장바구니 동기화 성공: ${productId} (${size}/${color}, 수량: ${quantity})`);
          } else {
            failed.push({ 
              product_id: productId, 
              size: size, 
              color: color, 
              reason: data.message || '알 수 없는 오류' 
            });
            errors.push({ productId, size, color, error: data.message || '알 수 없는 오류' });
            debugLog(`⚠️ 장바구니 동기화 실패: ${productId} (${size}/${color}) - ${data.message}`);
          }
        } catch (error) {
          const productId = item.product_id || item.id;
          const size = item.size || null;
          const color = item.color || null;
          
          failed.push({ 
            product_id: productId, 
            size: size, 
            color: color, 
            reason: error.message 
          });
          errors.push({ productId, size, color, error: error.message });
          console.error(`❌ 장바구니 동기화 오류 (${productId}):`, error);
        }
      }

      // ⚠️ 전체 성공 시에만 localStorage 비우기 (부분 실패 시 보존)
      const allSuccess = syncedCount === guestCartItems.length;
      
      if (allSuccess) {
        localStorage.removeItem(cartKey);
        debugLog(`✅ 비회원 장바구니 동기화 완료: ${syncedCount}개 상품 모두 동기화, localStorage 비움`);
        
        // 서버에서 최신 장바구니 로드
        await this.loadCartFromServer();
        this.updateCartDisplay();
        this.renderMiniCart();
      } else {
        // 부분 실패 시: 전체 보존 정책 (사용자가 수동으로 재시도 가능)
        debugLog(`⚠️ 비회원 장바구니 부분 동기화: ${syncedCount}/${guestCartItems.length}개 성공, localStorage 보존 (재시도 가능)`);
        
        // 부분 성공한 경우에도 서버 장바구니는 업데이트되었으므로 다시 로드
        await this.loadCartFromServer();
        this.updateCartDisplay();
        this.renderMiniCart();
      }

      return {
        success: allSuccess,
        synced: syncedCount,
        total: guestCartItems.length,
        attempted: guestCartItems.length,
        failed: failed.length > 0 ? failed : undefined,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      console.error('❌ 비회원 장바구니 동기화 오류:', error);
      return {
        success: false,
        error: error.message,
        synced: 0,
        attempted: 0
      };
    } finally {
      // ⚠️ 락 해제 보장: 성공/실패/예외 모든 경우에 락 해제
      sessionStorage.removeItem(syncLockKey);
    }
  }

  // 로그아웃 시 장바구니 숨기기
  async hideCartForLogout() {
    this.isLoggedIn = false;
    this.cartItems = [];
    this.updateCartDisplay();
    this.renderMiniCart();
    debugLog('🛒 로그아웃 상태 - 장바구니 숨김');
  }

  // 로그인 시 장바구니 복원
  async restoreCartForLogin() {
    await this.checkLoginStatus();
    if (this.isLoggedIn) {
      await this.loadCartFromServer();
      this.updateCartDisplay();
      this.renderMiniCart();
      debugLog('🛒 로그인 상태 - 장바구니 복원');
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
    debugLog('🎨 renderMiniCart 호출됨, 현재 장바구니:', this.cartItems);
    
    const content = document.getElementById('mini-cart-content');
    const count = document.getElementById('mini-cart-count');
    const total = document.getElementById('mini-cart-total');
    const headerTitle = document.querySelector('.mini-cart-header h3');
    
    debugLog('🔍 요소 확인:', {
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

    debugLog('📊 장바구니 통계:', { totalItems, totalPrice });

    // 아이템 렌더링
    if (this.cartItems.length === 0) {
      content.innerHTML = '<div class="empty-cart">장바구니가 비어있습니다.</div>';
      debugLog('📭 장바구니가 비어있습니다');
      return;
    }

    content.innerHTML = this.cartItems.map(item => `
      <div class="mini-cart-item">
        <img src="/image/${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" onerror="this.src='/image/default.jpg'">
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
    
    debugLog('✅ 미니 카트 렌더링 완료:', this.cartItems.length, '개 상품');
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
        debugLog('🛒 sync: 로그인하지 않아 장바구니를 비웠습니다.');
        return;
      }
      await this.loadCartFromServer();
      this.updateCartDisplay();
      this.renderMiniCart();
      debugLog('🛒 sync: 서버 상태와 장바구니 동기화 완료');
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
        debugLog('✅ 장바구니 비우기 완료');
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
    debugLog('✅ 미니 카트 초기화 완료 (mini-cart.js)');
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



