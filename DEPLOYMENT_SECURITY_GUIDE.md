# 배포 보안 가이드 (이번 주 필수 작업)

## 📋 작업 체크리스트

### 1. WEBHOOK_SHARED_SECRET 설정 ✅ 필수

**현재 상태**: 로그에 경고가 계속 표시됨

**해결 방법**:
```bash
# VPS에서 .env 파일 편집
cd /var/www/html/backend
nano .env

# 다음 줄을 찾아서 실제 시크릿 값으로 변경
WEBHOOK_SHARED_SECRET=your_webhook_secret_here
# ↓ 변경
WEBHOOK_SHARED_SECRET=실제_랜덤_시크릿_문자열_32자_이상

# 저장 후 서버 재시작
pm2 restart prepmood-backend
```

**시크릿 생성 방법**:
```bash
# 랜덤 시크릿 생성 (32자)
openssl rand -hex 32
```

---

### 2. .env 파일 웹 노출 확인 및 차단 ✅ 필수

**확인**:
```bash
# 웹에서 접근 불가능한지 확인
curl -I https://prepmood.kr/.env
curl -I https://prepmood.kr/backend/.env

# 예상 결과: 404 또는 403
```

**Nginx 차단 룰 적용**:
```bash
# 1. nginx-prepmood.conf 파일을 VPS에 복사
# (Git에서 pull 또는 직접 편집)

# 2. nginx 설정 테스트
sudo nginx -t

# 3. Nginx 재시작
sudo systemctl reload nginx
```

**확인된 차단 룰** (이미 nginx-prepmood.conf에 포함):
```nginx
# .env 및 dotfile 차단
location ~ /\.(?!well-known).* {
    deny all;
    return 404;
}

location ~* \.env$ {
    deny all;
    return 404;
}
```

---

### 3. Nginx Rate Limit Zone 설정 ✅ 필수

**nginx-rate-limit-zones.conf 파일 내용을 `/etc/nginx/nginx.conf`의 `http` 블록에 추가**:

```bash
# VPS에서 실행
sudo nano /etc/nginx/nginx.conf

# http 블록 안에 다음 내용 추가:
```

```nginx
# Rate limit zones (정품 인증 시스템용)
limit_req_zone $binary_remote_addr zone=auth_token:10m rate=50r/15m;
limit_req_zone $binary_remote_addr zone=admin_download:10m rate=10r/15m;
```

**또는 별도 파일로 관리**:
```bash
# /etc/nginx/conf.d/rate-limit.conf 생성
sudo nano /etc/nginx/conf.d/rate-limit.conf
# nginx-rate-limit-zones.conf 내용 붙여넣기

# nginx.conf의 http 블록에 추가
# include /etc/nginx/conf.d/rate-limit.conf;
```

**설정 테스트 및 적용**:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

### 4. 관리자 다운로드 보호 강화 ✅ 필수

**코드 변경사항** (이미 적용됨):
- 별도 rate limit: 15분당 10회
- 감사 로그: IP, 시간, 관리자, 파일 개수

**확인**:
```bash
# Git pull 후 서버 재시작
cd /var/www/html
git pull origin main
cd backend
npm install
pm2 restart prepmood-backend

# 로그 확인
pm2 logs prepmood-backend --lines 20
```

---

### 5. 파일 권한 고정 스크립트 ✅ 필수

**fix-perms.sh 스크립트 실행**:
```bash
# VPS에서 실행
cd /var/www/html
chmod +x fix-perms.sh
./fix-perms.sh
```

**배포 루틴에 포함** (권장):
```bash
# 배포 스크립트 예시 (deploy.sh)
#!/bin/bash
cd /var/www/html
git pull origin main
cd backend
npm install
./fix-perms.sh  # 권한 고정
pm2 restart prepmood-backend
```

---

### 6. 이상 패턴 감지 확인 ✅ 필수

**코드 변경사항** (이미 적용됨):
- 가품 시도 다수 감지 (IP별 10회 초과 시 경고)
- 첫 인증 이상 패턴 감지 (다른 IP, 새벽 시간대)

**로그 확인**:
```bash
# 이상 패턴 감지 로그 확인
pm2 logs prepmood-backend | grep "SECURITY-ALERT"
```

---

## 🚀 전체 배포 순서

```bash
# 1. Git pull
cd /var/www/html
git pull origin main

# 2. Nginx rate limit zone 설정
sudo nano /etc/nginx/nginx.conf
# http 블록에 rate limit zone 추가 (위 참고)

# 3. Nginx 설정 업데이트
sudo cp nginx-prepmood.conf /etc/nginx/sites-available/prepmood
sudo nginx -t
sudo systemctl reload nginx

# 4. .env 파일 수정 (WEBHOOK_SHARED_SECRET)
cd backend
nano .env
# WEBHOOK_SHARED_SECRET 설정

# 5. 파일 권한 고정
cd ..
chmod +x fix-perms.sh
./fix-perms.sh

# 6. 의존성 설치 및 서버 재시작
cd backend
npm install
pm2 restart prepmood-backend

# 7. 확인
pm2 logs prepmood-backend --lines 30
curl -I https://prepmood.kr/.env  # 404 확인
curl https://prepmood.kr/auth/health  # 정상 동작 확인
```

---

## ✅ 배포 후 확인 사항

1. **로그 경고 제거 확인**:
   ```bash
   pm2 logs prepmood-backend | grep "WEBHOOK_SHARED_SECRET"
   # 경고가 없어야 함
   ```

2. **.env 파일 차단 확인**:
   ```bash
   curl -I https://prepmood.kr/.env
   # 404 또는 403 응답 확인
   ```

3. **Rate Limit 동작 확인**:
   ```bash
   # 브라우저에서 빠르게 여러 번 접속
   # 50회 초과 시 429 응답 확인
   ```

4. **헬스체크 동작 확인**:
   ```bash
   curl https://prepmood.kr/auth/health
   # {"status":"ok",...} 응답 확인
   ```

---

## 📝 추가 권장 사항 (이번 달)

1. 토큰 revoke 기능 구현
2. DB 백업 스크립트 + 크론
3. fail2ban 설정
4. 의존성 취약점 정기 점검

---

## 🔒 보안 체크리스트 (최종)

- [x] WEBHOOK_SHARED_SECRET 설정
- [x] .env 파일 웹 노출 차단 (Nginx 룰)
- [x] Nginx 레벨 rate limit (/a/ 경로)
- [x] 관리자 다운로드 보호 강화
- [x] 파일 권한 고정 스크립트
- [x] 이상 패턴 감지
- [x] 헬스체크 엔드포인트 라우팅

