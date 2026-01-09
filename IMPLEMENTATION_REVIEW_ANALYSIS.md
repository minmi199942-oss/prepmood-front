# 다른 AI 제안 검토 결과

## 🔍 검토 범위
- 설계 문서: `FINAL_EXECUTION_SPEC_REVIEW.md`, `SYSTEM_FLOW_DETAILED.md`
- 현재 코드: `backend/migrations/`, `backend/auth-routes.js`, `backend/admin-cli.js`
- 현재 DB 구조: `warranties`, `token_master`, `orders`

---

## ✅ 다른 AI 제안 중 옳은 부분

### 1. token_pk 마이그레이션 복잡성 인식 ✅
**다른 AI의 제안**: token_pk 마이그레이션을 별도 Phase로 분리

**검토 결과**: ✅ **옳습니다**
- 설계 문서에서도 마이그레이션 복잡성을 명시 (FINAL_EXECUTION_SPEC_REVIEW.md 633-811줄)
- PK 교체는 단순 ADD 불가능, 테이블 재생성 필요
- 백업 필수, 위험도 높음

### 2. FK 추가 순서 조정 ✅
**다른 AI의 제안**: warranties FK 추가를 2단계로 분리

**검토 결과**: ✅ **옳습니다**
- `order_item_units` 생성 전에는 FK 추가 불가
- 컬럼 추가와 FK 추가를 분리하는 것이 안전

---

## ⚠️ 다른 AI 제안 중 문제점

### 1. 설계 문서와 불일치 🔴 **심각**

**다른 AI의 제안**: 
- `stock_units.token_pk` → `stock_units.token`으로 변경
- `order_item_units.token_pk` → `order_item_units.token`으로 변경

**설계 문서 요구사항**:
```sql
-- SYSTEM_FLOW_DETAILED.md 108줄
INSERT INTO order_item_units 
(order_item_id, unit_seq, stock_unit_id, token_pk, unit_status, created_at)
VALUES (?, ?, ?, ?, 'reserved', NOW())

-- SYSTEM_FLOW_DETAILED.md 117줄
INSERT INTO warranties 
(source_order_item_unit_id, token_pk, owner_user_id, status, created_at)
VALUES (?, ?, ?, ?, NOW())
```

**문제점**:
1. ❌ 설계 문서에서 명확히 `token_pk` 사용 명시
2. ❌ 나중에 마이그레이션 시 `stock_units`, `order_item_units`도 함께 변경 필요 (이중 작업)
3. ❌ 설계 문서와 코드 불일치 발생

**검토 결과**: ❌ **설계 문서 위반**

### 2. 현재 구조 확인 부족 ⚠️

**다른 AI의 가정**: 
- `warranties.token` → `token_master.token` FK가 있다고 가정

**실제 구조**:
```sql
-- backend/migrations/002_fix_warranties_fk.sql 확인
CREATE TABLE warranties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(20) NOT NULL UNIQUE,  -- ⚠️ FK 없음!
    ...
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT
    -- token에 대한 FK 없음
);
```

**검토 결과**: ⚠️ **FK가 없으므로 FK 제거 작업 불필요**

### 3. 마이그레이션 순서 문제 ⚠️

**다른 AI의 제안 순서**:
1. `stock_units` 생성 (token 사용)
2. `order_item_units` 생성 (token 사용)
3. 나중에 token_pk 마이그레이션
4. stock_units, order_item_units도 함께 변경

**문제점**:
- 이중 작업 발생 (token으로 생성 → token_pk로 변경)
- 데이터 마이그레이션 2번 필요
- 설계 문서와 불일치

---

## 🎯 올바른 접근 방법

### 옵션 A: 설계 문서 완전 준수 (권장) ✅

**순서**:
1. **token_pk 마이그레이션 먼저 완료** (Phase 1-1)
   - `token_master.token_pk` 추가 및 PK 교체
   - `warranties.token_pk` 추가 및 FK 전환
   - 기존 코드 수정 (`token` → `token_pk`)

2. **그 다음 신규 테이블 생성** (Phase 1-2)
   - `paid_events` 생성
   - `orders.paid_at` 추가
   - `stock_units` 생성 (`token_pk` 사용)
   - `order_item_units` 생성 (`token_pk` 사용)
   - `warranties` 컬럼 추가 (`token_pk` 사용)

**장점**:
- ✅ 설계 문서 완전 준수
- ✅ 이중 작업 없음
- ✅ 일관성 유지

**단점**:
- ⚠️ token_pk 마이그레이션이 복잡하고 시간 소요
- ⚠️ 결제 에러 해결이 지연될 수 있음

### 옵션 B: 실용적 접근 (절충안) ⚠️

**순서**:
1. **즉시 결제 에러 해결** (Phase 0)
   - `paid_events` 생성
   - `orders.paid_at` 추가
   - 코드 수정 (token 사용, 임시)

2. **token_pk 마이그레이션** (Phase 1)
   - `token_master.token_pk` 추가 및 PK 교체
   - `warranties.token_pk` 추가 및 FK 전환

3. **신규 테이블 생성** (Phase 2)
   - `stock_units` 생성 (`token_pk` 사용)
   - `order_item_units` 생성 (`token_pk` 사용)
   - `warranties` 컬럼 추가 (`token_pk` 사용)

**장점**:
- ✅ 결제 에러 빠르게 해결
- ✅ 설계 문서 최종 목표 달성

**단점**:
- ⚠️ Phase 0에서 token 사용 (임시)
- ⚠️ Phase 1에서 코드 수정 필요

---

## 📊 최종 평가

### 다른 AI 제안 평가

| 항목 | 평가 | 이유 |
|------|------|------|
| token_pk 마이그레이션 분리 | ✅ 옳음 | 복잡성 인식 정확 |
| FK 추가 순서 조정 | ✅ 옳음 | 의존성 고려 정확 |
| token 사용 제안 | ❌ **문제** | 설계 문서 위반 |
| 마이그레이션 순서 | ⚠️ 비효율 | 이중 작업 발생 |

### 충돌 가능성 분석

**다른 AI 제안대로 진행 시**:
1. ✅ 즉시 결제 에러 해결 가능
2. ❌ 설계 문서와 불일치 발생
3. ❌ 나중에 token_pk 마이그레이션 시 stock_units, order_item_units도 변경 필요
4. ❌ 데이터 마이그레이션 2번 필요

**올바른 순서대로 진행 시**:
1. ⚠️ token_pk 마이그레이션 먼저 필요 (시간 소요)
2. ✅ 설계 문서 완전 준수
3. ✅ 일관성 유지
4. ✅ 이중 작업 없음

---

## 🎯 최종 권장사항

### 권장: 옵션 B (실용적 접근) + 설계 문서 수정

**이유**:
1. **결제 에러 해결 우선**: 사용자 경험 최우선
2. **설계 문서 수정 필요**: token_pk 마이그레이션 전까지 token 사용 허용 명시
3. **단계적 전환**: Phase 0 (token) → Phase 1 (token_pk) → Phase 2 (신규 테이블)

**실행 계획**:

#### Phase 0: 즉시 결제 에러 해결 (임시)
```sql
-- 022_create_paid_events_table.sql
CREATE TABLE paid_events (
    event_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    payment_key VARCHAR(255) NOT NULL,
    ...
    UNIQUE KEY uk_paid_events_order_payment (order_id, payment_key)
);

-- 023_add_orders_paid_at.sql
ALTER TABLE orders
ADD COLUMN paid_at DATETIME NULL COMMENT '결제 완료 시점 (paid_events 기반)';
```

**코드 수정** (임시, token 사용):
```javascript
// payments-routes.js
// paid_events INSERT
// paid_at UPDATE
// token 사용 (임시)
```

#### Phase 1: token_pk 마이그레이션
```sql
-- token_master.token_pk 추가 및 PK 교체
-- warranties.token_pk 추가 및 FK 전환
-- 기존 코드 수정 (token → token_pk)
```

#### Phase 2: 신규 테이블 생성 (token_pk 사용)
```sql
-- stock_units 생성 (token_pk 사용)
-- order_item_units 생성 (token_pk 사용)
-- warranties 컬럼 추가 (token_pk 사용)
```

---

## 💬 결론

**다른 AI의 제안**:
- ✅ 일부는 옳음 (마이그레이션 복잡성 인식, FK 순서)
- ❌ 설계 문서 위반 (token 사용)
- ⚠️ 비효율적 (이중 작업)

**최종 권장**:
- ✅ 옵션 B (실용적 접근) + 설계 문서 수정
- ✅ Phase 0에서 임시로 token 사용 허용
- ✅ Phase 1에서 token_pk 마이그레이션 완료
- ✅ Phase 2에서 신규 테이블 생성 (token_pk 사용)

**다음 단계**:
1. 설계 문서에 "Phase 0에서는 token 사용 허용" 명시
2. Phase 0 마이그레이션 작성 (paid_events, paid_at)
3. 코드 수정 (임시, token 사용)
4. Phase 1 계획 수립 (token_pk 마이그레이션)
