# Size/Color 표준화 정책 (SSOT)

## 🎯 핵심 원칙

**이 문서는 size/color 값의 표준화 정책을 정의하는 단일 진실 원천(SSOT)입니다.**

---

## 📋 Color 표준화 정책

### 최종 확정: **문자열 표준값 사용** (선택 B)

#### 이유
1. 현재 마이그레이션/백엔드에서 이미 "Light Blue" (띄어쓰기) 형식 사용 중
2. 프론트엔드/관리자 입력과 직관적으로 일치
3. 코드값으로 변경 시 마이그레이션 비용 큼

#### 표준 Color 값 목록 (정확한 철자)
```
Black
Navy
White
Grey
Light Blue    (⚠️ 띄어쓰기 필수, "LightBlue" 아님)
Light Grey    (⚠️ 띄어쓰기 필수, "LightGrey" 아님)
```

#### 적용 범위
1. **DB 저장 (`stock_units.color`, `order_items.color`)**: 표준값만 사용
2. **프론트엔드 입력**: 표준값으로 정규화 후 전송
3. **백엔드 파싱 (serial_number)**: 파싱 후 표준값으로 변환
4. **관리자 입력**: 표준값으로 검증

#### 정규화 함수 (백엔드)
```javascript
function normalizeColor(color) {
    if (!color) return null;
    
    const normalized = color.trim();
    const colorMap = {
        // 붙여쓰기 → 띄어쓰기
        'LightBlue': 'Light Blue',
        'Light-Blue': 'Light Blue',
        'LB': 'Light Blue',
        'LightGrey': 'Light Grey',
        'Light-Grey': 'Light Grey',
        'LGY': 'Light Grey',
        // 축약형 → 표준값
        'BK': 'Black',
        'NV': 'Navy',
        'WH': 'White',
        'WT': 'White',
        'GY': 'Grey',
        'Gray': 'Grey'
    };
    
    return colorMap[normalized] || normalized;
}
```

#### 정규화 함수 (프론트엔드)
```javascript
function normalizeColor(color) {
    if (!color) return null;
    
    const normalized = color.trim();
    const colorMap = {
        'LightBlue': 'Light Blue',
        'LightBlue': 'Light Blue',
        'LB': 'Light Blue',
        'LightGrey': 'Light Grey',
        'LGY': 'Light Grey',
        'BK': 'Black',
        'NV': 'Navy',
        'WH': 'White',
        'GY': 'Grey'
    };
    
    return colorMap[normalized] || normalized;
}
```

---

## 📋 Size 표준화 정책

### 표준 Size 값 목록
```
S
M
L
XL
XXL
F    (Free, 원사이즈)
```

### Size 없는 상품 처리 정책

#### 정책: **NULL 허용** (액세서리/타이류)

**이유:**
1. 타이 같은 액세서리는 size 개념 자체가 없음
2. 주문에서 size를 보내지 않으면 `WHERE size IS NULL` 조건으로 재고 배정
3. "F"로 통일하면 액세서리와 일반 상품 구분이 어려움

#### 처리 규칙
1. **액세서리/타이류**: 주문 시 `size` 필드 전송하지 않음 (NULL)
2. **재고 배정**: 
   - 주문에 `size`가 있으면 → 정확 매칭 (`size = ?`)
   - 주문에 `size`가 없으면 → NULL 재고만 배정 (`size IS NULL`)
3. **재고 추가**: 액세서리/타이류는 `size = NULL`로 저장

#### 예외 처리
- **프론트엔드에서 "Free" 선택 시**: 백엔드에서 `"Free" → NULL`로 변환

---

## 🔄 serial_number 파싱 정책

### Color 파싱 규칙
```javascript
// serial_number 패턴: {product}-{color}-{size}-{number}
// 예: PM26-TeneuSolid-LightBlue-S-000001

const colorPatterns = [
    { pattern: /-(LightBlue|Light-Blue|LB)-/i, standardValue: 'Light Blue' },
    { pattern: /-(Black|BK)-/i, standardValue: 'Black' },
    { pattern: /-(Navy|NV)-/i, standardValue: 'Navy' },
    { pattern: /-(White|WH|WT)-/i, standardValue: 'White' },
    { pattern: /-(Grey|GY|Gray)-/i, standardValue: 'Grey' },
    { pattern: /-(LightGrey|Light-Grey|LGY)-/i, standardValue: 'Light Grey' }
];
```

### Size 파싱 규칙
```javascript
const sizePatterns = [
    { pattern: /-S-[0-9]/, standardValue: 'S' },
    { pattern: /-M-[0-9]/, standardValue: 'M' },
    { pattern: /-L-[0-9]/, standardValue: 'L' },
    { pattern: /-XL-[0-9]/, standardValue: 'XL' },
    { pattern: /-XXL-[0-9]/, standardValue: 'XXL' },
    { pattern: /-F-[0-9]|-[0-9]+-F/, standardValue: 'F' }
];
```

---

## ⚠️ 매칭 실패 방지 체크리스트

### 1. product_name 끝 공백 문제
- ✅ **해결**: `init-token-master-from-xlsx.js`에서 `product_name.trim()` 처리
- ✅ **확인**: `admin_products.short_name` 비교 시도 TRIM 불필요 (DB 값에 공백 없음 가정)

### 2. color 표기 불일치 문제
- ⚠️ **위험**: 프론트엔드/관리자 입력과 DB 저장값 불일치 가능
- ✅ **해결**: 정규화 함수 적용 (백엔드/프론트엔드)

### 3. size 없는 상품 처리
- ✅ **정책**: NULL 허용, 재고 배정 시 `WHERE size IS NULL` 조건 사용

---

## 📝 적용 체크리스트

### 백엔드
- [ ] `order-routes.js`: 주문 생성 시 color 정규화 함수 적용
- [ ] `stock-routes.js`: 재고 추가 시 color 정규화 함수 적용 (입력값 우선)
- [ ] `paid-order-processor.js`: 재고 배정 시 color 정규화 불필요 (이미 DB에 표준값 저장됨)
- [ ] `init-token-master-from-xlsx.js`: product_name TRIM 확인 (이미 적용됨)

### 프론트엔드
- [ ] `checkout-script.js`: 주문 생성 전 color 정규화 함수 적용
- [ ] `buy-script.js`: 사이즈 선택 시 액세서리는 "Free" → NULL 변환
- [ ] `admin-stock.js`: 재고 추가 시 color 정규화 함수 적용

### 마이그레이션
- [ ] 기존 `stock_units.color` 데이터 정규화 (필요 시)
- [ ] 기존 `order_items.color` 데이터 정규화 (필요 시)

---

## 🔗 관련 문서

- `SHIPPED_DELIVERED_API_FINAL_SPEC.md`: 재고 배정 로직
- `048_add_stock_units_size_color.sql`: size/color 컬럼 추가 마이그레이션

---

**문서 버전**: 1.0  
**최종 확정일**: 2026-01-11  
**검토자**: GPT + 사용자 승인
