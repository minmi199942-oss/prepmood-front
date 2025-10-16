// ====================================
// 로컬 테스트용 하드코딩된 상품 데이터
// ====================================

window.CATALOG_DATA = {
  men: {
    tops: [
      {
        id: 'm-sh-001',
        name: '클래식 화이트 셔츠',
        price: 89000,
        image: 'image/shirt.jpg',
        gender: 'male',
        category: 'tops',
        type: 'shirt',
        description: '클래식한 화이트 셔츠입니다. 비즈니스 캐주얼부터 포멀까지 다양한 스타일에 활용 가능합니다.'
      },
      {
        id: 'm-sh-002',
        name: '데님 셔츠',
        price: 75000,
        image: 'image/denim.jpg',
        gender: 'male',
        category: 'tops',
        type: 'shirt',
        description: '부드러운 데님 소재의 셔츠입니다. 일상적인 스타일링에 완벽합니다.'
      },
      {
        id: 'm-ts-001',
        name: '베이직 티셔츠',
        price: 45000,
        image: 'image/knit.jpg',
        gender: 'male',
        category: 'tops',
        type: 't-shirt',
        description: '편안한 착용감의 베이직 티셔츠입니다. 다양한 컬러로 구성되어 있습니다.'
      }
    ],
    bottoms: [
      {
        id: 'm-jw-001',
        name: '클래식 청바지',
        price: 129000,
        image: 'image/pants.jpg',
        gender: 'male',
        category: 'bottoms',
        type: 'jeans',
        description: '클래식한 스타일의 청바지입니다. 슬림핏으로 세련된 실루엣을 연출합니다.'
      }
    ],
    outer: [
      {
        id: 'm-ot-001',
        name: '데님 재킷',
        price: 159000,
        image: 'image/denim.jpg',
        gender: 'male',
        category: 'outer',
        type: 'jacket',
        description: '시원한 데님 재킷입니다. 레이어드 스타일에 완벽합니다.'
      }
    ],
    accessories: [
      {
        id: 'm-ac-001',
        name: '클래식 모자',
        price: 59000,
        image: 'image/cap.jpg',
        gender: 'male',
        category: 'accessories',
        type: 'cap',
        description: '심플하고 세련된 디자인의 모자입니다.'
      },
      {
        id: 'm-ac-002',
        name: '가죽 지갑',
        price: 89000,
        image: 'image/earring.jpg',
        gender: 'male',
        category: 'accessories',
        type: 'wallet',
        description: '고급 가죽 소재의 지갑입니다.'
      }
    ]
  },
  women: {
    tops: [
      {
        id: 'w-sh-001',
        name: '레이스 블라우스',
        price: 99000,
        image: 'image/shirt.jpg',
        gender: 'female',
        category: 'tops',
        type: 'blouse',
        description: '우아한 레이스 디테일의 블라우스입니다.'
      }
    ],
    bottoms: [
      {
        id: 'w-sk-001',
        name: '미디 스커트',
        price: 119000,
        image: 'image/pants.jpg',
        gender: 'female',
        category: 'bottoms',
        type: 'skirt',
        description: '여성스러운 실루엣의 미디 스커트입니다.'
      }
    ],
    bags: [
      {
        id: 'w-bg-001',
        name: '토트백',
        price: 139000,
        image: 'image/hat.jpg',
        gender: 'female',
        category: 'bags',
        type: 'tote',
        description: '실용적인 토트백입니다.'
      }
    ]
  }
};

// 상품 데이터가 로드되었음을 표시
window.productsLoaded = true;
window.dispatchEvent(new CustomEvent('productsLoaded'));
