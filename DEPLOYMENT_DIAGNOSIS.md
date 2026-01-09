# 배포 시스템 진단 체크리스트

## 문제 상황
- 배포가 PM2 재시작 단계에서 실패 (exit code 130)
- 파일은 동기화되었지만 최신 버전이 반영되지 않음
- `036_add_token_master_product_id.sql`에 여전히 IF 문이 포함됨

## 진단 체크리스트

### 1. 레포지토리 상태 확인
```bash
cd /root/prepmood-repo
git status
git log --oneline -5
git remote -v
```

### 2. 최신 커밋 확인
```bash
# 로컬 최신 커밋
cd /root/prepmood-repo
git log --oneline -1

# 원격 최신 커밋
git fetch origin main
git log origin/main --oneline -1

# 비교
git log HEAD..origin/main --oneline
```

### 3. 파일 동기화 확인
```bash
# 레포지토리의 파일 확인
head -n 50 /root/prepmood-repo/backend/migrations/036_add_token_master_product_id.sql | grep -A 5 "IF @column_exists"

# 배포된 파일 확인
head -n 50 /var/www/html/backend/migrations/036_add_token_master_product_id.sql | grep -A 5 "IF @column_exists"

# 두 파일이 동일한지 확인
diff /root/prepmood-repo/backend/migrations/036_add_token_master_product_id.sql /var/www/html/backend/migrations/036_add_token_master_product_id.sql
```

### 4. 배포 로그 확인
```bash
# 최근 배포 로그
tail -n 100 /var/www/html/backend/deploy-run.log | grep -A 10 "Git pull"

# 웹훅 로그
tail -n 50 /var/www/html/backend/deploy-webhook.log
```

### 5. PM2 재시작 실패 원인 확인
```bash
# PM2 상태
pm2 status prepmood-backend

# PM2 로그
pm2 logs prepmood-backend --lines 50

# PM2 재시작 테스트
pm2 restart prepmood-backend
```

## 가능한 원인

### 원인 1: Git pull이 최신 커밋을 가져오지 못함
- 레포지토리가 오래된 상태
- 원격 저장소와 동기화되지 않음

### 원인 2: 배포가 중간에 실패하여 파일 동기화가 완료되지 않음
- PM2 재시작 실패로 배포가 중단됨
- 하지만 rsync는 이미 실행되었을 수 있음

### 원인 3: 배포 스크립트 실행 순서 문제
- git pull → rsync → npm ci → pm2 restart
- PM2 재시작 실패로 배포가 중단되었지만, 파일은 이미 동기화됨

## 해결 방법

### 즉시 해결 (수동)
```bash
# 1. 레포지토리 최신화
cd /root/prepmood-repo
git fetch origin main
git pull origin main

# 2. 파일 확인
ls -la backend/migrations/036*

# 3. 수동 동기화
rsync -av --exclude=".env" --exclude="node_modules/" backend/migrations/ /var/www/html/backend/migrations/

# 4. 파일 확인
head -n 50 /var/www/html/backend/migrations/036_add_token_master_product_id.sql | grep -A 5 "IF"
```

### 근본 해결 (PM2 재시작 문제)
```bash
# PM2 재시작 문제 해결
pm2 delete prepmood-backend
pm2 start /var/www/html/backend/index.js --name prepmood-backend
pm2 save

# 또는
pm2 restart prepmood-backend --update-env
```

## 배포 스크립트 개선 제안

1. **Git pull 검증 추가**: git pull 후 최신 커밋 확인
2. **파일 동기화 검증**: rsync 후 파일 버전 확인
3. **PM2 재시작 실패 시 롤백**: 배포 실패 시 이전 버전으로 복원
4. **배포 단계별 검증**: 각 단계마다 검증 로그 추가
