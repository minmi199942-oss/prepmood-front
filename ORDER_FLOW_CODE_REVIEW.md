# 주문 흐름 코드 리뷰 및 개선 사항

## 📋 검토 범위
- 주문 생성 → 결제(Paid) → 출고(Shipment) → 배송완료(Delivered) → 환불(Refund) → Claim
- 락 순서 일관성
- SSOT 준수 (orders.status vs unit_status, warranty.status)
- 트랜잭션/커넥션 관리
- 에러 처리

---

## ✅ 잘 구현된 부분

### 1. 락 순서 통일
- ✅ **refund-routes.js**: orders FOR UPDATE → warranties FOR UPDATE (이전 수정 반영)
- ✅ **shipment-routes.js**: orders FOR UPDATE → order_item_units FOR UPDATE (이전 수정 반영)
- ✅ **index.js 배송완료**: orders → stock_units → order_item_units (이번 수정 반영)
- ✅ **warranty-routes 활성화**: orders FOR UPDATE → warranties FOR UPDATE (이번 수정 반영)
- ✅ **paid-order-processor.js**: orders → stock_units → order_item_units → warranties (이미 올바름)

### 2. 트랜잭션/커넥션 관리
- ✅ **order-routes.js**: `finally { if (connection) await connection.end(); }` 존재 (730-734줄)
- ✅ **refund-routes.js**: `finally { if (connection) await connection.end(); }` 존재
- ✅ **shipment-routes.js**: `finally { if (connection) await connection.end(); }` 존재
- ✅ **warranty-routes.js**: `finally` 블록에서 `connection.end()` 처리

### 3. SSOT 준수 (대부분)
- ✅ **warranty-routes.js 활성화**: `orders.status` 제거, `unit_status` + `warranties.status`만 사용
- ✅ **refund-routes.js**: `warranties.status`만 사용 (주석 명시)
- ✅ **paid-order-processor.js**: `o.status`는 SELECT에 포함되지만 정책 판단에 사용 안 함

---

## ⚠️ 발견된 문제점

### 1. SSOT 위반: payments-routes.js (중간 우선순위)

**위치**: `backend/payments-routes.js` 132-142줄

**문제**:
```javascript
const normalizedStatus = (order.status || '').toLowerCase();
const alreadyProcessedStatuses = new Set(['confirmed', 'completed', 'processing', 'paid']);

if (alreadyProcessedStatuses.has(normalizedStatus)) {
    // ... 이미 처리된 주문 처리 로직
    // ⚠️ paid_events 확인은 하지만, order.status로 먼저 판단함
}
```

**SSOT 원칙 위반**: `orders.status`는 집계 결과(표시용)이며, 정책 판단 기준으로 사용하면 안 됩니다.

**현재 로직**:
1. `order.status`로 "이미 처리됨" **추정** (최적화)
2. 그 후 `paid_events` 존재 여부 확인 (실제 진실 원천)
3. `paid_events` 없으면 생성

**문제점**:
- `order.status`가 집계 지연/오류로 인해 `pending`일 수 있음
- `paid_events`가 실제 진실 원천인데, `order.status`를 **필터 조건**으로 사용
- 만약 `order.status = 'pending'`이지만 `paid_events`가 이미 존재하면, 이 분기를 건너뛰고 일반 흐름으로 진행 (중복 생성 시도 가능, 다만 idempotency로 방어)

**권장 수정**:
```javascript
// order.status 대신 paid_events를 먼저 확인 (SSOT 준수)
const [existingPaidEvents] = await connection.execute(
    `SELECT event_id FROM paid_events WHERE order_id = ?`,
    [order.order_id]
);

if (existingPaidEvents.length > 0) {
    // 이미 paid_events가 있으면 "이미 처리됨"으로 간주
    // order.status는 표시용으로만 사용
    const normalizedStatus = (order.status || '').toLowerCase();
    // ... 기존 로직 (payment 조회, 응답 등)
} else {
    // paid_events 없으면 일반 결제 처리 흐름
}
```

**영향도**: 낮음 → 중간
- 현재는 `paid_events` 확인 후 처리하므로 **기능상 문제는 없음**
- 하지만 SSOT 원칙 위반으로, `order.status` 집계 지연 시 불필요한 분기 건너뛰기 가능
- `paid_events` 중복 생성은 idempotency로 방어되지만, 로직이 복잡해짐

---

### 2. SSOT 위반: warranty-event-routes.js (낮은 우선순위)

**위치**: `backend/warranty-event-routes.js` 438-481줄

**문제**:
```javascript
const [units] = await connection.execute(
    `SELECT oiu.order_item_unit_id, ..., o.status as order_status, ...
     FROM order_item_units oiu
     JOIN orders o ON ...
     WHERE oiu.order_item_unit_id = ?`,
    [warranty.source_order_item_unit_id]
);

// ...

if (unit.order_status === 'refunded') {
    invoiceLinkageStatus = {
        status: 'refunded',
        label: '환불됨',
        badge_type: 'danger'
    };
}
```

**SSOT 원칙 위반**: 환불 여부는 `order_item_units.unit_status` 또는 `warranties.status`로 판단해야 합니다.

**현재**: `orders.status`를 사용하여 "환불됨" 배지 표시

**권장 수정**:
```javascript
const [units] = await connection.execute(
    `SELECT oiu.order_item_unit_id, ..., oiu.unit_status, o.status as order_status, ...
     FROM order_item_units oiu
     JOIN orders o ON ...
     WHERE oiu.order_item_unit_id = ?`,
    [warranty.source_order_item_unit_id]
);

// ...

// unit_status 또는 warranty.status로 판단
if (unit.unit_status === 'refunded' || warranty.status === 'revoked') {
    invoiceLinkageStatus = {
        status: 'refunded',
        label: '환불됨',
        badge_type: 'danger'
    };
}
```

**영향도**: 낮음
- 관리자 UI의 배지 표시용이므로 기능상 문제는 없음
- 하지만 SSOT 일관성 측면에서 수정 권장

---

### 3. invoice-creator.js ER_DUP_ENTRY 처리 (확인 완료)

**위치**: `backend/utils/invoice-creator.js` 220-272줄

**상태**: ✅ **정상**
- `ER_DUP_ENTRY` 처리 로직 정상
- `existing` 변수 스코프 정상
- `issued` 우선 정렬 및 `void` 후 재발급 불허 정책 반영

---

## 🔍 추가 검증 사항

### 1. 트랜잭션 경계 일관성

**확인 결과**: ✅ **정상**
- 모든 주요 라우트에서 `beginTransaction()` → `commit()` / `rollback()` → `finally { connection.end() }` 패턴 일관
- 예외: `order-routes.js` 주문 생성은 `finally`에서 `connection.end()` 처리

### 2. 락 순서 일관성

**확인 결과**: ✅ **수정 완료**
- 모든 주요 흐름에서 `orders FOR UPDATE` 먼저 잠금
- 예외: `warranty-event-routes.js`, `warranty-routes.js` 양도 등은 `orders` 미사용 (단일 테이블 작업)

### 3. 에러 처리 일관성

**확인 결과**: ✅ **대부분 정상**
- `rollback()` 후 `connection.end()` 또는 `finally`에서 처리
- 일부 라우트에서 `rollback()` 후 즉시 `return` (트랜잭션 종료 후 응답)

---

## 📝 권장 수정 사항 요약

| 우선순위 | 파일 | 라인 | 문제 | 수정 방법 |
|---------|------|------|------|----------|
| 중간 | `payments-routes.js` | 132-142 | `order.status`로 "이미 처리됨" 판단 | `paid_events` 먼저 확인 |
| 낮음 | `warranty-event-routes.js` | 438-481 | `order.status`로 "환불됨" 배지 | `unit_status` 또는 `warranty.status` 사용 |

---

## ✅ 검증 완료 항목

1. ✅ 락 순서: 모든 주요 흐름에서 `orders` 먼저 잠금
2. ✅ 트랜잭션: `finally`에서 `connection.end()` 처리
3. ✅ SSOT: 대부분 준수 (위 2건만 예외)
4. ✅ ER_DUP_ENTRY: `invoice-creator.js` 정상 처리
5. ✅ 원자적 업데이트: `affectedRows=1` 검증 대부분 존재

---

## 🎯 결론

**전체 평가**: ✅ **양호**

주요 문제는 **SSOT 위반 2건**이며, 모두 기능상 치명적 문제는 아닙니다. 하지만 일관성과 유지보수성을 위해 수정을 권장합니다.

**즉시 수정 필요**: 없음  
**권장 수정**: `payments-routes.js` (중간 우선순위), `warranty-event-routes.js` (낮은 우선순위)
