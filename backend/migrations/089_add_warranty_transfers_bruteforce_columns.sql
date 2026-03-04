-- ============================================================
-- 089_add_warranty_transfers_bruteforce_columns.sql
-- 양도 코드 브루트포스 방어: failed_attempts, locked_until 추가
-- 문서: ORDER_AND_SYSTEM_FLOW.md 7절, 13.2, 14.5
-- ============================================================

USE prepmood;

-- warranty_transfers에 실패 횟수·잠금 시각 컬럼 추가 (한 번만 실행)
ALTER TABLE warranty_transfers
  ADD COLUMN failed_attempts INT NOT NULL DEFAULT 0 COMMENT '양도 코드 오입력 실패 횟수',
  ADD COLUMN locked_until DATETIME NULL COMMENT '5회 실패 시 30분 잠금 해제 시각';

SELECT '=== 089 warranty_transfers bruteforce columns 추가 완료 ===' AS status;
