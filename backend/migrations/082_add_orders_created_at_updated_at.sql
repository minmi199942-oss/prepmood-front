-- ============================================================
-- 082_add_orders_created_at_updated_at.sql
-- orders 테이블에 created_at/updated_at 컬럼 추가
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 확인
-- ============================================================
SELECT '=== 1. 현재 orders 테이블 구조 확인 ===' AS info;

SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT,
    EXTRA,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'orders'
  AND COLUMN_NAME IN ('order_date', 'created_at', 'updated_at')
ORDER BY ORDINAL_POSITION;

-- 현재 데이터 수 확인
SELECT 
    '현재 orders 데이터 수' AS info,
    COUNT(*) as total_orders,
    COUNT(order_date) as orders_with_date
FROM orders;

-- ============================================================
-- 2. created_at 컬럼 추가
-- ============================================================
SELECT '=== 2. created_at 컬럼 추가 ===' AS info;

ALTER TABLE orders
ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
COMMENT '주문 생성 시점'
AFTER order_date;

-- ============================================================
-- 3. updated_at 컬럼 추가
-- ============================================================
SELECT '=== 3. updated_at 컬럼 추가 ===' AS info;

ALTER TABLE orders
ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP 
    ON UPDATE CURRENT_TIMESTAMP
COMMENT '주문 수정 시점'
AFTER created_at;

-- ============================================================
-- 4. 기존 데이터 마이그레이션 (order_date → created_at)
-- ============================================================
SELECT '=== 4. 기존 데이터 마이그레이션 (order_date → created_at) ===' AS info;

-- order_date가 있는 경우 created_at으로 복사
-- 모든 기존 주문의 created_at을 order_date로 설정 (order_date가 NULL인 경우는 DEFAULT CURRENT_TIMESTAMP 사용)
UPDATE orders
SET created_at = COALESCE(order_date, CURRENT_TIMESTAMP);

-- updated_at도 동일하게 설정 (최초 생성 시점 = 수정 시점)
-- 모든 기존 주문의 updated_at을 created_at과 동일하게 설정
UPDATE orders
SET updated_at = created_at;

-- ============================================================
-- 5. 인덱스 추가 (선택적, 성능 향상)
-- ============================================================
SELECT '=== 5. 인덱스 추가 ===' AS info;

-- created_at 인덱스 (생성일시 기준 정렬/조회용)
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- updated_at 인덱스 (수정일시 기준 정렬/조회용)
CREATE INDEX idx_orders_updated_at ON orders(updated_at);

-- ============================================================
-- 6. 검증
-- ============================================================
SELECT '=== 6. 마이그레이션 검증 ===' AS info;

-- 컬럼 추가 확인
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT,
    EXTRA,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'orders'
  AND COLUMN_NAME IN ('order_date', 'created_at', 'updated_at')
ORDER BY ORDINAL_POSITION;

-- 인덱스 확인
SELECT 
    INDEX_NAME,
    COLUMN_NAME,
    SEQ_IN_INDEX,
    NON_UNIQUE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'orders'
  AND INDEX_NAME IN ('idx_orders_created_at', 'idx_orders_updated_at')
ORDER BY INDEX_NAME, SEQ_IN_INDEX;

-- 데이터 무결성 확인
SELECT 
    '데이터 확인' AS info,
    COUNT(*) as total_orders,
    COUNT(created_at) as orders_with_created_at,
    COUNT(updated_at) as orders_with_updated_at,
    COUNT(CASE WHEN created_at IS NULL THEN 1 END) as null_created_at,
    COUNT(CASE WHEN updated_at IS NULL THEN 1 END) as null_updated_at
FROM orders;

-- 샘플 데이터 확인 (최근 5개)
SELECT 
    order_id,
    order_number,
    order_date,
    created_at,
    updated_at,
    status
FROM orders
ORDER BY created_at DESC
LIMIT 5;

SELECT '=== orders.created_at/updated_at 컬럼 추가 완료 ===' AS status;
