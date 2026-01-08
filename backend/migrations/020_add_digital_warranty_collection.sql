-- token_master 테이블에 digital_warranty_collection 컬럼 추가 마이그레이션
-- xlsx 구조 변경: digital_warranty_collection 컬럼 추가
--
-- 실행 전 확인:
-- 1. 현재 token_master 테이블 구조 확인
-- 2. 데이터 백업 (선택사항)
--
-- 실행 순서:
-- 1. 이 스크립트 실행
-- 2. 020_add_digital_warranty_collection_verify.sql 실행하여 검증

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
  AND COLUMN_NAME = 'digital_warranty_collection';

-- ============================================================
-- 2. 새 컬럼 추가
-- ============================================================
-- digital_warranty_collection: 디지털 보증서 컬렉션명
ALTER TABLE token_master
ADD COLUMN digital_warranty_collection VARCHAR(100) NULL COMMENT '디지털 보증서 컬렉션명' AFTER digital_warranty_code;

-- ============================================================
-- 3. 인덱스 추가 (검색 성능 향상)
-- ============================================================
-- digital_warranty_collection 인덱스 (검색용)
CREATE INDEX idx_digital_warranty_collection ON token_master(digital_warranty_collection);

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
  AND COLUMN_NAME = 'digital_warranty_collection';
