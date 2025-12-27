# package-lock.json 동기화 가이드

## 문제 상황

`npm ci`가 실패하는 경우:
- `package.json`과 `package-lock.json`이 동기화되지 않음
- 레포에 `package-lock.json`이 없거나 오래됨

## 해결 방법

### VPS에서 레포 디렉토리에서 lockfile 생성 및 커밋

```bash
# 1. 레포 디렉토리로 이동
cd /root/prepmood-repo

# 2. backend 폴더 확인
ls -la backend/package.json

# 3. backend에서 의존성 설치 (lockfile 생성/갱신)
cd backend
npm install

# 4. lockfile 생성 확인
ls -la package-lock.json

# 5. 레포 루트로 돌아가서 커밋
cd /root/prepmood-repo
git status
git add backend/package-lock.json backend/package.json
git commit -m "chore: add/sync backend package-lock.json"
git push origin main
```

### .gitignore 확인

만약 `git add`가 안 되면:

```bash
cd /root/prepmood-repo
git check-ignore -v backend/package-lock.json || echo "not ignored"
```

`ignored`로 나오면 `.gitignore`에서 해당 규칙을 제거해야 합니다.

### 배포 재시도

```bash
cd /root/prepmood-repo
git pull origin main

cp /root/prepmood-repo/deploy.sh /root/deploy.sh
chmod +x /root/deploy.sh

/root/deploy.sh
```

## 참고

- Windows에서 `better-sqlite3` 빌드 실패는 정상 (Visual Studio 필요)
- VPS(Linux)에서 `npm install` 실행하면 lockfile 생성 가능
- 레포에 lockfile을 커밋해야 다음 배포에서 `npm ci`가 정상 동작

