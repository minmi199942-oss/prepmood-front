#!/bin/bash
# 주문 58 에러 상세 확인 스크립트

echo "=== 1. 주문 58 관련 모든 로그 ==="
pm2 logs prepmood-backend --lines 1000 | grep -i "58\|ORD-20260115-322539" | tail -100

echo ""
echo "=== 2. paid_events 관련 에러 ==="
pm2 logs prepmood-backend --lines 1000 | grep -i "paid.*event\|PAID_EVENT" | tail -50

echo ""
echo "=== 3. 최근 에러 로그 (전체) ==="
pm2 logs prepmood-backend --lines 200 | grep -i "error\|❌\|failed" | tail -50

echo ""
echo "=== 4. payments/confirm 관련 로그 ==="
pm2 logs prepmood-backend --lines 1000 | grep -i "payments.*confirm\|/payments/confirm" | tail -50
