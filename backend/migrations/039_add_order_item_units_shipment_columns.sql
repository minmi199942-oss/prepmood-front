-- ============================================================
-- 039_add_order_item_units_shipment_columns.sql
-- order_item_units 테이블에 출고/배송 관련 컬럼 추가 (staged migration)
-- ============================================================
-- 
-- 주의:
-- 1. order_id는 NULL로 추가하고 백필한 후, 042에서 NOT NULL + FK로 변경
-- 2. carrier_code, tracking_number, shipped_at, delivered_at는 NULL 허용 (MVP)
-- 
-- 실행 순서:
-- 1. 이 파일 (039): 컬럼 추가 및 백필
-- 2. 040_create_carriers_table.sql: carriers 테이블 생성
-- 3. 041_add_shipment_indexes.sql: 인덱스 추가
-- 4. 042_add_order_item_units_order_id_fk.sql: order_id NOT NULL + FK
-- 
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 검증: 현재 order_item_units 구조 확인
-- ============================================================
SELECT '=== 사전 검증: order_item_units 현재 구조 ===' AS info;
SELECT 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE,
    COLUMN_KEY,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'order_item_units'
  AND COLUMN_NAME IN ('order_id', 'carrier_code', 'tracking_number', 'shipped_at', 'delivered_at')
ORDER BY ORDINAL_POSITION;

-- 이미 컬럼이 있는지 확인
SELECT '--- 기존 컬럼 확인 ---' AS info;
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN CONCAT('⚠️ 경고: ', COUNT(*), '개의 컬럼이 이미 존재합니다. 중복 실행을 확인하세요.')
        ELSE '✅ 추가할 컬럼이 없습니다. 마이그레이션을 진행합니다.'
    END AS status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'order_item_units'
  AND COLUMN_NAME IN ('order_id', 'carrier_code', 'tracking_number', 'shipped_at', 'delivered_at');

-- ============================================================
-- 2. 컬럼 추가 (NULL 허용, staged migration)
-- ============================================================

-- 2-1. order_id 컬럼 추가 (NULL 허용, 나중에 NOT NULL로 변경)
ALTER TABLE order_item_units
ADD COLUMN order_id INT NULL COMMENT 'orders.order_id 참조 (FK 추가는 042에서)'
AFTER order_item_id;

-- 2-2. carrier_code 컬럼 추가
ALTER TABLE order_item_units
ADD COLUMN carrier_code VARCHAR(20) NULL COMMENT '택배사 코드 (carriers.code 참조 예정)'
AFTER unit_status;

-- 2-3. tracking_number 컬럼 추가
ALTER TABLE order_item_units
ADD COLUMN tracking_number VARCHAR(100) NULL COMMENT '송장번호'
AFTER carrier_code;

-- 2-4. shipped_at 컬럼 추가
ALTER TABLE order_item_units
ADD COLUMN shipped_at DATETIME NULL COMMENT '출고 시점'
AFTER tracking_number;

-- 2-5. delivered_at 컬럼 추가
ALTER TABLE order_item_units
ADD COLUMN delivered_at DATETIME NULL COMMENT '배송완료 시점'
AFTER shipped_at;

-- ============================================================
-- 3. order_id 백필 (order_items를 통해 order_id 가져오기)
-- ============================================================
SELECT '=== order_id 백필 시작 ===' AS info;

UPDATE order_item_units oiu
INNER JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
SET oiu.order_id = oi.order_id
WHERE oiu.order_id IS NULL;

-- 백필 결과 확인
SELECT '--- 백필 결과 확인 ---' AS info;
SELECT 
    COUNT(*) as total_units,
    COUNT(order_id) as units_with_order_id,
    COUNT(*) - COUNT(order_id) as units_without_order_id,
    CASE 
        WHEN COUNT(*) - COUNT(order_id) = 0 THEN '✅ 모든 order_item_units의 order_id가 채워졌습니다.'
        ELSE CONCAT('⚠️ 경고: ', COUNT(*) - COUNT(order_id), '개의 order_item_units가 order_id가 NULL입니다.')
    END AS status
FROM order_item_units;

-- ============================================================
-- 4. 검증: 컬럼 추가 완료 확인
-- ============================================================
SELECT '=== 컬럼 추가 완료 확인 ===' AS info;
SELECT 
    TABLE_NAME, 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE,
    COLUMN_KEY,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'order_item_units'
  AND COLUMN_NAME IN ('order_id', 'carrier_code', 'tracking_number', 'shipped_at', 'delivered_at')
ORDER BY ORDINAL_POSITION;

-- ============================================================
-- 5. order_id 고아 레코드 확인 (정합성 검증)
-- ============================================================
SELECT '=== order_id 정합성 검증 ===' AS info;
SELECT 
    COUNT(*) as orphan_count,
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ 모든 order_id가 유효합니다.'
        ELSE CONCAT('⚠️ 경고: ', COUNT(*), '개의 order_id가 orders 테이블에 없습니다.')
    END AS status
FROM order_item_units oiu
LEFT JOIN orders o ON oiu.order_id = o.order_id
WHERE oiu.order_id IS NOT NULL
  AND o.order_id IS NULL;
