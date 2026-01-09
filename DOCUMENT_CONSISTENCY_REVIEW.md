# 두 문서 정합성 검토 및 수정안

## 📋 검토 목표
**`SYSTEM_FLOW_DETAILED.md`(흐름 문서)와 `FINAL_EXECUTION_SPEC_REVIEW.md`(코드/테이블 문서)가 완전히 1:1로 매핑되도록 수정**

## ✅ 사용자 선택사항 확정
1. **선택 1**: B안 (조회 토큰 + claim_token 분리) ✅
2. **선택 2**: 인보이스 여러 장 허용 ✅
3. **선택 3**: 취소 후 재생성 (requested 1개 강제) ✅

---

## 🔍 발견된 정합성 문제점

### 1. SSOT 선언부 누락 ⚠️ **심각**

**문제**: 두 문서 모두 맨 앞에 SSOT 선언이 없음

**현재 상태**:
- `SYSTEM_FLOW_DETAILED.md`: SSOT 선언 없음
- `FINAL_EXECUTION_SPEC_REVIEW.md`: 25-32줄에 일부 규칙만 있음

**수정 필요**: 두 문서 모두 맨 앞에 동일한 SSOT 선언 추가

---

### 2. 비회원 토큰 체계 혼용 🔴 **심각**

**문제**: `SYSTEM_FLOW_DETAILED.md` 229줄에서 "guest_order_access_token 또는 claim_token" 혼용

**현재 상태**:
```markdown
-- SYSTEM_FLOW_DETAILED.md 229줄
인보이스 링크 생성 (조회 전용 토큰 포함, `guest_order_access_token` 또는 `claim_token`)
```

**수정 필요**: B안으로 통일 (조회 토큰과 claim_token 분리)

---

### 3. 용어 불일치: "인보이스 연동 확인" vs "주문 귀속 검증" ⚠️

**문제**: 두 문서에서 다른 용어 사용

**현재 상태**:
- `SYSTEM_FLOW_DETAILED.md`: "인보이스 연동 확인" (323줄, 1065줄 등)
- `FINAL_EXECUTION_SPEC_REVIEW.md`: "인보이스 연동 확인" (186줄, 425줄 등)

**수정 필요**: "주문 귀속(ownership) 검증"으로 통일

---

### 4. 락 순서 불명확 ⚠️

**문제**: Paid 처리 트랜잭션에서 락 순서가 문서마다 다름

**현재 상태**:
- `SYSTEM_FLOW_DETAILED.md` 95-98줄: orders 먼저 잠금
- `FINAL_EXECUTION_SPEC_REVIEW.md` 1517줄: stock_units → orders → warranties 순서 명시

**수정 필요**: 전역 락 순서 고정 (stock_units → orders → warranties → invoices)

---

### 5. 멱등성 언급 부족 ⚠️

**문제**: paid_events만 언급, order_item_units/warranties/invoices 멱등성 언급 없음

**현재 상태**:
- `SYSTEM_FLOW_DETAILED.md`: paid_events만 언급 (88줄)
- `FINAL_EXECUTION_SPEC_REVIEW.md`: 멱등성 계층표 있음 (2028줄) but order_item_units UNIQUE 언급 부족

**수정 필요**: 2단 멱등성 명시 (1단: paid_events, 2단: order_item_units/warranties/invoices)

---

### 6. warranties UNIQUE(token_pk) 언급 없음 ⚠️

**문제**: "토큰당 1개만 유지"가 문장으로만 존재, DB 제약 언급 없음

**현재 상태**:
- `SYSTEM_FLOW_DETAILED.md`: "같은 token에 대해 warranties 레코드는 하나만 유지" (689줄) - 문장만
- `FINAL_EXECUTION_SPEC_REVIEW.md`: active_key 패턴 언급 (1673줄) but UNIQUE(token_pk) 직접 언급 없음

**수정 필요**: UNIQUE(token_pk) 제약 명시 + 재판매 시 UPDATE만 허용 명시

---

### 7. 양도 requested 1개 제약 없음 ⚠️

**문제**: 양도 요청이 여러 개 쌓일 수 있음

**현재 상태**:
- `SYSTEM_FLOW_DETAILED.md`: 단순 INSERT로만 언급 (398줄)
- `FINAL_EXECUTION_SPEC_REVIEW.md`: requested 1개 제약 언급 없음

**수정 필요**: warranty_id당 requested 1개만 유지 규칙 추가

---

### 8. 인보이스 다장 모델 언급 없음 ⚠️

**문제**: 인보이스 여러 장 허용 결정했지만 문서에 반영 안 됨

**현재 상태**:
- 두 문서 모두: 인보이스 1장 가정

**수정 필요**: 다장 인보이스 모델 (invoice_group_id + invoice_part_no) 추가

---

## 📝 수정안

### 수정 1: SSOT 선언부 추가 (두 문서 공통)

**위치**: 두 문서 모두 맨 앞에 추가

```markdown
## ⚠️ SSOT 선언 (단일 진실 원천) - 필수 고정

**이 문서는 시스템의 단일 진실 원천(SSOT)입니다. 모든 구현은 이 규칙을 따라야 합니다.**

### 핵심 SSOT 규칙 (4줄 고정)

1. **`orders.status`는 집계 결과(뷰/표시용)이며, 직접 정책 판단 기준으로 사용하지 않는다.**
   - 환불/양도/제재 판단은 `warranties.status`를 기준으로 한다.
   - `orders.status`는 집계 함수로만 갱신되며, 관리자 수동 수정 금지.

2. **`order_item_units.unit_status`는 물류 단위 상태(배송/재고 흐름)의 진실 원천이다.**
   - 배송 상태 판단은 `unit_status`를 기준으로 한다.
   - `orders.status`는 `unit_status` 집계 결과일 뿐이다.

3. **`warranties.status`는 권리/정책 상태(활성화/양도/환불 가능 여부)의 진실 원천이다.**
   - 환불 가능 여부 판정은 `warranties.status`만 본다.
   - 활성화 가능 여부 판정은 `warranties.status`만 본다.

4. **`invoices`는 문서(스냅샷)이며, "권리 판단 기준"이 아니라 "증빙/조회" 역할이다.**
   - 활성화/환불 판정에 `invoices`를 사용하지 않는다.
   - `invoices`는 발급 시점의 주문 정보를 고정 저장하는 스냅샷일 뿐이다.

### 전역 정합성 규칙 (5줄 고정)

1. **전역 락 순서(필수)**: `stock_units`(물리) → `orders`(결제) → `warranties`(권리) → `invoices`(문서)
2. **전역 원자성 규칙(필수)**: 상태 전이는 `UPDATE ... WHERE 조건`으로만 수행하며 `affectedRows=1` 검증 필수
3. **전역 유니크 제약(필수)**:
   - `order_idempotency`: UNIQUE(`owner_key`, `idem_key`)
   - `paid_events`: UNIQUE(`order_id`, `payment_key`)
   - `order_item_units`: UNIQUE(`stock_unit_id`) (한 재고 유닛은 한 번만 배정)
   - `warranties`: UNIQUE(`token_pk`) (토큰당 레코드 1개 강제, 재판매는 UPDATE로만)
   - `invoices`: UNIQUE(`invoice_number`)
4. **토큰 체계(필수)**: 비회원 조회는 `guest_order_access_token`(90일), claim은 `claim_token`(10~30분) 분리 사용
5. **양도 요청 단일화(필수)**: `warranty_id`당 `requested` 상태는 1개만 유지 (DB 제약 또는 트랜잭션으로 강제)

---
```

---

### 수정 2: 비회원 토큰 체계 통일 (B안)

**위치**: `SYSTEM_FLOW_DETAILED.md` 3-1, 3-2 섹션

**현재 (229줄)**:
```markdown
인보이스 링크 생성 (조회 전용 토큰 포함, `guest_order_access_token` 또는 `claim_token`)
```

**수정 후**:
```markdown
인보이스 링크 생성 (조회 전용 토큰 포함, `guest_order_access_token`만 사용)
- `guest_order_access_token`: 조회 전용 (90일 유효), "주문 상세/인보이스 보기"까지만 허용
- `claim_token`: 연동(Claim) 전용 (10~30분 유효), "내 계정에 연동하기" 버튼 클릭 시 발급
```

**추가 수정 필요**:
- 3-2 섹션에 claim_token 발급 흐름 추가
- API 명세 추가: `POST /api/orders/:orderId/claim-token` (guest_order_access_token + 로그인 여부)

---

### 수정 3: 용어 통일 ("주문 귀속 검증")

**위치**: 두 문서 전체

**현재**: "인보이스 연동 확인"

**수정 후**: "주문 귀속(ownership) 검증"

**검증 대상 명시**:
- `orders.user_id = 현재 로그인한 user_id`
- `orders.status != 'refunded'`
- `order_item_units.unit_status != 'refunded'`
- `warranties.status = 'issued'`
- **`invoices` 테이블은 직접 검증 대상으로 사용하지 않음**

---

### 수정 4: 락 순서 고정

**위치**: `SYSTEM_FLOW_DETAILED.md` 2-1 섹션

**현재 (95-98줄)**:
```markdown
2. **주문 잠금** (FOR UPDATE)
   SELECT * FROM orders WHERE order_id = ? FOR UPDATE

3. **재고 배정** (각 order_item별로)
```

**수정 후**:
```markdown
2. **재고 배정** (각 order_item별로) - ⚠️ 락 순서 1단계: stock_units(물리)
   ```sql
   SELECT stock_unit_id, token_pk
   FROM stock_units
   WHERE status = 'in_stock' AND product_id = ?
   FOR UPDATE SKIP LOCKED
   LIMIT ?
   ```
   - `stock_units`에서 `status = 'in_stock'`인 재고 선택
   - `status = 'reserved'`, `reserved_at = NOW()`, `reserved_by_order_id = order_id`로 업데이트
   - SKIP LOCKED 사용 (MySQL 8.0+) 또는 product_id 순서로 락 획득

3. **주문 잠금** (FOR UPDATE) - ⚠️ 락 순서 2단계: orders(결제)
   ```sql
   SELECT * FROM orders WHERE order_id = ? FOR UPDATE
   ```

4. **order_item_units 생성** (각 재고 단위별로)
   ```sql
   INSERT INTO order_item_units 
   (order_item_id, unit_seq, stock_unit_id, token_pk, unit_status, created_at)
   VALUES (?, ?, ?, ?, 'reserved', NOW())
   -- UNIQUE(stock_unit_id) 제약으로 중복 방지
   ```

5. **warranties 생성** (각 order_item_unit별로) - ⚠️ 락 순서 3단계: warranties(권리)
   - 회원 주문: `status = 'issued'`, `owner_user_id = orders.user_id`
   - 비회원 주문: `status = 'issued_unassigned'`, `owner_user_id = NULL`
   ```sql
   INSERT INTO warranties 
   (source_order_item_unit_id, token_pk, owner_user_id, status, created_at)
   VALUES (?, ?, ?, ?, NOW())
   -- UNIQUE(token_pk) 제약으로 중복 방지
   ```

6. **인보이스 생성** (`invoices` 테이블) - ⚠️ 락 순서 4단계: invoices(문서)
   ```sql
   INSERT INTO invoices (
     order_id, invoice_number, invoice_group_id, invoice_part_no, invoice_part_total,
     type, status, currency, total_amount, tax_amount, net_amount,
     billing_name, billing_email, billing_phone, billing_address_json,
     shipping_name, shipping_email, shipping_phone, shipping_address_json,
     payload_json, order_snapshot_hash, version, issued_at
   )
   VALUES (?, ?, ?, ?, ?, 'invoice', 'issued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
   ```
   - **스냅샷 필드**: 발급 시점의 주문 정보를 고정 (금액/주소/라인 아이템)
   - **invoice_number**: `PM-INV-YYMMDD-HHmm-{랜덤4자}` 형식
   - **invoice_group_id**: 동일 발급 묶음 식별자 (다장 인보이스 지원)
   - **invoice_part_no**: 파트 번호 (1부터 시작)
   - **invoice_part_total**: 총 파트 수 (마지막 파트 생성 시 확정)
   - **UNIQUE(invoice_number) 충돌 시**: 재시도 1~2회로 새 번호 재발급, 실패 시 장애 보고

7. **orders 업데이트**
   ```sql
   UPDATE orders 
   SET paid_at = NOW(), status = 'paid' 
   WHERE order_id = ?
   ```

8. **COMMIT**
```

---

### 수정 5: 멱등성 2단 계층 명시

**위치**: 두 문서 모두

**추가 내용**:

```markdown
### 멱등성 2단 계층 (재시도/중복 웹훅 대응)

**1단 멱등 (Paid 재처리 진입 방지)**:
- `paid_events` UNIQUE(`order_id`, `payment_key`)로 "Paid 재처리 진입 자체"를 막는다.
- 이미 처리된 주문이면 즉시 종료.

**2단 멱등 (중간 실패 대비)**:
- `order_item_units`: UNIQUE(`stock_unit_id`) - 한 재고 유닛은 한 번만 배정
- `warranties`: UNIQUE(`token_pk`) - 토큰당 레코드 1개 강제, 재판매는 UPDATE로만
- `invoices`: UNIQUE(`invoice_number`) - 인보이스 번호 중복 방지

**원자적 조건 검증**:
- 모든 상태 전이는 `UPDATE ... WHERE 조건`으로만 수행
- `affectedRows=1` 검증 필수
- `affectedRows !== 1`이면 트랜잭션 롤백
```

---

### 수정 6: warranties UNIQUE(token_pk) 명시

**위치**: 두 문서 모두

**추가 내용**:

```markdown
### warranties 테이블 제약

**UNIQUE 제약**:
- `warranties.token_pk`: UNIQUE 제약 필수
- 같은 `token_pk`에 대해 warranties 레코드는 정확히 1개만 존재

**재판매 정책**:
- 재판매 시: INSERT 금지, UPDATE만 허용
- UPDATE 조건: `WHERE token_pk = ? AND status = 'revoked'`
- `affectedRows=1` 검증 필수
- `affectedRows !== 1`이면 트랜잭션 롤백 (이미 issued/active인 토큰 덮어쓰기 방지)
```

---

### 수정 7: 양도 requested 1개 제약 추가

**위치**: 두 문서 모두 (양도 섹션)

**추가 내용**:

```markdown
### 양도 요청 단일화 정책

**규칙**: `warranty_id`당 `requested` 상태는 동시에 1개만 존재

**구현 방식 (취소 후 재생성)**:
1. 새 요청 생성 시:
   - 트랜잭션 시작
   - 기존 `requested` 상태 요청을 `cancelled`로 UPDATE
   - 새 `requested` 요청 INSERT
   - COMMIT

2. DB 제약 (권장):
   - `active_requested` generated column 추가:
     ```sql
     active_requested INT GENERATED ALWAYS AS (
       CASE WHEN status = 'requested' THEN 1 ELSE NULL END
     ) VIRTUAL
     ```
   - UNIQUE(`warranty_id`, `active_requested`) 제약 추가
   - 이렇게 하면 DB 레벨에서 requested 1개 강제

**검증**:
- 새 요청 생성 전 기존 requested 확인
- 기존 requested가 있으면 cancelled 처리 후 재생성
```

---

### 수정 8: 인보이스 다장 모델 추가

**위치**: 두 문서 모두 (인보이스 섹션)

**추가 내용**:

```markdown
### 인보이스 다장 모델

**정책**: 주문이 길어질 경우 여러 장(invoice part)으로 발급 가능

**테이블 구조**:
- `invoices.invoice_group_id`: 동일 발급 묶음 식별자
- `invoices.invoice_part_no`: 파트 번호 (1부터 시작)
- `invoices.invoice_part_total`: 총 파트 수 (마지막 파트 생성 시 확정)

**분할 기준**:
- `payload_json`에 담는 `line_items` 개수가 K개를 넘으면 다음 파트로 넘김 (예: 30개/50개)
- 또는 PDF 렌더링 결과 페이지 수가 P를 넘으면 다음 파트 (보통은 line_items 기준)

**credit_note 정책**:
- `credit_note`는 "환불 대상 unit이 포함된 invoice 파트"를 `related_invoice_id`로 가진다
- 여러 파트에 걸쳐 환불이 발생하면 `credit_note`도 여러 장 가능 (파트별 분리)

**활성화/환불 판정**:
- ⚠️ **중요**: 활성화/환불 판정에 `invoices`를 사용하지 않는다
- 판정 기준: `warranties.status` + 주문 귀속 검증(`orders.user_id` 조인) + `orders.status`, `unit_status`로만 한다
- `invoices`는 증빙/스냅샷 문서일 뿐, 권리 판정 기준이 아니다
```

---

## 📋 문서별 수정 체크리스트

### SYSTEM_FLOW_DETAILED.md 수정 사항

- [ ] 맨 앞에 SSOT 선언부 추가
- [ ] 3-1 섹션: 비회원 토큰 체계 B안으로 수정 (229줄)
- [ ] 3-2 섹션: claim_token 발급 흐름 추가
- [ ] 2-1 섹션: 락 순서 수정 (stock_units → orders → warranties → invoices)
- [ ] 2-1 섹션: 멱등성 2단 계층 명시
- [ ] 2-1 섹션: order_item_units UNIQUE(stock_unit_id) 명시
- [ ] 2-1 섹션: warranties UNIQUE(token_pk) 명시
- [ ] 2-1 섹션: 인보이스 다장 모델 추가
- [ ] 4-1 섹션: "인보이스 연동 확인" → "주문 귀속 검증" 용어 변경
- [ ] 4-1 섹션: 검증 대상 명시 (invoices 제외)
- [ ] 5-1 섹션: 양도 requested 1개 제약 추가
- [ ] 7-1 섹션: warranties UNIQUE(token_pk) + UPDATE만 허용 명시

### FINAL_EXECUTION_SPEC_REVIEW.md 수정 사항

- [ ] 맨 앞에 SSOT 선언부 추가 (25줄 앞에)
- [ ] 핵심 규칙 표 섹션: 전역 정합성 규칙 추가
- [ ] 2-3 섹션: 비회원 토큰 체계 B안 명시
- [ ] 2-3 섹션: claim_token 발급 API 명세 추가
- [ ] 2-1 섹션: 락 순서 전역 규칙 명시
- [ ] 멱등성 계층표: 2단 멱등성 명시 (2030줄)
- [ ] 멱등성 계층표: order_item_units UNIQUE(stock_unit_id) 추가
- [ ] 멱등성 계층표: warranties UNIQUE(token_pk) 추가
- [ ] 멱등성 계층표: invoices UNIQUE(invoice_number) 명시
- [ ] 4 섹션: "인보이스 연동 확인" → "주문 귀속 검증" 용어 변경
- [ ] 4 섹션: 검증 대상 명시 (invoices 제외)
- [ ] 5 섹션: 양도 requested 1개 제약 추가
- [ ] 7 섹션: warranties UNIQUE(token_pk) + UPDATE만 허용 명시
- [ ] 인보이스 섹션: 다장 모델 추가 (invoice_group_id, invoice_part_no)

---

## 🎯 최종 검증 체크리스트

두 문서가 완전히 1:1로 매핑되는지 확인:

- [ ] SSOT 선언부가 두 문서에 동일하게 존재
- [ ] 비회원 토큰 체계가 B안으로 통일
- [ ] 용어가 "주문 귀속 검증"으로 통일
- [ ] 락 순서가 "stock_units → orders → warranties → invoices"로 통일
- [ ] 멱등성이 2단 계층으로 명시
- [ ] warranties UNIQUE(token_pk) 명시
- [ ] 양도 requested 1개 제약 명시
- [ ] 인보이스 다장 모델 명시

---

## 💬 다음 단계

이 수정안을 두 문서에 반영할까요?

"수정 반영" (권장 ✅)
- SYSTEM_FLOW_DETAILED.md 수정
- FINAL_EXECUTION_SPEC_REVIEW.md 수정

"추가 검토"
- 특정 부분 더 검토

"단계별 진행"
- SSOT 선언부터 시작
