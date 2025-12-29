# 핵심 운영 정책 (Core Policies)

> **중요**: 이 문서는 "나중에 바꾸기 비싼 제약"을 정의합니다.  
> 기능 구현 전에 반드시 확인하고, 변경 시 팀 전체 합의가 필요합니다.

---

## 1. 시간 정책 (Time Policy)

### 1.1 저장 기준
**정책**: 모든 DATETIME은 **UTC 기준**으로 저장합니다.

**근거**:
- 해외 확장 시 타임존 불일치 방지
- 데이터 일관성 보장
- API 응답 표준화 용이

### 1.2 생성 책임
**정책**: 모든 DATETIME 필드(`created_at`, `verified_at` 등)는 **앱 레벨에서 명시적으로 생성**합니다.

**근거**:
- DB 세션 타임존 의존성 완전 제거
- 생성 시점 명확화
- 테스트 용이성
- 타임존 정책 일관성 보장

**구현 규칙**:
- `DEFAULT CURRENT_TIMESTAMP` 사용 금지
- 모든 DATETIME 필드는 `NOT NULL`로 정의하고 앱에서 값 제공
- 앱에서 생성 시: `new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')` (UTC, 초 단위)

**스키마 예시**:
```sql
CREATE TABLE warranties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(20) NOT NULL UNIQUE,
    verified_at DATETIME NOT NULL,  -- ✅ 앱에서 UTC로 넣음
    created_at DATETIME NOT NULL,   -- ✅ 앱에서 UTC로 넣음 (DEFAULT 제거)
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);
```

**mysql2 옵션**:
- UTC 정책 준수를 위해 필요 시 `timezone: 'Z'` 또는 `dateStrings: true` 옵션 추가
- 현재는 한국 서비스만 운영 중이므로 선택 사항
- **검증 기준**: DB에 저장된 값과 API 응답이 동일한 UTC 기준으로 왕복(round-trip)되며, KST 환경/UTC 환경에서 동일 결과를 보장해야 함
- 검증 실패 시 mysql2 옵션 추가 필요

**DB 입력 포맷 규칙**:
- DB INSERT 시 DATETIME은 **'YYYY-MM-DD HH:MM:SS' 형식**으로 넣는다 (UTC 기준)
- API로 나갈 때만 ISO8601(Z) 형식으로 변환한다
- MySQL DATETIME은 타임존 개념이 없고, ISO8601(Z) 형식을 직접 받지 않음
- 예시: `'2025-01-15 01:30:00'` (DB 입력) → `'2025-01-15T01:30:00Z'` (API 응답)

### 1.3 API 응답 형식
**정책**: 모든 시간 필드는 **ISO 8601 형식 (Z 포함, 초 단위)**로 응답합니다.

**형식**: `YYYY-MM-DDTHH:MM:SSZ` (예: `2025-01-15T01:30:00Z`)

**근거**:
- 국제 표준 준수
- 프론트엔드 파싱 일관성
- 타임존 명확성

**현재 구현**:
```javascript
// ✅ 권장
res.json({
    verified_at: '2025-01-15T01:30:00Z'  // ISO 8601, Z 포함
});

// ❌ 비권장
res.json({
    verified_at: '2025-01-15 01:30:00'  // 타임존 불명확
});
```

---

## 2. 토큰 보안 정책 (Token Security Policy)

### 2.1 로그 마스킹 원칙
**정책**: 토큰 전문은 **절대 로그에 남기지 않습니다**.

**현재 구현**:
```javascript
// ✅ 권장
Logger.log('[AUTH] 정품 인증 요청:', token.substring(0, 4) + '...');

// ❌ 금지
Logger.log('[AUTH] 정품 인증 요청:', token);  // 전문 노출
```

### 2.2 에러 객체/요청 덤프 금지
**정책**: 에러 객체나 요청 전체를 로그에 남기지 않습니다. 필요한 경우 allowlist로 안전한 필드만 로깅합니다.

**근거**:
- 에러 객체에 토큰이 포함될 수 있음 (예: `error.config.headers.Authorization`)
- 요청 본문에 토큰이 포함될 수 있음
- 운영 디버깅을 위해 안전한 필드만 선별 로깅

**구현 규칙**:
```javascript
// ✅ 권장: 안전한 필드만 allowlist로 로깅
catch (error) {
    Logger.error('[AUTH] 정품 인증 실패:', {
        message: error.message,
        code: error.code,
        // error 객체 전체는 전달하지 않음
    });
}

// ✅ 권장: 요청 정보는 안전한 필드만
Logger.log('[AUTH] 요청:', {
    ip: req.ip,
    route: req.path,
    method: req.method,
    user_id: req.user?.userId,  // 안전한 필드만
    // req.body 전체는 금지
});

// ❌ 금지: 전체 덤프
catch (error) {
    Logger.error('[AUTH] 정품 인증 실패:', error);  // error 객체 전체
    Logger.error('[AUTH] 요청:', req);  // 요청 전체
    Logger.error('[AUTH] 요청 본문:', JSON.stringify(req.body));  // 본문 전체
}
```

**안전한 필드 예시**:
- `ip`, `route`, `method`, `user_id`, `token_prefix`, `result_code`
- `token_prefix`는 앞 4자리로 고정하며, 그 외 토큰 관련 정보는 로깅 금지
- 민감 정보(토큰 전문, 비밀번호, 개인정보)는 제외

### 2.3 토큰 형식
**정책**: 토큰은 **20자 영숫자**로 고정되며, **대소문자를 구분**합니다.

**현재 구현**:
- 정규식: `/^[a-zA-Z0-9]{20}$/` (대소문자 모두 허용)
- DB 컬럼: `VARCHAR(20)`
- 토큰 생성: 대소문자 혼합 (예: `aB3cD5eF7gH9iJ1kL3mN5`)

**대소문자 정책**:
- 입력된 토큰은 대소문자 그대로 저장/검증
- 정규화(대문자 변환 등) 없음
- 이미 발급된 토큰과의 호환성 유지

**입력 UX 정책**:
- 토큰은 대소문자를 구분하므로, 수동 입력 UI는 원칙적으로 제공하지 않거나(가능하면 QR만), 제공 시 대소문자 정확 입력을 안내한다
- 현재 구현: QR 스캔과 수동 입력 모두 지원 (수동 입력 시 대소문자 정확 입력 안내 필요)

**변경 시**: 마이그레이션 필요 (데이터 무결성 영향)

---

## 3. 데이터 무결성 제약 (Data Integrity Constraints)

### 3.1 토큰 소유권 정책
**정책**: **1 token = 1 owner** (최초 인증자 고정). 소유권 이전은 별도 정책/절차가 도입되기 전까지 금지됩니다.

**근거**:
- 디지털 보증서의 소유권 명확화
- 정품 보증의 의미 유지
- 운영 일관성 보장

**구현 예시** (향후 `warranties` 테이블):
```sql
CREATE TABLE warranties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(20) NOT NULL UNIQUE,  -- ✅ UNIQUE 제약으로 1 token = 1 owner 강제
    verified_at DATETIME NOT NULL,      -- ✅ 앱에서 UTC로 넣음 ('YYYY-MM-DD HH:MM:SS' 형식)
    created_at DATETIME NOT NULL,       -- ✅ 앱에서 UTC로 넣음 (DEFAULT 제거)
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_user_id (user_id)  -- ✅ 사용자별 보증서 조회 최적화
);
```

**사용자-보증서 관계**:
- 사용자는 여러 개의 토큰(보증서)을 소유할 수 있다 (1:N 관계)
- `user_id`에 UNIQUE 제약 없음 → 한 사용자가 여러 보증서 보유 가능
- 비즈니스 정책: 사용자가 여러 제품을 구매/인증할 수 있음

**소유권 이전 정책**:
- 기본: 1 token = 1 owner (UNIQUE 제약으로 강제)
- **고객 셀프서비스 금지**: 고객이 직접 이전/삭제할 수 없음
- **관리자 수동 처리만 허용**: 고객 문의를 통해 관리자가 수동으로 처리
- 근거: 보안 및 데이터 무결성 보장, 부정 사용 방지

**삭제 정책**:
- `ON DELETE RESTRICT`: 사용자 삭제 시 보증서가 있으면 삭제 불가
- 근거: 보증서는 중요한 기록이므로 사용자 삭제와 분리
- **운영 정책**: 
  - 계정 삭제는 물리 삭제가 아니라 비활성화(soft delete)를 기본으로 하며, 보증서 기록은 유지
  - 보증서 삭제 요청 시: 원칙적으로 soft delete + 이력 보존 (물리 삭제는 특수한 경우만)
- 현재 구현: 계정 삭제 기능 없음 (향후 구현 시 soft delete 적용)

### 3.2 토큰 길이/형식 고정
**정책**: 토큰은 **VARCHAR(20)**로 고정됩니다.

**변경 시**: 마이그레이션 필요 (기존 데이터 영향)

### 3.3 보증서 삭제 정책
**정책**: 보증서는 **사용자 삭제와 독립적**으로 관리됩니다.

**구현**: `FOREIGN KEY ... ON DELETE RESTRICT`

**근거**:
- 보증서는 중요한 법적/상업적 기록
- 사용자 계정 삭제와 보증서 기록은 분리 관리

### 3.4 FK 제약조건 케이스별 규칙

**정책**: 외래 키 제약조건의 `ON DELETE` 동작은 데이터 보존 필요성에 따라 결정됩니다.

| 테이블 | FK 대상 | ON DELETE | 이유 |
|--------|---------|-----------|------|
| `warranty_events` | `warranties` | `RESTRICT` | 이력 보존 필수 (보증서 삭제 시 이벤트도 함께 삭제되면 안 됨) |
| `warranty_events` | `inquiries` | `SET NULL` | 문의 삭제 시 이력은 남기되 참조만 끊음 (이벤트는 보존) |
| `inquiries` | `warranties` | `SET NULL` | 보증서 무효화 시 문의는 남기되 참조만 끊음 (문의 기록 보존) |
| `warranties` | `users` | `RESTRICT` | 사용자 삭제 시 보증서가 있으면 삭제 불가 (보증서 보존) |

**근거**:
- **RESTRICT**: 중요한 데이터 보존이 필수인 경우 (보증서, 이벤트 이력)
- **SET NULL**: 참조는 끊되 이력은 보존해야 하는 경우 (문의-보증서 관계)
- **CASCADE**: 사용하지 않음 (데이터 손실 위험)

---

## 4. 마이그레이션 정책 (Migration Policy)

### 4.1 마이그레이션 파일 불변성 (Immutable Migrations)

**정책**: 이미 실행된 마이그레이션 파일은 **절대 수정할 수 없습니다**.

**근거**:
- `run-migration.js`는 `file_hash`를 사용하여 파일 변경을 감지합니다
- 이미 `success` 상태로 기록된 마이그레이션 파일이 변경되면 `fail-fast` (종료 코드 2)로 실행이 중단됩니다
- 마이그레이션 이력의 무결성 보장

**구현 규칙**:
- 마이그레이션 파일 수정이 필요하면 **새 번호의 마이그레이션 파일**을 생성합니다
- 예: `001_create_warranties_table.sql` 수정 필요 → `002_fix_warranties_fk.sql` 생성

### 4.2 실패한 마이그레이션 처리

**정책**: `failed` 상태로 기록된 마이그레이션은 **재실행 가능**하지만, **원칙적으로 재실행하지 않습니다**.

**근거**:
- `run-migration.js`는 `failed` 상태 마이그레이션을 재실행 허용하지만, 이는 기술적 허용일 뿐입니다
- 실패 원인을 분석하고 **새 마이그레이션 파일로 해결**하는 것이 안전합니다
- 실패 기록은 감사 로그로 보존됩니다

**구현 규칙**:
- 실패한 마이그레이션은 그대로 두고, 새 마이그레이션 파일로 문제를 해결합니다
- 예: `001_create_warranties_table.sql` 실패 (FK 오류) → `002_fix_warranties_fk.sql` 생성

**특별 케이스: `001_create_warranties_table.sql`**
- **재실행 금지**: 이 파일은 `users(id)` 참조 오류로 실패했으며, `002_fix_warranties_fk.sql`로 해결되었습니다
- `001`을 재실행하면 동일한 오류가 발생하며, `002`와 충돌할 수 있습니다
- **운영 정책**: `001_create_warranties_table.sql`은 **절대 재실행하지 않습니다**

### 4.3 마이그레이션 실행 절차

**정책**: 마이그레이션은 `backend/run-migration.js`를 통해서만 실행합니다.

**사용법**:
```bash
cd /var/www/html/backend
node run-migration.js migrations/XXX_description.sql
```

**안전장치**:
- `migrations/` 디렉토리 밖의 파일 실행 차단
- `schema_migrations` 테이블로 실행 이력 기록
- 중복 실행 방지 (file_hash 불일치 시 fail-fast)
- 동시 실행 경합 처리

---

## 5. 정책 변경 절차

### 4.1 변경 시 고려사항
1. **기존 데이터 영향도**: 마이그레이션 필요 여부
2. **API 호환성**: 클라이언트 영향도
3. **보안 영향도**: 보안 정책 변경 시 재검토 필요

### 4.2 변경 승인
- 핵심 정책 변경 시: 팀 전체 합의 필요
- 문서 업데이트: 변경 즉시 반영

---

## 6. 현재 상태 체크리스트

### ✅ 확정된 정책
- [x] 시간 정책: UTC 저장, ISO 8601 응답
- [x] 토큰 보안: 전문 로그 금지, 마스킹 필수
- [x] 토큰 형식: 20자 영숫자 고정
- [x] 토큰 소유권: 1 token = 1 owner (UNIQUE 제약)

### ⏳ 향후 구현 예정
- [x] `warranties` 테이블 생성 (위 정책 반영) ✅ 2025-12-29 완료
- [ ] `formatDateTimeToISO()` 유틸 함수 (ISO 8601 변환)
- [ ] mysql2 `timezone: 'Z'` 또는 `dateStrings: true` 옵션 추가 (UTC 정책 준수 검증 후 필요 시)

### 📝 참고
- 이 문서는 "기능 구현"이 아닌 "정책 확정"입니다.
- 기능 구현은 실제 필요 시점에 진행합니다.
- 정책 변경은 팀 전체 합의가 필요합니다.

