# 배포 시스템 변경 및 결제 시스템 문제 분석

## 1. 결제 시스템 문제 분석

### 문제 발생 시점
2025-12-27: 보안 강화 작업 중 CSRF 보호 미들웨어 추가 후 결제가 403 에러로 실패

### 직접 원인 (증거 기반)

**서버 로그 증거**:
```
⚠️ CSRF 토큰 누락: {
  hasCookieToken: false,
  hasHeaderToken: false,
  method: 'POST',
  path: '/orders'
}
```

**브라우저 네트워크 캡처 증거** (2025-12-27 확인):
- `/api/auth/status` 응답: `Set-Cookie: xsrf-token=...; SameSite=None` (Secure 속성 없음)
- `/api/orders` POST 요청: `Cookie` 헤더가 포함되지 않음

**코드 구조**:
```javascript
// backend/order-routes.js:367
router.post('/orders', authenticateToken, verifyCSRF, orderCreationLimiter, async (req, res) => {
```

### 문제 분석

#### 1. CSRF 검증 추가
- `verifyCSRF` 미들웨어가 `/api/orders` POST에 추가됨
- 쿠키(`xsrf-token`)와 헤더(`X-XSRF-TOKEN`) 둘 다 필요

#### 2. 서버는 토큰을 발급함
- `/api/auth/status` GET 요청 시 `issueCSRFToken` 미들웨어가 `Set-Cookie`로 `xsrf-token` 발급
- 서버 로그에서 `✅ CSRF 토큰 발급` 확인됨

#### 3. 브라우저가 쿠키를 저장/전송하지 못함 (핵심 문제)
- 브라우저 네트워크에서 `SameSite=None`으로 확인되었지만 `Secure` 속성이 없음
- `SameSite=None`을 사용하려면 반드시 `Secure` 속성이 필요함 (브라우저 정책)
- 결과: 브라우저가 쿠키 저장을 거부 → POST 요청 시 `Cookie` 헤더가 전송되지 않음

#### 4. 프론트엔드는 올바르게 구현됨
- `checkout-payment.js`에서 `secureFetch`를 사용하여 `X-XSRF-TOKEN` 헤더 자동 추가
- `credentials: 'include'` 설정으로 쿠키 전송 시도
- 하지만 쿠키가 저장되지 않았으므로 헤더에 토큰을 포함할 수 없음

### 현재 상태 및 조치 사항

**문제 확인**: 2025-12-27 (서버 로그 및 브라우저 네트워크 캡처)

**조치 완료** (2025-12-28 해결 확인):
1. ✅ CSRF 토큰 발급 미들웨어 추가 (`issueCSRFToken`) - 구현 완료
2. ✅ 프론트엔드에서 CSRF 토큰 요청 로직 추가 (`checkout-payment.js`) - 구현 완료
3. ✅ 쿠키 설정 보완 완료 (`csrf-middleware.js`)
   - `isProductionDomain` 체크 추가로 프로덕션 도메인에서 `secure: true` 보장
   - **배포 후 정상 동작 확인됨** (2025-12-28)

**해결 확인**:
- 브라우저 Application 탭에서 `xsrf-token` 쿠키 확인: `Secure: ✓`, `SameSite: Lax`
- 서버 로그에서 `✅ CSRF 검증 성공: POST /orders` 확인
- 결제 프로세스 정상 진행 확인

**참고**: 
- 현재 코드는 `sameSite: 'lax'`로 설정되어 있으나, 브라우저에서 `SameSite=None`으로 표시되었을 가능성 있음
- Express의 cookie-parser나 브라우저의 자동 변경 가능성

### 검증 방법 (문제 재발 시 체크리스트)

1. **브라우저 Network 탭**:
   - `/api/auth/status` 응답의 `Set-Cookie` 헤더 확인
   - `Secure` 속성 포함 여부 확인
   - `SameSite` 값 확인 (예상: `Lax` 또는 `None` + `Secure`)

2. **브라우저 Application > Cookies**:
   - `xsrf-token` 쿠키가 실제로 저장되었는지 확인
   - 쿠키의 `Domain`, `Path`, `Secure`, `SameSite` 속성 확인

3. **브라우저 Network 탭 - Request Headers**:
   - `/api/orders` POST 요청의 `Cookie` 헤더 포함 여부 확인
   - `X-XSRF-TOKEN` 헤더 포함 여부 확인

4. **서버 로그**:
   ```bash
   pm2 logs prepmood-backend | grep "CSRF"
   ```
   - `hasCookieToken: true`, `hasHeaderToken: true` 확인
   - `hasCookieToken: false`면 브라우저 쿠키 저장 실패
   - `hasHeaderToken: false`면 프론트엔드 헤더 추가 실패

---

## 2. 배포 시스템 변경 (예전 vs 현재)

### 예전 방식 (보안 문제 있음)

```bash
cd /var/www/html/backend
git pull origin main
npm install
pm2 restart prepmood-backend
```

**문제점**:
- `.git` 디렉토리가 웹 루트(`/var/www/html`)에 존재
- 스캐너가 `.git/config`를 HTTP 200으로 접근 가능 (보안 위험)
- Git 히스토리, 브랜치 정보 노출 가능

**실제 발생한 보안 사고** (2025-12-27):
```
GET /.git/config HTTP/1.1" 200 297
```

**근거**:
- nginx access.log에서 스캐너(leakix.net)가 `.git/config`를 HTTP 200으로 접근한 기록 확인
- 원격 IP: 172.68.186.66, 64.62.156.202 등 (스캐너 트래픽)
- Cloudflare 로그에서도 동일한 요청 확인 가능

### 새로운 방식 (안전함)

```bash
/root/deploy.sh
```

**작동 방식**:
1. `/root/prepmood-repo` (웹 루트 밖)에서 `git pull origin main`로 최신 코드 가져오기
2. `rsync`로 `/root/prepmood-repo/backend/` → `/var/www/html/backend/` 동기화
3. `.env`, `node_modules/`, `prep.db` 등 운영 파일은 제외 (백업됨)
4. `npm ci`로 의존성 설치
5. `pm2 restart prepmood-backend`로 서버 재시작
6. 헬스체크로 정상 동작 확인

**장점**:
- `.git` 디렉토리가 웹 루트에 없음 → 보안 문제 해결
- 백업 자동 생성 (배포 전 tar 압축)
- 운영 파일 보호 (`.env`, DB 파일 등)
- 배포 실패 시 롤백 가능

---

## 3. git pull vs deploy.sh 차이

### `git pull origin main`만 하는 경우

```bash
cd /root/prepmood-repo
git pull origin main
```

**하는 일**:
- GitHub에서 최신 코드만 가져옴
- **서버에는 반영 안 됨!** (레포만 업데이트됨)

**수동으로 해야 할 일 (⚠️ 나쁜 예 - 위험함)**:
```bash
# ❌ 이렇게 하면 안 됨 - .env 파일이 덮어씌워질 수 있음!
cp -r /root/prepmood-repo/backend/* /var/www/html/backend/
cd /var/www/html/backend
npm install
pm2 restart prepmood-backend
```

**올바른 수동 배포 방법** (rsync + exclude 사용):
```bash
# ✅ 안전한 방법
# 1. 백업 생성
tar -C /var/www/html -czf /var/www/html/backups/backend_backup_$(date +%F_%H%M%S).tgz backend/

# 2. 파일 동기화 (운영 파일 제외)
rsync -av --delete \
  --exclude=.env \
  --exclude=node_modules/ \
  --exclude=prep.db \
  /root/prepmood-repo/backend/ \
  /var/www/html/backend/

# 3. 의존성 설치
cd /var/www/html/backend
npm ci --omit=dev

# 4. 서버 재시작
pm2 restart prepmood-backend
```

**문제점** (cp 방식의 위험성):
- `.env` 파일이 덮어씌워질 수 있음
- DB 파일(`prep.db`)이 덮어씌워질 수 있음
- 백업이 없음
- 실수 가능성 높음
- 여러 명령어를 수동으로 실행해야 함

### `deploy.sh` 스크립트 사용

```bash
/root/deploy.sh
```

**자동으로 하는 일**:
1. ✅ `/root/prepmood-repo`에서 `git pull origin main`
2. ✅ `/var/www/html/backend` 백업 생성 (tar 압축)
3. ✅ `rsync`로 파일 동기화 (`.env`, `prep.db` 등 제외)
4. ✅ `npm ci`로 의존성 설치 (실패 시 `npm install`로 폴백)
5. ✅ `pm2 restart prepmood-backend`로 서버 재시작
6. ✅ 헬스체크로 정상 동작 확인
7. ✅ 실패 시 롤백 방법 안내

**장점**:
- 한 번의 명령어로 모든 작업 완료
- 안전함 (백업 + 운영 파일 보호)
- 실수 방지

---

## 4. 배포 절차 요약

### 올바른 배포 방법

```bash
# 어디서든 이렇게만 하면 됨
/root/deploy.sh
```

**deploy.sh가 내부적으로 하는 일**:
```bash
cd /root/prepmood-repo          # 레포로 이동
git pull origin main            # 최신 코드 가져오기
# ... 백업, rsync, npm install, pm2 restart ...
```

### 왜 `/root/prepmood-repo`로 들어가야 하나?

**답변**: 사실 안 들어가도 됩니다!

`deploy.sh` 스크립트가 이미 내부에서 `cd /root/prepmood-repo`를 하고 있기 때문에:

```bash
# 어디서든 실행 가능
/root/deploy.sh

# 이렇게 해도 됨 (스크립트가 자동으로 이동함)
cd /root/prepmood-repo
/root/deploy.sh

# 이것도 됨
cd /tmp
/root/deploy.sh
```

**하지만 `git pull`은 왜 필요한가?**

`deploy.sh`가 이미 `git pull`을 포함하고 있으므로, **직접 할 필요 없습니다!**

만약 `deploy.sh` 없이 수동 배포하려면:
```bash
cd /root/prepmood-repo
git pull origin main  # 이건 필요
# 그 다음 rsync, npm install, pm2 restart 수동으로...
```

---

## 5. 요약

### 결제 시스템 문제
- **직접 원인**: 브라우저가 CSRF 토큰 쿠키를 저장/전송하지 못함 (Set-Cookie의 Secure 속성 누락)
- **조치**: 쿠키 설정 보완 완료 (`isProductionDomain` 체크 추가로 `secure: true` 보장)
- **해결 확인**: 2025-12-28 (서버 로그 및 브라우저 쿠키 확인)

### 배포 시스템 변경
- **예전**: `/var/www/html/backend`에서 직접 `git pull` → 보안 문제 (`.git` 노출)
- **현재**: `/root/prepmood-repo`에서 `git pull` → `rsync`로 동기화 → 안전

### 배포 명령어
- **권장**: `/root/deploy.sh` (한 번에 모든 작업 완료)
- **직접 실행**: `cd /root/prepmood-repo && git pull origin main && /root/deploy.sh` (중복이지만 동작함)

