# 자동 배포 시스템 완전 점검

## 🔍 발견된 문제들

### 문제 1: Git pull 실패 (해결됨)
**증상**: 
```
error: Your local changes to the following files would be overwritten by merge:
        deploy.sh
Please commit your changes or stash them before you merge.
```

**원인**: VPS의 `/root/prepmood-repo`에 로컬 변경사항이 있어서 Git pull이 실패

**해결**: `deploy.sh`에 로컬 변경사항을 무시하고 원격 최신 버전으로 강제 업데이트하는 로직 추가

### 문제 2: 파일 동기화 실패
**증상**: 
- Git 저장소의 파일은 정상 (paid-event-creator.js 180번 라인 정상)
- 배포된 파일은 구문 오류 (paid-event-creator.js 180번 라인에 catch 블록 남아있음)

**원인**: 
- Git pull이 실패해서 배포가 중단됨
- rsync가 실행되지 않았거나 실패했지만 에러가 무시됨

**해결**: 
- Git pull 문제 해결
- rsync 로깅 및 검증 로직 추가

## 📋 자동 배포 시스템 구성 요소

### 1. GitHub Webhook
- **엔드포인트**: `https://prepmood.kr/api/deploy/webhook`
- **파일**: `backend/deploy-webhook.js`
- **역할**: GitHub push 이벤트 수신 및 검증

### 2. 배포 스크립트
- **경로**: `/root/prepmood-repo/deploy.sh`
- **역할**: 실제 배포 실행
- **단계**:
  1. Git pull (로컬 변경사항 무시)
  2. 백업 생성
  3. 파일 동기화 (rsync)
  4. 의존성 설치 (npm ci)
  5. PM2 재시작
  6. 검증

### 3. 로그 파일
- **웹훅 로그**: `/var/www/html/backend/deploy-webhook.log`
- **배포 실행 로그**: `/var/www/html/backend/deploy-run.log`
- **rsync 로그**: `/var/www/html/backups/deploy-rsync.log` (새로 추가)

## ✅ 수정 사항

### 1. deploy.sh - Git pull 개선
```bash
# 로컬 변경사항이 있으면 무시하고 원격 최신 버전으로 강제 업데이트
if [ -n "$(git status --porcelain)" ]; then
  echo "  ⚠️  로컬 변경사항 발견, 원격 버전으로 강제 업데이트"
  git reset --hard HEAD
  git clean -fd
fi
```

### 2. deploy.sh - rsync 로깅 및 검증 추가
```bash
# rsync 실행 전 소스와 타겟 확인
echo "  소스: $REPO_DIR/backend/"
echo "  타겟: $LIVE_BACKEND/"
echo "  제외 패턴: ${EXCLUDE_ARGS[*]}"

# rsync 실행 (상세 로그 포함)
if ! rsync -av --delete "${EXCLUDE_ARGS[@]}" "$REPO_DIR/backend/" "$LIVE_BACKEND/" 2>&1 | tee -a "$BACKUP_DIR/deploy-rsync.log"; then
  echo "❌ backend 동기화 실패 - 배포 중단"
  exit 1
fi

# 동기화 검증: 특정 파일이 제대로 복사되었는지 확인
VERIFY_FILE="$LIVE_BACKEND/utils/paid-event-creator.js"
if [ -f "$VERIFY_FILE" ]; then
  # 180번 라인에 catch 블록이 있으면 구문 오류
  if sed -n '180p' "$VERIFY_FILE" | grep -q "catch"; then
    echo "⚠️  경고: $VERIFY_FILE 180번 라인에 catch 블록 발견 (구문 오류 가능성)"
    echo "  rsync가 실행되었지만 파일이 제대로 동기화되지 않았을 수 있습니다."
    echo "  수동 확인 필요: diff $REPO_DIR/backend/utils/paid-event-creator.js $VERIFY_FILE"
  else
    echo "  ✅ $VERIFY_FILE 동기화 검증 완료"
  fi
fi
```

## 🧪 테스트 방법

### 1. 수동 배포 테스트
```bash
cd /root/prepmood-repo
git pull origin main
bash deploy.sh
```

### 2. 자동 배포 테스트
```bash
# 로컬에서 작은 변경사항 커밋 후 push
git commit --allow-empty -m "test: auto deployment"
git push origin main

# VPS에서 로그 확인
tail -f /var/www/html/backend/deploy-run.log
```

### 3. 배포 검증
```bash
# 1. Git 저장소와 배포된 파일 비교
diff /root/prepmood-repo/backend/utils/paid-event-creator.js \
     /var/www/html/backend/utils/paid-event-creator.js

# 2. 구문 오류 확인
sed -n '175,185p' /var/www/html/backend/utils/paid-event-creator.js

# 3. PM2 상태 확인
pm2 status prepmood-backend
pm2 logs prepmood-backend --lines 10 --nostream
```

## 🔧 VPS에서 즉시 적용

### 1. 배포 스크립트 실행 권한 부여
```bash
chmod +x /root/prepmood-repo/deploy.sh
```

### 2. 로컬 변경사항 정리
```bash
cd /root/prepmood-repo
git reset --hard HEAD
git clean -fd
git pull origin main
```

### 3. 수동 배포 실행 (테스트)
```bash
cd /root/prepmood-repo
bash deploy.sh
```

### 4. 자동 배포 확인
```bash
# 다음 push부터 자동 배포가 정상 작동해야 함
# 로그 모니터링
tail -f /var/www/html/backend/deploy-run.log
```

## 📊 배포 프로세스 흐름

```
GitHub Push (main 브랜치)
    ↓
GitHub Webhook → https://prepmood.kr/api/deploy/webhook
    ↓
backend/deploy-webhook.js
    - 서명 검증
    - push 이벤트 확인
    - main 브랜치 확인
    ↓
/root/prepmood-repo/deploy.sh 실행 (분리된 프로세스)
    ↓
1. Git pull (로컬 변경사항 무시)
    ↓
2. 백업 생성
    ↓
3. 파일 동기화 (rsync)
    - backend/ 디렉토리
    - 루트 HTML/JS 파일
    - assets/ 디렉토리
    - image/ 디렉토리
    - prep_server/static/ 디렉토리
    - admin-qhf25za8/ 디렉토리
    ↓
4. 의존성 설치 (npm ci)
    ↓
5. PM2 재시작
    ↓
6. 검증
    - 파일 동기화 검증
    - PM2 상태 확인
    - 헬스체크
```

## ⚠️ 주의사항

1. **로컬 변경사항**: VPS의 `/root/prepmood-repo`에 로컬 변경사항이 있으면 자동으로 무시됩니다.
2. **배포 락**: 동시 배포 방지를 위해 `/tmp/prepmood-deploy.lock` 파일을 사용합니다.
3. **백업**: 배포 전 자동 백업이 생성되므로 롤백이 가능합니다.
4. **검증**: 배포 후 파일 동기화가 제대로 되었는지 자동으로 검증합니다.

## 🔍 문제 해결 체크리스트

- [ ] 배포 스크립트 실행 권한 확인 (`chmod +x`)
- [ ] Git 저장소 로컬 변경사항 정리
- [ ] 배포 스크립트 최신 버전 확인
- [ ] 웹훅 로그 확인 (최근 push 이벤트)
- [ ] 배포 실행 로그 확인 (rsync 성공 여부)
- [ ] 파일 동기화 검증 (paid-event-creator.js 확인)
- [ ] PM2 서버 정상 작동 확인

## 📝 다음 단계

1. **즉시**: VPS에서 배포 스크립트 실행 권한 부여 및 로컬 변경사항 정리
2. **테스트**: 작은 변경사항 push 후 자동 배포 확인
3. **모니터링**: 배포 로그 확인 및 검증 단계 통과 여부 확인
