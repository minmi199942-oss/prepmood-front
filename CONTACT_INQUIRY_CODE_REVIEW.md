# 고객 문의하기 서비스 설계안 코드베이스 검토

## ✅ 검토 결과 요약

**전체 평가: 대부분 옳은 지적입니다. 다만 일부는 현재 코드베이스와 일치합니다.**

---

## 1. 이름 매핑 split(' ') 문제

### ❌ **아니다 - 맞는 말입니다**

**현재 코드 상태:**
```javascript
// backend/index.js:1179
name: `${user.last_name} ${user.first_name}`.trim(),
```

**문제점:**
- 한국식 이름은 공백이 없을 수 있음 (예: "홍길동")
- 영문/한글/복합이름/닉네임까지 섞이면 split이 깨짐
- 자동 채움이 "가끔 이상하게 들어가는 문제" 발생 가능

**현재 DB 구조:**
- `last_name` (성), `first_name` (이름) - 분리되어 저장됨

**권장 해결 방안:**

#### 방법 1: `/api/auth/me-optional` 추가 (가장 깔끔)

**⚠️ 중요: 토큰 발급부 확인 완료**
- `backend/index.js:538-542`: `generateToken({ id: user.user_id, ... })`
- `backend/auth-middleware.js:128`: JWT payload에 `userId: user.id` 저장
- `backend/auth-middleware.js:48`: `req.user = { userId: decoded.userId, ... }`
- **결론: `req.user.userId`는 `users.user_id`와 동일함 ✅**

```javascript
// backend/index.js에 추가
app.get('/api/auth/me-optional', optionalAuth, async (req, res) => {
  if (!req.user) {
    return res.json({ success: true, user: null });
  }
  
  try {
    const connection = await mysql.createConnection(dbConfig);
    const [users] = await connection.execute(
      'SELECT user_id, email, last_name, first_name, phone, birth FROM users WHERE user_id = ?',
      [req.user.userId] // ✅ req.user.userId = users.user_id (토큰 발급부 확인 완료)
    );
    connection.end();

    if (users.length === 0) {
      return res.json({ success: true, user: null });
    }

    const user = users[0];
    res.json({
      success: true,
      user: {
        userId: user.user_id,
        email: user.email,
        last_name: user.last_name,  // ✅ 분리해서 반환
        first_name: user.first_name, // ✅ 분리해서 반환
        phone: user.phone || null,
        birthdate: user.birth || null
      }
    });
  } catch (error) {
    console.error('사용자 정보 조회 오류:', error);
    res.json({ success: true, user: null }); // 에러 시 null 반환
  }
});
```

#### 방법 2: 기존 `/api/auth/me`에 필드 추가 (하위호환 유지)
```javascript
// backend/index.js:1174 수정
res.json({
  success: true,
  user: {
    userId: user.user_id,
    email: user.email,
    name: `${user.last_name} ${user.first_name}`.trim(), // 기존 유지
    last_name: user.last_name,  // ✅ 추가
    first_name: user.first_name, // ✅ 추가
    phone: user.phone || null,
    birthdate: user.birth || null
  }
});
```

**프론트엔드 (contact.js):**
```javascript
async function tryAutofillFromLogin() {
  try {
    const res = await fetch('/api/auth/me-optional', {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json' },
    });
    
    if (!res.ok) return;
    
    const data = await res.json();
    if (data.success && data.user) {
      // ✅ 서버에서 분리해서 내려주므로 split 불필요
      els.lastName.value = data.user.last_name || '';
      els.firstName.value = data.user.first_name || '';
      els.email.value = data.user.email || '';
      
      // 전화번호 처리 (countryCode + phone 분리)
      if (data.user.phone) {
        const phoneMatch = data.user.phone.match(/^(\+\d{1,3})[- ]?(.+)$/);
        if (phoneMatch) {
          els.countryCode.value = phoneMatch[1];
          els.phone.value = phoneMatch[2].replace(/[^0-9]/g, '');
        }
      }
    }
  } catch (_) {
    // 무시
  }
}
```

---

## 2. CSRF 헤더명 통일

### ⚠️ **위험 요소가 있습니다 - 부분적으로 맞습니다**

**현재 코드 상태:**
```javascript
// backend/csrf-middleware.js:99
const headerToken = req.get('X-XSRF-TOKEN') || req.headers['x-xsrf-token'];
```

**현재 상태:**
- 대소문자 둘 다 체크하고 있어서 동작은 함
- 하지만 표준 헤더명은 `X-XSRF-TOKEN` (대문자)

**권장:**
- 프론트엔드/관리자 페이지/문의 API 모두 `X-XSRF-TOKEN` (대문자)로 통일
- 서버는 현재처럼 fallback 유지해도 되지만, 표준은 대문자 사용

**수정 필요:**
```javascript
// contact.js, admin-inquiries.js 등 모든 프론트엔드
headers: {
  'Content-Type': 'application/json',
  'X-XSRF-TOKEN': getCSRFToken(), // ✅ 서버 표준과 일치 (모두 대문자)
}
```

**서버는 현재 상태 유지 (fallback 포함):**
```javascript
// backend/csrf-middleware.js - 현재 상태 유지
const headerToken = req.get('X-XSRF-TOKEN') || req.headers['x-xsrf-token'];
```

---

## 3. Rate Limit keyGenerator의 userId 키 이름

### ✅ **맞습니다 - 현재 코드와 일치합니다**

**현재 코드 상태:**
```javascript
// backend/auth-middleware.js:47-51
req.user = {
  userId: decoded.userId,  // ✅ userId 사용
  email: decoded.email,
  name: decoded.name
};

// backend/order-routes.js:296
if (req.user && req.user.userId) {
  return `user:${req.user.userId}`;
}
```

**검증 결과:**
- `req.user.userId`가 정확한 키 이름입니다
- JWT payload도 `userId`를 사용 (auth-middleware.js:48)
- `optionalAuth`도 동일한 구조 (auth-middleware.js:104-108)

**문의하기 rate limit 설정:**
```javascript
// backend/inquiry-routes.js
const inquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: '너무 많은 문의 요청이 있습니다. 잠시 후 다시 시도해주세요.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // ✅ req.user.userId가 정확한 키 이름
    if (req.user && req.user.userId) {
      return `inquiry:user:${req.user.userId}`;
    }
    // 비로그인은 IP 기준
    return ipKeyGenerator(req.ip || '');
  }
});
```

**결론: 설계안의 `req.user?.userId`는 정확합니다.**

**추가 확인: Trust Proxy 설정**
- `backend/index.js:26`: `app.set('trust proxy', 'loopback');` ✅ 이미 설정됨
- `ipKeyGenerator`는 express-rate-limit 표준 함수로, trust proxy 설정을 고려함
- Cloudflare 환경에서도 정상 동작함

---

## 4. 접수번호 생성 규칙

### ✅ **옳다 - 경쟁조건 문제는 맞습니다**

**권장 방법 1: DB id 기반 (가장 안전) - 트랜잭션 필수**

**⚠️ 중요: INSERT 후 UPDATE는 트랜잭션으로 묶어야 함**

```javascript
// backend/inquiry-routes.js
async function generateInquiryNumber(inquiryId) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  // id를 6자리로 패딩 (예: 123 -> 000123)
  const paddedId = String(inquiryId).padStart(6, '0');
  return `INQ-${date}-${paddedId}`;
}

// ✅ 트랜잭션으로 INSERT + UPDATE 묶기
await connection.beginTransaction();
try {
  // 1. INSERT
  const [result] = await connection.execute(
    'INSERT INTO inquiries (...) VALUES (...)',
    [...]
  );
  const inquiryId = result.insertId;

  // 2. inquiry_number 업데이트 (같은 트랜잭션 내)
  const inquiryNumber = generateInquiryNumber(inquiryId);
  await connection.execute(
    'UPDATE inquiries SET inquiry_number = ? WHERE id = ?',
    [inquiryNumber, inquiryId]
  );

  await connection.commit();
  
  // inquiry_number 반환
  return { inquiryId, inquiryNumber };
} catch (error) {
  await connection.rollback();
  throw error;
}
```

**또는 inquiry_number를 NULL 허용하고 fallback 처리:**
```sql
-- DB 스키마
inquiry_number VARCHAR(20) NULL, -- NULL 허용

-- 관리자 화면에서 fallback
${inquiry.inquiry_number || `INQ-${inquiry.id}`}
```

**권장 방법 2: 트랜잭션 기반 daily_sequence (더 복잡하지만 포맷 깔끔)**
```sql
-- daily_sequence 테이블 생성
CREATE TABLE daily_sequence (
  date DATE PRIMARY KEY,
  sequence INT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

```javascript
async function generateInquiryNumber(connection) {
  const date = new Date().toISOString().slice(0, 10);
  
  // 트랜잭션으로 sequence 증가
  await connection.beginTransaction();
  try {
    const [rows] = await connection.execute(
      'INSERT INTO daily_sequence (date, sequence) VALUES (?, 1) ON DUPLICATE KEY UPDATE sequence = sequence + 1',
      [date]
    );
    
    const [seqRows] = await connection.execute(
      'SELECT sequence FROM daily_sequence WHERE date = ?',
      [date]
    );
    
    const sequence = seqRows[0].sequence;
    const paddedSeq = String(sequence).padStart(3, '0');
    
    await connection.commit();
    return `INQ-${date.replace(/-/g, '')}-${paddedSeq}`;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}
```

**추천: 방법 1 (id 기반) - 더 간단하고 안전**

---

## 5. 검색/필터 성능

### ✅ **옳다 - LIKE 검색 성능 문제는 맞습니다**

**권장:**
```sql
-- 인덱스 추가
CREATE INDEX idx_inquiries_email ON inquiries(email);
CREATE INDEX idx_inquiries_inquiry_number ON inquiries(inquiry_number);
CREATE INDEX idx_inquiries_name ON inquiries(last_name, first_name);

-- 검색 쿼리 (초기엔 이 정도만)
SELECT * FROM inquiries 
WHERE 
  (email LIKE ? OR inquiry_number LIKE ? OR CONCAT(last_name, first_name) LIKE ?)
  AND status = ?
  AND category = ?
LIMIT ? OFFSET ?;
```

**전화번호 검색:**
- 저장 시 숫자만 저장 (예: `01012345678`)
- 검색 시에도 숫자만 추출해서 검색

---

## 6. XSS 처리 일관성

### ✅ **옳다 - 관리자 답변도 escape 필요**

**현재 설계안 확인:**
- `detailMessage`는 `textContent` 사용 → ✅ 안전
- `reply-content`는 `innerHTML` 사용 시 `escapeHtml` 필요

**수정 필요:**
```javascript
// admin-inquiries.js - loadReplyHistory 함수
elements.replyHistory.innerHTML = replies.map(reply => `
  <div class="reply-item">
    <div class="reply-header">
      <strong>${escapeHtml(reply.admin_name || '관리자')}</strong>
      <span class="reply-date">${escapeHtml(new Date(reply.created_at).toLocaleString('ko-KR'))}</span>
    </div>
    <div class="reply-content">${escapeHtml(reply.message)}</div> <!-- ✅ escapeHtml 추가 -->
  </div>
`).join('');
```

**escapeHtml 함수 추가:**
```javascript
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
```

---

## 7. 개인정보 동의 체크박스 UX

### ✅ **옳다 - 문구가 길어서 UX 문제 가능**

**권장 UX:**
```html
<div class="consent">
  <label class="check">
    <input id="privacyConsent" type="checkbox" required />
    <span>
      개인정보 수집·이용에 동의합니다.
      <button type="button" class="consent-detail-btn" onclick="toggleConsentDetail('privacy')">
        자세히 보기
      </button>
    </span>
  </label>
  <div id="privacyDetail" class="consent-detail" style="display: none;">
    본 문의 서비스 이용을 위해 필요한 최소한의 개인정보를 수집·이용합니다.
    수집된 정보는 고객 식별 및 문의 처리 목적으로만 사용되며, 관련 법령에 따라 3년간 보관됩니다.
    개인정보 수집·이용에 동의하지 않으실 경우, 본 서비스 이용이 제한될 수 있습니다.
  </div>
  
  <label class="check">
    <input id="ageConsent" type="checkbox" required />
    <span>본인은 만 14세 이상임을 확인합니다.</span>
  </label>
</div>
```

---

## 8. 관리자 페이지 설계 검토

### ✅ **옳다 - 대부분 적절합니다**

#### 8.1 고객명 표시 순서

**현재 설계안:**
```javascript
${escapeHtml(inquiry.first_name)} ${escapeHtml(inquiry.last_name)}
```

**권장:**
```javascript
// 한국식: 성 + 이름
${escapeHtml(inquiry.last_name)} ${escapeHtml(inquiry.first_name)}
```

#### 8.2 openInquiryDetail 전역 노출

**현재 설계안:**
```javascript
window.openInquiryDetail = openInquiryDetail;
```

**권장 (이벤트 위임):**
```javascript
// HTML에서 onclick 제거
// JavaScript에서 이벤트 위임
elements.inquiriesTableBody.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-view-detail');
  if (btn) {
    const inquiryId = btn.dataset.inquiryId;
    openInquiryDetail(parseInt(inquiryId));
  }
});
```

#### 8.3 임시 저장 버튼

**현재 설계안:**
- UI에 `saveDraftBtn` 있음
- 백엔드/DB에 draft 개념 없음

**권장:**
1. **버튼 제거** (가장 간단)
2. **inquiry_replies에 draft 플래그 추가** (복잡하지만 유용)
3. **admin_memo에 임시저장** (비추천 - 메모와 답변이 섞임)

**추천: 버튼 제거**

---

## 9. 관리자 답변 발송 시 자동 처리

### ✅ **옳다 - 운영 품질 향상에 필수**

**권장 흐름: 트랜잭션 경계 조정 (A안 추천)**

**⚠️ 중요: 이메일 발송은 외부 I/O라서 트랜잭션을 오래 잡아먹을 수 있음**

**A안: DB 트랜잭션은 빠르게 커밋 → 이메일은 별도 처리 (권장)**
```javascript
// backend/inquiry-routes.js
router.post('/admin/inquiries/:id/reply', authenticateToken, requireAdmin, verifyCSRF, async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;
  const adminUserId = req.user.userId;
  
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    
    // 1. 고객 정보 조회 (트랜잭션 전)
    const [inquiryRows] = await connection.execute(
      'SELECT email, first_name, last_name FROM inquiries WHERE id = ?',
      [id]
    );
    if (inquiryRows.length === 0) {
      return res.status(404).json({ success: false, error: '문의를 찾을 수 없습니다.' });
    }
    const inquiry = inquiryRows[0];
    
    // 2. DB 트랜잭션: 답변 저장 + 상태 변경 + email_status=pending
    await connection.beginTransaction();
    try {
      // 2-1. inquiry_replies 저장
      const [replyResult] = await connection.execute(
        'INSERT INTO inquiry_replies (inquiry_id, admin_user_id, message, email_status) VALUES (?, ?, ?, ?)',
        [id, adminUserId, message, 'pending']
      );
      const replyId = replyResult.insertId;
      
      // 2-2. inquiries.status를 answered로 자동 변경
      await connection.execute(
        'UPDATE inquiries SET status = "answered", updated_at = NOW() WHERE id = ?',
        [id]
      );
      
      await connection.commit();
      
      // 3. 이메일 발송 (트랜잭션 외부 - 비동기 처리 가능)
      let emailStatus = 'sent';
      let emailError = null;
      
      try {
        await sendInquiryReplyEmail(inquiry.email, {
          customerName: `${inquiry.last_name} ${inquiry.first_name}`,
          replyMessage: message
        });
      } catch (emailErr) {
        emailStatus = 'failed';
        emailError = emailErr.message;
      }
      
      // 4. 이메일 발송 결과 기록 (별도 트랜잭션)
      await connection.execute(
        'UPDATE inquiry_replies SET email_status = ?, email_error = ? WHERE id = ?',
        [emailStatus, emailError, replyId]
      );
      
      res.json({
        success: true,
        replyId: replyId,
        emailStatus: emailStatus
      });
      
    } catch (error) {
      await connection.rollback();
      throw error;
    }
    
  } catch (error) {
    console.error('답변 저장 오류:', error);
    res.status(500).json({
      success: false,
      error: '답변 저장 중 오류가 발생했습니다.'
    });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
});
```

**B안: 한 트랜잭션에 모두 포함 (간단하지만 락 지연 가능)**
```javascript
// 위의 원래 코드와 동일하지만, 이메일 실패 시에도 답변은 저장됨을 명확히
// (이미 위 코드에 포함됨)
```

**DB 스키마 추가:**
```sql
ALTER TABLE inquiry_replies 
ADD COLUMN email_status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
ADD COLUMN email_error TEXT NULL;
```

---

## 📋 최종 수정 사항 요약

### 반드시 수정 필요 (2개)

1. ✅ **이름 매핑**: `/api/auth/me-optional` 추가 또는 `/api/auth/me`에 `last_name`/`first_name` 필드 추가
   - **확인 완료**: `req.user.userId` = `users.user_id` (토큰 발급부 확인)
2. ✅ **CSRF 헤더명**: 프론트엔드에서 `X-XSRF-TOKEN` (모두 대문자)로 통일
   - **수정**: 문서 예시 코드가 `X-XSRF-Token`으로 섞여있었음 → `X-XSRF-TOKEN`으로 수정 필요

### 권장 수정 사항

3. ✅ **Rate Limit**: `req.user.userId` 사용 (현재 코드와 일치 - 수정 불필요)
   - **확인 완료**: Trust proxy 설정됨 (`app.set('trust proxy', 'loopback')`)
   - `ipKeyGenerator`는 Cloudflare 환경 고려됨

4. ✅ **접수번호 생성**: DB id 기반으로 변경 + **트랜잭션으로 INSERT+UPDATE 묶기**
   - **수정**: INSERT 후 UPDATE를 트랜잭션으로 묶어야 inquiry_number 누락 방지

5. ✅ **검색 성능**: 인덱스 추가 및 검색 대상 제한

6. ✅ **XSS 처리**: 관리자 답변도 `escapeHtml` 적용

7. ✅ **개인정보 동의 UX**: 접기/펼치기 추가

8. ✅ **고객명 표시**: `last_name first_name` 순서로 변경

9. ✅ **임시 저장 버튼**: **제거 권장** (draft 기능 없음)

10. ✅ **답변 발송 자동 처리**: status 변경 + 이메일 로그 기록
    - **수정**: 트랜잭션 경계 조정 (A안: DB 커밋 후 이메일 발송)

---

## ✅ 최종 평가

**검토 결과: 대부분 옳은 지적입니다.**

### 수정 완료 사항

1. ✅ **이름 매핑**: 토큰 발급부 확인 완료 - `req.user.userId` = `users.user_id` ✅
   - `backend/index.js:538-542`: `generateToken({ id: user.user_id, ... })`
   - `backend/auth-middleware.js:128`: JWT payload에 `userId: user.id` 저장
   - **결론**: `/api/auth/me-optional`에서 `req.user.userId`로 `users.user_id` 조회 가능 ✅

2. ✅ **CSRF 헤더명**: 문서 예시 코드 수정 완료 - `X-XSRF-TOKEN` (모두 대문자)로 통일
   - 서버 표준: `req.get('X-XSRF-TOKEN')` (대문자)
   - 프론트엔드도 `'X-XSRF-TOKEN'` 사용 (수정 완료)

3. ✅ **Rate Limit**: Trust proxy 설정 확인 완료 - Cloudflare 환경 고려됨 ✅
   - `backend/index.js:26`: `app.set('trust proxy', 'loopback');` ✅
   - `ipKeyGenerator`는 express-rate-limit 표준 함수로 proxy 고려됨

4. ✅ **접수번호 생성**: 트랜잭션으로 INSERT+UPDATE 묶기 추가
   - inquiry_number 누락 방지

5. ✅ **답변 발송**: 트랜잭션 경계 조정 (A안: DB 커밋 후 이메일 발송)
   - 락/지연 최소화

6. ✅ **임시 저장 버튼**: 제거 권장 명시

### 최종 결론

**설계안은 구현 준비 완료 상태입니다.**

다만 다음 2가지는 문서 수정 완료:
1. ✅ CSRF 헤더명 예시 코드: `X-XSRF-TOKEN` (모두 대문자)
2. ✅ 토큰 발급부 확인: `req.user.userId` = `users.user_id` 확인 완료

나머지는 모두 현재 코드베이스와 일치하거나 권장 사항으로 반영 완료.

