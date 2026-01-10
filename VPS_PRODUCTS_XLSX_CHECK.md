# VPS에서 products.xlsx 파일 확인 및 복사 가이드

## 현재 상태
- ✅ 로컬 파일과 Git 파일이 동일 (최신 버전)
- ✅ 자동 배포 시스템으로 VPS에 전달됨
- ⏳ 자동 배포 완료 대기 중

## VPS에서 확인 및 복사 방법

### Step 1: 자동 배포 완료 확인

자동 배포가 완료되면 (약 1-2분), VPS의 `/root/prepmood-repo` 디렉토리에 최신 파일이 있을 것입니다.

```bash
# VPS에서 실행
cd /root/prepmood-repo
ls -la products.xlsx
```

### Step 2: 파일 내용 확인 (선택사항)

```bash
# VPS에서 실행 (Node.js 필요)
cd /root/prepmood-repo
node -e "
const XLSX = require('xlsx');
const wb = XLSX.readFile('products.xlsx');
const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
console.log('파일 행 수:', data.length);
console.log('컬럼:', Object.keys(data[0] || {}).join(', '));
"
```

예상 결과:
- 파일 행 수: 42행 (헤더 제외)
- 컬럼: `serial_number`, `rot_code`, `warranty_bottom_code`, `product_name`, `digital_warranty_code`, `digital_warranty_collection`

### Step 3: 파일 복사

```bash
# VPS에서 실행
cp /root/prepmood-repo/products.xlsx /var/www/html/products.xlsx

# 권한 설정
chown www-data:www-data /var/www/html/products.xlsx
chmod 644 /var/www/html/products.xlsx
```

### Step 4: 파일 확인

```bash
# VPS에서 실행
ls -la /var/www/html/products.xlsx

# 파일 크기 확인 (예상: 약 11KB)
```

### Step 5: 초기화 스크립트 실행

```bash
# VPS에서 실행
cd /var/www/html/backend

# 완전 초기화 실행 (warranties가 비어있으므로 안전)
node init-token-master-from-xlsx.js
```

예상 결과:
- ✅ 기존 token_master 데이터 삭제
- ✅ 42개 토큰 재생성 (xlsx 파일의 행 수)
- ✅ serial_number, rot_code, warranty_bottom_code 포함

---

## 자동 배포 확인

자동 배포가 완료되었는지 확인:

```bash
# VPS에서 실행
tail -f /var/www/html/backend/deploy-run.log
# 또는
pm2 logs prepmood-backend
```

또는 GitHub에서 webhook delivery를 확인할 수도 있습니다.

---

## 문제 발생 시

### 문제 1: 파일이 없음

```bash
# VPS에서 실행
cd /root/prepmood-repo
git pull origin main
ls -la products.xlsx
```

### 문제 2: 파일이 옛날 버전

```bash
# VPS에서 실행
cd /root/prepmood-repo
git pull origin main
git log --oneline -5 -- products.xlsx
```

### 문제 3: 자동 배포가 안 됨

```bash
# VPS에서 수동 배포
cd /root/prepmood-repo
git pull origin main
cp products.xlsx /var/www/html/products.xlsx
chown www-data:www-data /var/www/html/products.xlsx
chmod 644 /var/www/html/products.xlsx
```
