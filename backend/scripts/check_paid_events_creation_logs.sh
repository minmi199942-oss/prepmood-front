#!/bin/bash
# paid_events 생성 실패 원인 확인 스크립트

echo "=========================================="
echo "paid_events 생성 실패 원인 확인"
echo "=========================================="
echo ""

cd /var/www/html/backend

echo "1. 최근 결제 확인 로그 확인 (createPaidEvent 호출 여부):"
echo "---------------------------------------------------"
pm2 logs prepmood-backend --lines 200 --nostream | grep -E "(createPaidEvent|paid_events|PAID_EVENT)" | tail -20

echo ""
echo "2. 결제 확인 에러 로그 확인:"
echo "---------------------------------------------------"
pm2 logs prepmood-backend --lines 200 --nostream | grep -E "(payments.*confirm|Paid 처리 실패|paid_events 생성 실패)" | tail -20

echo ""
echo "3. 최근 주문 처리 로그 확인:"
echo "---------------------------------------------------"
pm2 logs prepmood-backend --lines 200 --nostream | grep -E "(order_id.*61|order_id.*60|order_id.*58|order_id.*57)" | tail -20

echo ""
echo "=========================================="
echo "확인 완료"
echo "=========================================="
echo ""
echo "참고:"
echo "- createPaidEvent 호출이 없으면: payments/confirm 라우트가 호출되지 않았거나 paymentStatus !== 'captured'"
echo "- createPaidEvent 실패 로그가 있으면: 에러 메시지 확인"
echo "- 트랜잭션 롤백 로그가 있으면: DB 연결 문제 또는 제약 조건 위반"
