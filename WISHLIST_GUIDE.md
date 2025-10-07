# 위시리스트 기능 구현 가이드

## 📋 개요
Pre.p Mood 웹사이트에 완전한 위시리스트 기능이 구현되었습니다. 사용자는 마음에 드는 상품을 위시리스트에 추가하고, 관리할 수 있습니다.

---

## 🚀 구현된 기능

### 1. **상품 상세 페이지 (buy.html)**
- ❤️ 하트 아이콘 클릭 시 위시리스트 추가/제거
- 🔐 로그인 여부 자동 체크
- 🚫 비로그인 시 로그인 페이지로 이동 안내

### 2. **위시리스트 페이지 (wishlist.html)**
- 📦 저장된 상품 목록 표시 (썸네일, 이름, 가격)
- 🗓️ 추가 날짜 표시
- 🗑️ 상품 제거 기능
- 🔗 상품 클릭 시 상세 페이지로 이동
- 📱 반응형 디자인 (PC/태블릿/모바일)

### 3. **Backend API 엔드포인트**
- `POST /api/wishlist/toggle` - 위시리스트 추가/제거
- `GET /api/wishlist/check` - 위시리스트 상태 확인
- `GET /api/wishlist` - 위시리스트 전체 조회

---

## 🛠️ 설치 및 설정

### 1. **데이터베이스 테이블 생성**

MySQL 데이터베이스에 위시리스트 테이블을 생성해야 합니다:

```bash
# MySQL에 로그인
mysql -u root -p

# SQL 스크립트 실행
source backend/setup_wishlists_table.sql
```

또는 MySQL Workbench에서 `backend/setup_wishlists_table.sql` 파일을 열어서 실행하세요.

**테이블 구조:**
```sql
CREATE TABLE wishlists (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_email VARCHAR(255) NOT NULL,
    product_id VARCHAR(100) NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_wishlist (user_email, product_id)
);
```

### 2. **백엔드 서버 실행**

```bash
cd backend
npm install
node index.js
```

서버가 `http://localhost:3000`에서 실행됩니다.

### 3. **프론트엔드 서버 실행**

```bash
# 프로젝트 루트 디렉토리에서
python -m http.server 8000
```

브라우저에서 `http://localhost:8000`으로 접속하세요.

---

## 💻 사용 방법

### **1. 위시리스트에 상품 추가**

1. 카탈로그 페이지에서 원하는 상품을 클릭
2. 상품 상세 페이지에서 우측 상단의 ❤️ 하트 아이콘 클릭
3. 로그인되어 있으면 즉시 추가됨
4. 비로그인 상태면 로그인 페이지로 이동 안내

### **2. 위시리스트 보기**

1. 헤더 우측의 위시리스트 아이콘 클릭
2. 또는 `wishlist.html` 페이지로 직접 이동
3. 저장된 상품 목록 확인

### **3. 위시리스트에서 제거**

1. 위시리스트 페이지에서 상품 카드의 ❌ 버튼 클릭
2. 확인 메시지에서 "확인" 클릭
3. 또는 상품 상세 페이지에서 ❤️ 하트 아이콘 다시 클릭

---

## 🔧 기술 구현 세부사항

### **프론트엔드**

#### **buy-script.js**
```javascript
// 로그인 체크
function isLoggedIn() {
  return sessionStorage.getItem('userLoggedIn') === 'true';
}

// API 호출
async function toggleWishlist() {
  const userEmail = sessionStorage.getItem('userEmail');
  const response = await fetch('http://localhost:3000/api/wishlist/toggle', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Email': userEmail
    },
    body: JSON.stringify({ productId: currentProduct.id })
  });
}
```

#### **wishlist-script.js**
- 위시리스트 목록 로드
- 상품 정보 표시
- 제거 기능 구현

### **백엔드**

#### **API 엔드포인트**

**POST /api/wishlist/toggle**
```javascript
// 요청
{
  "productId": "m-bp-001"
}

// 응답
{
  "success": true,
  "action": "added", // 또는 "removed"
  "message": "위시리스트에 추가되었습니다."
}
```

**GET /api/wishlist/check?productId=xxx**
```javascript
// 응답
{
  "success": true,
  "isInWishlist": true
}
```

**GET /api/wishlist**
```javascript
// 응답
{
  "success": true,
  "wishlists": [
    {
      "product_id": "m-bp-001",
      "added_at": "2025-01-15T12:34:56.000Z"
    }
  ],
  "count": 1
}
```

---

## 🎨 스타일 및 반응형

### **데스크톱 (1200px+)**
- 3-4열 그리드 레이아웃
- 카드 크기: 280px 최소 너비

### **태블릿 (768px - 1199px)**
- 2-3열 그리드 레이아웃
- 카드 크기: 250px 최소 너비

### **모바일 (767px 이하)**
- 2열 그리드 레이아웃
- 카드 크기: 200px 최소 너비

### **작은 모바일 (480px 이하)**
- 2열 고정 그리드
- 간격 축소

---

## 🔐 보안 고려사항

1. **사용자 인증**
   - 현재는 `sessionStorage`와 헤더의 `X-User-Email` 사용
   - 프로덕션에서는 JWT 토큰 또는 세션 쿠키 사용 권장

2. **데이터베이스**
   - UNIQUE 제약 조건으로 중복 방지
   - FOREIGN KEY로 사용자와 연결
   - CASCADE DELETE로 사용자 삭제 시 위시리스트도 자동 삭제

3. **API 보안**
   - Rate Limiting 적용 (express-rate-limit)
   - 입력값 검증 (express-validator)
   - SQL Injection 방지 (Prepared Statements)

---

## 📂 파일 구조

```
project-root/
├── wishlist.html                      # 위시리스트 페이지
├── wishlist-script.js                 # 위시리스트 페이지 스크립트
├── buy-script.js                      # 상품 상세 페이지 스크립트 (수정됨)
├── header.partial                     # 헤더 (위시리스트 링크 추가됨)
├── assets/
│   └── css/
│       ├── page.css                   # 위시리스트 스타일 추가됨
│       └── responsive.css             # 위시리스트 반응형 스타일 추가됨
└── backend/
    ├── index.js                       # 위시리스트 API 엔드포인트 추가됨
    └── setup_wishlists_table.sql      # 데이터베이스 테이블 생성 스크립트
```

---

## 🐛 트러블슈팅

### **문제: 위시리스트가 추가되지 않음**
**해결:**
1. 백엔드 서버가 실행 중인지 확인
2. MySQL 데이터베이스 연결 확인
3. `wishlists` 테이블이 생성되었는지 확인
4. 브라우저 콘솔에서 에러 메시지 확인

### **문제: 로그인 상태가 유지되지 않음**
**해결:**
1. `sessionStorage`에 `userLoggedIn`과 `userEmail`이 설정되어 있는지 확인
2. 로그인 페이지에서 로그인 성공 시 세션 스토리지 설정 확인

### **문제: CORS 에러**
**해결:**
1. `backend/index.js`의 CORS 설정 확인
2. `allowedOrigins`에 프론트엔드 URL 추가
3. `credentials: 'include'` 설정 확인

---

## 🚀 향후 개선 사항

1. **세션 관리 개선**
   - JWT 토큰 기반 인증 구현
   - Refresh Token 추가

2. **소셜 공유**
   - 위시리스트 공유 기능
   - 친구에게 공유

3. **알림 기능**
   - 가격 변동 알림
   - 재입고 알림

4. **정렬 및 필터**
   - 가격순 정렬
   - 카테고리별 필터
   - 추가일 기준 정렬

5. **모바일 앱**
   - React Native 또는 Flutter로 네이티브 앱 개발

---

## 📞 문의

문제가 발생하거나 질문이 있으시면 언제든지 문의해주세요!

**이메일:** prepmoodcare@naver.com  
**고객센터:** 1555-6035

---

**© Pre.p Mood 2025. All rights reserved.**

