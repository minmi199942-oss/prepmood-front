#!/bin/bash
# 자동 배포 상태 확인 스크립트

echo "=========================================="
echo "🔍 자동 배포 상태 확인"
echo "=========================================="
echo ""

# 1. 웹훅 로그 확인 (최근 20줄)
echo "📋 1. 웹훅 수신 로그 (최근 20줄):"
echo "----------------------------------------"
if [ -f "/var/www/html/backend/deploy-webhook.log" ]; then
    tail -n 20 /var/www/html/backend/deploy-webhook.log
else
    echo "⚠️  웹훅 로그 파일이 없습니다: /var/www/html/backend/deploy-webhook.log"
fi
echo ""

# 2. 배포 실행 로그 확인 (최근 30줄)
echo "📋 2. 배포 실행 로그 (최근 30줄):"
echo "----------------------------------------"
if [ -f "/var/www/html/backend/deploy-run.log" ]; then
    tail -n 30 /var/www/html/backend/deploy-run.log
else
    echo "⚠️  배포 실행 로그 파일이 없습니다: /var/www/html/backend/deploy-run.log"
fi
echo ""

# 3. 배포 락 확인
echo "📋 3. 배포 락 상태:"
echo "----------------------------------------"
if [ -f "/tmp/prepmood-deploy.lock" ]; then
    LOCK_PID=$(cat /tmp/prepmood-deploy.lock 2>/dev/null || echo "unknown")
    echo "⚠️  배포 락이 활성화되어 있습니다. (PID: $LOCK_PID)"
    
    # 프로세스가 실행 중인지 확인
    if ps -p "$LOCK_PID" > /dev/null 2>&1; then
        echo "✅ 프로세스가 실행 중입니다."
    else
        echo "❌ 프로세스가 실행되지 않습니다. (잘못된 락 파일일 수 있음)"
        echo "💡 락 파일 제거: rm /tmp/prepmood-deploy.lock"
    fi
else
    echo "✅ 배포 락이 없습니다. (정상 상태)"
fi
echo ""

# 4. Git 상태 확인
echo "📋 4. Git 저장소 상태:"
echo "----------------------------------------"
REPO_DIR="/root/prepmood-repo"
if [ -d "$REPO_DIR" ]; then
    cd "$REPO_DIR" || exit 1
    echo "현재 브랜치: $(git branch --show-current)"
    echo "최근 커밋: $(git log -1 --oneline)"
    echo ""
    echo "원격과 비교:"
    git fetch origin main 2>/dev/null
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse origin/main 2>/dev/null || echo "unknown")
    if [ "$LOCAL" = "$REMOTE" ]; then
        echo "✅ 로컬과 원격이 동기화되어 있습니다."
    else
        echo "⚠️  로컬과 원격이 다릅니다."
        echo "   로컬: $LOCAL"
        echo "   원격: $REMOTE"
    fi
else
    echo "❌ Git 저장소를 찾을 수 없습니다: $REPO_DIR"
fi
echo ""

# 5. 배포된 코드 버전 확인
echo "📋 5. 배포된 코드 버전:"
echo "----------------------------------------"
LIVE_BACKEND="/var/www/html/backend"
if [ -f "$LIVE_BACKEND/stock-routes.js" ]; then
    # admin-stock.js의 최근 수정 확인
    if [ -f "/var/www/html/admin-qhf25za8/admin-stock.js" ]; then
        echo "admin-stock.js 최근 수정: $(stat -c %y /var/www/html/admin-qhf25za8/admin-stock.js 2>/dev/null || stat -f '%Sm' /var/www/html/admin-qhf25za8/admin-stock.js 2>/dev/null || echo 'unknown')"
        
        # encodeURIComponent 포함 여부 확인
        if grep -q "encodeURIComponent(productId)" /var/www/html/admin-qhf25za8/admin-stock.js; then
            echo "✅ encodeURIComponent 수정사항이 배포되어 있습니다."
        else
            echo "❌ encodeURIComponent 수정사항이 배포되지 않았습니다."
        fi
    else
        echo "⚠️  admin-stock.js 파일을 찾을 수 없습니다."
    fi
else
    echo "⚠️  배포된 backend 디렉토리를 찾을 수 없습니다."
fi
echo ""

# 6. PM2 상태 확인
echo "📋 6. PM2 서버 상태:"
echo "----------------------------------------"
if command -v pm2 > /dev/null 2>&1; then
    pm2 status prepmood-backend 2>/dev/null || echo "⚠️  PM2 프로세스를 찾을 수 없습니다."
else
    echo "⚠️  PM2가 설치되어 있지 않습니다."
fi
echo ""

# 7. GitHub Webhook 설정 확인 (안내)
echo "📋 7. GitHub Webhook 설정 확인 (수동):"
echo "----------------------------------------"
echo "1. GitHub 저장소로 이동: https://github.com/minmi199942-oss/prepmood-front"
echo "2. Settings → Webhooks"
echo "3. 다음 항목 확인:"
echo "   - Payload URL: https://prepmood.kr/api/deploy/webhook"
echo "   - Active: ✓ 체크됨"
echo "   - Recent Deliveries: 최근 push 이벤트 확인"
echo ""

# 8. 최근 배포 프로세스 확인
echo "📋 8. 최근 배포 프로세스:"
echo "----------------------------------------"
if ps aux | grep -E "deploy.sh|bash.*deploy" | grep -v grep; then
    echo "✅ 배포 프로세스가 실행 중입니다."
else
    echo "ℹ️  현재 실행 중인 배포 프로세스가 없습니다."
fi
echo ""

echo "=========================================="
echo "✅ 확인 완료"
echo "=========================================="
echo ""
echo "💡 문제 해결 팁:"
echo "1. 웹훅 로그에 '❌' 오류가 있으면 해당 오류를 확인하세요."
echo "2. 배포 락이 남아있으면: rm /tmp/prepmood-deploy.lock"
echo "3. 수동 배포: cd /root/prepmood-repo && bash deploy.sh"
echo "4. GitHub webhook 재테스트: GitHub 저장소 → Settings → Webhooks → Recent Deliveries → Redeliver"
