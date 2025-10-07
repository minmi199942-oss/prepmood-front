// wishlist-script.js - 위시리스트 페이지 스크립트

(function() {
  'use strict';

  // 로그인 상태 확인
  function isLoggedIn() {
    return sessionStorage.getItem('userLoggedIn') === 'true';
  }

  // 로그인 체크
  function checkLogin() {
    if (!isLoggedIn()) {
      alert('로그인이 필요한 서비스입니다.');
      window.location.href = 'login.html';
      return false;
    }
    return true;
  }

  // 카탈로그 데이터에서 상품 ID로 상품 찾기
  function findProductById(id) {
    if (!window.CATALOG_DATA) return null;

    for (const gender in window.CATALOG_DATA) {
      for (const category in window.CATALOG_DATA[gender]) {
        for (const type in window.CATALOG_DATA[gender][category]) {
          const products = window.CATALOG_DATA[gender][category][type];
          const found = products.find(p => p.id === id);
          if (found) return found;
        }
      }
    }
    return null;
  }

  // 위시리스트 불러오기
  async function loadWishlist() {
    const loadingState = document.getElementById('loading-state');
    const emptyState = document.getElementById('empty-state');
    const wishlistGrid = document.getElementById('wishlist-grid');
    const wishlistCountSpan = document.getElementById('wishlist-count');

    try {
      const userEmail = sessionStorage.getItem('userEmail');

      const response = await fetch('http://localhost:3000/api/wishlist', {
        method: 'GET',
        headers: {
          'X-User-Email': userEmail
        },
        credentials: 'include'
      });

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
      console.error('위시리스트 불러오기 오류:', error);
      loadingState.style.display = 'none';
      emptyState.style.display = 'flex';
      
      const emptyTitle = emptyState.querySelector('.empty-title');
      const emptyDescription = emptyState.querySelector('.empty-description');
      emptyTitle.textContent = '오류가 발생했습니다';
      emptyDescription.innerHTML = '위시리스트를 불러올 수 없습니다.<br>나중에 다시 시도해주세요.';
    }
  }

  // 위시리스트 상품 표시
  function displayWishlistProducts(wishlists) {
    const wishlistGrid = document.getElementById('wishlist-grid');
    wishlistGrid.innerHTML = '';

    wishlists.forEach(item => {
      const product = findProductById(item.product_id);

      if (!product) {
        console.warn(`상품을 찾을 수 없습니다: ${item.product_id}`);
        return;
      }

      // 상품 카드 생성
      const card = document.createElement('div');
      card.className = 'wishlist-card';
      card.innerHTML = `
        <a href="buy.html?id=${product.id}" class="wishlist-card-link">
          <div class="wishlist-card-image-wrapper">
            <img src="${product.image}" alt="${escapeHtml(product.name)}" class="wishlist-card-image">
          </div>
          <div class="wishlist-card-info">
            <h3 class="wishlist-card-title">${escapeHtml(product.name)}</h3>
            <p class="wishlist-card-price">${formatPrice(product.price)}</p>
            <p class="wishlist-card-date">추가일: ${formatDate(item.added_at)}</p>
          </div>
        </a>
        <button class="wishlist-remove-btn" data-product-id="${product.id}" aria-label="위시리스트에서 제거">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      `;

      wishlistGrid.appendChild(card);
    });

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
      const userEmail = sessionStorage.getItem('userEmail');

      const response = await fetch('http://localhost:3000/api/wishlist/toggle', {
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
      console.error('위시리스트 제거 오류:', error);
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

  // HTML 이스케이프
  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  // 초기화
  function init() {
    // 로그인 체크
    if (!checkLogin()) {
      return;
    }

    // 카탈로그 데이터 로드 대기
    if (typeof window.CATALOG_DATA === 'undefined') {
      setTimeout(init, 100);
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

