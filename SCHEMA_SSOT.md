# 데이터베이스 스키마 SSOT (Single Source of Truth)

**⚠️ 이 문서가 실제 데이터베이스 구조의 단일 진실 원천입니다.**

**🚀 작업 시작**: 작업할 때는 **`START_HERE.md`**를 먼저 보세요.

**최종 업데이트**: 2026-01-15  
**검증 기준**: VPS 실제 DB 구조 (`backend/scripts/db_structure_actual.txt`) + 마이그레이션 파일 전체 분석

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

**✅ 확인**: `active_key` generated column 존재 (073 마이그레이션 완료)
- `active_key VARCHAR(50) GENERATED ALWAYS AS (...) VIRTUAL`
- UNIQUE KEY `uk_warranties_active_key` 존재

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
**마이그레이션**: `075_create_guest_order_access_tokens_table.sql`  
**VPS 확인**: ✅ 테이블 존재 (2026-01-13 생성)

```sql
CREATE TABLE guest_order_access_tokens (
    token_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    token VARCHAR(100) NOT NULL UNIQUE,  -- 평문 토큰 (90일 유효)
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT
)
```

**실제 구조**:
- `token VARCHAR(100)` (평문) - 해시 아님
- `last_access_at` 컬럼 없음
- FK: `ON DELETE RESTRICT` (CASCADE 아님)

---

### claim_tokens 테이블
**마이그레이션**: `076_create_claim_tokens_table.sql`  
**VPS 확인**: ✅ 테이블 존재 (2026-01-13 생성)

```sql
CREATE TABLE claim_tokens (
    token_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    token VARCHAR(100) NOT NULL UNIQUE,  -- 평문 토큰 (15분 유효)
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT
)
```

**실제 구조**:
- `token VARCHAR(100)` (평문) - 해시 아님
- `user_id` 컬럼 없음
- FK: `ON DELETE RESTRICT` (CASCADE 아님)

---

### warranty_transfers 테이블
**마이그레이션**: `074_create_warranty_transfers_table.sql`  
**VPS 확인**: ✅ 테이블 존재 (2026-01-13 생성)

**문서 스펙과 일치** (차이 없음)

---

### shipments 테이블
**마이그레이션**: `077_create_shipments_table.sql`  
**VPS 확인**: ✅ 테이블 존재 (2026-01-13 생성)

```sql
CREATE TABLE shipments (
    shipment_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    carrier_code VARCHAR(20) NOT NULL,
    tracking_number VARCHAR(100) NOT NULL,
    active_key VARCHAR(150) GENERATED ALWAYS AS (
        CASE WHEN voided_at IS NULL THEN CONCAT(carrier_code, ':', tracking_number) ELSE NULL END
    ) VIRTUAL,
    shipped_at DATETIME NULL,
    created_by_admin_id INT NULL,
    voided_at DATETIME NULL,
    void_reason VARCHAR(500) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT,
    FOREIGN KEY (carrier_code) REFERENCES carriers(code) ON DELETE RESTRICT,
    UNIQUE KEY uk_shipments_active_key (active_key)
)
```

**참고**: `order_item_units`에도 `carrier_code`, `tracking_number`가 직접 포함되어 있음 (039). 두 방식 병행 사용.

---

### shipment_units 테이블
**마이그레이션**: `078_create_shipment_units_table.sql`  
**VPS 확인**: ✅ 테이블 존재 (2026-01-13 생성)

```sql
CREATE TABLE shipment_units (
    shipment_id BIGINT NOT NULL,
    order_item_unit_id BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (shipment_id, order_item_unit_id),
    FOREIGN KEY (shipment_id) REFERENCES shipments(shipment_id) ON DELETE RESTRICT,
    FOREIGN KEY (order_item_unit_id) REFERENCES order_item_units(order_item_unit_id) ON DELETE RESTRICT
)
```

---

### orders 테이블
**VPS 확인**: ✅ 완료

**주요 컬럼**:
- `order_id INT PRIMARY KEY AUTO_INCREMENT`
- `user_id INT NULL` (회원 주문)
- `guest_id VARCHAR(20) NULL` (비회원 주문)
- `status VARCHAR(50) NOT NULL DEFAULT 'pending'`
- `paid_at DATETIME NULL` ✅ 존재
- `order_number VARCHAR(32) NOT NULL UNIQUE`
- `total_price DECIMAL(10,2) NOT NULL DEFAULT 0.00`

**⚠️ 중요**: `created_at`, `updated_at` 컬럼 **없음**

---

## 🔄 문서 간 일관성 체크

### 다른 문서에서 참조 시
- `COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md`: 이상적 목표 (참고용)
- `CURRENT_STATUS_AND_NEXT_STEPS.md`: 진행 상황 (이 문서 기반)
- `DATABASE_SCHEMA_ACTUAL_STATE.md`: 상세 분석 (이 문서 요약)

**충돌 시**: 이 문서(`SCHEMA_SSOT.md`)가 기준

---

## 📋 마이그레이션 실행 순서

### Phase 2 완성 (✅ 모두 완료)

1. ✅ **073**: warranties.active_key 추가 (완료)
2. ✅ **074**: warranty_transfers 테이블 생성 (완료)
3. ✅ **075**: guest_order_access_tokens 테이블 생성 (완료)
4. ✅ **076**: claim_tokens 테이블 생성 (완료)
5. ✅ **077**: shipments 테이블 생성 (완료)
6. ✅ **078**: shipment_units 테이블 생성 (완료)

**완료일**: 2026-01-13

---

## 🎯 핵심 원칙

1. **실제 구조 우선**: 마이그레이션 파일이 실제 구조
2. **보안 강화 구조 유지**: 해시 방식 등
3. **단순성 vs 정규화**: 상황에 따라 선택
4. **문서는 참고**: 이상적 목표일 수 있음

---

**이 문서를 기준으로 모든 결정을 내립니다.**
