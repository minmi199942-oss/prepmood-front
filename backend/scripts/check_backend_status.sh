#!/bin/bash
# 백엔드 서버 상태 확인 스크립트

echo "=========================================="
echo "백엔드 서버 상태 확인"
echo "=========================================="
echo ""

cd /var/www/html/backend

echo "1. PM2 프로세스 상태:"
echo "---------------------------------------------------"
pm2 status

echo ""
echo "2. PM2 로그 (최근 20줄):"
echo "---------------------------------------------------"
pm2 logs prepmood-backend --lines 20 --nostream

echo ""
echo "3. 백엔드 포트 확인 (3000번 포트):"
echo "---------------------------------------------------"
netstat -tlnp | grep :3000 || ss -tlnp | grep :3000 || echo "포트 3000이 열려있지 않음"

echo ""
echo "4. nginx 에러 로그 (최근 10줄):"
echo "---------------------------------------------------"
tail -10 /var/log/nginx/error.log 2>/dev/null || echo "nginx 에러 로그 확인 불가"

echo ""
echo "5. 백엔드 프로세스 확인:"
echo "---------------------------------------------------"
ps aux | grep node | grep -v grep

echo ""
echo "=========================================="
echo "확인 완료"
echo "=========================================="
echo ""
echo "문제 해결 방법:"
echo "1. PM2 프로세스가 없으면: pm2 start index.js --name prepmood-backend"
echo "2. PM2 프로세스가 에러 상태면: pm2 restart prepmood-backend"
echo "3. 포트가 열려있지 않으면: 백엔드 서버 시작 확인"
echo "4. nginx 에러 로그 확인: /var/log/nginx/error.log"
