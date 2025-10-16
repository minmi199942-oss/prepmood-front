// ====================================
// 상품 상세 페이지 스크립트
// ====================================

// API 엔드포인트 설정
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'https://prepmood.kr/api'
  : 'https://prepmood.kr/api';

let currentProduct = null;

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', () => {
  loadProductDetails();
  initializeEventListeners();
});

// URL에서 상품 ID 가져오기
function getProductIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

// 상품 상세 정보 로드 (간단 버전)
function loadProductDetails() {
  const urlParams = new URLSearchParams(window.location.search);
  
  // URL 파라미터에서 상품 정보 가져오기
  const productData = {
    id: urlParams.get('id'),
    name: urlParams.get('name'),
    price: parseInt(urlParams.get('price')),
    image: urlParams.get('image'),
    category: urlParams.get('category'),
    type: urlParams.get('type'),
    description: `${urlParams.get('name')}입니다. 고품질 소재로 제작된 프리미엄 상품입니다.`
  };

  if (!productData.id) {
    alert('상품 정보를 찾을 수 없습니다.');
    window.location.href = 'catalog.html';
    return;
  }

  currentProduct = productData;
  displayProductDetails(productData);
  checkWishlistStatus();
}

// 상품 상세 정보 표시
function displayProductDetails(product) {
  // 상품명
  document.getElementById('product-name').textContent = product.name;
  document.getElementById('product-code').textContent = product.id;

  // 이미지
  const imagesContainer = document.getElementById('product-images');
  imagesContainer.innerHTML = `
    <img src="${product.image || 'image/placeholder.jpg'}" alt="${product.name}" class="product-main-image" onerror="this.src='image/placeholder.jpg'">
  `;

  // 가격
  document.getElementById('cart-btn-price').textContent = `₩${product.price.toLocaleString()}`;

  // 설명
  if (product.description) {
    document.getElementById('product-description').textContent = product.description;
  }

  // 옵션 활성화
  const sizeSelect = document.getElementById('size-select');
  const colorSelect = document.getElementById('color-select');
  
  if (sizeSelect && colorSelect) {
    sizeSelect.disabled = false;
    colorSelect.disabled = false;
  }
}

// 이벤트 리스너 초기화
function initializeEventListeners() {
  // 옵션 선택 시 버튼 활성화
  const sizeSelect = document.getElementById('size-select');
  const colorSelect = document.getElementById('color-select');
  const cartBtn = document.getElementById('cart-btn');
  const quickBuyBtn = document.getElementById('quick-buy-btn');

  function updateButtonState() {
    const sizeSelected = sizeSelect.value !== '';
    const colorSelected = colorSelect.value !== '';
    
    if (sizeSelected && colorSelected) {
      cartBtn.disabled = false;
      quickBuyBtn.disabled = false;
    } else {
      cartBtn.disabled = true;
      quickBuyBtn.disabled = true;
    }
  }

  if (sizeSelect) {
    sizeSelect.addEventListener('change', updateButtonState);
  }

  if (colorSelect) {
    colorSelect.addEventListener('change', updateButtonState);
  }

  // 장바구니 버튼
  if (cartBtn) {
    cartBtn.addEventListener('click', addToCart);
  }

  // 빠른 구매 버튼
  if (quickBuyBtn) {
    quickBuyBtn.addEventListener('click', quickBuy);
  }

  // 위시리스트 버튼
  const wishlistBtn = document.getElementById('wishlist-btn');
  if (wishlistBtn) {
    wishlistBtn.addEventListener('click', toggleWishlist);
  }

  // 탭 전환
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      switchTab(tabName);
    });
  });
}

// 장바구니 추가
async function addToCart() {
  if (!currentProduct) return;

  // 로그인 체크
  if (!isLoggedIn()) {
    if (confirm('로그인이 필요한 서비스입니다.\n로그인 페이지로 이동하시겠습니까?')) {
      window.location.href = 'login.html';
    }
    return;
  }

  const sizeSelect = document.getElementById('size-select');
  const colorSelect = document.getElementById('color-select');

  const size = sizeSelect.value;
  const color = colorSelect.value;

  if (!size || !color) {
    alert('사이즈와 색상을 선택해주세요.');
    return;
  }

  try {
    const userEmail = sessionStorage.getItem('userEmail');

    const response = await fetch(`${API_BASE_URL}/cart/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': userEmail
      },
      credentials: 'include',
      body: JSON.stringify({
        productId: currentProduct.id,
        quantity: 1,
        size: size,
        color: color
      })
    });

    const data = await response.json();

    if (data.success) {
      alert('장바구니에 추가되었습니다.');
      
      // 헤더의 장바구니 개수 업데이트
      if (typeof window.updateCartCount === 'function') {
        window.updateCartCount();
      }

      // 장바구니 페이지로 이동할지 물어보기
      if (confirm('장바구니로 이동하시겠습니까?')) {
        window.location.href = 'cart.html';
      }
    } else {
      alert(data.message || '장바구니 추가에 실패했습니다.');
    }
  } catch (error) {
    console.error('장바구니 추가 오류:', error);
    alert('서버와의 통신에 실패했습니다.');
  }
}

// 빠른 구매
function quickBuy() {
  if (!currentProduct) return;

  // 로그인 체크
  if (!isLoggedIn()) {
    if (confirm('로그인이 필요한 서비스입니다.\n로그인 페이지로 이동하시겠습니까?')) {
      window.location.href = 'login.html';
    }
    return;
  }

  // TODO: 주문 페이지로 이동
  alert('빠른 구매 기능은 아직 구현되지 않았습니다.');
}

// 위시리스트 토글
async function toggleWishlist() {
  if (!currentProduct) return;

  // 로그인 체크
  if (!isLoggedIn()) {
    if (confirm('로그인이 필요한 서비스입니다.\n로그인 페이지로 이동하시겠습니까?')) {
      window.location.href = 'login.html';
    }
    return;
  }

  const wishlistBtn = document.getElementById('wishlist-btn');
  const isActive = wishlistBtn.classList.contains('active');

  try {
    const userEmail = sessionStorage.getItem('userEmail');

    const response = await fetch(`${API_BASE_URL}/wishlist/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': userEmail
      },
      credentials: 'include',
      body: JSON.stringify({
        productId: currentProduct.id
      })
    });

    const data = await response.json();

    if (data.success) {
      if (data.action === 'added') {
        wishlistBtn.classList.add('active');
        alert('위시리스트에 추가되었습니다.');
      } else {
        wishlistBtn.classList.remove('active');
        alert('위시리스트에서 제거되었습니다.');
      }
    } else {
      alert(data.message || '위시리스트 처리에 실패했습니다.');
    }
  } catch (error) {
    console.error('위시리스트 토글 오류:', error);
    alert('서버와의 통신에 실패했습니다.');
  }
}

// 위시리스트 상태 확인
async function checkWishlistStatus() {
  if (!currentProduct || !isLoggedIn()) return;

  try {
    const userEmail = sessionStorage.getItem('userEmail');

    const response = await fetch(`${API_BASE_URL}/wishlist`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': userEmail
      },
      credentials: 'include'
    });

    const data = await response.json();

    if (data.success) {
      const wishlistBtn = document.getElementById('wishlist-btn');
      const isInWishlist = data.items.some(item => item.product_id === currentProduct.id);
      
      if (isInWishlist) {
        wishlistBtn.classList.add('active');
      }
    }
  } catch (error) {
    console.error('위시리스트 상태 확인 오류:', error);
  }
}

// 로그인 상태 확인
function isLoggedIn() {
  const userEmail = sessionStorage.getItem('userEmail');
  return !!userEmail;
}

// 탭 전환
function switchTab(tabName) {
  // 모든 탭 버튼과 내용 비활성화
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabBtns.forEach(btn => btn.classList.remove('active'));
  tabPanes.forEach(pane => pane.classList.remove('active'));

  // 선택된 탭 활성화
  const selectedBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  const selectedPane = document.getElementById(`tab-${tabName}`);

  if (selectedBtn) selectedBtn.classList.add('active');
  if (selectedPane) selectedPane.classList.add('active');
}
