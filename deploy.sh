#!/bin/bash
set -euo pipefail

REPO_DIR="/root/prepmood-repo"
LIVE_BACKEND="/var/www/html/backend"
BACKUP_DIR="/root/backups"

# 배포 락 (중복 실행 방지)
LOCK="/tmp/prepmood-deploy.lock"
if [ -e "$LOCK" ]; then
    LOCK_PID=$(cat "$LOCK" 2>/dev/null || echo "unknown")
    echo "⛔ 이미 배포가 진행 중입니다. (PID: $LOCK_PID)"
    echo "⛔ 잠금 파일: $LOCK"
    exit 0
fi

# 락 파일 생성 (현재 프로세스 ID 저장)
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT INT TERM

# 타임스탬프
TIMESTAMP=$(date +%F_%H%M%S)

echo "🚀 배포 시작: $TIMESTAMP"

# 0. PM2 실행 경로 확인
echo "📋 PM2 실행 경로 확인:"
pm2 describe prepmood-backend 2>/dev/null | grep -E "script|cwd|exec" || echo "⚠️ PM2 프로세스 정보를 가져올 수 없습니다."
echo ""

# 1. Git 업데이트
cd "$REPO_DIR" || { echo "❌ $REPO_DIR 디렉토리 접근 실패"; exit 1; }
echo "📥 Git pull 중..."

# 로컬 변경사항 확인 및 처리
if [ -n "$(git status --porcelain)" ]; then
  echo "  ⚠️  로컬 변경사항 발견"
  echo "  📋 변경된 파일:"
  git status --short
  
  # deploy.sh 파일이 변경된 경우 특별 처리
  if git diff --name-only HEAD | grep -q "^deploy.sh$"; then
    echo "  ⚠️  deploy.sh 파일이 로컬에서 수정되었습니다."
    echo "  💾 deploy.sh 변경사항을 stash에 백업 중..."
    git stash push -m "Auto-deploy backup deploy.sh $(date +%Y%m%d_%H%M%S)" -- deploy.sh 2>/dev/null || {
      echo "  ⚠️  deploy.sh stash 실패, 원격 버전으로 강제 복원"
      git checkout -- deploy.sh
    }
  fi
  
  # 나머지 로컬 변경사항을 stash에 백업 (나중에 복구 가능)
  echo "  💾 나머지 로컬 변경사항을 stash에 백업 중..."
  if git stash push -m "Auto-deploy backup $(date +%Y%m%d_%H%M%S)" 2>/dev/null; then
    echo "  ✅ 로컬 변경사항이 stash에 백업되었습니다."
    echo "  💡 복구 방법: cd $REPO_DIR && git stash list && git stash pop"
  else
    echo "  ⚠️  stash 실패, 원격 버전으로 강제 업데이트 (변경사항 손실 가능)"
    git reset --hard HEAD
    git clean -fd
  fi
fi

# git pull 전에 원격 변경사항 fetch
echo "  📥 원격 변경사항 확인 중..."
if ! git fetch origin main; then
  echo "  ⚠️  git fetch 실패, 재시도 중..."
  sleep 2
  git fetch origin main || {
    echo "  ❌ git fetch 재시도 실패, 원격 버전으로 강제 업데이트"
    git reset --hard origin/main
    git clean -fd
  }
fi

# 현재 로컬 커밋 확인
LOCAL_BEFORE=$(git rev-parse HEAD 2>/dev/null || echo "")
echo "  📋 현재 로컬 커밋: ${LOCAL_BEFORE:0:7}"

# pull 시도 (충돌 발생 시 자동 해결)
if ! git pull origin main; then
  echo "  ⚠️  Git pull 충돌 발생, 원격 버전으로 강제 업데이트"
  git reset --hard origin/main
  git clean -fd
  echo "  ✅ 원격 버전으로 강제 업데이트 완료"
fi

# pull 후 커밋 확인
LOCAL_AFTER=$(git rev-parse HEAD 2>/dev/null || echo "")
REMOTE_COMMIT=$(git rev-parse origin/main 2>/dev/null || echo "")
echo "  📋 업데이트 후 로컬 커밋: ${LOCAL_AFTER:0:7}"
echo "  📋 원격 커밋: ${REMOTE_COMMIT:0:7}"

# 최신 커밋 확인 (로컬과 원격이 다르면 다시 pull)
if [ -n "$LOCAL_AFTER" ] && [ -n "$REMOTE_COMMIT" ] && [ "$LOCAL_AFTER" != "$REMOTE_COMMIT" ]; then
  echo "  ⚠️  로컬과 원격이 다름, 강제 동기화 중..."
  git reset --hard origin/main
  git clean -fd
  LOCAL_AFTER=$(git rev-parse HEAD 2>/dev/null || echo "")
  echo "  ✅ 강제 동기화 완료: ${LOCAL_AFTER:0:7}"
fi

# 2. 백업 생성 (tar 압축) — 웹 루트 외부 /root/backups 사용, 최신 10개만 유지
echo "💾 백업 생성 중..."
mkdir -p "$BACKUP_DIR"
if tar -C /var/www/html -czf "$BACKUP_DIR/backend_backup_$TIMESTAMP.tgz" backend/ 2>/dev/null; then
  echo "✅ 백업 완료: $BACKUP_DIR/backend_backup_$TIMESTAMP.tgz"
  # 회전: 최신 10개만 유지 (재발 방지)
  ls -1t "$BACKUP_DIR"/backend_backup_*.tgz 2>/dev/null | tail -n +11 | xargs -r rm -f
else
  echo "⚠️  백업 생성 실패 (계속 진행하지만 롤백 불가능)"
  echo "💡 수동 백업 권장: tar -C /var/www/html -czf $BACKUP_DIR/manual_backup_$TIMESTAMP.tgz backend/"
fi

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
cd "$LIVE_BACKEND" || { echo "❌ $LIVE_BACKEND 디렉토리 접근 실패"; exit 1; }
[ -f "prep.db" ] && EXCLUDE_ARGS+=("--exclude=prep.db")

# rsync 실행 전 소스와 타겟 확인
echo "  소스: $REPO_DIR/backend/"
echo "  타겟: $LIVE_BACKEND/"
echo "  제외 패턴: ${EXCLUDE_ARGS[*]}"

# rsync 실행 (상세 로그 포함)
if ! rsync -av --delete "${EXCLUDE_ARGS[@]}" "$REPO_DIR/backend/" "$LIVE_BACKEND/" 2>&1 | tee -a "$BACKUP_DIR/deploy-rsync.log"; then
  echo "❌ backend 동기화 실패 - 배포 중단"
  exit 1
fi

# 동기화 검증: 특정 파일이 제대로 복사되었는지 확인
VERIFY_FILE="$LIVE_BACKEND/utils/paid-event-creator.js"
if [ -f "$VERIFY_FILE" ]; then
  # 180번 라인에 catch 블록이 있으면 구문 오류
  if sed -n '180p' "$VERIFY_FILE" | grep -q "catch"; then
    echo "⚠️  경고: $VERIFY_FILE 180번 라인에 catch 블록 발견 (구문 오류 가능성)"
    echo "  rsync가 실행되었지만 파일이 제대로 동기화되지 않았을 수 있습니다."
    echo "  수동 확인 필요: diff $REPO_DIR/backend/utils/paid-event-creator.js $VERIFY_FILE"
  else
    echo "  ✅ $VERIFY_FILE 동기화 검증 완료"
  fi
else
  echo "⚠️  경고: $VERIFY_FILE 파일이 없습니다."
fi

echo "  ✅ backend 동기화 완료"

# 3-2. 루트 HTML/JS 파일 동기화 (허용 목록 기반 - 보안 강화)
echo "📦 루트 HTML/JS 파일 동기화 중..."
LIVE_ROOT="/var/www/html"

# 허용 목록 기반 rsync (의도치 않은 파일 노출 방지)
# 패턴: login.html, index.html, register.html, my-*.html, complete-profile.html, google-callback.html
# JS: utils.js, common.js, my-*.js 등 명시적으로 배포해야 하는 것만
# Partial: header.partial, footer.partial 등 공통 템플릿 파일
# 주의: --delete 제거 (robots.txt, favicon.ico, images/ 등 기존 파일 보호)
rsync -av \
  --include="*/" \
  --include="utils/" \
  --include="utils/*.js" \
  --include="index.html" \
  --include="login.html" \
  --include="register.html" \
  --include="contact.html" \
  --include="my-*.html" \
  --include="warranty-detail.html" \
  --include="digital-warranty.html" \
  --include="digital-invoice.html" \
  --include="invoice-detail.html" \
  --include="complete-profile.html" \
  --include="google-callback.html" \
  --include="catalog.html" \
  --include="cart.html" \
  --include="checkout.html" \
  --include="checkout-review.html" \
  --include="checkout-payment.html" \
  --include="wishlist.html" \
  --include="buy.html" \
  --include="order-complete.html" \
  --include="search.html" \
  --include="email-verification.html" \
  --include="authenticity.html" \
  --include="legal.html" \
  --include="privacy.html" \
  --include="counterfeit-prevention.html" \
  --include="header.partial" \
  --include="footer.partial" \
  --include="utils.js" \
  --include="common.js" \
  --include="my-*.js" \
  --include="warranty-detail.js" \
  --include="digital-warranty.js" \
  --include="digital-invoice.js" \
  --include="invoice-detail.js" \
  --include="header-loader.js" \
  --include="header-scroll.js" \
  --include="footer-loader.js" \
  --include="catalog-script.js" \
  --include="catalog-data.js" \
  --include="cart-script.js" \
  --include="checkout-script.js" \
  --include="checkout-review.js" \
  --include="checkout-payment.js" \
  --include="wishlist-script.js" \
  --include="buy-script.js" \
  --include="order-complete-script.js" \
  --include="mini-cart.js" \
  --include="authenticity-script.js" \
  --include="api-config.js" \
  --include="config.js" \
  --include="product-data.js" \
  --include="qrcode.min.js" \
  --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
  --exclude="*" \
  "$REPO_DIR/" "$LIVE_ROOT/"

echo "  ✅ 루트 파일 동기화 완료 (허용 목록 기반, 기존 파일 보호)"

# 3-3. assets 디렉토리 동기화 (별도 처리)
echo "📦 assets 디렉토리 동기화 중..."
if [ -d "$REPO_DIR/assets" ]; then
  rsync -av \
    --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
    "$REPO_DIR/assets/" "$LIVE_ROOT/assets/"
  echo "  ✅ assets 디렉토리 동기화 완료"
else
  echo "  ⚠️  assets 디렉토리가 없습니다"
fi

# 3-4. 이미지 디렉토리 동기화 (별도 처리)
echo "📦 이미지 디렉토리 동기화 중..."
if [ -d "$REPO_DIR/image" ]; then
  rsync -av \
    --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
    "$REPO_DIR/image/" "$LIVE_ROOT/image/"
  echo "  ✅ image 디렉토리 동기화 완료"
else
  echo "  ⚠️  image 디렉토리가 없습니다"
fi

# 3-5. prep_server/static 디렉토리 동기화 (폰트 파일 등)
echo "📦 prep_server/static 디렉토리 동기화 중..."
if [ -d "$REPO_DIR/prep_server/static" ]; then
  # prep_server 디렉토리가 없으면 생성
  mkdir -p "$LIVE_ROOT/prep_server"
  rsync -av \
    --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
    "$REPO_DIR/prep_server/static/" "$LIVE_ROOT/prep_server/static/"
  echo "  ✅ prep_server/static 디렉토리 동기화 완료"
else
  echo "  ⚠️  prep_server/static 디렉토리가 없습니다"
fi

# 3-6. guest 디렉토리 동기화 (별도 처리)
echo "📦 guest 디렉토리 동기화 중..."
if [ -d "$REPO_DIR/guest" ]; then
  rsync -av \
    --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
    "$REPO_DIR/guest/" "$LIVE_ROOT/guest/"
  echo "  ✅ guest 디렉토리 동기화 완료"
else
  echo "  ⚠️  guest 디렉토리가 없습니다"
fi

# 3-7. 관리자 페이지 디렉토리 동기화 (별도 처리)
echo "📦 관리자 페이지 디렉토리 동기화 중..."
if [ -d "$REPO_DIR/admin-qhf25za8" ]; then
  rsync -av \
    --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
    "$REPO_DIR/admin-qhf25za8/" "$LIVE_ROOT/admin-qhf25za8/"
  echo "  ✅ admin-qhf25za8 디렉토리 동기화 완료"
else
  echo "  ⚠️  admin-qhf25za8 디렉토리가 없습니다"
fi

# 4. 의존성 설치
cd "$LIVE_BACKEND"
echo "📚 의존성 설치 중..."
if [ -f package-lock.json ]; then
  if npm ci --omit=dev; then
    echo "✅ npm ci 성공"
  else
    echo "❌ npm ci 실패 - 배포 중단 (메모리 부족 방지)"
    echo "💡 해결 방법:"
    echo "   1. package-lock.json 확인 및 수정"
    echo "   2. 수동으로 npm ci 실행 후 재배포"
    exit 1
  fi
else
  echo "❌ package-lock.json 없음 - 배포 중단"
  echo "💡 해결 방법: 레포에서 package-lock.json 생성 후 커밋"
  exit 1
fi

# 5. 서버 재시작
echo "🔄 서버 재시작 중..."
# PM2 재시작을 별도 프로세스로 실행하여 부모 프로세스 종료의 영향을 받지 않도록 함
# nohup과 &를 사용하여 완전히 분리된 프로세스로 실행
set +e
# PM2 재시작을 백그라운드로 실행하고, 잠시 대기 후 상태 확인
nohup bash -c "pm2 restart prepmood-backend && sleep 3 && pm2 status prepmood-backend" > /tmp/pm2-restart.log 2>&1 &
PM2_RESTART_PID=$!
set -e
echo "📋 PM2 재시작 프로세스 시작됨 (PID: $PM2_RESTART_PID)"

# 잠시 대기 (PM2 재시작이 시작되도록)
sleep 2

# PM2 상태 확인 (재시작이 완료되었는지 확인)
echo "🔍 PM2 상태 확인 중..."
set +e
PM2_STATUS=$(pm2 status prepmood-backend 2>&1)
PM2_STATUS_EXIT=$?
set -e

if [ $PM2_STATUS_EXIT -eq 0 ]; then
  echo "✅ PM2 프로세스 확인됨"
  echo "$PM2_STATUS" | head -n 5
else
  echo "⚠️  PM2 상태 확인 실패 (프로세스가 재시작 중일 수 있음)"
fi

# 재시작 로그 확인
if [ -f /tmp/pm2-restart.log ]; then
  echo "📋 PM2 재시작 로그:"
  tail -n 10 /tmp/pm2-restart.log || true
fi

echo "✅ PM2 재시작 프로세스 시작 완료 (백그라운드 실행 중)"

# 6. 상태 확인
sleep 2
echo "🔍 서버 상태 확인..."
pm2 status prepmood-backend

# 7. 헬스체크 (PM2 재시작 후 서버가 완전히 시작될 때까지 대기)
echo "🏥 헬스체크 중..."
echo "   (PM2 재시작 후 서버 시작 대기 중...)"
sleep 5  # PM2 재시작 후 서버가 완전히 시작될 때까지 대기

# 헬스체크 재시도 (최대 3번, 각 2초 간격)
HEALTH_CHECK_RETRIES=3
HEALTH_CHECK_SUCCESS=0

for i in $(seq 1 $HEALTH_CHECK_RETRIES); do
  echo "   시도 $i/$HEALTH_CHECK_RETRIES..."
  if curl -fsS https://prepmood.kr/auth/health >/dev/null 2>&1; then
    echo "✅ 헬스체크 성공"
    HEALTH_CHECK_SUCCESS=1
    break
  else
    if [ $i -lt $HEALTH_CHECK_RETRIES ]; then
      echo "   ⏳ 서버 시작 대기 중... (2초 후 재시도)"
      sleep 2
    fi
  fi
done

if [ $HEALTH_CHECK_SUCCESS -eq 0 ]; then
  echo "⚠️  헬스체크 실패 (재시도 $HEALTH_CHECK_RETRIES회 모두 실패)"
  echo "💡 다음을 확인하세요:"
  echo "   1. pm2 logs prepmood-backend --lines 50"
  echo "   2. curl -v https://prepmood.kr/auth/health"
  echo "   3. 서버가 정상적으로 시작되었는지 확인"
  echo ""
  echo "⚠️  배포는 완료되었지만 헬스체크에 실패했습니다."
  echo "   파일은 정상적으로 동기화되었으므로, 서버 로그를 확인하세요."
  # exit 1 대신 경고만 하고 계속 진행 (파일은 이미 동기화됨)
fi

# 8. 배포 후 자동 검증 (루트 파일 실제 갱신 확인)
echo "🔍 배포 후 검증 중..."
VERIFICATION_FAILED=0

# 필수 파일 존재 및 크기 확인
REQUIRED_FILES=("login.html" "index.html" "utils.js")
for file in "${REQUIRED_FILES[@]}"; do
  if [ -f "$LIVE_ROOT/$file" ]; then
    FILE_SIZE=$(stat -c %s "$LIVE_ROOT/$file" 2>/dev/null || echo "0")
    if [ "$FILE_SIZE" -gt 0 ]; then
      echo "  ✅ $file 존재 및 크기 확인 (${FILE_SIZE} bytes)"
    else
      echo "  ❌ $file 크기가 0입니다"
      VERIFICATION_FAILED=1
    fi
  else
    echo "  ❌ $file 존재하지 않음"
    VERIFICATION_FAILED=1
  fi
done

# 필수 이미지 파일 확인
REQUIRED_IMAGES=("prep2.png" "prep3.png" "logo2.png")
for image in "${REQUIRED_IMAGES[@]}"; do
  if [ -f "$LIVE_ROOT/image/$image" ]; then
    IMAGE_SIZE=$(stat -c %s "$LIVE_ROOT/image/$image" 2>/dev/null || echo "0")
    if [ "$IMAGE_SIZE" -gt 0 ]; then
      echo "  ✅ image/$image 존재 및 크기 확인 (${IMAGE_SIZE} bytes)"
    else
      echo "  ❌ image/$image 크기가 0입니다"
      VERIFICATION_FAILED=1
    fi
  else
    echo "  ⚠️  image/$image 존재하지 않음 (경고만, 배포 계속)"
  fi
done

# 필수 폰트 파일 확인
if [ -f "$LIVE_ROOT/prep_server/static/fonts/Paperlogy-4Regular.ttf" ]; then
  FONT_SIZE=$(stat -c %s "$LIVE_ROOT/prep_server/static/fonts/Paperlogy-4Regular.ttf" 2>/dev/null || echo "0")
  if [ "$FONT_SIZE" -gt 0 ]; then
    echo "  ✅ prep_server/static/fonts/Paperlogy-4Regular.ttf 존재 및 크기 확인 (${FONT_SIZE} bytes)"
  else
    echo "  ❌ 폰트 파일 크기가 0입니다"
    VERIFICATION_FAILED=1
  fi
else
  echo "  ⚠️  prep_server/static/fonts/Paperlogy-4Regular.ttf 존재하지 않음 (경고만, 배포 계속)"
fi

# 파일 타임스탬프 확인 (최근 5분 이내 수정된 파일인지)
LOGIN_MTIME=$(stat -c %Y "$LIVE_ROOT/login.html" 2>/dev/null || echo "0")
CURRENT_TIME=$(date +%s)
TIME_DIFF=$((CURRENT_TIME - LOGIN_MTIME))

if [ $TIME_DIFF -lt 300 ]; then
  echo "  ✅ login.html 타임스탬프: 최근 갱신됨 (${TIME_DIFF}초 전)"
else
  echo "  ⚠️  login.html 타임스탬프: 오래됨 (${TIME_DIFF}초 전, 5분 이상)"
  VERIFICATION_FAILED=1
fi

# backend/index.js 타임스탬프 확인
if [ -f "$LIVE_BACKEND/index.js" ]; then
  BACKEND_MTIME=$(stat -c %Y "$LIVE_BACKEND/index.js" 2>/dev/null || echo "0")
  BACKEND_TIME_DIFF=$((CURRENT_TIME - BACKEND_MTIME))
  if [ $BACKEND_TIME_DIFF -lt 300 ]; then
    echo "  ✅ backend/index.js 타임스탬프: 최근 갱신됨 (${BACKEND_TIME_DIFF}초 전)"
  else
    echo "  ⚠️  backend/index.js 타임스탬프: 오래됨 (${BACKEND_TIME_DIFF}초 전)"
    VERIFICATION_FAILED=1
  fi
fi

# 실제 URL 접근 테스트 (login.html 키워드 확인)
if curl -fsS "https://prepmood.kr/login.html" 2>/dev/null | grep -q "로그인" >/dev/null 2>&1; then
  echo "  ✅ login.html URL 접근 확인: 정상 서빙 중"
else
  echo "  ⚠️  login.html URL 접근 확인: 응답 이상 (캐시 문제일 수 있음)"
  # URL 검증 실패는 치명적이지 않으므로 VERIFICATION_FAILED는 증가시키지 않음
fi

if [ $VERIFICATION_FAILED -eq 1 ]; then
  echo "⚠️  배포 검증 경고: 일부 파일이 예상과 다를 수 있습니다"
  echo "💡 수동 확인 권장: ls -la $LIVE_ROOT/login.html"
else
  echo "✅ 배포 검증 완료: 모든 파일 정상"
fi

# --- permissions fix (prevent nginx 403) ---
echo "🔧 디렉토리/파일 권한 보정 중 (Nginx 접근 보장 + 보안 강화)..."
# 루트 디렉토리 권한 확인 및 수정
if [ -d "/var/www/html" ]; then
  chmod 755 /var/www/html
  echo "  ✅ /var/www/html 디렉토리 권한 설정 (755)"
else
  echo "  ⚠️  /var/www/html 디렉토리가 없습니다"
fi

# 1. 먼저 민감한 파일 보호 (600: 소유자만 읽기/쓰기)
echo "  🔒 민감한 파일 보호 중..."
if [ -f "$LIVE_BACKEND/.env" ]; then
  chmod 600 "$LIVE_BACKEND/.env" 2>/dev/null || true
  echo "    ✅ .env 파일 보호 (600)"
fi
if [ -f "$LIVE_BACKEND/prep.db" ]; then
  chmod 600 "$LIVE_BACKEND/prep.db" 2>/dev/null || true
  echo "    ✅ prep.db 파일 보호 (600)"
fi
# 기타 민감한 파일 패턴 보호
find "$LIVE_BACKEND" -type f \( -name "*.key" -o -name "*.pem" -o -name "*secret*" -o -name "*password*" \) -exec chmod 600 {} \; 2>/dev/null || true

# 2. 모든 하위 디렉토리 권한 설정 (755: rwxr-xr-x)
find /var/www/html -type d -exec chmod 755 {} \; 2>/dev/null || true
echo "  ✅ 모든 디렉토리 권한 설정 완료 (755)"

# 3. 모든 파일 권한 설정 (644: rw-r--r--)
find /var/www/html -type f -exec chmod 644 {} \; 2>/dev/null || true
echo "  ✅ 모든 파일 권한 설정 완료 (644)"

# 4. 민감한 파일 다시 보호 (3번에서 덮어씌워졌을 수 있으므로)
if [ -f "$LIVE_BACKEND/.env" ]; then
  chmod 600 "$LIVE_BACKEND/.env" 2>/dev/null || true
fi
if [ -f "$LIVE_BACKEND/prep.db" ]; then
  chmod 600 "$LIVE_BACKEND/prep.db" 2>/dev/null || true
fi
find "$LIVE_BACKEND" -type f \( -name "*.key" -o -name "*.pem" -o -name "*secret*" -o -name "*password*" \) -exec chmod 600 {} \; 2>/dev/null || true

# 5. 소유자 설정 (Nginx가 읽을 수 있도록)
if id "www-data" &>/dev/null; then
  chown -R www-data:www-data /var/www/html 2>/dev/null || true
  echo "  ✅ 소유자 설정 완료 (www-data:www-data)"
else
  echo "  ⚠️  www-data 사용자를 찾을 수 없습니다. 수동 확인 필요"
fi

# 6. 최종 확인
if [ -d "/var/www/html" ]; then
  HTML_PERMS=$(stat -c "%a" /var/www/html 2>/dev/null || echo "unknown")
  echo "  📋 /var/www/html 최종 권한: $HTML_PERMS"
  if [ "$HTML_PERMS" != "755" ]; then
    echo "  ⚠️  경고: /var/www/html 권한이 755가 아닙니다. 수동 확인 필요"
  fi
fi

# 7. 민감한 파일 최종 확인
if [ -f "$LIVE_BACKEND/.env" ]; then
  ENV_PERMS=$(stat -c "%a" "$LIVE_BACKEND/.env" 2>/dev/null || echo "unknown")
  if [ "$ENV_PERMS" != "600" ]; then
    echo "  ⚠️  경고: .env 파일 권한이 600이 아닙니다 ($ENV_PERMS). 수동 확인 필요"
  else
    echo "  ✅ .env 파일 보안 확인 완료 (600)"
  fi
fi

echo "  ✅ 권한 보정 완료"
# ------------------------------------------

echo ""
echo "✅ 배포 완료: $TIMESTAMP"

# 9. 배포 완료 후 최신 커밋 확인 (배포 중 새 커밋이 들어온 경우 대비)
echo "🔍 최신 커밋 확인 중..."
cd "$REPO_DIR" || { echo "❌ $REPO_DIR 디렉토리 접근 실패"; exit 1; }
git fetch origin main >/dev/null 2>&1
LOCAL_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "")
REMOTE_COMMIT=$(git rev-parse origin/main 2>/dev/null || echo "")

if [ -n "$LOCAL_COMMIT" ] && [ -n "$REMOTE_COMMIT" ] && [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
  echo "⚠️  배포 중 새로운 커밋이 감지되었습니다!"
  echo "   로컬: ${LOCAL_COMMIT:0:7}"
  echo "   원격: ${REMOTE_COMMIT:0:7}"
  echo "🔄 자동으로 최신 커밋으로 재배포를 시작합니다..."
  echo ""
  # 락 파일은 trap으로 자동 삭제되므로, 재귀적으로 배포 스크립트 실행
  exec "$0"
else
  echo "✅ 최신 커밋 확인 완료 (로컬과 원격이 동일)"
fi

echo ""
echo "💡 롤백이 필요한 경우:"
echo "   tar -C /var/www/html -xzf $BACKUP_DIR/backend_backup_$TIMESTAMP.tgz"
echo "   pm2 restart prepmood-backend"

