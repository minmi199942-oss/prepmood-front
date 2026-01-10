# Shipped/Delivered API 최종 확정 사양서

## ⚠️ 핵심 원칙 (SSOT)

**이 문서는 shipped/delivered API 구현의 단일 진실 원천(SSOT)입니다. 모든 구현은 이 규칙을 따라야 합니다.**

---

## 📋 7가지 정정 포인트 최종 확정 (필수 준수)

### **0) 트랜잭션 위치 문제 — "필수" (표현 강화 + 규칙 명확화)**

#### 핵심 문제

`SELECT ... FOR UPDATE`는 **같은 트랜잭션 안에서 유지되어야** 락이 의미가 있음.

`autocommit` 상태에서 `FOR UPDATE`를 치면, 드라이버/세션 설정에 따라 **문장 종료 시점에 락이 풀려** 동시성 보호가 무력화될 수 있음.

#### 최종 규칙 (확정)

**shipped / delivered 모두 동일하게:**
```
BEGIN → SELECT ... FOR UPDATE → 검증 → UPDATE(들) → COMMIT
실패 시 ROLLBACK
```

#### 권장 구현 템플릿 (확정)

```javascript
await connection.beginTransaction();
try {
    // 1. SELECT ... FOR UPDATE (락 획득)
    const [rows] = await connection.execute(
        `SELECT ... FROM order_item_units ... FOR UPDATE`,
        [...]
    );

    // 2. 검증 (상태/시간/null/주문 일치)
    if (rows.length !== expectedCount) {
        throw new Error('검증 실패: 조회 결과 불일치');
    }

    // 3. UPDATE (락 유지 상태)
    const [update] = await connection.execute(
        `UPDATE ...`,
        [...]
    );

    // 4. COMMIT (락 해제)
    await connection.commit();
} catch (e) {
    // 5. ROLLBACK (락 해제)
    await connection.rollback();
    throw e;
}
```

#### ❌ 잘못된 패턴 (금지)

```javascript
// ❌ autocommit 상태에서 FOR UPDATE (락 무력화)
const [rows] = await connection.execute(
    `SELECT ... FROM order_item_units ... FOR UPDATE`,
    [...]
);
await connection.beginTransaction();  // 이미 락이 풀린 후
// ... UPDATE ...
await connection.commit();
```

---

### **1) buildInClause 중복 정의 — "필수"**

#### 문제

동일 기능이 2군데(인라인/유틸)로 존재하면, **수정이 한쪽만 반영되는 사고**가 생김.

#### 최종 확정

1. **`utils/query-helpers.js`에만 존재**
2. **shipped/delivered는 `require`로만 사용**

#### 추가로 "실수 방지" 잠금

`buildInClause(ids)`는 **입력이 비었으면 throw** (지금 정리대로 유지)

#### 구현 예시

```javascript
// utils/query-helpers.js (유일한 정의)
/**
 * IN 절 플레이스홀더 + 파라미터 배열 생성 (단일 함수로 통일)
 * @param {Array} ids - IN 절에 사용할 ID 배열
 * @returns {Object} { placeholders: string, params: Array }
 */
function buildInClause(ids) {
    if (!ids || ids.length === 0) {
        throw new Error('빈 배열은 IN 절에 사용할 수 없습니다');
    }
    const placeholders = ids.map(() => '?').join(',');
    return { placeholders, params: ids };
}

module.exports = { buildInClause };
```

```javascript
// shipped/delivered API (require로만 사용)
const { buildInClause } = require('../utils/query-helpers');

// shipped API 사용 예시
const targetUnitIds = uniqueSelectedUnitIds;  // 중복 제거 후 사용
const { placeholders, params: targetUnitIdsParams } = buildInClause(targetUnitIds);
const [units] = await connection.execute(
    `SELECT ... WHERE order_item_unit_id IN (${placeholders}) ...`,
    targetUnitIdsParams
);

// delivered API 사용 예시
const targetUnitIds = uniqueUnitIds;  // 중복 제거 후 사용
const { placeholders, params: targetUnitIdsParams } = buildInClause(targetUnitIds);
const [units] = await connection.execute(
    `SELECT ... WHERE order_item_unit_id IN (${placeholders}) ...`,
    targetUnitIdsParams
);
```

---

### **2) delivered에서 orderId 불일치 방어 — "권장" (형태 개선)**

#### 문제

`WHERE ... AND oiu.order_id = ?`로 걸러서 들어오므로 보통 불일치가 안 생기는데, **"디버깅 메시지 품질"**을 위해 추가 검증 필요.

#### 최종 확정 (권장)

`inferredOrderId`는 **"로그/메시지용"으로만** 쓰고,

**실제 업데이트 조건은 항상 입력 `orderId`(요청 파라미터)를 기준으로 유지**

#### 구현 예시

```javascript
// orderId 추출 (검증용)
const inferredOrderId = units[0]?.order_id;

// 검증: 입력 orderId와 조회 결과 일치 확인 (디버깅 메시지 품질 향상)
if (inferredOrderId !== orderId) {
    throw new Error(`orderId 불일치: 입력=${orderId}, 조회=${inferredOrderId}`);
}

// 이후 UPDATE/stock 검증은 orderId(입력값)로 통일
const [updateResult] = await connection.execute(
    `UPDATE order_item_units
     SET unit_status = 'delivered',
         delivered_at = NOW()
     WHERE order_item_unit_id IN (${placeholders})
       AND unit_status = 'shipped'
       AND order_id = ?  -- 입력 orderId 사용
       AND delivered_at IS NULL`,
    [...unitIdsParams, orderId]  // 입력 orderId 사용
);
```

#### 왜 이렇게 고정하냐면

실수로 `inferred`를 기준으로 UPDATE하면 **"요청 파라미터 검증"의 의미가 흐려질 수 있음**.

#### delivered API 전체 구현 예시 (완전한 버전)

```javascript
// 입력 값: req.body에서 받음
const { unitIds, orderId } = req.body;

// 0. 입력 값 검증 및 정규화
// 0-1. unitIds 중복 방어 (5번 규칙)
const uniqueUnitIds = [...new Set(unitIds)];
if (uniqueUnitIds.length !== unitIds.length) {
    const duplicateIds = unitIds.filter((id, index) => unitIds.indexOf(id) !== index);
    const uniqueDuplicates = [...new Set(duplicateIds)];
    
    Logger.error('[DELIVERED] 중복된 unitId 입력', {
        orderId,
        inputCount: unitIds.length,
        uniqueCount: uniqueUnitIds.length,
        duplicateIds: uniqueDuplicates
    });
    
    throw new Error(`중복된 unitId가 포함되어 있습니다: 입력=${unitIds.length}개, 고유=${uniqueUnitIds.length}개`);
}

// 이후 로직에서 "targetUnitIds"로 통일 사용
const targetUnitIds = uniqueUnitIds;
const { placeholders, params: targetUnitIdsParams } = buildInClause(targetUnitIds);
const selectParams = [...targetUnitIdsParams, orderId];

await connection.beginTransaction();
try {
    // 1. order_item_units FOR UPDATE (락 순서 1단계)
    const [units] = await connection.execute(
        `SELECT oiu.order_item_unit_id, oiu.unit_status, oiu.stock_unit_id, oiu.order_id, oiu.delivered_at
         FROM order_item_units oiu
         WHERE oiu.order_item_unit_id IN (${placeholders})
           AND oiu.order_id = ?
         FOR UPDATE`,
        selectParams
    );

    // 2. 검증 (핵심 검증 - 모두 필수)
    // 2-1. 조회 길이 일치 검증
    if (units.length !== targetUnitIds.length) {
        throw new Error(`검증 실패: 요청=${targetUnitIds.length}개, 조회=${units.length}개`);
    }

    // 2-2. order_id 일치 검증 (디버깅 메시지 품질 향상)
    const inferredOrderId = units[0]?.order_id;
    if (inferredOrderId !== orderId) {
        throw new Error(`orderId 불일치: 입력=${orderId}, 조회=${inferredOrderId}`);
    }

    // 2-3. delivered_at 전부 NULL 검증 (이미 delivered된 유닛 포함 방지)
    const alreadyDelivered = units.filter(u => u.delivered_at !== null);
    if (alreadyDelivered.length > 0) {
        throw new Error(`이미 배송완료 처리된 유닛 포함: ${alreadyDelivered.map(u => u.order_item_unit_id).join(', ')}`);
    }

    // 2-4. unit_status가 전부 shipped인지 검증
    const nonShippedUnits = units.filter(u => u.unit_status !== 'shipped');
    if (nonShippedUnits.length > 0) {
        throw new Error(`일부 유닛이 shipped 상태가 아닙니다: ${nonShippedUnits.map(u => u.order_item_unit_id).join(', ')}`);
    }

    // 3. stock_unit_id 추출 및 중복 제거
    const stockUnitIds = units.map(u => u.stock_unit_id).filter(id => id !== null && id !== undefined);
    const uniqueStockUnitIds = [...new Set(stockUnitIds)];
    const targetStockCount = uniqueStockUnitIds.length;

    // 4. order_item_units UPDATE
    const updateParams = [...targetUnitIdsParams, orderId];
    const [updateResult] = await connection.execute(
        `UPDATE order_item_units
         SET unit_status = 'delivered',
             delivered_at = NOW()
         WHERE order_item_unit_id IN (${placeholders})
           AND unit_status = 'shipped'
           AND order_id = ?
           AND delivered_at IS NULL`,
        updateParams
    );

    // 5. affectedRows 검증
    if (updateResult.affectedRows !== targetUnitIds.length) {
        throw new Error(`배송완료 처리 실패: 요청=${targetUnitIds.length}개, 처리=${updateResult.affectedRows}개`);
    }

    // 6. stock_units 엄격 검증 및 업데이트 (락 순서 2단계)
    let stockSyncCount = 0;
    if (targetStockCount > 0) {
        // 6-1. 중복 제거 확인 (안전장치)
        if (uniqueStockUnitIds.length !== stockUnitIds.length) {
            Logger.warn('[DELIVERED] 중복된 stock_unit_id 발견', {
                orderId,
                originalCount: stockUnitIds.length,
                uniqueCount: uniqueStockUnitIds.length
            });
        }

        // 6-2. stock_units FOR UPDATE (락 순서 2단계: order_item_units → stock_units)
        const { placeholders: stockPlaceholders, params: stockParams } = buildInClause(uniqueStockUnitIds);
        const stockSelectParams = [...stockParams, orderId];

        const [stockUnits] = await connection.execute(
            `SELECT stock_unit_id, status, reserved_by_order_id
             FROM stock_units
             WHERE stock_unit_id IN (${stockPlaceholders})
               AND status = 'reserved'
               AND reserved_by_order_id = ?
             FOR UPDATE`,
            stockSelectParams
        );

        // 6-3. 검증: 모든 stock_unit_id가 조건 만족하는지
        if (stockUnits.length !== targetStockCount) {
            const foundIds = stockUnits.map(su => su.stock_unit_id);
            const missingIds = uniqueStockUnitIds.filter(id => !foundIds.includes(id));
            throw new Error(`일부 재고가 reserved 상태가 아니거나 다른 주문에 예약되어 있습니다: ${missingIds.join(', ')}`);
        }

        // 6-4. stock_units UPDATE (sold_at 조건부 업데이트)
        const stockUpdateParams = [...stockParams, orderId];
        const [stockUpdateResult] = await connection.execute(
            `UPDATE stock_units
             SET status = 'sold',
                 sold_at = CASE 
                     WHEN sold_at IS NULL THEN NOW()
                     ELSE sold_at
                 END
             WHERE stock_unit_id IN (${stockPlaceholders})
               AND status = 'reserved'
               AND reserved_by_order_id = ?`,
            stockUpdateParams
        );

        stockSyncCount = stockUpdateResult.affectedRows;

        // 6-5. stockSyncCount 검증
        if (stockUpdateResult.affectedRows !== targetStockCount) {
            throw new Error(`재고 상태 동기화 실패: 요청=${targetStockCount}개, 처리=${stockUpdateResult.affectedRows}개`);
        }
    }

    // 7. 로그 기록
    Logger.log('[DELIVERED] 배송완료 처리 및 재고 동기화', {
        orderId,
        unitCount: targetUnitIds.length,
        stockUnitCount: targetStockCount,
        stockSyncCount: stockSyncCount,
        synchronized: stockSyncCount === targetStockCount
    });

    await connection.commit();
} catch (e) {
    await connection.rollback();
    throw e;
}
```

---

### **3) 락 순서 규칙 문서화 — "권장" (금지 규칙 명확화)**

#### 현재 문서

- **결제 계열(paid)**: `stock_units → orders → warranties` 고정 (이미 문서화됨)
- **물류 계열(shipped/delivered)**: `order_item_units → stock_units` 고정 (신규 규칙)

#### 문제

"두 계열이 같은 row를 동시에 잡지 않게 경계 설계"라는 문장이 **너무 추상적**이어서, 구현자가 읽으면 "그럼 어떻게?"가 남음.

#### 최종 확정 문장 (수정)

1. **결제(paid)는 "재고 배정"을 하면서 `stock_units`를 잠그고, `order_item_units`를 생성하는 흐름**

2. **물류(shipped/delivered)는 "이미 배정된 `order_item_units` 기준"으로 출고/배송완료를 처리하고, 그때 대응되는 `stock_units`를 잠금**

3. **따라서 물류 트랜잭션에서 `orders`/`warranties`까지 같이 잠그는 확장을 금지** (락 범위 확장으로 데드락 가능성 증가)

#### 최종 확정 규칙 (문서에 추가)

**"물류(shipped/delivered) 트랜잭션은 `orders`/`warranties` 락 획득을 하지 않는다 (필요 시 별도 읽기 쿼리로 분리)."**

#### 구현 예시

```javascript
// ✅ 올바른 패턴 (물류 트랜잭션)
await connection.beginTransaction();
try {
    // 1. order_item_units FOR UPDATE (락 순서 1단계)
    const [units] = await connection.execute(
        `SELECT ... FROM order_item_units ... FOR UPDATE`,
        [...]
    );

    // 2. stock_units FOR UPDATE (락 순서 2단계)
    const [stockUnits] = await connection.execute(
        `SELECT ... FROM stock_units ... FOR UPDATE`,
        [...]
    );

    // 3. UPDATE (락 유지 상태)
    await connection.execute(`UPDATE order_item_units ...`, [...]);
    await connection.execute(`UPDATE stock_units ...`, [...]);

    await connection.commit();
} catch (e) {
    await connection.rollback();
    throw e;
}

// ❌ 잘못된 패턴 (락 범위 확장 금지)
await connection.beginTransaction();
try {
    // ❌ orders FOR UPDATE (물류 트랜잭션에서 금지)
    await connection.execute(`SELECT ... FROM orders ... FOR UPDATE`, [...]);
    
    // ❌ warranties FOR UPDATE (물류 트랜잭션에서 금지)
    await connection.execute(`SELECT ... FROM warranties ... FOR UPDATE`, [...]);
    
    // ... 업데이트 ...
    await connection.commit();
} catch (e) {
    await connection.rollback();
    throw e;
}

// ✅ 올바른 패턴 (orders/warranties는 별도 읽기 쿼리로 분리)
// 트랜잭션 밖에서 읽기 전용 조회
const [order] = await connection.execute(
    `SELECT ... FROM orders WHERE order_id = ?`,  // FOR UPDATE 없음
    [orderId]
);
// 검증/로깅 용도로만 사용
```

---

### **4) shipped 기존 송장번호 조회 — "권장" (조회 시점 명확화)**

#### 최종 확정

**먼저 `order_item_units`를 `FOR UPDATE`로 잠근 뒤**

**같은 트랜잭션에서 "기존 shipped 송장번호 목록"을 조회하고 로그**

#### 구현 순서 (고정)

```javascript
// 입력 값: req.body에서 받음
const { selectedUnitIds, carrierCode, trackingNumber, orderId } = req.body;

// 0. 입력 값 검증 및 정규화
// 0-1. selectedUnitIds 중복 방어 (5번 규칙)
const uniqueSelectedUnitIds = [...new Set(selectedUnitIds)];
if (uniqueSelectedUnitIds.length !== selectedUnitIds.length) {
    const duplicateIds = selectedUnitIds.filter((id, index) => selectedUnitIds.indexOf(id) !== index);
    const uniqueDuplicates = [...new Set(duplicateIds)];
    
    Logger.error('[SHIPPED] 중복된 unitId 입력', {
        orderId,
        inputCount: selectedUnitIds.length,
        uniqueCount: uniqueSelectedUnitIds.length,
        duplicateIds: uniqueDuplicates
    });
    
    throw new Error(`중복된 unitId가 포함되어 있습니다: 입력=${selectedUnitIds.length}개, 고유=${uniqueSelectedUnitIds.length}개`);
}

// 0-2. 송장번호 정규화 및 검증
const normalizedTrackingNumber = (trackingNumber ?? '').trim();
if (!normalizedTrackingNumber) {
    throw new Error('송장번호는 필수입니다');
}

// 0-3. 택배사 코드 검증
if (!carrierCode) {
    throw new Error('택배사 코드는 필수입니다');
}

// 이후 로직에서 "targetUnitIds"로 통일 사용
const targetUnitIds = uniqueSelectedUnitIds;
const { placeholders, params: targetUnitIdsParams } = buildInClause(targetUnitIds);

await connection.beginTransaction();
try {
    // 1. order_item_units FOR UPDATE (출고 처리 대상 유닛 잠금)
    const [units] = await connection.execute(
        `SELECT oiu.order_item_unit_id, oiu.unit_status, oiu.order_id, oiu.shipped_at, oiu.tracking_number
         FROM order_item_units oiu
         WHERE oiu.order_item_unit_id IN (${placeholders})
           AND oiu.order_id = ?
         FOR UPDATE`,
        [...targetUnitIdsParams, orderId]
    );

    // 2. 검증 (핵심 검증 - 모두 필수)
    // 2-1. 조회 길이 일치 검증
    if (units.length !== targetUnitIds.length) {
        throw new Error(`검증 실패: 요청=${targetUnitIds.length}개, 조회=${units.length}개`);
    }

    // 2-2. order_id 일치 검증 (디버깅 메시지 품질 향상)
    const inferredOrderId = units[0]?.order_id;
    if (inferredOrderId !== orderId) {
        throw new Error(`orderId 불일치: 입력=${orderId}, 조회=${inferredOrderId}`);
    }

    // 2-3. shipped_at 전부 NULL 검증 (이미 shipped된 유닛 포함 방지)
    const alreadyShipped = units.filter(u => u.shipped_at !== null);
    if (alreadyShipped.length > 0) {
        throw new Error(`이미 출고된 유닛 포함: ${alreadyShipped.map(u => u.order_item_unit_id).join(', ')}`);
    }

    // 2-4. unit_status가 전부 reserved인지 검증
    const nonReservedUnits = units.filter(u => u.unit_status !== 'reserved');
    if (nonReservedUnits.length > 0) {
        throw new Error(`일부 유닛이 reserved 상태가 아닙니다: ${nonReservedUnits.map(u => u.order_item_unit_id).join(', ')}`);
    }

    // 3. 같은 트랜잭션에서 기존 shipped 송장번호 목록 조회 (같은 시점 스냅샷)
    const [existingShippedUnits] = await connection.execute(
        `SELECT tracking_number 
         FROM order_item_units 
         WHERE order_id = ? 
           AND unit_status = 'shipped' 
           AND tracking_number IS NOT NULL
         GROUP BY tracking_number`,
        [orderId]
    );

    const existingTrackingNumbers = existingShippedUnits.map(u => u.tracking_number);

    // 4. UPDATE (락 유지 상태)
    const [updateResult] = await connection.execute(
        `UPDATE order_item_units
         SET unit_status = 'shipped',
             carrier_code = ?,
             tracking_number = ?,
             shipped_at = NOW()
         WHERE order_item_unit_id IN (${placeholders})
           AND unit_status = 'reserved'
           AND order_id = ?
           AND shipped_at IS NULL`,
        [carrierCode, normalizedTrackingNumber, ...targetUnitIdsParams, orderId]
    );

    // 5. affectedRows 검증
    if (updateResult.affectedRows !== targetUnitIds.length) {
        throw new Error(`출고 처리 실패: 요청=${targetUnitIds.length}개, 처리=${updateResult.affectedRows}개`);
    }

    // 6. 로그 기록 (같은 시점 스냅샷으로 묶여서 로그 신뢰도 향상)
    Logger.log('[SHIPPED] 출고 처리 완료', {
        orderId,
        unitCount: targetUnitIds.length,
        carrierCode,
        trackingNumber: normalizedTrackingNumber,
        existingTrackingNumbers,  // 기존 송장번호 목록
        hasMultipleShipments: existingTrackingNumbers.length > 0 && !existingTrackingNumbers.includes(normalizedTrackingNumber)  // 다른 송장번호 여부
    });

    await connection.commit();
} catch (e) {
    await connection.rollback();
    throw e;
}
```

#### 왜 이 순서인가

**"출고 처리 대상 유닛"과 "기존 송장번호"가 같은 시점 스냅샷으로 묶여서 로그 신뢰도가 높아짐.**

---

### **5) unitIds 중복 방어 — "필수"**

#### 최종 확정 (에러로 끊기)

1. **입력 받은 ID 배열은 중복 발견 시 즉시 실패**
2. **실패 메시지에 "입력개수/고유개수" 포함**

#### 추가 보완 (권장)

**"중복된 값 목록"까지 뽑아 로그로 남기면 UI 버그 추적이 빨라짐** (메시지에는 길게 넣지 말고 로그에만)

#### 변수명 통일 규칙 (SSOT 문서 필수)

**입력 변수명:**
- **shipped API**: `selectedUnitIds` (요청 파라미터)
- **delivered API**: `unitIds` (요청 파라미터)

**중복 제거 후 사용 변수명 (통일):**
- **shipped API**: `targetUnitIds` = 중복 제거된 `selectedUnitIds`
- **delivered API**: `targetUnitIds` = 중복 제거된 `unitIds`

**이후 전 구간에서 동일 변수 사용**: `targetUnitIds`로 통일

#### 구현 예시 (shipped API)

```javascript
// 입력 값: req.body에서 받음
const { selectedUnitIds, ... } = req.body;

// 입력 단계에서 중복 제거 및 검증
const uniqueSelectedUnitIds = [...new Set(selectedUnitIds)];

// 정책 A: 에러로 끊기 (더 안전) ✅ 권장
if (uniqueSelectedUnitIds.length !== selectedUnitIds.length) {
    // 중복된 값 목록 추출
    const duplicateIds = selectedUnitIds.filter((id, index) => selectedUnitIds.indexOf(id) !== index);
    const uniqueDuplicates = [...new Set(duplicateIds)];

    // 로그 기록 (UI 버그 추적용)
    Logger.error('[SHIPPED] 중복된 unitId 입력', {
        orderId,
        inputCount: selectedUnitIds.length,
        uniqueCount: uniqueSelectedUnitIds.length,
        duplicateIds: uniqueDuplicates  // 중복된 값 목록
    });

    // 사용자 메시지 (간결하게)
    throw new Error(`중복된 unitId가 포함되어 있습니다: 입력=${selectedUnitIds.length}개, 고유=${uniqueSelectedUnitIds.length}개`);
}

// 이후 로직에서 targetUnitIds로 통일 사용
const targetUnitIds = uniqueSelectedUnitIds;
const { placeholders, params: targetUnitIdsParams } = buildInClause(targetUnitIds);
```

#### 구현 예시 (delivered API)

```javascript
// 입력 값: req.body에서 받음
const { unitIds, ... } = req.body;

// 입력 단계에서 중복 제거 및 검증
const uniqueUnitIds = [...new Set(unitIds)];

// 정책 A: 에러로 끊기 (더 안전) ✅ 권장
if (uniqueUnitIds.length !== unitIds.length) {
    // 중복된 값 목록 추출
    const duplicateIds = unitIds.filter((id, index) => unitIds.indexOf(id) !== index);
    const uniqueDuplicates = [...new Set(duplicateIds)];

    // 로그 기록 (UI 버그 추적용)
    Logger.error('[DELIVERED] 중복된 unitId 입력', {
        orderId,
        inputCount: unitIds.length,
        uniqueCount: uniqueUnitIds.length,
        duplicateIds: uniqueDuplicates  // 중복된 값 목록
    });

    // 사용자 메시지 (간결하게)
    throw new Error(`중복된 unitId가 포함되어 있습니다: 입력=${unitIds.length}개, 고유=${uniqueUnitIds.length}개`);
}

// 이후 로직에서 targetUnitIds로 통일 사용
const targetUnitIds = uniqueUnitIds;
const { placeholders, params: targetUnitIdsParams } = buildInClause(targetUnitIds);
```

---

### **6) Logger.log 송장번호 정책 — "권장 문서화"**

#### 최종 확정 (추천 문장)

1. **MVP: 송장번호 원문을 로그에 남길 수 있음**

2. **단, 로그는 외부 공유 금지 (운영자/개발자 제한)**

3. **CS 공유용 로그가 필요하면 "뒤 4자리 마스킹" 포맷을 별도 제공**

#### 구현 예시

```javascript
/**
 * 송장번호 로깅 정책
 * 
 * MVP 정책:
 * - 로그에 송장번호 원문 저장 (운영자/개발자 접근 제한)
 * - 외부 공유 금지
 * 
 * 향후 확장 (CS 공유 필요 시):
 * - "뒤 4자리 마스킹" 포맷 별도 제공
 * - 예: "1234567890" → "******7890"
 */
function maskTrackingNumber(trackingNumber, maskLast = 4) {
    if (!trackingNumber || trackingNumber.length <= maskLast) {
        return trackingNumber;
    }
    const visible = trackingNumber.slice(-maskLast);
    const masked = '*'.repeat(trackingNumber.length - maskLast);
    return masked + visible;
}

// 로그 기록 (원문 저장)
Logger.log('[SHIPPED] 출고 처리 완료', {
    orderId,
    trackingNumber: normalizedTrackingNumber,  // 원문 저장
    // ...
});

// CS 공유용 로그 (뒤 4자리 마스킹)
Logger.log('[SHIPPED] 출고 처리 완료 (CS 공유용)', {
    orderId,
    trackingNumber: maskTrackingNumber(normalizedTrackingNumber, 4),  // 마스킹
    // ...
});
```

---

### **7) 인덱스 — "이미 적절" (표기 개선 권장)**

#### 최종 확정 인덱스 세트

```sql
-- 주문별 출고 대상 빠르게 뽑음
CREATE INDEX idx_oiu_orderid_unitstatus ON order_item_units(order_id, unit_status);

-- 송장 검색
CREATE INDEX idx_oiu_tracking_number ON order_item_units(tracking_number);

-- 특정 주문 예약 재고 조회
CREATE INDEX idx_stock_reserved_order_status ON stock_units(reserved_by_order_id, status);
```

#### 인덱스 이름 개선 (권장)

- `idx_order_status` → `idx_oiu_orderid_unitstatus` (테이블명 명시로 명확도 향상)

**주의**: delivered UPDATE는 `stock_unit_id` PK가 이미 선택도를 다 먹으므로 인덱스 영향이 크지 않음. 인덱스 체감은 **조회/리스트**에서 큼.

---

## 🎯 핵심 3가지 최종 확정 (필수 준수)

### **1. 트랜잭션 위치 수정 (필수)**

**shipped/delivered:**
```
BEGIN → SELECT ... FOR UPDATE → 검증 → UPDATE → COMMIT
실패 시 ROLLBACK
```

### **2. buildInClause 단일화 (필수)**

- **유틸 1곳에만 정의** (`utils/query-helpers.js`)
- **shipped/delivered는 `require`로만 사용**

### **3. unitIds 중복 방어 (필수)**

**입력 단계에서 중복 발견 시 즉시 실패 (정책 A: 에러로 끊기)**

---

## 📝 최종 검토 결론

### ✅ 정확도 평가

**정확도: 99%**

모든 지적이 정확하며, 특히 **0번(트랜잭션 위치)**은 **치명적 문제**로 즉시 수정 필요.

### ✅ 핵심 잠금 평가

**운영에서 체감이 큰 필수 잠금:**
- **0번 (트랜잭션 위치)**: 동시성 보호 핵심
- **5번 (중복 방어)**: UI 버그 추적 및 데이터 정합성 보장

**권장 잠금 (구현 시 추가 권장):**
- 2번 (orderId 불일치 방어): 디버깅 메시지 품질 향상
- 3번 (락 순서 규칙): 데드락 방지
- 4번 (기존 송장번호 조회): 로그 신뢰도 향상
- 6번 (송장번호 정책): 보안/프라이버시 보장

### ✅ 최종 평가

**이대로 진행하면 구현 안전성과 유지보수성이 크게 향상됩니다.**

특히 **트랜잭션 위치 수정**과 **락 순서 규칙 문서화**는 운영 안정성의 핵심입니다.

---

## 🔗 관련 문서

- `FINAL_EXECUTION_SPEC_REVIEW.md`: 시스템 전체 SSOT 규칙
- `SYSTEM_FLOW_DETAILED.md`: 전체 시스템 흐름 및 락 순서 규칙
- `ADMIN_PAGE_OPERATIONAL_REVIEW.md`: 관리자 페이지 운영 리뷰

---

**문서 버전**: 1.0 (최종 확정본)  
**최종 검토일**: 2026-01-10  
**검토자**: GPT (사용자 승인)
