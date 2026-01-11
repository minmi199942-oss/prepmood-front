// buy-script.js - 제품 상세 페이지 스크립트

(function() {
  'use strict';

  // API 기본 URL 설정 (환경에 따라 자동 변경)
  const API_BASE_URL = (window.API_BASE)
    ? window.API_BASE
    : ((window.location && window.location.origin)
        ? window.location.origin.replace(/\/$/, '') + '/api'
        : '/api');

  // URL에서 제품 ID 가져오기
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id');

  let currentProduct = null;
  let selectedSize = '';
  let selectedColor = '';

  // 제품 데이터에서 ID로 제품 찾기
  function findProductById(id) {
    if (!window.CATALOG_DATA) {
      if (window.Logger) {
        window.Logger.error('CATALOG_DATA가 없습니다');
      }
      return null;
    }

    // 직접 카테고리 구조로 검색
    for (const category in window.CATALOG_DATA) {
      for (const type in window.CATALOG_DATA[category]) {
        const products = window.CATALOG_DATA[category][type];
        const found = products.find(p => p.id === id);
        if (found) {
          return found;
        }
      }
    }
    
    if (window.Logger) {
      window.Logger.warn('제품을 찾을 수 없습니다:', id);
    }
    return null;
  }

  // 제품 정보 표시
  async function displayProductInfo(product) {
    if (!product) {
      document.getElementById('product-name').textContent = '제품을 찾을 수 없습니다';
      return;
    }

    currentProduct = product;

    // 제품명
    document.getElementById('product-name').textContent = product.name;

    // 제품 코드 (ID 기반) - PM-25-M-BP-001 형식
    document.getElementById('product-code').textContent = `상품번호: PM-25-${product.id.toUpperCase()}`;

          // 가격 (장바구니 버튼에 표시)
      const formattedPrice = new Intl.NumberFormat('ko-KR', {
        style: 'currency',
        currency: 'KRW',
        maximumFractionDigits: 0
      }).format(product.price);
      
      document.getElementById('cart-btn-price').textContent = formattedPrice;

    // 이미지 표시 (여러 장 시뮬레이션)
    displayProductImages(product);

    // 실제 재고 데이터에서 색상/사이즈 옵션 가져오기
    try {
      const response = await fetch(`${API_BASE_URL}/products/${product.id}/options`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.options) {
          // 실제 재고 기반 옵션 생성
          generateSizeOptionsFromAPI(product, data.options.sizes);
          generateColorOptionsFromAPI(data.options.colors);
          return;
        }
      }
    } catch (error) {
      if (window.Logger) {
        window.Logger.warn('상품 옵션 조회 실패, 기본 옵션 사용:', error.message);
      }
    }

    // API 조회 실패 시 기존 방식 사용 (하위 호환성)
    generateSizeOptions(product);
    generateColorOptions();
  }

  // 제품 ID에서 사이즈 정보 추출
  function extractSizesFromProductId(productId) {
    if (!productId) return [];

    // 제품 ID의 마지막 부분에서 사이즈 정보 추출
    // 예: PM-25-SH-Teneu-Solid-LB-S/M/L → S/M/L
    // 예: PM-25-TOP-Solid-Suit-Bustier-BK/GY-F → F
    // 예: PM-25-Outer-LeStripe-Suit-NV-S/L → S/L
    // 예: PM-25-Outer-London-Liberty-Toile-BK-S/L → S/L
    const parts = productId.split('-');
    const lastPart = parts[parts.length - 1];

    const validSizes = ['S', 'M', 'L', 'XL', 'XXL', 'F'];
    const sizes = [];

    // 마지막 부분이 F로 끝나는 경우 (예: BK/GY-F)
    if (lastPart.endsWith('F') && !lastPart.endsWith('TF')) {
      // F 앞에 하이픈이나 슬래시가 있는지 확인
      if (lastPart.includes('-F') || lastPart.endsWith('/F')) {
        sizes.push('F');
        return sizes;
      } else if (lastPart === 'F') {
        return ['F'];
      }
    }

    // 마지막 부분을 하이픈과 슬래시로 분리하여 사이즈 찾기
    // 예: BK/GY-F → ['BK', 'GY', 'F']
    // 예: NV-S/L → ['NV', 'S', 'L']
    // 예: S/M/L → ['S', 'M', 'L']
    const allParts = lastPart.split(/[-/]/);
    
    allParts.forEach(part => {
      const trimmed = part.trim().toUpperCase();
      if (validSizes.includes(trimmed)) {
        sizes.push(trimmed);
      }
    });

    // 중복 제거 및 정렬
    const uniqueSizes = [...new Set(sizes)];
    const sizeOrder = ['S', 'M', 'L', 'XL', 'XXL', 'F'];
    uniqueSizes.sort((a, b) => {
      return sizeOrder.indexOf(a) - sizeOrder.indexOf(b);
    });

    return uniqueSizes;
  }

  // 사이즈 옵션 생성
  function generateSizeOptions(product) {
    if (!product || !product.id) return;

    const sizeSelect = document.getElementById('size-select');
    const sizeOptionGroup = sizeSelect ? sizeSelect.closest('.option-group') : null;
    
    if (!sizeSelect || !sizeOptionGroup) return;

    // 제품 ID에서 사이즈 추출
    const availableSizes = extractSizesFromProductId(product.id);

    // 카테고리 확인 (액세서리는 사이즈 선택 제외)
    const productIdLower = product.id.toLowerCase();
    const isAccessory = product.category === 'accessories' || 
                        productIdLower.includes('acc-') ||
                        productIdLower.startsWith('pm-25-acc-');

    // 사이즈가 없거나 액세서리인 경우 사이즈 선택 필드 숨기기
    if (availableSizes.length === 0 || isAccessory) {
      sizeOptionGroup.style.display = 'none';
      // 액세서리의 경우 사이즈를 'Free'로 자동 설정
      selectedSize = 'Free';
      return;
    }

    // 사이즈 선택 필드 표시
    sizeOptionGroup.style.display = 'block';

    // 기본 옵션만 남기고 나머지 제거
    sizeSelect.innerHTML = '<option value="">사이즈를 선택해주세요</option>';

    // 추출된 사이즈로 옵션 생성
    availableSizes.forEach(size => {
      const option = document.createElement('option');
      option.value = size;
      option.textContent = size === 'F' ? 'Free' : size;
      sizeSelect.appendChild(option);
    });
  }

  // 제품 이미지 표시 (같은 이미지 3장 반복)
  function displayProductImages(product) {
    const imagesWrapper = document.getElementById('product-images');
    imagesWrapper.innerHTML = '';

    // 이미지 경로 처리: /uploads/products/로 시작하면 그대로 사용, 아니면 /image/ 추가
    let imageSrc = product.image || '';
    if (imageSrc.startsWith('/uploads/')) {
      // 업로드된 이미지 (새로 추가/수정된 이미지)
      imageSrc = imageSrc;
    } else if (imageSrc.startsWith('/image/')) {
      // 기존 이미지 경로
      imageSrc = imageSrc;
    } else if (imageSrc) {
      // 상대 경로인 경우 (기존 이미지 파일명만 있는 경우)
      imageSrc = imageSrc.startsWith('image/') ? '/' + imageSrc : '/image/' + imageSrc;
    } else {
      // 이미지가 없는 경우 기본 이미지
      imageSrc = '/image/shirt.jpg';
    }

    // 3개의 이미지 생성 (실제로는 같은 이미지)
    for (let i = 0; i < 3; i++) {
      const imgElement = document.createElement('img');
      imgElement.src = imageSrc;
      imgElement.alt = `${product.name} - 이미지 ${i + 1}`;
      imgElement.className = 'product-image';
      imagesWrapper.appendChild(imgElement);
    }
  }

  // 색상 옵션 생성 (가상 데이터 - 하위 호환성용)
  function generateColorOptions() {
    const colorSelect = document.getElementById('color-select');
    if (!colorSelect) return;
    
    const colors = [
      { value: 'Black', label: '블랙' },
      { value: 'White', label: '화이트' },
      { value: 'Grey', label: '그레이' },
      { value: 'Navy', label: '네이비' }
    ];

    colors.forEach(color => {
      const option = document.createElement('option');
      option.value = color.value;
      option.textContent = color.label;
      colorSelect.appendChild(option);
    });
  }

  // 색상 옵션 생성 (API 데이터 사용)
  function generateColorOptionsFromAPI(colors) {
    const colorSelect = document.getElementById('color-select');
    if (!colorSelect || !colors || colors.length === 0) {
      // 색상이 없으면 기본 색상 사용
      generateColorOptions();
      return;
    }

    // 기본 옵션만 남기고 나머지 제거
    colorSelect.innerHTML = '<option value="">색상을 선택해주세요</option>';

    // 색상 표시명 매핑
    const colorLabelMap = {
      'Black': '블랙',
      'Navy': '네이비',
      'White': '화이트',
      'Grey': '그레이',
      'Light Blue': '라이트 블루',
      'Light Grey': '라이트 그레이'
    };

    // API에서 받은 색상으로 옵션 생성
    colors.forEach(color => {
      const option = document.createElement('option');
      option.value = color; // DB에 저장된 표준값 사용
      option.textContent = colorLabelMap[color] || color; // 표시명이 있으면 사용, 없으면 원본
      colorSelect.appendChild(option);
    });
  }

  // 사이즈 옵션 생성 (API 데이터 사용)
  function generateSizeOptionsFromAPI(product, sizes) {
    if (!product || !product.id) return;

    const sizeSelect = document.getElementById('size-select');
    const sizeOptionGroup = sizeSelect ? sizeSelect.closest('.option-group') : null;
    
    if (!sizeSelect || !sizeOptionGroup) return;

    // 카테고리 확인 (액세서리는 사이즈 선택 제외)
    const productIdLower = product.id.toLowerCase();
    const isAccessory = product.category === 'accessories' || 
                        productIdLower.includes('acc-') ||
                        productIdLower.startsWith('pm-25-acc-');

    // 사이즈가 없거나 액세서리인 경우 사이즈 선택 필드 숨기기
    if (!sizes || sizes.length === 0 || isAccessory) {
      sizeOptionGroup.style.display = 'none';
      // 액세서리의 경우 사이즈를 'Free'로 자동 설정
      selectedSize = 'Free';
      return;
    }

    // 사이즈 선택 필드 표시
    sizeOptionGroup.style.display = 'block';

    // 기본 옵션만 남기고 나머지 제거
    sizeSelect.innerHTML = '<option value="">사이즈를 선택해주세요</option>';

    // API에서 받은 사이즈로 옵션 생성
    sizes.forEach(size => {
      const option = document.createElement('option');
      option.value = size;
      option.textContent = size === 'F' ? 'Free' : size;
      sizeSelect.appendChild(option);
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
  }

  // 색상 변경 시 이미지 변경 (시뮬레이션)
  function handleColorChange() {
    const colorSelect = document.getElementById('color-select');
    selectedColor = colorSelect.value;

    // 실제로는 색상별 이미지가 있어야 하지만, 현재는 같은 이미지 사용
    // 추후 색상별 이미지 데이터 구조 확장 필요
    handleOptionChange();
  }

  // 장바구니 추가
  async function addToCart() {
    // 제품이 없는 경우
    if (!currentProduct) {
      if (window.Logger) {
        window.Logger.error('제품 정보 없음');
      }
      alert('제품 정보를 불러올 수 없습니다.');
      return false;
    }

    // 에러 메시지 초기화
    clearErrorMessages();

    // 제품 카테고리 확인 (액세서리 체크)
    const isAccessory = currentProduct.category === 'accessories' || 
                        currentProduct.id.toLowerCase().includes('acc-') ||
                        currentProduct.id.toLowerCase().startsWith('pm-25-acc-');

    // 사이즈와 색상 선택 검증 (액세서리는 사이즈 검증 제외)
    if (!isAccessory && !selectedSize) {
      showErrorMessage('size-error', '사이즈를 선택해야합니다.');
      return false;
    }
    
    if (!selectedColor) {
      showErrorMessage('color-error', '색상을 선택해야합니다.');
      return false;
    }
    
    // 액세서리의 경우 사이즈를 'Free'로 자동 설정
    if (isAccessory && !selectedSize) {
      selectedSize = 'Free';
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
      const added = await window.miniCart.addToCart(productToAdd);
      if (added) {
        // 미니 카트 열기
        window.miniCart.toggleMiniCart();
        return true;
      }
      return false;
    } else {
      if (window.Logger) {
        window.Logger.error('MiniCart가 초기화되지 않았습니다');
      } else {
        console.error('❌ MiniCart가 초기화되지 않았습니다!');
      }
      alert('장바구니를 사용할 수 없습니다. 페이지를 새로고침해주세요.');
      return false;
    }
  }

  // 빠른 구매
  async function quickBuy() {
    // 액세서리 체크
    const isAccessory = currentProduct && (
      currentProduct.category === 'accessories' || 
      currentProduct.id.toLowerCase().includes('acc-') ||
      currentProduct.id.toLowerCase().startsWith('pm-25-acc-')
    );

    if (!currentProduct || (!isAccessory && !selectedSize) || !selectedColor) {
      alert('사이즈와 색상을 선택해주세요.');
      return;
    }

    // 로그인 상태 확인
    if (!(await isLoggedIn())) {
      alert('로그인이 필요한 서비스입니다.\n로그인 페이지로 이동합니다.');
      window.location.href = 'login.html';
      return;
    }

    // 장바구니에 추가하고 결제 페이지로 이동
    const added = await addToCart();
    
    if (added) {
      if (window.miniCart && typeof window.miniCart.closeMiniCart === 'function') {
        window.miniCart.closeMiniCart();
      }
      window.location.href = 'checkout.html';
    }
  }

  // 로그인 상태 확인 (JWT 기반) - 401 오류 처리 개선
  async function isLoggedIn() {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
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
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
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
  // 위시리스트 이미지 업데이트 함수
  function updateWishlistImage(isActive) {
    const wishlistIcon = document.querySelector('#wishlist-btn .wishlist-icon');
    if (wishlistIcon) {
      wishlistIcon.src = isActive ? 'image/fullwishlist.jpg' : 'image/wishlist.jpg';
    }
  }

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
          updateWishlistImage(true);
          alert('위시리스트에 추가되었습니다.');
        } else {
          wishlistBtn.classList.remove('active');
          updateWishlistImage(false);
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
        const wishlistBtn = document.getElementById('wishlist-btn');
        wishlistBtn.classList.add('active');
        updateWishlistImage(true);
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
  async function init() {
    // 제품 데이터 로드 대기
    if (typeof window.CATALOG_DATA === 'undefined' || !window.productsLoaded) {
      // productsLoaded 이벤트를 기다림
      window.addEventListener('productsLoaded', init);
      window.addEventListener('productsLoadError', () => {
        if (window.Logger) {
          window.Logger.error('제품 데이터 로드 실패');
        }
        const productNameEl = document.getElementById('product-name');
        if (productNameEl) {
          productNameEl.textContent = '제품 데이터를 불러올 수 없습니다';
        }
      });
      return;
    }
    
    // 제품 정보 표시
    const product = findProductById(productId);
    await displayProductInfo(product);

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
