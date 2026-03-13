-- ============================================================
-- 094_add_stock_holds_active_lock.sql
-- Phase 1: stock_holds ACTIVE 중복 방지 (active_lock + UNIQUE)
--  - ACTIVE: 아직 살아 있는 hold
--  - CONSUMED: 결제 성공 후 사용 완료
--  - RELEASED: 명시적 실패로 즉시 해제
--  - EXPIRED: TTL 경과로 자연 만료
-- ============================================================

USE prepmood;

-- active_lock 컬럼 추가
-- ACTIVE 일 때만 1, 그 외 상태(RELEASED/EXPIRED/CONSUMED)는 NULL
ALTER TABLE stock_holds
    ADD COLUMN active_lock TINYINT(1) GENERATED ALWAYS AS (
        CASE
            WHEN status = 'ACTIVE' THEN 1
            ELSE NULL
        END
    ) VIRTUAL;

-- 같은 stock_unit_id에 대해 동시에 두 개 이상의 ACTIVE hold가 생기지 않도록 UNIQUE 제약 추가
ALTER TABLE stock_holds
    ADD UNIQUE KEY uk_stock_holds_active_unit (stock_unit_id, active_lock);

-- 검증용 출력
SELECT '=== 094 stock_holds active_lock + UNIQUE(stock_unit_id, active_lock) 적용 완료 ===' AS info;

