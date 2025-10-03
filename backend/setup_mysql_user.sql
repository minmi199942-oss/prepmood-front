-- MySQL 전용 사용자 생성 스크립트
-- 이 스크립트를 MySQL 관리 도구(phpMyAdmin, MySQL Workbench 등)에서 실행하세요

-- 1. 새로운 강력한 비밀번호 생성 (아래 비밀번호를 더 복잡하게 변경하세요)
SET @new_password = 'PrepmoodAPI2025!@#$';

-- 2. 전용 사용자 생성
CREATE USER 'prepmood_api'@'localhost' IDENTIFIED BY @new_password;

-- 3. prepmood 데이터베이스에 대한 제한된 권한 부여
GRANT SELECT, INSERT, UPDATE, DELETE ON prepmood.* TO 'prepmood_api'@'localhost';

-- 4. 권한 적용
FLUSH PRIVILEGES;

-- 5. 생성된 사용자 확인
SELECT User, Host FROM mysql.user WHERE User = 'prepmood_api';

-- 6. 권한 확인
SHOW GRANTS FOR 'prepmood_api'@'localhost';

-- 실행 후 .env 파일을 다음과 같이 수정하세요:
-- DB_USER=prepmood_api
-- DB_PASSWORD=PrepmoodAPI2025!@#$

