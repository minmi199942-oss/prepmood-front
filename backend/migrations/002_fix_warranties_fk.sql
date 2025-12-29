-- warranties 테이블 FK 수정 (user_id 참조 수정)
-- 001에서 users(id)로 잘못 참조했던 것을 users(user_id)로 수정
-- 정책 문서: backend/CORE_POLICIES.md 참고

-- warranties 테이블이 부분 생성되었을 수 있으므로, 안전하게 처리
DROP TABLE IF EXISTS warranties;

-- 올바른 FK로 재생성
CREATE TABLE warranties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(20) NOT NULL UNIQUE,  -- ✅ 1 token = 1 owner (UNIQUE 제약)
    verified_at DATETIME NOT NULL,      -- ✅ 앱에서 UTC로 넣음 ('YYYY-MM-DD HH:MM:SS' 형식)
    created_at DATETIME NOT NULL,       -- ✅ 앱에서 UTC로 넣음 (DEFAULT 제거)
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    INDEX idx_user_id (user_id)  -- ✅ 사용자별 보증서 조회 최적화
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 정책 준수 확인:
-- ✅ UNIQUE 제약: 1 token = 1 owner 강제
-- ✅ ON DELETE RESTRICT: 사용자 삭제 시 보증서 보존
-- ✅ DEFAULT CURRENT_TIMESTAMP 사용 안 함: 앱에서 명시적으로 생성
-- ✅ INDEX: 사용자별 조회 최적화
-- ✅ FK 수정: users(user_id) 참조 (users 테이블의 실제 PK)

