# 대규모 변경 사항 체크리스트

## 📋 변경 요구사항 요약

1. **비회원 구매 가능** - 로그인 필수 제거
2. **회원가입 한 페이지 통합** - 이메일 인증 + 개인정보 입력을 한 페이지로
3. **비회원 주문 가능** - 비회원 주문 시 이메일 수집 동의 추가
4. **checkout.html 이름 필드 통합** - firstName/lastName → name 단일 필드
5. **DB 스키마 영향 분석** - 회원가입/주문 정보 변경에 따른 영향 확인

---

## 1️⃣ 비회원 구매 가능 (로그인 필수 제거)

### 현재 상태
- `buy-script.js` 356-360줄: `quickBuy()` 함수에서 로그인 체크 후 리다이렉트
- `checkout-script.js` 70-79줄: 로그인 상태 확인 후 장바구니 로드
- `backend/order-routes.js` 367줄: `authenticateToken` 미들웨어로 로그인 필수

### 변경 필요 사항

#### Frontend
- [ ] `buy-script.js`: `quickBuy()` 함수에서 로그인 체크 제거
- [ ] `checkout-script.js`: 로그인 상태 확인 로직을 선택적(optional)으로 변경
- [ ] `mini-cart.js`: 비회원 장바구니 지원 (로컬 스토리지 기반)

#### Backend
- [ ] `backend/order-routes.js`: `/orders` POST 엔드포인트에서 `authenticateToken` → `optionalAuth`로 변경
- [ ] 주문 생성 시 `user_id` NULL 허용 처리
- [ ] 비회원 주문 조회를 위한 별도 엔드포인트 또는 이메일/주문번호 기반 조회

### 영향 범위
- ✅ 장바구니 시스템: 비회원 장바구니 지원 필요
- ✅ 주문 조회: 비회원 주문 조회 방법 필요 (이메일 + 주문번호)
- ✅ 주문 이력: `my-orders.html`은 회원 전용 유지

---

## 2️⃣ 회원가입 한 페이지 통합

### 현재 상태
- `register.html`: 2단계 구조 (이메일 인증 → 개인정보 입력)
- `backend/index.js` 362-469줄: `/api/register` 엔드포인트에서 이메일 인증 확인 후 회원가입 처리

### 변경 필요 사항

#### Frontend
- [ ] `register.html`: 2단계 구조를 1페이지로 통합
  - 이메일 인증 섹션과 개인정보 입력 섹션을 같은 페이지에 배치
  - 폰트 크기 조정으로 자연스러운 배치
  - 이메일 인증 완료 후 개인정보 입력 필드 활성화

#### Backend
- [ ] `backend/index.js`: `/api/register` 엔드포인트 로직 유지 (변경 불필요)
  - 이메일 인증 확인 로직은 그대로 유지
  - 단, 프론트엔드에서 한 페이지에서 처리하도록 변경

### 영향 범위
- ✅ UI/UX 변경: 2단계 → 1페이지 통합
- ✅ DB 변경: 동의 관련 컬럼 4개 추가, `birth` 제거, `phone` 필수 변경
- ✅ 백엔드 로직 변경: 동의 정보 저장 로직 추가, 이메일 중복 시 로그인 페이지 이동
- ✅ `register.css`: 스타일 조정 필요

---

## 3️⃣ 비회원 주문 가능 + 이메일 수집 동의

### 현재 상태
- `checkout.html`: 회원 전용 구조
- `checkout-script.js`: 로그인 상태 확인 후 사용자 정보 자동 입력

### 변경 필요 사항

#### Frontend
- [ ] `checkout.html`: 
  - 비회원 주문 시 이메일 필드 필수
  - 결제 버튼 하단에 동의 문구 추가:
    > "비회원 주문의 경우, 주문 확인 및 디지털 인보이스 발행을 위해 이메일 정보 수집에 동의합니다."
  - 체크박스 추가 (필수)

#### Backend
- [ ] `backend/order-routes.js`: 
  - 주문 생성 시 `user_id` NULL 허용
  - 비회원 주문 시 `shipping_email` 필수 검증
  - 이메일 수집 동의 여부 저장 (필요 시 `orders` 테이블에 `email_consent` 컬럼 추가)

### 영향 범위
- ✅ 주문 조회: 비회원 주문 조회 방법 필요
- ✅ 디지털 인보이스: 비회원 주문도 인보이스 발행 가능하도록

---

## 4️⃣ checkout.html 이름 필드 통합

### 현재 상태
- `checkout.html` 39-46줄: `firstName`과 `lastName` 분리된 필드
- `checkout-script.js` 426-448줄: `collectShippingData()` 함수에서 `recipient_first_name`, `recipient_last_name` 수집
- `backend/order-routes.js` 524-533줄: `shipping_first_name`, `shipping_last_name` 저장

### 변경 필요 사항

#### Frontend
- [ ] `checkout.html`: 
  - `firstName`과 `lastName` 필드를 `name` 단일 필드로 통합
  - 라벨: "이름 *"

#### Backend
- [ ] `checkout-script.js`: 
  - `collectShippingData()` 함수에서 `name` 필드 수집
  - 백엔드 전송 시 `name` 필드로 전송 (또는 백엔드에서 분리 처리)

#### Backend (선택)
- [ ] `backend/order-routes.js`: 
  - 옵션 A: `shipping_name` 단일 컬럼으로 변경 (DB 마이그레이션 필요)
  - 옵션 B: `name` 필드를 받아서 `shipping_first_name`, `shipping_last_name`으로 분리 저장 (기존 구조 유지)

### 영향 범위
- ⚠️ **DB 스키마 변경 필요 여부 확인 필요**
  - 옵션 A 선택 시: `orders` 테이블 마이그레이션 필요
  - 옵션 B 선택 시: DB 변경 없음, 백엔드 로직만 수정

---

## 5️⃣ DB 스키마 영향 분석

### 현재 DB 구조

#### `users` 테이블 (회원가입 정보)
```sql
- user_id (PK, VARCHAR(20)) -- ⚠️ 변경: INT → VARCHAR, 형식: PM.{년도}.{랜덤6자}
- email
- password_hash
- last_name (성)
- first_name (이름)
- birth (생년월일)
- phone (전화번호, 선택)
- verified
- google_id (선택)
- profile_picture (선택)
- email_verified
```

**⚠️ 중요 변경 사항**:
- `user_id` 형식: `PM.{년도}.{랜덤6자}` (예: `PM.2025.ABC123`)
- 모든 FK 관계 수정 필요
- 기존 데이터 마이그레이션 필요

#### `orders` 테이블 (주문 정보)
```sql
- order_id (PK)
- user_id (FK, VARCHAR(20), NULL 허용) -- ⚠️ 변경: INT → VARCHAR, NULL 허용
- guest_id (VARCHAR(20), NULL 허용) -- ⚠️ 신규: 형식: G-{YYYYMMDD}-{랜덤6자}
- order_number
- total_price
- status
- shipping_first_name
- shipping_last_name
- shipping_email
- shipping_phone
- shipping_address
- shipping_city
- shipping_postal_code
- shipping_country
- shipping_method
- shipping_cost
- estimated_delivery
```

**⚠️ 중요 변경 사항**:
- `user_id`: INT → VARCHAR(20), NULL 허용
- `guest_id`: 신규 추가, 형식: `G-{YYYYMMDD}-{랜덤6자}` (예: `G-20250101-ABC123`)

#### `inquiries` 테이블 (고객 문의)
```sql
- id (PK)
- user_id (FK, NULL 허용)
- salutation
- first_name
- last_name
- email
- region
- city
- country_code
- phone
- category
- topic
- message
- privacy_consent
- age_consent
- status
- admin_memo
```

### 변경 사항별 영향 분석

#### 1. 비회원 구매 가능
- ✅ `orders.user_id`: 이미 NULL 허용 가능성 있음 (확인 필요)
- ✅ `inquiries.user_id`: 이미 NULL 허용 (비회원 문의 지원)
- ⚠️ **확인 필요**: `orders` 테이블의 `user_id`가 NULL 허용인지 확인

#### 2. 회원가입 정보 변경
- ✅ **변경 없음**: 회원가입 정보 구조는 그대로 유지
- ✅ 단, UI만 한 페이지로 통합

#### 3. 주문 정보 변경 (이름 필드 통합)
- ⚠️ **옵션 A (DB 변경)**: 
  - `shipping_first_name`, `shipping_last_name` → `shipping_name` 단일 컬럼
  - 마이그레이션 스크립트 필요
  - 기존 데이터 변환 필요
- ✅ **옵션 B (DB 유지)**: 
  - 백엔드에서 `name` 필드를 받아서 분리 저장
  - DB 변경 없음

#### 4. 관리자 페이지 영향

##### `admin-qhf25za8/inquiries.html` (고객 문의 관리)
- ✅ **영향 없음**: `inquiries` 테이블은 이미 `user_id` NULL 허용
- ✅ 비회원 문의도 이미 지원 가능한 구조

##### `admin-qhf25za8/orders.html` (주문 관리)
- ⚠️ **확인 필요**: 
  - `orders.user_id`가 NULL인 경우 처리
  - 비회원 주문 표시 방법
  - 주문 조회 시 이메일 기반 검색 추가 필요

### DB 마이그레이션 필요 여부

#### 필수 마이그레이션
- [ ] `orders.user_id` NULL 허용 확인 및 필요 시 변경
- [ ] 비회원 주문 조회를 위한 인덱스 추가 (이메일 기반)

#### 선택적 마이그레이션 (이름 필드 통합)
- [ ] 옵션 A 선택 시: `shipping_first_name`, `shipping_last_name` → `shipping_name` 통합
- [ ] 옵션 B 선택 시: 마이그레이션 불필요

---

## 📊 우선순위 및 실행 계획

### ⚠️ **중요: Phase 0 (최우선) - users 테이블 변경**

**이유**: `users.user_id` 형식 변경은 모든 FK 관계에 영향을 미치므로, 다른 모든 작업보다 먼저 완료해야 합니다.

#### Phase 0-1. users.user_id 형식 변경 (최우선)
**변경 사항**:
- `users.user_id`: `INT AUTO_INCREMENT` → `VARCHAR(20)` 
- 형식: `PM.{년도}.{랜덤6자}` (예: `PM.2025.ABC123`)
- 생성 로직: 회원가입 시 자동 생성

**영향 범위**:
- 모든 FK 관계 수정 필요:
  - `orders.user_id` (FK)
  - `warranties.user_id` → `warranties.owner_user_id` (FK)
  - `inquiries.user_id` (FK)
  - `token_master.owner_user_id` (FK, 레거시)
  - `transfer_logs.from_user_id`, `to_user_id`, `admin_user_id` (FK)
  - `scan_logs.user_id` (FK)
  - `orders_idempotency.user_id` (FK)
- 기존 데이터 마이그레이션 필요 (INT → VARCHAR 변환)

**작업 순서**:
1. 기존 `user_id` 데이터 백업
2. 새 `user_id` 형식 생성 함수 구현
3. 기존 데이터 마이그레이션 (INT → VARCHAR, 형식 변환)
4. 모든 FK 제약 수정
5. 코드에서 `user_id` 사용 부분 확인 및 수정

**예상 소요 시간**: 3-5일 (데이터 마이그레이션 포함)

#### Phase 0-2. guest_id 생성 규칙 정의
**형식**: `G-{주문한연도월일}-{랜덤6자}` (예: `G-20250101-ABC123`)
- `{주문한연도월일}`: 주문 생성 시점의 날짜 (YYYYMMDD)
- `{랜덤6자}`: 대문자 영문 + 숫자 조합 (0-9, A-Z)

**생성 시점**: 비회원 주문 생성 시 (`orders` 테이블 INSERT 시)

**작업 내용**:
- `guest_id` 생성 함수 구현
- `orders.guest_id` 컬럼 추가 (VARCHAR(20))
- 중복 체크 로직 구현

**예상 소요 시간**: 0.5-1일

### Phase 1: 비회원 구매 기반 구축 (Phase 0 완료 후)
1. `orders.user_id` NULL 허용 확인 및 변경 (이미 VARCHAR로 변경됨)
2. `orders.guest_id` 컬럼 추가 및 생성 로직 구현
3. **비회원 장바구니 지원 (로컬 스토리지)** ✅
   - **구현 완료**: `mini-cart.js`에서 localStorage 기반 장바구니 지원
   - **로컬 스토리지 키**: `pm_cart_v1` (버전 관리, 기존 `guest_cart` 자동 마이그레이션)
     - **⚠️ 버전 전환 시점 관리**: 향후 `pm_cart_v2` 전환 시 자동 마이그레이션 실패하면 조용히 폐기
     - 사용자에게 "장바구니 초기화됨" 알림 표시하지 않음 (문의 유발 방지)
   - **로그인 상태 확인 정책**:
     - `checkLoginStatus()` 반환값: `{status: 'auth'|'guest'|'unknown', isLoggedIn: boolean}`
     - `auth`: 로그인 상태 (확인됨) → 서버 카트 사용
     - `guest`: 비회원 상태 (401/403으로 확인됨) → localStorage 사용
     - `unknown`: **상태 확인 불가** (서버 장애/네트워크 오류)
       - 실제로는 회원일 수도, 비회원일 수도 있음 (서버 접근 불가로 확인 불가)
       - **⚠️ 중요**: `unknown` 상태는 **절대 guest로 취급하지 않는다.**
       - **동작 원칙**:
         - 기존 장바구니는 유지 (회원 카트든 비회원 카트든 그대로)
         - 새로운 작업(담기/수량 변경/삭제)은 차단 (서버 동기화 불가)
         - alert 세션당 1회만 표시 (사용자 알림)
       - **예시**: 회원이 로그인 후 장바구니에 담음 → 네트워크 끊김 → unknown 상태
         - 기존 장바구니(서버 카트)는 유지되어 보임
         - 하지만 새로 담기/수량 변경 불가 (서버 접근 불가)
         - 네트워크 복구되면 다시 auth 상태로 전환, 정상 동작
   - **초기화 방식**: 이벤트 기반 (`minicart:ready` 이벤트) + 타임아웃 fallback
   - **로그인 시 동기화**: `syncGuestCartToServer()` 함수로 비회원 장바구니 → 서버 장바구니 병합
     - 동일 옵션(상품+사이즈+색상)은 수량 합산
     - 전체 성공 시에만 localStorage 비우기 (부분 실패 시 보존)
4. `buy-script.js`, `checkout-script.js` 로그인 체크 제거
5. `backend/order-routes.js` `optionalAuth` 적용

### Phase 2: 주문 정보 수집 변경
1. `checkout.html` 이름 필드 통합
2. `checkout-script.js` 데이터 수집 로직 변경
3. 비회원 주문 시 이메일 수집 동의 추가
4. 백엔드 주문 생성 로직 수정

### Phase 3: 회원가입 UI 통합
1. `register.html` 한 페이지 구조로 변경
2. `register.css` 스타일 조정

### Phase 4: 관리자 페이지 업데이트
1. `admin-qhf25za8/orders.html` 비회원 주문 표시 추가
2. 이메일 기반 주문 검색 기능 추가

---

## ⚠️ 확인 필요 사항

### 즉시 확인 필요
1. [x] `users.user_id` 형식 변경 결정: `PM.{년도}.{랜덤6자}` ✅
2. [x] `guest_id` 형식 결정: `G-{YYYYMMDD}-{랜덤6자}` ✅
3. [ ] `orders` 테이블의 `user_id` 컬럼이 NULL 허용인지 확인
4. [ ] 이름 필드 통합 시 옵션 A/B 중 선택
5. [ ] 비회원 주문 조회 방법 결정 (이메일 + 주문번호 vs 이메일만)

### 추가 검토 필요
1. [x] 비회원 장바구니 데이터 보존 기간 ✅ (localStorage에 저장, 브라우저별 정책 따름)
2. [ ] 비회원 주문 이메일 발송 로직
3. [ ] 디지털 인보이스 발행 시 비회원 처리

---

## 📝 다음 단계

1. **⚠️ 최우선: Phase 0 실행**
   - `users.user_id` 형식 변경 (INT → VARCHAR, `PM.{년도}.{랜덤6자}`)
   - 기존 데이터 마이그레이션
   - 모든 FK 관계 수정
   - `guest_id` 생성 규칙 구현 (`G-{YYYYMMDD}-{랜덤6자}`)

2. **DB 스키마 확인**: `orders.user_id` NULL 허용 여부 확인 (이미 VARCHAR로 변경됨)

3. **이름 필드 통합 방식 결정**: 옵션 A vs B

4. **비회원 주문 조회 방법 결정**: 이메일 + 주문번호 vs 이메일만

5. **단계별 구현 시작**: Phase 0 완료 후 Phase 1부터 순차 진행






