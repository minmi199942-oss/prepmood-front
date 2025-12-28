# QR 인증 기록 확인 및 관리 가이드

## 📊 현재 저장되는 인증 정보

SQLite DB (`prep.db`)의 `products` 테이블에 다음 정보가 저장됩니다:

- `token`: 제품 토큰 (20자 영숫자)
- `internal_code`: 내부 제품 코드
- `product_name`: 제품명
- `status`: 인증 상태
  - `0`: 미인증
  - `1`: 첫 인증 완료
  - `3`: 무효화됨
- `scan_count`: 총 스캔 횟수
- `first_verified_at`: 첫 인증 시간 (ISO 형식)
- `last_verified_at`: 마지막 인증 시간 (ISO 형식)

---

## 🔍 인증 기록 확인 방법

### 1. VPS에서 직접 SQL 쿼리 (가장 빠름)

```bash
cd /var/www/html/backend

# 전체 제품 인증 상태 확인
sqlite3 prep.db "SELECT token, internal_code, product_name, status, scan_count, first_verified_at, last_verified_at FROM products ORDER BY last_verified_at DESC;"

# 인증된 제품만 확인
sqlite3 prep.db "SELECT token, internal_code, product_name, scan_count, first_verified_at, last_verified_at FROM products WHERE status > 0 ORDER BY first_verified_at DESC;"

# 미인증 제품 확인
sqlite3 prep.db "SELECT token, internal_code, product_name FROM products WHERE status = 0;"

# 인증 통계
sqlite3 prep.db "SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as unverified,
  SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as verified,
  SUM(CASE WHEN status = 3 THEN 1 ELSE 0 END) as revoked,
  SUM(scan_count) as total_scans
FROM products;"

# 최근 인증된 제품 (최근 10개)
sqlite3 prep.db "SELECT internal_code, product_name, first_verified_at, scan_count FROM products WHERE status = 1 ORDER BY first_verified_at DESC LIMIT 10;"

# 재인증이 많은 제품 (의심스러운 패턴)
sqlite3 prep.db "SELECT token, internal_code, product_name, scan_count, first_verified_at, last_verified_at FROM products WHERE scan_count > 1 ORDER BY scan_count DESC;"
```

### 2. Node.js 스크립트 사용 (로컬 또는 VPS)

```bash
# 로컬에서
cd backend
node check-auth-data.js

# 또는 VPS에서
cd /var/www/html/backend
node check-auth-data.js
```

이 스크립트는 다음 정보를 보여줍니다:
- 총 제품 수
- 인증 통계 (미인증/인증됨)
- 총 스캔 횟수
- 샘플 데이터

### 3. 관리자 API (현재 구현됨)

**QR 코드 파일 목록:**
```bash
# 관리자 로그인 후
curl -H "Cookie: accessToken=YOUR_TOKEN" \
  https://prepmood.kr/api/admin/qrcodes/list
```

**토큰 무효화:**
```bash
curl -X POST https://prepmood.kr/api/admin/auth/revoke \
  -H "Cookie: accessToken=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token": "aB3cD5eF7gH9iJ1kL3mN5"}'
```

---

## ⚠️ 현재 없는 기능 (추가 가능)

### 인증 기록 조회 API (관리자용)

현재는 **인증 기록을 조회하는 관리자 API가 없습니다**. 

**추가하면 좋을 기능:**
- `/api/admin/auth/history` - 전체 인증 기록 조회
- `/api/admin/auth/stats` - 인증 통계
- `/api/admin/auth/product/:token` - 특정 제품의 인증 기록

---

## 🛠️ 관리 기능 (현재 구현됨)

### 1. 토큰 무효화 (Revoke)

**API:**
```
POST /api/admin/auth/revoke
Body: { "token": "aB3cD5eF7gH9iJ1kL3mN5" }
```

**효과:**
- 해당 토큰의 `status`를 `3`으로 변경
- 이후 인증 시도 시 가품으로 처리됨

**VPS에서 직접 실행:**
```bash
cd /var/www/html/backend
sqlite3 prep.db "UPDATE products SET status = 3 WHERE token = 'aB3cD5eF7gH9iJ1kL3mN5';"
```

### 2. QR 코드 다운로드

**API:**
```
GET /api/admin/qrcodes/download
```

**효과:**
- 모든 QR 코드 이미지를 ZIP으로 다운로드
- 관리자 인증 필요
- Rate limit: 15분당 10회

### 3. QR 코드 파일 목록

**API:**
```
GET /api/admin/qrcodes/list
```

**응답:**
```json
{
  "success": true,
  "files": [
    {
      "filename": "PM-001.png",
      "size": 12345,
      "sizeKB": "12.05",
      "created": "2025-12-28T05:00:00.000Z"
    }
  ],
  "count": 42
}
```

---

## 📋 자주 사용하는 쿼리 모음

### 인증 통계 확인
```sql
SELECT 
  COUNT(*) as total_products,
  SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as unverified,
  SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as verified,
  SUM(CASE WHEN status = 3 THEN 1 ELSE 0 END) as revoked,
  SUM(scan_count) as total_scans,
  AVG(scan_count) as avg_scans_per_product
FROM products;
```

### 최근 인증된 제품 (오늘)
```sql
SELECT 
  internal_code,
  product_name,
  first_verified_at,
  scan_count
FROM products
WHERE status = 1 
  AND DATE(first_verified_at) = DATE('now')
ORDER BY first_verified_at DESC;
```

### 재인증이 많은 제품 (의심 패턴)
```sql
SELECT 
  token,
  internal_code,
  product_name,
  scan_count,
  first_verified_at,
  last_verified_at,
  (julianday(last_verified_at) - julianday(first_verified_at)) as days_between
FROM products
WHERE scan_count > 1
ORDER BY scan_count DESC;
```

### 특정 기간 인증 통계
```sql
SELECT 
  DATE(first_verified_at) as date,
  COUNT(*) as verified_count
FROM products
WHERE status = 1 
  AND first_verified_at >= DATE('now', '-7 days')
GROUP BY DATE(first_verified_at)
ORDER BY date DESC;
```

---

## 🎯 요약

### 현재 가능한 것:
- ✅ VPS에서 SQL 쿼리로 인증 기록 확인
- ✅ `check-auth-data.js` 스크립트로 통계 확인
- ✅ 토큰 무효화 (관리자 API)
- ✅ QR 코드 다운로드 (관리자 API)

### 현재 없는 것 (추가 가능):
- ⚠️ 관리자 웹 페이지에서 인증 기록 조회
- ⚠️ 관리자 API로 인증 기록 조회 (`/api/admin/auth/history`)
- ⚠️ 인증 통계 대시보드

### 권장 사항:
1. **일반적인 확인**: VPS에서 SQL 쿼리 사용 (가장 빠름)
2. **통계 확인**: `check-auth-data.js` 스크립트 사용
3. **토큰 무효화**: 관리자 API 사용 (`/api/admin/auth/revoke`)

---

## 💡 추가 기능이 필요하면

인증 기록 조회 API를 추가하려면:
1. `backend/qrcode-download-routes.js`에 새 엔드포인트 추가
2. 또는 `backend/index.js`에 관리자 API 추가
3. 프론트엔드 관리자 페이지에 표시 기능 추가

원하시면 이 기능을 추가해드릴 수 있습니다!

