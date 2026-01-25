# GPT 피드백 검토 결과 (최종)

## 📋 검토 개요

GPT가 지적한 4가지 문제점과 추가 해결 방안에 대해 실제 코드, 문서, 테이블 스키마를 확인하여 검증했습니다.

---

## 🎯 084 Invoice UNIQUE 정책 최종 확정 (정책 A)

**정책 A (최종 확정)**: **invoice는 주문당 1장만 존재** (issued/void/refunded 무관). 과거 void 다중도 허용하지 않음. 필요하면 void 다중을 하나만 남기고 나머지는 삭제/이관.

**정책 근거**:
- "invoice는 void 후 재발급 불허" 정책과 일관
- "issued 없으면 throw" 정책과 일관
- 단순하고 명확한 정책 (issued/void 구분 불필요)

**084 마이그레이션 반영**:
- Generated column: `invoice_order_id = IF(type='invoice', order_id, NULL)` (status 무관)
- 중복 정리: **type='invoice' 전체**에서 최신 1건만 남기기 (issued/void 무관)
- UNIQUE 제약: `UNIQUE(invoice_order_id)` → 주문당 invoice 1장 강제 (status 무관)

**정책 B (폐기)**: issued invoice만 주문당 1장. void invoice는 여러 장 허용(역사 보존).  
→ 정책 A가 더 효율적이고 단순하므로 채택하지 않음.

---

---

## ✅ 검증 결과 요약

| 문제점 | GPT 지적 | 실제 상태 | 검증 결과 |
|--------|---------|----------|----------|
| 1. 인보이스 중복 방지 | A안 부분 유니크 (invoice 1:1, credit_note 1:N) | `UNIQUE(order_id,type)` 폐기, `invoice_order_id`+UNIQUE | ✅ **A안 채택** |
| 2. 락 순서 충돌 | 문서를 코드에 맞게 수정 | paid/order/claim: `orders` 먼저 잠금 ✅<br>refund/shipment: 아직 미수정 ⚠️ | ✅ **GPT 제안이 타당함** |
| 3. 활성화 검증 SSOT 충돌 | `orders.status` 제거 | 실제 코드에서 사용 | ✅ **GPT 지적이 맞음** |
| 4. 부분 환불 정책 | "표시용 집계"로 명시 | 문서에 언급됨 | ✅ **GPT 지적이 맞음** |

---

### GPT 085 추가 피드백 판정 요약

| 항목 | GPT 지적 | 판정 | 비고 |
|------|----------|------|------|
| **DB `UNIQUE(type, refund_event_id)`** | MySQL NULL + UNIQUE → (credit_note, NULL) 다수 허용, 의도와 불일치 | ✅ **정확** | **generated column + UNIQUE (A안)** 채택 |
| **UUID v7 vs RR-SEQ** | UUID v7 권장 (충돌·동시성·구현 단순) | ✅ **채택** | |
| **ER_DUP_ENTRY 조회** | issued 우선, 없으면 에러 | ✅ **채택** | |
| **refund_event_id 저장** | 컬럼 필수 (JSON만 불가) | ✅ **이미 반영** | |
| **기존 credit_note backfill** | 근거 없으면 NULL 유지 | ✅ **채택** | |
| **pg_refund_id 분리** | 장기적으로 분리 권장 | ✅ **참고** | |
| **refund_event_id 재사용** | 요청마다 새 UUID면 재시도 = 새 이벤트 → 멱등성 깨짐 | ✅ **정확** | **Idempotency-Key 필수** (관리자 환불, 없으면 400) |
| **refund_event_id 형식** | 임의 문자열 위험 → UUID 형식만 허용, 정규식 검증 | ✅ **채택** | 보안/안정성 |
| **ER_DUP_ENTRY 로그** | issued 없을 때 상세 로그 필요 (디버깅) | ✅ **채택** | refund_event_id, warranty_id, 금액 등 |
| **PG 연동 우선순위** | 내부 refund_event_id 항상 유지, pg_refund_id는 외부 참조 | ✅ **채택** | 감사/추적 |
| **락 순서 데드락** | "시작 엔티티 1st lock" → Paid(orders→warranties)와 Refund(warranties→orders) 반대 방향 → 데드락 | ✅ **정확** | **예외 없이 orders 먼저**로 수정 필요 |

**이상한 부분**: 없음.  
**효율적/좋은 부분**: 
- **generated column 패턴** (084와 동일) → MySQL NULL-UNIQUE 함정 정확히 회피
- **UUID v7** → 시퀀스/락 없이 구현 단순
- **issued 우선 조회** → 정책 명확
- **Idempotency-Key 필수화** → 운영 안정성 확보
- **형식 검증** → 보안/안정성 향상
- **상세 로그** → 디버깅/추적 용이
- **084 tie-break** (issued_at DESC + invoice_id DESC) → "최신 1건 유지" 규칙 결정적

**위험 사항**: 
- **락 순서 예외 규칙** → Paid(orders→warranties)와 Refund(warranties→orders) 반대 방향 → **classic deadlock 위험** → **예외 없이 항상 orders 먼저**로 수정 (refund/shipment도 order_id 먼저 조회 후 orders 잠금)
- **Idempotency-Key "있으면 사용"** → 재시도 시 멱등성 깨짐 위험 → **필수**로 변경
- **형식 검증 없음** → 임의 문자열/공백/긴 문자열 입력 가능 → **UUID 형식만 허용**으로 제한
- **ER_DUP_ENTRY 로그 부족** → 디버깅 어려움 → **상세 로그** 추가
- **PG 연동 시 내부 ID 사라질 수 있음** → **항상 유지** 정책 명시
- **invoice void 후 재발급 정책 미명시** → ER_DUP_ENTRY 처리 애매함 → **재발급 불허** 정책 명시
- **invoice-creator.js ER_DUP_ENTRY 버그** → SELECT에 `void_reason`, `voided_at` 없는데 로그에서 참조 → **런타임 undefined** → **SELECT 필드 추가** (issued_at, voided_at, void_reason)
- **084 정렬 issued_at NULL** → NULL인 issued가 섞여 있으면 "최신" 의미 애매 → **`(issued_at IS NULL) ASC` 추가** (NULL은 가장 오래된 취급)
- **refund-routes.js 경쟁 조건** → 락 없이 order_id 조회 후 orders 잠금 → 경쟁 조건 가능성 → **warranties FOR UPDATE 결과로 order_id 검증 assert** 추가
- **Idempotency-Key trim() 없음** → 선행/후행 공백으로 불필요한 400 → **trim() 처리** 추가
- **정규식 case-insensitive 없음** → 대소문자 불일치로 불필요한 400 → **case-insensitive `/i` 플래그** 추가
- **run-migration.js 멀티 스테이트먼트 미확인** → CTE + UPDATE + ALTER 여러 개 실행 실패 가능 → **사전 확인** 필요
- **084 UNIQUE vs 기존 데이터** → type='invoice' 전체에 적용. void 다중 있으면 UNIQUE 실패 → **전체 중복 점검** 후 A/B 확정
- **shipment 락 역전** → order_item_units FOR UPDATE 먼저 사용 중 → **orders 먼저**로 코드 수정 필수

**보안**: 
- **Idempotency-Key 형식 검증** (UUID만 허용, case-insensitive) → SQL injection/임의 값 방지
- **trim() 처리** → 공백 조작 방지
- **길이 제한** (VARCHAR(64)) → DoS 방지

---

## 🔍 상세 검증 결과

### 1. 인보이스 중복 방지 문제

#### 정책 확정 (Credit Note 1:N 반영)
- **invoice**: 주문당 1장 (1:1)
- **credit_note**: 환불 1회당 1장 (1:N) — 부분 환불 시 1개씩 2~3번 가능
- **`UNIQUE(order_id, type)` 폐기**: credit_note까지 주문당 1장으로 막히므로 사용 금지

#### A안 (채택): 부분 유니크
- Generated column: `invoice_order_id = IF(type='invoice', order_id, NULL)` (**정책 A: status 무관**)
- `UNIQUE(invoice_order_id)` → **invoice만** 주문당 1장 강제 (issued/void/refunded 무관), credit_note는 NULL이라 1:N 허용
- **정책 A 확정**: invoice는 주문당 1장만 존재 (void 다중도 허용 안 함)

#### 실제 상태 확인

**테이블 스키마** (`021_create_invoices_table.sql`): `INDEX idx_order_id (order_id)` 만 존재, UNIQUE 없음.

**현재 코드** (`invoice-creator.js`): SELECT 체크 + ER_DUP_ENTRY 처리 (제약 적용 후 `uk_invoices_invoice_order_id` 기준).

#### 검증 결과
✅ **A안 적용.** `UNIQUE(order_id, type)` 대신 **084 A안** (`invoice_order_id` + `uk_invoices_invoice_order_id`) 사용.

---

### 2. 전역 락 순서 재정의

#### GPT 제안
- 문서의 전역 락 순서를 코드 현실에 맞게 재정의
- `orders → stock_units → order_item_units → warranties → invoices`
- "코드를 뜯어고치기"보다 "전역 규칙을 재정의"가 더 안전

#### 실제 상태 확인

**현재 코드 락 순서**:
- `processPaidOrder`: `orders FOR UPDATE` 먼저 (115줄) → `stock_units FOR UPDATE SKIP LOCKED` (296줄)
- `order-routes.js` (Claim): `orders FOR UPDATE` 먼저 (1134줄)
- `refund-routes.js`: `warranties FOR UPDATE` 먼저 (175줄) - 하지만 이건 `warranty_id`로 시작하는 흐름
- `shipment-routes.js`: `order_item_units FOR UPDATE` (433줄) - 하지만 이건 `order_id`로 시작

**문서** (`SYSTEM_FLOW_DETAILED.md` 30줄):
```
1. **전역 락 순서(필수):** `stock_units`(물리) → `orders`(결제) → `warranties`(권리) → `invoices`(문서)
```

#### 검증 결과
✅ **GPT 제안이 타당합니다.**

**이유**:
1. 대부분의 흐름이 `order_id` 중심으로 시작
2. `orders FOR UPDATE` 먼저 잠금하는 것이 일관적
3. 코드 수정보다 문서 수정이 더 안전하고 간단

**권장 수정**:
- 전역 락 순서를 `orders → stock_units → order_item_units → warranties → invoices`로 재정의
- Paid 처리 단계 설명도 이 순서에 맞게 수정

---

### 3. 활성화 검증 SSOT 충돌

#### GPT 제안
- "인보이스 연동 확인" → "주문 귀속 검증(orders.user_id)"
- `orders.status != 'refunded'` 조건 제거
- 환불 여부는 `warranties.status != 'revoked'` + `order_item_units.unit_status != 'refunded'`로만 확인

#### 실제 상태 확인

**SSOT 선언** (`SYSTEM_FLOW_DETAILED.md` 9줄):
```
1. **`orders.status`는 집계 결과(뷰/표시용)이며, 직접 정책 판단 기준으로 사용하지 않는다.**
```

**실제 코드** (`backend/warranty-routes.js` 162-170줄):
```javascript
// 환불 상태 확인: orders.status != 'refunded'
if (order.order_status === 'refunded') {
    return res.status(403).json({
        success: false,
        message: '환불 처리된 주문의 보증서는 활성화할 수 없습니다.'
    });
}
```

#### 검증 결과
✅ **GPT 제안이 정확합니다.**

**권장 수정**:
1. 코드에서 `orders.status` 확인 제거
2. 문서에서 "인보이스 연동 확인" 표현 수정
3. 환불 여부는 `warranties.status` + `order_item_units.unit_status`로만 확인

---

### 4. 부분 환불 정책 설명

#### GPT 제안
- `orders.status = 'refunded'` 언급을 "표시용 집계"로 명시
- 정책 판단 기준이 아님을 명확히 구분

#### 실제 상태 확인

**문서** (`SYSTEM_FLOW_DETAILED.md` 697-699줄):
```
**⚠️ 부분 환불 정책**:
- **전량 환불**: 모든 unit이 `refunded` → `orders.status = 'refunded'`  ⚠️ 언급됨
```

#### 검증 결과
✅ **GPT 제안이 정확합니다.**

**권장 수정**:
- `orders.status = 'refunded'`는 "집계 함수로 표시됨 (표시용)"으로 명시
- 정책 판단 기준이 아님을 명확히 구분

---

## 📝 실행 계획 (최소 변경으로 균형 맞추기)

### 1. 인보이스 중복 데이터 점검 및 UNIQUE 제약 추가

**1-1. 중복 데이터 점검 쿼리** (마이그레이션 전 필수):
```sql
-- invoice 타입이 주문당 2장 이상 존재하는지
SELECT order_id, type, COUNT(*) AS cnt
FROM invoices
WHERE type='invoice'
GROUP BY order_id, type
HAVING cnt > 1;
```

**1-2. 마이그레이션 파일 생성**:
```sql
-- backend/migrations/XXX_add_invoices_order_type_unique.sql
USE prepmood;

-- 중복 데이터 확인 (실행 전 필수)
SELECT order_id, type, COUNT(*) AS cnt
FROM invoices
WHERE type='invoice'
GROUP BY order_id, type
HAVING cnt > 1;

-- 제약 추가 (A안): invoice_order_id generated + UNIQUE(invoice_order_id)
-- → CREDIT_NOTE_POLICY_AND_084.md 및 084_add_invoices_invoice_order_id_unique.sql 참고
```

**1-3. 문서 수정** (`SYSTEM_FLOW_DETAILED.md` 42줄):
```
- `invoices`: 
  - `UNIQUE(invoice_number)`
  - `UNIQUE(invoice_order_id)` (A안: invoice만 주문당 1장, credit_note 1:N 유지)
```

---

### 2. 전역 락 순서 재정의

**문서 수정** (`SYSTEM_FLOW_DETAILED.md` 30줄):
```
1. **전역 락 순서(필수):** `orders`(결제) → `stock_units`(물리) → `order_item_units`(물류) → `warranties`(권리) → `invoices`(문서)
```

**문서 수정** (`SYSTEM_FLOW_DETAILED.md` 142-150줄):
```
2. **주문 잠금** (FOR UPDATE) - ⚠️ 락 순서 1단계: orders(결제)
   SELECT * FROM orders WHERE order_id = ? FOR UPDATE

3. **재고 배정** (각 order_item별로) - ⚠️ 락 순서 2단계: stock_units(물리)
   - `stock_units`에서 `status = 'in_stock'`인 재고 선택
   - `FOR UPDATE SKIP LOCKED` 사용
   - `status = 'reserved'`, `reserved_at = NOW()`, `reserved_by_order_id = order_id`로 업데이트
```

**코드 주석 수정** (`backend/utils/paid-order-processor.js` 91줄):
```javascript
// ============================================================
// 1. 주문 잠금 및 금액 검증 (락 순서 1단계: orders)
// ============================================================
```

**코드 주석 수정** (`backend/utils/paid-order-processor.js` 201줄):
```javascript
// ============================================================
// 4. 재고 배정 (락 순서 2단계: stock_units)
// ============================================================
```

---

### 3. 활성화 검증 SSOT 준수

**문서 수정** (`SYSTEM_FLOW_DETAILED.md` 396-407줄):
```
3. **핵심 검증: 주문 귀속 검증 및 환불 여부 확인**
   ```sql
   SELECT o.user_id, oiu.unit_status
   FROM warranties w
   JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
   JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
   JOIN orders o ON oi.order_id = o.order_id
   WHERE w.warranty_id = ?
   ```
   - `orders.user_id = 현재 로그인한 user_id` 확인 (주문 귀속 검증)
   - `warranties.status != 'revoked'` 확인 (환불된 보증서가 아닌지) - 이미 위에서 확인됨
   - `order_item_units.unit_status != 'refunded'` 확인 (환불된 주문 항목이 아닌지)
   - ⚠️ `orders.status`는 사용하지 않음 (집계 결과일 뿐)
```

**코드 수정** (`backend/warranty-routes.js` 162-170줄):
```javascript
// ⚠️ SSOT 1번 규칙 준수: orders.status는 사용하지 않음 (집계 결과일 뿐)
// 환불 여부는 warranties.status와 order_item_units.unit_status로만 확인

// 환불 상태 확인: order_item_units.unit_status != 'refunded'
if (order.unit_status === 'refunded') {
    await connection.rollback();
    await connection.end();
    return res.status(403).json({
        success: false,
        message: '환불 처리된 주문 항목의 보증서는 활성화할 수 없습니다.'
    });
}

// ⚠️ orders.status 확인 제거 (SSOT 1번 규칙 준수)
// warranty.status는 이미 위에서 확인됨 (96-102줄)
```

**문서 수정** (`SYSTEM_FLOW_DETAILED.md` 446-449줄):
```
**실패 사례 1: 주문이 계정에 연동되지 않음**
- 환불 전에 QR 코드를 사진으로 저장한 경우
- 환불 후 활성화 시도 시 `orders.user_id != 현재 user_id` 또는 `order_item_units.unit_status = 'refunded'`
- **결과**: 활성화 불가 (핵심 방어 메커니즘)
```

---

### 4. 부분 환불 정책 설명 수정

**문서 수정** (`SYSTEM_FLOW_DETAILED.md` 697-699줄):
```
**⚠️ 부분 환불 정책**:
- **전량 환불**: 모든 unit이 `refunded` → `orders.status`는 집계 함수로 `'refunded'`로 **표시됨** (표시용, 정책 판단 기준 아님)
- **일부 환불**: 일부 unit만 `refunded` → 배송 상태 유지 (`partial_shipped`/`partial_delivered`), 별도 refund 상태/금액 표시
- ⚠️ **주의**: `orders.status`는 집계 결과일 뿐이며, 정책 판단 기준으로 사용하지 않음
```

---

## ✅ 최종 결론

GPT의 추가 피드백은 모두 **정확하고 실행 가능**합니다:

1. ✅ **인보이스 UNIQUE 제약**: **`UNIQUE(order_id, type)` 폐기**, `invoice_order_id` partial unique (A안) 적용
2. ✅ **락 순서 재정의**: 문서를 코드에 맞게 수정하는 것이 더 안전하고 합리적
3. ✅ **활성화 검증 SSOT 준수**: `orders.status` 제거, 표현 수정
4. ✅ **부분 환불 정책**: "표시용 집계"로 명시

**추가 위험 포인트 3개 (GPT 지적)**:
1. ✅ **중복 invoice 처리 규칙**: 마이그레이션 전 중복 데이터 정리 규칙 필요
2. ✅ **DB 충돌 처리**: `invoice-creator.js`에서 INSERT 실패 시 duplicate key 처리 필요
3. ✅ **락 순서 예외**: refund/shipment처럼 시작점이 다른 경우 문서에 예외 문구 필요

---

## 🔒 추가 위험 포인트 상세 검증

### 1-1. 중복 invoice 처리 규칙

#### GPT 제안
- 마이그레이션 전 중복 데이터 점검 필수
- 중복이 있으면 `issued_at` 최신 1건 유지, 나머지는 **삭제(DELETE)**.  
  ⚠️ **void 처리 금지**: UPDATE로 `status='void'`만 바꾸면 generated column 값이 동일해 UNIQUE 추가 실패. 정리 방식은 **DELETE**(또는 archive 이관 후 DELETE)만 사용.

#### 실제 상태 확인

**테이블 스키마** (`backend/migrations/021_create_invoices_table.sql`):
```sql
status ENUM('issued', 'void', 'refunded') DEFAULT 'issued',
voided_at DATETIME NULL,
void_reason TEXT NULL,
```

**현재 상태**:
- `status='void'` 컬럼 존재 ✅ (정책적 상태 표시용)
- **정책 명시**: void는 상태(enum)로 존재하지만, **중복 정리 방법으로는 사용 금지** (DELETE만 사용)
- 중복 데이터 정리 규칙: **DELETE** 사용 (084 마이그레이션 반영 완료)

#### 검증 결과
✅ **GPT 제안이 정확합니다.**

**권장 수정(반영 완료)**:
- 마이그레이션 파일에 중복 데이터 정리 규칙 추가
- 중복이 있으면 `issued_at` 최신 1건 유지, 나머지는 **삭제(DELETE)**. void 처리 사용 금지.

---

### 1-2. invoice-creator.js DB 충돌 처리

#### GPT 제안
- INSERT 실패 시 `ER_DUP_ENTRY` (duplicate key) 에러 처리
- 중복 키 에러면 기존 invoice를 조회해서 반환
- "SELECT 체크"는 보조, "DB 충돌 처리"가 본체

#### 실제 상태 확인

**현재 코드** (`backend/utils/invoice-creator.js` 220-234줄):
```javascript
} catch (sqlError) {
    Logger.error('[INVOICE] SQL INSERT 실패', {
        order_id: orderId,
        invoice_number: invoiceNumber,
        error: sqlError.message,
        error_code: sqlError.code,
        ...
    });
    throw sqlError;  // ⚠️ duplicate key 에러를 처리하지 않음
}
```

**다른 파일의 패턴** (`backend/utils/paid-order-processor.js` 383줄, `backend/order-routes.js` 610줄):
- `ER_DUP_ENTRY` 에러를 처리하는 패턴 존재 ✅

#### 검증 결과
✅ **GPT 제안이 정확합니다.**

**권장 수정**:
- INSERT 실패 시 `error.code === 'ER_DUP_ENTRY'` 확인
- duplicate key면 기존 invoice를 조회해서 반환

---

### 1-3. 락 순서 예외 문구

#### GPT 제안
- 전역 락 순서를 "가능한 경우 orders부터"로 수정
- 시작점이 다른 경우 (refund: warranty_id, shipment: order_item_units) 예외 명시
- "시작 엔티티를 1st lock으로 두고, 이후는 위 순서를 유지"

#### 실제 상태 확인

**현재 코드**:
- `refund-routes.js`: `warranties FOR UPDATE` 먼저 (175줄) - `warranty_id`로 시작
- `shipment-routes.js`: `order_item_units FOR UPDATE` 먼저 (433줄) - `order_id`로 시작하지만 `order_item_units`부터 잠금
- `processPaidOrder`: `orders FOR UPDATE` 먼저 (115줄) - `order_id`로 시작

**문서** (`SYSTEM_FLOW_DETAILED.md` 30줄):
```
1. **전역 락 순서(필수):** `stock_units`(물리) → `orders`(결제) → `warranties`(권리) → `invoices`(문서)
```

#### 검증 결과
✅ **GPT 추가 피드백이 정확합니다.** (데드락 위험 지적)

**문제점**:
- refund는 `warranty_id`로 시작하므로 `warranties`부터 잠금 → Paid(orders→warranties)와 반대 방향 → **데드락 위험**
- shipment는 `order_item_units`부터 잠금 → 역시 반대 방향 가능

**권장 수정 (A안 채택)**:
- 전역 락 순서를 **"예외 없이 orders부터"**로 고정
- refund/shipment도 (락 없이) order_id 먼저 조회 → `orders FOR UPDATE` 먼저 잠금 → 이후 순서 유지

---

## 📝 최종 실행 계획 (바로 커밋 가능한 형태)

### Step 1. DB 점검

**1-1. invoice 중복 데이터 점검**:
```sql
-- invoice 타입이 주문당 2장 이상 존재하는지
SELECT order_id, type, COUNT(*) AS cnt
FROM invoices
WHERE type='invoice'
GROUP BY order_id, type
HAVING cnt > 1;
```

**1-2. credit_note 타입 점검** (혹시 type 값이 잘못 들어간 사례 확인):
```sql
SELECT type, COUNT(*) FROM invoices GROUP BY type;
```

---

### Step 2. 마이그레이션 파일 (084 A안)

**파일**: `backend/migrations/084_add_invoices_invoice_order_id_unique.sql`

**정책**: invoice 1:1, credit_note 1:N. **`UNIQUE(order_id, type)` 사용 안 함.**  
A안: `invoice_order_id` generated column + `UNIQUE(invoice_order_id)`.

**⚠️ MySQL 8.0+** (윈도우 함수 사용).

**전체 SQL**:
```sql
-- ============================================================
-- 084_add_invoices_invoice_order_id_unique.sql
-- A안: invoice만 주문당 1장 강제 (credit_note 1:N 유지)
-- - invoice_order_id generated column
-- - UNIQUE(invoice_order_id)
-- ============================================================

USE prepmood;

-- ============================================================
-- 0. type='invoice' 전체 중복 점검 (UNIQUE 적용 전 필수)
-- ============================================================
SELECT '=== type=invoice 전체 중복 점검 (필수) ===' AS info;
SELECT order_id, COUNT(*) AS cnt FROM invoices WHERE type = 'invoice' GROUP BY order_id HAVING cnt > 1;

-- ============================================================
-- 1. 중복 invoice 확인 (issued 기준)
-- ============================================================
SELECT '=== 중복 invoice 확인 (issued) ===' AS info;
SELECT order_id, type, COUNT(*) AS cnt
FROM invoices
WHERE type = 'invoice' AND status = 'issued'
GROUP BY order_id, type
HAVING cnt > 1;

-- ============================================================
-- 2. 정리 전 상태 확인
-- ============================================================
SELECT '=== 정리 전 상태 ===' AS info;
SELECT
    order_id,
    COUNT(*) AS total_count,
    SUM(CASE WHEN status = 'issued' THEN 1 ELSE 0 END) AS issued_count,
    SUM(CASE WHEN status = 'void' THEN 1 ELSE 0 END) AS void_count,
    SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) AS refunded_count
FROM invoices
WHERE type = 'invoice'
GROUP BY order_id
HAVING COUNT(*) > 1;

-- ============================================================
-- 3. 중복 invoice 정리 (DELETE 사용. void 처리 금지)
-- 정책 A: type='invoice' 전체에서 최신 1건만 남기기 (issued/void/refunded 무관)
-- ⚠️ UPDATE로 void만 바꾸면 invoice_order_id 동일 유지 → UNIQUE 추가 실패. DELETE 필수.
-- 순서: (A) 유지할 invoice_id 결정 → (B) credit_note 리맵 → (C) 삭제 → (D) UNIQUE 추가
-- (실제 SQL은 backend/migrations/084_add_invoices_invoice_order_id_unique.sql 참고)
-- ============================================================

-- ============================================================
-- 4. 정리 후 확인 (정책 A: type='invoice' 전체)
-- ============================================================
SELECT '=== 정리 후 확인 (type=invoice 전체) ===' AS info;
SELECT order_id, COUNT(*) AS cnt
FROM invoices
WHERE type = 'invoice'
GROUP BY order_id
HAVING cnt > 1;
-- 기대: 0건 (정책 A: 주문당 invoice 1장만 존재)

-- ============================================================
-- 5. Generated column 추가 (A안, 정책 A)
-- invoice일 때만 order_id, 아니면 NULL (status 무관)
-- ============================================================
ALTER TABLE invoices
ADD COLUMN invoice_order_id INT NULL
    GENERATED ALWAYS AS (IF(type = 'invoice', order_id, NULL)) STORED
    COMMENT 'invoice 전용: 주문당 1장 강제 (정책 A: type=invoice일 때만 order_id, status 무관, credit_note는 NULL)'
    AFTER order_id;

-- ============================================================
-- 6. UNIQUE(invoice_order_id) 추가 (정책 A)
-- invoice만 중복 방지 (status 무관), credit_note는 NULL이라 1:N 허용
-- ============================================================
ALTER TABLE invoices
ADD UNIQUE KEY uk_invoices_invoice_order_id (invoice_order_id);

-- ============================================================
-- 7. 제약 확인
-- ============================================================
SELECT '=== UNIQUE 제약 확인 ===' AS info;
SHOW INDEX FROM invoices WHERE Key_name = 'uk_invoices_invoice_order_id';
```

---

### Step 3. invoice-creator.js 수정

**수정 위치**: `backend/utils/invoice-creator.js` 220-234줄

**수정 내용** (안정적인 패턴: ER_DUP_ENTRY만 체크, sqlMessage 의존성 제거):
```javascript
        } catch (sqlError) {
            // ⚠️ DB 충돌 처리: UNIQUE 제약 위반 시 기존 invoice 반환
            // 안정성: code === 'ER_DUP_ENTRY'만 체크 (sqlMessage 포맷 의존성 제거)
            if (sqlError.code === 'ER_DUP_ENTRY') {
                Logger.log('[INVOICE] 중복 인보이스 감지 (DB 제약), 기존 인보이스 조회', {
                    order_id: orderId,
                    error_code: sqlError.code,
                    sql_message: sqlError.sqlMessage
                });
                
                // 기존 인보이스 조회 (issued 최신 1건)
                // ⚠️ void_reason, voided_at 포함 (로그/조사 가치)
                const [existingInvoices] = await connection.execute(
                    `SELECT invoice_id, invoice_number, status, issued_at, voided_at, void_reason
                     FROM invoices 
                     WHERE order_id = ? 
                       AND type = 'invoice'
                     ORDER BY 
                       CASE WHEN status = 'issued' THEN 0 ELSE 1 END,
                       (issued_at IS NULL) ASC,
                       issued_at DESC,
                       invoice_id DESC
                     LIMIT 1`,
                    [orderId]
                );

                if (existingInvoices.length > 0) {
                    const existing = existingInvoices[0];
                    
                    // ⚠️ 정책: issued가 없고 void/refunded만 있으면 에러
                    // invoice는 void 후 재발급을 허용하지 않는다 (필요 시 주문 단위로 별도 프로세스)
                    if (existing.status !== 'issued') {
                        Logger.error('[INVOICE] 중복 인보이스가 issued 상태가 아님 (void/refunded)', {
                            order_id: orderId,
                            invoice_id: existing.invoice_id,
                            invoice_number: existing.invoice_number,
                            status: existing.status,
                            void_reason: existing.void_reason || null,
                            voided_at: existing.voided_at || null
                        });
                        throw new Error(`이미 ${existing.status} 상태의 인보이스가 존재합니다. (invoice_id=${existing.invoice_id}) 인보이스는 void 후 재발급을 허용하지 않습니다.`);
                    }

                    Logger.log('[INVOICE] 기존 인보이스 반환 (DB 충돌 처리)', {
                        order_id: orderId,
                        invoice_id: existing.invoice_id,
                        invoice_number: existing.invoice_number
                    });
                    return {
                        invoice_id: existing.invoice_id,
                        invoice_number: existing.invoice_number
                    };
                } else {
                    // 조회 결과가 없으면 트랜잭션 가시성 문제 또는 데이터 꼬임
                    Logger.error('[INVOICE] ER_DUP_ENTRY 발생했으나 기존 인보이스 조회 실패', {
                        order_id: orderId,
                        error_code: sqlError.code,
                        sql_message: sqlError.sqlMessage
                    });
                    throw new Error('인보이스 중복 감지되었으나 기존 인보이스를 찾을 수 없습니다.');
                }
            }

            // 다른 SQL 에러는 그대로 throw
            Logger.error('[INVOICE] SQL INSERT 실패', {
                order_id: orderId,
                invoice_number: invoiceNumber,
                error: sqlError.message,
                error_code: sqlError.code,
                sql_state: sqlError.sqlState,
                sql_message: sqlError.sqlMessage,
                billing_name: billingName,
                billing_email: billingEmail,
                shipping_name: shippingName,
                shipping_email: shippingEmail
            });
            throw sqlError;
        }
```

---

### Step 4. warranty-routes.js 수정

**수정 위치**: `backend/warranty-routes.js` 162-170줄

**⚠️ 필드 매핑 확인**:
- 132줄: `oiu.unit_status`로 조회됨 ✅
- 150줄: `order = orderInfo[0]`로 접근
- 173줄: `order.unit_status`로 접근 ✅ (필드명 정확)

**수정 내용** (SSOT 준수 + 메시지 일관성):
```javascript
            // ⚠️ SSOT 1번 규칙 준수: orders.status는 사용하지 않음 (집계 결과일 뿐)
            // 환불 여부는 warranties.status와 order_item_units.unit_status로만 확인
            // (3종 차단: warranty.status, order_item_units.unit_status, orders.user_id)

            // 환불 상태 확인: order_item_units.unit_status != 'refunded'
            if (order.unit_status === 'refunded') {
                await connection.rollback();
                await connection.end();
                return res.status(403).json({
                    success: false,
                    message: '환불 처리된 주문 항목의 보증서는 활성화할 수 없습니다.'
                });
            }

            // ⚠️ orders.status 확인 제거 (SSOT 1번 규칙 준수)
            // warranty.status는 이미 위에서 확인됨 (96-102줄: revoked 체크)
            // order_item_units.unit_status는 위에서 확인됨
            // orders.user_id는 152-160줄에서 확인됨 (주문 귀속 검증)
```

---

### Step 5. SYSTEM_FLOW_DETAILED.md 수정

**5-1. 전역 락 순서 수정** (30줄):
```
1. **전역 락 순서(필수):** 예외 없이 `orders`(결제) → `stock_units`(물리) → `order_item_units`(물류) → `warranties`(권리) → `invoices`(문서)
   
   **⚠️ 데드락 방지 원칙**: 모든 트랜잭션은 반드시 위 순서대로만 잠금을 획득한다.
   
      **시작점이 다른 경우 (refund/shipment)**:
   - **refund (warranty_id로 시작)**: 
     1. **1단계 (읽기만)**: (락 없이) warranty에서 order_id 조회 (식별자 확인)
     2. **2단계 (잠금)**: `orders FOR UPDATE` 먼저 잠금 (전역 순서 준수)
     3. **3단계 (잠금)**: 이후 `warranties FOR UPDATE` 잠금
     4. **검증 (옵션 A)**: warranties FOR UPDATE로 읽은 결과의 order_id가 최초 조회한 order_id와 동일한지 assert
   - **shipment (order_item_units로 시작)**:
     1. **1단계 (읽기만)**: (락 없이) order_item_units에서 order_id 조회 (식별자 확인)
     2. **2단계 (잠금)**: `orders FOR UPDATE` 먼저 잠금 (전역 순서 준수)
     3. **3단계 (잠금)**: 이후 `order_item_units FOR UPDATE` 잠금
   
   **핵심**: 시작 엔티티가 orders가 아닌 경우, **1단계는 '락 없는 식별자 조회'만 허용**하며, **실제 FOR UPDATE 잠금 획득은 반드시 orders부터 시작**한다. 시작점이 다르더라도, **반드시 orders를 먼저 잠근 후** 다른 엔티티를 잠금하여 데드락을 설계적으로 방지한다.
```

**5-2. Paid 처리 단계 설명 수정** (142-150줄):
```
2. **주문 잠금** (FOR UPDATE) - ⚠️ 락 순서 1단계: orders(결제)
   SELECT * FROM orders WHERE order_id = ? FOR UPDATE

3. **재고 배정** (각 order_item별로) - ⚠️ 락 순서 2단계: stock_units(물리)
   - `stock_units`에서 `status = 'in_stock'`인 재고 선택
   - `FOR UPDATE SKIP LOCKED` 사용
   - `status = 'reserved'`, `reserved_at = NOW()`, `reserved_by_order_id = order_id`로 업데이트
```

**5-3. 환불 처리 락 순서 수정** (`refund-routes.js`):
```
환불 처리 시 락 순서 (전역 순서 준수):
1. (락 없이) warranty에서 order_id 조회
2. orders FOR UPDATE (락 순서 1단계)
3. warranties FOR UPDATE (락 순서 4단계)
4. 이후 stock_units, order_item_units, invoices 순서 유지
```

**5-4. 활성화 검증 수정** (396-407줄):
```
3. **핵심 검증: 주문 귀속 검증 및 환불 여부 확인**
   ```sql
   SELECT o.user_id, oiu.unit_status
   FROM warranties w
   JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
   JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
   JOIN orders o ON oi.order_id = o.order_id
   WHERE w.warranty_id = ?
   ```
   - `orders.user_id = 현재 로그인한 user_id` 확인 (주문 귀속 검증)
   - `warranties.status != 'revoked'` 확인 (환불된 보증서가 아닌지) - 이미 위에서 확인됨
   - `order_item_units.unit_status != 'refunded'` 확인 (환불된 주문 항목이 아닌지)
   - ⚠️ `orders.status`는 사용하지 않음 (집계 결과일 뿐)
```

**5-5. 부분 환불 정책 수정** (697-699줄):
```
**⚠️ 부분 환불 정책**:
- **전량 환불**: 모든 unit이 `refunded` → `orders.status`는 집계 함수로 `'refunded'`로 **표시됨** (표시용, 정책 판단 기준 아님)
- **일부 환불**: 일부 unit만 `refunded` → 배송 상태 유지 (`partial_shipped`/`partial_delivered`), 별도 refund 상태/금액 표시
- ⚠️ **주의**: `orders.status`는 집계 결과일 뿐이며, 정책 판단 기준으로 사용하지 않음
```

**5-6. invoices UNIQUE 제약 수정** (42줄):
```
- `invoices`: 
  - `UNIQUE(invoice_number)`
  - `UNIQUE(invoice_order_id)` (A안: invoice만 주문당 1장. `invoice_order_id = IF(type='invoice', order_id, NULL)` generated column)
  - `UNIQUE(credit_note_refund_event_id)` (085 적용 시. `credit_note_refund_event_id = IF(type='credit_note', refund_event_id, NULL)` generated column → credit_note 환불 이벤트 중복 방지)
  - ⚠️ **`UNIQUE(order_id, type)` 사용 안 함** — credit_note 1:N 유지
```

**5-7. credit_note 정책 확정** (694줄):
```
6. **credit_note 생성** (`invoices` 테이블, `type='credit_note'`):
   - `related_invoice_id`: 원본 invoice_id
   - `payload_json`: 환불 대상 unit 식별자(`order_item_unit_id` 리스트), 환불 금액/세금/통화, 환불 사유, 환불 트랜잭션 키(`payment_key`) 포함
   - **정책**: **credit_note 1:N** — 환불 1회당 1장. 부분 환불은 credit_note 여러 장으로 누적.
   - ⚠️ **락 순서/역전 금지 규칙은 그대로 유지**
```

---

## 📋 085 마이그레이션: Credit Note 식별자 (환불 이벤트 중복 방지)

### 목적
**"같은 환불 이벤트"로 credit_note 중복 발급 방지** (멱등성 확보)

### ⚠️ 중요한 정정
- ❌ **"1 warranty = 1 credit_note"는 정책이 아님**
- ✅ **"1 환불 이벤트 = 1 credit_note"가 정답**
- 같은 warranty에 대해 재환불, 보상 환불, PG 분할 환불 등이 가능하므로 warranty 기준으로는 중복 방지 불가

### 정책 확정
- credit_note는 **환불 이벤트 1회당 1장** 발급
- 환불 이벤트는 **PG refund_id (우선)** 또는 **내부 refund_request_id**로 식별
- 동일 refund_event로는 credit_note 중복 발급 불가

### 현재 단계 (085)
- PG 환불 API 연동 없음 → **`internal_refund_request_id` 사용** (서버에서 **UUID v7** 생성, 권장)
- 향후 PG 연동 시 **`pg_refund_id` 컬럼 분리** 고려 (`refund_event_id` = 내부 항상, `pg_refund_id` = 있으면 채움)

---

## 🔍 GPT 추가 피드백 검증 (085 DB/API)

### 0. DB 제약: `UNIQUE(type, refund_event_id)` 동작 문제 ⚠️ **채택**

**GPT 지적**: MySQL에서 `UNIQUE`는 **NULL을 서로 다르게 취급** → `(type, NULL)` 여러 건 허용. 기존 credit_note가 `refund_event_id` NULL이면 제약이 막지 못함. "type='credit_note'일 때만 값 존재"를 **강제**하려면 CHECK/generated column 필요.

**판정**: ✅ **정확함.** `UNIQUE(type, refund_event_id)`만으로는 의도대로 동작하지 않음.

**해결 (A안 채택)**: 084와 동일하게 **generated column + UNIQUE** 패턴.
- `refund_event_id` VARCHAR(64) NULL 유지 (컬럼)
- `credit_note_refund_event_id` = `IF(type='credit_note', refund_event_id, NULL)` **STORED generated**
- **`UNIQUE(credit_note_refund_event_id)`** → credit_note 중 **refund_event_id가 있는 행만** 유일 보장. invoice·기존 NULL credit_note는 영향 없음.

**B안 (참고)**: `refund_event_id`를 credit_note에서 NOT NULL + `CHECK (type <> 'credit_note' OR refund_event_id IS NOT NULL)`. 기존 NULL backfill 불가 시 CHECK 추가 어려움 → **A안 유지.**

---

### 1. `refund_event_id` 형식: UUID v7 vs RR-YYYYMMDD-SEQ ✅ **채택**

**GPT**: UUID v7 권장. 충돌 가능성 실질적 0, 분산/동시성에 강함. RR-YYYYMMDD-SEQ는 시퀀스 관리(락/테이블)로 복잡도 증가.

**판정**: ✅ **UUID v7 채택.** 멱등성 목적에는 UUID v7이 더 낫다.

---

### 2. ER_DUP_ENTRY 시 조회 조건 ✅ **채택**

**GPT**: `type='credit_note'` AND `refund_event_id=?` AND **`status='issued'` 우선**. 없으면 최근 1건 fallback? → **issued 없고 void/refunded만 있으면 정책적으로 에러** (원인 조사).

**판정**: ✅ **반영.** 조회 시 `status='issued'` 우선 정렬, issued 없으면 에러 throw (기존 invoice-creator 패턴과 동일).

---

### 3. `refund_event_id` 저장 위치 ✅ **이미 반영**

**GPT**: payload_json만이 아니라 **컬럼으로 반드시 분리**. UNIQUE/조회/멱등성은 JSON 인덱싱으로 처리 어렵고 비쌈.

**판정**: ✅ **이미 컬럼 추가로 설계됨.** 유지.

---

### 4. 기존 credit_note backfill ✅ **NULL 유지 (권장)**

**GPT**: 과거 환불 이벤트를 정확히 재구성할 식별자가 없으면 backfill은 **추측** → 오히려 위험. **NULL 유지**하고, **향후 생성분부터만** `refund_event_id` 채우기.

**판정**: ✅ **NULL 유지.** backfill은 근거 있을 때만 (payload_json·PG 로그 등).

---

### 5. `pg_refund_id` 분리 (장기) ✅ **참고**

**GPT**: `refund_event_id`를 내부/PG 혼용 문자열로 써도 되나, 운영 확대 시 헷갈림. **`refund_event_id`** (내부 UUID, 항상) + **`pg_refund_id`** (있으면 채움). UNIQUE는 둘 중 하나에.

**판정**: ✅ **향후 확장 시 반영.** 당장 필수 아님.

---

### 6. **⚠️ refund_event_id 재사용 (멱등성 핵심)** — **반드시 보완**

**GPT**: **요청마다 새 UUID 생성**이면, **재시도 = 새 이벤트** → credit_note 중복 발급 위험. "재시도에 동일 ID"를 보장하려면:
- **Idempotency-Key** (클라이언트 전달) 사용, 또는
- **`refund_requests` 테이블**로 선발급 후 ID 재사용.

**판정**: ✅ **정확함.** 현재 계획대로면 **멱등성 미달.**

**보완 방안** (택일):

| 방안 | 설명 | 비고 |
|------|------|------|
| **A. Idempotency-Key 헤더 (필수)** | `Idempotency-Key: <uuid>` 수신 → `refund_event_id`로 사용. 재시도 시 동일 키 → 동일 ID. **없으면 400 에러.** | 클라이언트(관리자 UI) 수정 필요, **운영 안정성 최고** |
| **B. refund_requests 테이블** | 환불 요청 시 `refund_requests` INSERT → `refund_request_id` 발급. 이 값을 `refund_event_id`로 사용. 재시도 시 동일 요청 조회 후 ID 재사용. | DB·API 추가, 구조 명확, 구현 부담 큼 |
| **C. (warranty_id + 요청 시점) 기반** | 예: `hash(warranty_id \|\| reason \|\| rounded_timestamp)`. 근거 불명확·충돌 가능 → **비권장.** | |

**권장**: **A (Idempotency-Key 필수)** 채택. 관리자 환불이므로 멱등성 보장이 필수. "있으면 사용"은 운영 중 재시도 시 멱등성 깨짐 위험.

**085 반영 시**: `POST /api/admin/refunds/process`에 **`Idempotency-Key` (필수)** 지원. 없으면 400 에러. 관리자 환불이므로 멱등성 보장 필수.

---

### 7. 요약: GPT 피드백 중 채택·보완 사항

| 항목 | 채택 | 비고 |
|------|------|------|
| DB 제약 | ✅ generated column + UNIQUE (A안) | `credit_note_refund_event_id` |
| UUID v7 | ✅ | `internal_refund_request_id` |
| ER_DUP_ENTRY 조회 | ✅ issued 우선, 없으면 에러 | |
| `refund_event_id` 컬럼 | ✅ | payload_json과 분리 유지 |
| 기존 credit_note | ✅ NULL 유지 | backfill 불가 시 |
| `pg_refund_id` 분리 | ✅ 장기 검토 | |
| **refund_event_id 재사용** | ✅ **Idempotency-Key 필수** (없으면 400) | **085 API 보완 필수, 관리자 환불이므로** |
| **refund_event_id 형식** | ✅ **UUID 형식만 허용, 정규식 검증** | 보안/안정성 |
| **ER_DUP_ENTRY 로그** | ✅ **상세 로그 (refund_event_id, warranty_id, 금액 등)** | 디버깅/추적 |
| **PG 연동 우선순위** | ✅ **내부 refund_event_id 항상 유지, pg_refund_id는 외부 참조** | 감사/추적 |

---

## 🔍 GPT 추가 피드백 검증 (운영 위험 사항)

### 0. 전역 락 순서: "시작 엔티티를 1st lock" 데드락 위험 ⚠️ **수정 필요**

**GPT 지적**: Paid 흐름은 `orders → warranties`, Refund 흐름은 `warranties → orders`로 반대 방향 → **classic deadlock** 발생 가능.

**현재 코드 확인**:
- `paid-order-processor.js`: `orders FOR UPDATE` 먼저 (115줄) → `warranties FOR UPDATE` (425줄)
- `refund-routes.js`: `warranties FOR UPDATE` 먼저 (175줄) → 이후 `orders` 조회 (락 없이)

**판정**: ✅ **정확함.** 데드락 위험 존재.

**해결 (A안 채택)**: **예외 없이 항상 같은 방향**으로 고정.
- refund가 `warranty_id`로 시작하더라도:
  1. (락 없이) warranty에서 `order_id` 먼저 조회
  2. `orders FOR UPDATE` 먼저 잠금
  3. 이후 `warranties FOR UPDATE` 잠금

**반영**: 
- 문서: "예외 없이" 전역 순서 준수, refund/shipment도 `orders` 먼저 잠금
- 코드: `refund-routes.js` 수정 필요 (warranty 조회 후 `orders FOR UPDATE` 먼저)

---

## 🔍 GPT 추가 피드백 검증 (구현 버그 및 안전장치)

### 1. invoice-creator.js ER_DUP_ENTRY 처리 버그 ⚠️ **수정 필요**

**GPT 지적**: SELECT에 `invoice_id, invoice_number, status`만 있는데, 로그에서 `existing.void_reason`, `existing.voided_at`를 참조 → **런타임에서 undefined**.

**판정**: ✅ **정확함.** 버그 존재.

**해결**: SELECT에 `issued_at, voided_at, void_reason` 포함.

**반영**: 코드 수정 완료 (문서에 반영).

---

### 2. 084 마이그레이션 정렬: issued_at NULL 안전장치 ✅ **채택**

**GPT 지적**: `ORDER BY issued_at DESC, invoice_id DESC`는 일반적으로 충분하지만, `issued_at`이 NULL인 issued가 섞여 있으면 "최신" 의미가 애매해질 수 있음 (MySQL 정렬에서 NULL 위치가 기대와 다를 수 있음).

**판정**: ✅ **정확함.** 안전장치 추가 필요.

**해결**: `ORDER BY (issued_at IS NULL) ASC, issued_at DESC, invoice_id DESC` (issued_at 없는 건 가장 오래된 취급).

**반영**: 
- 084 마이그레이션 SQL 수정 완료
- invoice-creator.js SELECT 쿼리에도 동일 정렬 적용

---

### 3. refund-routes.js 락 없이 order_id 조회: 경쟁 조건 최소화 ✅ **채택**

**GPT 지적**: "(락 없이) warranty→order_id 조회" 후 "orders FOR UPDATE"를 잡는 방식은 같은 트랜잭션에서 곧바로 warranties ... FOR UPDATE로 다시 읽기 때문에 큰 문제로 번질 가능성은 낮지만, 완전하게 하려면 추가 안전장치 필요.

**판정**: ✅ **정확함.** 경쟁 조건 최소화 필요.

**해결 (옵션 A 채택)**: orders 잠근 뒤, warranties FOR UPDATE로 읽은 결과의 order_id가 최초 조회한 order_id와 동일한지 assert 후 불일치면 롤백/에러.

**반영**: 코드 수정 완료 (문서에 반영).

---

### 4. 085 Idempotency-Key: 정규식 case-insensitive, trim() 처리 ✅ **채택**

**GPT 지적**: 
- 정규식은 반드시 case-insensitive(`/i`)로 처리
- 헤더 값 trim() 후 검증 (선행/후행 공백 때문에 불필요한 400 방지)

**판정**: ✅ **정확함.** 구현 디테일 보완 필요.

**반영**: 
- 정규식: case-insensitive `/i` 플래그 필수
- trim() 처리: 헤더 값 trim() 후 검증 및 refund_event_id로 사용

---

### 5. 락 순서 문서: "읽기"와 "잠금" 구분 명시 ✅ **채택**

**GPT 지적**: "예외 없이 orders 먼저" 문구는 강력하지만, 팀/미래의 본인이 "refund는 warranty_id로 시작하는데 orders를 어떻게 먼저 잠그지?"를 매번 떠올릴 수 있음.

**판정**: ✅ **정확함.** 구분 명시로 규칙 명확화 필요.

**반영**: "시작 엔티티가 orders가 아닌 경우, 1단계는 '락 없는 식별자 조회'만 허용하며, 실제 FOR UPDATE 잠금 획득은 반드시 orders부터 시작한다" 문구 추가.

---

### 6. UNIQUE 설계 확인 ✅ **확인 필요**

**GPT 지적**: 
- MySQL 8.0에서 STORED generated + UNIQUE는 문제 없음
- `run-migration.js`가 "멀티 스테이트먼트 실행"을 지원하는지 확인 (CTE + UPDATE + ALTER 여러 개). 지원 안 하면 파일을 단계별로 나누면 됨.

**판정**: ✅ **정확함.** 사전 확인 필요.

**반영**: 마이그레이션 적용 전 `run-migration.js` 멀티 스테이트먼트 지원 확인 필요 (문서에 체크리스트 추가).

---

## 🔍 GPT 추가 피드백 검증 (084 실행 안정성·UNIQUE 범위·shipment)

**이번 GPT 피드백 판정 요약**

| 구분 | 내용 |
|------|------|
| **이상한 부분** | 없음. 전반적으로 정책/설계와 맞고, 실제 장애·빌드 실패로 이어질 수 있는 “남은 구멍”을 정확히 짚음. |
| **효율적·좋은 부분** | ① CTE → TEMP TABLE 대안으로 실행기 호환성 확보 ② type='invoice' 전체 중복 점검 + A/B 규칙으로 UNIQUE 충돌 예방 ③ 동일 트랜잭션·orders first 원칙으로 데드락/락 역전 제거 ④ 085 “이벤트 중복 vs 환불 중복” 역할 구분 ⑤ run-migration 체크리스트 구체화 |
| **충돌·문제 가능성** | ① 084: **void 다중** 등으로 type='invoice' 주문당 2건 이상 있으면 UNIQUE 추가 **실패** → 전체 중복 점검 필수 ② **shipment**가 order_item_units FOR UPDATE 먼저 사용 → Paid vs Shipment **락 역전** → 반드시 orders first로 통일 ③ CTE+UPDATE 실행기 미지원 시 **마이그레이션 실패** → TEMP TABLE 대안 필요 |
| **위험 사항** | ① 084 UNIQUE 적용 범위(status 무관)와 기존 데이터 불일치 ② shipment 락 순서 미통일 시 데드락 ③ “void만 남는” 유령 상태(트랜잭션 원자성 미보장 시) |
| **보안** | 별도 신규 이슈 없음. (Idempotency-Key trim/UUID 검증 등 기존 보안 유지) |

---

### 1) 084 마이그레이션(SQL) 실행 안정성

**1-1. CTE + UPDATE 실행기 호환성** ✅ **판정: 정확**

- MySQL 8.0에서 `WITH ... UPDATE`는 동작하지만, run-migration.js / 드라이버가 문장 단위 분리 방식에 따라 실패할 수 있음.
- **가장 안전한 형태**: CTE를 **임시 테이블**로 분리 (실행기 제약 회피).
  - `CREATE TEMPORARY TABLE ranked AS SELECT ... ROW_NUMBER() ...;`
  - `UPDATE invoices i JOIN ranked r ... SET ... WHERE r.rn > 1;`
- TEMP TABLE은 **같은 세션**에서만 유효 → 마이그레이션 실행 단위가 “한 세션”인지 확인.

**⚠️ 치명적 문제 발견 (GPT 최종 피드백)**:
- **UPDATE로 status='void'만 바꾸면 UNIQUE 추가 실패**: 중복 레코드들이 여전히 type='invoice'이고 order_id가 같으면 generated column 값 `invoice_order_id`도 동일하게 유지되어 UNIQUE 추가 시 중복키로 실패.
- **해결**: 중복 행을 **DELETE** (또는 archive 이관 후 DELETE).
- **credit_note 참조 무결성**: 삭제 전에 `related_invoice_id`를 유지할 invoice_id로 리맵 필요.

**수정된 TEMP TABLE 방식 (DELETE 사용)**:
```sql
-- ⚠️ 한 커넥션/한 세션 유지 필수 (run-migration이 같은 커넥션으로 실행해야 TEMP TABLE 유지)

-- 3-1. 유지할 invoice_id 결정
CREATE TEMPORARY TABLE IF NOT EXISTS invoice_keep AS
SELECT
    invoice_id AS keep_invoice_id,
    order_id
FROM (
    SELECT
        invoice_id,
        order_id,
        ROW_NUMBER() OVER (
            PARTITION BY order_id
            ORDER BY (issued_at IS NULL) ASC, issued_at DESC, invoice_id DESC
        ) AS rn
    FROM invoices
    WHERE type = 'invoice'
) ranked
WHERE rn = 1;

-- 3-2. credit_note의 related_invoice_id를 keep_invoice_id로 리맵
UPDATE invoices cn
INNER JOIN invoice_keep ik ON cn.related_invoice_id IS NOT NULL
INNER JOIN invoices del_inv ON del_inv.invoice_id = cn.related_invoice_id
    AND del_inv.type = 'invoice'
    AND del_inv.order_id = ik.order_id
    AND del_inv.invoice_id != ik.keep_invoice_id
SET cn.related_invoice_id = ik.keep_invoice_id
WHERE cn.type = 'credit_note';

-- 3-3. rn>1 invoice 행 삭제
DELETE i
FROM invoices i
INNER JOIN (
    SELECT invoice_id, order_id,
        ROW_NUMBER() OVER (
            PARTITION BY order_id
            ORDER BY (issued_at IS NULL) ASC, issued_at DESC, invoice_id DESC
        ) AS rn
    FROM invoices
    WHERE type = 'invoice'
) ranked ON i.invoice_id = ranked.invoice_id
WHERE ranked.rn > 1;

DROP TEMPORARY TABLE IF EXISTS invoice_keep;
```

**1-2. issued_at NULL** ✅ **이미 반영**

- `(issued_at IS NULL) ASC` 정렬로 “NULL은 오래된 취급” 명시됨.
- **권장 추가**: INSERT 시 `issued_at` 강제 세팅(예: `NOW()`). `invoice-creator.js`는 이미 `issued_at = NOW()` 사용 → **예방 완료**.

**1-3. UNIQUE 적용 범위 vs 기존 데이터** ✅ **정책 A 확정**

- `invoice_order_id = IF(type='invoice', order_id, NULL)` → **type='invoice'이기만 하면** UNIQUE 적용 (status 무관).
- **정책 A 최종 확정**: invoice는 주문당 1장만 존재 (issued/void/refunded 무관). void 다중도 허용하지 않음.
- **중복 정리**: type='invoice' 전체에서 최신 1건만 남기기 (issued/void/refunded 무관).

**권장 점검 쿼리 (type='invoice' 전체 기준)**:
```sql
SELECT order_id, COUNT(*) cnt
FROM invoices
WHERE type = 'invoice'
GROUP BY order_id
HAVING cnt > 1;
```
- **값이 있으면**: type='invoice' 전체에서 **최신 1건만 남기고** 나머지는 **삭제(DELETE)** (정책 A). void 처리 사용 금지.
- **값이 없으면**: 바로 UNIQUE 추가 가능.

**정책 B (폐기)**: issued invoice만 주문당 1장. void invoice는 여러 장 허용.  
→ 정책 A가 더 효율적이고 단순하므로 채택하지 않음.

---

### 2) invoice-creator.js ER_DUP_ENTRY: 추가 확인 3가지

**2-1. “어떤 UNIQUE에 걸렸는지” 분기** ✅ **불필요**

- ER_DUP_ENTRY 시 “기존 invoice 조회”로 처리. 원인이 `invoice_order_id`인지 `invoice_number`인지 분기할 필요 없음.
- **권장**: `sqlError.sqlMessage`를 **로그에 남기되**, 로직 분기는 하지 않음.
- **invoice_number** 생성 규칙이 **충돌 불가**인지 별도 보장.  
  → `invoice-number-generator.js`: `PM-INV-YYMMDD-HHmm-{랜덤4자}` + SELECT 체크 후 INSERT, 재시도 있음. **별도 보장 충족**.

**2-2. 조회 SQL ORDER BY** ✅ **정책과 일치**

- issued 우선 → `(issued_at IS NULL) ASC` → `issued_at DESC` → `invoice_id DESC` → “최신 issued 1건” 정책에 부합.

**2-3. “issued 없음이면 throw”** ✅ **정책상 타당**

- 운영 중 “issued 없이 void만 남는” 경로(예: 발급 직후 롤백/부분 실패)가 있으면 계속 막힘.
- **해결**: 트랜잭션 설계에서 **invoice INSERT와 후속 처리를 같은 트랜잭션**으로 묶어, 실패 시 **invoice까지 롤백**되게 하면 “void만 남는 유령 상태” 감소.

---

### 3) 전역 락 순서(orders first): 구현 디테일 2가지

**3-1. “락 없는 식별자 조회”는 같은 트랜잭션 안에서** ✅ **필수**

- refund: (락 없이) warranty→order_id 조회 → orders FOR UPDATE → warranties FOR UPDATE + assert.
- 이 흐름이 의미 있으려면 **동일 커넥션 / 동일 트랜잭션**이어야 함. 중간에 커넥션 바뀌면 1)의 관찰이 무의미.
- **반영**: refund는 이미 단일 connection + `beginTransaction` 내 처리 → **준수**. 문서에 “동일 트랜잭션 필수” 명시.

**3-2. shipment도 동일 원칙으로 통일** ⚠️ **코드 수정 필수**

- 문서에는 refund/shipment 둘 다 “orders first”로 기술했으나, **shipment 쪽**은 `order_item_units FOR UPDATE`로 **시작**함.
- **수정**: `shipment-routes.js` 및 `index.js` Phase 12 shipment 흐름을 아래처럼 **통일**.
  1. (락 없이) `order_item_units`에서 `order_id` 확인 (또는 요청의 `orderId` 사용)
  2. **`orders FOR UPDATE`** 먼저 잠금
  3. **`order_item_units FOR UPDATE`** 잠금
- 이렇게 해야 **Paid vs Shipment** 교차 시 **락 역전** 제거.

---

### 4) 085 (Idempotency-Key + credit_note_refund_event_id UNIQUE): 운영 테스트 시나리오

**4-1. 동일 Idempotency-Key로 2회 호출**

- 1회차: credit_note issued 생성.
- 2회차: ER_DUP_ENTRY → 기존 issued 반환(동일 credit_note). ✅ 이미 설계 반영.

**4-2. 다른 Idempotency-Key로 같은 warranty 연속 환불 시도**

- **정책**: “같은 warranty에 여러 환불 이벤트 가능”을 열어두면 DB는 막지 않음 (이벤트 기준 유일).
- **중복 환불 방지**는 **unit_status / 금액 검증**으로 막아야 함.
- **085 멱등성** = “이벤트 중복 방지”. **중복 환불 방지** = unit_status·금액 검증. **역할 분리** 명시.

**4-3. Idempotency-Key 검증**

- 공백 포함: `trim()` 후 정상.
- 대문자 UUID: `/i`로 정상.
- 형식 불일치: 400.
- 누락: 400.

---

### 5) 문서에 “한 줄” 추가로 명확화

**5-1. UNIQUE 적용 범위**

- **084 (정책 A 확정)**: **invoice는 주문당 1장만 존재** (issued/void/refunded 무관). void 다중도 허용하지 않음. Generated column: `invoice_order_id = IF(type='invoice', order_id, NULL)` (status 무관).
- **085**: “같은 refund_event_id로 issued credit_note는 1장” (이미 명시됨).

**5-2. run-migration.js 실행 조건 체크리스트 (구체적 확인 방법)**

- `run-migration.js` 내부 **`multipleStatements: true`** 설정 여부 → **확인됨**: `backend/run-migration.js` 181–187줄 `createConnection({ ... multipleStatements: true })` (주석: "여러 SQL 문 실행 허용").
- **세미콜론 분리 로직** 유무 (단일 `connection.query(sql)` vs 문장별 분리).
- **mysql CLI** 대체 실행 경로 유무 (예: `mysql < file.sql`).

---

### 결론 (이번 GPT 피드백)

- **옳다**: 정책/설계 방향 및 대부분의 반영 사항.
- **수정 완료**:
  1. **084 UNIQUE 정책 A 확정**: invoice는 주문당 1장만 존재 (issued/void/refunded 무관). 중복 정리: type='invoice' 전체에서 최신 1건만 남기기.
  2. **전역 락 순서(orders first)**: refund + shipment 모두 **코드 레벨에서 완전히 통일** 필요 (Step 4a, 4b 참고).
  3. **TEMP TABLE 대안**: 한 세션 유지 체크 문장 추가 완료.
  4. **refund assert 불일치**: rollback + 재시도 규칙 명시 완료.

---

## 🔍 GPT 추가 피드백 검증 (085 운영/구현 경계)

### 1. DB: "무엇을 유일로 볼지" 명시 ✅ **채택**

**GPT 지적**: `refund_event_id`는 credit_note에서만 의미. 멱등성 기준은 `credit_note_refund_event_id`(=refund_event_id). "invoice/refunded/void 여부와 무관하게 '같은 refund_event_id로 issued credit_note는 1장'이다"를 명시하면 ER_DUP_ENTRY 처리에서 "issued 없으면 throw"가 자연스럽게 정당화됨.

**판정**: ✅ **정확함.** 정책 명시로 ER_DUP_ENTRY 처리 로직이 명확해짐.

**반영**: 085 마이그레이션 SQL에 정책 명시 주석 추가.

---

### 2. API: Idempotency-Key "있으면 사용" → "필수" ✅ **채택**

**GPT 지적**: "있으면 사용"은 운영 중 재시도(네트워크 오류/관리자 재클릭/프론트 재전송) 시 키가 없으면 멱등성이 깨짐. "키를 안 보내는 클라이언트"가 존재하면 중복 발급 가능.

**판정**: ✅ **정확함.** 관리자 환불이므로 멱등성 보장 필수.

**반영**: **Idempotency-Key 필수**. 없으면 **400 에러** 반환.

---

### 3. refund_event_id 형식/길이 제약 ✅ **채택**

**GPT 지적**: `refund_event_id`를 VARCHAR(64)로 뒀는데, Idempotency-Key로 임의 문자열이 들어올 수 있음. 공백/너무 긴 문자열/재사용 충돌 위험.

**판정**: ✅ **정확함.** 보안/안정성 측면에서 형식 제한 필요.

**반영**: **UUID 형식만 허용** (버전 무관, v1~v7 모두 허용). 정규식 검증: `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` (대소문자 무시). 형식 불일치 시 **400 에러**.

**참고**: 정규식은 UUID 형태만 확인하고 버전 nibble은 강제하지 않음. "UUID(v7 포함)" 문구는 "UUID 형식이면 OK (버전 무관)"을 의미.

---

### 4. ER_DUP_ENTRY 처리 로그 상세화 ✅ **채택**

**GPT 지적**: issued 없을 때 throw 케이스는 "데이터가 꼬였거나 정책 위반". 로그에 `refund_event_id`, `related_invoice_id`, `warranty_id`, 금액/대상 unit 목록 요약 포함 필요.

**판정**: ✅ **정확함.** 디버깅/추적에 필수.

**반영**: ER_DUP_ENTRY 시 issued 없으면 **상세 로그** 기록 후 throw.

---

### 5. PG 연동 우선순위 명확화 ✅ **채택**

**GPT 지적**: "향후 pg_refund_id 컬럼 추가 및 우선순위 변경 가능"은 모호함. "내부 refund_event_id는 항상 생성되며(감사/추적용), pg_refund_id는 외부 참조키로만 추가. 멱등성 기준은 pg_refund_id가 있으면 pg_refund_id, 없으면 refund_event_id."

**판정**: ✅ **정확함.** 내부 ID는 사라지지 않아야 감사/추적 가능.

**반영**: 문서에 **"내부 refund_event_id는 항상 유지"** 정책 명시.

---

### 6. 문서 모순 수정 ✅ **수정 완료**

**GPT 지적**: 상단 '최종 결론'에 "인보이스 UNIQUE 제약: `UNIQUE(order_id, type)` 제약 추가 필요" 문장이 084 정책과 정면 충돌.

**판정**: ✅ **정확함.** 문서 모순 제거 필요.

**반영**: "**`UNIQUE(order_id, type)` 폐기**, `invoice_order_id` partial unique (A안) 적용"으로 수정 완료.

---

### 7. invoice-creator ER_DUP_ENTRY: void 후 재발급 정책 명시 ✅ **채택**

**GPT 지적**: "issued 없으면 throw"는 타당하지만, 운영 예외를 한 줄 더 정의해야 함. void 후 재발급 허용 여부 명시 필요.

**판정**: ✅ **정확함.** 정책 명시로 ER_DUP_ENTRY 처리 로직이 명확해짐.

**반영**: **"invoice는 void 후 재발급을 허용하지 않는다 (필요 시 주문 단위로 별도 프로세스)"** 정책 명시. ER_DUP_ENTRY 처리 코드에 주석 및 에러 메시지에 반영.

---

### 085 마이그레이션 SQL (수정본)

**파일**: `backend/migrations/085_add_invoices_refund_event_id_unique.sql`

- **refund_event_id** VARCHAR(64) NULL (실컬럼)
- **credit_note_refund_event_id** = `IF(type='credit_note', refund_event_id, NULL)` STORED generated
- **UNIQUE(credit_note_refund_event_id)**

```sql
-- ============================================================
-- 085_add_invoices_refund_event_id_unique.sql
-- Credit Note 식별자 (환불 이벤트 중복 방지)
-- A안: generated column + UNIQUE (MySQL NULL 동작 회피)
-- ============================================================

USE prepmood;

SELECT '=== 기존 credit_note 확인 ===' AS info;
SELECT type, COUNT(*) AS cnt FROM invoices WHERE type = 'credit_note' GROUP BY type;

-- ============================================================
-- 1. 컬럼 추가 (실컬럼)
-- ============================================================
ALTER TABLE invoices
ADD COLUMN refund_event_id VARCHAR(64) NULL
    COMMENT 'credit_note 전용: 환불 이벤트 식별자 (내부 UUID v7 또는 PG refund_id, credit_note일 때만 값 있음)'
    AFTER related_invoice_id;

-- ============================================================
-- 2. Generated column 추가 (부분 유니크용)
-- ============================================================
ALTER TABLE invoices
ADD COLUMN credit_note_refund_event_id VARCHAR(64)
    GENERATED ALWAYS AS (IF(type = 'credit_note', refund_event_id, NULL)) STORED
    NULL
    COMMENT 'credit_note 시 refund_event_id, 아니면 NULL (UNIQUE용)'
    AFTER refund_event_id;

-- ============================================================
-- 3. UNIQUE 제약 (credit_note 한정)
-- ============================================================
ALTER TABLE invoices
ADD UNIQUE KEY uk_invoices_credit_note_refund_event (credit_note_refund_event_id);

-- ============================================================
-- 4. 제약 확인
-- ============================================================
SELECT '=== UNIQUE 제약 확인 ===' AS info;
SHOW INDEX FROM invoices WHERE Key_name = 'uk_invoices_credit_note_refund_event';

-- ============================================================
-- 참고: 기존 credit_note
-- ============================================================
-- refund_event_id NULL 유지. UNIQUE는 NULL 다수 허용.
-- 향후 생성분부터 refund_event_id 항상 채움 (코드 + Idempotency-Key)

-- ============================================================
-- 정책 명시
-- ============================================================
-- refund_event_id는 credit_note에서만 의미가 있으며,
-- 멱등성의 기준은 credit_note_refund_event_id(=refund_event_id)이다.
-- invoice/refunded/void 여부와 무관하게 '같은 refund_event_id로 issued credit_note는 1장'이다.
```

### refund-routes.js 수정 (085)

**위치**: credit_note INSERT (339-381줄)

1. **`Idempotency-Key` 검증 (필수)**
   - **`Idempotency-Key`** 헤더 필수. 없으면 **400 에러** 반환.
   - **trim() 처리**: 헤더 값 `trim()` 후 검증 (선행/후행 공백 방지)
   - **형식 검증**: **UUID 형식만 허용** (버전 무관, v1~v7 모두 허용). 정규식: `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` (case-insensitive `/i` 플래그 필수).
   - 형식 불일치 시 **400 에러** 반환.
   - **길이 제한**: VARCHAR(64)이므로 64자 이하 확인 (UUID는 36자).
2. **`refund_event_id` 확정**
   - **`Idempotency-Key`** 값을 `trim()` 후 `refund_event_id`로 사용 (재시도 시 동일 ID 보장).
3. **INSERT**: `refund_event_id` 컬럼 포함. `credit_note_refund_event_id`는 generated 라서 INSERT 불필요.
4. **ER_DUP_ENTRY 처리**
   - `SELECT ... WHERE type = 'credit_note' AND refund_event_id = ? ORDER BY CASE WHEN status = 'issued' THEN 0 ELSE 1 END, issued_at DESC LIMIT 1`
   - **issued** 1건 있으면 → 해당 credit_note 반환.
   - **issued 없음** (void/refunded만) → **에러 throw + 상세 로그**:
     ```javascript
     Logger.error('[REFUND] ER_DUP_ENTRY 발생했으나 issued credit_note 없음 (데이터 꼬임)', {
         refund_event_id,
         warranty_id,
         related_invoice_id,
         attempted_amount: refundAmount,
         attempted_unit: warranty.source_order_item_unit_id,
         error_code: sqlError.code
     });
     throw new Error('Credit note 중복 감지되었으나 기존 issued credit note를 찾을 수 없습니다.');
     ```
5. **payload_json**에도 `refund_event_id` 포함 (감사용).

### 085 실행 순서

1. DB 점검: `SELECT type, COUNT(*) FROM invoices WHERE type = 'credit_note' GROUP BY type;` 등
2. `node run-migration.js migrations/085_add_invoices_refund_event_id_unique.sql`
3. 제약 확인: `SHOW INDEX FROM invoices WHERE Key_name = 'uk_invoices_credit_note_refund_event';`
4. refund-routes.js 수정:
   - **`Idempotency-Key` 필수 검증** (없으면 400, 형식 검증 UUID만)
   - **trim() 처리**: 헤더 값 trim() 후 검증 (선행/후행 공백 방지)
   - **case-insensitive 정규식**: `/i` 플래그 필수
   - `refund_event_id` = `Idempotency-Key` 값 (trim 후)
   - INSERT에 `refund_event_id` 포함
   - ER_DUP_ENTRY 시 issued 우선 조회, 없으면 **상세 로그 + 에러**
5. **관리자 UI 수정**: 재시도 시 **동일 Idempotency-Key** 전송 (필수)
6. 테스트: 동일 `refund_event_id`(동일 키) 재시도 → 기존 credit_note 반환 확인

### 085 주의사항

- **정책**: warranty 기준 아님, **환불 이벤트 기준** 멱등성. `refund_event_id`는 credit_note에서만 의미, 멱등성 기준은 `credit_note_refund_event_id`(=refund_event_id). invoice/refunded/void 여부와 무관하게 **'같은 refund_event_id로 issued credit_note는 1장'**.
- **DB**: **generated column + UNIQUE** 사용. `UNIQUE(type, refund_event_id)` 미사용.
- **ID 형식**: **UUID 형식만 허용** (버전 무관, v1~v7 모두 허용). 정규식 검증 필수.
- **재시도**: **Idempotency-Key 필수**. 없으면 400 에러. 관리자 환불이므로 멱등성 보장 필수.
- **기존 credit_note**: NULL 유지. backfill은 근거 있을 때만.
- **PG 연동 (장기)**: **내부 refund_event_id는 항상 생성 유지** (감사/추적용). `pg_refund_id`는 외부 참조키로 추가. 멱등성 기준은 `pg_refund_id`가 있으면 `pg_refund_id`, 없으면 `refund_event_id`.

### 085 멱등성 범위 명시 (GPT 최종 피드백 반영)

**핵심 정책**:
1. **085의 UNIQUE**: "같은 환불 이벤트(refund_event_id)로 credit_note 중복 발급 방지"
2. **중복 환불 방지**: unit_status/금액 검증 레이어에서 처리 (085 UNIQUE와 별개)
3. **Idempotency-Key 정책**: 
   - **재시도(retry)에만 재사용**: 네트워크 오류/관리자 재클릭/프론트 재전송 시 동일 키 재사용
   - **새 환불 이벤트는 항상 새 키**: 같은 warranty에 대해 다른 키로 연속 호출되는 건 "새 환불 이벤트"로 간주
4. **같은 warranty + 다른 키**: 새 환불 이벤트로 간주, **unit_status/금액 검증에서 반드시 차단** (이미 환불된 경우)

**API 문서 명시 필요**:
- "Idempotency-Key는 재시도(retry)에만 재사용한다. 새 환불 이벤트는 항상 새 키를 사용한다."
- "같은 warranty에 대해 다른 키로 연속 호출되는 건 새 환불 이벤트이므로, 중복 환불 여부는 unit_status/금액 검증에서 반드시 차단한다."

---

## 📝 최종 정리 (정책 문장 압축)

### 락 순서 (데드락 방지)
- **FOR UPDATE로 잠그는 첫 테이블은 항상 `orders`이다.**
- **`orders`를 잠그기 위해 필요한 `order_id` 식별 조회는 예외적으로 락 없이 허용한다.**  
  (refund는 warranty_id→order_id 조회, shipment는 요청의 orderId 사용 후, 반드시 `orders FOR UPDATE` 먼저 → 이후 순서 유지)

### 085 DB
credit_note의 멱등성은 **"환불 이벤트(refund_event_id) 1회당 credit_note 1장"**이며, MySQL NULL 이슈 때문에 **generated column + UNIQUE**로 강제한다.

### 085 API
`refund_event_id`는 재시도에도 동일해야 하므로 **Idempotency-Key(필수)**로 "재사용"을 보장한다. 관리자 환불이라면 **Idempotency-Key는 필수**로 두는 게 가장 안전하다.

### 085 멱등성 범위
- **085의 UNIQUE**: "같은 환불 이벤트(refund_event_id)로 credit_note 중복 발급 방지"
- **중복 환불 방지**: unit_status/금액 검증 레이어에서 처리 (085 UNIQUE와 별개)
- **Idempotency-Key 정책**: 재시도(retry)에만 재사용, 새 환불 이벤트는 항상 새 키
- **같은 warranty + 다른 키**: 새 환불 이벤트로 간주, unit_status/금액 검증에서 반드시 차단

### 084 Invoice UNIQUE 정책 (정책 A 확정)
**invoice는 주문당 1장만 존재** (issued/void/refunded 무관). 과거 void 다중도 허용하지 않음. 필요하면 void 다중을 하나만 남기고 나머지는 삭제/이관. Generated column: `invoice_order_id = IF(type='invoice', order_id, NULL)` (status 무관). 중복 정리: type='invoice' 전체에서 최신 1건만 남기기. **⚠️ 치명적 문제 해결**: UPDATE로 status='void'만 바꾸면 generated column 값이 동일하게 유지되어 UNIQUE 추가 실패 → **DELETE 사용** (credit_note 리맵 포함).  
**정책 명시**: void는 상태(enum)로 존재하지만, **중복 정리 방법으로는 사용 금지** (DELETE만 사용).

### invoice 재발급 정책
**invoice는 void 후 재발급을 허용하지 않는다** (필요 시 주문 단위로 별도 프로세스). ER_DUP_ENTRY 처리에서 issued 없고 void만 있으면 에러 throw.

### 구현 버그 및 안전장치
- **invoice-creator.js ER_DUP_ENTRY**: SELECT에 `issued_at, voided_at, void_reason` 포함 (로그/조사 가치); sqlMessage 로그 유지
- **084 정렬 안전장치**: `(issued_at IS NULL) ASC` 추가 (NULL은 가장 오래된 취급)
- **084 UNIQUE 적용 범위**: **정책 A 확정** - `invoice_order_id = IF(type='invoice', order_id, NULL)` → **type='invoice' 전체** (status 무관). invoice는 주문당 1장만 존재 (issued/void/refunded 무관). void 다중도 허용하지 않음.
- **084 중복 정리 방식**: **⚠️ UPDATE → DELETE로 수정** (UPDATE로 status='void'만 바꾸면 generated column 값이 동일하게 유지되어 UNIQUE 추가 실패). 순서: (A) 유지할 invoice_id 결정 → (B) credit_note 리맵 → (C) 삭제 → (D) UNIQUE 추가.
- **refund-routes.js**: 동일 트랜잭션 내 락 없는 조회 → orders → warranties; order_id assert (불일치 시 즉시 rollback + 재시도 권장)
- **shipment 락 순서**: **(아직) 미수정**. `shipment-routes.js`, `index.js` Phase 12 두 곳 **orders FOR UPDATE** 먼저로 수정 필요 (Step 4b 체크리스트).
- **085 Idempotency-Key**: trim() + case-insensitive (`/i`); 085 멱등성 = 이벤트 중복 방지, 중복 환불 = unit_status/금액 검증
- **run-migration.js**: `backend/run-migration.js` 181–187줄 `multipleStatements: true` 확인됨. mysql CLI 대체, CTE/TEMP TABLE 대안.

---

## ✅ 최종 실행 순서

1. ✅ **DB 점검 쿼리 실행** (중복 데이터 확인, **type='invoice' 전체 중복** 필수 확인)
2. ✅ **run-migration.js 실행 조건 체크리스트** (multipleStatements, mysql CLI 대체, CTE/TEMP TABLE 대안)
3. ✅ **084 마이그레이션 파일 적용** (윈도우 함수 기반 중복 정리, issued_at NULL 안전장치, **UNIQUE 범위 A/B 결정 반영**)
4. ✅ **invoice-creator.js 수정** (ER_DUP_ENTRY만 체크, sqlMessage 로그 유지, issued/void/refunded 상태 조회·처리, SELECT 필드·정렬 안전장치)<br>**참고**: void는 상태(enum)로 존재하지만, **중복 정리 방법으로는 사용 금지** (DELETE만 사용).
5. ✅ **refund-routes.js 락 순서 수정** (orders 먼저 잠금, order_id assert, **동일 트랜잭션**)
6. ⚠️ **shipment 락 순서 수정** (아직 미수정): `shipment-routes.js`, `index.js` Phase 12 두 곳 **orders FOR UPDATE 먼저** → order_item_units (Step 4b 체크리스트)
7. ✅ **warranty-routes.js 수정** (`orders.status` 제거)
8. ✅ **SYSTEM_FLOW_DETAILED.md 수정** (락 순서, UNIQUE 범위 명시, 기타)
9. ✅ **(085) DB 점검 → 085 마이그레이션 → refund-routes(Idempotency-Key, trim, /i, ER_DUP_ENTRY) → 테스트** (085 테스트 시나리오: 동일 키 2회, 다른 키 같은 warranty 역할 구분)

---

## 📋 실행 체크리스트 (실수 없이 완료하기)

### Step 1: DB 점검 (운영 DB에서 먼저 실행)

**1-1. invoice 중복(issued 기준) 확인**:
```sql
SELECT order_id, type, COUNT(*) AS cnt
FROM invoices
WHERE type='invoice' AND status='issued'
GROUP BY order_id, type
HAVING cnt > 1;
```

**1-2. (필수) type='invoice' 전체 중복 확인** (UNIQUE 적용 범위 검토용):
```sql
SELECT order_id, COUNT(*) AS cnt
FROM invoices
WHERE type = 'invoice'
GROUP BY order_id
HAVING cnt > 1;
```
- **결과 0건**: 정리 불필요, UNIQUE 추가 시 기존 데이터와 충돌 없음.
- **결과 있음**: **주문당 invoice 2건 이상** 존재 → UNIQUE 추가 **실패**.  
  → **정책 A 확정**: 주문당 1장만 유지. **DELETE**(credit_note 리맵 포함)로 정리 후 UNIQUE 추가. void 처리 사용 금지.  
  → 문서 “1-3. UNIQUE 적용 범위 vs 기존 데이터” 참고.

**1-3. type 분포 확인**:
```sql
SELECT type, COUNT(*) AS cnt
FROM invoices
GROUP BY type;
```

**1-4. (선택) order_id별 invoice 전체 분포 (중복 후보 파악)**:
```sql
SELECT
  order_id,
  COUNT(*) AS total_count,
  SUM(status='issued') AS issued_count,
  SUM(status='void') AS void_count,
  SUM(status='refunded') AS refunded_count
FROM invoices
WHERE type='invoice'
GROUP BY order_id
HAVING COUNT(*) > 1;
```

**판정 (정책 A 확정)**:
- **1-2 (type='invoice' 전체)** 결과 있음 → UNIQUE 추가 시 **실패**. **정책 A에 따라** type='invoice' 전체에서 최신 1건만 남기고 나머지 **삭제(DELETE)** 후 진행. void 처리 사용 금지.
- **1-2 결과 0건**이면: 정리 불필요, 바로 UNIQUE 추가 가능.

---

### Step 2: 마이그레이션 파일 (084 A안) 적용 절차

**2-1. 파일**: `backend/migrations/084_add_invoices_invoice_order_id_unique.sql`  
- A안: `invoice_order_id` generated + `UNIQUE(invoice_order_id)`.  
- 상세: 본 문서 "Step 2. 마이그레이션 파일 (084 A안)" SQL 참고.

**2-2. 적용 명령**:

**방법 A: run-migration.js (권장)**:
```bash
cd /var/www/html/backend
node run-migration.js migrations/084_add_invoices_invoice_order_id_unique.sql
```

**⚠️ run-migration.js 실행 조건 체크리스트** (정확한 확인 방법):
- `run-migration.js` 내부 **`multipleStatements: true`** 설정 여부 → **확인됨**: `backend/run-migration.js` 181–187줄 `createConnection({ ... multipleStatements: true })` (주석: "여러 SQL 문 실행 허용").
- **세미콜론 분리**: 단일 `connection.query(sql)`로 전체 파일 전달. MySQL 드라이버가 multi-statement로 실행.
- **mysql CLI 대체**: `mysql -u ... -p prepmood < backend/migrations/084_...sql` 사용 가능.
- **CTE + UPDATE + ALTER** 혼합 시 실행기/환경에 따라 실패 가능하면, **TEMP TABLE 대안** 사용 (문서 “1-1. CTE + UPDATE 실행기 호환성” 참고).
- **⚠️ TEMP TABLE 대안 사용 시**: **한 커넥션/한 세션 유지** 필수. run-migration이 파일을 세미콜론으로 쪼개어 개별 쿼리로 보내더라도 같은 커넥션이면 TEMP TABLE은 유지됨. 중간에 커넥션이 갈리면 TEMP TABLE 방식은 실패.

**방법 B: mysql 직접**:
```bash
mysql -u prepmood_user -p prepmood < backend/migrations/084_add_invoices_invoice_order_id_unique.sql
```

**2-3. 적용 후 확인**:
```sql
SHOW INDEX FROM invoices WHERE Key_name='uk_invoices_invoice_order_id';
```

---

### Step 3: invoice-creator.js 수정

**체크 포인트**:
1. ✅ ER_DUP_ENTRY면 "기존 invoice 조회 후 반환"이 1차 방어
2. ✅ 조회는 status='issued' 우선 정렬 (issued 없고 void만 있으면 정책상 에러) → 2차 방어
3. ✅ sqlMessage.includes() 제거 → 드라이버/환경 변화에도 안전
4. ✅ **반환 형태 확인**: 기존 함수는 `{ invoice_id, invoice_number }` 반환 (snake_case) ✅
5. ✅ **정책 명시**: invoice는 void 후 재발급을 허용하지 않는다 (에러 메시지에 반영)
6. ✅ **SELECT 필드**: `void_reason`, `voided_at`, `issued_at` 포함 (로그/조사 가치)
7. ✅ **정렬 안전장치**: `(issued_at IS NULL) ASC` 추가 (issued_at NULL 케이스 처리)

**수정 위치**: `backend/utils/invoice-creator.js` 220-234줄

---

### Step 4a: refund-routes.js 락 순서 수정 (데드락 방지)

**체크 포인트**:
1. ✅ **동일 트랜잭션**: (락 없이) 조회 → orders FOR UPDATE → warranties FOR UPDATE가 **같은 connection / 같은 트랜잭션** 내에서 수행.
2. ✅ warranty_id로 order_id 먼저 조회 (락 없이)
3. ✅ `orders FOR UPDATE` 먼저 잠금 (전역 순서 준수)
4. ✅ 이후 `warranties FOR UPDATE` 잠금 + order_id assert

**수정 위치**: `backend/refund-routes.js` 150-177줄

**수정 내용**:
```javascript
// 1. (락 없이) warranty에서 order_id 조회
const [warrantyInfo] = await connection.execute(
    `SELECT w.id, w.source_order_item_unit_id, oiu.order_id
     FROM warranties w
     INNER JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
     WHERE w.id = ?`,
    [warranty_id]
);

if (warrantyInfo.length === 0) {
    // ... 에러 처리
}

const orderId = warrantyInfo[0].order_id;

// 2. orders FOR UPDATE 먼저 잠금 (락 순서 1단계: 전역 순서 준수)
const [orders] = await connection.execute(
    `SELECT order_id, order_number, total_price, shipping_email, shipping_name
     FROM orders
     WHERE order_id = ?
     FOR UPDATE`,
    [orderId]
);

// 3. warranties FOR UPDATE 잠금 (락 순서 4단계)
const [warranties] = await connection.execute(
    `SELECT w.id, w.status, w.owner_user_id, w.source_order_item_unit_id, w.revoked_at,
            oiu.order_item_unit_id, oiu.order_id, oiu.stock_unit_id, oiu.unit_status,
            oi.order_item_id, oi.product_name, oi.unit_price, oi.subtotal,
            o.order_number, o.total_price, o.shipping_email, o.shipping_name
     FROM warranties w
     INNER JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
     INNER JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
     INNER JOIN orders o ON oi.order_id = o.order_id
     WHERE w.id = ?
     FOR UPDATE`,
    [warranty_id]
);

// 4. 경쟁 조건 최소화: warranties FOR UPDATE로 읽은 결과의 order_id가 최초 조회한 order_id와 동일한지 검증
if (warranties.length === 0) {
    throw new Error(`Warranty not found: ${warranty_id}`);
}

const confirmedOrderId = warranties[0].order_id;
if (confirmedOrderId !== orderId) {
    Logger.error('[REFUND] order_id 불일치 (경쟁 조건 감지)', {
        warranty_id,
        initial_order_id: orderId,
        confirmed_order_id: confirmedOrderId
    });
    // ⚠️ assert 불일치 시 처리: 즉시 rollback + 재시도 권장 (로그는 error 레벨)
    await connection.rollback();
    await connection.end();
    throw new Error('Order ID mismatch detected. Please retry.');
}
```

---

### Step 4b: shipment 락 순서 수정 (데드락 방지)

**상태: ⚠️ (아직) 미수정**  
코드 2곳에 실제 반영 전까지 데드락 위험 존재. "문서 반영"이 아니라 **코드 수정** 필요.

**체크리스트** (수정 완료 시 체크):
- [ ] `shipment-routes.js` (`POST /api/admin/orders/:orderId/shipments`): **orders FOR UPDATE** 먼저 → **order_item_units FOR UPDATE**
- [ ] `index.js` Phase 12 (동일 shipment 흐름): 동일하게 **orders FOR UPDATE** 먼저 → **order_item_units FOR UPDATE**
- (락 없이) order_id 확인(요청 파라미터 `orderId`) → **orders FOR UPDATE** → **order_item_units FOR UPDATE** 순서 준수.

**수정 위치**:
- `backend/shipment-routes.js` 136-152줄 부근 (carriers 검증 후, order_item_units FOR UPDATE 전에 **orders FOR UPDATE** 삽입).
- `backend/index.js` Phase 12 shipment 블록 (1940-1953줄 부근, order_item_units FOR UPDATE 전에 **orders FOR UPDATE** 삽입).

**수정 내용 (shipment-routes.js)**:
```javascript
// 3. 주문 존재 확인 → 3-1. orders FOR UPDATE 먼저 잠금 (락 순서 1단계: 전역 순서 준수)
const [orders] = await connection.execute(
    `SELECT order_id, order_number
     FROM orders
     WHERE order_id = ?
     FOR UPDATE`,
    [orderId]
);

if (orders.length === 0) {
    await connection.rollback();
    await connection.end();
    return res.status(404).json({
        success: false,
        message: '주문을 찾을 수 없습니다.',
        code: 'ORDER_NOT_FOUND'
    });
}

// 4. order_item_units 조회 (FOR UPDATE로 잠금) - 락 순서 3단계
const { placeholders, params: unitIdsParams } = buildInClause(uniqueUnitIds);
const [units] = await connection.execute(
    `SELECT 
        oiu.order_item_unit_id,
        oiu.order_id,
        oiu.unit_status,
        oiu.current_shipment_id,
        oiu.shipped_at
    FROM order_item_units oiu
    WHERE oiu.order_item_unit_id IN (${placeholders})
      AND oiu.order_id = ?
    FOR UPDATE`,
    [...unitIdsParams, orderId]
);
```

**수정 내용 (index.js Phase 12)**:
```javascript
// 주문 존재 확인 → orders FOR UPDATE 먼저 잠금 (락 순서 1단계: 전역 순서 준수)
const [orders] = await connection.execute(
    `SELECT order_id, order_number
     FROM orders
     WHERE order_id = ?
     FOR UPDATE`,
    [orderId]
);

if (orders.length === 0) {
    await connection.rollback();
    await connection.end();
    return res.status(404).json({
        success: false,
        message: '주문을 찾을 수 없습니다.'
    });
}

// order_item_units 조회 (FOR UPDATE로 잠금) - 락 순서 3단계
const [units] = await connection.execute(
    `SELECT 
        oiu.order_item_unit_id,
        oiu.order_id,
        oiu.unit_status,
        oiu.shipped_at,
        oiu.carrier_code,
        oiu.tracking_number,
        oiu.stock_unit_id
    FROM order_item_units oiu
    WHERE oiu.order_item_unit_id IN (${placeholders})
      AND oiu.order_id = ?
    FOR UPDATE`,
    [...unitIdsParams, orderId]
);
```

---

### Step 5: warranty-routes.js에서 orders.status 제거 (SSOT 복구)

**체크 포인트**:
1. ✅ order.unit_status alias가 실제 SELECT와 맞는지 (이미 확인 완료)
2. ✅ "3종 차단" 정책 문구를 코드 주석/에러 메시지에 일관되게 유지

**수정 위치**: `backend/warranty-routes.js` 162-170줄

---

### Step 6: SYSTEM_FLOW_DETAILED.md 반영

**문서 수정 포인트**:
1. ✅ 전역 락 순서 **예외 없이 고정** (refund/shipment도 orders 먼저 잠금)
2. ✅ **credit_note 1:N** 정책 확정 — 환불 이벤트 1회당 1장, 부분 환불은 credit_note 여러 장 누적. `UNIQUE(order_id,type)` 사용 안 함.
3. ✅ **credit_note 식별자**: `refund_event_id` (환불 이벤트 기준, warranty 기준 아님)
4. ✅ **invoice 재발급 정책**: void 후 재발급 불허 명시

### Step 7: 085 마이그레이션 (Credit Note 식별자)

**체크 포인트**:
1. ✅ DB 점검: `SELECT type, COUNT(*) FROM invoices WHERE type = 'credit_note' GROUP BY type;`
2. ✅ 085 마이그레이션 적용: `node run-migration.js migrations/085_add_invoices_refund_event_id_unique.sql`
3. ✅ 제약 확인: `SHOW INDEX FROM invoices WHERE Key_name = 'uk_invoices_credit_note_refund_event';`
4. ✅ refund-routes.js 수정:
   - **`Idempotency-Key` 필수 검증** (없으면 400, UUID 형식만 허용, 정규식 검증)
   - **정규식**: `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` (case-insensitive `/i` 플래그 필수)
   - **trim() 처리**: 헤더 값 trim() 후 검증 (선행/후행 공백 방지)
   - `refund_event_id` = `Idempotency-Key` 값 (trim 후)
   - INSERT에 `refund_event_id` 포함
   - ER_DUP_ENTRY 시 **issued 우선 조회, 없으면 상세 로그 + 에러**
5. ✅ **관리자 UI 수정**: 재시도 시 **동일 Idempotency-Key** 전송 (필수)
6. ✅ 테스트: 동일 `refund_event_id`(동일 키) 재시도 → 기존 credit_note 반환 확인

---

## 🔒 GPT 추가 피드백 검증 결과

### 1. 마이그레이션 중복 정리 쿼리
✅ **GPT 제안이 정확합니다.**
- MAX(issued_at)만으로는 tie-break 없음
- 윈도우 함수 사용 권장 (MySQL 8.0+)
- 정리 전/후 확인 쿼리 추가

### 2. UNIQUE 제약 범위
✅ **정책 확정**: invoice 1:1, credit_note 1:N.
- **`UNIQUE(order_id, type)` 폐기** — credit_note까지 1장으로 막히므로 미사용.
- **A안 채택**: `invoice_order_id` generated + `UNIQUE(invoice_order_id)` → invoice만 1장, credit_note 1:N 유지.

### 3. invoice-creator.js DB 충돌 처리
✅ **GPT 제안이 정확합니다.**
- sqlMessage.includes() 의존성 문제
- ER_DUP_ENTRY만 체크하는 패턴으로 변경
- void 상태 에러 처리 추가

### 4. warranty-routes.js 필드 매핑
✅ **필드명 정확 확인됨**
- `oiu.unit_status` → `order.unit_status` ✅
- 메시지 일관성 확인 완료

### 5. 락 순서 역전 금지 규칙
✅ **GPT 제안이 정확합니다.**
- "역전 금지" 문구 추가 필요
- 문서에 명시하여 데드락 방지 원리 고정

---

이렇게 하면 "문서-코드-DB" 불균형이 다시 생길 여지가 거의 없어집니다.

---

## 💾 권장 커밋 단위 (실수 줄이는 순서)

GPT 권장: 각 변경을 단독 커밋으로 분리하여 롤백/추적 용이성 확보

1. **migrations/084_add_invoices_invoice_order_id_unique.sql 단독 커밋** (A안)
   ```bash
   git add backend/migrations/084_add_invoices_invoice_order_id_unique.sql
   git commit -m "feat: Add invoice_order_id partial unique (invoice 1:1, credit_note 1:N)"
   ```

2. **invoice-creator.js 단독 커밋**
   ```bash
   git add backend/utils/invoice-creator.js
   git commit -m "fix: Handle ER_DUP_ENTRY in invoice creation (remove sqlMessage dependency)"
   ```

3. **refund-routes.js 락 순서 수정 단독 커밋**
   ```bash
   git add backend/refund-routes.js
   git commit -m "fix: Refund lock order - orders first to prevent deadlock"
   ```

4. **warranty-routes.js 단독 커밋**
   ```bash
   git add backend/warranty-routes.js
   git commit -m "fix: Remove orders.status check from warranty activation (SSOT compliance)"
   ```

5. **SYSTEM_FLOW_DETAILED.md 단독 커밋**
   ```bash
   git add SYSTEM_FLOW_DETAILED.md
   git commit -m "docs: Update lock order, SSOT rules, and credit_note policy"
   ```

6. **(085) migrations/085_add_invoices_refund_event_id_unique.sql 단독 커밋**
   ```bash
   git add backend/migrations/085_add_invoices_refund_event_id_unique.sql
   git commit -m "feat: Add refund_event_id + credit_note_refund_event_id generated, UNIQUE (085)"
   ```

7. **(085) refund-routes.js 단독 커밋**
   ```bash
   git add backend/refund-routes.js
   git commit -m "feat: Idempotency-Key 필수 + refund_event_id credit_note INSERT, ER_DUP_ENTRY 상세 로그"
   ```

**장점**: 문제 발생 시 롤백/추적이 압도적으로 쉬워짐

---

## 🔍 GPT 추가 피드백 검증 (비회원 환불)

### GPT 답변 요약

**핵심 제안**:
1. 비회원 환불은 "주문 단위(orders)" 기준으로 처리
2. 시작점은 order_number/order_id (warranty_id 아님)
3. 락 순서: orders FOR UPDATE 먼저 → order_item_units → warranties
4. warranty 없어도 환불 가능 (unit 기반)
5. 부분 환불: unit 목록으로 한 번에 처리
6. credit_note 발급은 동일 (085 정책 적용)

---

### 검증 결과

#### 1. "비회원 환불은 관리자 환불로만 처리" ✅ **정확**

**현재 상태**:
- `POST /api/admin/refunds/process` - 관리자 전용 (`requireAdmin` 미들웨어)
- 고객 직접 환불 요청 불가 (문의 시스템으로만 접수)

**판정**: ✅ **GPT 답변이 정확함.** 현재 코드와 정책 일치.

---

#### 2. "주문 단위로 처리" ⚠️ **현재 코드와 불일치**

**현재 상태**:
- 환불 API는 **`warranty_id` 기반** (`refund-routes.js` 120줄)
- warranty_id → warranties FOR UPDATE → order_item_units 업데이트

**GPT 제안**:
- order_number/order_id 기반
- orders FOR UPDATE 먼저 → order_item_units → warranties

**판정**: ⚠️ **방향은 맞지만 현재 코드와 다름.**

**현재 문제점**:
- 락 순서: warranties FOR UPDATE 먼저 (이미 GPT 피드백으로 orders first 수정 예정)
- 시작점: warranty_id (GPT는 order_id 제안)

**보완 필요**:
- **옵션 A (권장)**: 현재 warranty_id 기반 유지하되, **락 순서만 orders first로 수정** (이미 예정)
- **옵션 B**: order_id 기반으로 API 변경 (대규모 리팩토링 필요)

**권장**: **옵션 A**. warranty_id 기반이 더 안전하고, 락 순서만 수정하면 됨.

---

#### 3. "warranty 없어도 환불 가능" ⚠️ **현재 정책상 불가능**

**정책 확정 (1문장)**:
**우리 시스템에서 환불 입력값은 `warranty_id`가 필수이며, warranty 누락은 정상 케이스가 아니라 장애 케이스로 취급한다.**

**현재 상태**: paid 처리 시 warranty 항상 생성 (`paid-order-processor.js`), 환불 API는 `warranty_id` 필수 (`refund-routes.js`).

**GPT 제안**: warranty 없어도 unit 기반 환불 가능, 배송 전/시스템 에러로 warranty 누락 가능성 고려.  
**판정**: 현재 정책 유지. warranty 누락 시 → 장애 케이스, 환불 전 warranty 생성 필요. SSOT = `warranties.status`.

---

## 🔍 GPT 최종 피드백 검증 (084 정책 A 확정·shipment 락 순서)

### GPT 최종 피드백 요약

**핵심 지적**:
1. **084 UNIQUE 범위(A/B) 최종 확정** 필요: "데이터 점검 결과에 따라 A/B"가 아니라 "정책이 A인지 B인지"를 문서 최상단 정책 문장으로 확정
2. **shipment 락 순서 수정**은 "문서 반영"이 아니라 "코드 위치 2곳"에 실제 적용 필요
3. **084 중복 정리 규칙**: 정책 A로 가면 void 다중도 정리 대상
4. **TEMP TABLE 대안**: "한 세션 유지" 체크 문장 추가
5. **refund assert 불일치**: 처리 규칙(rollback + retry) 명시

---

### 검증 결과

#### 1. 084 UNIQUE 범위(A/B) 최종 확정 ✅ **정책 A 확정**

**GPT 지적**: 지금 단계에서 필요한 것은 "데이터 점검 결과에 따라 A/B"가 아니라, "우리 정책이 A인지 B인지"를 문서 최상단 정책 문장으로 확정하는 것.

**정책 A (최종 확정)**: invoice는 주문당 1장만 존재 (issued/void/refunded 무관). 과거 void 다중도 허용하지 않음. 필요하면 void 다중을 하나만 남기고 나머지는 삭제/이관.

**정책 B (폐기)**: issued invoice만 주문당 1장. void invoice는 여러 장 허용(역사 보존).

**판정**: ✅ **GPT 지적이 정확함.** 정책 A로 확정 (더 효율적이고 단순).

**반영**:
- 문서 최상단에 **"084 Invoice UNIQUE 정책 최종 확정 (정책 A)"** 섹션 추가 완료
- 084 마이그레이션 SQL: type='invoice' 전체에서 최신 1건만 남기기 (issued/void/refunded 무관) 반영 완료
- Generated column: `IF(type='invoice', order_id, NULL)` (status 무관) 유지

---

#### 2. shipment 락 순서 수정: 코드 위치 2곳 ⚠️ **코드 수정 필수**

**GPT 지적**: shipment 락 순서 수정은 "문서 반영"이 아니라 "코드 위치 2곳"에 실제 적용되어야 함. 특히 "shipment-routes.js"와 "index.js Phase 12 shipment" 두 군데 모두에서 orders FOR UPDATE를 order_item_units FOR UPDATE보다 먼저 잡도록 통일.

**현재 상태**:
- `shipment-routes.js`: order_item_units FOR UPDATE 먼저 (152줄)
- `index.js` Phase 12: order_item_units FOR UPDATE 먼저 (1953줄)

**판정**: ✅ **GPT 지적이 정확함.** 데드락 리스크의 마지막 남은 실체.

**반영**:
- Step 4b에 **구체적인 코드 수정 내용** 추가 완료 (문서). **코드 반영은 아직 미완료** (체크리스트 참고).
- `shipment-routes.js` 136-152줄: orders FOR UPDATE 먼저 삽입 필요
- `index.js` 1940-1953줄: orders FOR UPDATE 먼저 삽입 필요

---

#### 3. 084 중복 정리 규칙: 정책 A 반영 ✅ **수정 완료**

**GPT 지적**: "084 중복 정리 규칙"이 issued만 대상으로 되어 있는데, 정책 A로 가면 void 다중도 정리 대상이 됨. 정리 쿼리가 issued뿐 아니라 type='invoice' 전체에서 "최신 1건만 남기기"가 되어야 UNIQUE가 붙음.

**판정**: ✅ **GPT 지적이 정확함.** 정책 A에 맞게 수정 완료.

**반영**:
- 084 마이그레이션 SQL: `WHERE type = 'invoice'` (status 무관) 반영 완료
- 중복 정리: type='invoice' 전체에서 최신 1건만 남기기 반영 완료

---

#### 4. TEMP TABLE 대안: 한 세션 유지 체크 ✅ **추가 완료**

**GPT 지적**: TEMP TABLE 대안은 "같은 세션에서" 실행되는 방식이어야 함. run-migration이 파일을 세미콜론으로 쪼개어 개별 쿼리로 보내더라도 같은 커넥션이면 TEMP TABLE은 유지됨. 반대로 중간에 커넥션이 갈리면 TEMP TABLE 방식은 실패.

**판정**: ✅ **GPT 지적이 정확함.** 체크리스트에 "한 커넥션/한 세션 유지" 문장 추가 완료.

**반영**:
- TEMP TABLE 대안 SQL에 "⚠️ 한 커넥션/한 세션 유지 필수" 주석 추가 완료
- run-migration.js 체크리스트에 "한 세션 유지" 문장 추가 완료

---

#### 5. refund assert 불일치 시 처리 규칙 ✅ **명시 완료**

**GPT 지적**: refund에서 "락 없는 식별자 조회" 후 assert는 방향이 맞지만, 이 assert의 실패 시나리오를 문서에 한 줄로 정의해두는 게 좋음. 예: "assert 불일치 발생 시: 즉시 rollback + 재시도 권장(로그는 error 레벨)".

**판정**: ✅ **GPT 지적이 정확함.** 처리 규칙 명시 완료.

**반영**:
- Step 4a 코드에 "⚠️ assert 불일치 시 처리: 즉시 rollback + 재시도 권장" 주석 추가 완료
- 최종 정리 섹션에 "order_id assert (불일치 시 즉시 rollback + 재시도 권장)" 문구 추가 완료

---

### 결론 (GPT 최종 피드백)

**이상한 부분**: 없음. 전반적으로 정책/설계와 맞고, 실제 장애로 이어질 수 있는 "남은 구멍"을 정확히 짚음.

**효율적/좋은 부분**:
- **정책 A 확정**: 더 효율적이고 단순한 정책 선택
- **코드 위치 명시**: shipment 락 순서 수정 위치 구체화
- **한 세션 유지 체크**: TEMP TABLE 대안 안전성 향상
- **assert 처리 규칙**: refund 경쟁 조건 처리 명확화

**위험 사항**:
- **shipment 락 역전**: 코드 2곳 수정 전까지 데드락 위험 존재
- **084 정책 미확정**: 정책 A 확정 전까지 중복 정리 범위 애매 → ✅ **해결됨**

**보완 완료**:
1. ✅ **084 정책 A 확정**: 문서 최상단 + 마이그레이션 SQL 반영 완료
2. ⚠️ **shipment 락 순서**: 문서에 코드 수정 위치·내용 명시 완료. **코드 자체는 아직 미수정** (Step 4b 체크리스트).
3. ✅ **TEMP TABLE 대안**: 한 세션 유지 체크 문장 추가 완료
4. ✅ **refund assert**: 불일치 시 처리 규칙 명시 완료

**보안**: 별도 신규 이슈 없음.

---

#### 4. "부분 환불: unit 목록으로 한 번에 처리" ⚠️ **현재 코드와 다름**

**현재 상태**:
- warranty_id 1개씩 처리 (여러 번 호출로 부분 환불 가능)
- 각 호출마다 credit_note 1장 생성 (085 정책: refund_event_id 기반)

**GPT 제안**:
- order_id + unit 목록으로 한 번에 처리
- 여러 unit에 대해 한 번의 트랜잭션으로 처리

**판정**: ⚠️ **효율적이지만 현재 코드와 다름.**

**현재 방식**:
- warranty_id 여러 번 호출 → 각각 credit_note 생성
- 장점: 단순, 멱등성 보장 (warranty_id 기준)
- 단점: 여러 번 호출 필요

**GPT 제안 방식**:
- order_id + unit 목록 → 한 번에 처리
- 장점: 효율적, 원자성 보장
- 단점: API 변경 필요, 멱등성 키 설계 복잡

**보완 필요**:
- **현재 방식 유지 권장**: warranty_id 기반이 더 안전하고 단순
- **향후 개선**: 필요 시 order_id + unit 목록 API 추가 (기존 API와 병행)

---

#### 5. "락 순서 orders부터" ✅ **이미 반영 예정**

**현재 상태**:
- refund-routes.js: warranties FOR UPDATE 먼저 (175줄)
- GPT 피드백으로 orders first 수정 예정

**판정**: ✅ **GPT 답변이 정확함.** 이미 GPT 피드백 반영 예정.

---

#### 6. "credit_note 발급은 동일" ✅ **정확**

**현재 상태**:
- 085 정책: refund_event_id (Idempotency-Key) 기반
- credit_note 1:N (환불 이벤트 1회당 1장)

**판정**: ✅ **GPT 답변이 정확함.** 비회원/회원 구분 없이 동일 정책 적용.

---

#### 7. "환불의 SSOT는 동일" ✅ **정확**

**현재 상태**:
- 환불 판정: `warranties.status`만 본다 (SSOT)
- `orders.status`는 표시용 집계

**판정**: ✅ **GPT 답변이 정확함.** 비회원/회원 구분 없이 동일 SSOT.

---

#### 8. "비회원이 환불 가능 여부를 어떻게 보게 할까?" ✅ **정확**

**GPT 제안**:
- 서버가 계산한 결과만 내려주기
- "환불 접수 필요(관리자 문의)" / "환불 완료" 상태 라벨

**판정**: ✅ **GPT 답변이 정확함.** 현재 정책과 일치 (고객 직접 환불 불가, 문의 시스템으로만 접수).

---

### 결론

| 항목 | GPT 제안 | 현재 상태 | 판정 | 보완 필요 |
|------|----------|----------|------|----------|
| **관리자 환불** | ✅ | ✅ 관리자 전용 | ✅ **정확** | 없음 |
| **주문 단위 처리** | order_id 기반 | warranty_id 기반 | ⚠️ **방향 맞지만 다름** | 락 순서만 수정 (예정) |
| **warranty 없이 환불** | 가능 | 불가능 (정책상) | ⚠️ **현재 정책상 불가** | 정책 유지 권장 |
| **부분 환불** | unit 목록 | warranty_id 여러 번 | ⚠️ **효율적이지만 다름** | 현재 방식 유지 권장 |
| **락 순서** | orders first | warranties first | ✅ **정확** | 이미 수정 예정 |
| **credit_note** | 동일 | 동일 | ✅ **정확** | 없음 |
| **SSOT** | 동일 | 동일 | ✅ **정확** | 없음 |
| **비회원 UI** | 서버 계산 결과만 | 문의 시스템 | ✅ **정확** | 없음 |

**이상한 부분**: 없음. GPT 답변은 전반적으로 타당함.

**효율적/좋은 부분**:
- **주문 단위 접근**: order_id 기반이 더 직관적 (현재는 warranty_id)
- **락 순서 orders first**: 데드락 방지 (이미 반영 예정)
- **SSOT 일관성**: 비회원/회원 구분 없이 동일 정책

**위험 사항**:
- **warranty 없이 환불**: 현재 정책상 불가능. warranty 없이 환불하면 SSOT 위반 (warranties.status가 진실 원천).
- **주문 단위 API 변경**: 대규모 리팩토링 필요. 현재 warranty_id 기반이 더 안전.

**보완할 점**:
1. **락 순서 수정**: refund-routes.js에서 orders FOR UPDATE 먼저 (이미 예정)
2. **정책 명시**: warranty 없이 환불은 불가능 (시스템 에러로 누락 시 warranty 생성 후 환불)
3. **향후 개선**: 필요 시 order_id + unit 목록 API 추가 검토 (기존 API와 병행)

**보안**: 별도 신규 이슈 없음. (관리자 전용, Idempotency-Key 등 기존 보안 유지)

---

## 🔍 GPT 최종 피드백 검증 (084 중복 정리 치명적 문제·085 멱등성 범위)

### GPT 최종 피드백 요약

**핵심 지적**:
1. **084 중복 정리 방식의 치명적 문제**: "void 처리"만으로는 UNIQUE가 걸리지 않음. UPDATE로 status='void'만 바꾸면 generated column 값이 동일하게 유지되어 UNIQUE 추가 실패.
2. **credit_note 참조 무결성**: 중복 invoice 삭제 시 `related_invoice_id` 리맵 필요.
3. **085 멱등성 범위 명시**: API/문서에 "Idempotency-Key는 재시도에만 재사용, 새 환불 이벤트는 항상 새 키" 명시 필요.
4. **락 순서 통일**: "락 없는 식별자 조회"가 트랜잭션 내부에서 동일 커넥션으로 수행되는지 재확인 필요.

---

### 검증 결과

#### 1. 084 중복 정리 방식의 치명적 문제 ✅ **정확·수정 완료**

**GPT 지적**: UPDATE로 status='void'만 바꾸면:
- 중복 레코드들이 여전히 type='invoice'이고 order_id가 같음
- generated column 값 `invoice_order_id = IF(type='invoice', order_id, NULL)`도 동일하게 유지됨
- 따라서 UNIQUE(invoice_order_id) 추가 시 **중복키로 실패**

**판정**: ✅ **GPT 지적이 정확함.** 치명적 문제. UPDATE → DELETE로 수정 필요.

**반영**:
- 084 마이그레이션 SQL 수정 완료:
  1. (A) 유지할 invoice_id 결정 (TEMP TABLE)
  2. (B) credit_note의 related_invoice_id를 keep_invoice_id로 리맵
  3. (C) rn>1 invoice 행 삭제 (DELETE)
  4. (D) generated column + UNIQUE 추가
- TEMP TABLE 방식으로 CTE+UPDATE 호환성 문제도 회피

---

#### 2. credit_note 참조 무결성 처리 ✅ **정확·수정 완료**

**GPT 지적**: 중복 invoice 삭제 시 credit_note의 `related_invoice_id`가 "삭제될 invoice_id"를 가리킬 수 있음. 외래키는 `ON DELETE SET NULL`이므로 삭제는 가능하지만, 논리적으로 credit_note가 고아가 됨.

**판정**: ✅ **GPT 지적이 정확함.** 리맵 처리 필요.

**반영**:
- 084 마이그레이션 SQL에 credit_note 리맵 로직 추가 완료:
  ```sql
  UPDATE invoices cn
  INNER JOIN invoice_keep ik ON cn.related_invoice_id IS NOT NULL
  INNER JOIN invoices del_inv ON del_inv.invoice_id = cn.related_invoice_id
      AND del_inv.type = 'invoice'
      AND del_inv.order_id = ik.order_id
      AND del_inv.invoice_id != ik.keep_invoice_id
  SET cn.related_invoice_id = ik.keep_invoice_id
  WHERE cn.type = 'credit_note';
  ```

---

#### 3. 085 멱등성 범위 명시 ✅ **명시 필요**

**GPT 지적**: API/문서에 아래 2문장을 더 고정하면 좋음:
- Idempotency-Key는 "재시도(retry)"에만 재사용한다 (새 환불 이벤트는 항상 새 키)
- 같은 warranty에 대해 다른 키로 연속 호출되는 건 "새 환불 이벤트"이므로, 중복 환불 여부는 unit_status/금액 검증에서 반드시 차단한다

**판정**: ✅ **GPT 지적이 정확함.** 멱등성 범위 명시 필요.

**반영**:
- 085 섹션에 "멱등성 범위" 명시 추가:
  - **085의 UNIQUE**: "같은 환불 이벤트(refund_event_id)로 credit_note 중복 발급 방지"
  - **중복 환불 방지**: unit_status/금액 검증 레이어에서 처리
  - **Idempotency-Key 정책**: 재시도(retry)에만 재사용, 새 환불 이벤트는 항상 새 키
  - **같은 warranty + 다른 키**: 새 환불 이벤트로 간주, unit_status/금액 검증에서 차단

---

#### 4. 락 순서 통일: 동일 커넥션 확인 ✅ **재확인 필요**

**GPT 지적**: "락 없는 식별자 조회"가 트랜잭션 내부에서 동일 커넥션으로 수행되는지(중간에 커넥션 교체/재획득이 없는지)만 코드 레벨로 재확인하면 됨.

**현재 상태 확인**:
- `refund-routes.js`: `connection = await mysql.createConnection(dbConfig); await connection.beginTransaction();` → 단일 커넥션 사용 ✅
- `shipment-routes.js`: `connection = await mysql.createConnection(dbConfig); await connection.beginTransaction();` → 단일 커넥션 사용 ✅

**판정**: ✅ **GPT 지적이 정확함.** 현재 코드는 동일 커넥션 사용 중. 문서에 명시 완료.

**반영**:
- Step 4a, 4b에 "동일 트랜잭션 내 동일 커넥션 필수" 명시 완료

---

### 결론 (GPT 최종 피드백)

**이상한 부분**: 없음. 전반적으로 정책/설계와 맞고, 실제 장애로 이어질 수 있는 "치명적 구멍"을 정확히 짚음.

**효율적/좋은 부분**:
- **084 DELETE 방식**: UPDATE → DELETE로 UNIQUE 실패 문제 해결
- **credit_note 리맵**: 참조 무결성 보장
- **085 멱등성 범위 명시**: API/문서에 명확한 정책 정의
- **동일 커넥션 확인**: 락 순서 통일의 안전성 확보

**위험 사항**:
- **084 UPDATE 방식**: UNIQUE 추가 시 100% 실패 → ✅ **DELETE로 수정 완료**
- **credit_note 고아**: 참조 무결성 깨짐 → ✅ **리맵 로직 추가 완료**
- **085 멱등성 범위 애매**: 재시도 vs 새 환불 이벤트 구분 불명확 → ✅ **명시 필요**

**보완 완료**:
1. ✅ **084 중복 정리**: UPDATE → DELETE로 수정 완료 (credit_note 리맵 포함)
2. ✅ **085 멱등성 범위**: API/문서에 명시 필요 (재시도 vs 새 환불 이벤트 구분)
3. ✅ **락 순서 동일 커넥션**: 코드 확인 완료, 문서 명시 완료

**보안**: 별도 신규 이슈 없음.

---
