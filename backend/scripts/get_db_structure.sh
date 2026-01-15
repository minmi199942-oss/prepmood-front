#!/bin/bash
# DB 구조 추출 및 프로젝트에 저장 스크립트
# VPS에서 실행: bash scripts/get_db_structure.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_FILE="$SCRIPT_DIR/db_structure_actual.txt"
TEMP_FILE="/tmp/db_structure.txt"

echo "📊 DB 구조 추출 중..."
cd "$REPO_DIR/backend" || exit 1

# DB 구조 추출
mysql -u prepmood_user -p prepmood < scripts/show_db_structure.sql > "$TEMP_FILE" 2>&1

# 파일 크기 확인
FILE_SIZE=$(wc -l < "$TEMP_FILE")
echo "✅ 추출 완료: $FILE_SIZE 줄"

# 프로젝트 디렉토리로 복사
cp "$TEMP_FILE" "$OUTPUT_FILE"
echo "✅ 파일 저장: $OUTPUT_FILE"

# Git 상태 확인
if [ -d "$REPO_DIR/.git" ]; then
    echo ""
    echo "📋 다음 단계:"
    echo "   cd $REPO_DIR"
    echo "   git add backend/scripts/db_structure_actual.txt"
    echo "   git commit -m 'docs: update actual DB structure snapshot'"
    echo "   git push"
else
    echo "⚠️  Git 저장소가 아닙니다. 파일만 저장되었습니다."
fi

echo ""
echo "✅ 완료!"
