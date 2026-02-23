# 085 Idempotency-Key 테스트 시나리오

## 목적
085 마이그레이션 완료 후, `Idempotency-Key` 기반 멱등성 보장 및 `refund_event_id` UNIQUE 제약 동작 확인

## 사전 준비

### 1. 테스트 환경 확인
```bash
# DB 제약 확인
mysql -u prepmood_user -p prepmood -e "SHOW INDEX FROM invoices WHERE Key_name = 'uk_invoices_credit_note_refund_event';"

# 컬럼 확인
mysql -u prepmood_user -p prepmood -e "SHOW COLUMNS FROM invoices LIKE 'refund_event_id';"
mysql -u prepmood_user -p prepmood -e "SHOW COLUMNS FROM invoices LIKE 'credit_note_refund_event_id';"
```

### 2. 테스트용 warranty_id 준비
- `status = 'issued'` 또는 `'issued_unassigned'`인 warranty 1개 필요
- 환불 가능한 상태 확인

**테스트용 warranty 조회**:
```sql
-- 환불 가능한 warranty 조회
SELECT w.id, w.status, w.owner_user_id, o.order_id, o.order_number
FROM warranties w
INNER JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
INNER JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
INNER JOIN orders o ON oi.order_id = o.order_id
WHERE w.status IN ('issued', 'issued_unassigned')
LIMIT 5;
```

### 3. 관리자 인증 (httpOnly 쿠키 사용)
관리자 API는 httpOnly 쿠키를 사용하므로, curl 테스트 시 쿠키 파일을 사용해야 합니다.

**방법 A: 브라우저에서 로그인 후 쿠키 추출**
1. 브라우저에서 `/admin-qhf25za8/login.html` 접속
2. 로그인 성공
3. 개발자 도구 → Application → Cookies → `token` 값 복사
4. curl에 `-H "Cookie: token=<token_value>"` 추가

**방법 B: curl로 로그인 후 쿠키 저장**
```bash
# 1. 로그인 (쿠키 저장)
# ⚠️ 주의: <admin_email>과 <admin_password>를 실제 값으로 대체하세요
curl -c /tmp/admin_cookies.txt -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dmsals0603@naver.com",
    "password": "enmin0603"
  }'

# 예시 (실제 사용 시):
# curl -c /tmp/admin_cookies.txt -X POST http://localhost:3000/api/admin/login \
#   -H "Content-Type: application/json" \
#   -d '{"email": "your-admin@example.com", "password": "your-password"}'

# 2. 쿠키 파일 사용하여 API 호출
curl -b /tmp/admin_cookies.txt -X POST http://localhost:3000/api/admin/refunds/process \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{
    "warranty_id": 1,
    "reason": "테스트 환불"
  }'
```

---

## 테스트 시나리오

### 시나리오 1: 정상 환불 처리 (Idempotency-Key 포함)

**요청** (쿠키 파일 사용):
```bash
# 쿠키 파일이 있는 경우
curl -b /tmp/admin_cookies.txt -X POST http://localhost:3000/api/admin/refunds/process \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{
    "warranty_id": 1,
    "reason": "고객 요청"
  }'

# 또는 브라우저에서 추출한 쿠키 직접 사용
curl -X POST http://localhost:3000/api/admin/refunds/process \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<admin_token_from_browser>" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{
    "warranty_id": 1,
    "reason": "고객 요청"
  }'
```

**예상 결과**:
- ✅ HTTP 200
- ✅ `credit_note_id` 반환
- ✅ `warranties.status = 'revoked'`
- ✅ `invoices.refund_event_id = '550e8400-e29b-41d4-a716-446655440000'`
- ✅ `invoices.credit_note_refund_event_id = '550e8400-e29b-41d4-a716-446655440000'` (generated)

**DB 확인**:
```sql
SELECT invoice_id, invoice_number, type, status, refund_event_id, credit_note_refund_event_id
FROM invoices
WHERE refund_event_id = '550e8400-e29b-41d4-a716-446655440000';
```

---

### 시나리오 2: 동일 Idempotency-Key 재시도 (멱등성 확인)

**1차 요청**:
```bash
curl -b /tmp/admin_cookies.txt -X POST http://localhost:3000/api/admin/refunds/process \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{
    "warranty_id": 1,
    "reason": "고객 요청"
  }'
```

**2차 요청** (동일 Idempotency-Key, 즉시 재시도):
```bash
curl -b /tmp/admin_cookies.txt -X POST http://localhost:3000/api/admin/refunds/process \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{
    "warranty_id": 1,
    "reason": "고객 요청"
  }'
```

**예상 결과**:
- ✅ HTTP 200 (1차와 동일)
- ✅ **동일한 `credit_note_id` 반환** (새로 생성하지 않음)
- ✅ ER_DUP_ENTRY 발생 → 기존 issued credit_note 조회 후 반환
- ✅ 로그: `[REFUND] 기존 issued credit_note 반환 (DB 충돌 처리)`

**DB 확인**:
```sql
-- credit_note는 1건만 존재해야 함
SELECT COUNT(*) FROM invoices 
WHERE refund_event_id = '550e8400-e29b-41d4-a716-446655440000' 
  AND type = 'credit_note';
-- 기대: 1
```

---

### 시나리오 3: Idempotency-Key 누락 (400 에러)

**요청**:
```bash
curl -b /tmp/admin_cookies.txt -X POST http://localhost:3000/api/admin/refunds/process \
  -H "Content-Type: application/json" \
  -d '{
    "warranty_id": 1,
    "reason": "고객 요청"
  }'
```

**예상 결과**:
- ✅ HTTP 400
- ✅ `code: 'MISSING_IDEMPOTENCY_KEY'`
- ✅ `message: 'Idempotency-Key 헤더가 필수입니다. (재시도 시 동일 키 재사용)'`

---

### 시나리오 4: 잘못된 UUID 형식 (400 에러)

**요청**:
```bash
curl -b /tmp/admin_cookies.txt -X POST http://localhost:3000/api/admin/refunds/process \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: invalid-uuid-format" \
  -d '{
    "warranty_id": 1,
    "reason": "고객 요청"
  }'
```

**예상 결과**:
- ✅ HTTP 400
- ✅ `code: 'INVALID_IDEMPOTENCY_KEY_FORMAT'`
- ✅ `message: 'Idempotency-Key는 UUID 형식이어야 합니다.'`

---

### 시나리오 5: 대문자 UUID (case-insensitive 확인)

**요청**:
```bash
curl -b /tmp/admin_cookies.txt -X POST http://localhost:3000/api/admin/refunds/process \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 550E8400-E29B-41D4-A716-446655440000" \
  -d '{
    "warranty_id": 2,
    "reason": "고객 요청"
  }'
```

**예상 결과**:
- ✅ HTTP 200 (정상 처리)
- ✅ 대소문자 무관하게 UUID로 인식

---

### 시나리오 6: 공백 포함 Idempotency-Key (trim 확인)

**요청**:
```bash
curl -b /tmp/admin_cookies.txt -X POST http://localhost:3000/api/admin/refunds/process \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key:  550e8400-e29b-41d4-a716-446655440000  " \
  -d '{
    "warranty_id": 2,
    "reason": "고객 요청"
  }'
```

**예상 결과**:
- ✅ HTTP 200 (정상 처리)
- ✅ 선행/후행 공백 제거 후 처리

---

### 시나리오 7: 다른 Idempotency-Key로 같은 warranty 환불 시도 (중복 환불 방지)

**1차 요청**:
```bash
curl -b /tmp/admin_cookies.txt -X POST http://localhost:3000/api/admin/refunds/process \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{
    "warranty_id": 3,
    "reason": "고객 요청"
  }'
```

**2차 요청** (다른 Idempotency-Key, 같은 warranty):
```bash
curl -b /tmp/admin_cookies.txt -X POST http://localhost:3000/api/admin/refunds/process \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 660e8400-e29b-41d4-a716-446655440001" \
  -d '{
    "warranty_id": 3,
    "reason": "고객 요청"
  }'
```

**예상 결과**:
- ✅ HTTP 400 또는 500
- ✅ `warranties.status = 'revoked'` 확인으로 중복 환불 차단
- ✅ **085 UNIQUE는 이벤트 중복 방지, 중복 환불은 unit_status/금액 검증에서 차단**

**DB 확인**:
```sql
-- credit_note는 2건 생성 (다른 refund_event_id)
SELECT invoice_id, refund_event_id, type, status
FROM invoices
WHERE type = 'credit_note' 
  AND related_invoice_id IN (
    SELECT invoice_id FROM invoices 
    WHERE order_id = (SELECT order_id FROM warranties WHERE id = 3)
  );
-- 기대: 1건만 (첫 번째 환불만 성공)
```

---

## 체크리스트

### 기능 검증
- [ ] 시나리오 1: 정상 환불 처리
- [ ] 시나리오 2: 동일 키 재시도 (멱등성)
- [ ] 시나리오 3: Idempotency-Key 누락
- [ ] 시나리오 4: 잘못된 UUID 형식
- [ ] 시나리오 5: 대문자 UUID (case-insensitive)
- [ ] 시나리오 6: 공백 포함 (trim)
- [ ] 시나리오 7: 다른 키로 같은 warranty (중복 환불 방지)

### DB 검증
- [ ] `refund_event_id` 컬럼 존재
- [ ] `credit_note_refund_event_id` generated column 존재
- [ ] UNIQUE 제약 동작 확인
- [ ] ER_DUP_ENTRY 처리 확인

### 로그 검증
- [ ] 정상 처리 시 로그
- [ ] ER_DUP_ENTRY 시 상세 로그
- [ ] 에러 케이스 로그

---

## 참고

### 085 멱등성 범위
- **085의 UNIQUE**: "같은 환불 이벤트(refund_event_id)로 credit_note 중복 발급 방지"
- **중복 환불 방지**: unit_status/금액 검증 레이어에서 처리 (085 UNIQUE와 별개)
- **Idempotency-Key 정책**: 재시도(retry)에만 재사용, 새 환불 이벤트는 항상 새 키

### 관리자 UI 수정 필요
- 재시도 시 **동일 Idempotency-Key** 전송 필수
- UUID v7 생성 라이브러리 사용 권장
