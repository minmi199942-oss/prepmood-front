// ====================================
// API에서 상품 데이터 로드
// ====================================

// 초기 CATALOG_DATA 구조 설정
window.CATALOG_DATA = {
  tops: { shirts: [], knits: [], 't-shirts': [] },
  bottoms: { pants: [] },
  outer: { jackets: [], suits: [] },
  bags: { tote: [], backpack: [], crossbody: [] },
  accessories: { caps: [], wallets: [], belts: [] }
};

// API에서 상품 데이터 로드
async function loadProducts() {
  try {
    console.log('🔄 API에서 상품 데이터 로드 중...');
    
    const response = await fetch('/api/products');
    const data = await response.json();
    
    if (data.success && data.products) {
      console.log('✅ API 데이터 로드 성공:', data.products.length, '개 제품');
      
      // 제품을 카테고리별로 분류
      const catalogData = {
        tops: { shirts: [], knits: [], 't-shirts': [] },
        bottoms: { pants: [] },
        outer: { jackets: [], suits: [] },
        bags: { tote: [], backpack: [], crossbody: [] },
        accessories: { caps: [], wallets: [], belts: [] }
      };
      
      data.products.forEach(product => {
        if (catalogData[product.category] && catalogData[product.category][product.type]) {
          catalogData[product.category][product.type].push(product);
        }
      });
      
      // CATALOG_DATA 업데이트
      window.CATALOG_DATA = catalogData;
      console.log('📦 업데이트된 CATALOG_DATA:', window.CATALOG_DATA);
      
      // 상품 데이터가 로드되었음을 표시
      window.productsLoaded = true;
      window.dispatchEvent(new CustomEvent('productsLoaded'));
      
    } else {
      console.error('❌ API 데이터 로드 실패:', data);
      window.dispatchEvent(new CustomEvent('productsLoadError'));
    }
    
  } catch (error) {
    console.error('❌ 상품 데이터 로드 오류:', error);
    window.dispatchEvent(new CustomEvent('productsLoadError'));
  }
}

// 페이지 로드 시 상품 데이터 로드
loadProducts();
