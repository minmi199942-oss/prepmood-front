-- warranties 테이블에 soft delete 컬럼 추가
-- 정책 문서: backend/CORE_POLICIES.md 참고
-- 운영 목표: 보증서 삭제 시 물리 삭제 대신 soft delete (분쟁 대비)

ALTER TABLE warranties 
ADD COLUMN deleted_at DATETIME NULL AFTER verified_at,
ADD COLUMN deleted_by INT NULL AFTER deleted_at,
ADD COLUMN delete_reason TEXT NULL AFTER deleted_by;

-- deleted_at 인덱스 추가 (삭제된 보증서 조회 최적화)
CREATE INDEX idx_deleted_at ON warranties(deleted_at);

-- deleted_by 인덱스 추가 (삭제 처리자 조회)
CREATE INDEX idx_deleted_by ON warranties(deleted_by);

-- 정책 준수 확인:
-- ✅ soft delete로 물리 삭제 방지 (분쟁 대비)
-- ✅ deleted_by로 삭제 처리자 기록 (감사 추적)
-- ✅ delete_reason으로 삭제 사유 기록
-- ✅ 인덱스: deleted_at, deleted_by (조회 최적화)

