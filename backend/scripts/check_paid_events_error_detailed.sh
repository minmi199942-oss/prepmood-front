#!/bin/bash
# paid_events 생성 실패 상세 에러 확인

echo "=========================================="
echo "paid_events 생성 실패 상세 에러 확인"
echo "=========================================="
echo ""

cd /var/www/html/backend

echo "1. paid-event-creator.js 에러 로그 (전체 스택 트레이스):"
echo "---------------------------------------------------"
pm2 logs prepmood-backend --lines 500 --nostream | grep -A 30 "PAID_EVENT_CREATOR.*paid_events 생성 실패" | tail -50

echo ""
echo "2. payments/confirm 에러 로그 (전체 스택 트레이스):"
echo "---------------------------------------------------"
pm2 logs prepmood-backend --lines 500 --nostream | grep -A 30 "payments.*confirm.*Paid 처리 실패" | tail -50

echo ""
echo "3. 최근 에러 로그 (전체):"
echo "---------------------------------------------------"
pm2 logs prepmood-backend --lines 200 --nostream | grep -E "(Error|ER_|SQL)" | tail -30

echo ""
echo "4. paid_events 테이블 구조 확인:"
echo "---------------------------------------------------"
mysql -u prepmood_user -p prepmood -e "DESCRIBE paid_events;" 2>/dev/null || echo "DB 연결 실패 (수동으로 확인 필요)"

echo ""
echo "=========================================="
echo "확인 완료"
echo "=========================================="
