# Pre.p Mood 정품 인증 서버 - 운영 배포 가이드

## 🎯 운영 환경 구조

```
DigitalOcean VPS (Ubuntu 22.04 LTS)
├── Node.js 서버 (pm2)
│   └── 포트: 3000 (내부)
│   └── 역할: 프론트엔드/쇼핑몰 API
│
├── Flask 서버 (Gunicorn + systemd)
│   └── 포트: 5000 (내부)
│   └── 역할: 정품 인증 서버 (/a/<token>)
│
└── Nginx (리버스 프록시)
    └── 포트: 80, 443
    └── 역할: 라우팅 + SSL 종료
    └── Cloudflare → Nginx → Node/Flask
```

---

## 📋 Phase 1: Droplet Rebuild 후 초기 설정

### 1.1 시스템 업데이트

```bash
sudo apt update && sudo apt upgrade -y
```

### 1.2 필수 패키지 설치

```bash
# Python 3.10+ (Ubuntu 22.04 기본 포함)
sudo apt install -y python3 python3-pip python3-venv nginx git

# Node.js 18.x LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# PM2 전역 설치
sudo npm install -g pm2
```

### 1.3 디렉터리 구조 생성

```bash
# 프로젝트 루트
sudo mkdir -p /var/www/prepmood
sudo chown $USER:$USER /var/www/prepmood
cd /var/www/prepmood

# Flask 서버 디렉터리
mkdir -p prep_server
mkdir -p prep_server/templates
```

---

## 📦 Phase 2: Flask 서버 설정 (Gunicorn + systemd)

### 2.1 Flask 앱 배포

```bash
cd /var/www/prepmood/prep_server

# 파일 업로드 (Git 또는 SCP)
# - app.py
# - requirements.txt
# - templates/*.html
# - mapping_result_*.csv
```

### 2.2 가상환경 생성 및 의존성 설치

```bash
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip install gunicorn  # 운영용 WSGI 서버
```

### 2.3 Gunicorn 설정 파일 생성

```bash
nano /var/www/prepmood/prep_server/gunicorn_config.py
```

**gunicorn_config.py 내용:**
```python
# Gunicorn 설정 파일
import multiprocessing

# 서버 소켓
bind = "127.0.0.1:5000"  # 내부 포트만 (Nginx가 프록시)
backlog = 2048

# Worker 프로세스
workers = multiprocessing.cpu_count() * 2 + 1  # CPU 코어 수 * 2 + 1
worker_class = "sync"
worker_connections = 1000
timeout = 30
keepalive = 2

# 로깅
accesslog = "/var/log/prepmood/gunicorn_access.log"
errorlog = "/var/log/prepmood/gunicorn_error.log"
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'

# 프로세스 이름
proc_name = "prepmood_auth"

# 데몬 모드 (systemd가 관리하므로 False)
daemon = False

# 사용자/그룹 (systemd에서 지정)
# user = "www-data"
# group = "www-data"
```

### 2.4 로그 디렉터리 생성

```bash
sudo mkdir -p /var/log/prepmood
sudo chown $USER:$USER /var/log/prepmood
```

### 2.5 Systemd 서비스 파일 생성

```bash
sudo nano /etc/systemd/system/prepmood-auth.service
```

**prepmood-auth.service 내용:**
```ini
[Unit]
Description=Pre.p Mood 정품 인증 서버 (Gunicorn)
After=network.target

[Service]
Type=notify
User=YOUR_USERNAME  # 실제 사용자명으로 변경
Group=YOUR_USERNAME
WorkingDirectory=/var/www/prepmood/prep_server
Environment="PATH=/var/www/prepmood/prep_server/venv/bin"
ExecStart=/var/www/prepmood/prep_server/venv/bin/gunicorn \
    --config /var/www/prepmood/prep_server/gunicorn_config.py \
    app:app
ExecReload=/bin/kill -s HUP $MAINPID
Restart=always
RestartSec=3

# 보안 설정
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/www/prepmood/prep_server /var/log/prepmood

[Install]
WantedBy=multi-user.target
```

**사용자명 변경:**
```bash
# 현재 사용자 확인
whoami

# 서비스 파일에서 YOUR_USERNAME을 실제 사용자명으로 변경
sudo sed -i "s/YOUR_USERNAME/$(whoami)/g" /etc/systemd/system/prepmood-auth.service
```

### 2.6 Systemd 서비스 활성화 및 시작

```bash
# 설정 리로드
sudo systemctl daemon-reload

# 서비스 활성화 (부팅 시 자동 시작)
sudo systemctl enable prepmood-auth

# 서비스 시작
sudo systemctl start prepmood-auth

# 상태 확인
sudo systemctl status prepmood-auth

# 로그 확인
sudo journalctl -u prepmood-auth -f
```

---

## 🌐 Phase 3: Nginx 리버스 프록시 설정

### 3.1 Nginx 설정 파일 생성

```bash
sudo nano /etc/nginx/sites-available/prepmood
```

**prepmood 설정 내용:**
```nginx
# HTTP → HTTPS 리다이렉트 (Cloudflare가 SSL 종료하더라도 안전)
server {
    listen 80;
    listen [::]:80;
    server_name prepmood.kr www.prepmood.kr;

    # Cloudflare로 리다이렉트 (또는 직접 HTTPS 처리)
    return 301 https://$server_name$request_uri;
}

# HTTPS 서버 (Cloudflare SSL 종료 모드)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name prepmood.kr www.prepmood.kr;

    # SSL 인증서 (Cloudflare Origin Certificate 사용 권장)
    # 또는 Let's Encrypt 사용
    ssl_certificate /etc/ssl/certs/prepmood.crt;
    ssl_certificate_key /etc/ssl/private/prepmood.key;
    
    # SSL 설정
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # 로그
    access_log /var/log/nginx/prepmood_access.log;
    error_log /var/log/nginx/prepmood_error.log;

    # 최대 업로드 크기
    client_max_body_size 10M;

    # 정품 인증 서버 (Flask) - /a/<token> 경로
    location /a/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        
        # 타임아웃 설정
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # 버퍼링 설정
        proxy_buffering off;
        proxy_request_buffering off;
    }

    # Node.js 서버 (쇼핑몰) - 나머지 모든 경로
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        
        # WebSocket 지원 (필요한 경우)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # 타임아웃 설정
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 정적 파일 캐싱 (선택사항)
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }
}
```

### 3.2 Nginx 설정 활성화

```bash
# 심볼릭 링크 생성
sudo ln -s /etc/nginx/sites-available/prepmood /etc/nginx/sites-enabled/

# 기본 설정 비활성화 (선택사항)
sudo rm /etc/nginx/sites-enabled/default

# 설정 테스트
sudo nginx -t

# Nginx 재시작
sudo systemctl restart nginx

# 상태 확인
sudo systemctl status nginx
```

---

## 🔒 Phase 4: Cloudflare 설정

### 4.1 Cloudflare Origin Certificate 생성

1. Cloudflare Dashboard → SSL/TLS → Origin Server
2. "Create Certificate" 클릭
3. 인증서 다운로드 (PEM 형식)
4. VPS에 업로드:

```bash
# 인증서 저장
sudo mkdir -p /etc/ssl/certs /etc/ssl/private
sudo nano /etc/ssl/certs/prepmood.crt  # Cloudflare Origin Certificate 붙여넣기
sudo nano /etc/ssl/private/prepmood.key  # Private Key 붙여넣기

# 권한 설정
sudo chmod 644 /etc/ssl/certs/prepmood.crt
sudo chmod 600 /etc/ssl/private/prepmood.key
```

### 4.2 Cloudflare SSL/TLS 모드

- **Full (strict)** 모드 권장
- Cloudflare가 SSL 종료하고, Origin Server와도 SSL 통신

---

## 🔄 Phase 5: 서비스 관리 명령어

### Flask 서버 (Gunicorn)

```bash
# 서비스 시작
sudo systemctl start prepmood-auth

# 서비스 중지
sudo systemctl stop prepmood-auth

# 서비스 재시작
sudo systemctl restart prepmood-auth

# 상태 확인
sudo systemctl status prepmood-auth

# 로그 실시간 확인
sudo journalctl -u prepmood-auth -f

# Gunicorn 로그 확인
tail -f /var/log/prepmood/gunicorn_access.log
tail -f /var/log/prepmood/gunicorn_error.log
```

### Node.js 서버 (PM2)

```bash
# 서비스 시작
pm2 start your-app.js --name prepmood-backend

# 서비스 목록
pm2 list

# 서비스 재시작
pm2 restart prepmood-backend

# 로그 확인
pm2 logs prepmood-backend

# 부팅 시 자동 시작
pm2 startup
pm2 save
```

### Nginx

```bash
# 재시작
sudo systemctl restart nginx

# 설정 테스트
sudo nginx -t

# 로그 확인
sudo tail -f /var/log/nginx/prepmood_access.log
sudo tail -f /var/log/nginx/prepmood_error.log
```

---

## 📊 Phase 6: 모니터링 및 헬스체크

### 6.1 Flask 서버 헬스체크 엔드포인트 추가

**app.py에 추가:**
```python
@app.route('/health')
def health():
    """헬스체크 엔드포인트"""
    return {'status': 'ok', 'service': 'prepmood-auth'}, 200
```

### 6.2 모니터링 스크립트 (선택사항)

```bash
# 간단한 헬스체크 스크립트
cat > /var/www/prepmood/healthcheck.sh << 'EOF'
#!/bin/bash
# Flask 서버 헬스체크
if curl -f http://127.0.0.1:5000/health > /dev/null 2>&1; then
    echo "Flask: OK"
else
    echo "Flask: FAILED"
    sudo systemctl restart prepmood-auth
fi

# Node 서버 헬스체크
if curl -f http://127.0.0.1:3000/health > /dev/null 2>&1; then
    echo "Node: OK"
else
    echo "Node: FAILED"
    pm2 restart prepmood-backend
fi
EOF

chmod +x /var/www/prepmood/healthcheck.sh

# Crontab에 추가 (5분마다 체크)
(crontab -l 2>/dev/null; echo "*/5 * * * * /var/www/prepmood/healthcheck.sh") | crontab -
```

---

## 🚨 Phase 7: 문제 해결

### Flask 서버가 시작되지 않음

```bash
# 1. 서비스 상태 확인
sudo systemctl status prepmood-auth

# 2. 로그 확인
sudo journalctl -u prepmood-auth -n 50

# 3. 수동 실행 테스트
cd /var/www/prepmood/prep_server
source venv/bin/activate
gunicorn --config gunicorn_config.py app:app

# 4. 포트 점유 확인
sudo netstat -tlnp | grep 5000
```

### Nginx 502 Bad Gateway

```bash
# 1. Flask 서버가 실행 중인지 확인
sudo systemctl status prepmood-auth

# 2. 포트 연결 테스트
curl http://127.0.0.1:5000/health

# 3. Nginx 에러 로그 확인
sudo tail -f /var/log/nginx/prepmood_error.log
```

### DB 파일 권한 문제

```bash
# prep.db 파일 권한 확인
ls -la /var/www/prepmood/prep_server/prep.db

# 권한 수정 (필요한 경우)
chmod 644 /var/www/prepmood/prep_server/prep.db
```

---

## ✅ 배포 체크리스트

- [ ] Droplet Rebuild 완료 (Ubuntu 22.04 LTS)
- [ ] Python 3.10+ 설치 확인
- [ ] Node.js 18.x 설치 확인
- [ ] Flask 앱 파일 업로드 완료
- [ ] 가상환경 생성 및 의존성 설치 완료
- [ ] Gunicorn 설치 완료
- [ ] Systemd 서비스 파일 생성 및 활성화
- [ ] Flask 서버 정상 실행 확인
- [ ] Nginx 설정 파일 생성 및 활성화
- [ ] Cloudflare Origin Certificate 설정
- [ ] SSL 인증서 업로드 완료
- [ ] `/a/<token>` 경로 정상 동작 확인
- [ ] 로그 파일 정상 기록 확인
- [ ] 부팅 시 자동 시작 확인

---

## 📝 참고사항

### 보안 권장사항

1. **방화벽 설정:**
```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable
```

2. **Fail2Ban 설치 (선택사항):**
```bash
sudo apt install fail2ban
```

3. **정기 백업:**
```bash
# prep.db 백업 스크립트
cat > /var/www/prepmood/backup_db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/prepmood"
mkdir -p $BACKUP_DIR
cp /var/www/prepmood/prep_server/prep.db $BACKUP_DIR/prep_$(date +%Y%m%d_%H%M%S).db
# 7일 이상 된 백업 삭제
find $BACKUP_DIR -name "prep_*.db" -mtime +7 -delete
EOF

chmod +x /var/www/prepmood/backup_db.sh
# 매일 새벽 2시 백업
(crontab -l 2>/dev/null; echo "0 2 * * * /var/www/prepmood/backup_db.sh") | crontab -
```

---

이 가이드를 따라하면 운영 환경에서 안정적으로 Flask 정품 인증 서버를 운영할 수 있습니다.








