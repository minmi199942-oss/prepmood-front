-- warranties 테이블에 public_id와 product_name 추가
-- 정책 문서: backend/CORE_POLICIES.md 참고
-- Phase 3: 마이페이지 보증서 목록 조회용
--
-- 안전한 마이그레이션 순서 (기존 데이터 존재 가능성 고려):
-- 1. NULL 허용으로 컬럼 추가
-- 2. 기존 데이터 백필
-- 3. NOT NULL 제약 추가
-- 4. UNIQUE 인덱스 추가

-- 1. product_name 컬럼 추가 (NULL 허용, 발급 시점 스냅샷)
ALTER TABLE warranties 
ADD COLUMN product_name VARCHAR(255) NULL AFTER token;

-- 2. public_id 컬럼 추가 (NULL 허용, UUID 형식, 외부 노출 가능한 키)
ALTER TABLE warranties 
ADD COLUMN public_id CHAR(36) NULL AFTER id;

-- 3. 기존 레코드에 public_id 백필 (UUID() 사용)
-- 주의: 기존 데이터가 없으면 이 UPDATE는 0 rows affected (정상)
UPDATE warranties 
SET public_id = UUID() 
WHERE public_id IS NULL;

-- 4. public_id NOT NULL 제약 추가 (기존 데이터 백필 완료 후)
ALTER TABLE warranties 
MODIFY COLUMN public_id CHAR(36) NOT NULL;

-- 6. public_id UNIQUE 인덱스 추가 (NOT NULL 후에 추가)
-- 주의: UNIQUE 인덱스는 자동으로 UNIQUE 제약을 생성함
CREATE UNIQUE INDEX idx_public_id_unique ON warranties(public_id);

-- 7. public_id 조회 최적화 인덱스 (UNIQUE 인덱스가 이미 있으므로 선택사항)
-- UNIQUE 인덱스가 이미 조회 최적화를 제공하므로 생략 가능
-- CREATE INDEX idx_public_id ON warranties(public_id);

-- 8. product_name 인덱스 추가 (선택사항, 제품명 검색이 필요하면)
-- CREATE INDEX idx_product_name ON warranties(product_name);

-- 정책 준수 확인:
-- ✅ public_id: UUID 형식, UNIQUE 제약, NOT NULL, 외부 노출 가능
-- ✅ product_name: 발급 시점 스냅샷 저장 (비정규화, 성능 우선)
-- ✅ 기존 데이터 백필: UUID()로 자동 생성 (안전한 순서)
-- ✅ 인덱스: public_id UNIQUE 인덱스로 조회 최적화
--
-- ⚠️ 마이그레이션 실행 전 Preflight 체크 필수:
-- 003_PREFLIGHT_CHECK.md 파일을 참고하여 UUID 중복 확인을 먼저 수행하세요.
-- 중복이 발견되면 마이그레이션을 실행하지 말고 원인부터 처리하세요.

