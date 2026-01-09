-- ============================================================
-- 028_add_warranties_columns.sql
-- Phase 1-7: warranties 컬럼 추가 (status, owner_user_id, source_order_item_unit_id 등)
-- ============================================================

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
  AND COLUMN_NAME IN ('id', 'user_id', 'token', 'token_pk')
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
-- 아래 쿼리로 FK 이름 확인 후 DROP 실행
-- SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
-- WHERE TABLE_SCHEMA = 'prepmood' AND TABLE_NAME = 'warranties' 
--   AND COLUMN_NAME = 'user_id' AND REFERENCED_TABLE_NAME = 'users';
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
COMMENT '주문 항목 단위 연결 (order_item_units 테이블 생성 후 FK 추가)'
AFTER owner_user_id;

-- ============================================================
-- 6. activated_at, revoked_at 컬럼 추가
-- ============================================================
ALTER TABLE warranties
ADD COLUMN activated_at DATETIME NULL
COMMENT '활성화 시점'
AFTER source_order_item_unit_id;

ALTER TABLE warranties
ADD COLUMN revoked_at DATETIME NULL
COMMENT '환불 시점 (재판매 시에도 유지, 이력)'
AFTER activated_at;

-- ============================================================
-- 7. UNIQUE(token_pk) 제약 추가
-- ============================================================
ALTER TABLE warranties
ADD CONSTRAINT uk_warranties_token_pk UNIQUE (token_pk);

-- ============================================================
-- 8. 인덱스 추가
-- ============================================================
CREATE INDEX idx_warranties_status ON warranties(status);
CREATE INDEX idx_warranties_owner_user_id ON warranties(owner_user_id);
CREATE INDEX idx_warranties_source_order_item_unit_id ON warranties(source_order_item_unit_id);

-- ============================================================
-- 9. 기존 데이터 status 마이그레이션
-- ============================================================
-- 기존 warranties는 owner_user_id가 있으면 'issued', 없으면 'issued_unassigned'
UPDATE warranties
SET status = CASE 
    WHEN owner_user_id IS NOT NULL THEN 'issued'
    ELSE 'issued_unassigned'
END
WHERE status = 'issued_unassigned'; -- 기본값이므로 실제로는 모든 행 업데이트

-- ============================================================
-- 10. 사후 검증
-- ============================================================
SELECT '=== 사후 검증: warranties 구조 확인 ===' AS info;
SELECT 
    COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE, COLUMN_KEY, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND COLUMN_NAME IN ('status', 'owner_user_id', 'source_order_item_unit_id', 'activated_at', 'revoked_at', 'token_pk')
ORDER BY ORDINAL_POSITION;

SELECT '=== 사후 검증: owner_user_id NULL 허용 확인 ===' AS info;
SELECT 
    COLUMN_NAME, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND COLUMN_NAME = 'owner_user_id';
-- IS_NULLABLE: YES 여야 함

SELECT '=== 사후 검증: UNIQUE(token_pk) 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME, COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND CONSTRAINT_NAME = 'uk_warranties_token_pk';

SELECT '=== 사후 검증: status 데이터 확인 ===' AS info;
SELECT 
    status, 
    COUNT(*) as count
FROM warranties
GROUP BY status;

SELECT '=== 마이그레이션 완료 ===' AS info;
