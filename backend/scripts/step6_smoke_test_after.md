# Step 6 (Dual-write) 이후 스모크 테스트 가이드

**목적**: Dual-write 구현이 정상 동작하는지 수동 테스트로 검증

**예상 시간**: 10-15분

---

## ✅ 테스트 전 확인사항

1. **마이그레이션 완료 확인**:
   ```sql
   -- order_items에 product_id_canonical 컬럼 확인
   DESCRIBE order_items;
   
   -- stock_units에 product_id_canonical 컬럼 확인
   DESCRIBE stock_units;
   ```

2. **코드 배포 완료 확인**: 최신 코드가 VPS에 배포되었는지 확인

---

## 🧪 테스트 시나리오

### 테스트 1: 재고 추가 (stock_units dual-write)

**목표**: 재고 추가 시 `product_id`와 `product_id_canonical`이 모두 저장되는지 확인

**방법**:
1. 관리자 페이지 → 재고 관리 → "+ 재고 추가"
2. 상품 선택 (legacy ID 사용 예: `PM-26-SH-Teneu-Solid-LB-S/M/L`)
3. 토큰 선택 후 재고 추가

**DB 확인**:
```sql
-- 최근 추가된 재고 확인
SELECT 
    stock_unit_id,
    product_id,
    product_id_canonical,
    size,
    color,
    status,
    created_at
FROM stock_units
ORDER BY created_at DESC
LIMIT 5;

-- 확인 사항:
-- ✅ product_id는 legacy ID (예: PM-26-SH-Teneu-Solid-LB-S/M/L)
-- ✅ product_id_canonical은 canonical ID (예: PM-26-SH-Teneu-Solid-LB-S)
-- ✅ 둘 다 NULL이 아님
```

**예상 결과**:
- `product_id`: legacy ID (슬래시 포함 가능)
- `product_id_canonical`: canonical ID (슬래시 제거된 형태)
- 둘 다 정상적으로 저장됨

---

### 테스트 2: 상품 생성 (admin_products canonical_id 자동 설정)

**목표**: 신규 상품 생성 시 `canonical_id`가 자동으로 설정되는지 확인

**방법**:
1. 관리자 페이지 → 상품 관리 → "+ 상품 추가"
2. 상품 ID 입력 (슬래시 없음, 예: `PM-26-TEST-PRODUCT`)
3. 나머지 필드 입력 후 저장

**DB 확인**:
```sql
-- 최근 생성된 상품 확인
SELECT 
    id,
    canonical_id,
    name,
    created_at
FROM admin_products
ORDER BY created_at DESC
LIMIT 3;

-- 확인 사항:
-- ✅ id는 입력한 값 (예: PM-26-TEST-PRODUCT)
-- ✅ canonical_id도 동일한 값 (예: PM-26-TEST-PRODUCT)
-- ✅ 둘 다 NULL이 아님
```

**예상 결과**:
- `id`: 입력한 상품 ID
- `canonical_id`: `id`와 동일 (신규 상품은 슬래시 없으므로)
- 둘 다 정상적으로 저장됨

---

### 테스트 3: 주문 생성 (order_items dual-write)

**목표**: 주문 생성 시 `order_items`에 `product_id`와 `product_id_canonical`이 모두 저장되는지 확인

**방법**:
1. 프론트엔드 → 상품 상세 페이지
2. 사이즈/색상 선택 후 장바구니 추가
3. 주문 진행 (결제는 테스트 모드 또는 스킵)

**DB 확인**:
```sql
-- 최근 생성된 주문의 order_items 확인
SELECT 
    oi.order_item_id,
    oi.order_id,
    oi.product_id,
    oi.product_id_canonical,
    oi.product_name,
    oi.quantity,
    oi.created_at
FROM order_items oi
ORDER BY oi.created_at DESC
LIMIT 5;

-- 확인 사항:
-- ✅ product_id는 legacy ID (예: PM-26-SH-Teneu-Solid-LB-S/M/L)
-- ✅ product_id_canonical은 canonical ID (예: PM-26-SH-Teneu-Solid-LB-S)
-- ✅ 둘 다 NULL이 아님
```

**예상 결과**:
- `product_id`: legacy ID (슬래시 포함 가능)
- `product_id_canonical`: canonical ID (슬래시 제거된 형태)
- 둘 다 정상적으로 저장됨

---

### 테스트 4: 조회 API (dual-read) 정상 동작 확인

**목표**: legacy ID와 canonical ID 모두로 조회가 정상 동작하는지 확인

**방법 1: 상품 옵션 API (legacy ID)**
```javascript
// 브라우저 Console에서 실행
fetch('https://prepmood.kr/api/products/options?product_id=PM-26-SH-Teneu-Solid-LB-S%2FM%2FL')
  .then(r => r.json())
  .then(data => {
    console.log('✅ Legacy ID 조회:', data);
    console.log('성공 여부:', data.success);
  });
```

**방법 2: 상품 옵션 API (canonical ID)**
```javascript
// 브라우저 Console에서 실행
fetch('https://prepmood.kr/api/products/options?product_id=PM-26-SH-Teneu-Solid-LB-S')
  .then(r => r.json())
  .then(data => {
    console.log('✅ Canonical ID 조회:', data);
    console.log('성공 여부:', data.success);
  });
```

**예상 결과**:
- 둘 다 `success: true`
- 동일한 옵션 데이터 반환

---

### 테스트 5: 정합성 검증 쿼리

**목표**: 전체 데이터 정합성 확인

**실행**:
```sql
-- 1. order_items의 canonical_id NULL 체크
SELECT 
    'order_items canonical_id NULL 체크' AS check_type,
    COUNT(*) as total_items,
    COUNT(product_id_canonical) as not_null_count,
    COUNT(*) - COUNT(product_id_canonical) as null_count
FROM order_items;

-- 2. order_items의 orphan 체크 (canonical_id가 admin_products에 없는 경우)
SELECT 
    'order_items orphan 체크' AS check_type,
    COUNT(*) as orphan_count
FROM order_items oi
LEFT JOIN admin_products ap ON oi.product_id_canonical = ap.canonical_id
WHERE oi.product_id_canonical IS NOT NULL
  AND ap.canonical_id IS NULL;

-- 3. stock_units의 canonical_id NULL 체크
SELECT 
    'stock_units canonical_id NULL 체크' AS check_type,
    COUNT(*) as total_units,
    COUNT(product_id_canonical) as not_null_count,
    COUNT(*) - COUNT(product_id_canonical) as null_count
FROM stock_units;

-- 4. stock_units의 orphan 체크
SELECT 
    'stock_units orphan 체크' AS check_type,
    COUNT(*) as orphan_count
FROM stock_units su
LEFT JOIN admin_products ap ON su.product_id_canonical = ap.canonical_id
WHERE su.product_id_canonical IS NOT NULL
  AND ap.canonical_id IS NULL;

-- 5. admin_products의 canonical_id NULL 체크
SELECT 
    'admin_products canonical_id NULL 체크' AS check_type,
    COUNT(*) as total_products,
    COUNT(canonical_id) as not_null_count,
    COUNT(*) - COUNT(canonical_id) as null_count
FROM admin_products;
```

**예상 결과**:
- 모든 `null_count` = 0
- 모든 `orphan_count` = 0

---

## ✅ 테스트 완료 기준

다음 조건을 모두 만족하면 Step 7 검증 완료:

1. ✅ **재고 추가**: `product_id`와 `product_id_canonical` 모두 저장됨
2. ✅ **상품 생성**: `canonical_id` 자동 설정됨
3. ✅ **주문 생성**: `order_items`에 `product_id`와 `product_id_canonical` 모두 저장됨
4. ✅ **조회 API**: legacy ID와 canonical ID 모두 정상 동작
5. ✅ **정합성 검증**: 모든 NULL/Orphan 체크 통과

---

## 🚨 문제 발생 시

### 문제 1: `product_id_canonical`이 NULL인 경우

**원인**: `resolveProductIdBoth()`가 `null`을 반환

**확인**:
```sql
-- 해당 product_id가 admin_products에 있는지 확인
SELECT id, canonical_id FROM admin_products WHERE id = 'PRODUCT_ID';
```

**해결**: 상품이 `admin_products`에 존재하는지 확인

### 문제 2: Orphan 발생

**원인**: `canonical_id`가 `admin_products.canonical_id`와 매칭되지 않음

**확인**:
```sql
-- orphan 상세 확인
SELECT DISTINCT oi.product_id_canonical
FROM order_items oi
LEFT JOIN admin_products ap ON oi.product_id_canonical = ap.canonical_id
WHERE oi.product_id_canonical IS NOT NULL
  AND ap.canonical_id IS NULL;
```

**해결**: `product_id_mapping` 테이블 확인 및 백필 재실행

---

## 📝 테스트 결과 기록

테스트 완료 후 아래 항목을 확인하고 기록:

- [ ] 테스트 1: 재고 추가 dual-write
- [ ] 테스트 2: 상품 생성 canonical_id 자동 설정
- [ ] 테스트 3: 주문 생성 dual-write
- [ ] 테스트 4: 조회 API dual-read
- [ ] 테스트 5: 정합성 검증 쿼리

**테스트 완료일**: YYYY-MM-DD  
**테스트 결과**: ✅ 통과 / ❌ 실패 (실패 시 상세 기록)

---

**문서 버전**: 1.0  
**최종 업데이트**: 2026-01-11
