-- stock_units 데이터 확인
USE prepmood;

SELECT '=== stock_units 데이터 확인 ===' AS info;
SELECT 
    su.stock_unit_id,
    su.token_pk,
    su.status,
    su.reserved_by_order_id,
    tm.product_name,
    tm.internal_code,
    tm.serial_number
FROM stock_units su
LEFT JOIN token_master tm ON su.token_pk = tm.token_pk;
