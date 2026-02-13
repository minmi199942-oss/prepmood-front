-- TOKEN_XLSX_REMOVAL_AND_ADMIN_SSOT.md §6.3: 관리자 token_master 수정 이력 감사 로그
-- token_master와 별도 테이블. 생성 후 db_structure_actual.txt 갱신할 것.
-- 멱등성: CREATE TABLE IF NOT EXISTS → 재실행 시 테이블이 있으면 스킵(인덱스/FK는 한 번에 정의).

USE prepmood;

CREATE TABLE IF NOT EXISTS token_admin_audit_logs (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    token_pk INT NOT NULL COMMENT '수정된 token_master.token_pk (참조: token_master.token_pk INT PK)',
    admin_user_id INT NOT NULL COMMENT '수정한 관리자 users.user_id (참조: users.user_id INT PK)',
    changed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '변경 시각(마이크로초)',
    column_name VARCHAR(100) NOT NULL COMMENT '변경된 token_master 컬럼명',
    old_value TEXT NULL COMMENT '변경 전 값',
    new_value TEXT NULL COMMENT '변경 후 값',
    request_id VARCHAR(64) NULL COMMENT '요청 추적용 (선택)',
    ip VARCHAR(45) NULL COMMENT '요청 IP (선택)',
    user_agent TEXT NULL COMMENT 'User-Agent (선택)',
    INDEX idx_token_pk_changed_at (token_pk, changed_at),
    INDEX idx_admin_user_id_changed_at (admin_user_id, changed_at),
    CONSTRAINT fk_taal_token_pk FOREIGN KEY (token_pk) REFERENCES token_master(token_pk) ON DELETE RESTRICT,
    CONSTRAINT fk_taal_admin_user_id FOREIGN KEY (admin_user_id) REFERENCES users(user_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
