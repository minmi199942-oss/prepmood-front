#!/bin/bash
# 안전한 수동 배포 스크립트
# 이 스크립트는 최신 deploy.sh를 먼저 가져온 후 실행합니다

set -euo pipefail

REPO_DIR="/root/prepmood-repo"
LIVE_BACKEND="/var/www/html/backend"

echo "🔧 안전한 수동 배포 시작"
echo ""

# 1. 레포지토리 최신화
echo "📥 Git pull 중..."
cd "$REPO_DIR" || { echo "❌ $REPO_DIR 디렉토리 접근 실패"; exit 1; }
if ! git pull origin main; then
  echo "❌ Git pull 실패"
  exit 1
fi
echo "✅ Git pull 완료"
echo ""

# 2. 최신 deploy.sh 확인
if [ ! -f "$REPO_DIR/deploy.sh" ]; then
  echo "❌ deploy.sh 파일이 없습니다"
  exit 1
fi
echo "✅ deploy.sh 확인됨"
echo ""

# 3. deploy.sh 실행
echo "🚀 deploy.sh 실행 중..."
echo "   (이제 최신 버전의 deploy.sh가 실행됩니다)"
echo ""
bash "$REPO_DIR/deploy.sh"
