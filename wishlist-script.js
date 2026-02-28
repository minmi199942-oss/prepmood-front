// wishlist-script.js - 위시리스트 페이지 스크립트

(function() {
  'use strict';

  const API_BASE = (window.API_BASE)
    ? window.API_BASE
    : ((window.location && window.location.origin)
        ? window.location.origin.replace(/\/$/, '') + '/api'
        : '/api');

  // 로그인 상태 확인 (JWT 기반) - 401 오류 처리 개선
  async function isLoggedIn() {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        credentials: 'include'
      });
      
      // 401 오류인 경우 로그인하지 않은 것으로 처리
      if (response.status === 401) {
        return false;
      }
      
      if (!response.ok) {
        return false;
      }
      
      const data = await response.json();
      return data.success && data.user;
    } catch (error) {
      return false;
    }
  }

  // 로그인 체크
  async function checkLogin() {
    if (!(await isLoggedIn())) {
      alert('로그인이 필요한 서비스입니다.');
      window.location.href = 'login.html';
      return false;
    }
    return true;
  }

  // 사용자 이메일 가져오기 (JWT 기반) - 401 오류 처리 개선
  async function getUserEmail() {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        credentials: 'include'
      });
      
      // 401 오류인 경우 null 반환
      if (response.status === 401) {
        return null;
      }
      
      if (!response.ok) {
        return null;
      }
      
      const data = await response.json();
      return data.success && data.user ? data.user.email : null;
    } catch (error) {
      return null;
    }
  }

  // 카탈로그 데이터에서 상품 ID로 상품 찾기
  function findProductById(id) {
    if (!window.CATALOG_DATA) {
      if (window.Logger) {
        window.Logger.error('CATALOG_DATA가 없습니다');
      }
      Logger.warn('CATALOG_DATA가 없습니다');
      return null;
    }

    // 직접 카테고리 구조로 검색 (category -> type -> products[])
    for (const category in window.CATALOG_DATA) {
      for (const type in window.CATALOG_DATA[category]) {
        const products = window.CATALOG_DATA[category][type];
        if (!Array.isArray(products)) continue;
        
        // 정확한 ID 매칭 시도
        let found = products.find(p => p.id === id);
        
        // 대소문자 무시 매칭 시도
        if (!found) {
          found = products.find(p => p.id && p.id.toLowerCase() === id.toLowerCase());
        }
        
        // 공백 제거 후 매칭 시도
        if (!found) {
          const normalizedId = id.replace(/\s+/g, '');
          found = products.find(p => p.id && p.id.replace(/\s+/g, '') === normalizedId);
        }
        
        if (found) {
          return found;
        }
      }
    }
    
    // 디버깅: 사용 가능한 상품 ID 샘플 출력
    if (window.Logger) {
      window.Logger.warn('제품을 찾을 수 없습니다:', id);
    }
    Logger.warn('제품을 찾을 수 없습니다:', id);
    Logger.warn('CATALOG_DATA 구조:', Object.keys(window.CATALOG_DATA));
    
    // 샘플 상품 ID 출력 (디버깅용)
    let sampleIds = [];
    for (const category in window.CATALOG_DATA) {
      for (const type in window.CATALOG_DATA[category]) {
        const products = window.CATALOG_DATA[category][type];
        if (Array.isArray(products) && products.length > 0) {
          sampleIds.push(...products.slice(0, 3).map(p => p.id));
        }
      }
    }
    if (sampleIds.length > 0) {
      Logger.warn('사용 가능한 상품 ID 샘플:', sampleIds);
    }
    
    return null;
  }

  // API 기본 URL 설정 (환경에 따라 자동 변경)
  const API_BASE_URL = API_BASE;

  // 위시리스트 불러오기
  async function loadWishlist() {
    const loadingState = document.getElementById('loading-state');
    const emptyState = document.getElementById('empty-state');
    const wishlistGrid = document.getElementById('wishlist-grid');
    const wishlistCountSpan = document.getElementById('wishlist-count');

    try {
      // ✅ JWT 토큰은 httpOnly 쿠키로 자동 전송됨
      const response = await fetch(`${API_BASE_URL}/wishlist`, {
        method: 'GET',
        credentials: 'include'  // httpOnly 쿠키 포함
      });

      // 서버 연결 실패 시 빈 상태 표시
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // 로딩 상태 숨김
      loadingState.style.display = 'none';

      if (data.success && data.wishlists && data.wishlists.length > 0) {
        // 위시리스트 상품 표시
        displayWishlistProducts(data.wishlists);
        wishlistCountSpan.textContent = data.count;
        wishlistGrid.style.display = 'grid';
        emptyState.style.display = 'none';
        document.querySelector('.page-header').style.display = 'flex';
      } else {
        // 빈 상태 표시
        emptyState.style.display = 'flex';
        wishlistGrid.style.display = 'none';
        wishlistCountSpan.textContent = '0';
        document.querySelector('.page-header').style.display = 'none';
      }

    } catch (error) {
      Logger.error('위시리스트 불러오기 오류:', error);
      loadingState.style.display = 'none';
      
      // 서버가 꺼져있거나 연결할 수 없는 경우 - 빈 상태로 표시
      // (실제 서비스에서는 로컬 캐시나 임시 저장소를 사용할 수 있음)
      emptyState.style.display = 'flex';
      wishlistGrid.style.display = 'none';
      wishlistCountSpan.textContent = '0';
      document.querySelector('.page-header').style.display = 'none';
      
      // 개발 모드에서는 콘솔에 상세 정보 표시
      if (error.message && error.message.includes('Failed to fetch')) {
        Logger.warn('💡 백엔드 서버가 실행되지 않았습니다. 위시리스트 기능을 사용하려면 서버를 시작하세요:');
        Logger.warn('   cd backend');
        Logger.warn('   node index.js');
      }
    }
  }

  // 위시리스트 상품 표시
  function displayWishlistProducts(wishlists) {
    const wishlistGrid = document.getElementById('wishlist-grid');
    const emptyState = document.getElementById('empty-state');
    wishlistGrid.innerHTML = '';

    let foundCount = 0;
    let notFoundIds = [];

    wishlists.forEach(item => {
      const product = findProductById(item.product_id);

      if (!product) {
        Logger.warn(`상품을 찾을 수 없습니다: ${item.product_id}`);
        notFoundIds.push(item.product_id);
        return;
      }
      
      foundCount++;

      // 상품 카드 생성
      const card = document.createElement('div');
      card.className = 'wishlist-card';
      card.innerHTML = `
        <a href="buy.html?id=${escapeHtml(product.id)}" class="wishlist-card-link">
          <div class="wishlist-card-image-wrapper">
            <img src="/image/${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" class="wishlist-card-image">
          </div>
          <div class="wishlist-card-info">
            <h3 class="wishlist-card-title">${escapeHtml(product.name)}</h3>
            <p class="wishlist-card-price">${formatPrice(product.price)}</p>
            <p class="wishlist-card-date">추가일: ${escapeHtml(formatDate(item.added_at))}</p>
          </div>
        </a>
        <button class="wishlist-remove-btn" data-product-id="${escapeHtml(product.id)}" aria-label="위시리스트에서 제거">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      `;

      wishlistGrid.appendChild(card);
    });

    // 찾지 못한 상품이 있는 경우 경고
    if (notFoundIds.length > 0) {
      Logger.warn(`총 ${notFoundIds.length}개의 상품을 찾을 수 없습니다:`, notFoundIds);
      Logger.warn('CATALOG_DATA가 제대로 로드되었는지 확인하세요.');
    }

    // 찾은 상품이 없는 경우 빈 상태 표시
    if (foundCount === 0 && wishlists.length > 0) {
      const emptyState = document.getElementById('empty-state');
      const wishlistCountSpan = document.getElementById('wishlist-count');
      wishlistGrid.style.display = 'none';
      emptyState.style.display = 'flex';
      wishlistCountSpan.textContent = '0';
      Logger.warn('위시리스트에 상품이 있지만 CATALOG_DATA에서 찾을 수 없습니다.');
    }

    // 제거 버튼 이벤트 리스너 등록
    const removeButtons = wishlistGrid.querySelectorAll('.wishlist-remove-btn');
    removeButtons.forEach(btn => {
      btn.addEventListener('click', handleRemoveFromWishlist);
    });
  }

  // 위시리스트에서 제거
  async function handleRemoveFromWishlist(event) {
    const productId = event.currentTarget.dataset.productId;

    if (!confirm('위시리스트에서 제거하시겠습니까?')) {
      return;
    }

    try {
      const userEmail = await getUserEmail();

      const response = await fetch(`${API_BASE_URL}/wishlist/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': userEmail
        },
        credentials: 'include',
        body: JSON.stringify({
          productId: productId
        })
      });

      const data = await response.json();

      if (data.success && data.action === 'removed') {
        // 성공적으로 제거됨 - 페이지 새로고침
        loadWishlist();
      } else {
        alert('위시리스트에서 제거하는데 실패했습니다.');
      }

    } catch (error) {
      Logger.error('위시리스트 제거 오류:', error);
      alert('서버와의 통신에 실패했습니다.');
    }
  }

  // 가격 포맷팅
  function formatPrice(price) {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0
    }).format(price);
  }

  // 날짜 포맷팅
  function formatDate(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  }

  // escapeHtml은 utils.js에서 전역으로 제공됨 (중복 제거)

  // 초기화
  async function init() {
    // 로그인 체크
    if (!(await checkLogin())) {
      return;
    }

    // 카탈로그 데이터 로드 대기
    if (typeof window.CATALOG_DATA === 'undefined' || !window.productsLoaded) {
      // productsLoaded 이벤트를 기다림
      window.addEventListener('productsLoaded', init, { once: true });
      // 타임아웃 대비 폴백
      setTimeout(() => {
        if (typeof window.CATALOG_DATA !== 'undefined') {
          loadWishlist();
        } else {
          setTimeout(init, 100);
        }
      }, 100);
      return;
    }

    // 위시리스트 불러오기
    loadWishlist();
  }

  // DOM 로드 후 실행
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

