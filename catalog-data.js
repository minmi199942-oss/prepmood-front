// DB 연동 상품 데이터 로더
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'https://prepmood.kr/api'  // 로컬 개발 시에도 프로덕션 API 사용
  : 'https://prepmood.kr/api';  // 프로덕션

// 전역 변수로 상품 데이터 저장
window.CATALOG_DATA = null;
window.productsLoaded = false;

// DB에서 상품 데이터 로드
async function loadProductsFromDB() {
  try {
    console.log('🔄 DB에서 상품 데이터 로드 중...');
    
    const response = await fetch(`${API_BASE_URL}/products`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.success && data.products) {
      console.log(`✅ ${data.products.length}개 상품 로드 완료`);
      
      // DB 상품을 기존 구조로 변환
      window.CATALOG_DATA = convertProductsToCatalogStructure(data.products);
      window.productsLoaded = true;
      
      // 로드 완료 이벤트 발생
      window.dispatchEvent(new CustomEvent('productsLoaded'));
      
      return window.CATALOG_DATA;
    } else {
      throw new Error(data.message || '상품 데이터를 불러오는데 실패했습니다.');
    }
  } catch (error) {
    console.error('❌ 상품 로드 오류:', error);
    
    // 오류 시 기본 데이터 구조 반환 (빈 상태)
    window.CATALOG_DATA = {
      men: { tops: {}, bottoms: {}, shoes: {}, bags: {}, hats: {}, scarves: {}, accessories: {} },
      women: { tops: {}, bottoms: {}, shoes: {}, bags: {}, hats: {}, scarves: {}, accessories: {} }
    };
    window.productsLoaded = true;
    
    // 오류 이벤트 발생
    window.dispatchEvent(new CustomEvent('productsLoadError', { detail: error }));
    
    return window.CATALOG_DATA;
  }
}

// DB 상품 데이터를 기존 카탈로그 구조로 변환
function convertProductsToCatalogStructure(products) {
  const catalog = {
    men: { tops: {}, bottoms: {}, shoes: {}, bags: {}, hats: {}, scarves: {}, accessories: {} },
    women: { tops: {}, bottoms: {}, shoes: {}, bags: {}, hats: {}, scarves: {}, accessories: {} }
  };
  
  products.forEach(product => {
    const { id, name, price, image, gender, category, type } = product;
    
    // 성별별로 분류
    const genderKey = gender === '남성' ? 'men' : 'women';
    
    // 카테고리별로 분류
    let categoryKey = category.toLowerCase();
    
    // 한국어 카테고리를 영어 키로 매핑
    const categoryMapping = {
      '상의': 'tops',
      '하의': 'bottoms', 
      '신발': 'shoes',
      '가방': 'bags',
      '모자': 'hats',
      '스카프': 'scarves',
      '액세서리': 'accessories'
    };
    
    const mappedCategory = categoryMapping[category] || categoryKey;
    
    // 타입별로 분류
    const typeKey = type.toLowerCase().replace(/\s+/g, '-');
    
    // 구조 초기화
    if (!catalog[genderKey][mappedCategory]) {
      catalog[genderKey][mappedCategory] = {};
    }
    if (!catalog[genderKey][mappedCategory][typeKey]) {
      catalog[genderKey][mappedCategory][typeKey] = [];
    }
    
    // 상품 추가
    catalog[genderKey][mappedCategory][typeKey].push({
      id,
      name,
      price: parseInt(price),
      image: image || 'image/default.jpg' // 기본 이미지
    });
  });
  
  return catalog;
}

// 페이지 로드 시 상품 데이터 로드
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadProductsFromDB);
} else {
  loadProductsFromDB();
}

// 헬퍼: 숫자를 통화 포맷으로
window.formatKRW = (n) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(n);






