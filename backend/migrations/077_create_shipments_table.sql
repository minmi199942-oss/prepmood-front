-- ============================================================
-- 077_create_shipments_table.sql
-- Phase 2-6: shipments 테이블 생성 (active_key 패턴)
-- 문서 스펙: COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md Phase 2-6
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 확인
-- ============================================================
SELECT '=== 1. 사전 확인 ===' AS info;

-- orders 테이블 존재 확인
SELECT 
    TABLE_NAME,
    TABLE_TYPE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'orders';

-- carriers 테이블 존재 확인
SELECT 
    TABLE_NAME,
    TABLE_TYPE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'carriers';

-- ============================================================
-- 2. shipments 테이블 생성
-- ============================================================
SELECT '=== 2. shipments 테이블 생성 ===' AS info;

CREATE TABLE IF NOT EXISTS shipments (
    shipment_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL COMMENT '주문 ID',
    carrier_code VARCHAR(20) NOT NULL COMMENT '택배사 코드',
    tracking_number VARCHAR(100) NOT NULL COMMENT '송장번호',
    active_key VARCHAR(150) GENERATED ALWAYS AS (
        CASE WHEN voided_at IS NULL THEN CONCAT(carrier_code, ':', tracking_number) ELSE NULL END
    ) VIRTUAL COMMENT '유효 송장 키',
    shipped_at DATETIME NULL COMMENT '발송 시각',
    created_by_admin_id INT NULL COMMENT '생성한 관리자 ID',
    voided_at DATETIME NULL COMMENT '무효화 시각',
    void_reason VARCHAR(500) NULL COMMENT '무효화 사유',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT,
    FOREIGN KEY (carrier_code) REFERENCES carriers(code) ON DELETE RESTRICT,
    UNIQUE KEY uk_shipments_active_key (active_key),
    INDEX idx_order_id (order_id),
    INDEX idx_carrier_code (carrier_code),
    INDEX idx_tracking_number (tracking_number),
    INDEX idx_voided_at (voided_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. 사후 검증
-- ============================================================
SELECT '=== 3. 사후 검증 ===' AS info;

-- 테이블 구조 확인
SELECT 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE,
    COLUMN_KEY,
    COLUMN_DEFAULT,
    EXTRA,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'shipments'
ORDER BY ORDINAL_POSITION;

-- FK 확인
SELECT 
    CONSTRAINT_NAME, 
    COLUMN_NAME, 
    REFERENCED_TABLE_NAME, 
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'shipments' 
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- 인덱스 확인
SELECT 
    INDEX_NAME, 
    COLUMN_NAME, 
    NON_UNIQUE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'shipments'
ORDER BY INDEX_NAME, SEQ_IN_INDEX;

-- active_key generated column 확인
SELECT 
    COLUMN_NAME,
    EXTRA,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'shipments' 
  AND COLUMN_NAME = 'active_key';

SELECT '=== shipments 테이블 생성 완료 ===' AS status;
