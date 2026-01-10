-- ============================================================
-- 042_add_order_item_units_order_id_fk.sql
-- order_item_units.order_id NOT NULL + FK 추가 (039의 staged migration 완료)
-- ============================================================
-- 
-- 주의:
-- 1. 이 스크립트는 039에서 order_id 백필이 완료된 후에만 실행하세요.
-- 2. order_id가 NULL인 레코드가 있으면 NOT NULL 제약 추가가 실패합니다.
-- 3. orders 테이블에 없는 order_id가 있으면 FK 추가가 실패합니다.
-- 
-- 실행 전 확인:
-- SELECT COUNT(*) FROM order_item_units WHERE order_id IS NULL;
-- 결과가 0이어야 합니다.
-- 
-- 실행 순서:
-- 1. 039_add_order_item_units_shipment_columns.sql (컬럼 추가 및 백필)
-- 2. 이 파일 (042): NOT NULL + FK
-- 
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 검증: order_id NULL 확인
-- ============================================================
SELECT '=== 사전 검증: order_id NULL 확인 ===' AS info;
SELECT 
    COUNT(*) as total_units,
    COUNT(order_id) as units_with_order_id,
    COUNT(*) - COUNT(order_id) as units_without_order_id,
    CASE 
        WHEN COUNT(*) - COUNT(order_id) = 0 THEN '✅ 모든 order_item_units의 order_id가 채워져 있습니다.'
        ELSE CONCAT('❌ 오류: ', COUNT(*) - COUNT(order_id), '개의 order_item_units가 order_id가 NULL입니다. 먼저 백필을 완료하세요.')
    END AS status
FROM order_item_units;

-- NULL이 있으면 중단
-- 수동으로 확인 후 진행 (아래 ALTER TABLE은 NULL이 있으면 실패)

-- ============================================================
-- 2. 참조 무결성 확인 (orders에 없는 order_id가 있는지)
-- ============================================================
SELECT '=== 참조 무결성 확인 ===' AS info;
SELECT 
    oiu.order_id,
    COUNT(*) as orphan_count,
    CASE 
        WHEN COUNT(*) > 0 THEN CONCAT('❌ 오류: ', COUNT(*), '개의 order_id가 orders 테이블에 없습니다.')
        ELSE '✅ 모든 order_id가 유효합니다.'
    END AS status
FROM order_item_units oiu
LEFT JOIN orders o ON oiu.order_id = o.order_id
WHERE oiu.order_id IS NOT NULL
  AND o.order_id IS NULL
GROUP BY oiu.order_id;

-- 고아 레코드가 있으면 중단
-- 수동으로 확인 후 진행 (아래 FK 추가는 고아 레코드가 있으면 실패)

-- ============================================================
-- 3. order_id NOT NULL 제약 추가
-- ============================================================
SELECT '=== order_id NOT NULL 제약 추가 ===' AS info;

ALTER TABLE order_item_units
MODIFY COLUMN order_id INT NOT NULL COMMENT 'orders.order_id 참조 (FK 추가 예정)';

-- ============================================================
-- 4. order_id FK 추가 (ON DELETE RESTRICT)
-- ============================================================
SELECT '=== order_id FK 추가 ===' AS info;

-- 기존 FK 확인
SELECT '--- 기존 FK 확인 ---' AS info;
SELECT 
    CONSTRAINT_NAME, 
    COLUMN_NAME, 
    REFERENCED_TABLE_NAME, 
    REFERENCED_COLUMN_NAME,
    DELETE_RULE
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'order_item_units'
  AND REFERENCED_TABLE_NAME = 'orders'
  AND COLUMN_NAME = 'order_id';

-- FK 추가 (이미 존재하는 경우 에러 발생, 수동 확인 필요)
ALTER TABLE order_item_units
ADD CONSTRAINT fk_order_item_units_order_id
FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT;

-- ============================================================
-- 5. 검증: NOT NULL + FK 추가 완료 확인
-- ============================================================
SELECT '=== NOT NULL + FK 추가 완료 확인 ===' AS info;
SELECT 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE,
    COLUMN_KEY,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'order_item_units'
  AND COLUMN_NAME = 'order_id';

SELECT '--- FK 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME, 
    COLUMN_NAME, 
    REFERENCED_TABLE_NAME, 
    REFERENCED_COLUMN_NAME,
    DELETE_RULE
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'order_item_units'
  AND REFERENCED_TABLE_NAME = 'orders'
  AND COLUMN_NAME = 'order_id';
