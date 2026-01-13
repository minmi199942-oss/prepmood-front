# 데이터베이스 스키마 SSOT (Single Source of Truth)

**⚠️ 이 문서가 실제 데이터베이스 구조의 단일 진실 원천입니다.**

**최종 업데이트**: 2026-01-11  
**검증 기준**: VPS 실제 DB 구조 + 마이그레이션 파일 전체 분석

---

## 🎯 사용 방법

1. **새 마이그레이션 작성 전**: 이 문서 확인
2. **문서 간 충돌 시**: 이 문서가 기준
3. **코드 작성 시**: 이 문서의 구조 기준

---

## 📊 실제 테이블 구조 (VPS 검증 완료)

### warranties 테이블
**마이그레이션**: `028_add_warranties_columns.sql`  
**VPS 확인**: ✅ 완료

```sql
CREATE TABLE warranties (
    id INT PRIMARY KEY AUTO_INCREMENT,
    status ENUM('issued_unassigned', 'issued', 'active', 'suspended', 'revoked') NOT NULL DEFAULT 'issued_unassigned',
    owner_user_id INT NULL,  -- 기존 user_id에서 변경됨
    source_order_item_unit_id BIGINT NULL,
    activated_at DATETIME NULL,
    revoked_at DATETIME NULL,
    token_pk INT NOT NULL,
    -- ... 기타 컬럼
    UNIQUE KEY uk_warranties_token_pk (token_pk),
    FOREIGN KEY (owner_user_id) REFERENCES users(user_id),
    FOREIGN KEY (source_order_item_unit_id) REFERENCES order_item_units(order_item_unit_id),
    FOREIGN KEY (token_pk) REFERENCES token_master(token_pk)
)
```

**누락**: `active_key` generated column (073 마이그레이션으로 추가 예정)

---

### order_item_units 테이블
**마이그레이션**: `027_create_order_item_units_table.sql`  
**VPS 확인**: ✅ 완료

```sql
CREATE TABLE order_item_units (
    order_item_unit_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_item_id INT NOT NULL,
    unit_seq INT NOT NULL,
    stock_unit_id BIGINT NULL,
    token_pk INT NOT NULL,
    unit_status ENUM('reserved', 'shipped', 'delivered', 'refunded') NOT NULL DEFAULT 'reserved',
    current_shipment_id BIGINT NULL,  -- ✅ 이미 있음
    active_lock INT GENERATED ALWAYS AS (
        CASE WHEN unit_status IN ('reserved', 'shipped', 'delivered') THEN 1 ELSE NULL END
    ) VIRTUAL,  -- ✅ 이미 있음
    -- 039에서 추가된 컬럼:
    order_id INT NULL,
    carrier_code VARCHAR(20) NULL,
    tracking_number VARCHAR(100) NULL,
    shipped_at DATETIME NULL,
    delivered_at DATETIME NULL,
    ...
    UNIQUE KEY uk_stock_unit_active (stock_unit_id, active_lock)  -- ✅ 이미 있음
)
```

**중요**: 
- `current_shipment_id`, `active_lock` 이미 포함됨
- 039에서 `carrier_code`, `tracking_number` 직접 포함 (shipments 테이블 없이)

---

### warranty_events 테이블
**마이그레이션**: `035_create_warranty_events_table.sql`  
**VPS 확인**: ✅ 테이블 존재

```sql
CREATE TABLE warranty_events (
    event_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    warranty_id INT NOT NULL,  -- 직접 참조 (문서의 target_type/id 아님)
    event_type ENUM('status_change', 'owner_change', 'suspend', 'unsuspend', 'revoke'),
    old_value JSON NULL,
    new_value JSON NOT NULL,
    changed_by ENUM('user', 'admin', 'system'),
    changed_by_id INT NULL,
    reason TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warranty_id) REFERENCES warranties(id)
)
```

**문서와의 차이**: 
- 문서는 범용 구조 (target_type/id, metadata, processed_at)
- 실제는 단순 구조 (warranty_id, old_value/new_value)
- **결정**: 실제 구조 유지 (더 단순하고 직관적)

---

### guest_order_access_tokens 테이블
**마이그레이션**: `031_create_guest_order_access_tokens_table.sql`  
**VPS 확인**: ❌ 테이블 없음 (생성 필요)

```sql
CREATE TABLE guest_order_access_tokens (
    token_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,  -- 해시 방식 (문서는 평문)
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    last_access_at DATETIME NULL,  -- 추가 컬럼
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE
)
```

**문서와의 차이**:
- 문서: `token VARCHAR(100)` (평문)
- 실제: `token_hash VARCHAR(64)` (해시, 보안 강화)
- **결정**: 실제 구조 유지 (보안상 우수)

---

### claim_tokens 테이블
**마이그레이션**: `032_create_claim_tokens_table.sql`  
**VPS 확인**: ❌ 테이블 없음 (생성 필요)

```sql
CREATE TABLE claim_tokens (
    claim_token_id BIGINT PRIMARY KEY AUTO_INCREMENT,  -- 문서는 token_id
    order_id INT NOT NULL,
    user_id INT NOT NULL,  -- 문서에 없음 (보안 강화)
    token_hash VARCHAR(64) NOT NULL UNIQUE,  -- 해시 방식
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
)
```

**문서와의 차이**:
- 문서: `token VARCHAR(100)` (평문)
- 실제: `token_hash VARCHAR(64)` + `user_id` (보안 강화)
- **결정**: 실제 구조 유지 (보안상 우수)

---

### warranty_transfers 테이블
**마이그레이션**: `074_create_warranty_transfers_table.sql` (새로 생성)  
**VPS 확인**: ❌ 테이블 없음

**문서 스펙 그대로 생성** (차이 없음)

---

### shipments 테이블
**마이그레이션**: `077_create_shipments_table.sql` (새로 생성)  
**VPS 확인**: ❌ 테이블 없음

**⚠️ 중요 결정 필요**:
- **현재**: `order_item_units`에 `carrier_code`, `tracking_number` 직접 포함 (039)
- **문서**: `shipments` 테이블 분리 (정규화, 송장 교체/이력 관리)

**선택**:
- A안: 039 방식 유지 (단순, 현재 작동)
- B안: 077 실행 (정규화, 향후 확장성)

---

### shipment_units 테이블
**마이그레이션**: `078_create_shipment_units_table.sql` (새로 생성)  
**VPS 확인**: ❌ 테이블 없음

**의존성**: shipments 테이블 생성 후

---

### orders 테이블
**VPS 확인**: ✅ `paid_at` 컬럼 있음

---

## 🔄 문서 간 일관성 체크

### 다른 문서에서 참조 시
- `COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md`: 이상적 목표 (참고용)
- `CURRENT_STATUS_AND_NEXT_STEPS.md`: 진행 상황 (이 문서 기반)
- `DATABASE_SCHEMA_ACTUAL_STATE.md`: 상세 분석 (이 문서 요약)

**충돌 시**: 이 문서(`SCHEMA_SSOT.md`)가 기준

---

## 📋 마이그레이션 실행 순서

### Phase 2 완성 (우선순위)

1. ✅ **073**: warranties.active_key 추가
2. ✅ **074**: warranty_transfers 테이블 생성
3. ✅ **075**: guest_order_access_tokens 테이블 생성 (실제 구조 사용)
4. ✅ **076**: claim_tokens 테이블 생성 (실제 구조 사용)
5. ⚠️ **077**: shipments 테이블 생성 (선택 필요)
6. ⚠️ **078**: shipment_units 테이블 생성 (077 의존)

---

## 🎯 핵심 원칙

1. **실제 구조 우선**: 마이그레이션 파일이 실제 구조
2. **보안 강화 구조 유지**: 해시 방식 등
3. **단순성 vs 정규화**: 상황에 따라 선택
4. **문서는 참고**: 이상적 목표일 수 있음

---

**이 문서를 기준으로 모든 결정을 내립니다.**
