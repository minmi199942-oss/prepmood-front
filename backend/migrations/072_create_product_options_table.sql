-- ============================================================
-- 072_create_product_options_table.sql
-- Phase 15: 재고와 분리된 옵션 라인업 관리
-- 목적: 재고가 없어도 상품이 지원하는 모든 사이즈/색상 표시
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 확인
-- ============================================================
SELECT '=== 1. 사전 확인 ===' AS info;

-- color_standards 테이블 존재 확인
SELECT 
    'color_standards 테이블' AS check_type,
    COUNT(*) as exists_count
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'color_standards';

-- admin_products 테이블 확인
SELECT 
    'admin_products 테이블' AS check_type,
    COUNT(*) as exists_count
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'admin_products';

-- stock_units에서 옵션 데이터 확인
SELECT 
    'stock_units 옵션 데이터' AS check_type,
    COUNT(DISTINCT product_id) as unique_products,
    COUNT(DISTINCT CONCAT(product_id, '||', COALESCE(size, ''), '||', COALESCE(color, ''))) as unique_options
FROM stock_units
WHERE size IS NOT NULL AND color IS NOT NULL;

-- ============================================================
-- 2. product_options 테이블 생성
-- ============================================================
SELECT '=== 2. product_options 테이블 생성 ===' AS info;

CREATE TABLE IF NOT EXISTS product_options (
    option_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    product_id VARCHAR(128) NOT NULL COMMENT '상품 ID (admin_products.id 참조)',
    color VARCHAR(50) NOT NULL DEFAULT '' COMMENT '색상 (표준화된 색상명, 예: Light Blue, Black 등. 없으면 빈 문자열)',
    size VARCHAR(10) NOT NULL DEFAULT '' COMMENT '사이즈 (S, M, L, XL, XXL, F. 없으면 빈 문자열)',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '정렬 순서 (낮을수록 먼저 표시, 사이즈/색상 정렬용)',
    is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '활성 여부 (1: 활성, 0: 비활성)',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT,
    INDEX idx_product_id (product_id),
    INDEX idx_color (color),
    INDEX idx_is_active (is_active),
    INDEX idx_product_sort (product_id, sort_order),
    UNIQUE KEY uk_product_color_size (product_id, color, size)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. 기존 stock_units 데이터에서 옵션 추출 및 삽입
-- ============================================================
SELECT '=== 3. 기존 stock_units 데이터에서 옵션 추출 ===' AS info;

-- stock_units에서 DISTINCT (product_id, size, color) 조합 추출
-- 색상 정규화: color_standards가 있으면 JOIN, 없으면 CASE fallback
-- GPT 제안: 한쪽만 있어도 옵션으로 등록 (size 또는 color 중 하나만 있어도 OK)
INSERT IGNORE INTO product_options (product_id, color, size, sort_order, is_active)
SELECT DISTINCT
    su.product_id,
    CASE
        -- color_standards 테이블이 있으면 JOIN으로 표준화 (장기적으로 이 방식 사용)
        -- 현재는 CASE fallback 사용 (임시)
        WHEN su.color IS NULL OR TRIM(su.color) = '' THEN ''
        WHEN UPPER(TRIM(su.color)) = 'LIGHTBLUE' 
             OR su.color LIKE '%LightBlue%' 
             OR su.color LIKE '%Light-Blue%' 
             OR UPPER(TRIM(su.color)) = 'LB' THEN 'Light Blue'
        WHEN UPPER(TRIM(su.color)) = 'LIGHTGREY' 
             OR su.color LIKE '%LightGrey%' 
             OR su.color LIKE '%Light-Grey%' 
             OR UPPER(TRIM(su.color)) IN ('LG', 'LGY') THEN 'Light Grey'
        WHEN UPPER(TRIM(su.color)) = 'BK' THEN 'Black'
        WHEN UPPER(TRIM(su.color)) = 'NV' THEN 'Navy'
        WHEN UPPER(TRIM(su.color)) IN ('WH', 'WT') THEN 'White'
        WHEN UPPER(TRIM(su.color)) = 'GY' THEN 'Grey'
        WHEN UPPER(TRIM(su.color)) = 'GRAY' THEN 'Grey'
        ELSE TRIM(su.color)
    END AS normalized_color,
    CASE
        WHEN su.size IS NULL OR TRIM(su.size) = '' THEN ''
        ELSE TRIM(su.size)
    END AS normalized_size,
    -- sort_order 계산: 사이즈 순서 (S=1, M=2, L=3, XL=4, XXL=5, F=6, 기타=99)
    CASE
        WHEN TRIM(su.size) = 'S' THEN 1
        WHEN TRIM(su.size) = 'M' THEN 2
        WHEN TRIM(su.size) = 'L' THEN 3
        WHEN TRIM(su.size) = 'XL' THEN 4
        WHEN TRIM(su.size) = 'XXL' THEN 5
        WHEN TRIM(su.size) = 'F' THEN 6
        ELSE 99
    END AS sort_order,
    1 AS is_active
FROM stock_units su
WHERE su.product_id IS NOT NULL
  AND (su.size IS NOT NULL OR su.color IS NOT NULL);

-- 삽입된 옵션 수 확인
SELECT 
    '삽입된 옵션 수' AS info,
    COUNT(*) as total_options,
    COUNT(DISTINCT product_id) as unique_products
FROM product_options;

-- ============================================================
-- 4. 샘플 데이터 확인
-- ============================================================
SELECT '=== 4. 샘플 데이터 확인 ===' AS info;

SELECT 
    po.option_id,
    po.product_id,
    ap.name as product_name,
    po.color,
    po.size,
    po.is_active,
    COUNT(su.stock_unit_id) as stock_count,
    SUM(CASE WHEN su.status = 'in_stock' THEN 1 ELSE 0 END) as in_stock_count
FROM product_options po
LEFT JOIN admin_products ap ON po.product_id = ap.id
LEFT JOIN stock_units su ON po.product_id = su.product_id 
    AND TRIM(COALESCE(po.size, '')) = TRIM(COALESCE(su.size, ''))
    AND po.color = CASE
        WHEN su.color IS NULL OR TRIM(su.color) = '' THEN ''
        WHEN UPPER(TRIM(su.color)) = 'LIGHTBLUE' 
             OR su.color LIKE '%LightBlue%' 
             OR su.color LIKE '%Light-Blue%' 
             OR UPPER(TRIM(su.color)) = 'LB' THEN 'Light Blue'
        WHEN UPPER(TRIM(su.color)) = 'LIGHTGREY' 
             OR su.color LIKE '%LightGrey%' 
             OR su.color LIKE '%Light-Grey%' 
             OR UPPER(TRIM(su.color)) IN ('LG', 'LGY') THEN 'Light Grey'
        WHEN UPPER(TRIM(su.color)) = 'BK' THEN 'Black'
        WHEN UPPER(TRIM(su.color)) = 'NV' THEN 'Navy'
        WHEN UPPER(TRIM(su.color)) IN ('WH', 'WT') THEN 'White'
        WHEN UPPER(TRIM(su.color)) = 'GY' THEN 'Grey'
        WHEN UPPER(TRIM(su.color)) = 'GRAY' THEN 'Grey'
        ELSE TRIM(su.color)
    END
GROUP BY po.option_id, po.product_id, ap.name, po.color, po.size, po.is_active
ORDER BY po.product_id, po.size, po.color
LIMIT 20;

SELECT '=== product_options 테이블 생성 완료 ===' AS status;
