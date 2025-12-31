-- transfer_logs 테이블의 admin_user_id를 NULL 허용으로 변경
-- 정책 문서: backend/CORE_POLICIES.md 참고
-- 운영 목표: 관리자 계정이 없는 초기 운영 단계에서도 양도 가능하도록

ALTER TABLE transfer_logs 
MODIFY COLUMN admin_user_id INT NULL;

-- 정책 준수 확인:
-- ✅ 초기 운영 단계에서 관리자 계정 없이도 양도 가능
-- ✅ 나중에 관리자 계정이 생기면 해당 ID 기록 가능
-- ✅ 감사 로그에서 NULL은 "시스템 자동 양도" 또는 "초기 운영 단계"로 해석 가능

