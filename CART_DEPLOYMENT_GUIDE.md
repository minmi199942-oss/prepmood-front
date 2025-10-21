# 장바구니 시스템 배포 가이드

## 🛒 장바구니 시스템 구현 완료!

다음 기능들이 모두 구현되었습니다:
- ✅ 장바구니 데이터베이스 테이블 (carts, cart_items)
- ✅ 장바구니 백엔드 API (추가/삭제/조회/수량변경)
- ✅ 장바구니 페이지 (cart.html, cart-script.js, cart.css)
- ✅ 상품 상세 페이지 장바구니 버튼 통합
- ✅ 헤더 장바구니 아이콘 및 개수 표시

---

## 📋 VPS 배포 단계

### 1️⃣ VPS에 SSH 접속

```bash
ssh root@prepmood.kr
```

---

### 2️⃣ 코드 업데이트

```bash
cd /var/www/html
git pull origin main
```

---

### 3️⃣ 백엔드 디렉토리로 이동

```bash
cd /var/www/html/backend
```

---

### 4️⃣ MySQL 접속 (데이터베이스 테이블 생성)

**먼저 `.env` 파일에서 MySQL 비밀번호 확인:**

```bash
cat /var/www/html/backend/.env | grep DB_PASSWORD
```

**MySQL 접속:**

```bash
mysql -u prepmood_user -p
# 비밀번호 입력 (.env에서 확인한 DB_PASSWORD)
```

---

### 5️⃣ 데이터베이스 선택 및 테이블 생성

**MySQL 내부에서 실행:**

```sql
USE prepmood;

-- 장바구니 테이블 생성
SOURCE /var/www/html/backend/setup_cart_tables.sql;

-- 테이블 확인
SHOW TABLES;
DESCRIBE carts;
DESCRIBE cart_items;

-- MySQL 종료
EXIT;
```

---

### 6️⃣ 백엔드 서버 재시작

```bash
pm2 restart prepmood-backend
```

---

### 7️⃣ 서버 로그 확인

```bash
pm2 logs prepmood-backend --lines 30
```

서버가 정상적으로 실행되는지 확인하세요.

---

### 8️⃣ Cloudflare 캐시 삭제

**Cloudflare 대시보드에서:**
1. 웹사이트 선택 (prepmood.kr)
2. **Caching** 메뉴
3. **Purge Everything** 클릭
4. 확인

---

## 🧪 테스트 방법

### 1. 상품 상세 페이지 테스트
1. https://prepmood.kr 접속
2. 상품 클릭
3. 사이즈 및 색상 선택
4. "장바구니" 버튼 클릭
5. 장바구니 추가 확인

### 2. 장바구니 페이지 테스트
1. https://prepmood.kr/cart.html 접속
2. 장바구니 아이템 확인
3. 수량 변경 테스트
4. 아이템 삭제 테스트
5. 장바구니 비우기 테스트

### 3. 헤더 배지 테스트
1. 헤더의 장바구니 아이콘 확인
2. 빨간 배지에 아이템 개수 표시 확인
3. 장바구니 추가 시 자동 업데이트 확인

---

## 🔧 API 엔드포인트

### 장바구니 조회
- **GET** `/api/cart`
- 헤더: `X-User-Email: {사용자 이메일}`

### 장바구니에 상품 추가
- **POST** `/api/cart/add`
- 헤더: `X-User-Email: {사용자 이메일}`
- Body: `{ productId, quantity, size, color }`

### 장바구니 아이템 수량 변경
- **PUT** `/api/cart/item/:itemId`
- 헤더: `X-User-Email: {사용자 이메일}`
- Body: `{ quantity }`

### 장바구니 아이템 삭제
- **DELETE** `/api/cart/item/:itemId`
- 헤더: `X-User-Email: {사용자 이메일}`

### 장바구니 전체 비우기
- **DELETE** `/api/cart/clear`
- 헤더: `X-User-Email: {사용자 이메일}`

### 장바구니 아이템 개수 조회
- **GET** `/api/cart/count`
- 헤더: `X-User-Email: {사용자 이메일}`

---

## ⚠️ 문제 해결

### 테이블 생성 오류
**증상:** `ERROR 1045: Access denied` 또는 `ERROR 1046: No database selected`

**해결:**
```sql
-- MySQL 재접속
mysql -u prepmood_user -p

-- 데이터베이스 선택
USE prepmood;

-- SQL 파일 실행
SOURCE /var/www/html/backend/setup_cart_tables.sql;
```

### 백엔드 오류
**증상:** `Cannot find module 'cart-routes'`

**해결:**
```bash
cd /var/www/html/backend
npm install
pm2 restart prepmood-backend
```

### 캐시 문제
**증상:** 변경사항이 반영되지 않음

**해결:**
1. Cloudflare 캐시 삭제
2. 브라우저 캐시 삭제 (Ctrl + Shift + Delete)
3. 시크릿 모드에서 테스트

---

## 📊 데이터베이스 구조

### `carts` 테이블
```sql
cart_id      INT (PK, AUTO_INCREMENT)
user_id      INT (FK -> users.user_id)
created_at   DATETIME
updated_at   DATETIME
```

### `cart_items` 테이블
```sql
item_id      INT (PK, AUTO_INCREMENT)
cart_id      INT (FK -> carts.cart_id)
product_id   VARCHAR(50) (FK -> admin_products.id)
quantity     INT
size         VARCHAR(10)
color        VARCHAR(50)
created_at   DATETIME
updated_at   DATETIME
```

---

## ✅ 배포 완료 체크리스트

- [ ] Git pull 완료
- [ ] MySQL 테이블 생성 완료
- [ ] PM2 재시작 완료
- [ ] 서버 로그 확인 완료
- [ ] Cloudflare 캐시 삭제 완료
- [ ] 상품 상세 페이지 테스트 완료
- [ ] 장바구니 페이지 테스트 완료
- [ ] 헤더 배지 테스트 완료

---

**모든 단계를 완료하면 장바구니 시스템을 사용할 수 있습니다!** 🎉

