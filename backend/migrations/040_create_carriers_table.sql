-- ============================================================
-- 040_create_carriers_table.sql
-- carriers 테이블 생성 (택배사 코드 관리)
-- ============================================================
-- 
-- 목적:
-- - 택배사 코드 데이터 품질 보장 (LOOKUP 테이블)
-- - 확장 가능한 택배사 관리 (향후 API 연동 등)
-- 
-- 실행 순서:
-- - 039 이후 실행 (shipped API에서 carrier_code 검증에 필요)
-- 
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 검증: carriers 테이블 존재 여부 확인
-- ============================================================
SELECT '=== 사전 검증: carriers 테이블 존재 여부 ===' AS info;
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN CONCAT('⚠️ 경고: carriers 테이블이 이미 존재합니다. 중복 실행을 확인하세요.')
        ELSE '✅ carriers 테이블이 없습니다. 생성합니다.'
    END AS status
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'carriers';

-- ============================================================
-- 2. carriers 테이블 생성
-- ============================================================
CREATE TABLE IF NOT EXISTS carriers (
    code VARCHAR(20) PRIMARY KEY COMMENT '택배사 코드 (예: CJ, ILYANG, VALEX)',
    name VARCHAR(100) NOT NULL COMMENT '택배사 이름 (예: CJ대한통운, 일양택배, 한진택배)',
    name_en VARCHAR(100) NULL COMMENT '택배사 영문 이름',
    is_active TINYINT(1) NOT NULL DEFAULT 1 COMMENT '활성 여부 (1: 활성, 0: 비활성)',
    tracking_url_template VARCHAR(500) NULL COMMENT '송장 추적 URL 템플릿 (예: https://www.cjlogistics.com/ko/tool/parcel/tracking?param={tracking_number})',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. 기본 택배사 데이터 삽입 (한국 주요 택배사)
-- ============================================================
SELECT '=== 기본 택배사 데이터 삽입 ===' AS info;

INSERT IGNORE INTO carriers (code, name, name_en, is_active, tracking_url_template) VALUES
('CJ', 'CJ대한통운', 'CJ Logistics', 1, 'https://www.cjlogistics.com/ko/tool/parcel/tracking?param={tracking_number}'),
('HANJIN', '한진택배', 'Hanjin Express', 1, 'https://www.hanjin.co.kr/kor/CMS/DeliveryMgr/WaybillSch?mCode=MN038&schLang=KR&wblnum={tracking_number}'),
('ILYANG', '일양택배', 'ILYANG Express', 1, 'https://ilyanglogis.com/delivery/delivery_search.jsp?dlvry_type=1&dlvry_num={tracking_number}'),
('KOREA', '한덱스', 'Korea Express', 1, NULL),
('KGB', '로젠택배', 'KGB Logistics', 1, 'https://www.cvsnet.co.kr/invoice/tracking.do?invoice_no={tracking_number}'),
('LOGEN', '로젠택배', 'LOGEN', 1, NULL),
('CVS', 'GS25편의점택배', 'GS25 CVS Delivery', 1, NULL),
('CU', 'CU편의점택배', 'CU CVS Delivery', 1, NULL),
('7ELEVEN', '세븐일레븐편의점택배', '7-Eleven CVS Delivery', 1, NULL),
('VALEX', '한진택배', 'VALEX', 1, NULL);

-- 삽입 결과 확인
SELECT '--- 삽입된 택배사 목록 ---' AS info;
SELECT code, name, name_en, is_active, tracking_url_template
FROM carriers
ORDER BY code;

-- ============================================================
-- 4. 검증: carriers 테이블 생성 완료 확인
-- ============================================================
SELECT '=== carriers 테이블 생성 완료 확인 ===' AS info;
SELECT 
    TABLE_NAME, 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE,
    COLUMN_KEY,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'carriers'
ORDER BY ORDINAL_POSITION;

SELECT '--- FK 확인 (없어야 함, FK는 나중에 추가 예정) ---' AS info;
SELECT 
    CONSTRAINT_NAME, 
    COLUMN_NAME, 
    REFERENCED_TABLE_NAME, 
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'carriers' 
  AND REFERENCED_TABLE_NAME IS NOT NULL;
