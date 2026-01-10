/**
 * 체크아웃 관련 유틸리티 함수 (SSOT)
 * 주문 payload 생성 등의 체크아웃 관련 공통 로직을 여기에 통합
 */

/**
 * 주문 payload 생성 (SSOT - Single Source of Truth)
 * 모든 주문 생성 경로에서 이 함수를 사용해야 함
 * 
 * @param {Array} items - 장바구니 아이템 배열
 * @param {Object} shipping - 배송 정보
 * @returns {Object} 주문 생성 API 요청 payload
 */
function createOrderPayload(items, shipping) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('주문할 상품이 없습니다.');
  }

  if (!shipping) {
    throw new Error('배송 정보가 필요합니다.');
  }

  // 아이템 변환 및 검증 (SSOT: 모든 경로에서 동일한 로직 사용)
  const validatedItems = items.map((item, index) => {
    // product_id 우선순위: product_id > id
    const productId = String(item.product_id || item.id || '').trim();
    
    // quantity 검증 및 변환
    const quantity = parseInt(item.quantity, 10);
    
    // product_id 검증 (빈 문자열이나 유효하지 않은 값 체크)
    if (!productId || productId === 'undefined' || productId === 'null') {
      console.error(`❌ 아이템 ${index} product_id 없음:`, {
        original: item.product_id || item.id,
        item: item,
        keys: Object.keys(item)
      });
      return null;
    }
    
    // quantity 검증
    if (isNaN(quantity) || quantity <= 0) {
      console.error(`❌ 아이템 ${index} quantity 변환 실패:`, {
        original: item.quantity,
        item: item
      });
      return null;
    }
    
    // size 정규화: "Free" → null (액세서리/타이류 처리)
    let normalizedSize = item.size || null;
    if (normalizedSize === 'Free' || normalizedSize === '') {
      normalizedSize = null;
    }
    
    // color 정규화 (표준값으로 변환)
    const normalizedColor = normalizeColor(item.color);
    
    return {
      product_id: productId,  // 문자열 그대로 전송 (VARCHAR)
      size: normalizedSize,   // NULL 허용 (액세서리/타이류)
      color: normalizedColor, // 표준값 (띄어쓰기 통일)
      quantity: quantity
    };
  }).filter(item => item !== null && item.product_id && item.quantity > 0);

  if (validatedItems.length === 0) {
    throw new Error('유효한 상품 정보가 없습니다.');
  }

  return {
    items: validatedItems,
    shipping: shipping
  };
}

/**
 * Color 정규화 함수 (SSOT)
 * 다양한 입력 형식을 표준값으로 변환
 * 
 * 표준값:
 * - "Light Blue" (띄어쓰기)
 * - "Light Grey" (띄어쓰기)
 * - "Black", "Navy", "White", "Grey"
 * 
 * @param {string|null|undefined} color - 입력 색상값
 * @returns {string|null} 정규화된 색상값 (표준값 또는 null)
 */
function normalizeColor(color) {
  if (!color) return null;
  
  const normalized = String(color).trim();
  
  // 빈 문자열은 null
  if (normalized === '') {
    return null;
  }
  
  // 색상 매핑 (다양한 입력 형식 → 표준값)
  const colorMap = {
    // 붙여쓰기 → 띄어쓰기
    'LightBlue': 'Light Blue',
    'Light-Blue': 'Light Blue',
    'LB': 'Light Blue',
    'light blue': 'Light Blue',
    'LIGHT BLUE': 'Light Blue',
    
    'LightGrey': 'Light Grey',
    'Light-Grey': 'Light Grey',
    'LGY': 'Light Grey',
    'light grey': 'Light Grey',
    'LIGHT GREY': 'Light Grey',
    'LightGray': 'Light Grey',
    'Light-Gray': 'Light Grey',
    'light gray': 'Light Grey',
    'LIGHT GRAY': 'Light Grey',
    
    // 축약형 → 표준값
    'BK': 'Black',
    'black': 'Black',
    'BLACK': 'Black',
    
    'NV': 'Navy',
    'navy': 'Navy',
    'NAVY': 'Navy',
    
    'WH': 'White',
    'WT': 'White',
    'white': 'White',
    'WHITE': 'White',
    
    'GY': 'Grey',
    'Gray': 'Grey',
    'gray': 'Grey',
    'GREY': 'Grey',
    'GRAY': 'Grey'
  };
  
  // 매핑이 있으면 표준값 반환, 없으면 원본 반환 (추후 DB 검증에서 걸림)
  return colorMap[normalized] || normalized;
}

// 전역 함수로 내보내기 (브라우저 환경)
if (typeof window !== 'undefined') {
  window.createOrderPayload = createOrderPayload;
  window.normalizeColor = normalizeColor;
}

// Node.js 환경 (테스트용)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createOrderPayload,
    normalizeColor
  };
}
