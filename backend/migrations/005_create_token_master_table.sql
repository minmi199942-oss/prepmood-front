-- token_master 테이블 생성 (MySQL 통합)
-- 정책 문서: backend/CORE_POLICIES.md 참고
-- 운영 목표: 모든 토큰을 MySQL에서 관리 (SQLite 분산 해소)
-- 설계 원칙: 단순성 우선 (is_blocked boolean, 스캔/인증 구분)

CREATE TABLE IF NOT EXISTS token_master (
    token VARCHAR(20) PRIMARY KEY,
    internal_code VARCHAR(100) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    is_blocked TINYINT(1) DEFAULT 0,  -- ✅ boolean 단순화 (정상/차단만)
    owner_user_id INT NULL,  -- 현재 소유주 (양도 시 업데이트 가능)
    owner_warranty_public_id CHAR(36) NULL,  -- ✅ 보증서 연결 (운영 편의)
    scan_count INT DEFAULT 0,
    first_scanned_at DATETIME NULL,  -- ✅ 스캔/인증 구분
    last_scanned_at DATETIME NULL,  -- ✅ 스캔/인증 구분
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    INDEX idx_internal_code (internal_code),
    INDEX idx_is_blocked (is_blocked),
    INDEX idx_owner_user_id (owner_user_id),
    INDEX idx_first_scanned_at (first_scanned_at),
    FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (owner_warranty_public_id) REFERENCES warranties(public_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 정책 준수 확인:
-- ✅ 모든 토큰이 MySQL에 존재 (SQLite 분산 해소)
-- ✅ is_blocked로 단순 차단 관리 (정상/차단만)
-- ✅ owner_user_id로 현재 소유주 추적 (양도 시 업데이트)
-- ✅ owner_warranty_public_id로 보증서 연결 (운영 편의)
-- ✅ scan_count, first/last_scanned_at로 스캔 통계 관리
-- ✅ 인덱스: token(PK), internal_code, is_blocked, owner_user_id

