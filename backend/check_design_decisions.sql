-- 설계 결정을 위한 DB 상태 확인 스크립트
-- 실행: mysql -u prepmood_user -p prepmood < backend/check_design_decisions.sql

USE prepmood;

-- ============================================================
-- 1. orders.user_id NULL 허용 여부 확인 (최우선)
-- ============================================================
SELECT '=== 1. orders.user_id NULL 허용 여부 확인 ===' AS info;
SELECT 
    COLUMN_NAME,
    IS_NULLABLE,
    COLUMN_TYPE,
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'orders'
  AND COLUMN_NAME IN ('user_id', 'guest_id')
ORDER BY COLUMN_NAME;

-- orders 테이블의 실제 데이터 상태 확인
SELECT '=== orders 테이블 데이터 상태 ===' AS info;
SELECT 
    COUNT(*) AS total_orders,
    COUNT(user_id) AS orders_with_user_id,
    COUNT(CASE WHEN user_id IS NULL THEN 1 END) AS orders_with_null_user_id,
    COUNT(guest_id) AS orders_with_guest_id,
    COUNT(CASE WHEN guest_id IS NULL THEN 1 END) AS orders_with_null_guest_id
FROM orders;

-- ============================================================
-- 2. token_master 양방향 참조 확인
-- ============================================================
SELECT '=== 2. token_master 양방향 참조 확인 ===' AS info;

-- token_master 테이블 구조
SELECT 
    COLUMN_NAME,
    IS_NULLABLE,
    COLUMN_TYPE,
    COLUMN_KEY,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'token_master'
  AND COLUMN_NAME IN ('token', 'owner_warranty_public_id', 'owner_user_id')
ORDER BY COLUMN_NAME;

-- token_master의 FK 관계 확인
SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'token_master'
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- owner_warranty_public_id 사용 현황
SELECT '=== owner_warranty_public_id 사용 현황 ===' AS info;
SELECT 
    COUNT(*) AS total_tokens,
    COUNT(owner_warranty_public_id) AS tokens_with_warranty_link,
    COUNT(CASE WHEN owner_warranty_public_id IS NULL THEN 1 END) AS tokens_without_warranty_link
FROM token_master;

-- ============================================================
-- 3. warranties 테이블 구조 확인
-- ============================================================
SELECT '=== 3. warranties 테이블 구조 확인 ===' AS info;
SELECT 
    COLUMN_NAME,
    IS_NULLABLE,
    COLUMN_TYPE,
    COLUMN_KEY,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'warranties'
  AND COLUMN_NAME IN ('id', 'user_id', 'token', 'public_id', 'source_order_item_unit_id')
ORDER BY COLUMN_NAME;

-- warranties의 FK 관계 확인
SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'warranties'
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- ============================================================
-- 4. orders_idempotency 테이블 확인
-- ============================================================
SELECT '=== 4. orders_idempotency 테이블 확인 ===' AS info;
SELECT 
    COLUMN_NAME,
    IS_NULLABLE,
    COLUMN_TYPE,
    COLUMN_KEY,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'orders_idempotency'
ORDER BY COLUMN_NAME;

-- orders_idempotency의 UNIQUE 제약 확인
SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME,
    ORDINAL_POSITION
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'orders_idempotency'
  AND CONSTRAINT_NAME LIKE '%uniq%'
ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION;

-- ============================================================
-- 5. 신규 테이블 존재 여부 확인 (order_item_units, stock_units 등)
-- ============================================================
SELECT '=== 5. 신규 테이블 존재 여부 확인 ===' AS info;
SELECT 
    TABLE_NAME,
    TABLE_COMMENT
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME IN (
    'order_item_units',
    'stock_units',
    'paid_events',
    'shipments',
    'shipment_units',
    'warranty_events',
    'warranty_transfers',
    'invoices'
  )
ORDER BY TABLE_NAME;

-- ============================================================
-- 6. token_master와 warranties 연결 현황 (양방향 참조 영향도)
-- ============================================================
SELECT '=== 6. token_master와 warranties 연결 현황 ===' AS info;
SELECT 
    COUNT(DISTINCT tm.token) AS total_tokens,
    COUNT(DISTINCT tm.owner_warranty_public_id) AS tokens_linked_to_warranties,
    COUNT(DISTINCT w.public_id) AS total_warranties,
    COUNT(DISTINCT w.token) AS warranties_with_token
FROM token_master tm
LEFT JOIN warranties w ON tm.owner_warranty_public_id = w.public_id;

-- 불일치 확인 (양방향 참조 문제)
SELECT '=== 양방향 참조 불일치 확인 ===' AS info;
SELECT 
    'token_master에 있지만 warranties에 없는 public_id' AS issue_type,
    COUNT(*) AS count
FROM token_master tm
WHERE tm.owner_warranty_public_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM warranties w 
    WHERE w.public_id = tm.owner_warranty_public_id
  )
UNION ALL
SELECT 
    'warranties에 있지만 token_master에 연결되지 않은 public_id' AS issue_type,
    COUNT(*) AS count
FROM warranties w
WHERE NOT EXISTS (
    SELECT 1 FROM token_master tm 
    WHERE tm.owner_warranty_public_id = w.public_id
  );
