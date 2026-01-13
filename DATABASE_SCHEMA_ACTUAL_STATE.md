# 실제 데이터베이스 스키마 상태 (코드베이스 기반)

**⚠️ 중요**: 이 문서는 상세 분석입니다. 최종 기준은 `SCHEMA_SSOT.md`입니다.

**목적**: 마이그레이션 파일을 전체적으로 분석하여 실제 DB 구조를 파악하고, 문서 스펙과의 차이를 명확히 식별

**생성일**: 2026-01-11  
**분석 기준**: `backend/migrations/*.sql` 파일 전체 검토  
**최종 기준**: `SCHEMA_SSOT.md`

---

## 🔍 분석 방법론

### 1. 전체 마이그레이션 파일 스캔
- 모든 `CREATE TABLE`, `ALTER TABLE`, `ADD CONSTRAINT` 문 검색
- 테이블별로 누적된 변경사항 추적
- FK 관계 전체 매핑

### 2. 문서 스펙과 실제 구조 비교
- COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md의 Phase 2 스펙
- 실제 마이그레이션 파일의 구조
- 차이점 명확히 식별

### 3. 기존 구조 존중 원칙
- 이미 작동하는 구조는 최대한 유지
- 문서 스펙은 "이상적 목표"로 참고
- 실제 구조에 맞게 문서를 업데이트하거나, 필요시 마이그레이션으로 조정

---

## 📊 실제 테이블 구조 (마이그레이션 파일 기반)

### warranties 테이블
**파일**: `028_add_warranties_columns.sql`

**실제 구조**:
- ✅ `status` ENUM('issued_unassigned', 'issued', 'active', 'suspended', 'revoked')
- ✅ `owner_user_id` INT NULL (기존 user_id에서 변경)
- ✅ `source_order_item_unit_id` BIGINT NULL
- ✅ `activated_at` DATETIME NULL
- ✅ `revoked_at` DATETIME NULL
- ✅ `token_pk` INT NOT NULL (UNIQUE)
- ❌ **누락**: `active_key` generated column (문서 스펙에 있음)

**FK**:
- ✅ `fk_warranties_owner_user_id` → `users(user_id)`
- ✅ `fk_warranties_source_order_item_unit` → `order_item_units(order_item_unit_id)`
- ✅ `fk_warranties_token_pk` → `token_master(token_pk)`

**인덱스**:
- ✅ `idx_warranties_status`
- ✅ `idx_warranties_owner_user_id`
- ✅ `idx_warranties_source_order_item_unit_id`
- ✅ `uk_warranties_token_pk`

---

### warranty_events 테이블
**파일**: `035_create_warranty_events_table.sql`

**실제 구조**:
```sql
CREATE TABLE warranty_events (
    event_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    warranty_id INT NOT NULL,
    event_type ENUM('status_change', 'owner_change', 'suspend', 'unsuspend', 'revoke'),
    old_value JSON NULL,
    new_value JSON NOT NULL,
    changed_by ENUM('user', 'admin', 'system'),
    changed_by_id INT NULL,
    reason TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warranty_id) REFERENCES warranties(id) ON DELETE RESTRICT
)
```

**문서 스펙과의 차이**:
- ❌ 문서: `target_type`, `target_id` (범용 구조)
- ✅ 실제: `warranty_id` (직접 참조)
- ❌ 문서: `actor_type`, `actor_id`, `metadata`, `processed_at` (Outbox 패턴)
- ✅ 실제: `changed_by`, `changed_by_id`, `old_value/new_value`, `reason`

**판단**: 
- 실제 구조가 더 단순하고 직관적
- `old_value/new_value` JSON으로 충분히 이력 관리 가능
- 문서 스펙은 "이상적"이지만, 실제 구조도 작동 가능
- **권장**: 실제 구조 유지, 필요시 점진적 개선

---

### order_item_units 테이블
**파일**: `027_create_order_item_units_table.sql`

**실제 구조**:
```sql
CREATE TABLE order_item_units (
    order_item_unit_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_item_id INT NOT NULL,
    unit_seq INT NOT NULL,
    stock_unit_id BIGINT NULL,
    token_pk INT NOT NULL,
    unit_status ENUM('reserved', 'shipped', 'delivered', 'refunded'),
    current_shipment_id BIGINT NULL,  -- ✅ 이미 포함!
    active_lock INT GENERATED ALWAYS AS (
        CASE WHEN unit_status IN ('reserved', 'shipped', 'delivered') THEN 1 ELSE NULL END
    ) VIRTUAL,  -- ✅ 이미 포함!
    ...
    UNIQUE KEY uk_stock_unit_active (stock_unit_id, active_lock)  -- ✅ 이미 포함!
)
```

**추가 컬럼** (039_add_order_item_units_shipment_columns.sql):
- `order_id` INT NULL (나중에 NOT NULL로 변경 예정)
- `carrier_code` VARCHAR(20) NULL
- `tracking_number` VARCHAR(100) NULL
- `shipped_at` DATETIME NULL
- `delivered_at` DATETIME NULL

**문서 스펙과의 차이**:
- ✅ 문서: `current_shipment_id` → **이미 있음**
- ✅ 문서: `active_lock` → **이미 있음**
- ⚠️ 문서: `shipments` 테이블 분리 방식
- ✅ 실제: `order_item_units`에 직접 `carrier_code`, `tracking_number` 포함 (039)

**판단**:
- 실제 구조는 "직접 포함" 방식 (더 단순)
- 문서 스펙은 "테이블 분리" 방식 (더 정규화)
- **선택 필요**: 
  - A안: 실제 구조 유지 (039 방식)
  - B안: 문서 스펙대로 `shipments` 테이블 분리 (077, 078)

---

### guest_order_access_tokens 테이블
**파일**: `031_create_guest_order_access_tokens_table.sql`

**실제 구조**:
```sql
CREATE TABLE guest_order_access_tokens (
    token_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,  -- ⚠️ 해시 방식
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    last_access_at DATETIME NULL,  -- ⚠️ 추가 컬럼
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
)
```

**문서 스펙과의 차이**:
- ❌ 문서: `token VARCHAR(100) UNIQUE` (평문 토큰)
- ✅ 실제: `token_hash VARCHAR(64) UNIQUE` (해시, 보안 강화)
- ✅ 실제: `last_access_at` 추가 (접근 추적)

**판단**:
- 실제 구조가 보안상 더 우수 (해시 사용)
- **권장**: 실제 구조 유지

---

### claim_tokens 테이블
**파일**: `032_create_claim_tokens_table.sql`

**실제 구조**:
```sql
CREATE TABLE claim_tokens (
    claim_token_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    user_id INT NOT NULL,  -- ⚠️ 문서에는 없음
    token_hash VARCHAR(64) NOT NULL UNIQUE,  -- ⚠️ 해시 방식
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
)
```

**문서 스펙과의 차이**:
- ❌ 문서: `token_id` (PK 이름)
- ✅ 실제: `claim_token_id` (더 명확)
- ❌ 문서: `token VARCHAR(100)` (평문)
- ✅ 실제: `token_hash VARCHAR(64)` (해시, 보안 강화)
- ✅ 실제: `user_id` 포함 (3-Factor Atomic Check 강화)

**판단**:
- 실제 구조가 보안상 더 우수
- `user_id` 포함으로 더 안전한 검증 가능
- **권장**: 실제 구조 유지

---

### shipments 테이블
**파일**: 없음 (새로 생성 필요)

**문서 스펙**:
- `shipment_id` BIGINT PRIMARY KEY
- `order_id` INT
- `carrier_code` VARCHAR(20)
- `tracking_number` VARCHAR(100)
- `active_key` generated column
- `voided_at`, `void_reason` (무효화 지원)

**실제 구조** (039 방식):
- `order_item_units`에 직접 포함 (`carrier_code`, `tracking_number`)

**판단**:
- **선택 필요**: 
  - A안: 실제 구조 유지 (039 방식, 단순)
  - B안: 문서 스펙대로 `shipments` 테이블 분리 (정규화, 송장 교체/이력 관리)

---

### shipment_units 테이블
**파일**: 없음 (새로 생성 필요)

**문서 스펙**:
- `shipment_id`, `order_item_unit_id` 복합키
- `shipments`와 `order_item_units` 연결

**실제 구조**:
- 없음 (039 방식 사용 중)

---

## 🔄 구조 차이 요약

| 항목 | 문서 스펙 | 실제 구조 | 판단 |
|------|----------|----------|------|
| **warranties.active_key** | ✅ 있음 | ❌ 없음 | **추가 필요** (073 생성됨) |
| **warranty_events** | 범용 구조 (target_type/id) | 직접 참조 (warranty_id) | **실제 구조 유지 권장** |
| **order_item_units.current_shipment_id** | ✅ 있음 | ✅ 있음 | **완료** |
| **order_item_units.active_lock** | ✅ 있음 | ✅ 있음 | **완료** |
| **guest_order_access_tokens** | 평문 token | 해시 token_hash | **실제 구조 유지 권장** (보안 강화) |
| **claim_tokens** | 평문 token | 해시 token_hash + user_id | **실제 구조 유지 권장** (보안 강화) |
| **shipments 테이블** | ✅ 분리 방식 | ❌ 없음 (039에서 직접 포함) | **선택 필요** |

---

## 💡 권장 사항

### 즉시 적용
1. **warranties.active_key 추가** (073 마이그레이션 실행)
   - 문서 스펙과 일치
   - 기능상 필요 (UNIQUE 제약)

### 선택 사항 (토론 필요)
2. **shipments 테이블 분리 여부**
   - 현재: `order_item_units`에 직접 포함 (039)
   - 문서: `shipments` 테이블 분리 (077, 078)
   - **고려사항**:
     - 송장 교체/무효화 필요 여부
     - 송장 이력 관리 필요 여부
     - 복잡도 vs 유연성 트레이드오프

3. **warranty_events 구조**
   - 현재 구조 유지 권장 (더 단순하고 직관적)
   - 필요시 점진적 개선

### 유지 권장
4. **guest_order_access_tokens, claim_tokens**
   - 해시 방식 유지 (보안 강화)
   - `user_id` 포함 유지 (claim_tokens)

---

## 📋 다음 단계

1. **warranties.active_key 추가** (073 실행)
2. **shipments 테이블 분리 여부 결정**
   - A안: 039 방식 유지 (단순)
   - B안: 077, 078 실행 (정규화)
3. **문서 업데이트**: 실제 구조 반영

---

**이 문서는 코드베이스의 실제 상태를 반영하며, 문서 스펙과의 차이를 명확히 식별합니다.**
