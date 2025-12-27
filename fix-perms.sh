#!/bin/bash
# 파일 권한 고정 스크립트
# 배포 후 항상 실행하여 권한 일관성 보장
# 사용법: ./fix-perms.sh 또는 bash fix-perms.sh

set -e  # 에러 발생 시 중단

# 색상 출력
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔒 파일 권한 고정 시작...${NC}"

# 프로젝트 루트 경로 (스크립트 위치 기준)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
BACKEND_DIR="$PROJECT_ROOT/backend"
QR_CODES_DIR="$PROJECT_ROOT/output_qrcodes"

# 웹 서버 사용자 (Nginx/Apache)
WEB_USER="www-data"
WEB_GROUP="www-data"

# 1. .env 파일 권한 (600: 소유자만 읽기/쓰기)
if [ -f "$BACKEND_DIR/.env" ]; then
    chmod 600 "$BACKEND_DIR/.env"
    chown "$WEB_USER:$WEB_GROUP" "$BACKEND_DIR/.env"
    echo -e "${GREEN}✅ .env 파일 권한 설정 완료${NC}"
else
    echo -e "${YELLOW}⚠️  .env 파일을 찾을 수 없습니다: $BACKEND_DIR/.env${NC}"
fi

# 2. DB 파일 권한 (600: 소유자만 읽기/쓰기)
if [ -f "$BACKEND_DIR/prep.db" ]; then
    chmod 600 "$BACKEND_DIR/prep.db"
    chown "$WEB_USER:$WEB_GROUP" "$BACKEND_DIR/prep.db"
    echo -e "${GREEN}✅ DB 파일 권한 설정 완료${NC}"
else
    echo -e "${YELLOW}⚠️  DB 파일을 찾을 수 없습니다: $BACKEND_DIR/prep.db${NC}"
fi

# 3. QR 코드 폴더 권한 (755: 소유자 모든 권한, 그룹/기타 읽기/실행)
if [ -d "$QR_CODES_DIR" ]; then
    chmod 755 "$QR_CODES_DIR"
    chown -R "$WEB_USER:$WEB_GROUP" "$QR_CODES_DIR"
    
    # QR 코드 파일 권한 (644: 소유자 읽기/쓰기, 그룹/기타 읽기)
    find "$QR_CODES_DIR" -type f -name "*.png" -exec chmod 644 {} \;
    
    echo -e "${GREEN}✅ QR 코드 폴더 권한 설정 완료${NC}"
else
    echo -e "${YELLOW}⚠️  QR 코드 폴더를 찾을 수 없습니다: $QR_CODES_DIR${NC}"
fi

# 4. backend 폴더 권한 (755)
if [ -d "$BACKEND_DIR" ]; then
    chmod 755 "$BACKEND_DIR"
    echo -e "${GREEN}✅ backend 폴더 권한 설정 완료${NC}"
fi

# 5. 로그 파일 권한 (640: 소유자 읽기/쓰기, 그룹 읽기)
if [ -d "$HOME/.pm2/logs" ]; then
    chmod 640 "$HOME/.pm2/logs"/*.log 2>/dev/null || true
    echo -e "${GREEN}✅ PM2 로그 파일 권한 설정 완료${NC}"
fi

echo -e "${GREEN}🎉 모든 권한 설정 완료!${NC}"

# 권한 확인 출력
echo ""
echo -e "${YELLOW}📋 권한 확인:${NC}"
if [ -f "$BACKEND_DIR/.env" ]; then
    ls -la "$BACKEND_DIR/.env" | awk '{print "  .env: " $1 " " $3 ":" $4}'
fi
if [ -f "$BACKEND_DIR/prep.db" ]; then
    ls -la "$BACKEND_DIR/prep.db" | awk '{print "  prep.db: " $1 " " $3 ":" $4}'
fi

