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

// ⚠️ 로컬 장바구니 키 버전 관리 (향후 스키마 변경 시 마이그레이션 가능)
const GUEST_CART_KEY = 'pm_cart_v1'; // 버전 1 (기존 'guest_cart'와 호환)

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
  /**
   * 로그인 상태 확인
   * ⚠️ 401/403과 그 외 에러를 분리하여 처리
   * 
   * @returns {Promise<{status: 'auth'|'guest'|'unknown', isLoggedIn: boolean}>}
   * - 'auth': 로그인 상태 (확인됨)
   * - 'guest': 비회원 상태 (401/403으로 확인됨)
   * - 'unknown': **상태 확인 불가** (서버 장애/네트워크 오류)
   *   - 실제로는 회원일 수도, 비회원일 수도 있음
   *   - 하지만 서버에 접근할 수 없으므로 확인 불가
   *   - 안전하게 기존 상태 유지, 새로운 작업은 차단
   */
  async checkLoginStatus() {
    try {
      const response = await fetch(`${API_BASE}/auth/status`, {
        credentials: 'include'
      });
      
      // ⚠️ 401/403만 비회원으로 판정, 그 외는 unknown
      if (response.status === 401 || response.status === 403) {
        this.isLoggedIn = false;
        const loginStatus = { status: 'guest', isLoggedIn: false };
        // ⚠️ 운영 중 문제 재현용 상태 로그 (정상 동작이므로 debugLog로 변경)
        debugLog('[CART_STATE]', loginStatus.status);
        return loginStatus;
      }
      
      if (!response.ok) {
        // 500, 502, timeout 등 서버/네트워크 에러
        this.isLoggedIn = false;
        const loginStatus = { status: 'unknown', isLoggedIn: false };
        // ⚠️ 운영 중 문제 재현용 상태 로그 (에러 상황이므로 console.warn 유지)
        console.warn('[CART_STATE]', loginStatus.status);
        return loginStatus;
      }
      
      const data = await response.json();
      this.isLoggedIn = data.success && data.authenticated && !!data.user;
      const loginStatus = { 
        status: this.isLoggedIn ? 'auth' : 'guest', 
        isLoggedIn: this.isLoggedIn 
      };
      // ⚠️ 운영 중 문제 재현용 상태 로그 (정상 동작이므로 debugLog로 변경)
      debugLog('[CART_STATE]', loginStatus.status);
      return loginStatus;
    } catch (error) {
      // 네트워크 에러, timeout 등
      this.isLoggedIn = false;
      const loginStatus = { status: 'unknown', isLoggedIn: false };
      // ⚠️ 운영 중 문제 재현용 상태 로그 (에러 상황이므로 console.warn 유지)
      console.warn('[CART_STATE]', loginStatus.status);
      return loginStatus;
    }
  }

  // 서버에서 장바구니 로드
  async loadCartFromServer() {
    const loginStatus = await this.checkLoginStatus();
    
    // ⚠️ 비회원(guest)일 때만 localStorage에서 로드
    if (loginStatus.status === 'guest') {
      this.loadCartFromLocalStorage();
      return;
    }
    
    // ⚠️ 네트워크/서버 에러(unknown)일 때는 기존 장바구니 유지
    // UI에서 "서버 카트처럼 보이지 않도록" 하기 위해 기존 장바구니를 그대로 유지
    // (새로고침 시 다시 시도할 수 있도록)
    if (loginStatus.status === 'unknown') {
      debugLog('⚠️ 로그인 상태 확인 실패 (네트워크/서버 에러), 기존 장바구니 유지');
      // ⚠️ unknown 상태에서는 서버 카트처럼 보이지 않도록, 기존 장바구니를 그대로 유지
      // (this.cartItems는 이미 로드된 상태이므로 변경하지 않음)
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
      // ⚠️ 기존 'guest_cart' 데이터 마이그레이션 (호환성) - 파손 데이터 안전 처리
      const oldCartKey = 'guest_cart';
      let oldCart = null;
      try {
        oldCart = localStorage.getItem(oldCartKey);
        if (oldCart) {
          // 마이그레이션 전에 파손 데이터 검증
          try {
            JSON.parse(oldCart); // 파싱 가능한지 확인
            // 기존 데이터를 새 키로 이동
            localStorage.setItem(GUEST_CART_KEY, oldCart);
            localStorage.removeItem(oldCartKey);
            debugLog('🔄 기존 guest_cart 데이터를 pm_cart_v1로 마이그레이션');
          } catch (parseError) {
            // 파손된 데이터는 삭제
            console.warn('⚠️ 파손된 guest_cart 데이터 감지, 삭제:', parseError);
            localStorage.removeItem(oldCartKey);
            oldCart = null; // 마이그레이션하지 않음
          }
        }
      } catch (migrationError) {
        console.warn('⚠️ guest_cart 마이그레이션 중 오류:', migrationError);
        // 마이그레이션 실패해도 계속 진행
      }
      
      // ⚠️ 파손 데이터 안전 처리: JSON.parse 실패 시 빈 배열로 초기화
      let cartItems = [];
      try {
        const cartData = localStorage.getItem(GUEST_CART_KEY) || '[]';
        cartItems = JSON.parse(cartData);
        if (!Array.isArray(cartItems)) {
          throw new Error('장바구니 데이터가 배열이 아닙니다.');
        }
      } catch (parseError) {
        console.warn('⚠️ pm_cart_v1 파싱 실패, 빈 장바구니로 초기화:', parseError);
        // 파손된 데이터 삭제 및 빈 배열로 초기화
        try {
          localStorage.removeItem(GUEST_CART_KEY);
        } catch (removeError) {
          console.warn('⚠️ 파손된 데이터 삭제 실패:', removeError);
        }
        cartItems = [];
      }
      
      this.cartItems = cartItems;
      debugLog('🛒 localStorage에서 장바구니 로드:', this.cartItems.length, '개 상품');
    } catch (error) {
      console.error('❌ localStorage 장바구니 로드 실패:', error);
      this.cartItems = [];
    }
  }

  async addToCart(product) {
    debugLog('🛒 addToCart 호출됨:', product);
    
    // 로그인 상태 확인 (401/403과 그 외 에러 분리)
    const loginStatus = await this.checkLoginStatus();
    
    // ⚠️ 비회원(guest)일 때만 localStorage에 저장
    if (loginStatus.status === 'guest') {
      debugLog('🛒 비회원 장바구니 추가 (localStorage)');
      return this.addToCartLocalStorage(product);
    }
    
    // ⚠️ 네트워크/서버 에러(unknown)일 때는 사용자에게 알림 (세션당 1회만)
    if (loginStatus.status === 'unknown') {
      debugLog('⚠️ 로그인 상태 확인 실패 (네트워크/서버 에러)');
      // ⚠️ alert 폭탄 방지: 세션당 1회만 표시
      const alertKey = 'pm_unknown_alert_shown';
      if (!sessionStorage.getItem(alertKey)) {
        alert('서버 연결에 문제가 있습니다. 잠시 후 다시 시도해주세요.');
        sessionStorage.setItem(alertKey, '1');
      }
      return false;
    }
    
    // 로그인 상태(auth): 서버에 저장

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
      // ⚠️ 기존 'guest_cart' 데이터 마이그레이션 (호환성) - 파손 데이터 안전 처리
      const oldCartKey = 'guest_cart';
      let oldCart = null;
      try {
        oldCart = localStorage.getItem(oldCartKey);
        if (oldCart) {
          try {
            JSON.parse(oldCart); // 파싱 가능한지 확인
            localStorage.setItem(GUEST_CART_KEY, oldCart);
            localStorage.removeItem(oldCartKey);
            debugLog('🔄 기존 guest_cart 데이터를 pm_cart_v1로 마이그레이션');
          } catch (parseError) {
            console.warn('⚠️ 파손된 guest_cart 데이터 감지, 삭제:', parseError);
            localStorage.removeItem(oldCartKey);
            oldCart = null;
          }
        }
      } catch (migrationError) {
        console.warn('⚠️ guest_cart 마이그레이션 중 오류:', migrationError);
      }
      
      // ⚠️ 파손 데이터 안전 처리
      let cartItems = [];
      try {
        const cartData = localStorage.getItem(GUEST_CART_KEY) || '[]';
        cartItems = JSON.parse(cartData);
        if (!Array.isArray(cartItems)) {
          throw new Error('장바구니 데이터가 배열이 아닙니다.');
        }
      } catch (parseError) {
        console.warn('⚠️ pm_cart_v1 파싱 실패, 빈 장바구니로 초기화:', parseError);
        try {
          localStorage.removeItem(GUEST_CART_KEY);
        } catch (removeError) {
          console.warn('⚠️ 파손된 데이터 삭제 실패:', removeError);
        }
        cartItems = [];
      }
      
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
      
      localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cartItems));
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
    const loginStatus = await this.checkLoginStatus();
    
    // ⚠️ 비회원(guest)일 때만 localStorage에서 제거
    if (loginStatus.status === 'guest') {
      this.removeFromCartLocalStorage(itemId);
      return;
    }
    
    // ⚠️ 네트워크/서버 에러(unknown)일 때는 처리 안 함 (세션당 1회만 alert)
    if (loginStatus.status === 'unknown') {
      const alertKey = 'pm_unknown_alert_shown';
      if (!sessionStorage.getItem(alertKey)) {
        alert('서버 연결에 문제가 있습니다. 잠시 후 다시 시도해주세요.');
        sessionStorage.setItem(alertKey, '1');
      }
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
    const loginStatus = await this.checkLoginStatus();
    
    if (newQuantity <= 0) {
      await this.removeFromCart(itemId);
      return;
    }

    // ⚠️ 비회원(guest)일 때만 localStorage에서 수량 업데이트
    if (loginStatus.status === 'guest') {
      this.updateQuantityLocalStorage(itemId, newQuantity);
      return;
    }
    
    // ⚠️ 네트워크/서버 에러(unknown)일 때는 처리 안 함 (세션당 1회만 alert)
    if (loginStatus.status === 'unknown') {
      const alertKey = 'pm_unknown_alert_shown';
      if (!sessionStorage.getItem(alertKey)) {
        alert('서버 연결에 문제가 있습니다. 잠시 후 다시 시도해주세요.');
        sessionStorage.setItem(alertKey, '1');
      }
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

  // 비회원 장바구니 제거 (localStorage)
  removeFromCartLocalStorage(itemId) {
    try {
      // ⚠️ 파손 데이터 안전 처리
      let cartItems = [];
      try {
        const cartData = localStorage.getItem(GUEST_CART_KEY) || '[]';
        cartItems = JSON.parse(cartData);
        if (!Array.isArray(cartItems)) {
          throw new Error('장바구니 데이터가 배열이 아닙니다.');
        }
      } catch (parseError) {
        console.warn('⚠️ pm_cart_v1 파싱 실패, 빈 장바구니로 초기화:', parseError);
        try {
          localStorage.removeItem(GUEST_CART_KEY);
        } catch (removeError) {
          console.warn('⚠️ 파손된 데이터 삭제 실패:', removeError);
        }
        cartItems = [];
        this.cartItems = [];
        this.updateCartDisplay();
        this.renderMiniCart();
        return;
      }
      
      // 아이템 제거
      cartItems = cartItems.filter(item => item.item_id !== itemId);
      localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cartItems));
      this.cartItems = cartItems; // 현재 인스턴스에도 반영
      this.updateCartDisplay();
      this.renderMiniCart();
      debugLog('✅ 비회원 장바구니에서 제거됨 (localStorage)');
    } catch (error) {
      console.error('❌ localStorage 장바구니 제거 오류:', error);
      alert('장바구니에서 제거하는데 실패했습니다.');
    }
  }

  // 비회원 장바구니 수량 업데이트 (localStorage)
  updateQuantityLocalStorage(itemId, newQuantity) {
    try {
      // ⚠️ 파손 데이터 안전 처리
      let cartItems = [];
      try {
        const cartData = localStorage.getItem(GUEST_CART_KEY) || '[]';
        cartItems = JSON.parse(cartData);
        if (!Array.isArray(cartItems)) {
          throw new Error('장바구니 데이터가 배열이 아닙니다.');
        }
      } catch (parseError) {
        console.warn('⚠️ pm_cart_v1 파싱 실패, 빈 장바구니로 초기화:', parseError);
        try {
          localStorage.removeItem(GUEST_CART_KEY);
        } catch (removeError) {
          console.warn('⚠️ 파손된 데이터 삭제 실패:', removeError);
        }
        cartItems = [];
        alert('장바구니 데이터에 문제가 있어 초기화되었습니다.');
        return;
      }
      
      // 아이템 찾아서 수량 업데이트
      const itemIndex = cartItems.findIndex(item => item.item_id === itemId);
      if (itemIndex >= 0) {
        cartItems[itemIndex].quantity = newQuantity;
        localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cartItems));
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
    const syncDoneKey = 'pm_cart_sync_done'; // 이번 로그인 세션에서 이미 동기화 완료 플래그
    
    // 이미 이번 세션에서 동기화가 완료되었으면 스킵
    if (sessionStorage.getItem(syncDoneKey) === '1') {
      debugLog('⚠️ 이번 로그인 세션에서 이미 장바구니 동기화가 완료되었습니다.');
      return { success: true, synced: 0, message: '이미 동기화 완료' };
    }
    
    if (sessionStorage.getItem(syncLockKey) === '1') {
      debugLog('⚠️ 장바구니 동기화가 이미 진행 중입니다. 중복 실행 방지.');
      return { success: false, error: '동기화가 이미 진행 중입니다.', synced: 0 };
    }

    // ⚠️ 락 해제 보장: finally 블록으로 감싸기
    try {
      // 동기화 시작 락 설정
      sessionStorage.setItem(syncLockKey, '1');

      // ⚠️ 기존 'guest_cart' 데이터 마이그레이션 (호환성)
      const oldCartKey = 'guest_cart';
      const oldCart = localStorage.getItem(oldCartKey);
      if (oldCart) {
        localStorage.setItem(GUEST_CART_KEY, oldCart);
        localStorage.removeItem(oldCartKey);
        debugLog('🔄 기존 guest_cart 데이터를 pm_cart_v1로 마이그레이션');
      }
      
      const guestCartItems = JSON.parse(localStorage.getItem(GUEST_CART_KEY) || '[]');
      
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
        localStorage.removeItem(GUEST_CART_KEY);
        // ⚠️ 이번 로그인 세션에서 동기화 완료 플래그 설정 (중복 동기화 방지)
        sessionStorage.setItem(syncDoneKey, '1');
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

  // ⚠️ 로그아웃 시 동기화 완료 플래그 초기화 (다음 로그인에서 다시 동기화 가능하도록)
  clearSyncDoneFlag() {
    sessionStorage.removeItem('pm_cart_sync_done');
    debugLog('🔄 장바구니 동기화 완료 플래그 초기화');
  }

  // 로그아웃 시 장바구니 숨기기
  async hideCartForLogout() {
    this.isLoggedIn = false;
    this.cartItems = [];
    this.updateCartDisplay();
    this.renderMiniCart();
    // ⚠️ 로그아웃 시 동기화 완료 플래그 초기화 (다음 로그인에서 다시 동기화 가능하도록)
    this.clearSyncDoneFlag();
    // ⚠️ 로그아웃 시 unknown alert 플래그도 초기화 (다음 세션에서 다시 표시 가능하도록)
    sessionStorage.removeItem('pm_unknown_alert_shown');
    debugLog('🛒 로그아웃 상태 - 장바구니 숨김');
  }

  // 로그인 시 장바구니 복원
  async restoreCartForLogin() {
    const loginStatus = await this.checkLoginStatus();
    
    // ⚠️ 로그인 상태(auth)일 때만 서버에서 로드
    if (loginStatus.status === 'auth') {
      await this.loadCartFromServer();
      this.updateCartDisplay();
      this.renderMiniCart();
      debugLog('🛒 로그인 상태 - 장바구니 복원');
    } else if (loginStatus.status === 'guest') {
      // 비회원: localStorage에서 로드
      this.loadCartFromLocalStorage();
      this.updateCartDisplay();
      this.renderMiniCart();
      debugLog('🛒 비회원 상태 - localStorage 장바구니 로드');
    }
    // unknown 상태는 기존 장바구니 유지
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

    content.innerHTML = this.cartItems.map(item => {
      // 이미지 경로 처리: /uploads/로 시작하면 그대로 사용, 아니면 /image/ 추가
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
      <div class="mini-cart-item">
        <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(item.name)}" onerror="this.src='/image/default.jpg'">
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
      `;
    }).join('');
    
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
      const loginStatus = await this.checkLoginStatus();
      
      // ⚠️ 비회원(guest)일 때는 localStorage에서 로드
      if (loginStatus.status === 'guest') {
        this.loadCartFromLocalStorage();
        this.updateCartDisplay();
        this.renderMiniCart();
        debugLog('🛒 sync: 비회원 장바구니 로드 (localStorage)');
        return;
      }
      
      // ⚠️ 네트워크/서버 에러(unknown)일 때는 기존 장바구니 유지
      if (loginStatus.status === 'unknown') {
        debugLog('⚠️ sync: 로그인 상태 확인 실패 (네트워크/서버 에러), 기존 장바구니 유지');
        return;
      }
      
      // 회원: 서버에서 로드
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
    const loginStatus = await this.checkLoginStatus();
    
    // ⚠️ 비회원(guest)일 때는 localStorage 비우기
    if (loginStatus.status === 'guest') {
      try {
        localStorage.removeItem(GUEST_CART_KEY);
        this.cartItems = [];
        this.updateCartDisplay();
        this.renderMiniCart();
        debugLog('🛒 비회원 장바구니 비움 (localStorage)');
      } catch (error) {
        console.error('❌ localStorage 장바구니 비우기 실패:', error);
      }
      return;
    }
    
    // ⚠️ 네트워크/서버 에러(unknown)일 때는 처리 안 함 (세션당 1회만 alert)
    if (loginStatus.status === 'unknown') {
      const alertKey = 'pm_unknown_alert_shown';
      if (!sessionStorage.getItem(alertKey)) {
        alert('서버 연결에 문제가 있습니다. 잠시 후 다시 시도해주세요.');
        sessionStorage.setItem(alertKey, '1');
      }
      return;
    }
    
    // 회원: 서버에서 비우기

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
  // ⚠️ 중복 초기화 방지: 이미 초기화되었으면 이벤트도 재발생하지 않음
  if (window.miniCart || window.__MINICART_READY__) {
    debugLog('⚠️ 미니 카트가 이미 초기화되었습니다. 중복 초기화 방지.');
    return;
  }
  
  miniCart = new MiniCart();
  window.miniCart = miniCart;
  window.__MINICART_READY__ = true; // 초기화 완료 플래그
  debugLog('✅ 미니 카트 초기화 완료 (mini-cart.js)');
  
  // ⚠️ 초기화 완료 이벤트 발생 (딱 1회만) - buy-script.js 등에서 대기 가능
  window.dispatchEvent(new CustomEvent('minicart:ready', { 
    detail: { miniCart: miniCart } 
  }));
}

// DOM 로드 완료 후 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeMiniCart);
} else {
  // 이미 DOM이 로드된 경우 즉시 초기화
  initializeMiniCart();
}

} // MiniCart 클래스 중복 선언 방지 종료



