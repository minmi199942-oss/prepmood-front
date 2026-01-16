# 주문 66번 실패 원인 분석 및 해결 방안

## 📋 문제 요약

**주문 번호**: `ORD-20260116-898198-EUFL4U`  
**결제 키**: `tprep202601161651385ZbW4`  
**증상**: 결제는 성공했지만 주문 처리가 완료되지 않음 (500 Internal Server Error)

---

## 🔍 최종 원인 확인

### 핵심 문제: `chk_order_status` 체크 제약 위반

**에러 메시지**:
```
Error: Check constraint 'chk_order_status' is violated.
at updateOrderStatus (/var/www/html/backend/utils/order-status-aggregator.js:110:49)
```

**원인**:
- `updateOrderStatus()` 함수가 `'paid'` 상태를 계산하려 시도
- 하지만 `orders` 테이블의 체크 제약(`chk_order_status`)에는 `'paid'`가 포함되지 않음
- 허용되는 상태: `'pending'`, `'confirmed'`, `'processing'`, `'shipped'`, `'delivered'`, `'cancelled'`, `'refunded'`

---

## 📊 설계 vs 구현 불일치 분석

### 1. 설계 문서 (FINAL_EXECUTION_SPEC_REVIEW.md)

**라인 58-70**: `orders.status` 집계 규칙 표
```
| `paid` | `paid_events` 존재 (또는 `paid_at` NOT NULL) AND `unit`이 1개 이상 `reserved` 이상 존재 | 결제 완료 |
```

**라인 63**: `paid` 상태가 설계에 명시적으로 포함됨

**라인 195** (SYSTEM_FLOW_DETAILED.md):
```
집계 규칙: paid_events 존재 + unit_status 기반으로 pending, paid, partial_shipped, shipped, partial_delivered, delivered, refunded 계산
```

### 2. 실제 DB 스키마

**체크 제약 정의** (`SHOW CREATE TABLE orders`):
```sql
CONSTRAINT `chk_order_status` CHECK ((`status` in (
  'pending',
  'confirmed', 
  'processing', 
  'shipped', 
  'delivered', 
  'cancelled', 
  'refunded'
)))
```

**`'paid'`가 포함되지 않음**

### 3. 코드 구현 (order-status-aggregator.js)

**라인 10** (주석):
```javascript
* - paid: paid_events 존재 AND unit이 1개 이상 reserved 이상 존재
```

**라인 88**:
```javascript
newStatus = hasPaidEvent || hasPaidAt ? 'paid' : 'pending';
```

**라인 106**:
```javascript
newStatus = 'paid';
```

**코드는 `'paid'`를 사용하려 시도**

### 4. 마이그레이션 파일 (optimize_orders_table.sql)

**라인 10-11**:
```sql
ADD CONSTRAINT `chk_order_status` 
CHECK (`status` IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'));
```

**`'paid'`가 포함되지 않음**

---

## 🎯 결론: 설계와 구현의 불일치

### 설계 문서
- ✅ `paid` 상태 사용 명시
- ✅ `FINAL_EXECUTION_SPEC_REVIEW.md`에서 `paid` 포함
- ✅ `SYSTEM_FLOW_DETAILED.md`에서 `paid` 포함

### 실제 구현
- ❌ DB 체크 제약에 `paid` 없음
- ❌ 마이그레이션 파일에 `paid` 없음
- ✅ 코드는 `paid` 사용 시도

### 문제 발생 시나리오

1. `processPaidOrder()` 실행
   - 재고 배정 → `order_item_units` 생성 → `warranties` 생성 시도
   - `warranties` INSERT에서 `verified_at` 에러 발생 가능 (66번과의 직접 연결은 불확실)

2. `updateOrderStatus()` 호출 (라인 509)
   - `paid_events`는 존재 (별도 커넥션, autocommit)
   - `order_item_units`는 0개 (아직 생성 안 됨 또는 롤백됨)
   - 이 상태에서 `hasPaidEvent = true`, `total = 0`이므로 라인 88 조건 충족
   - `newStatus = 'paid'` 계산

3. 체크 제약 위반
   - `UPDATE orders SET status = 'paid'` 실행 시도
   - `chk_order_status` 체크 제약 위반 → 에러 발생
   - 트랜잭션 실패 → 전체 롤백

---

## 🔧 해결 방안

### 옵션 1: DB 체크 제약에 `'paid'` 추가 (설계 문서 기준)

**장점**:
- 설계 문서와 일치
- 코드 수정 최소화

**단점**:
- `partial_shipped`, `partial_delivered`도 추가 필요
- 기존 데이터 마이그레이션 필요

**마이그레이션**:
```sql
ALTER TABLE orders
DROP CONSTRAINT chk_order_status;

ALTER TABLE orders
ADD CONSTRAINT chk_order_status 
CHECK (`status` IN (
  'pending', 
  'confirmed', 
  'processing', 
  'paid',              -- 추가
  'partial_shipped',   -- 추가
  'shipped', 
  'partial_delivered', -- 추가
  'delivered', 
  'cancelled', 
  'refunded'
));
```

### 옵션 2: 코드에서 `'paid'` 제거 (현재 DB 기준)

**장점**:
- DB 스키마 변경 불필요
- 즉시 적용 가능

**단점**:
- 설계 문서와 불일치
- `'paid'` 대신 `'processing'` 또는 `'confirmed'` 사용 필요

**코드 수정**:
```javascript
// order-status-aggregator.js 라인 88
// 현재
newStatus = hasPaidEvent || hasPaidAt ? 'paid' : 'pending';

// 수정
newStatus = hasPaidEvent || hasPaidAt ? 'processing' : 'pending';

// 라인 106
// 현재
newStatus = 'paid';

// 수정
newStatus = 'processing';
```

---

## 📝 권장 해결 방안

### 설계 문서 vs 실제 구현 불일치

**설계 문서** (`FINAL_EXECUTION_SPEC_REVIEW.md`):
- ✅ `paid` 상태 사용 명시 (라인 63)
- ✅ `partial_shipped`, `partial_delivered` 포함

**실제 DB 스키마**:
- ❌ `paid` 없음
- ❌ `partial_shipped` 없음
- ❌ `partial_delivered` 없음
- ✅ `confirmed`, `processing` 포함

**결론**: 설계 문서는 `paid`를 사용하도록 되어 있지만, 실제 DB는 `paid`를 허용하지 않음. 이것이 근본 원인.

### 해결 방안 선택 기준

**옵션 1: DB 체크 제약 수정 (설계 문서 기준)**
- 설계 문서와 일치
- `paid`, `partial_shipped`, `partial_delivered` 추가
- 마이그레이션 필요

**옵션 2: 코드 수정 (현재 DB 기준)**
- 즉시 적용 가능
- 설계 문서와 불일치
- `paid` → `processing` 변경

### 권장: 옵션 1 (설계 문서 정렬)

**이유**:
1. 설계 문서가 SSOT (단일 진실 원천)
2. `partial_*` 상태는 운영에 필요 (부분 배송 지원)
3. `paid` 상태는 결제 완료를 명확히 표현

**마이그레이션**:
```sql
ALTER TABLE orders
DROP CONSTRAINT chk_order_status;

ALTER TABLE orders
ADD CONSTRAINT chk_order_status 
CHECK (`status` IN (
  'pending', 
  'confirmed', 
  'processing', 
  'paid',              -- 추가 (설계 문서 기준)
  'partial_shipped',   -- 추가 (설계 문서 기준)
  'shipped', 
  'partial_delivered', -- 추가 (설계 문서 기준)
  'delivered', 
  'cancelled', 
  'refunded'
));
```

**코드 수정 불필요**: 현재 코드가 이미 `paid`를 사용하므로 DB만 수정하면 됨

---

## 🔍 추가 확인 사항

### `verified_at` 에러

**로그에 나타난 에러**:
```
Error: Field 'verified_at' doesn't have a default value
at processPaidOrder (/var/www/html/backend/utils/paid-order-processor.js:397:61)
```

**가능성**:
1. 66번 주문에서 발생했을 수 있음
2. 다른 주문에서 발생했을 수 있음 (로그가 섞여 있음)

**확인 필요**:
- 66번 주문 기준으로 로그 분리
- `verified_at` 값이 제대로 생성되는지 확인

### 재고 부족 에러

**로그에 나타난 에러**:
```
Error: 재고 부족: 상품 PM-26-ACC-Fabric-Tie-Solid, 필요: 1, 가용: 0
```

**확인**:
- 66번 주문에 해당 상품이 포함되어 있는지 확인
- 실제 재고 상태 확인

---

## 📚 참고 문서

- `FINAL_EXECUTION_SPEC_REVIEW.md`: orders.status 집계 규칙 (라인 58-70)
- `SYSTEM_FLOW_DETAILED.md`: 시스템 흐름 및 SSOT 규칙
- `backend/utils/order-status-aggregator.js`: 실제 구현 코드
- `backend/migrations/optimize_orders_table.sql`: 체크 제약 정의

---

## ✅ 다음 단계

### 즉시 수정 (권장: 옵션 1 - 설계 문서 정렬)

1. **DB 체크 제약 수정**: `'paid'`, `'partial_shipped'`, `'partial_delivered'` 추가
2. **검증**: 수정 후 66번 주문 재처리 테스트
3. **코드 검증**: `order-status-aggregator.js`가 이미 `paid`를 사용하므로 추가 수정 불필요

### 대안 (옵션 2 - 현재 DB 기준)

1. **코드 수정**: `order-status-aggregator.js`에서 `'paid'` → `'processing'` 변경
2. **검증**: 수정 후 66번 주문 재처리 테스트
3. **장기 계획**: DB 체크 제약에 `'paid'`, `'partial_shipped'`, `'partial_delivered'` 추가 (설계 문서 정렬)

---

## 📌 핵심 요약

**문제**: 설계 문서(`FINAL_EXECUTION_SPEC_REVIEW.md`)는 `paid` 상태를 사용하도록 되어 있지만, 실제 DB 체크 제약에는 `paid`가 없음.

**해결**: 
- **권장**: DB 체크 제약에 `paid`, `partial_shipped`, `partial_delivered` 추가 (설계 문서 정렬)
- **대안**: 코드에서 `paid` → `processing` 변경 (즉시 적용 가능)

**결론**: 설계 문서가 SSOT이므로, DB를 설계 문서에 맞추는 것이 올바른 방향입니다.
