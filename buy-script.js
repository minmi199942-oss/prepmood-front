// buy-script.js - 제품 상세 페이지 스크립트

(function() {
  'use strict';

  // URL에서 제품 ID 가져오기
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id');

  let currentProduct = null;
  let selectedSize = '';
  let selectedColor = '';

  // 제품 데이터에서 ID로 제품 찾기
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

    // 가격 (장바구니 버튼에만 표시)
    const formattedPrice = new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0
    }).format(product.price);
    
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
      imgElement.src = product.image;
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

  // 옵션 선택 감지
  function handleOptionChange() {
    const sizeSelect = document.getElementById('size-select');
    const colorSelect = document.getElementById('color-select');
    const cartBtn = document.getElementById('cart-btn');
    const quickBuyBtn = document.getElementById('quick-buy-btn');

    selectedSize = sizeSelect.value;
    selectedColor = colorSelect.value;

    // 사이즈와 색상이 모두 선택되면 버튼 활성화
    if (selectedSize && selectedColor) {
      cartBtn.disabled = false;
      quickBuyBtn.disabled = false;
      cartBtn.classList.add('enabled');
      quickBuyBtn.classList.add('enabled');
    } else {
      cartBtn.disabled = true;
      quickBuyBtn.disabled = true;
      cartBtn.classList.remove('enabled');
      quickBuyBtn.classList.remove('enabled');
    }
  }

  // 색상 변경 시 이미지 변경 (시뮬레이션)
  function handleColorChange() {
    const colorSelect = document.getElementById('color-select');
    selectedColor = colorSelect.value;

    // 실제로는 색상별 이미지가 있어야 하지만, 현재는 같은 이미지 사용
    // 추후 색상별 이미지 데이터 구조 확장 필요
    console.log(`선택된 색상: ${selectedColor}`);
    
    handleOptionChange();
  }

  // 장바구니 추가
  function addToCart() {
    if (!currentProduct || !selectedSize || !selectedColor) {
      alert('사이즈와 색상을 선택해주세요.');
      return;
    }

    // 로컬스토리지에 장바구니 저장
    const cartItem = {
      id: currentProduct.id,
      name: currentProduct.name,
      price: currentProduct.price,
      image: currentProduct.image,
      size: selectedSize,
      color: selectedColor,
      quantity: 1,
      addedAt: new Date().toISOString()
    };

    // 기존 장바구니 가져오기
    let cart = JSON.parse(localStorage.getItem('cart') || '[]');

    // 같은 제품 & 옵션이 있는지 확인
    const existingIndex = cart.findIndex(
      item => item.id === cartItem.id && 
              item.size === cartItem.size && 
              item.color === cartItem.color
    );

    if (existingIndex > -1) {
      // 이미 있으면 수량 증가
      cart[existingIndex].quantity += 1;
    } else {
      // 없으면 새로 추가
      cart.push(cartItem);
    }

    // 로컬스토리지에 저장
    localStorage.setItem('cart', JSON.stringify(cart));

    // 성공 메시지
    alert(`장바구니에 추가되었습니다.\n\n제품: ${currentProduct.name}\n사이즈: ${selectedSize}\n색상: ${selectedColor}`);
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

  // 위시리스트 토글
  function toggleWishlist() {
    if (!currentProduct) return;

    const wishlistBtn = document.getElementById('wishlist-btn');
    let wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');

    const existingIndex = wishlist.findIndex(item => item.id === currentProduct.id);

    if (existingIndex > -1) {
      // 이미 있으면 제거
      wishlist.splice(existingIndex, 1);
      wishlistBtn.classList.remove('active');
      alert('위시리스트에서 제거되었습니다.');
    } else {
      // 없으면 추가
      wishlist.push({
        id: currentProduct.id,
        name: currentProduct.name,
        price: currentProduct.price,
        image: currentProduct.image,
        addedAt: new Date().toISOString()
      });
      wishlistBtn.classList.add('active');
      alert('위시리스트에 추가되었습니다.');
    }

    localStorage.setItem('wishlist', JSON.stringify(wishlist));
  }

  // 위시리스트 상태 확인
  function checkWishlistStatus() {
    if (!currentProduct) return;

    const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
    const isInWishlist = wishlist.some(item => item.id === currentProduct.id);

    if (isInWishlist) {
      document.getElementById('wishlist-btn').classList.add('active');
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
    // 제품 데이터 로드 대기
    if (typeof window.CATALOG_DATA === 'undefined') {
      setTimeout(init, 100);
      return;
    }

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
