# 구현 시작 가이드

## 📋 현재까지 정리된 내용

### ✅ 완료된 작업
1. 회원가입 페이지 구조 설계 완료 (`REGISTER_PAGE_STRUCTURE.md`)
2. users 테이블 마이그레이션 계획 수립 완료 (`USERS_TABLE_MIGRATION_PLAN.md`)
3. user_id/guest_id 생성 함수 구현 완료 (`backend/utils/user-id-generator.js`)
4. DB 상태 확인 스크립트 작성 완료 (`backend/check-db-state.js`, `backend/check_current_db_state.sql`)

### 📝 변경 사항 요약
- `users.user_id`: `INT AUTO_INCREMENT` → `VARCHAR(20)` (`PM.{년도}.{랜덤6자}`)
- `users.name`: 단일 필드로 통합 (`last_name`, `first_name` 제거)
- 동의 관련 컬럼 4개 추가
- `birth` 컬럼 제거
- `phone` 컬럼 필수로 변경
- `guest_id` 생성 규칙: `G-{YYYYMMDD}-{랜덤6자}`

## 🎯 다음 단계 (우선순위 순)

### Step 1: 현재 DB 상태 확인 (지금 바로 가능) ⚠️ 최우선

**목적**: 실제 DB 구조를 확인하여 마이그레이션 계획을 구체화

**실행 방법**:

**방법 1: Node.js 스크립트 (권장)**
```bash
cd backend
npm run check-db
```

**방법 2: SQL 직접 실행**
```bash
mysql -u prepmood_user -p prepmood < backend/check_current_db_state.sql
```

**확인할 내용**:
- MySQL 버전 (CHECK 제약, FOR UPDATE SKIP LOCKED 지원 여부)
- `users.user_id` 현재 타입
- `users` 테이블에 `last_name`, `first_name`, `birth`, `phone` 존재 여부
- 동의 관련 컬럼 존재 여부
- FK 관계 개수 및 타입
- 각 테이블의 데이터 개수
- `orders.guest_id` 컬럼 존재 여부

**예상 소요 시간**: 5-10분

---

### Step 2: 확인 결과 분석 및 마이그레이션 스크립트 작성

**확인 결과를 바탕으로**:
1. 실제 DB 구조와 문서의 차이점 파악
2. 마이그레이션 스크립트 구체화
3. 기존 데이터 처리 방안 결정

**작업 내용**:
- `USERS_TABLE_MIGRATION_PLAN.md` 기반으로 실제 마이그레이션 SQL 스크립트 작성
- 기존 데이터 변환 로직 작성
- 롤백 스크립트 작성

**예상 소요 시간**: 1-2일

---

### Step 3: 테스트 환경에서 마이그레이션 실행

**작업 내용**:
1. 테스트 DB에 백업 데이터 복원
2. 마이그레이션 스크립트 실행
3. 데이터 무결성 검증
4. 롤백 테스트

**예상 소요 시간**: 0.5-1일

---

### Step 4: 운영 환경 마이그레이션 (테스트 완료 후)

**작업 내용**:
1. 운영 DB 백업
2. 운영 중단 계획 수립
3. 마이그레이션 실행
4. 검증 및 모니터링

**예상 소요 시간**: 2-3시간 (데이터 양에 따라 다름)

---

### Step 5: 코드 수정 (마이그레이션 완료 후)

**작업 내용**:
1. 회원가입 API 수정 (`user_id` 생성, 동의 정보 저장)
2. Google 로그인 수정
3. 프로필 조회/업데이트 API 수정
4. 관리자 페이지 수정
5. 프론트엔드 코드 수정

**예상 소요 시간**: 2-3일

---

## 🚀 지금 바로 시작할 수 있는 작업

### 1. DB 상태 확인 (가장 안전한 시작)

```bash
# VPS에 접속 후
cd /var/www/html/backend
npm run check-db
```

또는

```bash
mysql -u prepmood_user -p prepmood < backend/check_current_db_state.sql
```

### 2. 확인 결과 공유

확인 결과를 공유해주시면:
- 실제 DB 구조와 문서의 차이점 파악
- 마이그레이션 스크립트 구체화
- 다음 단계 안내

---

## ⚠️ 주의사항

1. **운영 환경에서는 절대 바로 실행하지 마세요**
   - 반드시 테스트 환경에서 먼저 실행
   - 백업 필수

2. **단계별로 진행**
   - 한 번에 모든 것을 바꾸지 말고 단계별로 진행
   - 각 단계마다 검증

3. **롤백 계획 수립**
   - 마이그레이션 실패 시 롤백 방법 준비

---

## 📝 체크리스트

### 준비 단계
- [ ] 현재 DB 상태 확인
- [ ] 확인 결과 분석
- [ ] 마이그레이션 스크립트 작성
- [ ] 롤백 스크립트 작성

### 테스트 단계
- [ ] 테스트 환경 구축
- [ ] 테스트 데이터 준비
- [ ] 마이그레이션 실행
- [ ] 데이터 무결성 검증
- [ ] 롤백 테스트

### 운영 단계
- [ ] 운영 DB 백업
- [ ] 운영 중단 계획 수립
- [ ] 마이그레이션 실행
- [ ] 검증 및 모니터링

### 코드 수정 단계
- [ ] 회원가입 API 수정
- [ ] Google 로그인 수정
- [ ] 프로필 API 수정
- [ ] 관리자 페이지 수정
- [ ] 프론트엔드 수정

---

**지금 바로 시작할 수 있는 작업: Step 1 (DB 상태 확인)**


