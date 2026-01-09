# 설계 문서 완전 준수 구현 계획 (최종)

## 📋 목표
**설계 문서(`FINAL_EXECUTION_SPEC_REVIEW.md`, `SYSTEM_FLOW_DETAILED.md`)와 완벽하게 일치하도록 구현**

## ⚠️ 핵심 원칙
1. **설계 문서가 단일 진실(SSOT)**: 설계 문서와 다르게 구현 금지
2. **임의 수정 금지**: 규칙 변경이 필요하면 보고 → 의논 → 승인 후 변경
3. **테이블 구조 우선**: 코드 작성 전에 테이블 구조 완성 필수
4. **완벽성 우선**: 지금 당장 장사하는 게 아니므로 구조를 완벽하게 구현

---

## 🎯 최종 실행 순서 (설계 문서 완전 준수)

### Phase 1: token_pk 마이그레이션 (최우선)

**이유**: 
- 설계 문서에서 `token_pk` 사용 명시 (SYSTEM_FLOW_DETAILED.md 108줄, 117줄)
- 모든 신규 테이블이 `token_pk`를 사용해야 함
- 먼저 완료해야 일관성 유지

**작업 순서** (FINAL_EXECUTION_SPEC_REVIEW.md 658-811줄 참조):

#### Phase 1-1: token_master 테이블 PK 교체

**옵션 A: 테이블 재생성 스왑 (권장, 운영 안정성 최우선)**

```sql
-- 022_token_pk_migration_phase1_token_master.sql

USE prepmood;

-- ============================================================
-- 1. 사전 검증
-- ============================================================
SELECT '=== 사전 검증: token 중복 확인 ===' AS info;
SELECT COUNT(*) as duplicate_count FROM (
  SELECT token, COUNT(*) as cnt FROM token_master GROUP BY token HAVING cnt > 1
) AS duplicates;
-- 결과가 0이어야 함

-- ============================================================
-- 2. 기존 FK 제약 확인 및 제거
-- ============================================================
SELECT '=== 기존 FK 제약 확인 ===' AS info;
SELECT 
  TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE REFERENCED_TABLE_NAME = 'token_master'
  AND REFERENCED_COLUMN_NAME = 'token';

-- warranties.token FK 제거 (있는 경우)
-- ALTER TABLE warranties DROP FOREIGN KEY warranties_ibfk_token;

-- ============================================================
-- 3. 새 테이블 생성 (token_pk가 PK)
-- ============================================================
CREATE TABLE token_master_new (
  token_pk INT AUTO_INCREMENT PRIMARY KEY,
  token VARCHAR(20) NOT NULL UNIQUE,
  internal_code VARCHAR(100) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  serial_number VARCHAR(100) NULL,
  rot_code VARCHAR(100) NULL,
  warranty_bottom_code VARCHAR(100) NULL,
  digital_warranty_code VARCHAR(100) NULL,
  digital_warranty_collection VARCHAR(100) NULL,
  is_blocked TINYINT(1) DEFAULT 0,
  owner_user_id INT NULL,
  scan_count INT DEFAULT 0,
  first_scanned_at DATETIME NULL,
  last_scanned_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX idx_token (token),
  INDEX idx_internal_code (internal_code),
  INDEX idx_is_blocked (is_blocked),
  INDEX idx_owner_user_id (owner_user_id),
  INDEX idx_serial_number (serial_number),
  INDEX idx_rot_code (rot_code),
  INDEX idx_warranty_bottom_code (warranty_bottom_code),
  INDEX idx_digital_warranty_code (digital_warranty_code),
  INDEX idx_digital_warranty_collection (digital_warranty_collection),
  INDEX idx_first_scanned_at (first_scanned_at),
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. 데이터 복사 (token_pk는 AUTO_INCREMENT로 자동 생성)
-- ============================================================
INSERT INTO token_master_new 
  (token, internal_code, product_name, serial_number, rot_code, 
   warranty_bottom_code, digital_warranty_code, digital_warranty_collection,
   is_blocked, owner_user_id, scan_count, 
   first_scanned_at, last_scanned_at, created_at, updated_at)
SELECT 
  token, internal_code, product_name, serial_number, rot_code,
  warranty_bottom_code, digital_warranty_code, digital_warranty_collection,
  is_blocked, owner_user_id, scan_count,
  first_scanned_at, last_scanned_at, created_at, updated_at
FROM token_master
ORDER BY token;

-- ============================================================
-- 5. 기존 테이블 백업 및 교체
-- ============================================================
RENAME TABLE token_master TO token_master_backup;
RENAME TABLE token_master_new TO token_master;

-- ============================================================
-- 6. 사후 검증
-- ============================================================
SELECT '=== 사후 검증: token_pk NULL 확인 ===' AS info;
SELECT COUNT(*) as null_count FROM token_master WHERE token_pk IS NULL;
-- 결과: 0

SELECT '=== 사후 검증: token UNIQUE 확인 ===' AS info;
SELECT COUNT(*) as duplicate_count FROM (
  SELECT token, COUNT(*) as cnt FROM token_master GROUP BY token HAVING cnt > 1
) AS duplicates;
-- 결과: 0

SELECT '=== 사후 검증: 데이터 개수 확인 ===' AS info;
SELECT 
  (SELECT COUNT(*) FROM token_master) as new_count,
  (SELECT COUNT(*) FROM token_master_backup) as backup_count;
-- new_count = backup_count 여야 함

SELECT '=== 사후 검증: AUTO_INCREMENT 값 확인 ===' AS info;
SELECT 
  (SELECT MAX(token_pk) FROM token_master) as max_token_pk,
  (SELECT AUTO_INCREMENT FROM information_schema.TABLES 
   WHERE TABLE_SCHEMA = 'prepmood' AND TABLE_NAME = 'token_master') as auto_increment_value;
-- auto_increment_value > max_token_pk 여야 함
```

#### Phase 1-2: warranties 테이블 FK 전환

```sql
-- 023_token_pk_migration_phase2_warranties.sql

USE prepmood;

-- ============================================================
-- 1. warranties.token_pk 컬럼 추가
-- ============================================================
ALTER TABLE warranties 
  ADD COLUMN token_pk INT NULL
  COMMENT 'token_master.token_pk 참조 (FK 추가 예정)'
  AFTER token;

-- ============================================================
-- 2. 기존 데이터 마이그레이션 (token → token_pk 매핑)
-- ============================================================
UPDATE warranties w
JOIN token_master tm ON w.token = tm.token
SET w.token_pk = tm.token_pk;

-- ============================================================
-- 3. 검증: 매핑되지 않은 데이터 확인
-- ============================================================
SELECT '=== 검증: 매핑되지 않은 warranties 확인 ===' AS info;
SELECT COUNT(*) as unmapped_count
FROM warranties w
LEFT JOIN token_master tm ON w.token = tm.token
WHERE w.token_pk IS NULL AND w.token IS NOT NULL;
-- 결과: 0 (모든 warranties가 매핑되어야 함)

-- ============================================================
-- 4. token_pk를 NOT NULL로 변경
-- ============================================================
ALTER TABLE warranties 
  MODIFY COLUMN token_pk INT NOT NULL;

-- ============================================================
-- 5. 새 FK 추가 (token_pk 기반) - RESTRICT로 고정
-- ============================================================
ALTER TABLE warranties
  ADD CONSTRAINT fk_warranties_token_pk 
  FOREIGN KEY (token_pk) REFERENCES token_master(token_pk) 
  ON DELETE RESTRICT;

-- ============================================================
-- 6. 기존 token 컬럼은 유지 (deprecated 표시)
-- ============================================================
ALTER TABLE warranties 
  MODIFY COLUMN token VARCHAR(20) COMMENT 'DEPRECATED: Use token_pk instead. Keep for backward compatibility.';

-- ============================================================
-- 7. 사후 검증: 참조 무결성 확인
-- ============================================================
SELECT '=== 사후 검증: 참조 무결성 확인 ===' AS info;
SELECT COUNT(*) as orphan_count 
FROM warranties w
LEFT JOIN token_master tm ON w.token_pk = tm.token_pk
WHERE w.token_pk IS NOT NULL AND tm.token_pk IS NULL;
-- 결과: 0
```

#### Phase 1-3: 기존 코드 수정 (token → token_pk)

**수정 대상 파일**:
- `backend/auth-routes.js`: warranties 조회/생성 시 token_pk 사용
- `backend/admin-cli.js`: token 조회 시 token_pk 사용
- 기타 token을 직접 사용하는 모든 코드

---

### Phase 2: 핵심 인프라 테이블 생성

#### Phase 2-1: paid_events 테이블 생성

```sql
-- 024_create_paid_events_table.sql

USE prepmood;

CREATE TABLE IF NOT EXISTS paid_events (
    event_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    payment_key VARCHAR(255) NOT NULL,
    event_source ENUM('webhook', 'redirect', 'manual_verify') NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'KRW',
    raw_payload_json JSON COMMENT '원본 결제 응답',
    confirmed_at DATETIME NULL COMMENT '확정 시각',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_paid_events_order_payment (order_id, payment_key),
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT,
    INDEX idx_order_id (order_id),
    INDEX idx_payment_key (payment_key),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Phase 2-2: orders.paid_at 컬럼 추가

```sql
-- 025_add_orders_paid_at.sql

USE prepmood;

ALTER TABLE orders
ADD COLUMN paid_at DATETIME NULL 
COMMENT '결제 완료 시점 (paid_events 기반, 캐시/파생 필드)' 
AFTER status;

CREATE INDEX idx_paid_at ON orders(paid_at);
```

#### Phase 2-3: stock_units 테이블 생성

```sql
-- 026_create_stock_units_table.sql

USE prepmood;

CREATE TABLE IF NOT EXISTS stock_units (
    stock_unit_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    token_pk INT NOT NULL COMMENT 'token_master.token_pk 참조',
    status ENUM('in_stock', 'reserved', 'sold', 'returned') NOT NULL DEFAULT 'in_stock',
    reserved_at DATETIME NULL,
    reserved_by_order_id INT NULL,
    sold_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT,
    FOREIGN KEY (token_pk) REFERENCES token_master(token_pk) ON DELETE RESTRICT,
    FOREIGN KEY (reserved_by_order_id) REFERENCES orders(order_id) ON DELETE SET NULL,
    INDEX idx_product_id (product_id),
    INDEX idx_status (status),
    INDEX idx_token_pk (token_pk),
    INDEX idx_reserved_by_order_id (reserved_by_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Phase 2-4: order_item_units 테이블 생성

```sql
-- 027_create_order_item_units_table.sql

USE prepmood;

CREATE TABLE IF NOT EXISTS order_item_units (
    order_item_unit_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_item_id INT NOT NULL,
    unit_seq INT NOT NULL COMMENT '같은 order_item_id 내 순서 (1부터 시작)',
    stock_unit_id BIGINT NULL COMMENT '재고 단위 연결 (재고 배정 후 설정)',
    token_pk INT NOT NULL COMMENT 'token_master.token_pk 참조',
    unit_status ENUM('reserved', 'shipped', 'delivered', 'refunded') NOT NULL DEFAULT 'reserved',
    current_shipment_id BIGINT NULL COMMENT '현재 유효 송장 (shipments 테이블 생성 후 FK 추가)',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_item_id) REFERENCES order_items(order_item_id) ON DELETE RESTRICT,
    FOREIGN KEY (stock_unit_id) REFERENCES stock_units(stock_unit_id) ON DELETE SET NULL,
    FOREIGN KEY (token_pk) REFERENCES token_master(token_pk) ON DELETE RESTRICT,
    UNIQUE KEY uk_order_item_unit_seq (order_item_id, unit_seq),
    INDEX idx_order_item_id (order_item_id),
    INDEX idx_stock_unit_id (stock_unit_id),
    INDEX idx_token_pk (token_pk),
    INDEX idx_unit_status (unit_status),
    INDEX idx_current_shipment_id (current_shipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Phase 2-5: warranties 컬럼 추가

```sql
-- 028_add_warranties_columns.sql

USE prepmood;

-- ============================================================
-- 1. 사전 검증: 현재 warranties 구조 확인
-- ============================================================
SELECT '=== 사전 검증: warranties 구조 확인 ===' AS info;
SELECT 
    COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE, COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND COLUMN_NAME IN ('id', 'user_id', 'token')
ORDER BY ORDINAL_POSITION;

-- 기존 FK 확인
SELECT '=== 기존 FK 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND COLUMN_NAME = 'user_id'
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- ============================================================
-- 2. 기존 user_id FK 제거 (있으면)
-- ============================================================
-- FK 이름은 실제로 확인 필요 (예: warranties_ibfk_1)
-- ALTER TABLE warranties DROP FOREIGN KEY [기존_FK_이름];

-- ============================================================
-- 3. status 컬럼 추가
-- ============================================================
ALTER TABLE warranties
ADD COLUMN status ENUM('issued_unassigned', 'issued', 'active', 'suspended', 'revoked') 
NOT NULL DEFAULT 'issued_unassigned'
COMMENT '보증서 상태 (SSOT)' 
AFTER id;

-- ============================================================
-- 4. user_id → owner_user_id 변경 (NULL 허용으로 변경)
-- ============================================================
-- ⚠️ 중요: 기존 user_id는 NOT NULL이므로 NULL 허용으로 변경
ALTER TABLE warranties
CHANGE COLUMN user_id owner_user_id INT NULL
COMMENT '보증서 소유자 (NULL이면 issued_unassigned)';

-- ============================================================
-- 5. source_order_item_unit_id 컬럼 추가
-- ============================================================
ALTER TABLE warranties
ADD COLUMN source_order_item_unit_id BIGINT NULL
COMMENT '주문 항목 단위 연결'
AFTER owner_user_id;

-- ============================================================
-- 6. activated_at 컬럼 추가
-- ============================================================
ALTER TABLE warranties
ADD COLUMN activated_at DATETIME NULL
COMMENT '활성화 시점'
AFTER source_order_item_unit_id;

-- ============================================================
-- 7. revoked_at 컬럼 추가
-- ============================================================
ALTER TABLE warranties
ADD COLUMN revoked_at DATETIME NULL
COMMENT '환불 시점 (재판매 시에도 유지, 이력)'
AFTER activated_at;

-- ============================================================
-- 8. 인덱스 추가
-- ============================================================
CREATE INDEX idx_warranties_status ON warranties(status);
CREATE INDEX idx_warranties_owner_user_id ON warranties(owner_user_id);
CREATE INDEX idx_warranties_source_order_item_unit_id ON warranties(source_order_item_unit_id);

-- ============================================================
-- 9. 기존 데이터 마이그레이션 (status 설정)
-- ============================================================
-- 기존 warranties는 모두 'issued' 상태로 설정 (owner_user_id가 있으므로)
UPDATE warranties 
SET status = 'issued' 
WHERE owner_user_id IS NOT NULL;

-- owner_user_id가 NULL인 경우는 없을 것으로 예상하지만, 혹시 모르니
UPDATE warranties 
SET status = 'issued_unassigned' 
WHERE owner_user_id IS NULL;

-- ============================================================
-- 10. 사후 검증
-- ============================================================
SELECT '=== 사후 검증: owner_user_id NULL 허용 확인 ===' AS info;
SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND COLUMN_NAME = 'owner_user_id';
-- IS_NULLABLE: YES 여야 함

SELECT '=== 사후 검증: status 컬럼 확인 ===' AS info;
SELECT 
    status, COUNT(*) as count
FROM warranties
GROUP BY status;
```

#### Phase 2-6: warranties FK 추가

```sql
-- 029_add_warranties_foreign_keys.sql

USE prepmood;

-- ============================================================
-- 1. 기존 FK 확인
-- ============================================================
SELECT '=== 기존 FK 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME, 
    COLUMN_NAME, 
    REFERENCED_TABLE_NAME, 
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND COLUMN_NAME IN ('owner_user_id', 'source_order_item_unit_id')
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- ============================================================
-- 2. 기존 owner_user_id FK 제거 (있는 경우)
-- ============================================================
-- Phase 2-5에서 이미 제거했을 수 있지만, 혹시 모르니 확인
-- 실제 FK 이름은 위 쿼리 결과로 확인
-- 예: ALTER TABLE warranties DROP FOREIGN KEY warranties_ibfk_1;

-- ============================================================
-- 3. owner_user_id FK 추가
-- ============================================================
ALTER TABLE warranties
ADD CONSTRAINT fk_warranties_owner_user_id
FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE RESTRICT;

-- ============================================================
-- 4. source_order_item_unit_id FK 추가
-- ============================================================
-- ⚠️ 주의: order_item_units 테이블이 생성된 후에만 가능
ALTER TABLE warranties
ADD CONSTRAINT fk_warranties_source_order_item_unit
FOREIGN KEY (source_order_item_unit_id) REFERENCES order_item_units(order_item_unit_id) ON DELETE RESTRICT;

-- ============================================================
-- 5. 사후 검증
-- ============================================================
SELECT '=== 사후 검증: FK 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME, 
    COLUMN_NAME, 
    REFERENCED_TABLE_NAME, 
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND COLUMN_NAME IN ('owner_user_id', 'source_order_item_unit_id')
  AND REFERENCED_TABLE_NAME IS NOT NULL;
-- fk_warranties_owner_user_id, fk_warranties_source_order_item_unit이 있어야 함
```

---

### Phase 3: Paid 처리 로직 구현

**작업**:
1. `processPaidOrder()` 함수 구현 (token_pk 사용)
2. `POST /api/payments/confirm`에 호출 추가
3. `POST /api/payments/webhook`에 호출 추가

---

## 📊 실행 순서 요약

### 즉시 실행
1. ✅ **Phase 1-1**: token_master PK 교체 (테이블 재생성 스왑)
2. ✅ **Phase 1-2**: warranties FK 전환
3. ✅ **Phase 1-3**: 기존 코드 수정 (token → token_pk)

### 그 다음
4. ✅ **Phase 2-1**: paid_events 테이블 생성
5. ✅ **Phase 2-2**: orders.paid_at 컬럼 추가
6. ✅ **Phase 2-3**: stock_units 테이블 생성 (token_pk 사용)
7. ✅ **Phase 2-4**: order_item_units 테이블 생성 (token_pk 사용)
8. ✅ **Phase 2-5**: warranties 컬럼 추가
9. ✅ **Phase 2-6**: warranties FK 추가

### 이후
10. ✅ **Phase 3**: processPaidOrder() 함수 구현

---

## ⚠️ 주의사항

1. **백업 필수**: Phase 1 실행 전 반드시 백업
2. **검증 필수**: 각 Phase 완료 후 검증 스크립트 실행
3. **설계 문서 준수**: 모든 구현은 설계 문서 기준
4. **일관성 유지**: token_pk 사용 일관성 유지

---

## ✅ 완료 조건

### Phase 1 완료 조건
- token_master.token_pk가 PK
- warranties.token_pk FK 정상 작동
- 기존 코드가 token_pk 사용

### Phase 2 완료 조건
- paid_events 테이블 생성 및 UNIQUE 제약 확인
- orders.paid_at 컬럼 추가
- stock_units, order_item_units 테이블 생성 (token_pk 사용)
- warranties 컬럼 추가 완료

### Phase 3 완료 조건
- processPaidOrder() 함수 구현 완료
- 결제 완료 시 정상 작동 확인

---

## 📝 다음 단계

**즉시 실행할 작업**:
1. Phase 1-1 마이그레이션 스크립트 작성 (022_token_pk_migration_phase1_token_master.sql)
2. Phase 1-2 마이그레이션 스크립트 작성 (023_token_pk_migration_phase2_warranties.sql)
3. Phase 1-3 코드 수정 계획 수립

이 계획대로 진행할까요?
