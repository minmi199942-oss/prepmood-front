# 스키마 일관성 수정 완료 요약

## 수정 완료 사항

### 1. ✅ `backend/auth-routes.js`
- **861줄**: `WHERE public_id = ? AND user_id = ?` → `WHERE public_id = ? AND owner_user_id = ?`
- **영향**: 보증서 상세 조회 API 500 에러 해결

### 2. ✅ `backend/admin-cli.js`
- **186줄**: `SELECT public_id, user_id` → `SELECT public_id, owner_user_id`
- **196줄**: `warranty.user_id` → `warranty.owner_user_id`
- **217줄**: 로그 메시지 `warranties.user_id` → `warranties.owner_user_id`
- **236줄**: `UPDATE warranties SET user_id` → `UPDATE warranties SET owner_user_id`
- **583줄**: `SELECT public_id, user_id` → `SELECT public_id, owner_user_id`
- **802줄**: `info.warranty.user_id` → `info.warranty.owner_user_id`
- **영향**: 관리자 CLI 도구의 보증서 양도/조회 기능 정상화

### 3. ✅ `backend/migrate-sqlite-to-mysql.js`
- **66줄**: `SELECT token, user_id` → `SELECT token, owner_user_id`
- **71줄**: `w.user_id` → `w.owner_user_id`
- **영향**: SQLite → MySQL 마이그레이션 스크립트 정상화

### 4. ✅ `backend/payments-routes.js`
- **응답에 `user_id` 추가**: 회원/비회원 구분을 위해
- **영향**: order-complete 페이지에서 회원/비회원 구분 정상화

### 5. ✅ `order-complete-script.js`
- **회원/비회원 구분 로직 수정**: `user_id`로 구분
- **영향**: order-complete 페이지 "비회원 주문 세션 발급 실패" 에러 해결

---

## 근본 원인

### 문제 발생 패턴
1. **마이그레이션 028** (2025-01-15): `warranties.user_id` → `warranties.owner_user_id` 변경
2. **코드 업데이트 누락**: 일부 파일이 마이그레이션과 함께 업데이트되지 않음
3. **유틸리티 스크립트 관리 부족**: `admin-cli.js`, `migrate-sqlite-to-mysql.js` 같은 유틸리티가 누락

### 발견 경로
- 사용자 리포트: 보증서 상세 페이지 500 에러
- 코드 리뷰: `warranties.user_id` 사용 확인
- 전체 검색: `grep`으로 모든 사용처 확인

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

**예상 결과**: `owner_user_id`만 존재, `user_id` 없음

### 2. 코드 검색
```bash
# warranties.user_id 사용하는 모든 곳 찾기 (수정 후에는 없어야 함)
grep -r "warranties.*\.user_id\|warranties.*user_id" backend/ --include="*.js" --include="*.sql"
```

**예상 결과**: 검색 결과 없음 (또는 주석/문서만)

---

## 향후 예방 방안

### 1. 마이그레이션 체크리스트
마이그레이션 작성 시:
- [ ] 스키마 변경 사항 문서화
- [ ] 영향받는 모든 코드 파일 확인
- [ ] 유틸리티 스크립트 업데이트
- [ ] SSOT 문서 업데이트
- [ ] 코드 검색으로 누락 확인 (`grep` 사용)

### 2. 정기적인 코드 감사
- 마이그레이션 후 전체 코드베이스 검색
- `grep`으로 컬럼명 사용 확인
- SSOT 문서와 실제 코드 비교

### 3. 자동화된 검증 (권장)
- 마이그레이션 실행 전 스키마 검증
- 코드에서 사용하는 컬럼명과 실제 스키마 비교
- CI/CD 파이프라인에 검증 단계 추가

---

## 참고 문서

- **SSOT 문서**: `SCHEMA_SSOT.md`
- **실제 DB 구조**: `backend/scripts/db_structure_actual.txt`
- **마이그레이션 028**: `backend/migrations/028_add_warranties_columns.sql`
- **상세 감사 보고서**: `CODEBASE_SCHEMA_AUDIT.md`
