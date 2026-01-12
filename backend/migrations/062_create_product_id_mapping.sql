-- ============================================================
-- 062_create_product_id_mapping.sql
-- Phase 3 Step 3: 매핑 테이블 생성 및 데이터 생성
-- GPT 최종 지적 (B): Idempotent 보강 - 재실행 가능한 형태
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 매핑 테이블 생성 (롤백용으로 영구 보존)
-- ============================================================
-- ⚠️ GPT 최종 지적 (B): Idempotent 보강 - 재실행 가능한 형태
-- IF NOT EXISTS로 재실행 안전
CREATE TABLE IF NOT EXISTS product_id_mapping (
    old_id VARCHAR(128) PRIMARY KEY,
    new_id VARCHAR(128) NOT NULL,
    conflict_resolution VARCHAR(500) NULL COMMENT '중복 해결 방법 기록',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_new_id (new_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT '=== 매핑 테이블 생성 완료 ===' AS status;

-- ============================================================
-- 2. 매핑 데이터 생성 (사이즈 제거)
-- ============================================================
-- ⚠️ GPT 제안: SUBSTRING_INDEX 사용 (슬래시부터 오른쪽 전체 제거)
-- ⚠️ GPT 최종 지적 (B): ON DUPLICATE KEY UPDATE로 재실행 안전
-- 매핑 데이터 생성 (사이즈 제거) - 재실행 가능
INSERT INTO product_id_mapping (old_id, new_id)
SELECT 
    id as old_id,
    SUBSTRING_INDEX(id, '/', 1) as new_id  -- 슬래시부터 오른쪽 전체 제거
FROM admin_products
WHERE id LIKE '%/%'
ON DUPLICATE KEY UPDATE 
    new_id = VALUES(new_id), 
    updated_at = CURRENT_TIMESTAMP;

-- 중복이 없는 상품은 자동으로 매핑 (new_id = old_id) - 재실행 가능
INSERT INTO product_id_mapping (old_id, new_id)
SELECT 
    id as old_id,
    id as new_id
FROM admin_products
WHERE id NOT IN (SELECT old_id FROM product_id_mapping)
ON DUPLICATE KEY UPDATE 
    new_id = VALUES(new_id), 
    updated_at = CURRENT_TIMESTAMP;

SELECT '=== 매핑 데이터 생성 완료 ===' AS status;

-- ============================================================
-- 3. 매핑 결과 확인
-- ============================================================
SELECT '=== 매핑 결과 통계 ===' AS info;
SELECT 
    COUNT(*) as total_mappings,
    COUNT(CASE WHEN old_id != new_id THEN 1 END) as changed_mappings,
    COUNT(CASE WHEN old_id = new_id THEN 1 END) as unchanged_mappings
FROM product_id_mapping;

-- 샘플 매핑 데이터 (변경된 것만)
SELECT '=== 샘플 매핑 데이터 (변경된 것만, 최대 10개) ===' AS info;
SELECT 
    old_id,
    new_id,
    conflict_resolution
FROM product_id_mapping
WHERE old_id != new_id
ORDER BY old_id
LIMIT 10;

SELECT '=== 매핑 테이블 생성 및 데이터 생성 완료 ===' AS status;
