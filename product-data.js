// ====================================
// API에서 상품 데이터 로드
// ====================================

// 초기 CATALOG_DATA 구조 설정
window.CATALOG_DATA = {
  tops: { shirts: [], knits: [], 't-shirts': [] },
  bottoms: { pants: [], skirts: [] },
  outer: { jackets: [], suits: [] },
  bags: { briefcases: [], backpacks: [], crossbody: [], handbags: [], totes: [], clutches: [] },
  accessories: { caps: [], wallets: [], belts: [], ties: [] }
};

// Logger가 없으면 console 사용 (utils.js에서 이미 Logger가 선언되어 있음)
const logger = window.Logger || {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
};

// API에서 상품 데이터 로드
async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    
    // 응답 상태 확인
    if (!response.ok) {
      logger.error('❌ API 응답 오류:', response.status, response.statusText);
      if (response.status === 429) {
        logger.warn('⚠️ API 요청 제한 초과, 5초 후 재시도...');
        setTimeout(loadProducts, 5000); // 5초 후 재시도
        return;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.success && data.products) {
      // 제품을 카테고리별로 분류
      const catalogData = {
        tops: { shirts: [], knits: [], 't-shirts': [] },
        bottoms: { pants: [], skirts: [] },
        outer: { jackets: [], suits: [] },
        bags: { briefcases: [], backpacks: [], crossbody: [], handbags: [], totes: [], clutches: [] },
        accessories: { caps: [], wallets: [], belts: [], ties: [] }
      };
      
      data.products.forEach(product => {
        if (catalogData[product.category] && catalogData[product.category][product.type]) {
          catalogData[product.category][product.type].push(product);
        } else {
          logger.warn('⚠️ 분류되지 않은 제품:', product.id, product.category, product.type);
        }
      });
      
      // CATALOG_DATA 업데이트
      window.CATALOG_DATA = catalogData;
      
      // 상품 데이터가 로드되었음을 표시
      window.productsLoaded = true;
      window.dispatchEvent(new CustomEvent('productsLoaded'));
      
    } else {
      logger.error('❌ API 데이터 로드 실패 - 응답 형식 오류:', {
        success: data.success,
        hasProducts: !!data.products
      });
      window.dispatchEvent(new CustomEvent('productsLoadError'));
    }
    
  } catch (error) {
    logger.error('❌ 상품 데이터 로드 오류:', error.message);
    
    // 429 오류인 경우 재시도
    if (error.message.includes('429')) {
      logger.warn('⚠️ API 요청 제한 초과, 10초 후 재시도...');
      setTimeout(loadProducts, 10000); // 10초 후 재시도
    } else {
      window.dispatchEvent(new CustomEvent('productsLoadError'));
    }
  }
}

// 페이지 로드 시 상품 데이터 로드
loadProducts();
