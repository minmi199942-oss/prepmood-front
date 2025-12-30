-- scan_logs 테이블 생성 (국가 정보 포함)
-- 정책 문서: backend/CORE_POLICIES.md 참고
-- 운영 목표: 스캔 이벤트 기록 + IP 기반 국가 정보 저장
-- 사용 시기: 스캔 국가 추적, 이상 스캔 패턴 분석, IP 기반 차단, 상세 감사 추적

CREATE TABLE IF NOT EXISTS scan_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    token VARCHAR(20) NOT NULL,
    user_id INT NULL,  -- 로그인 없으면 NULL
    warranty_public_id CHAR(36) NULL,  -- 보증서가 있으면 public_id 기록 (운영 편의)
    ip_address VARCHAR(45) NULL,
    country_code VARCHAR(2) NULL,  -- ✅ ISO 3166-1 alpha-2 (KR, US 등)
    country_name VARCHAR(100) NULL,  -- ✅ 국가명 (대한민국, United States 등)
    user_agent TEXT NULL,
    event_type VARCHAR(50) NOT NULL,  -- scan, verify_success_first, verify_success_repeat, verify_blocked, not_found, error
    created_at DATETIME NOT NULL,
    INDEX idx_token (token),
    INDEX idx_user_id (user_id),
    INDEX idx_warranty_public_id (warranty_public_id),
    INDEX idx_created_at (created_at),
    INDEX idx_country_code (country_code),  -- ✅ 국가별 조회 최적화
    INDEX idx_event_type (event_type),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (warranty_public_id) REFERENCES warranties(public_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 정책 준수 확인:
-- ✅ 모든 스캔 이벤트 기록 (로그인 여부 무관)
-- ✅ user_id는 nullable (로그인 없이 스캔 가능)
-- ✅ warranty_public_id는 nullable (보증서 발급 전 스캔도 기록)
-- ✅ country_code, country_name으로 스캔 국가 추적 (IP 기반 GeoIP)
-- ✅ event_type으로 스캔 결과 분류
-- ✅ 인덱스: token, user_id, created_at, country_code, event_type (조회 최적화)

