-- user_addresses 테이블 구조 확인
USE prepmood;

-- 1. user_addresses 테이블 구조 확인
SELECT '=== user_addresses 테이블 구조 ===' AS info;
DESCRIBE user_addresses;

-- 2. user_addresses 테이블 샘플 데이터 확인 (있는 경우)
SELECT '=== user_addresses 샘플 데이터 (최대 5개) ===' AS info;
SELECT * FROM user_addresses LIMIT 5;

-- 3. users 테이블에 주소 관련 컬럼이 있는지 확인
SELECT '=== users 테이블 구조 (주소 관련 컬럼 확인) ===' AS info;
DESCRIBE users;

-- 4. user_addresses 테이블 인덱스 확인
SELECT '=== user_addresses 인덱스 정보 ===' AS info;
SHOW INDEX FROM user_addresses;

