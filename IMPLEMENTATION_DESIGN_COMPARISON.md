# 구현 vs 설계 문서 비교 분석

## 📋 개요

이 문서는 현재 구현된 코드와 설계 문서(`SYSTEM_FLOW_DETAILED.md`, `FINAL_EXECUTION_SPEC_REVIEW.md` 등) 간의 차이점과 모순점을 체계적으로 분석합니다.

**분석 기준일**: 2026-01-16  
**분석 범위**: 
- `backend/` 디렉토리 전체
- 설계 문서: `SYSTEM_FLOW_DETAILED.md`, `FINAL_EXECUTION_SPEC_REVIEW.md`, `SCHEMA_SSOT.md`

---

## 🔴 심각한 위반 사항 (즉시 수정 필요)

### 1. `orders.status` 직접 업데이트 위반

**설계 원칙**:
> `orders.status`는 집계 결과(뷰/표시용)이며, 직접 정책 판단 기준으로 사용하지 않는다.  
> `orders.status`는 집계 함수(`updateOrderStatus`)로만 갱신되며, 관리자 수동 수정 금지.

**위반 사례 1**: `backend/payments-routes.js` (1434-1438줄)
```javascript
// ❌ 위반: orders.status 직접 업데이트
const [updateResult] = await connection.execute(
    `UPDATE orders 
     SET status = ?, updated_at = NOW() 
     WHERE order_id = ?`,
    [orderStatus, orderIdForPaidProcess]
);
```

**위치**: `handlePaymentStatusChange()` 함수 내부 (webhook 처리)  
**문제점**: 
- `orderStatus` 변수가 `paymentStatus`에 따라 결정됨 (`'processing'`, `'confirmed'`, `'failed'`)
- 집계 함수(`updateOrderStatus`)를 호출하지 않음
- `order_item_units.unit_status`와 `paid_events`를 고려하지 않음

**수정 방안**:
```javascript
// ✅ 올바른 구현
// orderStatus 변수 제거
// 대신 updateOrderStatus() 호출
await updateOrderStatus(connection, orderIdForPaidProcess);
```

**위반 사례 2**: `backend/index.js` (1675-1715줄)
```javascript
// ❌ 위반: 관리자 API로 orders.status 직접 수정
app.put('/api/admin/orders/:orderId/status', authenticateToken, requireAdmin, async (req, res) => {
    // ...
    await connection.execute(
        `UPDATE orders 
         SET status = ?
         WHERE order_id = ?`,
        [status, orderId]
    );
});
```

**문제점**:
- 설계 문서에 명시된 "관리자 수동 수정 금지" 정책 위반
- `FINAL_EXECUTION_SPEC_REVIEW.md` 75줄: "관리자 수동 수정 금지 (기존 `PUT /api/admin/orders/:orderId/status` API는 제거 또는 집계 함수로 대체)"

**수정 방안**:
1. **옵션 A (권장)**: API 제거
   - 관리자는 `orders.status`를 직접 수정할 수 없음
   - 상태 변경은 `order_item_units.unit_status`나 `paid_events` 변경으로만 가능

2. **옵션 B**: API를 집계 함수 호출로 변경
   - 요청된 `status` 값이 집계 결과와 일치하는지 검증
   - 일치하지 않으면 에러 반환

---

## ⚠️ 미구현 기능 (설계 문서에 있으나 구현 없음)

### 1. 보증서 활성화 API

**설계 문서**: `SYSTEM_FLOW_DETAILED.md` 4-1절, `FINAL_EXECUTION_SPEC_REVIEW.md` 467-496줄

**필요한 API**: `POST /api/warranties/:warrantyId/activate`

**설계 요구사항**:
1. `warranties.owner_user_id = 현재 로그인한 user_id` 확인
2. `warranties.status = 'issued'` 확인
3. **핵심 검증: 인보이스 연동 확인**
   - `orders.user_id = 현재 로그인한 user_id` 확인
   - `orders.status != 'refunded'` 확인
   - `order_item_units.unit_status != 'refunded'` 확인
4. 동의 체크 확인 (`agree: true`)
5. 원자적 조건으로 상태 전이: `WHERE warranty_id = ? AND status = 'issued' AND owner_user_id = ?`
6. `affectedRows=1` 검증 필수
7. `warranty_events`에 활성화 이벤트 기록

**현재 상태**: ❌ **구현 없음**

**영향**: 
- 사용자가 보증서를 활성화할 수 없음
- 환불 후 QR 코드 악용 방지 메커니즘 작동 불가

---

### 2. Claim API (비회원 → 회원 전환)

**설계 문서**: `SYSTEM_FLOW_DETAILED.md` 3-2절, `FINAL_EXECUTION_SPEC_REVIEW.md` 1404-1407줄

**필요한 API**:
- `POST /api/orders/:orderId/claim-token` (claim_token 발급)
- `POST /api/orders/:orderId/claim` (Claim 실행)

**설계 요구사항**:
1. **3-Factor Atomic Check**:
   ```sql
   UPDATE claim_tokens
   SET used_at = NOW()
   WHERE token = ? AND order_id = ? AND used_at IS NULL AND expires_at > NOW()
   ```
   - `affectedRows=1` 검증 필수
2. `orders.user_id` = 현재 로그인한 `user_id`로 업데이트
3. `orders.guest_id` = **유지** (감사 로그)
4. 해당 주문의 모든 `warranties.status` = `'issued_unassigned'` → `'issued'`로 업데이트
5. `warranties.owner_user_id` = 현재 로그인한 `user_id`로 업데이트
6. `guest_order_access_token` 회수 (revoked_at 설정)

**현재 상태**: ❌ **구현 없음**

**영향**:
- 비회원 주문을 회원 계정에 연동할 수 없음
- 비회원 주문 흐름이 완전히 작동하지 않음

---

### 3. 양도 API (사용자 간 양도)

**설계 문서**: `SYSTEM_FLOW_DETAILED.md` 5-1절, `FINAL_EXECUTION_SPEC_REVIEW.md` 554줄

**필요한 API**:
- `POST /api/warranties/:warrantyId/transfer` (양도 요청)
- `POST /api/warranties/transfer/accept` (양도 수락)
- `POST /api/warranties/transfer/:transferId/cancel` (양도 취소)

**설계 요구사항**:
1. **양도 요청**:
   - `warranties.owner_user_id = 현재 로그인한 user_id` 확인
   - `warranties.status = 'active'` 확인
   - 랜덤 7자 코드 생성 (72시간 유효)
   - `warranty_transfers` 테이블에 양도 요청 기록
   - 이메일 발송

2. **양도 수락**:
   - 원자적 조건 검증 (FOR UPDATE)
   - 코드 검증
   - 이메일 일치 검증
   - 현재 소유자 일치 확인
   - `warranties.owner_user_id` 변경 (affectedRows=1 검증)
   - `warranty_transfers.status` → `'completed'` (affectedRows=1 검증)
   - `warranties.status`는 `'active'` 상태로 유지
   - `warranty_events`에 양도 이벤트 기록

**현재 상태**: 
- ❌ **API 구현 없음**
- ✅ **admin-cli.js에 관리자 수동 양도 기능 있음** (CLI 도구)

**영향**:
- 사용자 간 양도 불가능
- 설계된 양도 흐름(요청/수락/취소) 작동하지 않음

---

### 4. 환불 처리 API (관리자 전용)

**설계 문서**: `SYSTEM_FLOW_DETAILED.md` 6-2절, `FINAL_EXECUTION_SPEC_REVIEW.md` 205-257줄

**필요한 API**: `POST /api/admin/refunds/process`

**설계 요구사항**:
1. **환불 가능 판정**: `warranties.status`만 본다 (SSOT)
   - `revoked` → 거부
   - `active` → 거부
   - `issued` / `issued_unassigned` → 허용
   - ❌ `orders.status`로 판단 금지
   - ❌ `unit_status`로 판단 금지

2. **환불 처리**:
   - 원자적 조건으로 상태 전이: `WHERE warranty_id = ? AND status IN ('issued', 'issued_unassigned')`
   - `affectedRows=1` 검증 필수
   - `warranties.revoked_at` = NOW()
   - `order_item_units.unit_status` = `'refunded'` 업데이트
   - `stock_units.status` → `'in_stock'` (재판매 가능)
   - **credit_note 생성** (`invoices` 테이블, `type='credit_note'`)
   - `orders.status` 집계 함수로 자동 업데이트

**현재 상태**: ❌ **구현 없음**

**영향**:
- 환불 처리가 불가능
- 환불 정책(고객 직접 요청 불가, 관리자 수동 처리) 작동하지 않음

---

## ✅ 올바르게 구현된 기능

### 1. Paid 처리 및 재판매 로직

**파일**: `backend/utils/paid-order-processor.js`

**구현 상태**: ✅ **올바르게 구현됨**

**확인 사항**:
- ✅ 락 순서 준수: `stock_units` → `orders` → `warranties` → `invoices`
- ✅ 재고 사전 검증 (부분 예약 방지)
- ✅ 원자적 업데이트: `WHERE status = 'in_stock'` + `affectedRows=1` 검증
- ✅ 재판매 처리: `revoked` → `issued`/`issued_unassigned` 전이
- ✅ 재판매 시 `revoked_at` 유지 (A안 정책)
- ✅ `paid_events` 존재 확인 (재판매 전이 조건)
- ✅ 트랜잭션 롤백 시 재고 해제 안전망

**설계 문서 준수**: ✅ **완벽히 준수**

---

### 2. `orders.status` 집계 함수

**파일**: `backend/utils/order-status-aggregator.js`

**구현 상태**: ✅ **올바르게 구현됨**

**확인 사항**:
- ✅ `paid_events` 존재 여부 확인
- ✅ `order_item_units.unit_status` 집계
- ✅ `partial_shipped`, `partial_delivered` 상태 지원
- ✅ `refunded` 상태 집계
- ✅ `affectedRows=1` 검증

**설계 문서 준수**: ✅ **완벽히 준수**

**참고**: `orders.status` 체크 제약은 최근 마이그레이션(`079_fix_orders_status_check_constraint.sql`)으로 `paid`, `partial_shipped`, `partial_delivered`가 추가되어 설계 문서와 일치함.

---

### 3. `paid_events` 생성 및 멱등성

**파일**: `backend/utils/paid-event-creator.js` (추정), `backend/payments-routes.js`

**구현 상태**: ✅ **올바르게 구현됨**

**확인 사항**:
- ✅ `paid_events`는 별도 커넥션(autocommit)으로 먼저 생성
- ✅ `UNIQUE(order_id, payment_key)` 제약으로 중복 방지
- ✅ `processPaidOrder()`는 `paidEventId`를 받아서 처리

**설계 문서 준수**: ✅ **완벽히 준수**

---

## ⚠️ 부분적으로 구현된 기능

### 1. 보증서 이벤트 시스템

**파일**: `backend/warranty-event-routes.js`

**구현 상태**: ⚠️ **부분 구현**

**확인 사항**:
- ✅ 관리자 이벤트 생성 API 존재 (`POST /api/admin/warranties/:id/events`)
- ✅ 이벤트 타입: `status_change`, `owner_change`, `suspend`, `unsuspend`, `revoke`
- ❌ **활성화 이벤트 타입 없음**: `activate` 또는 `status_changed` (활성화용)
- ❌ **양도 이벤트 타입 없음**: `ownership_transferred` (설계 문서 요구)

**설계 문서 요구사항**:
- `SYSTEM_FLOW_DETAILED.md` 409줄: 활성화 시 `event_type: 'status_changed'`
- `SYSTEM_FLOW_DETAILED.md` 486줄: 양도 시 `event_type: 'ownership_transferred'` ⚠️ **이벤트 타입 분리**

**수정 필요**:
- `warranty_events.event_type` ENUM에 `ownership_transferred` 추가
- 활성화 API 구현 시 `status_changed` 이벤트 기록

---

## 📊 종합 비교표

| 기능 | 설계 문서 | 구현 상태 | 준수도 | 우선순위 |
|------|----------|----------|--------|----------|
| Paid 처리 | ✅ | ✅ | 100% | - |
| 재판매 로직 | ✅ | ✅ | 100% | - |
| `orders.status` 집계 | ✅ | ✅ | 100% | - |
| `paid_events` 멱등성 | ✅ | ✅ | 100% | - |
| **`orders.status` 직접 업데이트** | ❌ 금지 | ⚠️ **위반** | 0% | 🔴 **즉시** |
| **활성화 API** | ✅ | ❌ | 0% | 🔴 **높음** |
| **Claim API** | ✅ | ❌ | 0% | 🔴 **높음** |
| **양도 API** | ✅ | ❌ | 0% | 🟡 **중간** |
| **환불 API** | ✅ | ❌ | 0% | 🟡 **중간** |
| 보증서 이벤트 | ✅ | ⚠️ 부분 | 60% | 🟡 **중간** |

---

## 🎯 수정 우선순위

### 🔴 즉시 수정 (심각한 위반)

1. **`orders.status` 직접 업데이트 제거**
   - `backend/payments-routes.js` 1434-1438줄 수정
   - `backend/index.js` 1675-1715줄 수정 (API 제거 또는 집계 함수로 변경)

### 🔴 높은 우선순위 (핵심 기능 미구현)

2. **활성화 API 구현**
   - `POST /api/warranties/:warrantyId/activate`
   - 인보이스 연동 확인 필수
   - 환불 후 QR 코드 악용 방지 메커니즘

3. **Claim API 구현**
   - `POST /api/orders/:orderId/claim-token`
   - `POST /api/orders/:orderId/claim`
   - 비회원 주문 흐름 완성

### 🟡 중간 우선순위 (운영 기능)

4. **양도 API 구현**
   - `POST /api/warranties/:warrantyId/transfer`
   - `POST /api/warranties/transfer/accept`
   - `POST /api/warranties/transfer/:transferId/cancel`

5. **환불 API 구현**
   - `POST /api/admin/refunds/process`
   - `warranties.status` 기반 판정
   - credit_note 생성

6. **보증서 이벤트 시스템 보완**
   - `ownership_transferred` 이벤트 타입 추가
   - 활성화 이벤트 기록

---

## 📝 참고 사항

### 1. DB 스키마 일치성

**확인 결과**: ✅ **대부분 일치**

- `orders.status` 체크 제약: 최근 마이그레이션으로 `paid`, `partial_shipped`, `partial_delivered` 추가됨
- `warranties.status` ENUM: 설계 문서와 일치 (`issued_unassigned`, `issued`, `active`, `suspended`, `revoked`)
- `order_item_units.unit_status` ENUM: 설계 문서와 일치 (`reserved`, `shipped`, `delivered`, `refunded`)

### 2. 락 순서 준수

**확인 결과**: ✅ **준수**

- `paid-order-processor.js`에서 락 순서 준수: `stock_units` → `orders` → `warranties` → `invoices`

### 3. 원자성 규칙 준수

**확인 결과**: ✅ **대부분 준수**

- `paid-order-processor.js`에서 `affectedRows=1` 검증 수행
- 재판매 처리에서 원자적 조건 사용

---

## 🔍 추가 확인 필요 사항

1. **QR 스캔 로직**: 설계 문서에 따르면 QR 스캔 시 warranty 생성이 아니라 조회만 수행해야 함. 현재 구현 확인 필요.

2. **비회원 주문 조회**: `guest_order_access_token` 기반 조회 API 구현 여부 확인 필요.

3. **인보이스 생성**: `paid-order-processor.js`에서 인보이스 생성이 try-catch로 감싸져 있어 실패해도 계속 진행됨. 설계 문서와 일치하는지 확인 필요.

---

## 📌 결론

**전체 준수도**: 약 **60%**

**주요 문제점**:
1. `orders.status` 직접 업데이트 위반 (심각)
2. 핵심 기능(활성화, Claim, 양도, 환불) 미구현

**권장 조치**:
1. 즉시 `orders.status` 직접 업데이트 제거
2. 활성화 API 및 Claim API 우선 구현
3. 양도 및 환불 API 단계적 구현

**긍정적 측면**:
- Paid 처리 및 재판매 로직은 설계 문서를 완벽히 준수
- 락 순서 및 원자성 규칙 준수
- DB 스키마는 설계 문서와 일치
