# 배포 시스템 변경 및 결제 시스템 문제 원인 설명

## 1. 결제 시스템이 망가진 이유

### 문제 발생 시점
보안 강화 작업 중 **CSRF 보호 미들웨어**를 추가했을 때 결제가 멈췄습니다.

### 원인
```javascript
// backend/order-routes.js:367
router.post('/orders', authenticateToken, verifyCSRF, orderCreationLimiter, async (req, res) => {
```

- **예전**: `/api/orders` POST 요청에 CSRF 검증이 없었음 → 바로 통과
- **현재**: `verifyCSRF` 미들웨어 추가 → CSRF 토큰 검증 필수
- **문제**: 프론트엔드에서 CSRF 토큰을 제대로 보내지 않거나, 쿠키가 저장되지 않아서 403 에러 발생

### 해결 과정
1. CSRF 토큰 발급 미들웨어 추가 (`issueCSRFToken`)
2. 프론트엔드에서 CSRF 토큰 요청 로직 추가 (`checkout-payment.js`)
3. 쿠키 설정 문제 해결 (Secure 속성, 도메인 설정 등)

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

**실제 발생한 보안 사고**:
```
GET /.git/config HTTP/1.1" 200 297
```
→ 실제로 `.git` 파일들이 노출되었음

### 새로운 방식 (안전함)

```bash
cd /root/prepmood-repo
git pull origin main
/root/deploy.sh
```

**작동 방식**:
1. `/root/prepmood-repo` (웹 루트 밖)에서 `git pull`로 최신 코드 가져오기
2. `rsync`로 `/root/prepmood-repo/backend/` → `/var/www/html/backend/` 동기화
3. `.env`, `node_modules/`, `prep.db` 등 운영 파일은 제외 (백업됨)
4. `npm ci`로 의존성 설치
5. `pm2 restart`로 서버 재시작
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

**수동으로 해야 할 일**:
```bash
# 1. 파일 복사 (운영 폴더로)
cp -r /root/prepmood-repo/backend/* /var/www/html/backend/

# 2. 의존성 설치
cd /var/www/html/backend
npm install

# 3. 서버 재시작
pm2 restart prepmood-backend
```

**문제점**:
- `.env` 파일이 덮어씌워질 수 있음
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
# 1. 레포 디렉토리로 이동 (선택사항, deploy.sh 내부에서 자동으로 함)
cd /root/prepmood-repo

# 2. 배포 스크립트 실행 (이게 전부!)
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
- **원인**: CSRF 보호 미들웨어 추가 후 토큰 처리 미흡
- **해결**: CSRF 토큰 발급/검증 로직 보완, 쿠키 설정 수정

### 배포 시스템 변경
- **예전**: `/var/www/html/backend`에서 직접 `git pull` → 보안 문제
- **현재**: `/root/prepmood-repo`에서 `git pull` → `rsync`로 동기화 → 안전

### 배포 명령어
- **권장**: `/root/deploy.sh` (한 번에 모든 작업 완료)
- **직접 실행**: `cd /root/prepmood-repo && git pull origin main && /root/deploy.sh` (중복이지만 동작함)

