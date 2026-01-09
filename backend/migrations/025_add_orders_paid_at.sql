-- ============================================================
-- 025_add_orders_paid_at.sql
-- Phase 1-4: orders.paid_at 컬럼 추가 (paid_events 기반 캐시/파생 필드)
-- ============================================================

USE prepmood;

ALTER TABLE orders
ADD COLUMN paid_at DATETIME NULL 
COMMENT '결제 완료 시점 (paid_events 기반, 캐시/파생 필드)' 
AFTER status;

CREATE INDEX idx_paid_at ON orders(paid_at);

-- ============================================================
-- 검증
-- ============================================================
SELECT '=== orders.paid_at 컬럼 추가 완료 ===' AS info;
SELECT 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'orders' 
  AND COLUMN_NAME = 'paid_at';

SELECT '=== 인덱스 확인 ===' AS info;
SELECT 
    INDEX_NAME, 
    COLUMN_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'orders' 
  AND INDEX_NAME = 'idx_paid_at';
