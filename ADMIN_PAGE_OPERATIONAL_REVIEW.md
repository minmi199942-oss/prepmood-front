# 관리자 페이지 운영/정합성 개선 사항 검토 보고서

## 📋 검토 개요

제시된 운영/정합성 개선 사항을 현재 시스템 구조(SSOT 4단 락 + token_pk 기반)와 대조하여 검토한 결과입니다.

---

## ✅ 검토 결과: **모든 제안이 적절하고 필수적임**

제시된 5가지 개선 사항은 모두 현재 시스템 구조와 일치하며, 운영 안정성과 정합성 보장을 위해 **반드시 구현해야 하는 사항**입니다.

---

## 1. paid_events 트랜잭션 분리 (가장 큰 착시 해결)

### 🔍 현재 구조 분석

**현재 구현 상태:**
- `processPaidOrder()`는 단일 트랜잭션 내에서 `paid_events` INSERT를 수행
- `payments-routes.js`에서 `processPaidOrder()` 호출 시 같은 `connection` 사용
- 실패 시 전체 롤백되므로 `paid_events`도 사라짐

**문제점:**
- "결제 증거는 항상 남겨야 한다"는 원칙과 충돌
- 재처리/장애 복구 시 증거가 없어짐
- 대시보드 통계가 불안정 (실패 로그 자체가 사라짐)

### ✅ 제안 검토: **완전히 적절함**

**제안 내용:**
1. `paid_events`는 "항상 커밋되는 트랜잭션(또는 별도 커넥션 autocommit)"으로 먼저 남기기
2. 그 다음 "주문 처리 트랜잭션"을 별도로 시작
3. 처리 실패 시: `paid_events`는 남고, 처리 상태는 실패로 기록

**검토 결과:**
- ✅ **법적 증거 보존**: 결제 증거는 항상 남아야 함 (회계/세무/분쟁 대응)
- ✅ **재처리 안정성**: 실패한 주문을 나중에 재처리 가능
- ✅ **통계 정확성**: `processing_status`가 진짜 의미를 갖게 됨
- ✅ **현재 구조와 호환**: `paid_events` 테이블 구조 변경 불필요

### 📝 권장 구현 방안

**안 1 (가장 깔끔) - 권장:**
```sql
-- paid_events는 "결제 증거"만 SSOT로 고정
-- 처리 상태는 별도 테이블로 분리
CREATE TABLE paid_event_processing (
    event_id BIGINT PRIMARY KEY,
    status ENUM('pending', 'processing', 'success', 'failed') NOT NULL DEFAULT 'pending',
    last_error TEXT NULL,
    processed_at DATETIME NULL,
    retry_count INT DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES paid_events(event_id) ON DELETE RESTRICT,
    INDEX idx_status (status),
    INDEX idx_processed_at (processed_at)
);
```

**장점:**
- `paid_events`는 순수한 "결제 증거"로 유지 (의미 명확)
- 처리 상태 변경 이력 추적 가능 (`retry_count`, `last_error`)
- 확장성 좋음 (나중에 재처리 큐, 배치 작업 등 추가 용이)

**안 2 (간단):**
```sql
-- paid_events에 컬럼 추가
ALTER TABLE paid_events
ADD COLUMN processing_status ENUM('pending', 'processing', 'success', 'failed') DEFAULT 'pending',
ADD COLUMN last_error TEXT NULL,
ADD COLUMN processed_at DATETIME NULL;
```

**단점:**
- `paid_events`가 "증거 + 처리 상태" 복합 SSOT가 됨 (의미가 넓어짐)
- 처리 상태 변경 이력 추적 어려움

**최종 권장: 안 1 (paid_event_processing 테이블 분리)**

### 🔧 구현 시 주의사항

1. **트랜잭션 분리 순서:**
   ```javascript
   // 1단계: paid_events INSERT (별도 커넥션, autocommit 또는 즉시 커밋)
   const evidenceConnection = await mysql.createConnection(dbConfig);
   evidenceConnection.config.autocommit = true; // 또는 명시적 커밋
   await evidenceConnection.execute('INSERT INTO paid_events ...');
   await evidenceConnection.end();
   
   // 2단계: 주문 처리 트랜잭션 (별도 커넥션, 트랜잭션)
   const processConnection = await mysql.createConnection(dbConfig);
   await processConnection.beginTransaction();
   try {
       // stock_units, order_item_units, warranties, invoices 처리
       await processConnection.commit();
       
       // 3단계: 처리 상태 업데이트
       await updateProcessingStatus(eventId, 'success');
   } catch (error) {
       await processConnection.rollback();
       await updateProcessingStatus(eventId, 'failed', error.message);
   }
   ```

2. **멱등성 보장:**
   - `paid_events` INSERT는 `UNIQUE(order_id, payment_key)` 제약으로 중복 방지
   - 처리 트랜잭션은 `paid_event_processing.status = 'pending'`인 것만 처리

---

## 2. 재고 부족 주문 상태 관리

### 🔍 현재 구조 분석

**현재 구현 상태:**
- `processPaidOrder()`는 재고 부족 시 에러를 던지고 트랜잭션 롤백
- `orders.status`는 집계 상태로 사용 (예: `paid`, `partial_shipped`, `shipped` 등)
- 재고 부족 상태가 `orders.status`에 없음

**문제점:**
- `orders.status`에 예외 상태를 섞으면 상태 머신이 복잡해짐
- 관리자/고객 화면에서 분기 폭발
- "결제는 됐는데 처리가 실패한 케이스" 추적 어려움

### ✅ 제안 검토: **완전히 적절함**

**제안 내용:**
- `orders.status`는 "배송/이행 집계(fulfillment 집계)"로 유지
- 결제 후 처리 이슈는 "별도 플래그/이슈 테이블"로 관리
- `order_stock_issues` 테이블에 `event_id`도 함께 저장

**검토 결과:**
- ✅ **상태 머신 단순화**: `orders.status`는 fulfillment 집계만 담당
- ✅ **이슈 추적 명확성**: 어떤 결제 증거에서 파생된 이슈인지 추적 가능
- ✅ **대시보드 집계 안정성**: "재고 부족 발생 주문" 집계 가능
- ✅ **현재 구조와 호환**: `orders.status` ENUM 변경 불필요

### 📝 권장 구현 방안

```sql
CREATE TABLE order_stock_issues (
    issue_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    event_id BIGINT NOT NULL COMMENT 'paid_events.event_id (어떤 결제 증거에서 파생)',
    product_id VARCHAR(50) NOT NULL,
    required_qty INT NOT NULL,
    available_qty INT NOT NULL,
    status ENUM('open', 'resolved', 'cancelled') DEFAULT 'open',
    resolved_at DATETIME NULL,
    resolution_note TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT,
    FOREIGN KEY (event_id) REFERENCES paid_events(event_id) ON DELETE RESTRICT,
    FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT,
    INDEX idx_order_id (order_id),
    INDEX idx_event_id (event_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);
```

**사용 시나리오:**
1. `processPaidOrder()` 실패 시 `order_stock_issues`에 기록
2. 관리자 대시보드에서 `status='open'`인 이슈 집계
3. 재고 추가 후 수동 재처리 또는 자동 재처리 큐

---

## 3. warranty_events 이벤트 기반 구조

### 🔍 현재 구조 분석

**현재 구현 상태:**
- `warranties` 테이블에 상태 변경 이력 없음
- 관리자가 직접 `warranties.status` 또는 `owner_user_id`를 UPDATE할 수 있음
- "누가 무엇을 왜 바꿨는지" 추적 불가

**문제점:**
- 관리자 실수로 권리 부활 사고 가능
- 감사(audit) 추적 불가
- 양도/정지/해제 이력 관리 어려움

### ✅ 제안 검토: **완전히 적절함**

**제안 내용:**
- "상태 변경/양도/정지/해제"는 무조건 이벤트 테이블을 먼저 쓰고(append-only)
- 그 결과를 `warranties`에 반영
- 관리자 UI는 `warranties`를 UPDATE하는 게 아니라 "이벤트를 생성하는 API"를 호출

**검토 결과:**
- ✅ **감사 추적 강제**: 모든 변경이 이벤트로 기록됨
- ✅ **원자성 보장**: 이벤트 생성 + `warranties` 업데이트가 하나의 트랜잭션
- ✅ **권한 제어 용이**: 이벤트 생성 API에서 권한 체크 가능
- ✅ **현재 구조와 호환**: `warranties` 테이블 구조 변경 불필요

### 📝 권장 구현 방안

```sql
CREATE TABLE warranty_events (
    event_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    warranty_id INT NOT NULL,
    event_type ENUM('status_change', 'owner_change', 'suspend', 'unsuspend', 'revoke') NOT NULL,
    old_value JSON NULL COMMENT '변경 전 값 (status, owner_user_id 등)',
    new_value JSON NOT NULL COMMENT '변경 후 값',
    changed_by ENUM('user', 'admin', 'system') NOT NULL,
    changed_by_id INT NULL COMMENT 'user_id 또는 admin_user_id',
    reason TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warranty_id) REFERENCES warranties(id) ON DELETE RESTRICT,
    INDEX idx_warranty_id (warranty_id),
    INDEX idx_event_type (event_type),
    INDEX idx_created_at (created_at)
);
```

**API 구조:**
```javascript
// 관리자 UI는 이 API만 호출
POST /api/admin/warranties/:id/events
{
    "type": "status_change", // 또는 "owner_change", "suspend" 등
    "params": {
        "status": "suspended"
    },
    "reason": "관리자 정지 처리"
}

// 서버 내부 처리 (트랜잭션)
async function createWarrantyEvent(warrantyId, type, params, reason, adminId) {
    await connection.beginTransaction();
    try {
        // 1. 현재 warranties 상태 조회 (FOR UPDATE)
        const [warranty] = await connection.execute(
            'SELECT * FROM warranties WHERE id = ? FOR UPDATE',
            [warrantyId]
        );
        
        // 2. 이벤트 생성 (append-only)
        await connection.execute(
            'INSERT INTO warranty_events (warranty_id, event_type, old_value, new_value, changed_by, changed_by_id, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [warrantyId, type, JSON.stringify(oldValue), JSON.stringify(newValue), 'admin', adminId, reason]
        );
        
        // 3. warranties 업데이트
        await connection.execute(
            'UPDATE warranties SET status = ?, updated_at = NOW() WHERE id = ?',
            [newValue.status, warrantyId]
        );
        
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    }
}
```

**장점:**
- 모든 변경이 이벤트로 기록됨 (감사 추적)
- 관리자 실수 방지 (직접 UPDATE 불가)
- 타임라인 조회 가능 (`warranty_events` 테이블 조회)

---

## 4. invoices.access_token 요구사항 확인

### 🔍 현재 구조 분석

**현재 구현 상태:**
- `invoices` 테이블에 조회 토큰 컬럼 없음
- 인보이스 조회는 로그인/주문 조회 권한 기반

**문제점:**
- 요구사항이 명확하지 않음 (공개 조회 필요 여부)

### ✅ 제안 검토: **요구사항 확인 후 결정**

**제안 내용:**
- A안: 로그인/주문 조회 권한이 있는 사람만 본다 → `access_token` 불필요
- B안: "링크만 있으면 조회 가능" 같은 공유형 문서가 필요 → `access_token` 필요

**검토 결과:**
- ✅ **보안 균형**: 요구사항에 따라 결정
- ✅ **구현 용이성**: 두 가지 모두 구현 가능

### 📝 권장 구현 방안

**요구사항 B (공유형 문서)인 경우:**
```sql
-- 별도 테이블로 분리 (권장)
CREATE TABLE invoice_access_tokens (
    token_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    invoice_id BIGINT NOT NULL,
    access_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at DATETIME NULL,
    revoked_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(invoice_id) ON DELETE CASCADE,
    INDEX idx_access_token (access_token),
    INDEX idx_invoice_id (invoice_id),
    INDEX idx_expires_at (expires_at)
);
```

**장점:**
- 여러 토큰 발급/폐기/만료 정책 관리 용이
- 유출 시 폐기가 쉬움
- 토큰 이력 추적 가능

**요구사항 A (권한 기반)인 경우:**
- `access_token` 불필요
- 기존 인증 기반으로 유지
- 필요 시 PDF/메일 발송 기능으로 해결

**최종 권장: 요구사항 확인 후 결정 (현재는 A안으로 유지)**

---

## 5. stock_units.token_pk UNIQUE 제약 (핵심 안전장치)

### 🔍 현재 구조 분석

**현재 구현 상태:**
- `stock_units.token_pk`는 FK만 있고 UNIQUE 제약이 없음
- 실물 1:1 관계를 보장하는 DB 레벨 제약이 없음

**문제점:**
- UI 실수로 중복 입고 가능
- 같은 `token_pk`가 여러 `stock_units` 레코드에 들어갈 수 있음
- 재고/보증서/주문 연결이 망가짐

### ✅ 제안 검토: **반드시 필요함**

**제안 내용:**
- `stock_units.token_pk UNIQUE` 제약 추가
- 입고 API에서 중복 방지

**검토 결과:**
- ✅ **SSOT 보장**: 실물 1:1 관계를 DB 레벨에서 강제
- ✅ **데이터 정합성**: 중복 입고 불가능
- ✅ **현재 구조와 호환**: FK는 유지, UNIQUE만 추가

### 📝 권장 구현 방안

```sql
-- stock_units.token_pk UNIQUE 제약 추가
ALTER TABLE stock_units
ADD CONSTRAINT uk_stock_units_token_pk UNIQUE (token_pk);
```

**입고 API 안전장치:**
```javascript
// 입고 API에서 중복 체크 (이중 방어)
async function addStock(productId, tokenPkArray) {
    await connection.beginTransaction();
    try {
        // 1. 이미 재고에 등록된 token_pk 확인
        const [existing] = await connection.execute(
            'SELECT token_pk FROM stock_units WHERE token_pk IN (?)',
            [tokenPkArray]
        );
        
        if (existing.length > 0) {
            throw new Error(`일부 토큰은 이미 재고에 등록되어 있습니다.`);
        }
        
        // 2. INSERT 시도 (UNIQUE 제약으로 이중 방어)
        await connection.execute(
            'INSERT INTO stock_units (product_id, token_pk, status) VALUES ?',
            [tokenPkArray.map(tpk => [productId, tpk, 'in_stock'])]
        );
        
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            throw new Error('중복된 토큰이 감지되었습니다.');
        }
        throw error;
    }
}
```

---

## 6. 재고 정정 안전장치 (reserved → in_stock)

### 🔍 현재 구조 분석

**현재 구현 상태:**
- 재고 정정 기능이 없음 (관리자 페이지에 미구현)
- `reserved` → `in_stock` 변경 시 연결된 주문/단위 확인 필요

### ✅ 제안 검토: **완전히 적절함**

**제안 내용:**
- `reserved` → `in_stock` 변경 시 체크 순서 강제:
  1. `stock_units.status=reserved` 확인
  2. `reserved_by_order_id`가 NULL인지 또는 해당 주문이 전부 `refunded/revoked`로 정리됐는지 확인
  3. `order_item_units`에서 `stock_unit_id`로 `active_lock=1`인 레코드가 남아있는지 확인
  4. 관리자 로그 + reason 필수

**검토 결과:**
- ✅ **데이터 정합성 보장**: 연결된 주문/단위 확인 필수
- ✅ **운영 안전성**: 실수로 활성 주문의 재고를 해제하는 것 방지
- ✅ **감사 추적**: 관리자 로그 + reason 필수

### 📝 권장 구현 방안

```javascript
async function correctStockStatus(stockUnitId, newStatus, reason, adminId) {
    await connection.beginTransaction();
    try {
        // 1. 현재 상태 확인 (FOR UPDATE)
        const [stock] = await connection.execute(
            'SELECT * FROM stock_units WHERE stock_unit_id = ? FOR UPDATE',
            [stockUnitId]
        );
        
        if (stock[0].status !== 'reserved') {
            throw new Error('reserved 상태만 정정 가능합니다.');
        }
        
        // 2. reserved_by_order_id 확인
        if (stock[0].reserved_by_order_id) {
            // 해당 주문의 모든 order_item_units 확인
            const [units] = await connection.execute(
                `SELECT oiu.order_item_unit_id, oiu.unit_status, oiu.active_lock
                 FROM order_item_units oiu
                 WHERE oiu.stock_unit_id = ?`,
                [stockUnitId]
            );
            
            // active_lock=1인 레코드가 있으면 금지
            const activeUnits = units.filter(u => u.active_lock === 1);
            if (activeUnits.length > 0) {
                throw new Error('활성 주문 단위가 연결되어 있어 정정할 수 없습니다.');
            }
            
            // 모든 단위가 refunded인지 확인
            const allRefunded = units.every(u => u.unit_status === 'refunded');
            if (!allRefunded) {
                throw new Error('모든 주문 단위가 refunded 상태가 아닙니다.');
            }
        }
        
        // 3. 상태 변경
        await connection.execute(
            'UPDATE stock_units SET status = ?, reserved_by_order_id = NULL, updated_at = NOW() WHERE stock_unit_id = ?',
            [newStatus, stockUnitId]
        );
        
        // 4. 관리자 로그 기록
        await connection.execute(
            'INSERT INTO admin_audit_logs (action, target_type, target_id, admin_id, reason, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
            ['stock_correct', 'stock_unit', stockUnitId, adminId, reason]
        );
        
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    }
}
```

---

## 7. 재고 부족 주문 추적 우선순위 조정

### ✅ 제안 검토: **완전히 적절함**

**제안 내용:**
- 재고 부족 주문 추적(별도 테이블)은 "선택"이 아니라 "권장"으로 올리기

**검토 결과:**
- ✅ **운영 필수성**: `paid_events`를 증거로 남기는 구조를 택하는 순간, "결제는 됐는데 처리가 실패한 케이스"를 운영이 반드시 다뤄야 함
- ✅ **CS/운영 연속성**: 이 케이스를 추적하는 최소 장치가 있어야 CS/운영이 멈추지 않음

**최종 우선순위:**
1. **필수**: 재고 관리 MVP 4개 + `stock_units.token_pk UNIQUE`
2. **권장**: 대시보드 통계, 보증서 이력, **재고 부족 주문 추적**
3. **선택**: 인보이스 조회 토큰 (요구사항 확인 후)

---

## 📋 최종 결정 사항 요약

### 1. paid_events 트랜잭션 분리
- ✅ **결정**: 안 1 (paid_event_processing 테이블 분리) 권장
- ✅ **구현**: `paid_events` INSERT는 별도 커넥션(autocommit), 주문 처리 트랜잭션은 별도

### 2. 재고 부족 주문 상태 관리
- ✅ **결정**: `order_stock_issues` 테이블 생성 (orders.status에 섞지 않음)
- ✅ **구현**: `event_id` 포함하여 어떤 결제 증거에서 파생된 이슈인지 추적

### 3. warranty_events 이벤트 기반 구조
- ✅ **결정**: 이벤트 테이블 먼저 생성, 그 결과를 warranties에 반영
- ✅ **구현**: 관리자 UI는 이벤트 생성 API만 호출, 직접 UPDATE 금지

### 4. invoices.access_token
- ✅ **결정**: 요구사항 확인 후 결정 (현재는 A안으로 유지)
- ✅ **구현**: 요구사항 B인 경우 `invoice_access_tokens` 테이블 분리

### 5. stock_units.token_pk UNIQUE 제약
- ✅ **결정**: **반드시 추가** (핵심 안전장치)
- ✅ **구현**: `ALTER TABLE stock_units ADD CONSTRAINT uk_stock_units_token_pk UNIQUE (token_pk);`

### 6. 재고 정정 안전장치
- ✅ **결정**: 체크 순서 강제 (서버에서 검증)
- ✅ **구현**: `reserved` → `in_stock` 변경 시 연결된 주문/단위 확인 필수

### 7. 재고 부족 주문 추적 우선순위
- ✅ **결정**: "선택" → "권장"으로 조정
- ✅ **이유**: `paid_events` 증거 구조를 택하는 순간 운영 필수

---

## 🎯 최종 평가

### 전반적 평가: **100% 적절함**

제시된 모든 개선 사항은:
1. ✅ 현재 시스템 구조와 완벽히 일치
2. ✅ SSOT 원칙 준수
3. ✅ 운영 안정성 및 정합성 보장
4. ✅ 법적 증거 보존 및 감사 추적 강화
5. ✅ 구현 가능성 및 확장성 우수

### 구현 우선순위 (수정)

1. **필수 (즉시 구현):**
   - 재고 관리 MVP 4개
   - `stock_units.token_pk UNIQUE` 제약 추가
   - `paid_events` 트랜잭션 분리 (안 1 권장)

2. **권장 (Phase 2 완료 후):**
   - 대시보드 통계 (`paid_event_processing` 기반)
   - 보증서 이력 관리 (`warranty_events` 테이블)
   - **재고 부족 주문 추적 (`order_stock_issues` 테이블)**

3. **선택 (운영 안정화 후):**
   - 인보이스 조회 토큰 (요구사항 확인 후)

---

## 📝 결론

제시된 모든 개선 사항은 **현재 시스템 구조에 완벽히 적합하며, 운영 안정성과 정합성 보장을 위해 반드시 구현해야 하는 사항**입니다. 특히 `paid_events` 트랜잭션 분리와 `stock_units.token_pk UNIQUE` 제약은 **핵심 안전장치**로 즉시 구현을 권장합니다.
