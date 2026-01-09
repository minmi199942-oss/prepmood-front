# 제시된 설계 검토 분석 보고서

## 📋 검토 범위
- 현재 시스템 구조와의 호환성
- 설계의 논리적 일관성
- 구현 가능성
- 효율성 개선 방안
- 모순이나 오류 발견

---

## ✅ 설계의 강점 (잘 설계된 부분)

### 1. SSOT 3중 분리 원칙
**✅ 매우 우수한 설계**
- `orders.status`: 집계/표시용
- `order_item_units.unit_status`: 실물/물류 SSOT
- `warranties.status`: 권리/보증 SSOT

**이유**: 상태가 섞이면 환불/배송/보증 판정이 복잡해지고 버그가 생기기 쉽습니다. 이 분리는 필수입니다.

### 2. order_item_units 테이블 도입
**✅ 핵심 개선사항**
- 현재: `order_items`에 `quantity`만 있음 → 실물 단위 추적 불가
- 제시된 설계: `order_item_units`로 실물 단위별 추적 가능

**이유**: 
- 부분 배송/부분 환불 처리 가능
- 실물별 상태 관리 가능
- 재고-토큰-보증서 1:1 매칭 명확

### 3. paid 처리 시 warranty 반드시 생성
**✅ 정책과 기술의 일치**
- 현재: QR 스캔 시점에 warranty 생성 (사용자가 QR을 안 찍으면 보증서 없음)
- 제시된 설계: paid 시점에 warranty 생성 (보증서는 항상 존재)

**이유**: 
- 환불 정책(활성화 전 환불 가능)을 기술적으로 보장
- 보증서가 없어서 환불 판정을 못 하는 상황 방지

### 4. claim과 active 분리
**✅ UX와 정책의 명확한 분리**
- claim: 소유권 귀속 (issued_unassigned → issued)
- active: 사용 개시 (환불 제한 시작)

**이유**: 비회원 구매 후 계정 연동과 활성화를 분리하여 정책을 명확히 함

### 5. token_master.owner_* 사용 금지 규칙
**✅ SSOT 원칙 준수**
- 소유권 판정은 `warranties.owner_user_id`만 사용
- `token_master.owner_*`는 표시/추적용으로만

**이유**: 소유권 진실이 warranties에만 있으면 일관성 유지 가능

---

## ⚠️ 발견된 문제점 및 개선 필요 사항

### 1. **중요: order_item_units와 warranties의 연결 방식**

#### 제시된 설계
```sql
warranties.source_order_item_unit_id (FK to order_item_units.id, unique)
```

#### 문제점
- `warranties`가 `order_item_units`를 직접 참조하는 것은 좋지만,
- `order_item_units.warranty_id`도 있다고 했는데, 이는 **양방향 참조**입니다.
- 양방향 참조는 데이터 일관성 문제를 일으킬 수 있습니다.

#### 권장 개선
```sql
-- 옵션 A: warranties만 order_item_units 참조 (단방향)
warranties.source_order_item_unit_id (FK, UNIQUE)
-- order_item_units.warranty_id는 제거

-- 옵션 B: order_item_units만 warranties 참조 (단방향)
order_item_units.warranty_id (FK, UNIQUE)
-- warranties.source_order_item_unit_id는 제거
```

**추천**: 옵션 A (warranties가 order_item_units 참조)
- 이유: warranty가 "권리" 객체이므로, 어떤 unit에서 나왔는지 기록하는 것이 자연스러움
- order_item_units에서 warranty를 찾을 때는 JOIN으로 해결

---

### 2. **paid 처리 트랜잭션의 순서 문제**

#### 제시된 설계 순서
1. paid_events insert
2. order_item_units 생성
3. 재고 배정
4. token 배정
5. warranty 생성

#### 문제점
- `order_item_units`를 먼저 생성하고 나중에 `stock_unit_id`, `token_id`, `warranty_id`를 연결하는 방식
- 이렇게 하면 NULL 값이 먼저 들어갔다가 나중에 업데이트해야 함

#### 권장 개선 순서
```javascript
// 1. paid_events insert (멱등성 보장)
// 2. 재고 선택 및 배정 (FOR UPDATE로 잠금)
// 3. order_item_units 생성 (stock_unit_id, token_id 포함)
// 4. warranty 생성 (order_item_unit_id 포함)
// 5. order_item_units.warranty_id 업데이트 (또는 warranty 생성 시점에 바로 연결)
```

**또는 더 나은 방법**:
- `order_item_units` 생성 시 필요한 모든 정보를 한 번에 넣기
- 재고 배정 → 토큰 확인 → warranty 생성 → order_item_units 생성 (모든 FK 포함)

---

### 3. **token_master와 stock_units의 관계**

#### 제시된 설계
```sql
stock_units.token_id (FK to token_master, unique, nullable)
token_master.stock_unit_id (FK to stock_units, unique, nullable)
```

#### 문제점
- **양방향 참조**로 인한 순환 참조 가능성
- 어느 쪽이 "진실"인지 불명확

#### 권장 개선
```sql
-- 옵션 A: stock_units가 token_master 참조 (단방향)
stock_units.token_id (FK, UNIQUE)
-- token_master.stock_unit_id는 제거

-- 옵션 B: token_master가 stock_units 참조 (단방향)
token_master.stock_unit_id (FK, UNIQUE)
-- stock_units.token_id는 제거
```

**추천**: 옵션 A (stock_units.token_id)
- 이유: 실물(stock_unit)이 토큰을 가지고 있는 것이 자연스러움
- token_master는 "토큰 생명주기"만 관리

---

### 4. **warranties와 token_master의 관계**

#### 제시된 설계
```sql
warranties.token_id (FK, unique, nullable)
token_master.owner_warranty_public_id (FK, nullable)
```

#### 문제점
- **양방향 참조** (위와 동일한 문제)
- `token_master.owner_warranty_public_id`는 "표시/추적용"이라고 했는데, FK로 연결하면 로직에서 사용할 위험

#### 권장 개선
```sql
-- warranties만 token_master 참조 (단방향)
warranties.token_id (FK, UNIQUE)
-- token_master.owner_warranty_public_id는 제거 (또는 인덱스 없는 컬럼으로만 유지)
```

**이유**: 
- 소유권은 `warranties.owner_user_id`가 진실
- `token_master.owner_warranty_public_id`는 조회 편의용으로만 사용 (FK 제약 없이)

---

### 5. **paid_events의 UNIQUE 제약**

#### 제시된 설계
```sql
paid_events.order_id (UNIQUE, FK)
```

#### 문제점
- `order_id`가 UNIQUE면, 한 주문에 대해 paid 처리가 1회만 가능
- 하지만 **부분 환불 후 재결제** 같은 케이스는?

#### 권장 개선
```sql
-- 옵션 A: order_id + event_source 조합으로 UNIQUE
paid_events.order_id (FK)
paid_events.event_source (webhook/redirect/manual_verify)
UNIQUE(order_id, event_source)

-- 옵션 B: idempotency_key 기반
paid_events.order_id (FK)
paid_events.idempotency_key (UNIQUE)
```

**추천**: 옵션 B (idempotency_key 기반)
- 이유: webhook 재전송 같은 경우도 안전하게 처리 가능

---

### 6. **현재 시스템과의 호환성 문제**

#### 문제 1: 현재 warranties 생성 시점
- **현재**: QR 스캔 시점 (`/a/:token` GET/POST)
- **제시된 설계**: paid 시점

**영향**:
- 기존 보증서는 QR 스캔으로 생성됨
- 새 시스템은 paid 시점에 생성
- **마이그레이션 전략 필요**

#### 문제 2: 현재 warranties.user_id NOT NULL
- **현재**: `warranties.user_id` NOT NULL (비회원 불가)
- **제시된 설계**: `warranties.owner_user_id` NULL 허용

**영향**:
- 기존 보증서는 모두 회원 소유
- 마이그레이션 시 `owner_user_id = user_id`로 설정

#### 문제 3: 현재 order_items에 quantity만 있음
- **현재**: `order_items.quantity` (예: quantity = 2)
- **제시된 설계**: `order_item_units` 테이블 (quantity = 2면 2줄)

**영향**:
- 기존 주문은 `order_item_units`가 없음
- 마이그레이션 시 기존 `order_items`를 `order_item_units`로 변환 필요
- 단, 기존 주문은 재고 배정이 안 되어 있을 가능성 높음

---

### 7. **효율성 개선 제안**

#### 제안 1: order_item_units 생성 최적화
제시된 설계는 quantity만큼 반복 INSERT하는데, **배치 INSERT**로 개선 가능:

```javascript
// 현재 방식 (비효율)
for (let i = 0; i < quantity; i++) {
  await connection.execute('INSERT INTO order_item_units ...');
}

// 개선 방식 (효율적)
const units = Array.from({ length: quantity }, (_, i) => [
  order_item_id, i + 1, stock_unit_id, token_id, ...
]);
await connection.execute(
  'INSERT INTO order_item_units (...) VALUES ?',
  [units]
);
```

#### 제안 2: 재고 배정 시 FOR UPDATE 최적화
```sql
-- 현재 제시된 방식
SELECT id FROM stock_units WHERE ... LIMIT ? FOR UPDATE

-- 개선: 한 번에 잠금하고 배정
SELECT id FROM stock_units 
WHERE product_id = ? AND status = 'in_stock' 
ORDER BY id 
LIMIT ? 
FOR UPDATE SKIP LOCKED  -- 다른 트랜잭션과 충돌 최소화
```

#### 제안 3: 인덱스 최적화
```sql
-- order_item_units 조회 최적화
CREATE INDEX idx_order_item_units_order_item ON order_item_units(order_item_id, unit_seq);
CREATE INDEX idx_order_item_units_stock ON order_item_units(stock_unit_id) WHERE stock_unit_id IS NOT NULL;
CREATE INDEX idx_order_item_units_warranty ON order_item_units(warranty_id) WHERE warranty_id IS NOT NULL;

-- warranties 조회 최적화
CREATE INDEX idx_warranties_owner_status ON warranties(owner_user_id, status);
CREATE INDEX idx_warranties_order_unit ON warranties(source_order_item_unit_id) WHERE source_order_item_unit_id IS NOT NULL;
```

---

### 8. **설계의 모순이나 오류**

#### 오류 1: token_master.id vs token
제시된 설계에서 `token_master.id (PK numeric)`라고 했는데,
현재 시스템은 `token_master.token (PK VARCHAR(20))`입니다.

**확인 필요**: 
- `token_master`의 PK가 `token`인지 `id`인지 확인
- 제시된 설계는 `id`를 PK로 하고 `token_hash`를 별도로 두는 방식

**권장**: 현재 시스템 유지 (`token`을 PK로)
- 이유: 기존 데이터와의 호환성
- `token_hash`는 보안 강화용으로 추가 가능

#### 오류 2: warranties.token UNIQUE 제약
제시된 설계에서 `warranties.token_id`가 있는데,
현재 시스템은 `warranties.token (UNIQUE)`입니다.

**확인 필요**:
- `warranties.token`을 `warranties.token_id`로 변경할지
- 또는 `warranties.token`을 유지하고 `token_master.token`과 직접 연결할지

**권장**: `warranties.token_id` (FK to token_master)
- 이유: 정규화 및 일관성
- 단, 기존 데이터 마이그레이션 필요

#### 오류 3: order_item_units의 UNIQUE 제약
제시된 설계:
```sql
UNIQUE(order_item_id, unit_seq)
UNIQUE(stock_unit_id) where stock_unit_id not null
UNIQUE(token_id) where token_id not null
UNIQUE(warranty_id) where warranty_id not null
```

**문제**: MySQL은 **부분 UNIQUE 인덱스(WHERE 조건)**를 지원하지 않습니다.

**해결 방법**:
```sql
-- 옵션 A: NULL 허용 + 애플리케이션 레벨 검증
UNIQUE(stock_unit_id)  -- NULL은 여러 개 가능 (MySQL 특성)
-- 애플리케이션에서 stock_unit_id IS NOT NULL인 경우만 UNIQUE 검증

-- 옵션 B: 별도 테이블로 분리
-- stock_unit_assignments 테이블 생성 (stock_unit_id UNIQUE)
```

**추천**: 옵션 A (애플리케이션 레벨 검증)
- 이유: 단순하고 실용적
- 트랜잭션 내에서 검증하면 안전

---

### 9. **현재 시스템에서 확인 필요 사항**

#### 즉시 확인 필요
1. [ ] `orders.user_id`가 NULL 허용인지 확인
2. [ ] `orders_idempotency.user_id`가 NOT NULL인지 확인
3. [ ] 현재 결제 성공 처리 로직이 있는지 확인
4. [ ] 현재 보증서 생성 로직이 QR 스캔 시점인지 확인

#### 추가 검토 필요
1. [ ] 기존 주문 데이터의 quantity 분해 전략
2. [ ] 기존 보증서 데이터의 마이그레이션 전략
3. [ ] 기존 토큰 데이터의 stock_unit 연결 전략

---

## 🎯 최종 검토 결과

### ✅ 구현 가능성: **높음**
- 설계 자체는 논리적으로 일관성 있음
- 현재 시스템과의 차이는 마이그레이션으로 해결 가능

### ⚠️ 주요 개선 필요 사항
1. **양방향 참조 제거**: 단방향 참조로 통일
2. **paid 처리 순서 최적화**: NULL 값 최소화
3. **UNIQUE 제약 조건 수정**: MySQL 제약 고려
4. **배치 INSERT 최적화**: 성능 개선

### 📝 권장 수정 사항 요약

#### 1. 테이블 관계 단방향화
- `warranties` → `order_item_units` (단방향)
- `stock_units` → `token_master` (단방향)
- `warranties` → `token_master` (단방향)

#### 2. paid 처리 순서 개선
```javascript
// 권장 순서
1. paid_events insert (멱등성)
2. 재고 선택 및 배정 (FOR UPDATE SKIP LOCKED)
3. order_item_units 생성 (stock_unit_id, token_id 포함, warranty_id는 NULL)
4. warranty 생성 (order_item_unit_id, token_id 포함)
5. order_item_units.warranty_id 업데이트
```

#### 3. UNIQUE 제약 조건 수정
- 부분 UNIQUE 인덱스 제거
- 애플리케이션 레벨 검증 추가

#### 4. 성능 최적화
- 배치 INSERT 사용
- 인덱스 최적화
- FOR UPDATE SKIP LOCKED 사용

---

## 📋 다음 단계

1. **현재 DB 스키마 확인**: 실제 테이블 구조 확인
2. **마이그레이션 전략 수립**: 기존 데이터 보존 전략
3. **양방향 참조 제거**: 단방향 참조로 수정
4. **paid 처리 로직 최적화**: 순서 및 배치 처리 개선
5. **테스트 계획 수립**: 각 Phase별 테스트 시나리오







