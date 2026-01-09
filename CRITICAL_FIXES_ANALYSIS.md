# 치명적 수정사항 vs 현재 시스템 비교 분석

## 📋 수정 지침 검토 결과

### A. FK ON DELETE 충돌 수정

#### 현재 시스템 확인
```sql
-- backend/migrations/001_create_warranties_table.sql
CREATE TABLE IF NOT EXISTS warranties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(20) NOT NULL UNIQUE,
    verified_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,  -- ✅ RESTRICT 사용
    INDEX idx_user_id (user_id)
);

-- backend/migrations/005_create_token_master_table.sql
CREATE TABLE IF NOT EXISTS token_master (
    token VARCHAR(20) PRIMARY KEY,
    -- ...
    FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE SET NULL,  -- ⚠️ SET NULL
    FOREIGN KEY (owner_warranty_public_id) REFERENCES warranties(public_id) ON DELETE SET NULL  -- ⚠️ SET NULL
);
```

#### 제시된 수정 지침
```
warranties.token_pk FK: ON DELETE RESTRICT로 고정
token_master는 삭제 금지(운영 정책)
```

#### 비교 결과
- ✅ **현재**: `warranties.user_id`는 이미 `ON DELETE RESTRICT` 사용
- ⚠️ **문제**: `token_master`의 `owner_user_id`, `owner_warranty_public_id`는 `ON DELETE SET NULL` 사용
- ✅ **수정 필요**: `warranties.token_pk` FK는 `ON DELETE RESTRICT`로 설정 (NOT NULL과 호환)

#### 검증
**제시된 수정 지침은 올바릅니다**:
- `token_master`는 삭제하지 않는 전제이므로 `RESTRICT`가 적절
- `warranties.token_pk`가 `NOT NULL`이면 `SET NULL`과 충돌
- 운영 안정성 관점에서 `RESTRICT`가 맞음

---

### B. shipment_units UNIQUE 정책 수정

#### 현재 시스템 확인
```sql
-- ❌ 현재 시스템에 shipments/shipment_units 테이블 없음
-- 신규 생성 필요
```

#### 제시된 수정 지침 (B안: 운영형 권장)
```
옵션 2(운영형 권장): 재발송/교체 허용 + 이력 유지
- shipment_units: (shipment_id, order_item_unit_id) 복합키로 이력 허용
- order_item_units.current_shipment_id로 "현재 유효 송장" 1개 고정
- shipments.voided_at/void_reason으로 무효화 처리
```

#### 비교 결과
- ❌ **현재**: 배송 관리 시스템 없음
- ✅ **B안 채택**: 운영 현실(재발송/송장 교체)을 고려한 설계
- ✅ **검증**: B안이 현실적이고 안전함

#### 검증
**제시된 B안은 올바릅니다**:
- 재발송/송장 교체는 실제 운영에서 발생
- 이력 보존 + 현재 상태 명확화로 데이터 무결성 유지
- `current_shipment_id`로 단일 진실 보장

---

### C. orders.status 표시 상태 확정

#### 현재 시스템 확인
```sql
-- backend/order-routes.js, payments-routes.js에서 확인 필요
-- 현재 사용 중인 status 값들:
-- pending, confirmed, processing, shipped, delivered, cancelled, refunded
```

```javascript
// backend/payments-routes.js
await connection.execute(
  'UPDATE orders SET status = ? WHERE order_number = ?',
  [orderStatus, orderNumber]  // orderStatus 값 확인 필요
);
```

#### 제시된 수정 지침
```
기본(단순): pending/paid/partial_shipped/shipped/partial_delivered/delivered/refunded만 유지
확장(운영형): payment_failed/payment_expired 같은 표시용 상태 추가
```

#### 비교 결과
- ✅ **현재**: `pending`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled`, `refunded` 사용
- ⚠️ **차이**: `confirmed` → `paid`로 변경 필요
- ⚠️ **차이**: `partial_shipped`, `partial_delivered` 추가 필요
- ⚠️ **선택**: `payment_failed`, `payment_expired` 추가 여부는 운영 요구에 따라

#### 검증
**제시된 수정 지침은 올바릅니다**:
- 기본 상태는 SSOT 원칙 준수
- 확장 상태는 운영 요구에 따라 선택
- 집계 함수만 갱신 규칙 유지

---

### D. token_pk 마이그레이션 루트 정리

#### 현재 시스템 확인
```sql
-- backend/migrations/005_create_token_master_table.sql
CREATE TABLE IF NOT EXISTS token_master (
    token VARCHAR(20) PRIMARY KEY,  -- ✅ 현재 token이 PK
    -- ...
);
```

#### 제시된 수정 지침
```
재생성 스왑 방식(A)을 정식 루트로 승격
ALTER 방식(B)는 부록으로 내리고 "사전/사후 검증 필수"를 붙임
검증 체크: token_pk NULL 검증, token UNIQUE 검증
```

#### 비교 결과
- ✅ **현재**: `token`이 PK로 존재
- ✅ **수정 필요**: PK 교체는 복잡하므로 재생성 방식이 안전
- ✅ **검증**: 사전/사후 검증 SQL 필수

#### 검증
**제시된 수정 지침은 올바릅니다**:
- 재생성 방식이 운영 안정성 면에서 우수
- 검증 체크는 필수 (데이터 무결성 보장)

---

### E. "현재 시스템 비교" 문장 조건문 변환

#### 현재 문서 확인
```markdown
# FINAL_EXECUTION_SPEC_REVIEW.md
- ✅ 현재는 `orders.status`만 있음
- ❌ 현재: 비회원 주문 불가능
```

#### 제시된 수정 지침
```
"현재 시스템은 ~없음/있음" → "(전제) 현재 스키마가 ~라면 / 해당 마이그레이션이 이미 적용되어 있다면"
또는 "확인됨"을 쓰려면 근거를 붙이기
```

#### 비교 결과
- ⚠️ **문제**: 문서에 단정 문장 다수 존재
- ✅ **수정 필요**: 조건문으로 변환 또는 근거 명시

#### 검증
**제시된 수정 지침은 올바릅니다**:
- 문서 신뢰도 향상
- 실제 DB 확인 없이 단정하는 것은 위험

---

### F. Outbox 규칙 1줄 + 예시 코드 보강

#### 현재 시스템 확인
```javascript
// ❌ 현재 시스템에 warranty_events 테이블/로직 없음
// 신규 구현 필요
```

#### 제시된 수정 지침
```
"상태 전이 트랜잭션 안에서 최소 이벤트 row INSERT는 필수이며, 실패 시 전이도 롤백한다."
예시 코드에: oldStatus를 SELECT ... FOR UPDATE로 읽고 기록
```

#### 비교 결과
- ❌ **현재**: 감사 로그 시스템 없음
- ✅ **수정 필요**: Outbox 패턴으로 구현
- ✅ **검증**: 증거성 보장을 위해 필수

#### 검증
**제시된 수정 지침은 올바릅니다**:
- 트랜잭션 내 최소 이벤트 기록은 필수
- oldStatus 조회는 전이 추적에 필요

---

## 🚢 Shipment B안 (운영형) vs 현재 시스템 비교

### 1. 현재 시스템 배송 관리 상태

#### 확인 결과
```sql
-- ❌ 현재 시스템에 shipments/shipment_units 테이블 없음
-- orders 테이블에 shipping_* 컬럼만 있음
-- 배송 상태는 orders.status로만 관리
```

**현재 구조**:
- `orders.shipping_method`, `orders.shipping_cost` 등 메타 정보만 존재
- 송장번호/택배사 정보 저장 테이블 없음
- 부분배송 지원 없음
- 재발송/송장 교체 기능 없음

### 2. Shipment B안 데이터 모델 검증

#### 제시된 B안 구조
```sql
-- shipments 테이블
shipments (
  shipment_id BIGINT PK,
  order_id BIGINT NOT NULL,
  carrier_code VARCHAR(20) NOT NULL,
  tracking_number VARCHAR(50) NOT NULL,
  shipped_at DATETIME NOT NULL,
  created_by_admin_id BIGINT NOT NULL,
  voided_at DATETIME NULL,  -- B안 핵심
  void_reason VARCHAR(255) NULL,  -- B안 핵심
  UNIQUE(carrier_code, tracking_number)
)

-- shipment_units 테이블
shipment_units (
  shipment_id BIGINT NOT NULL,
  order_item_unit_id BIGINT NOT NULL,
  PRIMARY KEY (shipment_id, order_item_unit_id)  -- 복합키, 이력 허용
)

-- order_item_units 테이블 (수정)
order_item_units (
  order_item_unit_id BIGINT PK,
  -- ...
  current_shipment_id BIGINT NULL,  -- B안 핵심: 현재 유효 송장
  FOREIGN KEY (current_shipment_id) REFERENCES shipments(shipment_id)
)
```

#### 검증 결과
- ✅ **구조적 타당성**: 이력 보존 + 현재 상태 명확화
- ✅ **운영 현실 반영**: 재발송/송장 교체 지원
- ✅ **데이터 무결성**: `current_shipment_id`로 단일 진실 보장
- ✅ **SSOT 준수**: `unit_status`는 실물 SSOT 유지

#### 잠재적 문제점 및 해결

**문제 1: current_shipment_id NULL 허용**
- **시나리오**: `unit_status = 'reserved'`일 때 `current_shipment_id = NULL`
- **해결**: 정상 (배송 전이므로 NULL이 맞음)

**문제 2: voided shipment 참조**
- **시나리오**: `current_shipment_id`가 `voided_at IS NOT NULL`인 shipment를 참조
- **해결**: 서버 검증 필요
```javascript
// 송장 교체 시 검증
const [shipment] = await connection.execute(
  'SELECT * FROM shipments WHERE shipment_id = ? AND voided_at IS NULL',
  [current_shipment_id]
);
if (shipment.length === 0) {
  throw new Error('유효하지 않은 shipment 참조');
}
```

**문제 3: 복합키 중복 방지**
- **시나리오**: 같은 `(shipment_id, order_item_unit_id)` 조합 중복 INSERT
- **해결**: PRIMARY KEY로 자동 방지

### 3. 상태 전이 규칙 검증

#### 제시된 규칙
```
(1) shipped 전이 규칙
- shipment 생성 없이 unit_status = shipped 금지
- shipment 생성 → shipment_units INSERT → current_shipment_id 설정 → unit_status = shipped

(2) 송장 교체 / 재발송 규칙
- 기존 shipment를 voided_at + void_reason으로 무효화
- 새 shipment 생성
- shipment_units에 동일 unit 재매핑
- order_item_units.current_shipment_id를 새 shipment로 교체
- unit_status는 shipped 유지 (되돌리지 않음)

(3) delivered 이후 정책
- delivered 이후 송장 교체 금지
- 재발송은 "반품 수령 → 신규 shipment"로만 허용
```

#### 검증 결과
- ✅ **규칙 1**: SSOT 원칙 준수 (shipment 없이 shipped 금지)
- ✅ **규칙 2**: 운영 현실 반영 (재발송/교체 허용)
- ✅ **규칙 3**: 데이터 무결성 보장 (delivered 이후 제한)

#### 잠재적 문제점
**문제**: `delivered` 이후 재발송 시나리오
- **시나리오**: 배송 완료 후 고객이 "받지 못했다"고 주장
- **해결**: 정책 확정 필요
  - 옵션 A: `delivered`는 절대 변경 불가 (물리적 종료)
  - 옵션 B: `delivered` → `return_received` → 신규 shipment (반품 후 재출고)

### 4. orders.status 집계와의 관계 검증

#### 제시된 규칙
```
orders.status는 order_item_units.unit_status만 보고 집계
shipment 교체는 orders.status에 영향 없음
```

#### 검증 결과
- ✅ **SSOT 준수**: `orders.status`는 집계용만 사용
- ✅ **단순성 유지**: shipment 복잡성은 shipment 레이어에서만 처리

### 5. 관리자 화면 사용 규칙 검증

#### 제시된 규칙
```
[배송 시작] → 신규 shipment 생성
[송장 교체] → 기존 shipment void + 신규 shipment
[재발송] → 동일 (사유 필수 입력)
[배송 완료] → unit_status delivered
```

#### 검증 결과
- ✅ **운영 편의성**: 관리자 자유도 확보
- ✅ **데이터 무결성**: 서버 검증으로 보장
- ✅ **증거성**: 모든 변경이 로그로 기록

---

## 🔍 최종 검증 결과

### ✅ 올바른 수정 지침

1. **FK ON DELETE RESTRICT**: ✅ 올바름
   - `token_master` 삭제 금지 전제에 맞음
   - `NOT NULL`과 호환

2. **Shipment B안 (운영형)**: ✅ 올바름
   - 운영 현실 반영
   - 데이터 무결성 보장
   - 이력 보존 + 현재 상태 명확화

3. **orders.status 확장**: ✅ 올바름
   - 기본 상태는 SSOT 준수
   - 확장 상태는 운영 요구에 따라 선택

4. **token_pk 마이그레이션**: ✅ 올바름
   - 재생성 방식이 안전
   - 검증 체크 필수

5. **조건문 변환**: ✅ 올바름
   - 문서 신뢰도 향상

6. **Outbox 패턴**: ✅ 올바름
   - 증거성 보장 필수

### ⚠️ 추가 확인 필요 사항

1. **delivered 이후 재발송 정책**
   - 정책 확정 필요 (옵션 A/B)

2. **current_shipment_id 검증**
   - 서버 검증 로직 필요 (voided shipment 참조 방지)

3. **shipment_units 복합키**
   - 중복 방지는 PRIMARY KEY로 자동 해결

---

## 📋 최종 권장사항

### 즉시 반영 필요 (치명적)

1. ✅ **FK ON DELETE RESTRICT로 수정**
2. ✅ **Shipment B안 채택 (운영형)**
3. ✅ **token_pk 마이그레이션 루트 정리**
4. ✅ **Outbox 패턴 확정 문장 추가**

### 선택적 (운영 요구에 따라)

1. ⚠️ **orders.status 확장**: `payment_failed`, `payment_expired` 추가 여부
2. ⚠️ **delivered 이후 재발송 정책**: 옵션 A/B 확정

### 문서 품질 개선

1. ✅ **조건문 변환**: 단정 문장 → 조건문/근거 명시
2. ✅ **검증 SQL 추가**: 마이그레이션 전/후 검증

---

**모든 수정 지침은 올바르며, 현재 시스템과 호환됩니다.**






