#!/bin/bash
# nginx 설정 파일 업데이트 스크립트

echo "=========================================="
echo "nginx 설정 파일 업데이트"
echo "=========================================="

# 백업 생성
echo "1. 백업 생성 중..."
sudo cp /etc/nginx/sites-available/prepmood /etc/nginx/sites-available/prepmood.backup.$(date +%Y%m%d_%H%M%S)
echo "✅ 백업 완료"

# /a/ 경로가 이미 있는지 확인
if grep -q "location /a/" /etc/nginx/sites-available/prepmood; then
    echo "⚠️  /a/ 경로가 이미 존재합니다. 수동으로 확인해주세요."
    exit 1
fi

# /api 블록 다음에 /a/ 블록 추가
echo "2. /a/ 경로 프록시 설정 추가 중..."
sudo sed -i '/location \/api {/,/^    }/a\
\
    # 정품 인증 라우트 (/a/:token)\
    location /a/ {\
        proxy_pass http://127.0.0.1:3000;\
        proxy_http_version 1.1;\
        proxy_set_header Host $host;\
        proxy_set_header X-Real-IP $remote_addr;\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\
        proxy_set_header X-Forwarded-Proto $scheme;\
        proxy_set_header X-Forwarded-Host $host;\
    }' /etc/nginx/sites-available/prepmood

if [ $? -eq 0 ]; then
    echo "✅ 설정 추가 완료"
else
    echo "❌ 설정 추가 실패"
    exit 1
fi

# nginx 설정 테스트
echo "3. nginx 설정 테스트 중..."
sudo nginx -t

if [ $? -eq 0 ]; then
    echo "✅ 설정 파일 문법 검사 통과"
    echo "4. nginx 재시작 중..."
    sudo systemctl reload nginx
    if [ $? -eq 0 ]; then
        echo "✅ nginx 재시작 완료"
        echo ""
        echo "=========================================="
        echo "✅ 모든 작업 완료!"
        echo "=========================================="
        echo ""
        echo "테스트: https://prepmood.kr/a/ykXU5gkC5iGODL6IY1S9"
    else
        echo "❌ nginx 재시작 실패"
        exit 1
    fi
else
    echo "❌ 설정 파일에 오류가 있습니다. 백업에서 복원하세요:"
    echo "   sudo cp /etc/nginx/sites-available/prepmood.backup.* /etc/nginx/sites-available/prepmood"
    exit 1
fi

