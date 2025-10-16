// ====================================
// 카탈로그 페이지 스크립트 (간단 버전)
// ====================================

// 간단한 하드코딩된 상품 데이터
const SIMPLE_PRODUCTS = [
  {
    id: 'm-sh-001',
    name: '클래식 화이트 셔츠',
    price: 89000,
    image: 'image/shirt.jpg',
    category: '상의',
    type: '셔츠'
  },
  {
    id: 'm-sh-002', 
    name: '데님 셔츠',
    price: 75000,
    image: 'image/denim.jpg',
    category: '상의',
    type: '셔츠'
  },
  {
    id: 'm-ts-001',
    name: '베이직 티셔츠', 
    price: 45000,
    image: 'image/knit.jpg',
    category: '상의',
    type: '티셔츠'
  },
  {
    id: 'm-jw-001',
    name: '클래식 청바지',
    price: 129000,
    image: 'image/pants.jpg', 
    category: '하의',
    type: '청바지'
  },
  {
    id: 'm-ot-001',
    name: '데님 재킷',
    price: 159000,
    image: 'image/denim.jpg',
    category: '아우터', 
    type: '재킷'
  },
  {
    id: 'm-ac-001',
    name: '클래식 모자',
    price: 59000,
    image: 'image/cap.jpg',
    category: '액세서리',
    type: '모자'
  },
  {
    id: 'm-ac-002',
    name: '가죽 지갑',
    price: 89000,
    image: 'image/earring.jpg',
    category: '액세서리', 
    type: '지갑'
  },
  {
    id: 'w-sh-001',
    name: '레이스 블라우스',
    price: 99000,
    image: 'image/shirt.jpg',
    category: '상의',
    type: '블라우스'
  },
  {
    id: 'w-sk-001', 
    name: '미디 스커트',
    price: 119000,
    image: 'image/pants.jpg',
    category: '하의',
    type: '스커트'
  },
  {
    id: 'w-bg-001',
    name: '토트백',
    price: 139000,
    image: 'image/hat.jpg',
    category: '가방',
    type: '토트백'
  }
];

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', () => {
  console.log('🔄 카탈로그 페이지 로드됨');
  renderProducts();
});

// 상품 렌더링
function renderProducts() {
  const productGrid = document.getElementById('product-grid');
  const productCount = document.getElementById('product-count');
  
  if (!productGrid) {
    console.error('product-grid 요소를 찾을 수 없습니다');
    return;
  }

  // 상품 개수 업데이트
  if (productCount) {
    productCount.textContent = SIMPLE_PRODUCTS.length;
  }

  // 상품 그리드 렌더링
  productGrid.innerHTML = SIMPLE_PRODUCTS.map(product => `
    <article class="product-card" onclick="goToProduct('${product.id}')">
      <div class="product-image-container">
        <img src="${product.image}" alt="${product.name}" class="product-image" 
             onerror="this.src='image/placeholder.jpg'">
      </div>
      <div class="product-info">
        <h3 class="product-name">${product.name}</h3>
        <p class="product-category">${product.category} · ${product.type}</p>
        <p class="product-price">₩${product.price.toLocaleString()}</p>
      </div>
    </article>
  `).join('');

  console.log(`✅ ${SIMPLE_PRODUCTS.length}개 상품 렌더링 완료`);
}

// 상품 상세 페이지로 이동
function goToProduct(productId) {
  const product = SIMPLE_PRODUCTS.find(p => p.id === productId);
  if (product) {
    // URL 파라미터로 상품 정보 전달
    const params = new URLSearchParams({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      category: product.category,
      type: product.type
    });
    
    window.location.href = `buy.html?${params.toString()}`;
  }
}

// 전역으로 노출
window.goToProduct = goToProduct;