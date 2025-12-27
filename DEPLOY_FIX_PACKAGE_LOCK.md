# package-lock.json 동기화 실행 가이드

## 정확한 실행 순서 (VPS)

### 1. 레포 업데이트 + 스크립트 최신화
```bash
cd /root/prepmood-repo
git pull origin main

cp /root/prepmood-repo/deploy.sh /root/deploy.sh
cp /root/prepmood-repo/deploy-check.sh /root/deploy-check.sh
chmod +x /root/deploy.sh /root/deploy-check.sh
```

### 2. lockfile 근본 해결 (레포에서 생성)
```bash
cd /root/prepmood-repo/backend
npm install
```

**만약 실패하면 (특히 better-sqlite3 관련):**
```bash
sudo apt-get update
sudo apt-get install -y build-essential python3 make g++
cd /root/prepmood-repo/backend
npm install
```

### 3. lockfile 커밋/푸시
```bash
cd /root/prepmood-repo
git status
git add backend/package-lock.json backend/package.json
git commit -m "chore: sync backend package-lock.json"
git push origin main
```

### 4. 배포 (dry-run → 실제)
```bash
/root/deploy-check.sh
/root/deploy.sh
```

## 확인 사항

- ✅ `/root/prepmood-repo/backend`에서 `npm install` 성공
- ✅ `backend/package-lock.json` 생성 확인
- ✅ `deploy.sh`가 `npm ci`로 통과

## .env.backup 관련

- `deleting .env.backup`은 문제 없음 (임시 파일)
- 중요한 건 `deleting .env` 본체가 나오면 안 됨

