# 자동 배포 시스템 가이드

## 📋 개요

이 프로젝트는 GitHub webhook을 통한 자동 배포 시스템을 사용합니다. `main` 브랜치에 push하면 자동으로 서버에 배포됩니다.

## 🔧 시스템 구성

### 1. 자동 배포 흐름

```
GitHub Push (main 브랜치)
    ↓
GitHub Webhook → https://prepmood.kr/api/deploy/webhook
    ↓
backend/deploy-webhook.js (서명 검증)
    ↓
deploy.sh 실행 (백그라운드)
    ↓
배포 완료
```

### 2. 주요 파일

- **`backend/deploy-webhook.js`**: GitHub webhook 수신 및 검증
- **`deploy.sh`**: 실제 배포 스크립트
- **`check-deployment.sh`**: 배포 상태 확인 스크립트

## 🚀 GitHub Webhook 설정

### 1단계: GitHub 저장소 설정

1. GitHub 저장소로 이동: `https://github.com/YOUR_USERNAME/YOUR_REPO`
2. **Settings** → **Webhooks** → **Add webhook** 클릭
3. 다음 정보 입력:
   - **Payload URL**: `https://prepmood.kr/api/deploy/webhook`
   - **Content type**: `application/json`
   - **Secret**: `.env` 파일의 `DEPLOY_WEBHOOK_SECRET` 값
   - **Which events**: "Just the push event" 선택
   - **Active**: 체크

### 2단계: 서버 환경 변수 설정

서버의 `/var/www/html/backend/.env` 파일에 다음 변수가 설정되어 있어야 합니다:

```bash
DEPLOY_WEBHOOK_SECRET=your_secret_here
```

**보안 권장사항:**
- 최소 32자 이상의 랜덤 문자열 사용
- GitHub webhook 설정과 동일한 값 사용
- 정기적으로 변경 (선택사항)

**Secret 생성 방법:**
```bash
# Linux/Mac
openssl rand -hex 32

# 또는
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3단계: Webhook 테스트

1. GitHub에서 webhook을 추가한 후, "Recent Deliveries" 탭에서 테스트 이벤트 확인
2. 서버 로그 확인:
   ```bash
   # 웹훅 로그 확인
   tail -f /var/www/html/backend/deploy-webhook.log
   
   # 배포 실행 로그 확인
   tail -f /var/www/html/backend/deploy-run.log
   ```

## 📊 배포 상태 확인

### 배포 상태 확인 스크립트

서버에서 다음 명령어로 배포 상태를 확인할 수 있습니다:

```bash
cd /root/prepmood-repo
bash check-deployment.sh
```

이 스크립트는 다음을 확인합니다:
- 최근 배포 로그
- Git 상태 (로컬 vs 원격)
- 필수 파일 존재 여부
- 이미지/폰트 파일 존재 여부
- PM2 프로세스 상태
- 헬스체크

### 수동 확인 방법

```bash
# 최근 배포 로그 확인
tail -n 50 /var/www/html/backend/deploy-run.log

# 웹훅 로그 확인
tail -n 50 /var/www/html/backend/deploy-webhook.log

# PM2 상태 확인
pm2 status prepmood-backend

# 헬스체크
curl https://prepmood.kr/auth/health

# Git 상태 확인
cd /root/prepmood-repo
git status
git log --oneline -5
```

## 🔍 배포 검증

`deploy.sh`는 배포 후 자동으로 다음을 검증합니다:

1. **필수 파일 존재 확인**
   - `login.html`, `index.html`, `utils.js`
   - `digital-invoice.html`

2. **이미지 파일 확인**
   - `image/prep2.png`
   - `image/prep3.png`
   - `image/logo2.png`

3. **폰트 파일 확인**
   - `prep_server/static/fonts/Paperlogy-4Regular.ttf`

4. **서버 헬스체크**
   - `https://prepmood.kr/auth/health`

5. **PM2 프로세스 상태**
   - 서버가 정상적으로 재시작되었는지 확인

## ⚠️ 문제 해결

### Webhook이 작동하지 않는 경우

1. **서명 검증 실패**
   - `.env`의 `DEPLOY_WEBHOOK_SECRET`이 GitHub webhook 설정과 일치하는지 확인
   - GitHub webhook "Recent Deliveries"에서 오류 메시지 확인

2. **배포 스크립트 없음**
   - `/root/prepmood-repo/deploy.sh` 파일이 존재하는지 확인
   - 파일 권한 확인: `chmod +x /root/prepmood-repo/deploy.sh`

3. **배포 락 문제**
   - 배포가 중단된 경우 락 파일이 남아있을 수 있음
   - 확인: `ls -la /tmp/prepmood-deploy.lock`
   - 제거: `rm /tmp/prepmood-deploy.lock` (주의: 배포가 진행 중이 아닐 때만)

### 배포 실패 시

1. **로그 확인**
   ```bash
   tail -n 100 /var/www/html/backend/deploy-run.log
   ```

2. **수동 배포**
   ```bash
   cd /root/prepmood-repo
   bash deploy.sh
   ```

3. **롤백**
   ```bash
   # 최근 백업 확인
   ls -lt /var/www/html/backups/ | head -5
   
   # 백업 복원
   tar -C /var/www/html -xzf /var/www/html/backups/backend_backup_TIMESTAMP.tgz
   pm2 restart prepmood-backend
   ```

## 🔒 보안 고려사항

1. **Webhook Secret 보호**
   - `.env` 파일은 절대 Git에 커밋하지 않음
   - 서버에서만 관리
   - 정기적으로 변경 권장

2. **배포 스크립트 권한**
   - `deploy.sh`는 root 사용자만 실행 가능해야 함
   - 일반 사용자는 읽기 전용

3. **로그 파일 보안**
   - 배포 로그에는 민감한 정보가 포함될 수 있음
   - 정기적으로 로그 로테이션 권장

## 📝 배포 프로세스 상세

### deploy.sh 실행 단계

1. **배포 락 확인** (중복 실행 방지)
2. **Git pull** (최신 코드 가져오기)
3. **백업 생성** (`/var/www/html/backups/`)
4. **파일 동기화**
   - `backend/` 디렉토리
   - 루트 HTML/JS 파일
   - `assets/` 디렉토리
   - `image/` 디렉토리
   - `prep_server/static/` 디렉토리
   - `admin-qhf25za8/` 디렉토리
5. **의존성 설치** (`npm ci`)
6. **서버 재시작** (`pm2 restart`)
7. **헬스체크**
8. **배포 검증**

### 배포 시간

- 일반적인 배포 시간: 1-3분
- 파일이 많거나 npm 설치가 필요한 경우: 3-5분

## 🎯 모니터링 권장사항

1. **정기적인 상태 확인**
   - 주 1회 `check-deployment.sh` 실행
   - 배포 후 즉시 확인

2. **로그 모니터링**
   - 배포 실패 시 즉시 알림 설정 (선택사항)
   - 로그 파일 크기 모니터링

3. **GitHub Webhook 모니터링**
   - GitHub의 "Recent Deliveries"에서 실패한 요청 확인
   - 정기적으로 webhook 상태 확인

## ✅ 체크리스트

배포 시스템 설정 확인:

- [ ] GitHub webhook이 설정되어 있음
- [ ] `DEPLOY_WEBHOOK_SECRET`이 `.env`에 설정되어 있음
- [ ] `deploy.sh`가 실행 가능한 권한을 가지고 있음
- [ ] 테스트 push로 배포가 정상 작동함
- [ ] 배포 로그가 정상적으로 기록됨
- [ ] 헬스체크가 정상 작동함

## 📞 추가 도움말

문제가 발생하면 다음을 확인하세요:

1. 서버 로그: `/var/www/html/backend/deploy-run.log`
2. 웹훅 로그: `/var/www/html/backend/deploy-webhook.log`
3. PM2 로그: `pm2 logs prepmood-backend`
4. Nginx 로그: `/var/log/nginx/error.log`

