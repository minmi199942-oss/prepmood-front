-- token_master 테이블에 새 필드 추가 마이그레이션
-- xlsx 구조 변경: serial_number, rot_code, warranty_bottom_code, digital_warranty_code, product_name
-- 주의: internal_code와 warranty_bottom_code는 별개의 컬럼입니다
--
-- 실행 전 확인:
-- 1. 현재 token_master 테이블 구조 확인
-- 2. 데이터 백업 (선택사항)
--
-- 실행 순서:
-- 1. 이 스크립트 실행
-- 2. 019_add_token_master_new_fields_verify.sql 실행하여 검증

USE prepmood;

-- ============================================================
-- 1. 사전 검증: 현재 테이블 구조 확인
-- ============================================================
SELECT '=== 사전 검증: token_master 테이블 구조 ===' AS info;
SELECT 
    COLUMN_NAME,
    IS_NULLABLE,
    COLUMN_TYPE,
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'token_master'
ORDER BY ORDINAL_POSITION;

-- ============================================================
-- 2. 새 컬럼 추가
-- ============================================================
-- serial_number: 시리얼 넘버
ALTER TABLE token_master
ADD COLUMN serial_number VARCHAR(100) NULL COMMENT '시리얼 넘버' AFTER product_name;

-- rot_code: ROT 코드
ALTER TABLE token_master
ADD COLUMN rot_code VARCHAR(100) NULL COMMENT 'ROT 코드' AFTER serial_number;

-- warranty_bottom_code: 보증서 하단 코드
ALTER TABLE token_master
ADD COLUMN warranty_bottom_code VARCHAR(100) NULL COMMENT '보증서 하단 코드' AFTER rot_code;

-- digital_warranty_code: 디지털 보증서 코드
ALTER TABLE token_master
ADD COLUMN digital_warranty_code VARCHAR(100) NULL COMMENT '디지털 보증서 코드' AFTER warranty_bottom_code;

-- ============================================================
-- 3. 인덱스 추가 (검색 성능 향상)
-- ============================================================
-- serial_number 인덱스 (검색용)
CREATE INDEX idx_serial_number ON token_master(serial_number);

-- rot_code 인덱스 (검색용)
CREATE INDEX idx_rot_code ON token_master(rot_code);

-- warranty_bottom_code 인덱스 (검색용)
CREATE INDEX idx_warranty_bottom_code ON token_master(warranty_bottom_code);

-- digital_warranty_code 인덱스 (검색용)
CREATE INDEX idx_digital_warranty_code ON token_master(digital_warranty_code);

-- ============================================================
-- 4. 결과 확인
-- ============================================================
SELECT '=== 마이그레이션 완료: token_master 테이블 구조 ===' AS info;
SELECT 
    COLUMN_NAME,
    IS_NULLABLE,
    COLUMN_TYPE,
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'token_master'
ORDER BY ORDINAL_POSITION;
