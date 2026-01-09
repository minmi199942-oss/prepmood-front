-- ============================================================
-- 030_add_invoices_multipart.sql
-- Phase 1-9: invoices 테이블 수정 (다장 인보이스 지원)
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 검증: invoices 테이블 존재 확인
-- ============================================================
SELECT '=== 사전 검증: invoices 테이블 확인 ===' AS info;
SELECT 
    TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'invoices';

-- ============================================================
-- 2. invoice_group_id 컬럼 추가
-- ============================================================
ALTER TABLE invoices
ADD COLUMN invoice_group_id VARCHAR(50) NULL
COMMENT '동일 발급 묶음 식별자 (다장 인보이스 지원)'
AFTER invoice_number;

-- ============================================================
-- 3. invoice_part_no 컬럼 추가
-- ============================================================
ALTER TABLE invoices
ADD COLUMN invoice_part_no INT NULL
COMMENT '파트 번호 (1부터 시작)'
AFTER invoice_group_id;

-- ============================================================
-- 4. invoice_part_total 컬럼 추가
-- ============================================================
ALTER TABLE invoices
ADD COLUMN invoice_part_total INT NULL
COMMENT '총 파트 수 (마지막 파트 생성 시 확정)'
AFTER invoice_part_no;

-- ============================================================
-- 5. UNIQUE(invoice_group_id, invoice_part_no) 제약 추가
-- ============================================================
ALTER TABLE invoices
ADD CONSTRAINT uk_invoices_group_part UNIQUE (invoice_group_id, invoice_part_no);

-- ============================================================
-- 6. 인덱스 추가
-- ============================================================
CREATE INDEX idx_invoice_group_id ON invoices(invoice_group_id);

-- ============================================================
-- 7. 사후 검증
-- ============================================================
SELECT '=== 사후 검증: invoices 구조 확인 ===' AS info;
SELECT 
    COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'invoices' 
  AND COLUMN_NAME IN ('invoice_group_id', 'invoice_part_no', 'invoice_part_total')
ORDER BY ORDINAL_POSITION;

SELECT '=== 사후 검증: UNIQUE 제약 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME, COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'invoices' 
  AND CONSTRAINT_NAME = 'uk_invoices_group_part';

SELECT '=== 마이그레이션 완료 ===' AS info;
