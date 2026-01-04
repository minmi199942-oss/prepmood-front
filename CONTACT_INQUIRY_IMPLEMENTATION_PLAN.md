# 고객 문의하기 서비스 구현 계획

## 📋 전체 구조 개요

```
프론트엔드 (공개)
├── contact.html          # 문의 접수 페이지
├── contact.js            # 문의 폼 처리 + 자동 채움
└── assets/css/contact.css

관리자 페이지
├── admin-qhf25za8/inquiries.html    # 문의 관리 페이지
├── admin-qhf25za8/admin-inquiries.js # 문의 관리 로직
└── admin-qhf25za8/admin-layout.js   # 네비게이션 메뉴 추가

백엔드
├── backend/inquiry-routes.js         # 문의 API 라우트
├── backend/index.js                  # /api/auth/me 수정 (last_name, first_name 필드 추가)
└── backend/migrations/010_create_inquiries_tables.sql

공통
└── footer.partial                    # "문의하기" 링크 추가
```

---

## 1. 프론트엔드 (공개) - 문의 접수

### 1.1 파일 구조

```
/contact.html
/assets/js/contact.js
/assets/css/contact.css
```

### 1.2 contact.html 구조

**레이아웃:**
- 좌측: 안내 문구 섹션
  - 제목: "문의 접수"
  - 설명: "아래 정보를 남겨주시면 전담 컨시어지를 통해 순차적으로 안내드릴 예정입니다."
  - "* 필수 항목"

- 우측: 폼 섹션
  - **고객 정보**
    - 호칭* (select: Mr, Ms, Mrs, Mx)
    - 이름* (text)
    - 성* (text)
    - 이메일* (email)
    - 선호 지역* (select: 한국, 일본, 미국 등)
    - 도시 (text, 선택)
    - 국가 코드 + 전화번호 (select + text, 선택)
  
  - **문의 사항**
    - 관심분야* (select: 8개 카테고리)
    - 주제* (select: 관심분야에 따라 동적 변경)
    - 메시지* (textarea: 5줄, 1000자)
      - 실시간 카운터: "n/5줄 · m/1000자"
      - placeholder: "요청하실 내용을 입력해주세요."
      - **서버 검증 필수**: 프론트 제한만으로는 curl 등으로 우회 가능
        * 길이 <= 1000자 (trim 후)
        * 줄 수 <= 5줄 (개행 기준)
        * 공백만 입력 방지 (trim 후 길이 > 0)
  
  - **안내 문구**
    - "모든 문의는 전담 컨시어지를 통해 기밀로 처리되며, 영업일 기준 순차적으로 안내드립니다."
  
  - **개인정보 동의**
    - 체크박스 1: 개인정보 수집·이용 동의 (필수)
      - 접기/펼치기 버튼 ("자세히 보기")
    - 체크박스 2: 만 14세 이상 확인 (필수)

**필수/선택 항목 명시:**
- **필수**: 호칭, 성, 이름, 이메일, 지역, 관심분야, 주제, 메시지, 개인정보 동의, 14세 이상 확인
- **선택**: 도시, 국가코드, 전화번호
  
  - **허니팟 필드** (숨김)
    - `<input type="text" name="company" style="display:none">`
  
  - **제출 버튼**
    - "보내기"

### 1.3 contact.js 주요 기능

**초기화:**
```javascript
- 관심분야/주제 데이터 구조 초기화
- 로그인 상태 확인 및 자동 채움 (tryAutofillFromLogin)
- CSRF 토큰 준비
```

**관심분야/주제 연동:**
```javascript
const CATEGORIES = [
  {
    key: "I. 제품 관련 안내",
    topics: [
      "제품 사양 · 소재 · 제작 방식",
      "착용감 · 관리 방법",
      "재입고 · 생산 일정 관련 안내"
    ]
  },
  // ... 8개 카테고리
];

- 관심분야 선택 시 주제 옵션 동적 변경
```

**메시지 제한:**
```javascript
- 실시간 글자수/줄수 카운터
- 1000자 제한
- 5줄 제한 (Enter 키로 6번째 줄 방지)
```

**자동 채움:**
```javascript
async function tryAutofillFromLogin() {
  // /api/auth/me 호출 (last_name, first_name 필드 추가됨)
  // last_name, first_name 분리해서 채움
  // 전화번호 분리 (countryCode + phone)
}
```

**폼 제출:**
```javascript
- CSRF 토큰 헤더: 'X-XSRF-TOKEN'
- 허니팟 필드 체크
- POST /api/inquiries
- 성공 시 접수 완료 메시지 + 폼 리셋
```

### 1.4 contact.css

- 네이버 스타일 레이아웃 반영 (기능 중심)
- 좌측/우측 2단 레이아웃 (하단 고정 패널)
- 데스크톱 전용 (모바일 대응 불필요)
- 접기/펼치기 애니메이션 (선택)

---

## 2. 백엔드 API

### 2.1 파일 구조

```
/backend/inquiry-routes.js
/backend/index.js (수정 또는 추가)
```

### 2.2 API 엔드포인트

#### 2.2.1 공개 API

**POST /api/inquiries** - 문의 접수
```
- 미들웨어: inquiryLimiter, optionalAuth, verifyCSRF
- 허니팟 필드 체크
- 입력 검증:
  - 필수: salutation, first_name, last_name, email, region, category, topic, message, privacy_consent, age_consent
  - 선택: city, country_code, phone
  - message 검증 (서버 측):
    * 길이 <= 1000자 (trim 후)
    * 줄 수 <= 5줄 (개행 기준)
    * 공백만 입력 방지 (trim 후 길이 > 0)
  - privacy_consent: 필수 (true)
  - age_consent: 필수 (true)
- 접수번호 생성 (트랜잭션 내)
  - 형식: INQ-YYYYMMDD-000123
  - 생성 로직: INSERT 후 insertId를 6자리 패딩 (예: 123 → 000123)
  - 트랜잭션으로 INSERT + UPDATE 묶기
- DB 저장
- 응답: { success: true, inquiry_number: "INQ-20250101-000123" }
```

#### 2.2.2 관리자 API

**GET /api/admin/inquiries** - 문의 목록 조회
```
- 미들웨어: authenticateToken, requireAdmin
- 쿼리 파라미터:
  - status: new, in_progress, answered, closed
  - category: 관심분야 필터
  - search: 이메일/접수번호/이름 검색
  - limit, offset: 페이지네이션
- 응답: { inquiries: [...], pagination: {...} }
```

**GET /api/admin/inquiries/:id** - 문의 상세 조회
```
- 미들웨어: authenticateToken, requireAdmin
- 응답: { inquiry: {...} }
```

**POST /api/admin/inquiries/:id/reply** - 답변 전송
```
- 미들웨어: authenticateToken, requireAdmin, verifyCSRF
- **표준 흐름 (A안 - 락 최소화):**
  1. 고객 정보 조회 (트랜잭션 전)
  2. DB 트랜잭션:
     - inquiry_replies 저장 (email_status='pending')
     - inquiries.status = 'answered' 변경
     - 커밋 (트랜잭션 종료)
  3. 이메일 발송 (트랜잭션 외부 - 비동기 처리 가능)
  4. 이메일 결과 기록 (email_status, email_error) - 별도 UPDATE
- 응답: { success: true, replyId: 123, emailStatus: 'sent' }
```

**PUT /api/admin/inquiries/:id/status** - 상태 변경
```
- 미들웨어: authenticateToken, requireAdmin, verifyCSRF
- 상태: new, in_progress, answered, closed
- 응답: { success: true }
```

**PUT /api/admin/inquiries/:id/memo** - 관리자 메모 저장
```
- 미들웨어: authenticateToken, requireAdmin, verifyCSRF
- 응답: { success: true }
```

**GET /api/admin/inquiries/stats** - 통계 조회
```
- 미들웨어: authenticateToken, requireAdmin
- 응답: { stats: { new: 5, in_progress: 3, today: 10 } }
```

**GET /api/admin/inquiries/:id/replies** - 답변 이력 조회
```
- 미들웨어: authenticateToken, requireAdmin
- 응답: { replies: [...] }
```

#### 2.2.3 인증 API 수정

**✅ 확정: /api/auth/me 확장 (하위호환 유지)**

```javascript
GET /api/auth/me
- 미들웨어: authenticateToken
- 응답 구조:
  {
    success: true,
    user: {
      userId: user.user_id,
      email: user.email,
      name: `${user.last_name} ${user.first_name}`.trim(), // 기존 유지 (하위호환)
      last_name: user.last_name,  // ✅ 추가
      first_name: user.first_name, // ✅ 추가
      phone: user.phone || null,
      birthdate: user.birth || null
    }
  }
```

**선택 이유:**
- 문의하기뿐 아니라 다른 폼(배송지, A/S 등)에서도 재사용 가능
- 인증 흐름 단순화 (별도 엔드포인트 불필요)
- 하위호환 유지 (기존 `name` 필드 유지)

### 2.3 Rate Limit 설정

```javascript
const inquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 5, // 최대 5회
  message: '너무 많은 문의 요청이 있습니다. 잠시 후 다시 시도해주세요.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (req.user && req.user.userId) {
      return `inquiry:user:${req.user.userId}`;
    }
    return ipKeyGenerator(req.ip || '');
  }
});
```

**⚠️ 검증 항목 (구현 후 확인):**
- Rate limit 키는 `req.ip` 기반
- `req.ip`는 trust proxy 설정/프록시 체인에 따라 달라짐
- 실제 운영에서 `/api/inquiries` 요청 시 서버 로그로 `req.ip`가 기대대로 들어오는지 1회 확인 필요
- 배포 구조: Cloudflare → Nginx → Node
- 현재 설정: `app.set('trust proxy', 'loopback')`
- **검증 방법**: 실제 요청 시 로그로 `req.ip` 값 확인

### 2.4 이메일 발송

```javascript
// backend/mailer.js에 추가 또는 별도 파일
async function sendInquiryReplyEmail(customerEmail, { customerName, replyMessage }) {
  // MailerSend 또는 Nodemailer 사용
  // 문의 답변 이메일 템플릿
}
```

---

## 3. 관리자 페이지

### 3.1 파일 구조

```
/admin-qhf25za8/inquiries.html
/admin-qhf25za8/admin-inquiries.js
/admin-qhf25za8/admin-layout.js (수정)
```

### 3.2 inquiries.html 구조

**헤더:**
- admin-layout.js에서 동적 생성
- 네비게이션: 상품 관리 | 주문 관리 | **고객 문의** (활성화)

**메인 컨텐츠:**
- **상단 툴바**
  - 제목: "고객 문의 관리"
  - 필터: 상태 (전체, 신규, 처리중, 답변 완료, 종료)
  - 필터: 관심분야 (전체, 8개 카테고리)
  - 검색: 이메일/접수번호/이름
  - 새로고침 버튼

- **통계 카드**
  - 신규 문의 (warning 스타일)
  - 처리중
  - 오늘 접수

- **문의 테이블**
  - 컬럼: 접수번호, 접수일시, 고객 정보, 관심분야, 주제, 상태, 작업
  - 행 클릭 또는 "상세보기" 버튼 → 모달 열기

- **페이지네이션**

**하단 고정 패널 (네이버 스타일 - 한 페이지에서 모든 작업):**
- **왼쪽: 문의 상세**
  - 접수번호, 접수일시
  - 고객 정보 (이름, 이메일, 전화번호, 지역)
  - 문의유형/제목
  - 문의내용(원문)

- **오른쪽: 처리 패널**
  - 답변 입력 textarea
  - "답변 전송" 버튼
  - 처리상태 변경 드롭다운 + 저장
  - 관리자 메모 textarea + 저장
  - 답변 이력 (누가/언제/무슨 답변을 보냈는지)

**참고:**
- 모달 방식이 아닌 하단 고정 패널 방식 (네이버 스타일)
- 목록 클릭 시 하단 패널에 상세 표시 (페이지 이동 없음)
- 한 화면에서 목록 + 상세 + 처리 동시 작업 가능

### 3.3 admin-inquiries.js 주요 기능

**초기화:**
```javascript
- initInquiriesPage()
- setupEventListeners()
- loadInquiries()
- loadStats()
```

**문의 목록 로드:**
```javascript
async function loadInquiries() {
  // GET /api/admin/inquiries
  // 필터/검색 파라미터 포함
  // 테이블 렌더링
  // 페이지네이션 렌더링
}
```

**문의 상세 열기 (하단 패널):**
```javascript
async function openInquiryDetail(inquiryId) {
  // 1. 하단 패널 표시
  elements.inquiryDetailPanel.classList.add('show');
  elements.inquiryListContainer.classList.add('panel-open');
  
  // 2. GET /api/admin/inquiries/:id
  // 하단 패널 왼쪽에 상세 정보 채우기
  
  // 3. GET /api/admin/inquiries/:id/replies (답변 이력)
  // 하단 패널 오른쪽에 답변 이력 표시
  
  // 4. 목록 스크롤 위치 유지 (페이지 이동 없음)
}
```

**답변 전송:**
```javascript
async function sendReply() {
  // POST /api/admin/inquiries/:id/reply
  // CSRF 토큰 포함
  // 성공 시:
  // - 답변 이력 새로고침 (하단 패널 오른쪽)
  // - 목록 새로고침 (상태 업데이트)
  // - 통계 새로고침
  // - 이메일 발송 상태 표시 (성공/실패)
  // - 하단 패널은 그대로 유지 (페이지 이동 없음)
}
```

**상태 변경:**
```javascript
async function updateStatus() {
  // PUT /api/admin/inquiries/:id/status
  // CSRF 토큰 포함
}
```

**메모 저장:**
```javascript
async function saveMemo() {
  // PUT /api/admin/inquiries/:id/memo
  // CSRF 토큰 포함
}
```

**통계 로드:**
```javascript
async function loadStats() {
  // GET /api/admin/inquiries/stats
  // 통계 카드 업데이트
}
```

**XSS 방지:**
```javascript
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 모든 사용자 입력에 escapeHtml 적용
```

### 3.4 admin-layout.js 수정

```javascript
const NAV_MENU = [
  { id: 'products', label: '상품 관리', href: 'products.html' },
  { id: 'orders', label: '주문 관리', href: 'orders.html' },
  { id: 'inquiries', label: '고객 문의', href: 'inquiries.html' }, // ✅ 활성화
];
```

---

## 4. 데이터베이스 스키마

### 4.1 inquiries 테이블

```sql
CREATE TABLE inquiries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  inquiry_number VARCHAR(20) UNIQUE NULL, -- INQ-YYYYMMDD-000123 형식, NULL 허용 (fallback: id)
  user_id BIGINT NULL, -- 로그인 사용자 (NULL 허용)

  -- 고객 정보
  salutation VARCHAR(10) NOT NULL,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(120) NOT NULL,
  region VARCHAR(10) NOT NULL,
  city VARCHAR(80) NULL,
  country_code VARCHAR(10) NULL,
  phone VARCHAR(30) NULL,

  -- 문의 내용
  category VARCHAR(80) NOT NULL,
  topic VARCHAR(120) NOT NULL,
  message TEXT NOT NULL,
  privacy_consent TINYINT(1) NOT NULL DEFAULT 0,

  -- 관리
  status ENUM('new','in_progress','answered','closed') NOT NULL DEFAULT 'new',
  admin_memo TEXT NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_category (category),
  INDEX idx_created_at (created_at),
  INDEX idx_inquiry_number (inquiry_number),
  INDEX idx_email (email),
  INDEX idx_name (last_name, first_name),
  
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 4.2 inquiry_replies 테이블

```sql
CREATE TABLE inquiry_replies (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  inquiry_id BIGINT NOT NULL,
  admin_user_id BIGINT NOT NULL,
  message TEXT NOT NULL,
  email_status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
  email_error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_inquiry_id (inquiry_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 4.3 접수번호 생성 로직

**✅ 확정: id 기반 패딩 방식**

```javascript
// backend/inquiry-routes.js
async function generateInquiryNumber(inquiryId) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const paddedId = String(inquiryId).padStart(6, '0'); // 6자리 패딩 (예: 123 → 000123)
  return `INQ-${date}-${paddedId}`;
}

// 트랜잭션 내에서 실행
await connection.beginTransaction();
try {
  // 1. INSERT
  const [result] = await connection.execute(
    'INSERT INTO inquiries (...) VALUES (...)',
    [...]
  );
  const inquiryId = result.insertId;

  // 2. inquiry_number 생성 및 UPDATE (같은 트랜잭션 내)
  const inquiryNumber = generateInquiryNumber(inquiryId);
  await connection.execute(
    'UPDATE inquiries SET inquiry_number = ? WHERE id = ?',
    [inquiryNumber, inquiryId]
  );

  await connection.commit();
} catch (error) {
  await connection.rollback();
  throw error;
}
```

**선택 이유:**
- 경쟁조건 없음 (insertId는 고유)
- 트랜잭션으로 inquiry_number 누락 방지
- 간단하고 안전

### 4.4 마이그레이션 파일

```
/backend/migrations/010_create_inquiries_tables.sql
```

---

## 5. 공통 수정 사항

### 5.1 footer.partial 수정

```html
<!-- 고객센터 섹션 -->
<div class="footer-section">
  <h3 class="footer-title">고객센터</h3>
  <div class="footer-content">
    <p class="footer-text">고객센터 전화번호: <a href="tel:1555-6035" class="footer-link">1555-6035</a></p>
    <p class="footer-text">이메일: <a href="mailto:prepmoodcare@naver.com" class="footer-link">prepmoodcare@naver.com</a></p>
    <p class="footer-text"><a href="contact.html" class="footer-link">문의하기</a></p> <!-- ✅ 추가 -->
  </div>
</div>
```

### 5.2 backend/index.js 수정

**✅ 확정: /api/auth/me 확장 (하위호환 유지)**

```javascript
// backend/index.js:1174 수정
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig);
    const [users] = await connection.execute(
      'SELECT user_id, email, last_name, first_name, phone, birth FROM users WHERE user_id = ?',
      [req.user.userId]
    );
    connection.end();

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: '사용자 정보를 찾을 수 없습니다.'
      });
    }

    const user = users[0];
    res.json({
      success: true,
      user: {
        userId: user.user_id,
        email: user.email,
        name: `${user.last_name} ${user.first_name}`.trim(), // 기존 유지 (하위호환)
        last_name: user.last_name,  // ✅ 추가
        first_name: user.first_name, // ✅ 추가
        phone: user.phone || null,
        birthdate: user.birth || null
      }
    });
  } catch (error) {
    console.error('사용자 정보 조회 오류:', error);
    res.status(500).json({
      success: false,
      message: '사용자 정보 조회 중 오류가 발생했습니다.'
    });
  }
});
```

### 5.3 backend/index.js - inquiry-routes 등록

```javascript
const inquiryRoutes = require('./inquiry-routes');
app.use('/api', inquiryRoutes);
```

---

## 6. 구현 순서

### Phase 1: 백엔드 기반 구축
1. ✅ DB 마이그레이션 실행 (`010_create_inquiries_tables.sql`)
2. ✅ `/api/auth/me` 수정 (last_name, first_name 필드 추가)
3. ✅ `inquiry-routes.js` 생성
   - Rate limit 설정
   - 공개 API: POST /api/inquiries
     - **서버 검증**: 메시지 길이 <= 1000자, 줄 수 <= 5줄, 공백만 입력 방지
   - 관리자 API: GET, POST, PUT 엔드포인트
   - **접수번호 생성**: INSERT 후 insertId를 6자리 패딩 (트랜잭션 내)
   - **답변 전송**: A안 (커밋 후 이메일 발송)
4. ✅ `backend/index.js`에 라우트 등록
5. ✅ 이메일 발송 함수 추가

### Phase 2: 프론트엔드 (공개)
1. ✅ `contact.html` 생성
2. ✅ `contact.js` 생성
   - 관심분야/주제 데이터 구조
   - 자동 채움 로직
   - 폼 제출 로직
3. ✅ `contact.css` 생성
4. ✅ `footer.partial` 수정 (문의하기 링크)

### Phase 3: 관리자 페이지
1. ✅ `admin-layout.js` 수정 (네비게이션 메뉴 추가)
2. ✅ `inquiries.html` 생성
3. ✅ `admin-inquiries.js` 생성
   - 목록 조회
   - 상세 보기
   - 답변 전송
   - 상태 변경
   - 메모 저장
   - 통계 조회

### Phase 4: 테스트 및 검증

**필수 테스트 시나리오 10개:**

**공개 문의 접수:**
1. ✅ 비로그인 상태에서 문의 제출 성공
2. ✅ 로그인 상태에서 자동 채움 성공 (last_name, first_name, email, phone)
3. ✅ CSRF 토큰 누락 시 403 에러 확인
4. ✅ Rate limit 초과 시 429 에러 확인
5. ✅ 메시지 1000자 초과 시 서버에서 거절 확인
6. ✅ 메시지 6줄 초과 시 서버에서 거절 확인
7. ✅ 개인정보 동의/14세 체크 없으면 제출 불가 확인

**관리자:**
8. ✅ 목록/필터/검색 정상 동작 확인
9. ✅ 답변 전송 시 replies 저장 + status answered + email_status 기록 확인
10. ✅ 이메일 실패 시에도 답변 저장되고 email_status failed로 남는지 확인

**추가 검증 항목:**
- ✅ 접수번호 생성 정상 (INQ-YYYYMMDD-000123 형식)
- ✅ 트랜잭션으로 inquiry_number 누락 방지 확인
- ✅ XSS 방지 (escapeHtml) 확인
- ✅ Trust proxy 설정 확인 (req.ip 로그 확인)

---

## 7. 보안 체크리스트

- ✅ CSRF 토큰: `X-XSRF-TOKEN` 헤더 (모두 대문자)
- ✅ Rate Limit: 15분당 5회 (로그인 사용자는 userId 기준)
- ✅ 허니팟 필드: 스팸 방지
- ✅ XSS 방지: 모든 사용자 입력 `escapeHtml` 처리
- ✅ SQL Injection: Prepared Statement 사용
- ✅ 입력 검증: 서버 측 검증 필수
- ✅ 인증/인가: 관리자 API는 `authenticateToken` + `requireAdmin`

---

## 8. 주요 데이터 흐름

### 8.1 문의 접수 흐름

```
1. 사용자가 contact.html 접속
2. 로그인 상태면 /api/auth/me 호출 → 자동 채움 (last_name, first_name 필드 사용)
3. 폼 작성 및 제출
4. POST /api/inquiries
   - 허니팟 체크
   - 입력 검증
   - 트랜잭션:
     - INSERT inquiries
     - UPDATE inquiries (inquiry_number 생성)
   - 커밋
5. 접수 완료 메시지 표시
```

### 8.2 관리자 답변 흐름

```
1. 관리자가 inquiries.html 접속
2. 문의 목록 조회 (GET /api/admin/inquiries)
3. 문의 상세 열기 (GET /api/admin/inquiries/:id)
4. 답변 작성 및 전송
5. POST /api/admin/inquiries/:id/reply
   - 트랜잭션:
     - INSERT inquiry_replies (email_status='pending')
     - UPDATE inquiries (status='answered')
     - 커밋
   - 이메일 발송 (트랜잭션 외부)
   - 이메일 결과 기록
6. 답변 이력 새로고침
7. 목록 새로고침
```

---

## 9. 파일 목록 (최종)

### 새로 생성할 파일
- `contact.html`
- `assets/js/contact.js`
- `assets/css/contact.css`
- `admin-qhf25za8/inquiries.html`
- `admin-qhf25za8/admin-inquiries.js`
- `backend/inquiry-routes.js`
- `backend/migrations/010_create_inquiries_tables.sql`

### 수정할 파일
- `footer.partial` (문의하기 링크 추가)
- `backend/index.js` (/api/auth/me 수정 - last_name, first_name 필드 추가)
- `admin-qhf25za8/admin-layout.js` (네비게이션 메뉴 추가)

### 선택적 수정
- `backend/mailer.js` (이메일 발송 함수 추가)

---

## 10. 구현 시 주의사항

1. **접수번호 생성**: id 기반 패딩 방식 (INSERT 후 insertId를 6자리 패딩) + 트랜잭션으로 INSERT+UPDATE 묶기
2. **이메일 발송**: A안 표준 흐름 (DB 커밋 후 이메일 발송, 락 최소화)
3. **XSS 방지**: 모든 사용자 입력 escapeHtml 처리
4. **CSRF 토큰**: `X-XSRF-TOKEN` (모두 대문자)
5. **이름 매핑**: `/api/auth/me` 확장 (last_name, first_name 필드 추가)
6. **고객명 표시**: `last_name first_name` 순서
7. **임시 저장 버튼**: UI에 포함하지 않음 (draft 기능 없음)
8. **메시지 제한**: 프론트 + 서버 모두 동일 룰 적용 (1000자, 5줄, 공백만 입력 방지)
9. **필수/선택 항목**: 명시된 대로 정확히 구현 (전화번호는 선택)
10. **Trust proxy**: 구현 후 req.ip 로그 확인 (검증 항목)

---

## ✅ 구현 준비 완료

위 구조대로 구현하면 운영 가능한 문의하기 서비스가 완성됩니다.

