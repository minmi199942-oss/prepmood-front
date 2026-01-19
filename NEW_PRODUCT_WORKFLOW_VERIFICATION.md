# 신규 상품 등록 및 QR 작동 프로세스 검증

**작성일**: 2026-01-16  
**목적**: 색상 코드 제거 후 신규 상품 등록부터 QR 작동까지 전체 프로세스 검증

---

## ✅ 전체 프로세스 확인 결과

### 1단계: 상품 등록 (admin_products)

**작업**:
1. 관리자 페이지 → 상품 관리
2. 새 상품 추가
3. 상품 정보 입력:
   - **상품 ID**: `PM-26-SH-New-Product` (색상 코드 없음) ✅
   - **상품명**: `"테뉴 솔리드 셔츠 Teneu Solid SH 26"` (색상 없음) ✅
   - 가격, 카테고리 등

**데이터베이스**:
```sql
INSERT INTO admin_products (id, name, price, ...)
VALUES ('PM-26-SH-New-Product', '테뉴 솔리드 셔츠 Teneu Solid SH 26', 128000, ...);
```

**상태**: ✅ **정상 작동**

---

### 2단계: product_options 등록 (색상/사이즈 옵션)

**작업**:
1. 관리자 페이지 → 상품 관리 → 상품 상세
2. 옵션 관리 섹션에서 색상/사이즈 추가
   - 예: `color='Light Blue'`, `size='M'`
   - 예: `color='Black'`, `size='L'`

**데이터베이스**:
```sql
INSERT INTO product_options (product_id, color, size, is_active)
VALUES 
  ('PM-26-SH-New-Product', 'Light Blue', 'M', 1),
  ('PM-26-SH-New-Product', 'Black', 'L', 1);
```

**상태**: ✅ **정상 작동** (product_options가 색상 SSOT)

---

### 3단계: 토큰 일괄 생성 (token_master)

**작업**:
1. 관리자 페이지 → 토큰 일괄 생성
2. xlsx 파일 업로드:
   ```
   product_id | serial_number | warranty_bottom_code
   PM-26-SH-New-Product | SN-001 | WB-001
   PM-26-SH-New-Product | SN-002 | WB-002
   ```

**데이터베이스**:
```sql
INSERT INTO token_master (token, internal_code, product_name, product_id, ...)
VALUES 
  ('abc123...', 'SN-SN-001', 'SH Teneu Solid', 'PM-26-SH-New-Product', ...);
```

**확인 사항**:
- ✅ `product_id`는 색상 코드 없이 저장됨
- ✅ `product_name`은 xlsx의 `product_name` (색상 없음, 예: "SH Teneu Solid")
- ✅ `token_pk` 자동 생성

**상태**: ✅ **정상 작동**

---

### 4단계: 재고 추가 (stock_units)

**작업**:
1. 관리자 페이지 → 재고 관리
2. 재고 추가:
   - 상품 선택: `PM-26-SH-New-Product`
   - 토큰 PK 입력: `123` (token_master에서 생성된 token_pk)
   - 사이즈 선택: `M`
   - 색상 선택: `Light Blue` (product_options에서 선택)

**데이터베이스**:
```sql
INSERT INTO stock_units (product_id, token_pk, size, color, status)
VALUES ('PM-26-SH-New-Product', 123, 'M', 'Light Blue', 'in_stock');
```

**확인 사항**:
- ✅ `product_id`는 색상 코드 없음
- ✅ `token_pk`는 token_master 참조 (FK)
- ✅ `size`, `color`는 product_options의 표준값 사용

**상태**: ✅ **정상 작동**

---

### 5단계: 주문 생성 → 결제 → Warranty 생성

**프로세스**:
1. 고객이 상품 주문 (색상: Light Blue, 사이즈: M)
2. 결제 완료
3. `processPaidOrder()` 실행

**재고 배정 로직** (`paid-order-processor.js`):
```javascript
// stock_units 조회 (product_id, size, color 기준)
SELECT stock_unit_id, token_pk, product_id, size, color
FROM stock_units
WHERE product_id = 'PM-26-SH-New-Product'
  AND size = 'M'
  AND color = 'Light Blue'
  AND status = 'in_stock'
FOR UPDATE SKIP LOCKED;
```

**확인 사항**:
- ✅ `product_id`는 색상 코드 없이 조회됨
- ✅ `size`, `color`는 product_options 표준값으로 매칭
- ✅ 재고 배정 성공

**order_item_units 생성**:
```sql
INSERT INTO order_item_units (order_item_id, token_pk, unit_status, ...)
VALUES (1, 123, 'reserved', ...);
```

**warranties 생성** (`paid-order-processor.js`):
```sql
INSERT INTO warranties (token_pk, product_name, status, ...)
VALUES (123, 'SH Teneu Solid', 'issued', ...);
```

**확인 사항**:
- ✅ `warranties.product_name`은 `token_master.product_name` 사용 (색상 없음)
- ✅ `warranties.token_pk`는 order_item_units의 token_pk 사용

**상태**: ✅ **정상 작동**

---

### 6단계: QR 스캔 → Warranty 조회

**프로세스**:
1. 고객이 QR 코드 스캔
2. `GET /api/auth/verify-token` 호출
3. token으로 token_master 조회
4. token_pk로 warranties 조회

**코드** (`auth-routes.js`):
```javascript
// 1. token_master 조회
const [tokenMasterRows] = await connection.execute(
    'SELECT * FROM token_master WHERE token = ?',
    [token]
);

// 2. warranties 조회
const [warranties] = await connection.execute(
    `SELECT id, public_id, status, owner_user_id, ...
     FROM warranties 
     WHERE token_pk = ?`,
    [tokenPk]
);
```

**확인 사항**:
- ✅ token으로 token_master 조회 성공
- ✅ token_pk로 warranties 조회 성공
- ✅ warranty 정보 반환 (product_name 포함, 색상 없음)

**상태**: ✅ **정상 작동**

---

## 📊 데이터 흐름 다이어그램

```
1. 상품 등록
   admin_products
   ├─ id: PM-26-SH-New-Product (색상 코드 없음) ✅
   └─ name: "테뉴 솔리드 셔츠..." (색상 없음) ✅

2. 옵션 등록
   product_options
   ├─ product_id: PM-26-SH-New-Product ✅
   ├─ color: Light Blue ✅
   └─ size: M ✅

3. 토큰 생성
   token_master
   ├─ token_pk: 123 (자동 생성) ✅
   ├─ product_id: PM-26-SH-New-Product ✅
   └─ product_name: "SH Teneu Solid" (색상 없음) ✅

4. 재고 추가
   stock_units
   ├─ product_id: PM-26-SH-New-Product ✅
   ├─ token_pk: 123 (FK) ✅
   ├─ size: M ✅
   └─ color: Light Blue ✅

5. 주문 → 결제 → Warranty 생성
   order_item_units
   ├─ token_pk: 123 (FK) ✅
   └─ stock_unit_id: 456 (FK) ✅
   
   warranties
   ├─ token_pk: 123 (FK) ✅
   └─ product_name: "SH Teneu Solid" (색상 없음) ✅

6. QR 스캔
   token → token_master → token_pk → warranties ✅
```

---

## ✅ 검증 결과

### 모든 단계 정상 작동 확인

| 단계 | 테이블 | 색상 코드 제거 영향 | 상태 |
|------|--------|-------------------|------|
| 1. 상품 등록 | `admin_products` | ID/NAME 색상 제거됨 | ✅ 정상 |
| 2. 옵션 등록 | `product_options` | 색상 SSOT로 관리 | ✅ 정상 |
| 3. 토큰 생성 | `token_master` | product_id 색상 없음 | ✅ 정상 |
| 4. 재고 추가 | `stock_units` | product_id 색상 없음, color는 product_options 사용 | ✅ 정상 |
| 5. 주문 처리 | `order_item_units`, `warranties` | product_id 색상 없음, product_name 색상 없음 | ✅ 정상 |
| 6. QR 스캔 | `token_master`, `warranties` | 정상 조회 | ✅ 정상 |

---

## ⚠️ 주의사항

### 1. product_options 필수 등록

**중요**: 재고 추가 전에 반드시 `product_options`에 색상/사이즈 옵션을 등록해야 함

**이유**:
- 재고 추가 시 `product_options`에서 색상 선택
- 주문 처리 시 `stock_units`의 `color`와 `product_options.color` 매칭

**확인 방법**:
```sql
SELECT product_id, color, size 
FROM product_options 
WHERE product_id = 'PM-26-SH-New-Product' 
  AND is_active = 1;
```

---

### 2. 색상 표준값 사용

**규칙**: `product_options.color`는 표준값만 사용

**표준값**:
- `Black`
- `Navy`
- `White`
- `Grey`
- `Light Blue` (띄어쓰기 필수)
- `Light Grey` (띄어쓰기 필수)

**확인 방법**:
```sql
SELECT DISTINCT color 
FROM product_options 
WHERE product_id = 'PM-26-SH-New-Product';
```

---

### 3. token_master.product_id 연결

**중요**: 토큰 생성 시 `token_master.product_id`가 올바르게 연결되어야 함

**확인 방법**:
```sql
SELECT token_pk, product_id, product_name 
FROM token_master 
WHERE product_id = 'PM-26-SH-New-Product';
```

---

## 🎯 결론

### ✅ **전체 프로세스 정상 작동 확인**

색상 코드 제거 후에도 신규 상품 등록부터 QR 작동까지 모든 단계가 정상 작동합니다.

**핵심 포인트**:
1. ✅ `admin_products.id`와 `admin_products.name`에서 색상 제거됨
2. ✅ `product_options` 테이블이 색상 SSOT로 작동
3. ✅ `token_master`는 `product_id`만 참조 (색상 코드 없음)
4. ✅ `stock_units`는 `product_id`와 `color`를 별도 관리
5. ✅ 주문 처리 시 `product_id` + `size` + `color`로 재고 조회
6. ✅ QR 스캔 시 `token_pk`로 warranty 조회

**필수 사전 작업**:
- ✅ `product_options`에 색상/사이즈 옵션 등록 (재고 추가 전)

---

**문서 버전**: 1.0  
**작성일**: 2026-01-16
