#!/bin/bash
set -euo pipefail

REPO_DIR="/root/prepmood-repo"
LIVE_BACKEND="/var/www/html/backend"
BACKUP_DIR="/var/www/html/backups"

# 타임스탬프
TIMESTAMP=$(date +%F_%H%M%S)

echo "🚀 배포 시작: $TIMESTAMP"

# 0. PM2 실행 경로 확인
echo "📋 PM2 실행 경로 확인:"
pm2 describe prepmood-backend 2>/dev/null | grep -E "script|cwd|exec" || echo "⚠️ PM2 프로세스 정보를 가져올 수 없습니다."
echo ""

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

# 기본 exclude (런타임 디렉토리 미래 대비 포함)
EXCLUDE_ARGS=(
  "--exclude=.env"
  "--exclude=node_modules/"
  "--exclude=uploads/"
  "--exclude=storage/"
  "--exclude=logs/"
  "--exclude=data/"
  "--exclude=.well-known/"
  "--exclude=*.log"
)

# 동적 추가: 특정 파일이 존재하면 추가 보호
cd "$LIVE_BACKEND"
[ -f "prep.db" ] && EXCLUDE_ARGS+=("--exclude=prep.db")

rsync -av --delete "${EXCLUDE_ARGS[@]}" "$REPO_DIR/backend/" "$LIVE_BACKEND/"

# 3-2. 루트 HTML 파일 동기화 (login.html 등)
echo "📦 루트 HTML 파일 동기화 중..."
LIVE_ROOT="/var/www/html"
ROOT_HTML_FILES=(
    "login.html"
    "index.html"
    "register.html"
    "my-profile.html"
    "my-orders.html"
    "complete-profile.html"
    "utils.js"
    "google-callback.html"
)

for file in "${ROOT_HTML_FILES[@]}"; do
    if [ -f "$REPO_DIR/$file" ]; then
        cp "$REPO_DIR/$file" "$LIVE_ROOT/$file"
        echo "  ✅ $file 동기화 완료"
    fi
done

# 4. 의존성 설치
cd "$LIVE_BACKEND"
echo "📚 의존성 설치 중..."
if [ -f package-lock.json ]; then
  if npm ci --omit=dev; then
    echo "✅ npm ci 성공"
  else
    echo "⚠️ npm ci 실패 - npm install로 폴백"
    npm install --omit=dev
  fi
else
  echo "⚠️ package-lock.json 없음 - npm install"
  npm install --omit=dev
fi

# 5. 서버 재시작
echo "🔄 서버 재시작 중..."
pm2 restart prepmood-backend

# 6. 상태 확인
sleep 2
echo "🔍 서버 상태 확인..."
pm2 status prepmood-backend

# 7. 헬스체크 (실패 시 배포 실패 처리)
echo "🏥 헬스체크 중..."
if curl -fsS https://prepmood.kr/auth/health >/dev/null 2>&1; then
  echo "✅ 헬스체크 성공"
else
  echo "❌ 헬스체크 실패 - 배포 실패로 처리"
  echo "💡 롤백 방법:"
  echo "   tar -C /var/www/html -xzf $BACKUP_DIR/backend_backup_$TIMESTAMP.tgz"
  echo "   pm2 restart prepmood-backend"
  exit 1
fi

echo "✅ 배포 완료: $TIMESTAMP"
echo "💡 롤백이 필요한 경우:"
echo "   tar -C /var/www/html -xzf $BACKUP_DIR/backend_backup_$TIMESTAMP.tgz"
echo "   pm2 restart prepmood-backend"

