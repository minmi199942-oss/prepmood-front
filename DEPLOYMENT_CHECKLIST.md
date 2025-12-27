# 배포 체크리스트

## 배포 전 확인 (필수)

### 1. PM2 실행 경로 확인
```bash
pm2 describe prepmood-backend | grep -E "script|cwd|exec"
```
**확인 사항**: `cwd`가 `/var/www/html/backend`이고, `script`가 해당 경로의 파일을 가리키는지 확인

### 2. 운영 폴더 실제 존재 여부 확인
```bash
cd /var/www/html/backend
ls -la .env 2>/dev/null || echo "NO .env"
ls -la uploads 2>/dev/null || echo "NO uploads/"
ls -la prep.db 2>/dev/null || echo "NO prep.db"
ls -la *.log 2>/dev/null || echo "NO *.log"
ls -la node_modules 2>/dev/null || echo "NO node_modules/"
ls -la .well-known 2>/dev/null || echo "NO .well-known/"
```

### 3. Dry-run 실행
```bash
/root/deploy-check.sh
```

**판단 기준**:
- `deleting .env` 보이면 ❌ → exclude 고장
- `deleting uploads/...` 보이면 ❌ → exclude에 uploads/ 추가 필요
- `deleting prep.db` 보이면 → 운영 DB면 ❌, 테스트면 ✅
- `deleting node_modules/...` 보이면 → 보통 exclude 권장
- 위 항목이 없으면 ✅ → 배포 진행 가능

## 배포 실행

### 1. 배포 스크립트 설치
```bash
cd /root/prepmood-repo
git pull origin main
cp /root/prepmood-repo/deploy.sh /root/deploy.sh
cp /root/prepmood-repo/deploy-check.sh /root/deploy-check.sh
chmod +x /root/deploy.sh /root/deploy-check.sh
```

### 2. 배포 전 확인
```bash
/root/deploy-check.sh
```

### 3. 배포 실행
```bash
/root/deploy.sh
```

## 배포 후 확인

### 1. 서버 상태 확인
```bash
pm2 status prepmood-backend
pm2 logs prepmood-backend --lines 30
```

### 2. 헬스 체크
```bash
curl -s https://prepmood.kr/auth/health
```

### 3. 웹훅 엔드포인트 확인
```bash
curl -sI https://prepmood.kr/api/payments/webhook | head -n 5
```
**예상 결과**: `200`, `405`, `400` 등 (404가 아니면 OK)

## 롤백 (문제 발생 시)

```bash
# 백업 목록 확인
ls -lh /var/www/html/backups/

# 롤백 실행 (TIMESTAMP는 실제 백업 파일명 사용)
tar -C /var/www/html -xzf /var/www/html/backups/backend_backup_YYYY-MM-DD_HHMMSS.tgz
pm2 restart prepmood-backend
```

