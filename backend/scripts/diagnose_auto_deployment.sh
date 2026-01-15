#!/bin/bash
# 자동 배포 시스템 진단 스크립트

echo "=========================================="
echo "🔍 자동 배포 시스템 진단"
echo "=========================================="
echo ""

# 1. 웹훅 로그 확인
echo "📋 1. 웹훅 수신 로그 (최근 30줄):"
echo "----------------------------------------"
if [ -f "/var/www/html/backend/deploy-webhook.log" ]; then
    tail -n 30 /var/www/html/backend/deploy-webhook.log
    echo ""
    echo "✅ 웹훅 로그 파일 존재"
else
    echo "❌ 웹훅 로그 파일이 없습니다: /var/www/html/backend/deploy-webhook.log"
    echo "   → 웹훅이 한 번도 수신되지 않았거나 로그 파일 생성 실패"
fi
echo ""

# 2. 배포 실행 로그 확인
echo "📋 2. 배포 실행 로그 (최근 30줄):"
echo "----------------------------------------"
if [ -f "/var/www/html/backend/deploy-run.log" ]; then
    tail -n 30 /var/www/html/backend/deploy-run.log
    echo ""
    echo "✅ 배포 실행 로그 파일 존재"
else
    echo "❌ 배포 실행 로그 파일이 없습니다: /var/www/html/backend/deploy-run.log"
    echo "   → 배포 스크립트가 실행되지 않았거나 로그 파일 생성 실패"
fi
echo ""

# 3. 배포 스크립트 존재 확인
echo "📋 3. 배포 스크립트 존재 확인:"
echo "----------------------------------------"
DEPLOY_SCRIPT="/root/prepmood-repo/deploy.sh"
if [ -f "$DEPLOY_SCRIPT" ]; then
    echo "✅ 배포 스크립트 존재: $DEPLOY_SCRIPT"
    if [ -x "$DEPLOY_SCRIPT" ]; then
        echo "✅ 실행 권한 있음"
    else
        echo "❌ 실행 권한 없음 (chmod +x 필요)"
    fi
else
    echo "❌ 배포 스크립트 없음: $DEPLOY_SCRIPT"
fi
echo ""

# 4. 배포 락 확인
echo "📋 4. 배포 락 상태:"
echo "----------------------------------------"
LOCK="/tmp/prepmood-deploy.lock"
if [ -f "$LOCK" ]; then
    LOCK_PID=$(cat "$LOCK" 2>/dev/null || echo "unknown")
    echo "⚠️  배포 락이 활성화되어 있습니다. (PID: $LOCK_PID)"
    
    if ps -p "$LOCK_PID" > /dev/null 2>&1; then
        echo "✅ 프로세스가 실행 중입니다."
    else
        echo "❌ 프로세스가 실행되지 않습니다. (잘못된 락 파일)"
        echo "💡 락 파일 제거 권장: rm $LOCK"
    fi
else
    echo "✅ 배포 락이 없습니다. (정상 상태)"
fi
echo ""

# 5. Git 저장소 상태 확인
echo "📋 5. Git 저장소 상태:"
echo "----------------------------------------"
REPO_DIR="/root/prepmood-repo"
if [ -d "$REPO_DIR" ]; then
    cd "$REPO_DIR" || exit 1
    echo "현재 브랜치: $(git branch --show-current 2>/dev/null || echo 'unknown')"
    echo "최근 커밋: $(git log -1 --oneline 2>/dev/null || echo 'unknown')"
    echo ""
    
    # 원격과 비교
    echo "원격과 비교:"
    git fetch origin main 2>/dev/null || echo "⚠️  git fetch 실패"
    LOCAL=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    REMOTE=$(git rev-parse origin/main 2>/dev/null || echo "unknown")
    
    if [ "$LOCAL" = "$REMOTE" ] && [ "$LOCAL" != "unknown" ]; then
        echo "✅ 로컬과 원격이 동기화되어 있습니다."
    else
        echo "⚠️  로컬과 원격이 다릅니다."
        echo "   로컬: ${LOCAL:0:7}"
        echo "   원격: ${REMOTE:0:7}"
    fi
else
    echo "❌ Git 저장소를 찾을 수 없습니다: $REPO_DIR"
fi
echo ""

# 6. 배포된 코드 버전 확인
echo "📋 6. 배포된 코드 버전 확인:"
echo "----------------------------------------"
LIVE_BACKEND="/var/www/html/backend"
if [ -f "$LIVE_BACKEND/utils/paid-event-creator.js" ]; then
    echo "✅ paid-event-creator.js 파일 존재"
    
    # 180번 라인 확인
    LINE_180=$(sed -n '180p' "$LIVE_BACKEND/utils/paid-event-creator.js" 2>/dev/null || echo "")
    if echo "$LINE_180" | grep -q "catch"; then
        echo "❌ 180번 라인에 'catch' 키워드 발견 (구문 오류 가능성)"
        echo "   라인 내용: $LINE_180"
    else
        echo "✅ 180번 라인 정상 (catch 키워드 없음)"
    fi
else
    echo "❌ paid-event-creator.js 파일을 찾을 수 없습니다."
fi
echo ""

# 7. PM2 상태 확인
echo "📋 7. PM2 서버 상태:"
echo "----------------------------------------"
if command -v pm2 > /dev/null 2>&1; then
    pm2 status prepmood-backend 2>/dev/null || echo "⚠️  PM2 프로세스를 찾을 수 없습니다."
    
    # 최근 에러 로그 확인
    echo ""
    echo "최근 에러 로그 (SyntaxError 확인):"
    pm2 logs prepmood-backend --lines 5 --nostream --err 2>/dev/null | grep -i "syntax\|error" || echo "  (에러 없음)"
else
    echo "❌ PM2가 설치되어 있지 않습니다."
fi
echo ""

# 8. 환경 변수 확인
echo "📋 8. 환경 변수 확인:"
echo "----------------------------------------"
if [ -f "/var/www/html/backend/.env" ]; then
    if grep -q "DEPLOY_WEBHOOK_SECRET" /var/www/html/backend/.env; then
        echo "✅ DEPLOY_WEBHOOK_SECRET 설정됨"
    else
        echo "❌ DEPLOY_WEBHOOK_SECRET이 .env에 없음"
    fi
else
    echo "⚠️  .env 파일을 찾을 수 없습니다."
fi
echo ""

# 9. 웹훅 엔드포인트 확인
echo "📋 9. 웹훅 엔드포인트 확인:"
echo "----------------------------------------"
echo "엔드포인트: https://prepmood.kr/api/deploy/webhook"
echo ""
echo "테스트 방법:"
echo "1. GitHub 저장소 → Settings → Webhooks"
echo "2. 'Recent Deliveries' 탭에서 최근 push 이벤트 확인"
echo "3. 실패한 요청이 있으면 'Redeliver' 클릭"
echo ""

# 10. 최근 배포 프로세스 확인
echo "📋 10. 최근 배포 프로세스:"
echo "----------------------------------------"
if ps aux | grep -E "deploy.sh|bash.*deploy" | grep -v grep; then
    echo "✅ 배포 프로세스가 실행 중입니다."
else
    echo "ℹ️  현재 실행 중인 배포 프로세스가 없습니다."
fi
echo ""

# 11. 최근 push 이벤트 확인 (GitHub webhook 로그 기반)
echo "📋 11. 최근 웹훅 이벤트 요약:"
echo "----------------------------------------"
if [ -f "/var/www/html/backend/deploy-webhook.log" ]; then
    echo "최근 웹훅 수신:"
    grep -E "웹훅 수신|자동 배포 시작|❌|⚠️" /var/www/html/backend/deploy-webhook.log | tail -n 10 || echo "  (이벤트 없음)"
else
    echo "⚠️  웹훅 로그 파일이 없습니다."
fi
echo ""

echo "=========================================="
echo "✅ 진단 완료"
echo "=========================================="
echo ""
echo "💡 문제 해결 팁:"
echo ""
echo "1. 웹훅이 수신되지 않는 경우:"
echo "   - GitHub 저장소 → Settings → Webhooks → Recent Deliveries 확인"
echo "   - 'Redeliver' 버튼으로 재시도"
echo ""
echo "2. 배포 스크립트가 실행되지 않는 경우:"
echo "   - 배포 락 제거: rm /tmp/prepmood-deploy.lock"
echo "   - 수동 배포: cd /root/prepmood-repo && bash deploy.sh"
echo ""
echo "3. 코드가 업데이트되지 않는 경우:"
echo "   - Git pull 확인: cd /root/prepmood-repo && git pull origin main"
echo "   - 배포 스크립트 수동 실행"
echo ""
echo "4. 구문 오류가 있는 경우:"
echo "   - 로컬에서 수정 후 push"
echo "   - 또는 VPS에서 직접 수정: nano /var/www/html/backend/utils/paid-event-creator.js"
