#!/bin/bash
set -euo pipefail

REPO_DIR="/root/prepmood-repo"
LIVE_BACKEND="/var/www/html/backend"
BACKUP_DIR="/var/www/html/backups"

# 타임스탬프
TIMESTAMP=$(date +%F_%H%M%S)

echo "🚀 배포 시작: $TIMESTAMP"

# 1. Git 업데이트
cd "$REPO_DIR"
echo "📥 Git pull 중..."
git pull origin main

# 2. 백업 생성 (tar 압축)
echo "💾 백업 생성 중..."
mkdir -p "$BACKUP_DIR"
tar -C /var/www/html -czf "$BACKUP_DIR/backend_backup_$TIMESTAMP.tgz" backend/
echo "✅ 백업 완료: $BACKUP_DIR/backend_backup_$TIMESTAMP.tgz"

# 3. backend 동기화 (운영 전용 폴더/파일 제외)
echo "📦 파일 동기화 중..."
rsync -av --delete \
  --exclude ".env" \
  --exclude "prep.db" \
  --exclude "node_modules/" \
  --exclude "uploads/" \
  --exclude "*.log" \
  --exclude ".well-known/" \
  "$REPO_DIR/backend/" "$LIVE_BACKEND/"

# 4. 의존성 설치
cd "$LIVE_BACKEND"
echo "📚 의존성 설치 중..."
if [ -f package-lock.json ]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi

# 5. 서버 재시작
echo "🔄 서버 재시작 중..."
pm2 restart prepmood-backend

# 6. 상태 확인
sleep 2
echo "🔍 서버 상태 확인..."
pm2 status prepmood-backend

echo "✅ 배포 완료: $TIMESTAMP"
echo "💡 롤백이 필요한 경우:"
echo "   tar -C /var/www/html -xzf $BACKUP_DIR/backend_backup_$TIMESTAMP.tgz"
echo "   pm2 restart prepmood-backend"

