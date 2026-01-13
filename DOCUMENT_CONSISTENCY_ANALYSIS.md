# 문서 일관성 분석 보고서

**분석일**: 2026-01-11  
**분석 대상**:
1. `FINAL_EXECUTION_SPEC_REVIEW.md` (기준 문서)
2. `SYSTEM_FLOW_DETAILED.md` (흐름도 문서)
3. `COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md` (구현 로드맵)

---

## ✅ 일치하는 부분

### 1. SSOT 규칙 (완전 일치)
**세 문서 모두 동일하게 명시**:
- `orders.status`: 집계 결과, 판정에 사용 금지
- `order_item_units.unit_status`: 물류 단위 상태 SSOT
- `stock_units.status`: 실물 재고 상태 SSOT
- `warranties.status`: 권리/정책 상태 SSOT
- `invoices`: 문서(스냅샷), 판정에 사용 금지

### 2. warranties.status 전이표 (완전 일치)
**FINAL_EXECUTION_SPEC_REVIEW.md (510-558줄)**와 **COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md (1805-1837줄)**가 동일:
- 전이 가능 상태 동일
- 전이 조건 동일 (`paid_events` 생성된 경우만 허용 등)
- 전이 불가능한 상태 동일
- UPDATE 패턴 동일 (`WHERE status IN (...) + affectedRows=1`)

### 3. orders.status 집계 규칙 (완전 일치)
**세 문서 모두 동일**:
- `partial_shipped`, `partial_delivered` 확정
- `paid_events` 존재가 SSOT
- `paid_at`은 캐시/파생 필드
- 관리자 수동 수정 금지

### 4. 환불 정책 (완전 일치)
**핵심 정책 일치**:
- 고객 직접 요청 불가 (문의 시스템으로만 접수)
- 관리자 수동 처리
- `warranties.status`만 본다 (SSOT)
- 토큰 재발급 없음
- 재판매 시 같은 token 사용
- 첫 활성화 시 인보이스 연동 확인 (핵심 방어)

### 5. 멱등성 계층표 (완전 일치)
**FINAL_EXECUTION_SPEC_REVIEW.md (2067-2084줄)**와 **COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md (1837-1851줄)**가 동일:
- 각 단계별 멱등성 메커니즘 동일
- 검증 방법 동일
- 실패 시 처리 동일

### 6. 전역 정합성 규칙 (완전 일치)
**세 문서 모두 동일**:
- 락 순서: `stock_units` → `orders` → `warranties` → `invoices`
- 원자성 규칙: `UPDATE ... WHERE 조건` + `affectedRows=1`
- UNIQUE 제약 동일
- 토큰 체계 동일

---

## ⚠️ 차이점 (의도적 또는 실제 구조 반영)

### 1. warranty_events 테이블 구조

**FINAL_EXECUTION_SPEC_REVIEW.md (1126-1140줄)**:
```sql
CREATE TABLE warranty_events (
  event_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_type VARCHAR(50) NOT NULL,
  target_type VARCHAR(50) NOT NULL DEFAULT 'warranty',
  target_id INT NOT NULL,
  actor_type ENUM('system', 'admin', 'user') NOT NULL,
  actor_id INT NULL,
  metadata JSON,
  processed_at DATETIME NULL,  -- Outbox 패턴
  ...
)
```
- **범용 구조** (target_type/id로 확장 가능)
- **Outbox 패턴** (processed_at 포함)

**COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md (263-284줄)**:
```sql
CREATE TABLE warranty_events (
  event_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_type VARCHAR(50) NOT NULL,
  target_type VARCHAR(50) NOT NULL DEFAULT 'warranty',
  target_id INT NOT NULL,
  actor_type ENUM('system', 'admin', 'user') NOT NULL,
  actor_id INT NULL,
  metadata JSON,
  processed_at DATETIME NULL,
  ...
)
```
- **FINAL과 동일** (범용 구조)

**실제 마이그레이션 (035_create_warranty_events_table.sql)**:
```sql
CREATE TABLE warranty_events (
  event_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  warranty_id INT NOT NULL,  -- 직접 참조
  event_type ENUM('status_change', 'owner_change', ...),
  old_value JSON NULL,
  new_value JSON NOT NULL,
  changed_by ENUM('user', 'admin', 'system'),
  changed_by_id INT NULL,
  reason TEXT NULL,
  ...
)
```
- **단순 구조** (warranty_id 직접 참조)
- **Outbox 패턴 없음**

**판단**: 
- FINAL과 ROADMAP은 "이상적 구조" (범용, 확장 가능)
- 실제 마이그레이션은 "단순 구조" (직접 참조, 더 직관적)
- **SCHEMA_SSOT.md 기준**: 실제 구조가 기준이므로, ROADMAP의 Phase 2-2 스펙은 "이상적 목표"로 참고

### 2. guest_order_access_tokens 테이블 구조

**FINAL_EXECUTION_SPEC_REVIEW.md**: 명시 없음 (구조만 언급)

**COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md (334-350줄)**:
```sql
CREATE TABLE guest_order_access_tokens (
  token_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL,
  token VARCHAR(100) NOT NULL UNIQUE,  -- 평문
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  ...
)
```
- **평문 token**

**실제 마이그레이션 (031_create_guest_order_access_tokens_table.sql)**:
```sql
CREATE TABLE guest_order_access_tokens (
  token_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,  -- 해시
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  last_access_at DATETIME NULL,  -- 추가
  ...
)
```
- **해시 token** (보안 강화)
- **last_access_at 추가**

**판단**: 
- ROADMAP은 "이상적 구조" (평문)
- 실제 구조가 보안상 더 우수 (해시)
- **SCHEMA_SSOT.md 기준**: 실제 구조 유지 권장

### 3. claim_tokens 테이블 구조

**COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md (354-371줄)**:
```sql
CREATE TABLE claim_tokens (
  token_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL,
  token VARCHAR(100) NOT NULL UNIQUE,  -- 평문
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  ...
)
```
- **평문 token**
- **user_id 없음**

**실제 마이그레이션 (032_create_claim_tokens_table.sql)**:
```sql
CREATE TABLE claim_tokens (
  claim_token_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id INT NOT NULL,
  user_id INT NOT NULL,  -- 추가 (보안 강화)
  token_hash VARCHAR(64) NOT NULL UNIQUE,  -- 해시
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  ...
)
```
- **해시 token** (보안 강화)
- **user_id 포함** (3-Factor Atomic Check 강화)

**판단**: 
- ROADMAP은 "이상적 구조" (평문)
- 실제 구조가 보안상 더 우수 (해시 + user_id)
- **SCHEMA_SSOT.md 기준**: 실제 구조 유지 권장

### 4. shipments 테이블 분리 여부

**FINAL_EXECUTION_SPEC_REVIEW.md (82-108줄)**:
- **shipments 테이블 분리** (정규화)
- **active_key 패턴** 사용

**COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md (375-433줄)**:
- **shipments 테이블 분리** (정규화)
- **active_key 패턴** 사용

**실제 구조 (039_add_order_item_units_shipment_columns.sql)**:
- **order_item_units에 직접 포함** (`carrier_code`, `tracking_number`)
- **shipments 테이블 없음**

**판단**: 
- FINAL과 ROADMAP은 "이상적 구조" (정규화)
- 실제 구조는 "단순 구조" (직접 포함)
- **SCHEMA_SSOT.md 기준**: 선택 필요 (A안: 039 방식 유지, B안: 077, 078 실행)

### 5. warranties.active_key 패턴

**FINAL_EXECUTION_SPEC_REVIEW.md (1720-1771줄)**:
- **active_key 패턴 권장** (유효 보증서만 UNIQUE)
- 상세 설명 포함

**COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md (235-244줄)**:
- **active_key 패턴 포함** (Phase 2-1)
- FINAL과 동일

**판단**: **완전 일치** ✅

---

## 📊 일관성 점수

| 항목 | 일치도 | 비고 |
|------|--------|------|
| **SSOT 규칙** | ✅ 100% | 완전 일치 |
| **warranties.status 전이표** | ✅ 100% | 완전 일치 |
| **orders.status 집계 규칙** | ✅ 100% | 완전 일치 |
| **환불 정책** | ✅ 100% | 완전 일치 |
| **멱등성 계층표** | ✅ 100% | 완전 일치 |
| **전역 정합성 규칙** | ✅ 100% | 완전 일치 |
| **warranty_events 구조** | ⚠️ 70% | FINAL/ROADMAP은 범용, 실제는 단순 |
| **guest_order_access_tokens** | ⚠️ 60% | ROADMAP은 평문, 실제는 해시 |
| **claim_tokens** | ⚠️ 60% | ROADMAP은 평문, 실제는 해시+user_id |
| **shipments 테이블** | ⚠️ 50% | FINAL/ROADMAP은 분리, 실제는 직접 포함 |

**전체 일관성**: **약 85%**

---

## 💡 결론

### ✅ 핵심 정책은 완전 일치
- SSOT 규칙
- 상태 전이표
- 집계 규칙
- 환불/양도/활성화 정책
- 멱등성 계층표

### ⚠️ 테이블 구조는 "이상적 목표" vs "실제 구조"
- **FINAL_EXECUTION_SPEC_REVIEW.md**: 이상적 구조 (범용, 확장 가능)
- **COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md**: FINAL 기준으로 작성 (이상적 구조)
- **실제 마이그레이션**: 단순 구조 (직접 참조, 보안 강화)

**이유**:
- FINAL은 "검토 보고서"로 이상적 구조 제안
- ROADMAP은 FINAL 기준으로 작성
- 실제 구현은 단순성/보안을 우선

### 📋 권장 사항

1. **COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md에 명시 추가**:
   - Phase 2 스펙은 "이상적 목표"
   - 실제 구조는 `SCHEMA_SSOT.md` 기준
   - ✅ **이미 추가됨** (7줄)

2. **차이점 명시**:
   - warranty_events: 범용 vs 단순
   - guest_order_access_tokens/claim_tokens: 평문 vs 해시
   - shipments: 분리 vs 직접 포함

3. **실제 구조 우선 원칙**:
   - 이미 작동하는 구조는 최대한 존중
   - 문서 스펙은 "참고용"으로만 사용

---

**최종 평가**: **핵심 정책은 완전 일치하며, 테이블 구조 차이는 "이상적 목표" vs "실제 구조"로 정상적인 범위입니다.**
