#!/bin/bash
# Nginx 설정에 /static 경로 추가 스크립트

echo "=========================================="
echo "Nginx /static 경로 추가"
echo "=========================================="

NGINX_CONFIG="/etc/nginx/sites-available/prepmood"

# 백업 생성
echo "1. 백업 생성 중..."
sudo cp "$NGINX_CONFIG" "${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"
echo "✅ 백업 완료"

# /static 경로가 이미 있는지 확인
if grep -q "location /static" "$NGINX_CONFIG"; then
    echo "⚠️  /static 경로가 이미 존재합니다."
    echo "현재 설정:"
    grep -A 6 "location /static" "$NGINX_CONFIG"
    exit 0
fi

# /a/ 블록 다음에 /static 블록 추가
echo "2. /static 경로 프록시 설정 추가 중..."
sudo sed -i '/location \/a\/ {/,/^    }/a\
\
    # 정적 파일 서빙 (폰트 등) - Node.js로 프록시\
    location /static {\
        proxy_pass http://127.0.0.1:3000;\
        proxy_http_version 1.1;\
        proxy_set_header Host $host;\
        proxy_set_header X-Real-IP $remote_addr;\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\
        proxy_set_header X-Forwarded-Proto $scheme;\
    }' "$NGINX_CONFIG"

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
        echo "테스트: https://prepmood.kr/static/fonts/Paperlogy-4Regular.ttf"
    else
        echo "❌ nginx 재시작 실패"
        exit 1
    fi
else
    echo "❌ 설정 파일에 오류가 있습니다."
    echo "백업에서 복원하려면:"
    echo "sudo cp ${NGINX_CONFIG}.backup.* $NGINX_CONFIG"
    exit 1
fi

