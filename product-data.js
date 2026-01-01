// ====================================
// API에서 상품 데이터 로드
// ====================================

// 초기 CATALOG_DATA 구조 설정
window.CATALOG_DATA = {
  tops: { shirts: [], knits: [], 't-shirts': [] },
  bottoms: { pants: [], skirts: [] },
  outer: { jackets: [], suits: [] },
  bags: { briefcases: [], backpacks: [], crossbody: [], handbags: [], totes: [], clutches: [] },
  accessories: { caps: [], wallets: [], belts: [], ties: [], scarves: [] }
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
      // 주의: URL 파라미터는 복수형(ties, caps 등)을 사용하지만, DB는 단수형(tie, cap 등)을 사용
      const catalogData = {
        tops: { shirts: [], knits: [], 't-shirts': [] },
        bottoms: { pants: [], skirts: [] },
        outer: { jackets: [], suits: [] },
        bags: { briefcases: [], backpacks: [], crossbody: [], handbags: [], totes: [], clutches: [] },
        accessories: { caps: [], wallets: [], belts: [], ties: [], scarves: [] }
      };
      
      // 타입 매핑: DB 값(단수형) -> URL 파라미터 값(복수형)
      const typeMapping = {
        'cap': 'caps',
        'wallet': 'wallets',
        'tie': 'ties',
        'scarf': 'scarves',
        'belt': 'belts'
      };
      
      // 카테고리별 기본 타입 매핑 (non-accessories용)
      const defaultTypeMapping = {
        'tops': 'shirts',      // 상의는 기본적으로 shirts에 분류
        'bottoms': 'pants',    // 하의는 기본적으로 pants에 분류
        'outer': 'jackets',    // 아우터는 기본적으로 jackets에 분류
        'bags': 'briefcases'   // 가방은 기본적으로 briefcases에 분류
      };
      
      // 기존 DB 타입 -> catalogData 타입 매핑 (단수형 -> 복수형 또는 그대로)
      const dbTypeToCatalogType = {
        // tops
        'shirt': 'shirts',
        'shirts': 'shirts',
        'knit': 'knits',
        'knits': 'knits',
        't-shirt': 't-shirts',
        't-shirts': 't-shirts',
        // bottoms
        'pant': 'pants',
        'pants': 'pants',
        'skirt': 'skirts',
        'skirts': 'skirts',
        // outer
        'jacket': 'jackets',
        'jackets': 'jackets',
        'suit': 'suits',
        'suits': 'suits',
        // bags
        'briefcase': 'briefcases',
        'briefcases': 'briefcases',
        'backpack': 'backpacks',
        'backpacks': 'backpacks',
        'crossbody': 'crossbody',
        'handbag': 'handbags',
        'handbags': 'handbags',
        'tote': 'totes',
        'totes': 'totes',
        'clutch': 'clutches',
        'clutches': 'clutches'
      };
      
      data.products.forEach(product => {
        let mappedType = product.type;
        
        // accessories: 단수형 -> 복수형 매핑
        if (product.category === 'accessories' && product.type && typeMapping[product.type]) {
          mappedType = typeMapping[product.type];
        }
        // non-accessories: DB 타입을 catalogData 타입으로 변환
        else if (product.category !== 'accessories' && product.type && dbTypeToCatalogType[product.type]) {
          mappedType = dbTypeToCatalogType[product.type];
        }
        // non-accessories이고 type이 NULL이거나 매핑되지 않은 경우: 기본 타입 사용
        else if (product.category !== 'accessories' && (!product.type || !dbTypeToCatalogType[product.type])) {
          mappedType = defaultTypeMapping[product.category] || null;
        }
        
        // 분류
        if (catalogData[product.category] && mappedType && catalogData[product.category][mappedType]) {
          catalogData[product.category][mappedType].push(product);
        } else if (catalogData[product.category] && !mappedType) {
          // type이 없지만 카테고리는 있는 경우: 기본 타입으로 분류
          const defaultType = defaultTypeMapping[product.category];
          if (defaultType && catalogData[product.category][defaultType]) {
            catalogData[product.category][defaultType].push(product);
          } else {
            logger.warn('⚠️ 분류되지 않은 제품 (기본 타입 없음):', product.id, product.category, product.type);
          }
        } else {
          logger.warn('⚠️ 분류되지 않은 제품:', product.id, product.category, product.type, '-> mapped:', mappedType);
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

// 주기적으로 상품 데이터 갱신 (관리자 페이지 변경사항 반영)
// 30초마다 자동으로 상품 데이터를 다시 로드
setInterval(() => {
  loadProducts();
}, 30000); // 30초마다 갱신
