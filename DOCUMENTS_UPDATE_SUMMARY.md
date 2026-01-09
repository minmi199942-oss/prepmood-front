# 문서 업데이트 요약 (User 테이블 마이그레이션 반영)

## 📋 개요

최근 완료한 user 테이블 마이그레이션을 반영하여 `FINAL_EXECUTION_SPEC_REVIEW.md`와 `SYSTEM_FLOW_DETAILED.md` 문서를 업데이트해야 합니다.

---

## ✅ 완료된 마이그레이션 작업

### 1. users 테이블 변경사항
- ✅ `name` 필드 통합: `last_name`, `first_name` → `name` (단일 필드)
- ✅ `membership_id` 추가: `VARCHAR(20)` UNIQUE, 외부 노출용 (`PM.{년도}.{랜덤6자}`)
- ✅ `birth` 컬럼 제거
- ✅ `phone` 필수화: `NOT NULL`
- ✅ 동의 관련 컬럼 4개 추가:
  - `privacy_consent` (필수)
  - `marketing_consent` (선택, 체크 여부 기록)
  - `terms_consent` (필수)
  - `privacy_policy_consent` (필수)
- ✅ `user_id`는 **INT로 유지** (FK 관계 보존)

### 2. inquiries 테이블 변경사항
- ✅ `name` 필드 통합: `last_name`, `first_name` → `name` (단일 필드)

### 3. orders 테이블 변경사항
- ✅ `shipping_name` 필드 통합: `shipping_first_name`, `shipping_last_name` → `shipping_name` (단일 필드)

---

## 📝 문서별 업데이트 필요 사항

### 1. FINAL_EXECUTION_SPEC_REVIEW.md

#### 업데이트 필요 부분

**① 관리자 페이지 정보 구조 (109-127줄)**
- 현재: "고객 정보" 언급만 있음
- 업데이트: 고객 정보 표시 시 `users.name` (단일 필드) 사용 명시

**② 코드 예시 부분 (271-364줄)**
- 현재: `user.userId` 등 참조만 있음
- 업데이트: 사용자 정보 조회 시 `name` 필드 사용 명시 (필요 시)

**③ 주문 상세 API 예시 (1378-1381줄)**
- 현재: "고객 정보" 언급만 있음
- 업데이트: 
  - 회원: `user_id`, `email`, `name`, `phone`, `membership_id` (외부 노출용)
  - 비회원: `guest_id`, 이메일, 전화번호

#### 업데이트 불필요 부분
- ✅ `user_id`는 INT로 유지되므로 FK 관계 관련 내용은 그대로 유지
- ✅ `owner_user_id` 참조 부분은 변경 없음
- ✅ 시스템 설계 및 마이그레이션 계획은 이미 완료된 작업이므로 수정 불필요

---

### 2. SYSTEM_FLOW_DETAILED.md

#### 업데이트 필요 부분

**① 주문 상세 (3단 구조) - 822-831줄**
```markdown
**1단: 주문 정보** (`orders`)
- 주문번호
- 고객 정보:
  - 회원: `user_id`, `membership_id` (외부 노출용), 이메일, 이름(`users.name`), 전화번호
  - 비회원: `guest_id`, 이메일, 전화번호
- 주문 상태
- 결제 정보: 결제일시, 결제 금액, 결제 방법
- 배송지 정보: `shipping_name` (단일 필드), 이메일, 전화번호, 주소 등
```

**② 주문 목록 - 817줄**
```markdown
- 고객 정보 (회원: 이메일/이름(`users.name`)/`membership_id`, 비회원: 게스트 ID)
```

**③ 배송지 정보 표시 부분**
- 현재: 배송지 정보 언급만 있음
- 업데이트: `shipping_name` (단일 필드) 사용 명시

#### 업데이트 불필요 부분
- ✅ 주문 생성 흐름: `user_id`는 INT로 유지되므로 변경 없음
- ✅ Paid 처리 흐름: `owner_user_id` 참조는 변경 없음
- ✅ Claim, 활성화, 양도, 환불, 재판매 흐름: 모두 `user_id` 기반이므로 변경 없음

---

## 🔍 핵심 변경 사항 요약

### users 테이블 구조 (현재 상태)
```sql
users 테이블:
- user_id: INT AUTO_INCREMENT PRIMARY KEY (유지)
- membership_id: VARCHAR(20) UNIQUE (외부 노출용, PM.{년도}.{랜덤6자})
- email: VARCHAR(255)
- password_hash: VARCHAR(255)
- name: VARCHAR(100) NOT NULL (단일 필드, last_name + first_name 통합)
- phone: VARCHAR(30) NOT NULL (필수)
- privacy_consent: TINYINT(1) NOT NULL DEFAULT 0
- marketing_consent: TINYINT(1) NOT NULL DEFAULT 0
- terms_consent: TINYINT(1) NOT NULL DEFAULT 0
- privacy_policy_consent: TINYINT(1) NOT NULL DEFAULT 0
- verified: TINYINT(1)
- google_id: VARCHAR(255)
- profile_picture: VARCHAR(500)
- email_verified: TINYINT(1)
- created_at: DATETIME
- updated_at: DATETIME
```

### orders 테이블 구조 (현재 상태)
```sql
orders 테이블:
- order_id: INT AUTO_INCREMENT PRIMARY KEY
- user_id: INT (FK → users.user_id, NULL 허용)
- guest_id: VARCHAR(20) (비회원 주문)
- shipping_name: VARCHAR(100) NOT NULL (단일 필드, shipping_first_name + shipping_last_name 통합)
- shipping_email: VARCHAR(255)
- shipping_phone: VARCHAR(20)
- shipping_address: TEXT
- shipping_city: VARCHAR(100)
- shipping_postal_code: VARCHAR(20)
- shipping_country: VARCHAR(50)
-- ... 기타 필드
```

### inquiries 테이블 구조 (현재 상태)
```sql
inquiries 테이블:
- id: BIGINT PRIMARY KEY
- name: VARCHAR(100) NOT NULL (단일 필드, last_name + first_name 통합)
- email: VARCHAR(120)
- country_code: VARCHAR(10) NOT NULL (필수)
- phone: VARCHAR(30) NOT NULL (필수)
-- ... 기타 필드
```

---

## 📌 문서 업데이트 우선순위

### 높음 (즉시 업데이트 권장)
1. ✅ `SYSTEM_FLOW_DETAILED.md` 822-831줄: 주문 상세 고객 정보 표시 부분
2. ✅ `SYSTEM_FLOW_DETAILED.md` 817줄: 주문 목록 고객 정보 표시 부분

### 중간 (참고용 업데이트)
3. `FINAL_EXECUTION_SPEC_REVIEW.md` 109-127줄: 관리자 페이지 정보 구조 (고객 정보 부분만 보완)

### 낮음 (선택적)
4. 코드 예시 부분: 실제 구현 시 참고용이므로 필요 시에만 업데이트

---

## ✅ 결론

**현재 상태**:
- 두 문서 모두 핵심 시스템 흐름과 설계는 정확함
- `user_id`는 INT로 유지되어 FK 관계는 변경 없음
- 대부분의 흐름 설명은 그대로 유지 가능

**업데이트 필요**:
- 고객 정보 표시 부분에 `name` (단일 필드) 명시
- `membership_id` (외부 노출용) 언급 추가
- 배송지 정보에 `shipping_name` (단일 필드) 명시

**영향도**:
- 낮음: 문서의 핵심 설계와 흐름은 변경 없음
- 단순 보완: 정보 표시 부분만 명확화하면 됨

---

## 📝 참고

- 마이그레이션 완료 확인: `backend/migrations/012_phase_0_2_users_structure_changes.sql`
- membership_id 추가 확인: `backend/migrations/013_phase_0_3_add_membership_id.sql`
- shipping_name 통합 확인: `backend/migrations/015_orders_shipping_name_field.sql`
- inquiries name 통합 확인: `backend/migrations/014_inquiries_name_field.sql`
