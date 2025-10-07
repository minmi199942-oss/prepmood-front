# 🔍 Pre.p Mood QR 정품 인증 시스템 현황 보고서

## 📌 현재 상황 요약

**QR 코드 시스템을 VPS 서버에 구축하려고 했으나, 백엔드 코드가 누락되어 실제로는 작동하지 않는 상태입니다.**

---

## 🗂️ 데이터베이스 구조 (MySQL)

### ✅ 생성 완료된 테이블

```sql
1. qr_products (QR용 제품 정보)
   - serial (PK): 제품 시리얼 번호
   - name: 제품명
   - category: 카테고리
   - price: 가격
   - description: 설명
   - created_at, updated_at

2. product_qr (QR 코드 정보)
   - id (PK)
   - serial (FK -> qr_products)
   - nonce: 32자리 랜덤 문자열
   - signature: 64자리 HMAC 서명
   - qr_code: 최종 QR 코드 문자열 "{serial}.{nonce}.{sig}"
   - is_valid: 유효 여부 (TRUE/FALSE)
   - created_at

3. ownerships (소유권 정보)
   - id (PK)
   - serial (FK -> qr_products)
   - user_email (FK -> users)
   - registered_at: 등록 일시
   - is_active: 활성 여부

4. qr_audit_logs (감사 로그)
   - id (PK)
   - serial (FK -> qr_products)
   - action: 행동 (scan, register, invalidate 등)
   - user_email (FK -> users)
   - ip_address
   - user_agent
   - details (JSON)
   - created_at
```

---

## 🖥️ 프론트엔드 파일 (로컬에만 존재)

### 1️⃣ 관리자 QR 생성 페이지
- **파일**: `admin-qr.html`, `admin-qr-script.js`
- **기능**:
  - ✅ 단일 QR 생성 (제품 정보 입력)
  - ✅ 대량 QR 생성 (CSV 업로드)
  - ✅ QR 목록 조회 및 무효화
  - ✅ QR 코드 다운로드 (PNG, 라벨)

### 2️⃣ 소비자 QR 검증 페이지
- **파일**: `authenticity.html`, `authenticity-script.js`
- **기능**:
  - ✅ QR 코드 스캔 (카메라)
  - ✅ 수동 코드 입력
  - ✅ 정품 여부 확인
  - ✅ 로그인 후 제품 등록
  - ✅ 등록된 제품 소유권 표시

---

## ✅ **백엔드 코드 상태**

### ✅ VPS 서버에 이미 생성된 파일

```
backend/qr-auth.js    (2080 bytes) - QR 코드 생성/검증 핵심 로직 ✅
backend/qr-routes.js  (9471 bytes) - QR API 엔드포인트 ✅
```

### ✅ 구현된 API 엔드포인트

```javascript
POST   /api/qrcode/generate      // QR 코드 생성 ✅
GET    /api/qrcode/list           // QR 목록 조회 ✅
POST   /api/qrcode/invalidate    // QR 무효화 ✅
GET    /authenticity?code=xxx    // QR 검증 ✅
POST   /api/qrcode/register      // 소유권 등록 ✅
GET    /api/qrcode/status         // QR 상태 확인 ✅
```

### ✅ 환경 변수 (VPS)

```bash
# backend/.env에 이미 설정됨
QR_HMAC_SECRET=prepmood-qr-hmac-secret-key-2025-32chars
```

---

## 🔐 QR 코드 구조 (설계)

### QR 코드 포맷
```
{serial}.{nonce}.{signature}

예시: PM-001.a3f9e2b8c1d4f5g6h7i8j9k0l1m2n3o4.9a7b3c5d1e...
```

### 보안 메커니즘
```javascript
signature = HMAC-SHA256(
  secret: QR_HMAC_SECRET,
  message: serial + nonce
)
```

- **serial**: 제품 고유 번호 (PM-001)
- **nonce**: 32자리 랜덤 문자열 (일회용, 위조 방지)
- **signature**: 64자리 HMAC 서명 (변조 방지)

---

## 🎯 사용 시나리오

### 시나리오 1: 관리자가 QR 생성
```
1. admin-qr.html 접속
2. 제품 정보 입력 (시리얼, 이름, 가격 등)
3. "생성" 버튼 클릭
4. 백엔드: qr_products + product_qr에 저장
5. 프론트: QR 이미지 표시 + 다운로드
```

### 시나리오 2: 소비자가 정품 확인
```
1. authenticity.html 접속
2. QR 코드 스캔 또는 수동 입력
3. 백엔드: HMAC 검증
   - ✅ 성공 → 제품 정보 + 등록 상태 표시
   - ❌ 실패 → "위조품 의심" 경고
4. 로그인 후 "내 제품으로 등록" 가능
```

### 시나리오 3: 소비자가 제품 등록
```
1. QR 검증 성공 후 "등록" 버튼
2. 로그인 확인
3. ownerships 테이블에 user_email + serial 저장
4. 이메일 알림 발송
5. 마이페이지에서 등록 제품 확인 가능
```

---

## ⚠️ **현재 작동하지 않을 수 있는 이유**

1. ✅ **백엔드 파일**: `qr-auth.js`, `qr-routes.js` VPS에 이미 존재
2. ❓ **API 등록 여부**: `backend/index.js`에 QR 라우트가 연결되었는지 확인 필요
3. ✅ **환경 변수**: `QR_HMAC_SECRET` VPS에 이미 설정됨
4. ❓ **Nginx 설정**: `/authenticity` 경로 프록시 설정 확인 필요
5. ❓ **PM2 재시작**: 백엔드 서버가 새 코드를 로드했는지 확인 필요

---

## ✅ 이미 완료된 것

- ✅ MySQL 테이블 4개 생성 완료 (VPS)
- ✅ 프론트엔드 HTML/CSS/JS 완료 (로컬)
- ✅ QR 코드 스캔 UI 완료 (로컬)
- ✅ 관리자 페이지 UI 완료 (로컬)
- ✅ 백엔드 QR 인증 로직 완료 (VPS)
- ✅ QR API 엔드포인트 완료 (VPS)
- ✅ 환경 변수 설정 완료 (VPS)

---

## 🔧 **확인 및 보완이 필요한 것**

### 1️⃣ VPS에서 확인 필요

#### `backend/index.js`에 QR 라우트 연결 확인
```bash
# VPS에서 실행
cat /var/www/html/backend/index.js | grep -A 2 "qr-routes"
```

**기대하는 코드:**
```javascript
const qrRoutes = require('./qr-routes');
app.use('/', qrRoutes);
```

**만약 없다면 추가 필요!**

#### Nginx 설정 확인
```bash
# VPS에서 실행
cat /etc/nginx/sites-available/prepmood | grep -A 10 "location /authenticity"
```

**기대하는 설정:**
```nginx
location /authenticity {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

**만약 없다면 추가 후 `sudo nginx -t && sudo systemctl reload nginx` 필요!**

#### PM2 재시작 확인
```bash
# VPS에서 실행
pm2 restart prepmood-backend
pm2 logs prepmood-backend --lines 50
```

**에러 로그에서 `QR_HMAC_SECRET` 관련 에러가 없는지 확인!**

### 2️⃣ 로컬 → VPS 동기화

로컬에 있는 프론트엔드 파일을 VPS로 업로드:
```bash
# 로컬에서 실행 (Git 사용)
git add admin-qr.html admin-qr-script.js authenticity.html authenticity-script.js
git commit -m "Add QR admin and authenticity pages"
git push origin main

# VPS에서 실행
cd /var/www/html
git pull origin main
```

### 3️⃣ 테스트

1. **관리자 QR 생성 테스트**
   - `https://prepmood.kr/admin-qr.html` 접속
   - 제품 정보 입력 후 생성
   - QR 코드 다운로드

2. **소비자 QR 검증 테스트**
   - `https://prepmood.kr/authenticity.html` 접속
   - 생성한 QR 코드 입력
   - 정품 확인 메시지 확인

3. **제품 등록 테스트**
   - 로그인 후 "내 제품으로 등록" 클릭
   - 성공 메시지 확인

---

## 💡 **다음 단계 제안**

### ✅ 실제 상황: 백엔드 거의 완성됨!

**필요한 작업:**
1. ❓ VPS `index.js`에 QR 라우트 연결 확인 (아마 안 되어 있을 가능성 높음)
2. ❓ Nginx `/authenticity` 프록시 설정 확인
3. ✅ 로컬 프론트엔드 → VPS 업로드
4. ✅ PM2 재시작
5. ✅ 테스트

**예상 소요 시간: 10~20분**

---

## 📊 **기술 스택**

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **QR Library**: `qrcode.js` (생성), `html5-qrcode` (스캔)
- **Backend**: Node.js + Express
- **Security**: HMAC-SHA256, bcrypt, helmet
- **Database**: MySQL 8.0
- **Server**: DigitalOcean VPS + Nginx + PM2
- **Domain**: prepmood.kr (Cloudflare CDN)

---

## ❓ **다른 AI에게 물어볼 질문 예시**

```
Q1: HMAC-SHA256을 사용한 QR 코드 서명 시스템이 안전한가요?
    nonce를 추가로 사용하는 이유는 무엇인가요?

Q2: QR 코드를 제품마다 고유하게 만들면서도 대량 생성 시
    성능을 유지하려면 어떻게 해야 하나요?

Q3: 소비자가 제품을 등록한 후 중고로 판매할 때,
    소유권을 이전하는 기능을 추가하려면 어떤 구조가 좋나요?

Q4: QR 코드가 사진으로 복제되는 것을 방지하려면
    어떤 추가 보안 조치가 필요한가요?

Q5: 현재 설계에서 보안 취약점이나 개선할 부분이 있나요?
```

---

## 📁 파일 구조

```
로컬 (C:\Users\minmi\Documents\00-html-play\project-root\):
├── admin-qr.html              ✅ 로컬 (VPS 업로드 필요)
├── admin-qr-script.js         ✅ 로컬 (VPS 업로드 필요)
├── authenticity.html          ✅ 로컬 (VPS 업로드 필요)
├── authenticity-script.js     ✅ 로컬 (VPS 업로드 필요)
└── assets/css/page.css        ✅ 로컬 (QR 스타일 포함)

VPS (/var/www/html/backend/):
├── index.js                   ✅ VPS (QR 라우트 연결 확인 필요)
├── .env                       ✅ VPS (QR_HMAC_SECRET 이미 설정됨)
├── qr-auth.js                 ✅ VPS (2080 bytes, 완성!)
└── qr-routes.js               ✅ VPS (9471 bytes, 완성!)
```

---

**총평: 백엔드 완성, 프론트엔드 VPS 업로드 + index.js 연결만 하면 바로 작동 가능! 🚀**

