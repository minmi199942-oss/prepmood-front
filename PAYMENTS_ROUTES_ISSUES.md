# payments-routes.js 문제점 및 수정 사항

## 🐛 발견된 문제점

### 1. 치명적 버그: `alreadyProcessedStatuses` 체크 후 `processPaidOrder()` 실행 후 rollback

**위치**: 라인 180-222

**문제**:
```javascript
// processPaidOrder() 실행 (트랜잭션 내에서)
const paidResult = await processPaidOrder({
    connection,
    paidEventId: paidEventId,
    ...
});

// ⚠️ 치명적 버그: processPaidOrder() 내부에서 수행한 모든 작업이 롤백됨!
await connection.rollback();
await connection.end();
```

**영향**:
- 재고 배정 (`stock_units.status = 'reserved'`) → 롤백
- `order_item_units` 생성 → 롤백
- `warranties` 생성 → 롤백
- `invoices` 생성 → 롤백
- `orders.paid_at` 업데이트 → 롤백

**해결책**: `processPaidOrder()` 실행 후 `commit()` 해야 함

---

### 2. 이니시스 결제 흐름 누락: `paid_events` 및 `processPaidOrder()` 호출 없음

**위치**: `POST /api/payments/inicis/return` (라인 712-921)

**문제**:
- `payments` 테이블에 저장만 하고
- `paid_events` 생성 없음
- `processPaidOrder()` 호출 없음

**영향**:
- 이니시스 결제 시 보증서/인보이스 생성 안 됨
- 재고 배정 안 됨

**해결책**: 토스 결제와 동일하게 `paid_events` 생성 및 `processPaidOrder()` 호출 추가

---

### 3. 중복 코드: `createPaidEvent()` 및 `processPaidOrder()` 호출 패턴 반복

**위치**:
- 라인 169-190: `alreadyProcessedStatuses` 체크 후
- 라인 403-432: 정상 흐름
- 라인 1229-1258: 웹훅 처리

**문제**: 동일한 로직이 3곳에 반복됨

**해결책**: 공통 함수로 추출 (선택사항, 가독성 향상)

---

### 4. 트랜잭션 처리 불일치

**문제**:
- `alreadyProcessedStatuses` 체크 후: `rollback()` (라인 222)
- 정상 흐름: `commit()` (라인 484)
- 하지만 `processPaidOrder()`는 트랜잭션 내에서 실행되어야 함

**해결책**: `processPaidOrder()` 실행 후 `commit()` 해야 함

---

## 🔧 수정 사항

### 수정 1: `alreadyProcessedStatuses` 체크 후 트랜잭션 커밋

```javascript
if (existingPaidEvents.length === 0 && existingPaymentStatus === 'captured') {
    try {
        const paidEventResult = await createPaidEvent({...});
        const paidEventId = paidEventResult.eventId;

        // processPaidOrder() 실행
        const paidResult = await processPaidOrder({
            connection,
            paidEventId: paidEventId,
            ...
        });

        // ⚠️ 수정: rollback 대신 commit!
        await connection.commit();
        await connection.end();

        Logger.log('[payments][confirm] 이미 처리된 주문의 paid_events 생성 및 처리 완료', {...});
    } catch (err) {
        await connection.rollback();
        await connection.end();
        Logger.error('[payments][confirm] 이미 처리된 주문의 paid_events 생성 실패', {...});
    }
} else {
    // paid_events가 이미 있거나 결제가 완료되지 않은 경우
    await connection.rollback();
    await connection.end();
}
```

---

### 수정 2: 이니시스 결제 흐름에 `paid_events` 및 `processPaidOrder()` 추가

```javascript
// payments 테이블에 저장
await connection.execute(`INSERT INTO payments ...`);

// 주문 상태 업데이트
await connection.execute(`UPDATE orders SET status = ? ...`);

// ⚠️ 추가: paid_events 생성 및 processPaidOrder() 실행
if (paymentStatus === 'captured') {
    try {
        const paidEventResult = await createPaidEvent({
            orderId: order.order_id,
            paymentKey: tid,
            amount: serverAmount,
            currency: 'KRW',
            eventSource: 'redirect',
            rawPayload: req.body
        });

        const paidEventId = paidEventResult.eventId;

        const paidResult = await processPaidOrder({
            connection,
            paidEventId: paidEventId,
            orderId: order.order_id,
            paymentKey: tid,
            amount: serverAmount,
            currency: 'KRW',
            eventSource: 'redirect',
            rawPayload: req.body
        });

        Logger.log('[payments][inicis] Paid 처리 완료', {
            order_id: order.order_id,
            order_number: orderNumber,
            paidEventId,
            stockUnitsReserved: paidResult.data.stockUnitsReserved,
            orderItemUnitsCreated: paidResult.data.orderItemUnitsCreated,
            warrantiesCreated: paidResult.data.warrantiesCreated,
            invoiceNumber: paidResult.data.invoiceNumber
        });
    } catch (err) {
        Logger.error('[payments][inicis] Paid 처리 실패 (결제는 성공, paid_events는 보존됨)', {
            order_id: order.order_id,
            order_number: orderNumber,
            error: err.message
        });
        // 에러는 로깅만 (결제는 성공 처리)
    }
}

await connection.commit();
await connection.end();
```

---

## 📝 수정 우선순위

1. **치명적 버그 수정** (수정 1): `alreadyProcessedStatuses` 체크 후 `commit()` → **즉시 수정 필요**
2. **이니시스 결제 흐름 추가** (수정 2): `paid_events` 및 `processPaidOrder()` 추가 → **즉시 수정 필요**
3. **중복 코드 제거** (선택사항): 공통 함수 추출 → **나중에 리팩토링**
