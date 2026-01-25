# 코드베이스 스키마 일관성 감사 보고서

## 목적
SSOT 문서(`SCHEMA_SSOT.md`, `db_structure_actual.txt`)와 실제 코드 간의 불일치를 확인하고 수정

---

## 발견된 문제점

### 1. ⚠️ CRITICAL: `admin-cli.js`에서 `warranties.user_id` 사용

**위치**: `backend/admin-cli.js`

**문제**:
- 마이그레이션 028에서 `user_id` → `owner_user_id`로 변경되었지만, `admin-cli.js`에서 여전히 `user_id` 사용
- 실제 테이블에는 `owner_user_id`만 존재함

**영향받는 코드** (모두 수정 완료):
1. ✅ **186줄**: `SELECT public_id, owner_user_id FROM warranties WHERE token = ?`
2. ✅ **196줄**: `if (warranty.owner_user_id !== fromUser.user_id)`
3. ✅ **217줄**: `warranties.owner_user_id: ${fromUser.user_id} → ${toUser.user_id}`
4. ✅ **236줄**: `UPDATE warranties SET owner_user_id = ? WHERE token = ? AND owner_user_id = ?`
5. ✅ **583줄**: `SELECT public_id, owner_user_id FROM warranties WHERE token = ?`
6. ✅ **802줄**: `if (info.warranty.owner_user_id)` (lookupToken 결과 사용 부분)

**수정 완료**:
```javascript
// 수정 전
SELECT public_id, user_id FROM warranties WHERE token = ?
UPDATE warranties SET user_id = ? WHERE token = ? AND user_id = ?

// 수정 후
SELECT public_id, owner_user_id FROM warranties WHERE token = ?
UPDATE warranties SET owner_user_id = ? WHERE token = ? AND owner_user_id = ?
```

---

### 2. ⚠️ CRITICAL: `migrate-sqlite-to-mysql.js`에서 `warranties.user_id` 사용

**위치**: `backend/migrate-sqlite-to-mysql.js`

**문제**:
- 66줄: `SELECT token, user_id FROM warranties WHERE token IS NOT NULL`
- 마이그레이션 스크립트이지만 현재 스키마와 불일치

**수정 완료**:
```javascript
// 수정 전
SELECT token, user_id FROM warranties WHERE token IS NOT NULL

// 수정 후
SELECT token, owner_user_id FROM warranties WHERE token IS NOT NULL
```

---

### 3. ✅ 이미 수정됨: `backend/auth-routes.js`

**위치**: `backend/auth-routes.js` 861줄

**상태**: ✅ 수정 완료
- `WHERE public_id = ? AND user_id = ?` → `WHERE public_id = ? AND owner_user_id = ?`

---

## 스키마 변경 히스토리

### 마이그레이션 028: `user_id` → `owner_user_id` 변경

**파일**: `backend/migrations/028_add_warranties_columns.sql`

**변경 내용**:
```sql
ALTER TABLE warranties
CHANGE COLUMN user_id owner_user_id INT NULL
COMMENT '보증서 소유자 (NULL이면 issued_unassigned)';
```

**이유**:
- 비회원 주문 지원 (NULL 허용)
- `issued_unassigned` 상태 지원

---

## 현재 테이블 구조 (SSOT)

**파일**: `backend/scripts/db_structure_actual.txt` 408줄

```sql
warranties.owner_user_id INT YES MUL NULL
-- 보증서 소유자 (NULL이면 issued_unassigned)
```

**확인**: ✅ `owner_user_id` 컬럼만 존재, `user_id` 컬럼 없음

---

## 수정 계획

### 우선순위 1: CRITICAL (즉시 수정 필요)

1. **`backend/admin-cli.js`**
   - 186줄: SELECT 쿼리 수정
   - 196줄: 조건문 수정
   - 217줄: 로그 메시지 수정
   - 236줄: UPDATE 쿼리 수정
   - 583줄: SELECT 쿼리 수정

2. **`backend/migrate-sqlite-to-mysql.js`**
   - 66줄: SELECT 쿼리 수정

### 우선순위 2: 검증 (추가 확인 필요)

1. **다른 스크립트 파일들**
   - `check-db-state.js`
   - `check_current_db_state.sql`
   - 기타 유틸리티 스크립트

---

## 검증 방법

### 1. DB 구조 확인
```sql
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND COLUMN_NAME IN ('user_id', 'owner_user_id')
ORDER BY ORDINAL_POSITION;
```

**예상 결과**:
- `owner_user_id` 컬럼만 존재
- `user_id` 컬럼 없음

### 2. 코드 검색
```bash
# warranties.user_id 사용하는 모든 곳 찾기
grep -r "warranties.*user_id\|user_id.*warranties" backend/ --include="*.js" --include="*.sql"
```

---

## 근본 원인 분석

### 문제 발생 원인

1. **마이그레이션과 코드 업데이트 불일치**
   - 마이그레이션 028에서 스키마 변경
   - 일부 코드가 업데이트되지 않음

2. **유틸리티 스크립트 관리 부족**
   - `admin-cli.js`, `migrate-sqlite-to-mysql.js` 같은 유틸리티 스크립트가 마이그레이션과 함께 업데이트되지 않음

3. **SSOT 문서와 코드 동기화 부족**
   - SSOT 문서는 업데이트되었지만, 코드 리뷰 시 누락

---

## 권장 사항

### 1. 마이그레이션 체크리스트

마이그레이션 작성 시:
- [ ] 스키마 변경 사항 문서화
- [ ] 영향받는 모든 코드 파일 확인
- [ ] 유틸리티 스크립트 업데이트
- [ ] SSOT 문서 업데이트
- [ ] 코드 검색으로 누락 확인

### 2. 정기적인 코드 감사

- 마이그레이션 후 전체 코드베이스 검색
- `grep`으로 컬럼명 사용 확인
- SSOT 문서와 실제 코드 비교

### 3. 자동화된 검증

- 마이그레이션 실행 전 스키마 검증
- 코드에서 사용하는 컬럼명과 실제 스키마 비교
- CI/CD 파이프라인에 검증 단계 추가

---

## 다음 단계

1. ✅ `backend/auth-routes.js` 수정 완료
2. ✅ `backend/admin-cli.js` 수정 완료
3. ✅ `backend/migrate-sqlite-to-mysql.js` 수정 완료
4. ⏳ 다른 스크립트 파일들 검증 필요 (check-db-state.js, check_current_db_state.sql 등)
