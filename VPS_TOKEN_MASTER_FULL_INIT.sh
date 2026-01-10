#!/bin/bash
# token_master 완전 초기화 스크립트
# 주의: 모든 stock_units 데이터가 삭제됩니다!

set -e  # 오류 발생 시 중단

cd /var/www/html/backend

echo "=== Step 1: stock_units 데이터 확인 ==="
mysql -u prepmood_user -p prepmood -e "
SELECT 
    su.stock_unit_id,
    su.token_pk,
    su.status,
    tm.product_name,
    tm.internal_code
FROM stock_units su
LEFT JOIN token_master tm ON su.token_pk = tm.token_pk;
"

echo ""
echo "=== Step 2: stock_units 데이터 삭제 ==="
mysql -u prepmood_user -p prepmood -e "DELETE FROM stock_units;"
echo "✅ stock_units 데이터 삭제 완료"

echo ""
echo "=== Step 3: FK 제약 제거 ==="
mysql -u prepmood_user -p prepmood < migrations/044_init_token_master_with_fk_handling.sql

echo ""
echo "=== Step 4: token_master 완전 초기화 ==="
node init-token-master-from-xlsx.js

echo ""
echo "=== Step 5: FK 제약 복원 ==="
mysql -u prepmood_user -p prepmood < migrations/045_restore_stock_units_fk.sql

echo ""
echo "=== Step 6: 초기화 결과 확인 ==="
mysql -u prepmood_user -p prepmood -e "
SELECT 
    COUNT(*) as total_tokens,
    COUNT(serial_number) as with_serial_number,
    COUNT(rot_code) as with_rot_code,
    COUNT(warranty_bottom_code) as with_warranty_bottom_code
FROM token_master;
"

echo ""
echo "✅ token_master 완전 초기화 완료!"
