// buy-script.js - 제품 상세 페이지 스크립트

(function() {
  'use strict';

  // API 기본 URL 설정 (환경에 따라 자동 변경)
  const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'https://prepmood.kr/api'  // 로컬 개발 시에도 프로덕션 API 사용
    : 'https://prepmood.kr/api';  // 프로덕션

  // URL에서 제품 ID 가져오기
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id');

  let currentProduct = null;
  let selectedSize = '';
  let selectedColor = '';

  // 제품 데이터에서 ID로 제품 찾기
  function findProductById(id) {
    console.log('🔍 제품 검색 시작:', id);
    console.log('📦 CATALOG_DATA 상태:', window.CATALOG_DATA);
    
    if (!window.CATALOG_DATA) {
      console.log('❌ CATALOG_DATA가 없습니다');
      return null;
    }

    // 직접 카테고리 구조로 검색
    for (const category in window.CATALOG_DATA) {
      for (const type in window.CATALOG_DATA[category]) {
        const products = window.CATALOG_DATA[category][type];
        console.log(`🔍 ${category}.${type} 검색 중:`, products.length, '개 제품');
        const found = products.find(p => p.id === id);
        if (found) {
          console.log('✅ 제품 찾음:', found);
          return found;
        }
      }
    }
    
    console.log('❌ 제품을 찾을 수 없습니다:', id);
    return null;
  }

  // 제품 정보 표시
  function displayProductInfo(product) {
    if (!product) {
      document.getElementById('product-name').textContent = '제품을 찾을 수 없습니다';
      return;
    }

    currentProduct = product;

    // 제품명
    document.getElementById('product-name').textContent = product.name;

    // 제품 코드 (ID 기반) - PM-25-M-BP-001 형식
    document.getElementById('product-code').textContent = `상품번호: PM-25-${product.id.toUpperCase()}`;

          // 가격 (상품명 아래와 장바구니 버튼에 표시)
      const formattedPrice = new Intl.NumberFormat('ko-KR', {
        style: 'currency',
        currency: 'KRW',
        maximumFractionDigits: 0
      }).format(product.price);
      
      document.getElementById('product-price').textContent = formattedPrice;
      document.getElementById('cart-btn-price').textContent = formattedPrice;

    // 이미지 표시 (여러 장 시뮬레이션)
    displayProductImages(product);

    // 색상 옵션 생성
    generateColorOptions();
  }

  // 제품 이미지 표시 (같은 이미지 3장 반복)
  function displayProductImages(product) {
    const imagesWrapper = document.getElementById('product-images');
    imagesWrapper.innerHTML = '';

    // 3개의 이미지 생성 (실제로는 같은 이미지)
    for (let i = 0; i < 3; i++) {
      const imgElement = document.createElement('img');
      imgElement.src = `image/${product.image}`;
      imgElement.alt = `${product.name} - 이미지 ${i + 1}`;
      imgElement.className = 'product-image';
      imagesWrapper.appendChild(imgElement);
    }
  }

  // 색상 옵션 생성 (가상 데이터)
  function generateColorOptions() {
    const colorSelect = document.getElementById('color-select');
    const colors = [
      { value: 'black', label: '블랙' },
      { value: 'white', label: '화이트' },
      { value: 'gray', label: '그레이' },
      { value: 'navy', label: '네이비' }
    ];

    colors.forEach(color => {
      const option = document.createElement('option');
      option.value = color.value;
      option.textContent = color.label;
      colorSelect.appendChild(option);
    });
  }

  // 에러 메시지 표시
  function showErrorMessage(elementId, message) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }
  }

  // 에러 메시지 초기화
  function clearErrorMessages() {
    const sizeError = document.getElementById('size-error');
    const colorError = document.getElementById('color-error');
    
    if (sizeError) sizeError.style.display = 'none';
    if (colorError) colorError.style.display = 'none';
  }

  // 옵션 선택 감지
  function handleOptionChange() {
    const sizeSelect = document.getElementById('size-select');
    const colorSelect = document.getElementById('color-select');
    const cartBtn = document.getElementById('cart-btn');
    const quickBuyBtn = document.getElementById('quick-buy-btn');

    selectedSize = sizeSelect.value;
    selectedColor = colorSelect.value;

    // 옵션이 선택되면 에러 메시지 숨기기
    if (selectedSize) {
      const sizeError = document.getElementById('size-error');
      if (sizeError) sizeError.style.display = 'none';
    }
    
    if (selectedColor) {
      const colorError = document.getElementById('color-error');
      if (colorError) colorError.style.display = 'none';
    }

    // 버튼을 항상 활성화 (에러 메시지는 addToCart에서 처리)
    cartBtn.disabled = false;
    quickBuyBtn.disabled = false;
    cartBtn.classList.add('enabled');
    quickBuyBtn.classList.add('enabled');
    
    Logger.log('옵션 변경됨:', { selectedSize, selectedColor });
  }

  // 색상 변경 시 이미지 변경 (시뮬레이션)
  function handleColorChange() {
    const colorSelect = document.getElementById('color-select');
    selectedColor = colorSelect.value;

    // 실제로는 색상별 이미지가 있어야 하지만, 현재는 같은 이미지 사용
    // 추후 색상별 이미지 데이터 구조 확장 필요
    Logger.log(`선택된 색상: ${selectedColor}`);
    
    handleOptionChange();
  }

  // 장바구니 추가
  function addToCart() {
    Logger.log('🛒 addToCart 함수 호출됨!');
    Logger.log('현재 상태:', {
      currentProduct: !!currentProduct,
      selectedSize: selectedSize,
      selectedColor: selectedColor
    });
    
    // 제품이 없는 경우
    if (!currentProduct) {
      Logger.log('❌ 제품 정보 없음');
      alert('제품 정보를 불러올 수 없습니다.');
      return;
    }

    // 에러 메시지 초기화
    clearErrorMessages();

    // 사이즈와 색상 선택 검증
    if (!selectedSize && !selectedColor) {
      Logger.log('❌ 사이즈와 색상 모두 선택 안 함');
      showErrorMessage('size-error', '하나 이상의 사이즈를 선택해야합니다.');
      return;
    } else if (!selectedSize) {
      Logger.log('❌ 사이즈 선택 안 함');
      showErrorMessage('size-error', '하나 이상의 사이즈를 선택해야합니다.');
      return;
    } else if (!selectedColor) {
      Logger.log('❌ 색상 선택 안 함');
      showErrorMessage('color-error', '하나 이상의 색상을 선택해야합니다.');
      return;
    }

    // MiniCart API를 사용하여 장바구니에 추가
    const productToAdd = {
      id: currentProduct.id,
      name: currentProduct.name,
      price: currentProduct.price,
      image: currentProduct.image,
      size: selectedSize,
      color: selectedColor
    };

    // miniCart 인스턴스가 있는지 확인
    if (window.miniCart) {
      window.miniCart.addToCart(productToAdd);
      Logger.log('✅ 장바구니에 추가됨:', productToAdd);
      
      // 미니 카트 열기
      window.miniCart.toggleMiniCart();
      
      // 성공 메시지 (알림 대신 미니 카트로 표시)
      Logger.log(`장바구니에 추가되었습니다.\n제품: ${currentProduct.name}\n사이즈: ${selectedSize}\n색상: ${selectedColor}`);
    } else {
      console.error('❌ MiniCart가 초기화되지 않았습니다!');
      alert('장바구니를 사용할 수 없습니다. 페이지를 새로고침해주세요.');
      return;
    }
  }

  // 빠른 구매
  function quickBuy() {
    if (!currentProduct || !selectedSize || !selectedColor) {
      alert('사이즈와 색상을 선택해주세요.');
      return;
    }

    // 장바구니에 추가하고 결제 페이지로 이동
    addToCart();
    
    // 추후 결제 페이지 구현 시 주석 해제
    // window.location.href = 'checkout.html';
    
    alert('빠른 구매 기능은 준비 중입니다.\n장바구니에 추가되었습니다.');
  }

  // 로그인 상태 확인 (JWT 기반) - 401 오류 처리 개선
  async function isLoggedIn() {
    try {
      const response = await fetch('https://prepmood.kr/api/auth/me', {
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
      // 네트워크 오류나 기타 오류는 로그인하지 않은 것으로 처리
      return false;
    }
  }

  // 사용자 이메일 가져오기 (JWT 기반) - 401 오류 처리 개선
  async function getUserEmail() {
    try {
      const response = await fetch('https://prepmood.kr/api/auth/me', {
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

  // 위시리스트 토글 (API 연동)
  async function toggleWishlist() {
    if (!currentProduct) return;

    // 로그인 체크
    if (!(await isLoggedIn())) {
      if (confirm('로그인이 필요한 서비스입니다.\n로그인 페이지로 이동하시겠습니까?')) {
        window.location.href = 'login.html';
      }
      return;
    }

    const wishlistBtn = document.getElementById('wishlist-btn');
    const isActive = wishlistBtn.classList.contains('active');

    try {
      // 사용자 이메일 가져오기 (JWT에서 추출)
      const userEmail = await getUserEmail();
      
      // API 호출
      const response = await fetch(`${API_BASE_URL}/wishlist/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': userEmail
        },
        credentials: 'include', // 쿠키 포함
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

  // 위시리스트 상태 확인 (API 연동)
  async function checkWishlistStatus() {
    if (!currentProduct || !(await isLoggedIn())) return;

    try {
      const userEmail = await getUserEmail();
      
      const response = await fetch(`${API_BASE_URL}/wishlist/check?productId=${currentProduct.id}`, {
        method: 'GET',
        headers: {
          'X-User-Email': userEmail
        },
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success && data.isInWishlist) {
        document.getElementById('wishlist-btn').classList.add('active');
      }
    } catch (error) {
      console.error('위시리스트 상태 확인 오류:', error);
    }
  }

  // 탭 전환 기능
  function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const targetTab = button.dataset.tab;

        // 모든 탭 버튼과 패널에서 active 제거
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabPanes.forEach(pane => pane.classList.remove('active'));

        // 클릭한 탭 버튼과 해당 패널에 active 추가
        button.classList.add('active');
        document.getElementById(`tab-${targetTab}`).classList.add('active');
      });
    });
  }

  // 초기화
  function init() {
    console.log('🚀 buy-script 초기화 시작');
    console.log('📦 CATALOG_DATA 상태:', typeof window.CATALOG_DATA, window.productsLoaded);
    
    // 제품 데이터 로드 대기
    if (typeof window.CATALOG_DATA === 'undefined' || !window.productsLoaded) {
      console.log('⏳ 제품 데이터 로드 대기 중...');
      // productsLoaded 이벤트를 기다림
      window.addEventListener('productsLoaded', init);
      window.addEventListener('productsLoadError', () => {
        console.error('❌ 제품 데이터 로드 실패');
        document.getElementById('product-name').textContent = '제품 데이터를 불러올 수 없습니다';
      });
      return;
    }

    console.log('✅ 제품 데이터 로드 완료, 제품 검색 시작');
    
    // 제품 정보 표시
    const product = findProductById(productId);
    displayProductInfo(product);

    // 위시리스트 상태 확인
    checkWishlistStatus();

    // 이벤트 리스너 등록
    document.getElementById('size-select').addEventListener('change', handleOptionChange);
    document.getElementById('color-select').addEventListener('change', handleColorChange);
    document.getElementById('cart-btn').addEventListener('click', addToCart);
    document.getElementById('quick-buy-btn').addEventListener('click', quickBuy);
    document.getElementById('wishlist-btn').addEventListener('click', toggleWishlist);

    // 탭 초기화
    initTabs();
  }

  // DOM 로드 후 실행
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
