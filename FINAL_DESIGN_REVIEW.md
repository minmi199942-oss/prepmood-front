# 제시된 설계 최종 검토 보고서

## 📊 검토 결과 요약

### ✅ 전체 평가: **구현 가능하며 설계가 우수함**
- 논리적 일관성: ⭐⭐⭐⭐⭐ (5/5)
- 현재 시스템 호환성: ⭐⭐⭐⭐ (4/5) - 마이그레이션 필요
- 구현 가능성: ⭐⭐⭐⭐⭐ (5/5)
- 효율성: ⭐⭐⭐⭐ (4/5) - 일부 최적화 가능

---

## ✅ 설계의 강점 (잘 설계된 부분)

### 1. SSOT 3중 분리 원칙 ⭐⭐⭐⭐⭐
**매우 우수한 설계**

```
orders.status → 집계/표시용
order_item_units.unit_status → 실물/물류 SSOT
warranties.status → 권리/보증 SSOT
```

**이유**: 
- 상태가 섞이면 환불/배송/보증 판정이 복잡해지고 버그가 생기기 쉽습니다
- 각 상태의 책임이 명확하여 유지보수가 쉬움
- **현재 시스템에는 이 분리가 없어서 반드시 도입 필요**

### 2. order_item_units 테이블 도입 ⭐⭐⭐⭐⭐
**핵심 개선사항**

**현재 문제점**:
- `order_items.quantity = 2`인 경우, 실물 2개를 개별 추적 불가
- 부분 배송/부분 환불 처리 불가
- 재고-토큰-보증서 1:1 매칭 불가

**제시된 설계 해결책**:
- `order_item_units` 테이블로 실물 단위별 추적
- quantity = 2면 order_item_units 2줄 생성
- 각 unit별로 stock_unit_id, token_id, warranty_id 연결

**결론**: **반드시 도입 필요**

### 3. paid 처리 시 warranty 반드시 생성 ⭐⭐⭐⭐⭐
**정책과 기술의 일치**

**현재 문제점**:
- 보증서는 QR 스캔 시점에 생성 (`/a/:token` GET/POST)
- 사용자가 QR을 안 찍으면 보증서가 없음
- 환불 정책(활성화 전 환불 가능)을 기술적으로 보장할 수 없음

**제시된 설계 해결책**:
- paid 시점에 warranty 생성 (issued 또는 issued_unassigned)
- 보증서는 항상 존재하므로 환불 판정 가능
- 활성화 전/후 정책을 기술적으로 보장

**결론**: **반드시 도입 필요**

### 4. claim과 active 분리 ⭐⭐⭐⭐⭐
**UX와 정책의 명확한 분리**

- **claim**: 소유권 귀속 (issued_unassigned → issued)
- **active**: 사용 개시 (환불 제한 시작)

**이유**: 
- 비회원 구매 후 계정 연동과 활성화를 분리하여 정책을 명확히 함
- 활성화 시 "환불 제한" 문구를 강제할 수 있음

**결론**: **매우 우수한 설계**

### 5. token_master.owner_* 사용 금지 규칙 ⭐⭐⭐⭐⭐
**SSOT 원칙 준수**

- 소유권 판정은 `warranties.owner_user_id`만 사용
- `token_master.owner_*`는 표시/추적용으로만

**이유**: 소유권 진실이 warranties에만 있으면 일관성 유지 가능

**결론**: **반드시 준수 필요**

---

## ⚠️ 발견된 문제점 및 개선 필요 사항

### 🔴 중요: 양방향 참조 문제 (3곳)

#### 문제 1: order_item_units ↔ warranties
**제시된 설계**:
```sql
warranties.source_order_item_unit_id (FK, UNIQUE)
order_item_units.warranty_id (FK, UNIQUE)  -- 양방향!
```

**문제점**:
- 양방향 참조는 데이터 일관성 문제를 일으킬 수 있음
- 어느 쪽이 "진실"인지 불명확

**권장 수정**:
```sql
-- 옵션 A: warranties만 order_item_units 참조 (단방향) ⭐ 추천
warranties.source_order_item_unit_id (FK, UNIQUE)
-- order_item_units.warranty_id는 제거

-- 조회 시: JOIN으로 해결
SELECT w.*, oiu.* 
FROM warranties w
JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.id
```

#### 문제 2: stock_units ↔ token_master
**제시된 설계**:
```sql
stock_units.token_id (FK to token_master, unique)
token_master.stock_unit_id (FK to stock_units, unique)  -- 양방향!
```

**권장 수정**:
```sql
-- stock_units만 token_master 참조 (단방향) ⭐ 추천
stock_units.token_id (FK, UNIQUE)
-- token_master.stock_unit_id는 제거
```

**이유**: 실물(stock_unit)이 토큰을 가지고 있는 것이 자연스러움

#### 문제 3: warranties ↔ token_master
**제시된 설계**:
```sql
warranties.token_id (FK, unique)
token_master.owner_warranty_public_id (FK)  -- 양방향!
```

**권장 수정**:
```sql
-- warranties만 token_master 참조 (단방향) ⭐ 추천
warranties.token_id (FK, UNIQUE)
-- token_master.owner_warranty_public_id는 제거 (또는 인덱스 없는 컬럼으로만 유지)
```

**이유**: 소유권은 `warranties.owner_user_id`가 진실

---

### 🟡 중요: paid 처리 트랜잭션 순서 최적화

#### 제시된 설계 순서
1. paid_events insert
2. order_item_units 생성 (stock_unit_id, token_id NULL)
3. 재고 배정
4. token 배정
5. warranty 생성
6. order_item_units 업데이트 (stock_unit_id, token_id, warranty_id)

#### 문제점
- NULL 값이 먼저 들어갔다가 나중에 업데이트해야 함
- 트랜잭션 내 UPDATE가 많아짐

#### 권장 개선 순서
```javascript
// 1. paid_events insert (멱등성 보장)
// 2. 재고 선택 및 배정 (FOR UPDATE SKIP LOCKED)
// 3. 토큰 확인 (stock_unit.token_id)
// 4. order_item_units 생성 (stock_unit_id, token_id 포함, warranty_id는 NULL)
// 5. warranty 생성 (source_order_item_unit_id, token_id 포함)
// 6. order_item_units.warranty_id 업데이트
```

**또는 더 나은 방법**:
```javascript
// warranty 생성 후 바로 order_item_units.warranty_id 업데이트
// 단, 이 경우 warranty.id를 먼저 알아야 함
```

---

### 🟡 중요: MySQL 제약 조건 문제

#### 문제: 부분 UNIQUE 인덱스
**제시된 설계**:
```sql
UNIQUE(stock_unit_id) where stock_unit_id not null  -- ❌ MySQL 미지원
UNIQUE(token_id) where token_id not null  -- ❌ MySQL 미지원
UNIQUE(warranty_id) where warranty_id not null  -- ❌ MySQL 미지원
```

**MySQL은 부분 UNIQUE 인덱스(WHERE 조건)를 지원하지 않습니다.**

#### 해결 방법
```sql
-- 옵션 A: NULL 허용 + 애플리케이션 레벨 검증 ⭐ 추천
UNIQUE(stock_unit_id)  -- NULL은 여러 개 가능 (MySQL 특성)
-- 애플리케이션에서 stock_unit_id IS NOT NULL인 경우만 UNIQUE 검증

-- 옵션 B: 별도 테이블로 분리
-- stock_unit_assignments 테이블 생성 (stock_unit_id UNIQUE)
```

**추천**: 옵션 A (애플리케이션 레벨 검증)
- 트랜잭션 내에서 검증하면 안전
- 단순하고 실용적

---

### 🟡 중요: paid_events의 UNIQUE 제약

#### 제시된 설계
```sql
paid_events.order_id (UNIQUE, FK)
```

#### 문제점
- `order_id`가 UNIQUE면, 한 주문에 대해 paid 처리가 1회만 가능
- **부분 환불 후 재결제** 같은 케이스는?

#### 권장 개선
```sql
-- 옵션 A: order_id + event_source 조합으로 UNIQUE
paid_events.order_id (FK)
paid_events.event_source (webhook/redirect/manual_verify)
UNIQUE(order_id, event_source)

-- 옵션 B: idempotency_key 기반 ⭐ 추천
paid_events.order_id (FK)
paid_events.idempotency_key (UNIQUE)
paid_events.event_source
```

**추천**: 옵션 B (idempotency_key 기반)
- webhook 재전송 같은 경우도 안전하게 처리 가능
- 더 유연함

---

### 🟡 중요: 현재 시스템과의 호환성 문제

#### 문제 1: 현재 warranties 생성 시점
- **현재**: QR 스캔 시점 (`/a/:token` GET/POST)
- **제시된 설계**: paid 시점

**영향**:
- 기존 보증서는 QR 스캔으로 생성됨
- 새 시스템은 paid 시점에 생성
- **마이그레이션 전략 필요**

**해결 방안**:
- 기존 보증서는 그대로 유지
- 새 주문부터 paid 시점에 warranty 생성
- QR 스캔 로직은 "활성화"로만 변경

#### 문제 2: 현재 warranties.user_id NOT NULL
- **현재**: `warranties.user_id` NOT NULL (비회원 불가)
- **제시된 설계**: `warranties.owner_user_id` NULL 허용

**마이그레이션 전략**:
```sql
-- 1단계: 컬럼 추가 (NULL 허용)
ALTER TABLE warranties
  ADD COLUMN owner_user_id INT NULL;

-- 2단계: 기존 데이터 마이그레이션
UPDATE warranties 
SET owner_user_id = user_id,
    status = 'active'  -- 기존 보증서는 활성 상태로 간주
WHERE owner_user_id IS NULL;

-- 3단계: FK 제약 해제 후 user_id 제거
ALTER TABLE warranties
  DROP FOREIGN KEY warranties_ibfk_1,
  DROP COLUMN user_id;

-- 4단계: 새 FK 추가
ALTER TABLE warranties
  ADD FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE SET NULL;
```

#### 문제 3: 현재 order_items에 quantity만 있음
- **현재**: `order_items.quantity` (예: quantity = 2)
- **제시된 설계**: `order_item_units` 테이블 (quantity = 2면 2줄)

**마이그레이션 전략**:
- 기존 주문은 `order_item_units` 생성 불필요 (재고 배정이 안 되어 있을 가능성 높음)
- 새 주문부터 `order_item_units` 사용
- 기존 주문 조회 시 `order_items`만 사용

---

### 🟡 중요: 현재 결제 성공 처리 로직 확인

#### 현재 상태 확인
- `backend/payments-routes.js` 64-386줄: `/api/payments/confirm`
- `backend/payments-routes.js` 697-765줄: `/api/payments/webhook`

**현재 처리 내용**:
1. 결제 확인 (토스 API 호출)
2. `payments` 테이블에 저장
3. `orders.status` 업데이트
4. 장바구니 정리 (회원인 경우)

**없는 것**:
- ❌ 재고 배정
- ❌ 인보이스 발급
- ❌ 보증서 생성
- ❌ order_item_units 생성

**결론**: **paid 처리 로직을 새로 구현해야 함**

---

### 🟢 효율성 개선 제안

#### 제안 1: order_item_units 배치 INSERT
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

#### 제안 2: 재고 배정 시 FOR UPDATE SKIP LOCKED
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
-- 주의: MySQL은 부분 인덱스를 지원하지 않으므로 일반 인덱스 사용

-- warranties 조회 최적화
CREATE INDEX idx_warranties_owner_status ON warranties(owner_user_id, status);
CREATE INDEX idx_warranties_order_unit ON warranties(source_order_item_unit_id);
```

---

## 🔍 설계의 모순이나 오류 발견

### 오류 1: token_master.id vs token
**제시된 설계**:
```sql
token_master.id (PK numeric)
token_master.token_hash (unique)
```

**현재 시스템**:
```sql
token_master.token (PK VARCHAR(20))
```

**확인 필요**: 
- `token_master`의 PK가 `token`인지 `id`인지 확인
- 제시된 설계는 `id`를 PK로 하고 `token_hash`를 별도로 두는 방식

**권장**: 현재 시스템 유지 (`token`을 PK로)
- 이유: 기존 데이터와의 호환성
- `token_hash`는 보안 강화용으로 추가 가능 (하지만 기존 `token` 컬럼 유지)

### 오류 2: warranties.token vs warranties.token_id
**제시된 설계**:
```sql
warranties.token_id (FK to token_master)
```

**현재 시스템**:
```sql
warranties.token (UNIQUE VARCHAR(20))
```

**확인 필요**:
- `warranties.token`을 `warranties.token_id`로 변경할지
- 또는 `warranties.token`을 유지하고 `token_master.token`과 직접 연결할지

**권장**: `warranties.token_id` (FK to token_master)
- 이유: 정규화 및 일관성
- 단, 기존 데이터 마이그레이션 필요

---

## 📋 현재 시스템 확인 필요 사항

### 즉시 확인 필요
1. [ ] `orders.user_id` 컬럼이 NULL 허용인지 확인
2. [ ] `orders_idempotency.user_id`가 NOT NULL인지 확인
3. [ ] 현재 결제 성공 처리 로직이 있는지 확인 ✅ (있음: `/api/payments/confirm`, `/api/payments/webhook`)
4. [ ] 현재 보증서 생성 로직이 QR 스캔 시점인지 확인 ✅ (맞음: `/a/:token` GET/POST)

### 추가 검토 필요
1. [ ] 기존 주문 데이터의 quantity 분해 전략
2. [ ] 기존 보증서 데이터의 마이그레이션 전략
3. [ ] 기존 토큰 데이터의 stock_unit 연결 전략

---

## 🎯 최종 검토 결과

### ✅ 구현 가능성: **매우 높음**
- 설계 자체는 논리적으로 일관성 있음
- 현재 시스템과의 차이는 마이그레이션으로 해결 가능
- SSOT 분리 원칙이 매우 우수함

### ⚠️ 주요 개선 필요 사항 (우선순위 순)

#### 1순위: 양방향 참조 제거 (필수)
- `order_item_units.warranty_id` 제거 → `warranties.source_order_item_unit_id`만 사용
- `token_master.stock_unit_id` 제거 → `stock_units.token_id`만 사용
- `token_master.owner_warranty_public_id` 제거 → `warranties.token_id`만 사용

#### 2순위: paid 처리 순서 최적화 (권장)
- NULL 값 최소화
- 배치 INSERT 사용
- FOR UPDATE SKIP LOCKED 사용

#### 3순위: MySQL 제약 조건 수정 (필수)
- 부분 UNIQUE 인덱스 제거
- 애플리케이션 레벨 검증 추가

#### 4순위: paid_events UNIQUE 제약 개선 (권장)
- `order_id` UNIQUE → `idempotency_key` UNIQUE로 변경

---

## 📝 권장 수정 사항 요약

### 1. 테이블 관계 단방향화 (필수)
```sql
-- warranties → order_item_units (단방향)
warranties.source_order_item_unit_id (FK, UNIQUE)
-- order_item_units.warranty_id는 제거

-- stock_units → token_master (단방향)
stock_units.token_id (FK, UNIQUE)
-- token_master.stock_unit_id는 제거

-- warranties → token_master (단방향)
warranties.token_id (FK, UNIQUE)
-- token_master.owner_warranty_public_id는 제거 (또는 인덱스 없는 컬럼으로만 유지)
```

### 2. paid 처리 순서 개선 (권장)
```javascript
// 권장 순서
1. paid_events insert (멱등성)
2. 재고 선택 및 배정 (FOR UPDATE SKIP LOCKED)
3. order_item_units 생성 (stock_unit_id, token_id 포함, warranty_id는 NULL)
4. warranty 생성 (source_order_item_unit_id, token_id 포함)
5. order_item_units.warranty_id 업데이트
```

### 3. UNIQUE 제약 조건 수정 (필수)
```sql
-- 부분 UNIQUE 인덱스 제거
-- 애플리케이션 레벨에서 검증
UNIQUE(stock_unit_id)  -- NULL은 여러 개 가능 (MySQL 특성)
-- 트랜잭션 내에서 stock_unit_id IS NOT NULL인 경우만 UNIQUE 검증
```

### 4. paid_events UNIQUE 제약 개선 (권장)
```sql
-- order_id UNIQUE → idempotency_key UNIQUE로 변경
paid_events.order_id (FK)
paid_events.idempotency_key (UNIQUE)
paid_events.event_source
```

---

## ✅ 설계 검증 결과

### 논리적 일관성: ✅ 우수
- SSOT 분리 원칙이 명확함
- 상태 머신이 논리적으로 일관성 있음
- 정책과 기술이 잘 맞물림

### 현재 시스템 호환성: ⚠️ 마이그레이션 필요
- 기존 데이터 마이그레이션 전략 필요
- 기존 API와의 호환성 고려 필요

### 구현 가능성: ✅ 매우 높음
- 모든 기능이 구현 가능
- MySQL 제약만 고려하면 됨

### 효율성: ⚠️ 일부 최적화 가능
- 배치 INSERT 사용
- FOR UPDATE SKIP LOCKED 사용
- 인덱스 최적화

---

## 🎯 최종 권장사항

### 반드시 수정해야 할 사항
1. **양방향 참조 제거**: 단방향 참조로 통일
2. **MySQL 제약 조건 수정**: 부분 UNIQUE 인덱스 제거
3. **paid_events UNIQUE 제약 개선**: idempotency_key 기반으로 변경

### 권장 개선 사항
1. **paid 처리 순서 최적화**: NULL 값 최소화
2. **배치 INSERT 사용**: 성능 개선
3. **FOR UPDATE SKIP LOCKED 사용**: 동시성 개선

### 설계 그대로 사용 가능한 부분
1. **SSOT 3중 분리 원칙**: 매우 우수
2. **order_item_units 테이블 도입**: 필수
3. **paid 처리 시 warranty 생성**: 필수
4. **claim과 active 분리**: 매우 우수
5. **token_master.owner_* 사용 금지**: 필수

---

## 📋 다음 단계

1. **양방향 참조 제거**: 설계 수정
2. **MySQL 제약 조건 수정**: 부분 UNIQUE 인덱스 제거
3. **paid_events UNIQUE 제약 개선**: idempotency_key 기반으로 변경
4. **마이그레이션 전략 수립**: 기존 데이터 보존 전략
5. **paid 처리 로직 구현**: 재고 배정 + 인보이스 + 보증서 생성







