# 주문 58 버그 발견 및 해결

## 🐛 버그 발견

### 문제점

`backend/payments-routes.js`의 `POST /api/payments/confirm` 엔드포인트에서:

```javascript
const normalizedStatus = (order.status || '').toLowerCase();
const alreadyProcessedStatuses = new Set(['confirmed', 'completed', 'processing', 'paid']);

if (alreadyProcessedStatuses.has(normalizedStatus)) {
    // ... 기존 결제 확인 후
    return res.json({
        success: true,
        data: {
            alreadyConfirmed: true,
            // ...
        }
    });
    // ⚠️ 여기서 함수 종료! createPaidEvent() 호출되지 않음!
}

// 6. Paid 처리 (결제 성공 시에만)
if (paymentStatus === 'captured') {
    const paidEventResult = await createPaidEvent({...}); // ⚠️ 여기 도달하지 못함!
}
```

### 문제 시나리오

1. 사용자가 주문 생성 → `orders.status = 'pending'`
2. 결제 완료 → `payments` 테이블에 `status = 'captured'` 저장
3. `orders.status = 'processing'`으로 업데이트
4. 사용자가 `order-complete.html`에서 `POST /api/payments/confirm` 호출
5. **주문 상태가 이미 `processing`이므로 `alreadyProcessedStatuses.has('processing')`가 `true`**
6. **`createPaidEvent()` 호출 전에 함수 종료**
7. **결과**: `paid_events` 생성되지 않음 → `processPaidOrder()` 실행되지 않음

---

## 🔧 해결 방법

### 해결책: `alreadyProcessedStatuses` 체크 후에도 `paid_events` 확인 및 생성

`alreadyProcessedStatuses`에 해당하는 경우에도:
1. `paid_events` 존재 여부 확인
2. 없으면 생성
3. `processPaidOrder()` 실행

---

## 📝 수정 코드

```javascript
if (alreadyProcessedStatuses.has(normalizedStatus)) {
    const [existingPaymentRows] = await connection.execute(
        `SELECT status, amount, currency FROM payments
         WHERE order_number = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [orderNumber]
    );

    const existingPaymentStatus = existingPaymentRows.length ? existingPaymentRows[0].status : 'captured';
    const existingCurrency = existingPaymentRows.length && existingPaymentRows[0].currency
        ? existingPaymentRows[0].currency
        : currency;

    // ⚠️ 수정: paid_events 확인 및 생성
    const [existingPaidEvents] = await connection.execute(
        `SELECT event_id FROM paid_events WHERE order_id = ?`,
        [order.order_id]
    );

    if (existingPaidEvents.length === 0 && existingPaymentStatus === 'captured') {
        // paid_events가 없고 결제는 완료된 경우 → 생성 필요
        try {
            const paidEventResult = await createPaidEvent({
                orderId: order.order_id,
                paymentKey: paymentKey,
                amount: serverAmount,
                currency: existingCurrency,
                eventSource: 'redirect',
                rawPayload: null
            });

            paidEventId = paidEventResult.eventId;

            // processPaidOrder() 실행
            await processPaidOrder({
                connection,
                paidEventId: paidEventId,
                orderId: order.order_id,
                paymentKey: paymentKey,
                amount: serverAmount,
                currency: existingCurrency,
                eventSource: 'redirect',
                rawPayload: null
            });
        } catch (err) {
            Logger.error('[payments][confirm] 이미 처리된 주문의 paid_events 생성 실패', {
                order_id: order.order_id,
                error: err.message
            });
            // 에러는 무시 (이미 결제는 완료됨)
        }
    }

    const [cartCountRows] = await connection.execute(
        `SELECT COUNT(*) AS itemCount
         FROM cart_items ci
         INNER JOIN carts c ON ci.cart_id = c.cart_id
         WHERE c.user_id = ?`,
        [userId]
    );

    const cartCleared = (cartCountRows[0].itemCount || 0) === 0;

    await connection.rollback();
    await connection.end();

    return res.json({
        success: true,
        data: {
            order_number: orderNumber,
            amount: serverAmount,
            currency: existingCurrency,
            payment_status: existingPaymentStatus,
            alreadyConfirmed: true,
            cartCleared
        }
    });
}
```

---

## ✅ 수정 후 예상 동작

1. 주문 상태가 `processing`이어도 `paid_events` 확인
2. `paid_events`가 없고 결제가 완료된 경우 → 생성 및 `processPaidOrder()` 실행
3. 재고 배정, 보증서, 인보이스 생성 정상 작동
