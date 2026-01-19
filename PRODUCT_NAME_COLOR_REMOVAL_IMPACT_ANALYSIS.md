# 상품명에서 색상 제거 영향력 분석

**작성일**: 2026-01-16  
**목적**: `admin_products.name`에서 색상 정보 제거 시 영향 범위 분석

---

## 📋 요약

**현재 구조**:
- `admin_products.name`: 표시용 이름 (색상 포함 가능)
  - 예: "솔리드 수트 스키니 타이 Solid Suit Skinny Tie 26 - Black"
- `product_options.color`: 색상 옵션의 SSOT (표준값: "Light Blue", "Black" 등)

**목표 구조**:
- `admin_products.name`: 색상 제거
  - 예: "솔리드 수트 스키니 타이 Solid Suit Skinny Tie 26"

---

## 🔍 사용처 분석

### 1. 직접 사용 (표시만, 파싱 없음) ✅ 안전

#### 1.1 프론트엔드 - 상품 목록/상세 표시

**파일**: `admin-qhf25za8/admin-products.js`
- **사용**: `product.name` 그대로 표시
- **위치**: 140줄, 164줄
- **영향**: 표시만 하므로 색상 제거해도 안전
- **색상 파싱**: 없음

**파일**: `search.html`
- **사용**: `product.name` 그대로 표시
- **위치**: 300줄, 310줄
- **영향**: 표시만 하므로 안전
- **색상 파싱**: 없음

**파일**: `buy-script.js`
- **사용**: `product.name` 그대로 표시
- **위치**: 57줄
- **영향**: 표시만 하므로 안전
- **색상 파싱**: 없음

**파일**: `checkout-script.js`, `checkout-payment.js`, `checkout-review.js`
- **사용**: `item.name` 표시
- **위치**: 258줄, 260줄, 355줄, 483줄
- **영향**: 표시만 하므로 안전
- **색상 파싱**: 없음

**파일**: `cart-script.js`, `mini-cart.js`
- **사용**: `item.name` 표시
- **위치**: 225줄, 227줄, 996줄, 998줄
- **영향**: 표시만 하므로 안전
- **색상 파싱**: 없음

---

#### 1.2 백엔드 - 주문 생성 시 스냅샷 저장 ⚠️ 주의 필요

**파일**: `backend/order-routes.js`
- **사용**: 주문 생성 시 `admin_products.name` → `order_items.product_name` 저장
- **위치**: 532-553줄
  ```javascript
  const [productRows] = await connection.execute(
      'SELECT id AS product_id, name, price, image FROM admin_products WHERE id = ?',
      [item.product_id]
  );
  // ...
  product_name: product.name,  // 스냅샷 저장
  ```
- **영향**: 
  - ✅ **새 주문**: `name`에서 색상 제거 시 색상 없는 이름 저장됨 (정상)
  - ⚠️ **기존 주문**: 이미 저장된 `order_items.product_name`은 변경 안 됨 (이력 보존)
- **색상 파싱**: 없음 (그대로 저장만 함)

---

### 2. 스냅샷 필드 (이력 보존용) ⚠️ 참고

#### 2.1 `order_items.product_name`

**테이블**: `order_items`
- **용도**: 주문 생성 시점의 상품명 스냅샷 (이력 보존)
- **특징**: 주문 생성 후 `admin_products.name`이 변경되어도 영향 없음
- **영향**: 
  - 기존 주문: 색상 포함된 이름 그대로 유지 (정상)
  - 신규 주문: 색상 제거된 이름 저장됨 (정상)

**사용처**:
- `backend/order-routes.js` (781줄, 924줄): 주문 상세 조회 시 반환
- `backend/index.js` (1666줄, 1770줄): 관리자 주문 목록/상세
- `backend/warranty-event-routes.js` (437줄, 524줄): 보증서 상세 조회
- `backend/refund-routes.js` (163줄): 환불 처리 시 조회
- `backend/mailer.js` (437줄, 537줄): 이메일 발송
- `admin-qhf25za8/admin-orders.js` (178줄, 442줄): 관리자 주문 상세 표시
- `guest/orders.js` (142줄): 비회원 주문 상세 표시

**색상 파싱**: 없음 (표시만 함)

---

#### 2.2 `warranties.product_name`

**테이블**: `warranties`
- **용도**: 보증서 발급 시점의 상품명 스냅샷 (이력 보존)
- **특징**: 보증서 생성 후 `admin_products.name`이 변경되어도 영향 없음
- **영향**:
  - 기존 보증서: 색상 포함된 이름 그대로 유지 (정상)
  - 신규 보증서: `paid-order-processor.js`에서 `token_master.product_name` 사용 (별도 확인 필요)

**사용처**:
- `backend/warranty-routes.js` (942줄): 보증서 조회 시 반환
- `backend/warranty-event-routes.js` (262줄, 275줄, 288줄, 328줄, 577줄): 보증서 상세 조회
- `backend/auth-routes.js` (769줄, 925줄): QR 스캔 시 조회
- `backend/refund-routes.js` (324줄): 환불 처리 시 조회
- `admin-qhf25za8/admin-warranties.js` (170줄, 390줄): 관리자 보증서 목록/상세
- `my-warranties.js` (134줄): 회원 보증서 목록

**색상 파싱**: 없음 (표시만 함)

---

#### 2.3 `token_master.product_name`

**테이블**: `token_master`
- **용도**: 토큰 생성 시점의 상품명 스냅샷
- **특징**: xlsx 파일의 `product_name` 컬럼과 매칭 (색상 포함 안 함이 원칙)
- **영향**:
  - ✅ xlsx의 `product_name`은 이미 색상 포함 안 함 (예: "SH Teneu Solid")
  - ✅ `admin_products.short_name`으로 매칭하므로 `name` 변경 영향 없음

**사용처**:
- `backend/stock-routes.js` (247줄, 276줄): 재고 관리
- `backend/auth-routes.js` (381줄, 392줄): QR 스캔
- `backend/warranty-routes.js` (903줄): 보증서 생성 시 사용
- `backend/utils/paid-order-processor.js`: 보증서 생성 시 `token_master.product_name` → `warranties.product_name` 복사
- `admin-qhf25za8/admin-stock.js` (249줄, 428-430줄): 재고 목록 표시, 토큰 선택 시 확인 UX

**매칭 로직**:
- `backend/init-token-master-from-xlsx.js` (216-232줄): xlsx의 `product_name` → `admin_products.short_name` 매칭
- `backend/update-token-master-from-xlsx.js` (171-183줄): 동일한 매칭 로직

**색상 파싱**: 없음

---

### 3. `short_name` 필드 (xlsx 매칭용) ✅ 영향 없음

**테이블**: `admin_products.short_name`
- **용도**: xlsx 파일의 `product_name`과 정확히 매칭하기 위한 필드
- **특징**: 색상 포함 안 함 (예: "SH Teneu Solid")
- **영향**: `name` 변경과 무관 (별도 필드)

**사용처**:
- `backend/init-token-master-from-xlsx.js` (220줄): xlsx `product_name`과 매칭
- `backend/update-token-master-from-xlsx.js` (176줄): 동일한 매칭
- `backend/stock-routes.js` (228줄, 268줄): 토큰 선택 시 프론트엔드에 반환
- `admin-qhf25za8/admin-stock.js` (401줄, 474줄): 토큰 선택 시 확인 UX

---

### 4. 색상 파싱 로직 확인 ✅ 없음

**검색 결과**: `name` 필드에서 색상을 파싱하는 코드 없음

**확인 사항**:
- ✅ `backend/product-routes.js` (215-227줄): `extractColorFromProductId()` 함수는 **deprecated**이며 `product_options` 테이블을 SSOT로 사용
- ✅ 프론트엔드: `name`을 파싱하는 코드 없음
- ✅ 백엔드: `name`을 파싱하는 코드 없음

**결론**: 색상 정보는 `product_options.color`에서만 관리됨 (SSOT)

---

## 📊 영향도 요약

### ✅ 안전한 영역 (표시만, 파싱 없음)

| 사용처 | 파일 | 위치 | 영향도 | 비고 |
|--------|------|------|--------|------|
| 관리자 상품 목록 | `admin-products.js` | 140줄 | ✅ 안전 | 표시만 |
| 검색 결과 | `search.html` | 300줄 | ✅ 안전 | 표시만 |
| 상품 상세 | `buy-script.js` | 57줄 | ✅ 안전 | 표시만 |
| 체크아웃 | `checkout-*.js` | 여러 | ✅ 안전 | 표시만 |
| 장바구니 | `cart-script.js` | 227줄 | ✅ 안전 | 표시만 |

---

### ⚠️ 주의 필요 (스냅샷 저장)

| 사용처 | 테이블 | 영향도 | 비고 |
|--------|--------|--------|------|
| 주문 생성 | `order_items.product_name` | ⚠️ 스냅샷 | 신규 주문만 영향 |
| 보증서 생성 | `warranties.product_name` | ⚠️ 스냅샷 | `token_master.product_name` 사용 |
| 토큰 매칭 | `token_master.product_name` | ✅ 영향 없음 | `short_name`으로 매칭 |

---

### ✅ 영향 없음 (별도 필드/로직)

| 항목 | 설명 |
|------|------|
| `short_name` | 별도 필드, `name` 변경과 무관 |
| `product_options.color` | SSOT, `name`과 무관 |
| 색상 파싱 로직 | 존재하지 않음 |

---

## 🎯 제거 작업 영향도

### 1. 신규 데이터 영향 ✅ 정상 작동

**주문 생성**:
- `admin_products.name`에서 색상 제거 → `order_items.product_name`에 색상 없는 이름 저장 ✅ 정상

**보증서 생성**:
- `warranties.product_name`은 `token_master.product_name` 사용
- `token_master.product_name`은 xlsx `product_name` 사용 (이미 색상 없음) ✅ 정상

**옵션 표시**:
- 색상 정보는 `product_options.color`에서 조회 ✅ 정상

---

### 2. 기존 데이터 영향 ⚠️ 이력 보존

**기존 주문**:
- `order_items.product_name`에 색상 포함된 이름 그대로 유지
- 이는 정상 동작 (이력 보존)

**기존 보증서**:
- `warranties.product_name`에 색상 포함된 이름 그대로 유지
- 이는 정상 동작 (이력 보존)

**기존 토큰**:
- `token_master.product_name`은 xlsx 기반 (색상 없음이 원칙) ✅ 정상

---

### 3. 표시 영향 ✅ 정상 작동

**프론트엔드 표시**:
- 색상이 없는 이름으로 표시됨 ✅ 정상
- 색상 정보는 `product_options`에서 별도 조회하여 표시 ✅ 정상

**예시**:
```
변경 전: "솔리드 수트 스키니 타이 Solid Suit Skinny Tie 26 - Black"
변경 후: "솔리드 수트 스키니 타이 Solid Suit Skinny Tie 26"
         + 옵션 선택 시 "Black" 표시 (product_options.color에서)
```

---

## ✅ 결론

### 안전성 평가: ✅ **안전**

1. **파싱 로직 없음**: `name`에서 색상을 파싱하는 코드가 없음
2. **SSOT 준수**: 색상 정보는 `product_options.color`에서 관리
3. **스냅샷 필드**: 기존 데이터는 이력 보존 목적으로 그대로 유지됨 (정상)
4. **표시 로직**: 표시만 하므로 색상 제거해도 문제 없음

### 작업 범위

**변경 필요**:
1. `admin_products.name` 컬럼 업데이트 (SQL)
   - 패턴: `- Black`, `- Navy`, `- Light Blue` 등 제거

**변경 불필요**:
1. 프론트엔드 코드: 수정 불필요 (표시만 함)
2. 백엔드 코드: 수정 불필요 (파싱 없음)
3. 스냅샷 테이블: 수정 불필요 (이력 보존)

### 주의 사항

1. **기존 주문/보증서**: 색상 포함된 이름 그대로 유지됨 (정상)
2. **표시 일관성**: 신규 주문은 색상 없는 이름, 기존 주문은 색상 포함된 이름 (이력 보존 목적)

---

**문서 버전**: 1.0  
**작성일**: 2026-01-16
