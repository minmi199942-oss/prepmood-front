-- 모든 token_master를 참조하는 FK 제약조건 확인
USE prepmood;

SELECT '=== token_master를 참조하는 모든 FK 확인 ===' AS info;
SELECT 
    TABLE_NAME,
    CONSTRAINT_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME,
    DELETE_RULE,
    UPDATE_RULE
FROM information_schema.REFERENTIAL_CONSTRAINTS rc
JOIN information_schema.KEY_COLUMN_USAGE kcu 
    ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
    AND rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
WHERE rc.CONSTRAINT_SCHEMA = 'prepmood'
  AND rc.REFERENCED_TABLE_NAME = 'token_master'
  AND rc.REFERENCED_COLUMN_NAME = 'token_pk'
ORDER BY TABLE_NAME, CONSTRAINT_NAME;

-- 각 테이블별로 데이터 확인
SELECT '=== stock_units 데이터 확인 ===' AS info;
SELECT COUNT(*) as total_count FROM stock_units;

SELECT '=== order_item_units 데이터 확인 (token_pk 사용 여부) ===' AS info;
SELECT 
    COUNT(*) as total_units,
    COUNT(token_pk) as units_with_token_pk,
    COUNT(*) - COUNT(token_pk) as units_without_token_pk
FROM order_item_units;

SELECT '=== warranties 데이터 확인 ===' AS info;
SELECT 
    COUNT(*) as total_warranties,
    COUNT(token_pk) as warranties_with_token_pk,
    COUNT(*) - COUNT(token_pk) as warranties_without_token_pk
FROM warranties;
