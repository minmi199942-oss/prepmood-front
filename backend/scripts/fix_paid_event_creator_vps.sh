#!/bin/bash
# VPS에서 paid-event-creator.js 파일 직접 수정 스크립트

echo "=========================================="
echo "paid-event-creator.js 파일 수정"
echo "=========================================="
echo ""

cd /var/www/html/backend/utils

# 백업
cp paid-event-creator.js paid-event-creator.js.backup

# 180-193번 라인 삭제 및 교체
# sed를 사용하여 180-193번 라인을 삭제하고 새 코드로 교체
sed -i '180,193d' paid-event-creator.js

# 179번 라인 다음에 새 코드 추가
sed -i '179a\    \n    // 모든 재시도 실패 (이 코드는 도달하지 않아야 하지만 방어 코드)\n    throw new Error('\''paid_events 생성 실패: 모든 재시도 실패'\'');' paid-event-creator.js

echo "✅ 파일 수정 완료"
echo ""
echo "수정 내용 확인:"
sed -n '175,185p' paid-event-creator.js

echo ""
echo "PM2 재시작 중..."
pm2 restart prepmood-backend

echo ""
echo "✅ 완료"
