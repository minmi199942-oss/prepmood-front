# 보증서 제품명 누락 수정

## 문제
주문 완료 후 보증서가 발급되었을 때 보증서에 제품명이 표시되지 않음

## 원인
`processPaidOrder()`에서 warranties 생성 시 `product_name`을 포함하지 않았음

---

## 수정 사항

### 1. `backend/utils/paid-order-processor.js`

#### 1-1. order_items 조회 시 product_name 추가 (177줄)
```javascript
// 수정 전
SELECT 
    order_item_id,
    product_id,
    size,
    color,
    quantity,
    unit_price,
    subtotal
FROM order_items

// 수정 후
SELECT 
    order_item_id,
    product_id,
    product_name,  // 추가
    size,
    color,
    quantity,
    unit_price,
    subtotal
FROM order_items
```

#### 1-2. orderItemUnitsToCreate에 product_name 추가 (337줄)
```javascript
// 수정 후
orderItemUnitsToCreate.push({
    order_id: orderId,
    order_item_id: item.order_item_id,
    unit_seq: i + 1,
    stock_unit_id: stockUnit.stock_unit_id,
    token_pk: stockUnit.token_pk,
    product_name: item.product_name  // 추가
});
```

#### 1-3. warranties INSERT 시 product_name 포함 (502줄)
```javascript
// 수정 전
INSERT INTO warranties
(source_order_item_unit_id, token_pk, owner_user_id, status, public_id, verified_at, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?)

// 수정 후
INSERT INTO warranties
(source_order_item_unit_id, token_pk, owner_user_id, status, public_id, product_name, verified_at, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
```

#### 1-4. 재판매 처리 시 product_name 업데이트 (460줄)
```javascript
// 수정 전
UPDATE warranties
SET status = ?,
    source_order_item_unit_id = ?,
    owner_user_id = ?,
    verified_at = ?
WHERE token_pk = ? AND status = 'revoked'

// 수정 후
UPDATE warranties
SET status = ?,
    source_order_item_unit_id = ?,
    owner_user_id = ?,
    product_name = ?,  // 추가
    verified_at = ?
WHERE token_pk = ? AND status = 'revoked'
```

---

## 검증 방법

### 1. 신규 주문 테스트
1. 주문 생성 및 결제 완료
2. DB에서 warranties 확인:
```sql
SELECT id, public_id, product_name, status, created_at
FROM warranties
WHERE source_order_item_unit_id IN (
    SELECT order_item_unit_id FROM order_item_units 
    WHERE order_id = [order_id]
);
```

**예상 결과**: `product_name`이 정상적으로 저장됨

### 2. 보증서 상세 페이지 확인
1. 회원으로 로그인
2. 보증서 목록에서 보증서 클릭
3. 보증서 상세 페이지에서 제품명 확인

**예상 결과**: 제품명이 정상적으로 표시됨

### 3. 기존 보증서 확인
기존에 생성된 보증서 중 `product_name`이 NULL인 경우:
```sql
-- product_name이 NULL인 보증서 확인
SELECT w.id, w.public_id, w.product_name, oi.product_name as order_item_product_name
FROM warranties w
INNER JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
INNER JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
WHERE w.product_name IS NULL
LIMIT 10;
```

**기존 데이터 복구** (필요한 경우):
```sql
-- 기존 보증서의 product_name 업데이트
UPDATE warranties w
INNER JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
INNER JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
SET w.product_name = oi.product_name
WHERE w.product_name IS NULL;
```

---

## 영향 범위

### 영향받는 기능
- ✅ 신규 주문의 보증서 생성
- ✅ 재판매 처리 (revoked → issued)
- ✅ 보증서 상세 페이지 제품명 표시
- ✅ 보증서 목록 제품명 표시

### 영향받지 않는 기능
- 기존에 이미 `product_name`이 있는 보증서는 영향 없음

---

## 참고

- **warranties 테이블**: `product_name VARCHAR(255) NULL` (db_structure_actual.txt 415줄)
- **order_items 테이블**: `product_name VARCHAR(255) NOT NULL` (db_structure_actual.txt 183줄)
- **마이그레이션**: `003_add_public_id_and_product_name.sql`에서 `product_name` 컬럼 추가됨
