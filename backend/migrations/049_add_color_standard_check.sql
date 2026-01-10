-- ============================================================
-- 049_add_color_standard_check.sql
-- color 표준값 DB 제약 추가 (CHECK 또는 lookup table)
-- 정석: 문서로만 표준을 정하면 시간이 지나면서 무조건 깨짐
-- 해결: DB 제약으로 구조적으로 강제
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 검증: 현재 color 컬럼 상태 확인
-- ============================================================
SELECT '=== 사전 검증: color 컬럼 상태 확인 ===' AS info;
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'stock_units'
  AND COLUMN_NAME = 'color';

-- ============================================================
-- 2. Color 표준값 lookup 테이블 생성 (더 확실한 방법)
-- ============================================================
-- 이유: MySQL 8.0 이전 버전은 CHECK 제약이 무시될 수 있음
-- lookup table + FK가 가장 확실한 방법

SELECT '=== Color 표준값 lookup 테이블 생성 ===' AS info;

CREATE TABLE IF NOT EXISTS color_standards (
    color_code VARCHAR(50) PRIMARY KEY COMMENT '표준 색상값 (SSOT)',
    display_name VARCHAR(100) NOT NULL COMMENT '화면 표시명',
    is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '활성 여부',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. 표준값 데이터 삽입 (SSOT 값)
-- ============================================================
SELECT '=== 표준값 데이터 삽입 ===' AS info;

-- 표준값 목록 (띄어쓰기 통일)
INSERT IGNORE INTO color_standards (color_code, display_name, is_active) VALUES
('Black', 'Black', 1),
('Navy', 'Navy', 1),
('White', 'White', 1),
('Grey', 'Grey', 1),
('Light Blue', 'Light Blue', 1),
('Light Grey', 'Light Grey', 1);

SELECT '=== 삽입된 표준값 확인 ===' AS info;
SELECT color_code, display_name, is_active 
FROM color_standards 
ORDER BY color_code;

-- ============================================================
-- 4. 기존 데이터 정규화 (표준값으로 변환)
-- ============================================================
SELECT '=== 기존 데이터 정규화 시작 ===' AS info;

-- 불일치하는 color 값 확인
SELECT 
    color,
    COUNT(*) as count
FROM stock_units
WHERE color IS NOT NULL
GROUP BY color
ORDER BY count DESC;

-- 정규화: 다양한 입력 형식 → 표준값
UPDATE stock_units
SET color = CASE
    -- 붙여쓰기 → 띄어쓰기
    WHEN color IN ('LightBlue', 'Light-Blue', 'LB') THEN 'Light Blue'
    WHEN color IN ('LightGrey', 'Light-Grey', 'LGY', 'LightGray', 'Light-Gray') THEN 'Light Grey'
    -- 축약형 → 표준값
    WHEN color = 'BK' THEN 'Black'
    WHEN color = 'NV' THEN 'Navy'
    WHEN color = 'WH' OR color = 'WT' THEN 'White'
    WHEN color IN ('GY', 'Gray') THEN 'Grey'
    -- 대소문자 통일
    WHEN LOWER(color) = 'black' THEN 'Black'
    WHEN LOWER(color) = 'navy' THEN 'Navy'
    WHEN LOWER(color) = 'white' THEN 'White'
    WHEN LOWER(color) IN ('grey', 'gray') THEN 'Grey'
    WHEN LOWER(color) IN ('light blue', 'lightblue') THEN 'Light Blue'
    WHEN LOWER(color) IN ('light grey', 'lightgray', 'light grey', 'lightgray') THEN 'Light Grey'
    -- 이미 표준값인 경우 그대로 유지
    ELSE color
END
WHERE color IS NOT NULL
  AND color NOT IN ('Black', 'Navy', 'White', 'Grey', 'Light Blue', 'Light Grey');

SELECT '=== 정규화 완료 ===' AS info;

-- ============================================================
-- 5. stock_units.color에 FK 제약 추가 (표준값 강제)
-- ============================================================
SELECT '=== FK 제약 추가 ===' AS info;

-- 기존 FK 확인
SET @fk_exists = (
    SELECT COUNT(*)
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = 'prepmood'
      AND TABLE_NAME = 'stock_units'
      AND CONSTRAINT_NAME = 'fk_stock_units_color_standard'
);

-- FK가 없으면 추가
SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE stock_units ADD CONSTRAINT fk_stock_units_color_standard FOREIGN KEY (color) REFERENCES color_standards(color_code) ON DELETE RESTRICT',
    'SELECT "FK 제약이 이미 존재합니다." AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 6. order_items.color에도 동일한 FK 추가 (일관성)
-- ============================================================
SELECT '=== order_items.color FK 제약 추가 ===' AS info;

-- order_items.color 정규화
UPDATE order_items
SET color = CASE
    WHEN color IN ('LightBlue', 'Light-Blue', 'LB') THEN 'Light Blue'
    WHEN color IN ('LightGrey', 'Light-Grey', 'LGY', 'LightGray', 'Light-Gray') THEN 'Light Grey'
    WHEN color = 'BK' THEN 'Black'
    WHEN color = 'NV' THEN 'Navy'
    WHEN color IN ('WH', 'WT') THEN 'White'
    WHEN color IN ('GY', 'Gray') THEN 'Grey'
    WHEN LOWER(color) = 'black' THEN 'Black'
    WHEN LOWER(color) = 'navy' THEN 'Navy'
    WHEN LOWER(color) = 'white' THEN 'White'
    WHEN LOWER(color) IN ('grey', 'gray') THEN 'Grey'
    WHEN LOWER(color) IN ('light blue', 'lightblue') THEN 'Light Blue'
    WHEN LOWER(color) IN ('light grey', 'lightgray', 'light grey', 'lightgray') THEN 'Light Grey'
    ELSE color
END
WHERE color IS NOT NULL
  AND color NOT IN ('Black', 'Navy', 'White', 'Grey', 'Light Blue', 'Light Grey');

-- FK 제약 추가
SET @fk_exists = (
    SELECT COUNT(*)
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = 'prepmood'
      AND TABLE_NAME = 'order_items'
      AND CONSTRAINT_NAME = 'fk_order_items_color_standard'
);

SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE order_items ADD CONSTRAINT fk_order_items_color_standard FOREIGN KEY (color) REFERENCES color_standards(color_code) ON DELETE RESTRICT',
    'SELECT "order_items FK 제약이 이미 존재합니다." AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 7. 최종 검증
-- ============================================================
SELECT '=== 최종 검증 ===' AS info;

-- stock_units.color 표준값 확인
SELECT 
    color,
    COUNT(*) as count
FROM stock_units
WHERE color IS NOT NULL
GROUP BY color
ORDER BY color;

-- order_items.color 표준값 확인
SELECT 
    color,
    COUNT(*) as count
FROM order_items
WHERE color IS NOT NULL
GROUP BY color
ORDER BY color;

-- FK 제약 확인
SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND CONSTRAINT_NAME IN ('fk_stock_units_color_standard', 'fk_order_items_color_standard')
ORDER BY TABLE_NAME, CONSTRAINT_NAME;

SELECT '=== 마이그레이션 완료 ===' AS info;
