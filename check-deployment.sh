#!/bin/bash
# 배포 상태 확인 스크립트
# 사용법: bash check-deployment.sh

LIVE_ROOT="/var/www/html"
LIVE_BACKEND="/var/www/html/backend"
REPO_DIR="/root/prepmood-repo"

echo "🔍 배포 상태 확인"
echo "=========================================="
echo ""

# 1. 최근 배포 로그 확인
echo "📋 최근 배포 로그:"
if [ -f "$LIVE_BACKEND/deploy-run.log" ]; then
  echo "  마지막 배포 로그 (마지막 20줄):"
  tail -n 20 "$LIVE_BACKEND/deploy-run.log" | sed 's/^/    /'
  echo ""
else
  echo "  ⚠️  deploy-run.log 파일이 없습니다"
  echo ""
fi

# 2. 웹훅 로그 확인
if [ -f "$LIVE_BACKEND/deploy-webhook.log" ]; then
  echo "📋 최근 웹훅 로그 (마지막 10줄):"
  tail -n 10 "$LIVE_BACKEND/deploy-webhook.log" | sed 's/^/    /'
  echo ""
fi

# 3. Git 상태 확인
echo "📋 Git 상태:"
cd "$REPO_DIR" 2>/dev/null || { echo "  ❌ $REPO_DIR 디렉토리 접근 실패"; exit 1; }
CURRENT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
REMOTE_COMMIT=$(git ls-remote origin main 2>/dev/null | cut -f1 | cut -c1-7 || echo "unknown")
echo "  로컬 커밋: $CURRENT_COMMIT"
echo "  원격 커밋: $REMOTE_COMMIT"
if [ "$CURRENT_COMMIT" != "$REMOTE_COMMIT" ] && [ "$CURRENT_COMMIT" != "unknown" ] && [ "$REMOTE_COMMIT" != "unknown" ]; then
  echo "  ⚠️  로컬과 원격이 다릅니다 (git pull 필요)"
else
  echo "  ✅ 로컬과 원격이 동기화됨"
fi
echo ""

# 4. 필수 파일 존재 확인
echo "📋 필수 파일 확인:"
REQUIRED_FILES=("login.html" "index.html" "utils.js" "digital-invoice.html")
for file in "${REQUIRED_FILES[@]}"; do
  if [ -f "$LIVE_ROOT/$file" ]; then
    FILE_SIZE=$(stat -c %s "$LIVE_ROOT/$file" 2>/dev/null || echo "0")
    FILE_MTIME=$(stat -c %Y "$LIVE_ROOT/$file" 2>/dev/null || echo "0")
    FILE_DATE=$(date -d "@$FILE_MTIME" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "unknown")
    echo "  ✅ $file (${FILE_SIZE} bytes, 수정: $FILE_DATE)"
  else
    echo "  ❌ $file 없음"
  fi
done
echo ""

# 5. 이미지 파일 확인
echo "📋 이미지 파일 확인:"
REQUIRED_IMAGES=("prep2.png" "prep3.png" "logo2.png")
for image in "${REQUIRED_IMAGES[@]}"; do
  if [ -f "$LIVE_ROOT/image/$image" ]; then
    IMAGE_SIZE=$(stat -c %s "$LIVE_ROOT/image/$image" 2>/dev/null || echo "0")
    echo "  ✅ image/$image (${IMAGE_SIZE} bytes)"
  else
    echo "  ❌ image/$image 없음"
  fi
done
echo ""

# 6. 폰트 파일 확인
echo "📋 폰트 파일 확인:"
if [ -f "$LIVE_ROOT/prep_server/static/fonts/Paperlogy-4Regular.ttf" ]; then
  FONT_SIZE=$(stat -c %s "$LIVE_ROOT/prep_server/static/fonts/Paperlogy-4Regular.ttf" 2>/dev/null || echo "0")
  echo "  ✅ prep_server/static/fonts/Paperlogy-4Regular.ttf (${FONT_SIZE} bytes)"
else
  echo "  ❌ prep_server/static/fonts/Paperlogy-4Regular.ttf 없음"
fi
echo ""

# 7. PM2 상태 확인
echo "📋 PM2 상태:"
pm2 status prepmood-backend 2>/dev/null || echo "  ⚠️  PM2 프로세스 정보를 가져올 수 없습니다"
echo ""

# 8. 헬스체크
echo "📋 헬스체크:"
if curl -fsS https://prepmood.kr/auth/health >/dev/null 2>&1; then
  echo "  ✅ 서버 정상 동작 중"
else
  echo "  ❌ 서버 응답 없음"
fi
echo ""

# 9. 배포 락 확인
LOCK="/tmp/prepmood-deploy.lock"
if [ -e "$LOCK" ]; then
  LOCK_PID=$(cat "$LOCK" 2>/dev/null || echo "unknown")
  echo "⚠️  배포가 진행 중일 수 있습니다 (락 파일 존재, PID: $LOCK_PID)"
  echo "   락 파일: $LOCK"
else
  echo "✅ 배포 락 없음 (배포 가능 상태)"
fi
echo ""

echo "=========================================="
echo "✅ 배포 상태 확인 완료"

