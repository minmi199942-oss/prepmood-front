#!/bin/bash
# 주문 후처리 파이프라인 상태 확인 스크립트

echo "=========================================="
echo "주문 후처리 파이프라인 상태 확인"
echo "=========================================="
echo ""

cd /var/www/html/backend

mysql -u prepmood_user -p prepmood < scripts/check_order_processing_pipeline.sql

echo ""
echo "=========================================="
echo "확인 완료"
echo "=========================================="
echo ""
echo "다음 단계:"
echo "1. paid_events가 없는 주문 → createPaidEvent() 호출 확인 필요"
echo "2. paid_event_processing이 pending/failed → processPaidOrder() 재실행 필요"
echo "3. order_stock_issues에 기록 → 재고 부족 문제 확인 필요"
echo ""
echo "참조: GPT_OPINIONS_INTEGRATED_ANALYSIS.md (8. 우선순위 최종 정리)"
