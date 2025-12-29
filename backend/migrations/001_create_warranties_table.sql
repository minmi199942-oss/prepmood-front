-- warranties 테이블 생성 (디지털 보증서)
-- 정책 문서: backend/CORE_POLICIES.md 참고

CREATE TABLE IF NOT EXISTS warranties (
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

