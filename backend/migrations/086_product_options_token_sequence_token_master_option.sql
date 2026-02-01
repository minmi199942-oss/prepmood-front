-- ============================================================
-- 086_product_options_token_sequence_token_master_option.sql
-- 옵션 메타 SSOT, 옵션별 시퀀스, token_master.option_id 추가
-- 설계: ADMIN_TOKEN_PRODUCT_STOCK_DESIGN.md §3.0
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. product_options 컬럼 추가 (옵션 메타 SSOT)
-- ============================================================
SELECT '=== 1. product_options 컬럼 추가 ===' AS info;

ALTER TABLE product_options
  ADD COLUMN rot_code VARCHAR(100) NULL COMMENT 'ROT 코드 (옵션 고정)',
  ADD COLUMN warranty_bottom_prefix VARCHAR(120) NULL COMMENT 'warranty_bottom_code = prefix + LPAD(seq,6). prefix는 끝 구분자 포함 완성형',
  ADD COLUMN serial_prefix VARCHAR(120) NULL COMMENT 'serial_number = serial_prefix + LPAD(seq,6). prefix는 끝 구분자 포함 완성형',
  ADD COLUMN digital_warranty_code VARCHAR(100) NULL COMMENT '디지털 보증서 코드 (옵션 고정)',
  ADD COLUMN digital_warranty_collection VARCHAR(100) NULL COMMENT '컬렉션명',
  ADD COLUMN season_code VARCHAR(20) NULL COMMENT '시즌 코드 (선택)';

-- ============================================================
-- 2. token_variant_sequence 테이블 생성 (옵션별 원자적 시퀀스)
-- ============================================================
SELECT '=== 2. token_variant_sequence 생성 ===' AS info;

CREATE TABLE IF NOT EXISTS token_variant_sequence (
  option_id BIGINT NOT NULL,
  last_number INT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (option_id),
  CONSTRAINT fk_tvs_option_id
    FOREIGN KEY (option_id) REFERENCES product_options(option_id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. token_master에 option_id 추가
-- ============================================================
SELECT '=== 3. token_master option_id 추가 ===' AS info;

ALTER TABLE token_master ADD COLUMN option_id BIGINT NULL COMMENT 'product_options.option_id 참조 (신규 생성분만 채움)';
CREATE INDEX idx_token_master_option_id ON token_master(option_id);

ALTER TABLE token_master ADD CONSTRAINT fk_tm_option_id
  FOREIGN KEY (option_id) REFERENCES product_options(option_id) ON DELETE SET NULL ON UPDATE CASCADE;

SELECT '=== 086 완료 ===' AS status;
