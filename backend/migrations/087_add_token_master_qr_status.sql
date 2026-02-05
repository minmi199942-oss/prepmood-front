-- token_master QR 생성 상태 추적 (TOKEN_PRODUCT_STOCK_CURRENT_FLOW.md §18)
-- 원자성: 파일 생성 확인 후에만 qr_generated_at 갱신, 실패 시 qr_last_error만 기록

ALTER TABLE token_master
    ADD COLUMN qr_generated_at DATETIME NULL DEFAULT NULL AFTER updated_at,
    ADD COLUMN qr_last_error VARCHAR(255) NULL DEFAULT NULL AFTER qr_generated_at;
