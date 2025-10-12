# 🛒 상품 관리 시스템 설치 가이드

**작성일**: 2025년 10월 12일

---

## 📋 **설치 단계**

### **Step 1: VPS에 접속**

```bash
ssh root@prepmood.kr
cd /var/www/html
```

---

### **Step 2: 최신 코드 가져오기**

```bash
git pull origin main
```

---

### **Step 3: multer 패키지 설치**

```bash
cd backend
npm install multer
```

---

### **Step 4: 데이터베이스 테이블 생성**

```bash
mysql -u prepmood_user -p prepmood < backend/setup_products_table.sql
```

**비밀번호 입력 후 확인**:
```sql
mysql -u prepmood_user -p
use prepmood;
SHOW TABLES;
DESC products;
```

---

### **Step 5: 환경 변수 추가**

`.env` 파일에 관리자 키 추가:

```bash
nano backend/.env
```

파일 끝에 다음 줄 추가:
```
ADMIN_KEY=your-secret-admin-key-here-change-this
```

**⚠️ 주의**: `your-secret-admin-key-here-change-this`를 **강력한 비밀번호**로 변경하세요!

예시:
```
ADMIN_KEY=PrepmoodAdmin2025!SecureKey#XYZ
```

저장: `Ctrl + O` → `Enter` → `Ctrl + X`

---

### **Step 6: 백엔드 재시작**

```bash
cd /var/www/html
pm2 restart prepmood-backend
pm2 logs prepmood-backend --lines 20
```

**확인 사항**:
- ❌ 오류 메시지가 없는지
- ✅ `🚀 서버가 포트 3000에서 실행 중입니다.` 메시지 확인

---

## 🎨 **사용 방법**

### **1. 관리자 페이지 접속**

```
https://prepmood.kr/admin/products.html
```

### **2. 관리자 키 입력**

최초 접속 시 프롬프트가 나타나면:
- `.env` 파일에 설정한 `ADMIN_KEY` 입력
- **브라우저에 저장됨** (LocalStorage)

### **3. 상품 관리**

#### **새 상품 추가**:
1. [+ 새 상품 추가] 버튼 클릭
2. 폼 작성:
   - **상품 ID**: `m-sh-010` (형식: {gender}-{category}-{number})
   - **상품명**: 실제 상품명
   - **가격**: 숫자만 입력 (예: 129000)
   - **이미지**: 이미지 파일 선택 (JPEG, PNG, GIF, WebP, 최대 5MB)
   - **성별**: 남성/여성
   - **카테고리**: 상의, 하의, 아우터, 가방, 액세서리
   - **타입**: 카테고리에 따라 자동 업데이트
   - **설명**: 선택 사항
3. [저장] 클릭

#### **기존 상품 수정**:
1. 상품 카드에서 [수정] 버튼 클릭
2. 정보 수정
3. [저장] 클릭

#### **상품 삭제**:
1. 상품 카드에서 [삭제] 버튼 클릭
2. 확인 메시지에서 [확인] 클릭

---

## 🔗 **API 엔드포인트**

### **공개 API (인증 불필요)**:
```
GET /api/products              - 전체 상품 목록
GET /api/products/:id          - 특정 상품 조회
```

### **관리자 API (X-Admin-Key 헤더 필요)**:
```
POST   /api/admin/products          - 상품 추가
PUT    /api/admin/products/:id      - 상품 수정
DELETE /api/admin/products/:id      - 상품 삭제
POST   /api/admin/upload-image      - 이미지 업로드
```

---

## 📁 **파일 구조**

```
project-root/
├── admin/
│   ├── products.html           # 관리자 페이지
│   └── admin-products.js       # 관리자 페이지 스크립트
├── assets/
│   └── css/
│       └── admin.css           # 관리자 페이지 스타일
├── backend/
│   ├── product-routes.js       # 상품 API 라우트
│   ├── setup_products_table.sql # DB 테이블 생성 스크립트
│   └── uploads/
│       └── products/           # 업로드된 이미지 저장 (자동 생성)
```

---

## 🔐 **보안**

### **관리자 키 관리**:
- ✅ `.env` 파일에 저장 (Git에 커밋되지 않음)
- ✅ 강력한 비밀번호 사용 권장
- ✅ 정기적으로 변경

### **이미지 업로드**:
- ✅ 파일 타입 검증 (JPEG, PNG, GIF, WebP만 허용)
- ✅ 파일 크기 제한 (5MB)
- ✅ 서버에 안전하게 저장

---

## 🐛 **문제 해결**

### **"관리자 권한이 필요합니다" 오류**:
1. `.env` 파일에 `ADMIN_KEY` 추가 확인
2. 백엔드 재시작: `pm2 restart prepmood-backend`
3. 브라우저에서 LocalStorage 삭제:
   - F12 → Application → Local Storage → `adminKey` 삭제
   - 페이지 새로고침

### **이미지 업로드 실패**:
1. 파일 형식 확인 (JPEG, PNG, GIF, WebP만 허용)
2. 파일 크기 확인 (5MB 이하)
3. `backend/uploads/products/` 폴더 권한 확인:
   ```bash
   sudo chmod -R 755 /var/www/html/backend/uploads
   ```

### **상품이 사이트에 표시되지 않음**:
- 아직 프론트엔드를 DB 연동으로 변경하지 않았습니다.
- 다음 단계에서 `catalog-data.js`를 DB에서 데이터를 가져오도록 수정할 예정입니다.

---

## ✅ **다음 단계**

1. ✅ 데이터베이스 테이블 생성
2. ✅ 백엔드 API 구현
3. ✅ 관리자 페이지 제작
4. ⏳ 프론트엔드를 DB 연동으로 변경
5. ⏳ 하드코딩 상품 데이터를 DB로 마이그레이션
6. ⏳ QR 시스템과 상품 DB 연동

---

**설치 완료 후 이 문서를 참고하여 상품을 관리하세요!** 🎉

