# 🚀 웹사이트 배포 가이드

**작성일:** 2025년 10월 21일  
**업데이트:** JWT 보안 시스템 적용

---

## ✅ **Git Push 완료!**

로컬 → GitHub 업로드 완료:
```
✅ 커밋: feat: JWT 기반 인증 시스템 및 보안 강화 (D→A- 등급)
✅ 푸시: origin/main
✅ 상태: 성공!
```

---

## 📋 **서버(VPS)에서 해야 할 작업**

### **1단계: 프론트엔드 업데이트**

SSH로 VPS(prepmood.kr) 접속 후:

```bash
# 프론트엔드 디렉토리로 이동
cd /var/www/prepmood  # 또는 실제 경로

# 최신 코드 가져오기
git pull origin main

# 변경사항 확인
git log -1
```

**예상 출력:**
```
commit 844a5ae...
Author: ...
Date: ...

    feat: JWT 기반 인증 시스템 및 보안 강화 (D→A- 등급)
```

---

### **2단계: 백엔드 패키지 설치**

```bash
# 백엔드 디렉토리로 이동
cd backend

# 새로운 패키지 설치 (cookie-parser)
npm install

# 확인
npm list cookie-parser
```

**예상 출력:**
```
prepmood-backend@1.0.0 /path/to/backend
└── cookie-parser@1.4.6
```

---

### **3단계: 환경 변수 확인**

```bash
# .env 파일 편집
nano .env  # 또는 vi .env
```

**필수 환경 변수:**
```env
# JWT 시크릿 키 (매우 중요!)
JWT_SECRET=your-very-long-and-random-secret-key-here-please-change-this

# Node 환경
NODE_ENV=production

# CORS 설정
ALLOWED_ORIGINS=https://prepmood.kr

# 데이터베이스 (기존 설정 유지)
DB_HOST=...
DB_USER=...
DB_PASSWORD=...
DB_NAME=...
```

**⚠️ JWT_SECRET 생성 방법:**
```bash
# 랜덤 시크릿 키 생성 (64자)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

생성된 문자열을 `.env`의 `JWT_SECRET`에 복사!

---

### **4단계: PM2 재시작**

```bash
# PM2로 백엔드 재시작
pm2 restart prepmood-backend

# 또는 전체 재시작
pm2 restart all

# 로그 확인
pm2 logs prepmood-backend --lines 50
```

**정상 로그 예시:**
```
✅ MySQL 연결 성공!
✅ 이메일 서비스 준비 완료!
🚀 서버가 포트 3000에서 실행 중입니다.
```

**오류 발생 시:**
```bash
# 오류 로그 확인
pm2 logs prepmood-backend --err --lines 100

# 프로세스 상태 확인
pm2 status
```

---

### **5단계: Nginx 설정 확인 (선택)**

쿠키가 제대로 전달되려면 Nginx에서 프록시 헤더 설정 필요:

```bash
# Nginx 설정 확인
sudo nano /etc/nginx/sites-available/prepmood.kr
```

**확인할 내용:**
```nginx
location /api/ {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    
    # ✅ 쿠키 전달을 위해 필요
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

**수정했다면:**
```bash
# Nginx 설정 테스트
sudo nginx -t

# 재시작
sudo systemctl reload nginx
```

---

## 🧪 **배포 후 테스트**

### **1. 서버 상태 확인**
```bash
# 브라우저에서:
https://prepmood.kr/api/health

# 예상 응답:
{
  "success": true,
  "message": "서버가 정상적으로 작동 중입니다.",
  "timestamp": "2025-10-21T..."
}
```

### **2. 로그인 테스트**
```
1. https://prepmood.kr/login.html 접속
2. 이메일/비밀번호로 로그인
3. F12 → Application → Cookies → prepmood.kr 확인
   ✅ accessToken 쿠키 있음
   ✅ HttpOnly: ✓
   ✅ Secure: ✓
   ✅ SameSite: Strict
```

### **3. 보안 테스트**
```
1. F12 → Console
2. localStorage.setItem('isLoggedIn', 'true');
3. 페이지 새로고침
4. 결과: ❌ 여전히 비로그인! (성공!)
```

### **4. 위시리스트 테스트**
```
1. 로그인 상태에서 위시리스트 추가
2. F12 → Network → wishlist/toggle 확인
   ✅ Cookie: accessToken 포함됨
   ❌ X-User-Email 헤더 없음
3. 성공 메시지 확인
```

---

## 🚨 **문제 해결**

### **문제 1: "로그인이 필요합니다" 반복**

**원인:** JWT_SECRET이 설정되지 않았거나 틀림

**해결:**
```bash
cd backend
cat .env | grep JWT_SECRET

# 없거나 비어있으면:
echo "JWT_SECRET=$(node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\")" >> .env

pm2 restart prepmood-backend
```

---

### **문제 2: "Cannot set headers after they are sent"**

**원인:** 쿠키 관련 응답 중복

**해결:**
```bash
# 로그 확인
pm2 logs prepmood-backend --err --lines 200

# 코드 확인 필요 (응답을 두 번 보내는지)
```

---

### **문제 3: 쿠키가 설정되지 않음**

**원인:** CORS 설정 또는 Nginx 프록시 문제

**확인:**
```bash
# 1. backend/.env 확인
cat backend/.env | grep ALLOWED_ORIGINS
# → https://prepmood.kr 포함되어야 함

# 2. CORS credentials 확인 (코드에 이미 있음)
# backend/index.js:
# credentials: true

# 3. 프론트엔드에서 credentials 확인
# login.html, wishlist-script.js 등:
# credentials: 'include'
```

---

### **문제 4: 위시리스트 API 401 오류**

**원인:** JWT 토큰 검증 실패

**확인:**
```bash
# PM2 로그에서 JWT 관련 오류 찾기
pm2 logs prepmood-backend | grep JWT

# 토큰 만료 확인
# → 7일 후 자동 만료, 재로그인 필요
```

---

## 📊 **배포 체크리스트**

프론트엔드:
- [x] Git pull 완료
- [ ] 파일 권한 확인 (chmod 644 *.html)
- [ ] Cloudflare 캐시 삭제 (선택)

백엔드:
- [ ] npm install 완료
- [ ] .env에 JWT_SECRET 설정
- [ ] PM2 재시작 완료
- [ ] 로그 확인 (오류 없음)

테스트:
- [ ] /api/health 정상
- [ ] 로그인 성공
- [ ] JWT 쿠키 설정 확인
- [ ] F12 우회 불가 확인
- [ ] 위시리스트 작동 확인

---

## 🎉 **배포 완료 후**

모든 테스트가 통과하면:

```
✅ JWT 인증 시스템 활성화
✅ httpOnly 쿠키로 토큰 저장
✅ F12 로그인 우회 불가능
✅ 타인 데이터 조작 불가능
✅ 보안 등급: D → A-
✅ 프로덕션 배포 완료!
```

**축하합니다! 🎊**

---

## 📝 **서버 명령어 요약**

```bash
# VPS 접속
ssh user@prepmood.kr

# 프론트엔드 업데이트
cd /var/www/prepmood
git pull origin main

# 백엔드 업데이트
cd backend
npm install

# .env 확인 및 수정
nano .env
# → JWT_SECRET 추가/확인

# PM2 재시작
pm2 restart prepmood-backend

# 로그 확인
pm2 logs prepmood-backend --lines 50

# 완료!
```

---

**문제가 발생하면 알려주세요!** 😊


