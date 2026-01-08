-- token_master.owner_warranty_public_id 제거 마이그레이션
-- 양방향 참조 제거: token_master ↔ warranties
--
-- 현재 상태:
-- - token_master.owner_warranty_public_id → warranties.public_id (FK 존재)
-- - 42개 토큰 중 7개만 warranties와 연결됨
-- - 7개 warranties가 token_master에 연결 안 됨 (불일치)
--
-- 실행 전 확인:
-- 1. 백업 필수
-- 2. 연결된 데이터 확인 (7개)
--
-- 실행 순서:
-- 1. 이 스크립트 실행
-- 2. 017_remove_token_master_warranty_fk_verify.sql 실행하여 검증

USE prepmood;

-- ============================================================
-- 1. 사전 검증: 연결된 데이터 확인
-- ============================================================
SELECT '=== 사전 검증: 연결된 데이터 확인 ===' AS info;
SELECT 
    COUNT(*) AS total_tokens,
    COUNT(owner_warranty_public_id) AS tokens_with_warranty_link,
    COUNT(CASE WHEN owner_warranty_public_id IS NULL THEN 1 END) AS tokens_without_warranty_link
FROM token_master;

-- 불일치 확인
SELECT '=== 불일치 확인 ===' AS info;
SELECT 
    'warranties에 있지만 token_master에 연결되지 않은 public_id' AS issue_type,
    COUNT(*) AS count
FROM warranties w
WHERE NOT EXISTS (
    SELECT 1 FROM token_master tm 
    WHERE tm.owner_warranty_public_id = w.public_id
);

-- ============================================================
-- 2. FK 제약 제거
-- ============================================================
-- FK 이름 확인 (token_master_ibfk_2)
ALTER TABLE token_master
  DROP FOREIGN KEY token_master_ibfk_2;

-- ============================================================
-- 3. 컬럼 제거
-- ============================================================
ALTER TABLE token_master
  DROP COLUMN owner_warranty_public_id;

-- ============================================================
-- 4. 인덱스 확인 (자동으로 제거됨)
-- ============================================================
SELECT '=== 인덱스 확인 ===' AS info;
SHOW INDEX FROM token_master;

-- owner_warranty_public_id 인덱스가 제거되었는지 확인

-- ============================================================
-- 5. 대체 조회 방법 확인 (JOIN으로 해결 가능)
-- ============================================================
SELECT '=== 대체 조회 방법 확인 ===' AS info;
SELECT 
    'warranties.token으로 token_master 조회 가능' AS method,
    'JOIN warranties w ON tm.token = w.token' AS example_query;

-- 이제 warranties.token으로 token_master를 조회하면 됨
-- (양방향 참조 없이 단방향으로 충분)
