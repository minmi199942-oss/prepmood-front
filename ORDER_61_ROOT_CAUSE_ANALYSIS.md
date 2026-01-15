# 주문 61 근본 원인 분석

## 문제 상황
- 주문 61: `status = 'processing'`, `paid_at = NULL`
- `paid_events`: 없음
- `order_item_units`: 없음
- `warranties`: 없음
- `invoices`: 없음

## 핵심 발견

### 1. 주문 상태 업데이트는 성공했지만 paid_events 생성 실패

코드 흐름:
```javascript
// 428-431: 주문 상태 업데이트 (트랜잭션 내)
await connection.execute(
    'UPDATE orders SET status = ? WHERE order_number = ?',
    [orderStatus, orderNumber]  // orderStatus = 'processing'
);

// 443-475: paid_events 생성 및 processPaidOrder() 호출
if (paymentStatus === 'captured') {
    try {
        const paidEventResult = await createPaidEvent({...});
        const paidResult = await processPaidOrder({...});
        // ...
    } catch (err) {
        // ⚠️ 에러 발생 시 로깅만 하고 계속 진행
        Logger.error('[payments][confirm] Paid 처리 실패', {...});
    }
}

// 520-530: 트랜잭션 커밋
await connection.commit();
```

### 2. 문제점

**시나리오 A: createPaidEvent() 실패**
- `createPaidEvent()`는 별도 커넥션(autocommit)으로 실행
- 실패 시 에러가 발생하지만, 메인 트랜잭션은 계속 진행
- 주문 상태는 이미 `processing`으로 업데이트됨
- `paid_events`는 생성되지 않음

**시나리오 B: alreadyProcessedStatuses 블록 진입**
- 주문이 이미 `processing` 상태였을 경우
- 140번 라인에서 `alreadyProcessedStatuses.has(normalizedStatus)`가 true
- 161번 라인 조건: `existingPaidEvents.length === 0 && existingPaymentStatus === 'captured'`
- 만약 `existingPaymentStatus !== 'captured'`이면 `paid_events` 생성 로직이 실행되지 않음

**시나리오 C: payments 테이블에 결제 정보 없음**
- `alreadyProcessedStatuses` 블록에서 `existingPaymentRows`가 비어있을 경우
- 149번 라인: `existingPaymentStatus = existingPaymentRows.length ? existingPaymentRows[0].status : 'captured'`
- 기본값이 `'captured'`이지만, 실제로는 `payments` 테이블에 레코드가 없을 수 있음

## 확인 필요 사항

### 1. payments 테이블 확인
```sql
SELECT payment_id, order_number, gateway, payment_key, status, amount, currency, created_at
FROM payments
WHERE order_number = 'ORD-20260115-079226-J3ASVO'
ORDER BY created_at DESC;
```

### 2. 백엔드 로그 확인
```bash
pm2 logs prepmood-backend --lines 500 | grep -E "order.*61|ORD-20260115-079226-J3ASVO|paid_events|PAID_PROCESSOR" | tail -100
```

### 3. paid_event_processing 확인
```sql
SELECT event_id, status, last_error, processed_at, retry_count, created_at
FROM paid_event_processing
WHERE event_id IN (
    SELECT event_id FROM paid_events WHERE order_id = 61
);
```

## 예상 원인

**가장 가능성 높은 시나리오**:
1. 주문이 생성되고 `POST /api/payments/confirm`이 호출됨
2. `payments` 테이블에 결제 정보가 INSERT됨
3. 주문 상태가 `processing`으로 업데이트됨
4. `createPaidEvent()` 호출 시 에러 발생 (예: UNIQUE 제약 위반, DB 연결 오류 등)
5. 에러가 catch되어 로깅만 되고, 트랜잭션은 커밋됨
6. 결과: 주문은 `processing`이지만 `paid_events`는 없음

## 해결 방안

### 즉시 확인
1. `payments` 테이블에서 주문 61의 결제 정보 확인
2. 백엔드 로그에서 에러 메시지 확인
3. `paid_event_processing` 테이블 확인

### 코드 수정 필요 사항
1. `createPaidEvent()` 실패 시 더 명확한 에러 처리
2. `alreadyProcessedStatuses` 블록에서 `payments` 테이블 확인 로직 개선
3. 주문 상태와 `paid_events` 생성의 원자성 보장
