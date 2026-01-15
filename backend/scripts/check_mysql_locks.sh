#!/bin/bash
# MySQL 락 및 대기 상태 확인 스크립트

echo "=========================================="
echo "MySQL 락 및 대기 상태 확인"
echo "=========================================="
echo ""

cd /var/www/html/backend

echo "1. 현재 실행 중인 프로세스 확인:"
echo "---------------------------------------------------"
mysql -u prepmood_user -p prepmood -e "SHOW FULL PROCESSLIST;" 2>/dev/null || echo "DB 연결 실패"

echo ""
echo "2. InnoDB 상태 확인 (TRANSACTIONS 섹션):"
echo "---------------------------------------------------"
mysql -u prepmood_user -p prepmood -e "SHOW ENGINE INNODB STATUS\G" 2>/dev/null | grep -A 50 "TRANSACTIONS" || echo "DB 연결 실패"

echo ""
echo "3. paid_events UNIQUE 제약 확인:"
echo "---------------------------------------------------"
mysql -u prepmood_user -p prepmood < scripts/check_mysql_locks.sql 2>/dev/null || echo "DB 연결 실패"

echo ""
echo "=========================================="
echo "확인 완료"
echo "=========================================="
echo ""
echo "참고:"
echo "- 오래 걸리는 쿼리가 있으면 락 원인일 수 있음"
echo "- TRANSACTIONS 섹션에서 lock wait 정보 확인"
echo "- UNIQUE 제약이 없으면 중복 INSERT로 인한 락 경합 가능"
