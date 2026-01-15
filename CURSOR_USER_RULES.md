# Cursor User Rules for Prepmood Project

## 🎯 프로젝트 개요
- **백엔드**: Node.js/Express, MySQL
- **프론트엔드**: 순수 HTML/JavaScript (프레임워크 없음)
- **배포**: PM2, 자동 배포 (GitHub webhook)
- **인증**: JWT (httpOnly 쿠키)

---

## 📝 코딩 스타일

### JavaScript/Node.js
- **ES6+ 문법 사용**: `const`, `let` 사용 (절대 `var` 사용 금지)
- **async/await 선호**: `Promise.then()` 대신 `async/await` 사용
- **함수명**: camelCase (예: `getUserEmail`, `verifyCode`)
- **상수명**: UPPER_SNAKE_CASE (예: `API_BASE`, `MAX_RETRIES`)
- **주석**: 한국어 주석 허용, JSDoc 스타일 권장

### 예시
```javascript
// ✅ 좋은 예
async function getUserEmail() {
    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            credentials: 'include'
        });
        const data = await response.json();
        return data.success && data.user ? data.user.email : null;
    } catch (error) {
        Logger.error('getUserEmail 실패', { error: error.message });
        return null;
    }
}

// ❌ 나쁜 예
function getUserEmail() {
    return fetch(API_BASE + '/auth/me')
        .then(response => response.json())
        .then(data => data.user.email)
        .catch(err => console.log(err));
}
```

---

## 🗂️ 프로젝트 구조

### 디렉토리 구조
```
project-root/
├── backend/           # Node.js/Express 백엔드
│   ├── utils/         # 유틸리티 함수
│   ├── migrations/    # DB 마이그레이션
│   └── scripts/       # 배포/진단 스크립트
├── admin-qhf25za8/    # 관리자 페이지
├── prep_server/       # Python 서버 (폰트 등)
└── *.html, *.js       # 프론트엔드 파일 (루트)
```

### 파일 네이밍
- **백엔드**: kebab-case (예: `paid-order-processor.js`, `auth-routes.js`)
- **프론트엔드**: kebab-case (예: `checkout-script.js`, `my-orders.js`)
- **HTML**: kebab-case (예: `order-complete.html`, `digital-warranty.html`)

---

## 🔒 보안 규칙

### 필수 보안 사항
1. **XSS 방지**: 사용자 입력은 반드시 `escapeHtml()` 함수로 이스케이프
   ```javascript
   // ✅ 좋은 예
   resultCard.innerHTML = `<p>${escapeHtml(userInput)}</p>`;
   
   // ❌ 나쁜 예
   resultCard.innerHTML = `<p>${userInput}</p>`;
   ```

2. **환경 변수**: `.env` 파일 사용, 절대 커밋하지 않음
   ```javascript
   const dbConfig = {
       host: process.env.DB_HOST,
       user: process.env.DB_USER,
       password: process.env.DB_PASSWORD
   };
   ```

3. **JWT 토큰**: httpOnly 쿠키로만 저장 (localStorage 사용 금지)
   ```javascript
   // ✅ 좋은 예
   res.cookie('token', token, {
       httpOnly: true,
       secure: process.env.NODE_ENV === 'production',
       sameSite: 'strict'
   });
   ```

4. **SQL Injection 방지**: Prepared statements 사용
   ```javascript
   // ✅ 좋은 예
   await connection.execute(
       'SELECT * FROM users WHERE email = ?',
       [email]
   );
   
   // ❌ 나쁜 예
   await connection.query(
       `SELECT * FROM users WHERE email = '${email}'`
   );
   ```

5. **CSRF 보호**: 관리자 작업 시 CSRF 토큰 검증 필수

---

## 🗄️ 데이터베이스 규칙

### 테이블/컬럼 네이밍
- **테이블명**: snake_case (예: `order_items`, `stock_units`)
- **컬럼명**: snake_case (예: `user_id`, `created_at`)
- **인덱스명**: `idx_` 접두사 (예: `idx_user_id`, `idx_order_id`)

### SSOT (단일 진실 원천) 원칙
- **`orders.status`**: 집계 결과(뷰용), 직접 정책 판단 기준으로 사용하지 않음
- **`warranties.status`**: 권리/정책 상태의 진실 원천
- **`order_item_units.unit_status`**: 물류 단위 상태의 진실 원천
- **`stock_units.status`**: 실물 재고 상태의 진실 원천

### 트랜잭션 규칙
- **원자성**: `UPDATE ... WHERE 조건`으로만 상태 전이, `affectedRows=1` 검증 필수
- **락 순서**: `stock_units` → `orders` → `warranties` → `invoices`

### 예시
```javascript
// ✅ 좋은 예: 원자적 업데이트 + 검증
const [result] = await connection.execute(
    `UPDATE warranties 
     SET status = 'revoked', revoked_at = NOW() 
     WHERE id = ? AND status = 'active'`,
    [warrantyId]
);

if (result.affectedRows !== 1) {
    throw new Error('Warranty 상태 업데이트 실패');
}

// ❌ 나쁜 예: SELECT 후 UPDATE (경쟁 조건 발생 가능)
const [warranty] = await connection.execute(
    'SELECT * FROM warranties WHERE id = ?',
    [warrantyId]
);
if (warranty.status === 'active') {
    await connection.execute(
        'UPDATE warranties SET status = ? WHERE id = ?',
        ['revoked', warrantyId]
    );
}
```

---

## 🚨 에러 처리

### 에러 처리 패턴
1. **try-catch 사용**: 모든 비동기 작업은 try-catch로 감싸기
2. **Logger 사용**: `console.log` 대신 `Logger` 모듈 사용
   ```javascript
   // ✅ 좋은 예
   try {
       const result = await someAsyncOperation();
       Logger.log('작업 성공', { result });
   } catch (error) {
       Logger.error('작업 실패', {
           error: error.message,
           stack: error.stack
       });
       throw error; // 또는 사용자에게 친화적인 메시지
   }
   
   // ❌ 나쁜 예
   someAsyncOperation()
       .then(result => console.log(result))
       .catch(err => console.error(err));
   ```

3. **사용자 메시지**: 사용자에게는 친화적인 메시지 표시
   ```javascript
   // ✅ 좋은 예
   catch (error) {
       Logger.error('서버 오류', { error: error.message });
       alert('서버 오류가 발생했습니다. 나중에 다시 시도해주세요.');
   }
   ```

---

## 📡 API 규칙

### 엔드포인트 네이밍
- **RESTful 스타일**: `/api/products`, `/api/orders`, `/api/auth/me`
- **동사 사용 금지**: `/api/getProducts` ❌ → `/api/products` ✅

### 응답 형식
```javascript
// ✅ 성공 응답
{
    success: true,
    data: { ... },
    message: "작업 완료"
}

// ✅ 에러 응답
{
    success: false,
    error: "에러 메시지",
    code: "ERROR_CODE" // 선택사항
}
```

### 인증
- **JWT 토큰**: httpOnly 쿠키로 자동 전송
- **사용자 정보**: `authenticateToken` 미들웨어 사용
- **관리자 권한**: `requireAdmin` 미들웨어 사용

---

## 🎨 프론트엔드 규칙

### DOM 조작
- **innerHTML 사용 시**: 반드시 `escapeHtml()` 사용
- **이벤트 리스너**: `addEventListener` 사용 (인라인 이벤트 최소화)

### API 호출
```javascript
// ✅ 좋은 예
async function fetchData() {
    try {
        const response = await fetch(`${API_BASE}/endpoint`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // JWT 쿠키 전송
            body: JSON.stringify({ data })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || '요청 실패');
        }
        
        return data;
    } catch (error) {
        Logger.error('API 호출 실패', { error: error.message });
        throw error;
    }
}
```

### 유틸리티 함수
- **`escapeHtml()`**: XSS 방지 (utils.js)
- **`formatPrice()`**: 가격 포맷팅 (utils.js)
- **`getUrlParameter()`**: URL 파라미터 추출 (utils.js)
- **`Logger`**: 로깅 (utils.js)

---

## 🔄 비동기 처리

### async/await 패턴
```javascript
// ✅ 좋은 예
async function processOrder(orderId) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();
        
        // 여러 작업 수행
        await connection.execute('...');
        await connection.execute('...');
        
        await connection.commit();
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        throw error;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// ❌ 나쁜 예: Promise 체이닝
function processOrder(orderId) {
    return mysql.createConnection(dbConfig)
        .then(connection => {
            return connection.beginTransaction()
                .then(() => connection.execute('...'))
                .then(() => connection.execute('...'))
                .then(() => connection.commit());
        });
}
```

### 재시도 로직
```javascript
// ✅ 좋은 예: 재시도 로직
const maxRetries = 3;
const retryDelay = 1000;

for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
        const result = await someOperation();
        return result;
    } catch (error) {
        if (error.code === 'ER_LOCK_WAIT_TIMEOUT' && attempt < maxRetries) {
            const delay = retryDelay * attempt; // 지수 백오프
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
        }
        throw error;
    }
}
```

---

## 📦 의존성 관리

### npm 패키지
- **프로덕션**: `npm ci --omit=dev` 사용
- **개발**: 로컬에서만 `npm install`

### 환경 변수
- **필수 변수**: `.env` 파일에 정의
- **예시**: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `DEPLOY_WEBHOOK_SECRET`

---

## 🚀 배포 규칙

### 배포 스크립트
- **자동 배포**: GitHub webhook → `/api/deploy/webhook` → `deploy.sh`
- **수동 배포**: `/root/prepmood-repo/deploy.sh` 실행

### 배포 전 체크리스트
1. ✅ 코드 리뷰 완료
2. ✅ 로컬 테스트 완료
3. ✅ 환경 변수 확인
4. ✅ 마이그레이션 스크립트 확인

---

## 📚 문서화

### 주석 작성
- **JSDoc 스타일**: 함수 설명, 파라미터, 반환값
- **한국어 허용**: 프로젝트 특성상 한국어 주석 허용

```javascript
/**
 * 사용자 이메일 가져오기 (JWT 기반)
 * 
 * @returns {Promise<string|null>} 사용자 이메일 또는 null
 */
async function getUserEmail() {
    // ...
}
```

### 문서 파일
- **SSOT 문서**: `SCHEMA_SSOT.md`, `SYSTEM_FLOW_DETAILED.md`
- **가이드 문서**: `START_HERE.md`, `AUTO_DEPLOYMENT_GUIDE.md`

---

## ⚠️ 금지 사항

### 절대 하지 말아야 할 것
1. ❌ `var` 사용 금지
2. ❌ `eval()` 사용 금지
3. ❌ `innerHTML`에 사용자 입력 직접 삽입 금지
4. ❌ SQL 쿼리에 문자열 연결 금지 (Prepared statements 사용)
5. ❌ JWT 토큰을 localStorage에 저장 금지
6. ❌ `.env` 파일 커밋 금지
7. ❌ `console.log` 대신 `Logger` 사용
8. ❌ `orders.status`를 직접 정책 판단 기준으로 사용 금지

---

## 🎯 프로젝트 특화 규칙

### Color/Size 표준화
- **Color 표준값**: `Black`, `Navy`, `White`, `Grey`, `Light Blue`, `Light Grey`
- **주의**: `Light Blue`는 띄어쓰기 필수 (붙여쓰기 금지)
- **정규화**: 입력값을 표준값으로 변환하는 함수 사용

### Product ID 형식
- **형식**: `PM-25-SH-Teneu-Solid-LB`
- **슬래시(`/`) 포함 금지**: URL-safe 필수
- **사이즈 제거**: 사이즈는 `stock_units.size`에서 관리

### 주문 처리 흐름
1. `paid_events` 생성 (결제 증거)
2. `processPaidOrder()` 실행
3. `order_item_units` 생성
4. `warranties` 생성
5. `invoices` 생성

---

## 💡 코딩 팁

### 코드 작성 시 고려사항
1. **SSOT 원칙**: 단일 진실 원천을 항상 확인
2. **원자성**: 상태 변경은 원자적으로 수행
3. **에러 처리**: 모든 비동기 작업은 try-catch로 감싸기
4. **로깅**: 중요한 작업은 Logger로 기록
5. **검증**: 사용자 입력은 항상 검증 및 이스케이프

### 디버깅
- **Logger 사용**: `Logger.log()`, `Logger.error()`, `Logger.warn()`
- **PM2 로그**: `pm2 logs prepmood-backend`
- **배포 로그**: `/var/www/html/backend/deploy-run.log`

---

이 규칙들을 따르면 프로젝트의 일관성과 품질을 유지할 수 있습니다.
