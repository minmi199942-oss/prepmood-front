# 구현 순서 및 체크리스트

## 📋 목표
최종 확정된 스펙을 바탕으로 단계별 구현 순서 정리

---

## ✅ Phase 0: 문서 정리 완료

- [x] SSOT 선언부 추가 (SYSTEM_FLOW_DETAILED.md, FINAL_EXECUTION_SPEC_REVIEW.md)
- [x] 토큰 체계 명시 (Landing → Cookie → Redirect)
- [x] claim_token 3-Factor Atomic Check 명시
- [x] active_lock 패턴 반영 (옵션 B: 현재 ENUM 기준)
- [x] 락 순서 명시 (stock_units → orders → warranties → invoices)
- [x] stock_units.status = 'in_stock' 게이트키퍼 명시

---

## 🔧 Phase 1: 데이터베이스 스키마 구현

### Phase 1-1: token_pk 마이그레이션 (기존 계획 유지)

**파일**: `backend/migrations/022_token_pk_migration_phase1_token_master.sql`

**작업 내용**:
- [ ] token_master PK 교체 (token → token_pk)
- [ ] 기존 FK 제거
- [ ] token_master_backup 생성
- [ ] token_master_new 생성 및 데이터 마이그레이션
- [ ] 검증 완료

**의존성**: 없음 (최우선)

---

### Phase 1-2: warranties FK 전환 (기존 계획 유지)

**파일**: `backend/migrations/023_token_pk_migration_phase2_warranties.sql`

**작업 내용**:
- [ ] warranties.token_pk 컬럼 추가
- [ ] 데이터 마이그레이션 (token → token_pk)
- [ ] FK 추가 (token_pk → token_master.token_pk)
- [ ] 검증 완료

**의존성**: Phase 1-1 완료 필수

---

### Phase 1-3: paid_events 테이블 생성

**파일**: `backend/migrations/024_create_paid_events_table.sql`

**작업 내용**:
- [ ] paid_events 테이블 생성
- [ ] UNIQUE(order_id, payment_key) 제약 추가
- [ ] 검증 완료

**의존성**: 없음 (Phase 1-1과 병렬 가능)

---

### Phase 1-4: orders.paid_at 컬럼 추가

**파일**: `backend/migrations/025_add_orders_paid_at.sql`

**작업 내용**:
- [ ] orders.paid_at 컬럼 추가
- [ ] 인덱스 추가
- [ ] 검증 완료

**의존성**: Phase 1-3 완료 권장 (동기화 규칙 명시)

---

### Phase 1-5: stock_units 테이블 생성

**파일**: `backend/migrations/026_create_stock_units_table.sql`

**작업 내용**:
- [ ] stock_units 테이블 생성
- [ ] token_pk FK 추가 (Phase 1-1 완료 후)
- [ ] status ENUM: `('in_stock', 'reserved', 'sold', 'returned')`
- [ ] 검증 완료

**의존성**: Phase 1-1 완료 필수 (token_pk FK)

---

### Phase 1-6: order_item_units 테이블 생성 (active_lock 포함)

**파일**: `backend/migrations/027_create_order_item_units_table.sql`

**작업 내용**:
- [ ] order_item_units 테이블 생성
- [ ] unit_status ENUM: `('reserved', 'shipped', 'delivered', 'refunded')`
- [ ] **active_lock generated column 추가:**
  ```sql
  active_lock INT GENERATED ALWAYS AS (
    CASE WHEN unit_status IN ('reserved', 'shipped', 'delivered') THEN 1 ELSE NULL END
  ) VIRTUAL
  ```
- [ ] **UNIQUE(stock_unit_id, active_lock) 제약 추가**
- [ ] token_pk FK 추가 (Phase 1-1 완료 후)
- [ ] 검증 완료

**의존성**: 
- Phase 1-1 완료 필수 (token_pk FK)
- Phase 1-5 완료 권장 (stock_unit_id FK)

---

### Phase 1-7: warranties 컬럼 추가

**파일**: `backend/migrations/028_add_warranties_columns.sql`

**작업 내용**:
- [ ] status 컬럼 추가
- [ ] owner_user_id 컬럼 추가 (NULL 허용)
- [ ] source_order_item_unit_id 컬럼 추가
- [ ] activated_at, revoked_at 컬럼 추가
- [ ] UNIQUE(token_pk) 제약 추가
- [ ] 검증 완료

**의존성**: Phase 1-2 완료 필수 (token_pk 사용)

---

### Phase 1-8: warranties FK 추가

**파일**: `backend/migrations/029_add_warranties_foreign_keys.sql`

**작업 내용**:
- [ ] source_order_item_unit_id FK 추가 (Phase 1-6 완료 후)
- [ ] owner_user_id FK 추가
- [ ] 검증 완료

**의존성**: Phase 1-6, Phase 1-7 완료 필수

---

### Phase 1-9: invoices 테이블 수정 (다장 인보이스 지원)

**파일**: `backend/migrations/030_add_invoices_multipart.sql`

**작업 내용**:
- [ ] invoice_group_id 컬럼 추가
- [ ] invoice_part_no 컬럼 추가
- [ ] invoice_part_total 컬럼 추가
- [ ] UNIQUE(invoice_group_id, invoice_part_no) 제약 추가
- [ ] 검증 완료

**의존성**: invoices 테이블 존재 필수 (이미 생성됨)

---

### Phase 1-10: guest_order_access_tokens 테이블 생성

**파일**: `backend/migrations/031_create_guest_order_access_tokens_table.sql`

**작업 내용**:
- [ ] guest_order_access_tokens 테이블 생성
- [ ] token 해시 저장 (보안)
- [ ] expires_at 컬럼 (90일)
- [ ] revoked_at 컬럼
- [ ] 검증 완료

**의존성**: 없음

---

### Phase 1-11: claim_tokens 테이블 생성

**파일**: `backend/migrations/032_create_claim_tokens_table.sql`

**작업 내용**:
- [ ] claim_tokens 테이블 생성
- [ ] token 해시 저장 (보안)
- [ ] order_id 컬럼 (바인딩 확인용)
- [ ] user_id 컬럼 (로그인한 user_id 바인딩)
- [ ] expires_at 컬럼 (10~30분)
- [ ] used_at 컬럼 (1회성 확인)
- [ ] 검증 완료

**의존성**: 없음

---

## 💻 Phase 2: 백엔드 API 구현

### Phase 2-1: Paid 처리 로직 구현

**파일**: `backend/utils/process-paid-order.js` (신규)

**작업 내용**:
- [ ] `processPaidOrder()` 함수 구현
- [ ] 락 순서 준수: stock_units → orders → warranties → invoices
- [ ] paid_events 멱등 INSERT
- [ ] stock_units 배정 (FOR UPDATE SKIP LOCKED)
- [ ] order_item_units 생성 (active_lock 활용)
- [ ] warranties 생성/업데이트 (재판매 시 UPDATE)
- [ ] invoices 생성 (다장 인보이스 지원)
- [ ] 트랜잭션 관리
- [ ] 에러 처리

**의존성**: Phase 1 완료 필수

---

### Phase 2-2: payments-routes.js 수정

**파일**: `backend/payments-routes.js`

**작업 내용**:
- [ ] `processPaidOrder()` 통합
- [ ] paid_events INSERT
- [ ] orders.paid_at 업데이트 (동기화)
- [ ] 에러 처리 개선

**의존성**: Phase 2-1 완료 필수

---

### Phase 2-3: 비회원 주문 조회 API 구현

**파일**: `backend/guest-routes.js` (신규)

**작업 내용**:
- [ ] `GET /api/guest/orders/:orderId?token=xxx` (Landing)
  - 토큰 검증
  - httpOnly Cookie 설정
  - 302 Redirect (토큰 제거된 URL)
- [ ] `GET /api/guest/orders/:orderId` (Cookie 기반)
  - Cookie에서 토큰 읽기
  - 주문 정보 반환
- [ ] 에러 처리

**의존성**: Phase 1-10 완료 필수

---

### Phase 2-4: Claim API 구현

**파일**: `backend/guest-routes.js` (추가)

**작업 내용**:
- [ ] `POST /api/orders/:orderId/claim-token` (claim_token 발급)
  - 로그인 필수 확인
  - guest_order_access_token 검증
  - claim_token 발급 (user_id 바인딩)
- [ ] `POST /api/orders/:orderId/claim` (Claim 실행)
  - 3-Factor Atomic Check:
    ```sql
    UPDATE claim_tokens
    SET used_at = NOW()
    WHERE token = ? AND order_id = ? AND used_at IS NULL AND expires_at > NOW()
    ```
  - affectedRows=1 검증
  - orders.user_id 업데이트
  - warranties 상태 업데이트
  - guest_order_access_token revoke
- [ ] 트랜잭션 관리
- [ ] 에러 처리

**의존성**: Phase 1-11 완료 필수

---

### Phase 2-5: 보증서 활성화 API 수정

**파일**: `backend/auth-routes.js` 또는 `backend/warranty-routes.js`

**작업 내용**:
- [ ] 주문 귀속 검증 로직 추가
  - warranties.status 확인
  - orders.user_id 확인
  - orders.status != 'refunded' 확인
  - order_item_units.unit_status != 'refunded' 확인
- [ ] invoices는 검증 대상에서 제외 명시
- [ ] affectedRows=1 검증

**의존성**: Phase 1 완료 필수

---

## 🎨 Phase 3: 프론트엔드 구현

### Phase 3-1: 비회원 주문 조회 페이지

**파일**: `guest-order-detail.html` (신규), `guest-order-detail.js` (신규)

**작업 내용**:
- [ ] Landing 페이지 (URL Query 토큰 처리)
- [ ] Cookie 기반 조회 페이지
- [ ] 주문 정보 표시
- [ ] "내 계정에 연동하기" 버튼
- [ ] 로그인 플로우 통합

**의존성**: Phase 2-3 완료 필수

---

### Phase 3-2: Claim 플로우 통합

**파일**: `guest-order-detail.js` (추가)

**작업 내용**:
- [ ] "내 계정에 연동하기" 버튼 클릭 핸들러
- [ ] 로그인 페이지 redirect (return_url 포함)
- [ ] 로그인 성공 후 claim-token 발급
- [ ] claim API 호출
- [ ] 성공/실패 처리

**의존성**: Phase 2-4 완료 필수

---

## 🧪 Phase 4: 테스트 및 검증

### Phase 4-1: 데이터베이스 스키마 검증

**작업 내용**:
- [ ] 모든 마이그레이션 실행
- [ ] 제약 조건 확인
- [ ] 인덱스 확인
- [ ] FK 확인

---

### Phase 4-2: Paid 처리 테스트

**작업 내용**:
- [ ] 회원 주문 Paid 처리
- [ ] 비회원 주문 Paid 처리
- [ ] 재판매 시나리오 테스트
- [ ] 동시성 테스트 (락 순서)
- [ ] 멱등성 테스트

---

### Phase 4-3: 비회원 조회 및 Claim 테스트

**작업 내용**:
- [ ] Landing → Cookie → Redirect 플로우
- [ ] claim_token 발급 및 사용
- [ ] 3-Factor Atomic Check 테스트
- [ ] 토큰 만료 테스트
- [ ] 중복 사용 방지 테스트

---

## 📋 구현 체크리스트 요약

### 데이터베이스 (Phase 1)
- [ ] Phase 1-1: token_pk 마이그레이션
- [ ] Phase 1-2: warranties FK 전환
- [ ] Phase 1-3: paid_events 테이블
- [ ] Phase 1-4: orders.paid_at
- [ ] Phase 1-5: stock_units 테이블
- [ ] Phase 1-6: order_item_units 테이블 (active_lock 포함)
- [ ] Phase 1-7: warranties 컬럼 추가
- [ ] Phase 1-8: warranties FK 추가
- [ ] Phase 1-9: invoices 다장 지원
- [ ] Phase 1-10: guest_order_access_tokens 테이블
- [ ] Phase 1-11: claim_tokens 테이블

### 백엔드 (Phase 2)
- [ ] Phase 2-1: processPaidOrder() 함수
- [ ] Phase 2-2: payments-routes.js 수정
- [ ] Phase 2-3: 비회원 주문 조회 API
- [ ] Phase 2-4: Claim API
- [ ] Phase 2-5: 보증서 활성화 API 수정

### 프론트엔드 (Phase 3)
- [ ] Phase 3-1: 비회원 주문 조회 페이지
- [ ] Phase 3-2: Claim 플로우 통합

### 테스트 (Phase 4)
- [ ] Phase 4-1: 데이터베이스 검증
- [ ] Phase 4-2: Paid 처리 테스트
- [ ] Phase 4-3: 비회원 조회 및 Claim 테스트

---

## 🎯 다음 단계

**즉시 시작 가능**: Phase 1-1 (token_pk 마이그레이션)

**준비 사항**:
1. 데이터베이스 백업
2. 마이그레이션 스크립트 검토
3. 검증 스크립트 준비

**진행 순서**:
1. Phase 1 완료 (데이터베이스 스키마)
2. Phase 2 완료 (백엔드 API)
3. Phase 3 완료 (프론트엔드)
4. Phase 4 완료 (테스트)
