#!/bin/bash
# paid_events 생성 실패 원인 확인 스크립트

echo "=== paid_events 생성 실패 로그 확인 ==="
pm2 logs prepmood-backend --lines 500 | grep -A 10 "PAID_EVENT_CREATOR.*paid_events 생성 실패"

echo ""
echo "=== 최근 에러 로그 (상세) ==="
pm2 logs prepmood-backend --lines 100 | grep -E "error_code|error_sql|ER_|HY000" | tail -20
