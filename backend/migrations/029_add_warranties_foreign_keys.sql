-- ============================================================
-- 029_add_warranties_foreign_keys.sql
-- Phase 1-8: warranties FK 추가 (source_order_item_unit_id, owner_user_id)
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 기존 FK 확인
-- ============================================================
SELECT '=== 기존 FK 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND COLUMN_NAME IN ('owner_user_id', 'source_order_item_unit_id')
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- ============================================================
-- 2. 기존 owner_user_id FK 제거 (있는 경우)
-- ============================================================
-- FK 이름 확인 후 DROP 실행
-- SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
-- WHERE TABLE_SCHEMA = 'prepmood' AND TABLE_NAME = 'warranties' 
--   AND COLUMN_NAME = 'owner_user_id' AND REFERENCED_TABLE_NAME = 'users';
-- ALTER TABLE warranties DROP FOREIGN KEY [기존_FK_이름];

-- ============================================================
-- 3. source_order_item_unit_id FK 추가
-- ============================================================
ALTER TABLE warranties
ADD CONSTRAINT fk_warranties_source_order_item_unit
FOREIGN KEY (source_order_item_unit_id) REFERENCES order_item_units(order_item_unit_id) ON DELETE RESTRICT;

-- ============================================================
-- 4. owner_user_id FK 추가
-- ============================================================
ALTER TABLE warranties
ADD CONSTRAINT fk_warranties_owner_user_id
FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE RESTRICT;

-- ============================================================
-- 5. 사후 검증
-- ============================================================
SELECT '=== 사후 검증: FK 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND COLUMN_NAME IN ('owner_user_id', 'source_order_item_unit_id')
  AND REFERENCED_TABLE_NAME IS NOT NULL;

SELECT '=== 마이그레이션 완료 ===' AS info;
