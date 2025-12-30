-- transfer_logs 테이블 생성 (양도 이력)
-- 정책 문서: backend/CORE_POLICIES.md 참고
-- 운영 목표: 보증서 양도 이력 영구 보존 (분쟁 대비)

CREATE TABLE IF NOT EXISTS transfer_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    warranty_public_id CHAR(36) NOT NULL,
    token VARCHAR(20) NOT NULL,
    from_user_id INT NULL,  -- 이전 소유주
    to_user_id INT NOT NULL,  -- 새 소유주
    admin_user_id INT NOT NULL,  -- 양도 처리한 관리자
    reason TEXT NULL,  -- 양도 사유
    created_at DATETIME NOT NULL,
    INDEX idx_warranty_public_id (warranty_public_id),
    INDEX idx_token (token),
    INDEX idx_from_user_id (from_user_id),
    INDEX idx_to_user_id (to_user_id),
    INDEX idx_admin_user_id (admin_user_id),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (warranty_public_id) REFERENCES warranties(public_id) ON DELETE RESTRICT,
    FOREIGN KEY (from_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (to_user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    FOREIGN KEY (admin_user_id) REFERENCES users(user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 정책 준수 확인:
-- ✅ 양도 이력 영구 보존 (분쟁 대비)
-- ✅ from_user_id, to_user_id로 소유주 변경 추적
-- ✅ admin_user_id로 처리자 기록 (감사 추적)
-- ✅ reason으로 양도 사유 기록
-- ✅ 인덱스: warranty_public_id, token, user_id, created_at

