#!/bin/bash
# 배포 전 dry-run 스크립트
# rsync로 지워질 파일/폴더를 미리 확인

REPO_DIR="/root/prepmood-repo"
LIVE_BACKEND="/var/www/html/backend"

echo "🔍 배포 전 확인: 지워질 파일/폴더 목록"
echo "=========================================="
echo ""

# dry-run 실행 (실제로는 복사하지 않음)
rsync -avn --delete \
  --exclude ".env" \
  --exclude "prep.db" \
  --exclude "node_modules/" \
  --exclude "uploads/" \
  --exclude "*.log" \
  --exclude ".well-known/" \
  "$REPO_DIR/backend/" "$LIVE_BACKEND/" | grep -E "^deleting|^>" | tail -n 50

echo ""
echo "=========================================="
echo "💡 'deleting' 라인은 지워질 파일/폴더입니다."
echo "💡 중요한 파일이 보이면 deploy.sh의 --exclude에 추가하세요."

