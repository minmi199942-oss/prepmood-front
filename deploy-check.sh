#!/bin/bash
# 배포 전 dry-run 스크립트
# rsync로 지워질 파일/폴더를 미리 확인

REPO_DIR="/root/prepmood-repo"
LIVE_BACKEND="/var/www/html/backend"

echo "🔍 배포 전 확인: 지워질 파일/폴더 목록"
echo "=========================================="
echo ""

# 1. PM2 실행 경로 확인
echo "📋 PM2 실행 경로 확인:"
pm2 describe prepmood-backend 2>/dev/null | grep -E "script|cwd|exec" || echo "⚠️ PM2 프로세스 정보를 가져올 수 없습니다."
echo ""

# 2. 운영 폴더에 실제로 존재하는 파일/폴더 확인
echo "📋 운영 폴더 실제 존재 여부:"
cd "$LIVE_BACKEND" 2>/dev/null || { echo "❌ $LIVE_BACKEND 경로를 찾을 수 없습니다."; exit 1; }

[ -f ".env" ] && echo "  ✅ .env 존재" || echo "  ⚠️  .env 없음"
[ -d "uploads" ] && echo "  ✅ uploads/ 존재" || echo "  ⚠️  uploads/ 없음"
[ -f "prep.db" ] && echo "  ✅ prep.db 존재" || echo "  ⚠️  prep.db 없음"
[ -d "node_modules" ] && echo "  ✅ node_modules/ 존재" || echo "  ⚠️  node_modules/ 없음"
[ -d ".well-known" ] && echo "  ✅ .well-known/ 존재" || echo "  ⚠️  .well-known/ 없음"
if ls *.log 1> /dev/null 2>&1; then
  echo "  ✅ *.log 파일 존재"
else
  echo "  ⚠️  *.log 파일 없음"
fi
echo ""

# 3. exclude 목록 동적 생성 (실제 존재하는 것만)
EXCLUDE_ARGS=(
  "--exclude=.env"
  "--exclude=node_modules/"
)

[ -f ".env" ] && EXCLUDE_ARGS+=("--exclude=.env")
[ -d "uploads" ] && EXCLUDE_ARGS+=("--exclude=uploads/")
[ -f "prep.db" ] && EXCLUDE_ARGS+=("--exclude=prep.db")
[ -d ".well-known" ] && EXCLUDE_ARGS+=("--exclude=.well-known/")
if ls *.log 1> /dev/null 2>&1; then
  EXCLUDE_ARGS+=("--exclude=*.log")
fi

echo "📋 적용될 exclude 목록:"
printf "  %s\n" "${EXCLUDE_ARGS[@]}"
echo ""

# 4. dry-run 실행 (실제로는 복사하지 않음)
echo "🔍 지워질 파일/폴더 목록 (deleting 라인):"
echo "----------------------------------------"
rsync -avn --delete "${EXCLUDE_ARGS[@]}" "$REPO_DIR/backend/" "$LIVE_BACKEND/" 2>&1 | grep -E "^deleting" | head -n 50 || echo "  (지워질 파일 없음)"
echo "----------------------------------------"
echo ""

# 5. 판단 기준 안내
echo "💡 판단 기준:"
echo "  - 'deleting .env' 보이면 ❌ → exclude 고장"
echo "  - 'deleting uploads/...' 보이면 ❌ → exclude에 uploads/ 추가 필요"
echo "  - 'deleting prep.db' 보이면 → 운영 DB면 ❌, 테스트면 ✅"
echo "  - 'deleting node_modules/...' 보이면 → 보통 exclude 권장"
echo "  - 위 항목이 없으면 ✅ → 배포 진행 가능"
echo ""

