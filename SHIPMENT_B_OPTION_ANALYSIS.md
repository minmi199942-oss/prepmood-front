# Shipment B안 (운영형) vs 현재 시스템 상세 비교 분석

## 📋 Shipment B안 핵심 철학

**한 줄 요약**: 배송 이력은 모두 보존하되, "현재 유효한 송장"은 항상 1개만 존재하도록 강제한다.

**핵심 원칙**:
- "과거를 지우지 않는다" (이력 보존)
- "현재 상태만 명확히 한다" (`current_shipment_id`)
- "교체·재발송은 합법적인 전이로만 허용한다" (void + 신규 생성)

---

## 🔍 현재 시스템 배송 관리 상태

### 확인 결과
```sql
-- ❌ 현재 시스템에 shipments/shipment_units 테이블 없음
-- orders 테이블에 shipping_* 컬럼만 있음
-- 배송 상태는 orders.status로만 관리
```

**현재 구조 확인**:
```sql
-- backend/add_shipping_columns.sql 확인
ALTER TABLE orders
ADD COLUMN shipping_first_name varchar(100),
ADD COLUMN shipping_last_name varchar(100),
ADD COLUMN shipping_email varchar(255),
ADD COLUMN shipping_phone varchar(20),
ADD COLUMN shipping_address text,
ADD COLUMN shipping_city varchar(100),
ADD COLUMN shipping_postal_code varchar(20),
ADD COLUMN shipping_country varchar(50),
ADD COLUMN shipping_method varchar(50) DEFAULT 'standard',
ADD COLUMN shipping_cost decimal(10,2) DEFAULT 0.00,
ADD COLUMN estimated_delivery date;
```

**현재 배송 관리 한계**:
- ❌ 송장번호/택배사 정보 저장 테이블 없음
- ❌ 부분배송 지원 없음
- ❌ 재발송/송장 교체 기능 없음
- ❌ 배송 이력 추적 불가능
- ⚠️ `orders.status`로만 배송 상태 관리 (`shipping`, `delivered`)

---

## 🚢 Shipment B안 데이터 모델 검증

### 1. shipments 테이블 (B안)

#### 제시된 구조
```sql
CREATE TABLE shipments (
  shipment_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT NOT NULL,
  carrier_code VARCHAR(20) NOT NULL,
  tracking_number VARCHAR(50) NOT NULL,
  shipped_at DATETIME NOT NULL,
  created_by_admin_id BIGINT NOT NULL,
  
  -- B안 핵심
  voided_at DATETIME NULL,
  void_reason VARCHAR(255) NULL,
  
  UNIQUE(carrier_code, tracking_number),
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT,
  INDEX idx_order_id (order_id),
  INDEX idx_voided (voided_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 검증 결과
- ✅ **구조적 타당성**: 이력 보존 + 무효화 처리
- ✅ **운영 현실 반영**: 재발송/송장 교체 지원
- ✅ **데이터 무결성**: `UNIQUE(carrier_code, tracking_number)`로 중복 방지
- ✅ **현재 시스템과 호환**: 신규 테이블이므로 충돌 없음

#### 잠재적 문제점 및 해결

**문제 1: voided_at NULL 허용**
- **시나리오**: `voided_at IS NULL`인 shipment만 "유효" 후보
- **해결**: 정상 (B안의 핵심 설계)

**문제 2: UNIQUE(carrier_code, tracking_number)와 voided 충돌**
- **시나리오**: 같은 송장번호로 재발송 시 UNIQUE 위반
- **해결**: 정책 확정 필요
  - 옵션 A: `voided_at IS NOT NULL`인 경우 UNIQUE 제외 (MySQL 부분 UNIQUE 미지원)
  - 옵션 B: `voided_at`을 포함한 복합 UNIQUE (권장)
  - 옵션 C: `voided_at IS NULL`인 경우만 UNIQUE (애플리케이션 레벨 검증)

**권장**: 옵션 C (애플리케이션 레벨 검증)
```sql
-- UNIQUE는 그대로 유지
UNIQUE(carrier_code, tracking_number)

-- 서버 검증 로직
const [existing] = await connection.execute(
  'SELECT shipment_id FROM shipments WHERE carrier_code = ? AND tracking_number = ? AND voided_at IS NULL',
  [carrier_code, tracking_number]
);
if (existing.length > 0) {
  throw new Error('유효한 송장번호가 이미 존재합니다.');
}
```

### 2. shipment_units 테이블 (B안)

#### 제시된 구조
```sql
CREATE TABLE shipment_units (
  shipment_id BIGINT NOT NULL,
  order_item_unit_id BIGINT NOT NULL,
  
  PRIMARY KEY (shipment_id, order_item_unit_id),  -- 복합키, 이력 허용
  FOREIGN KEY (shipment_id) REFERENCES shipments(shipment_id) ON DELETE RESTRICT,
  FOREIGN KEY (order_item_unit_id) REFERENCES order_item_units(order_item_unit_id) ON DELETE RESTRICT,
  INDEX idx_unit (order_item_unit_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### 검증 결과
- ✅ **이력 허용**: 복합키로 같은 unit이 여러 shipment에 등장 가능
- ✅ **현재 시스템과 호환**: 신규 테이블이므로 충돌 없음

#### 잠재적 문제점 및 해결

**문제 1: 복합키 중복 방지**
- **시나리오**: 같은 `(shipment_id, order_item_unit_id)` 조합 중복 INSERT
- **해결**: PRIMARY KEY로 자동 방지 (정상)

**문제 2: voided shipment와의 관계**
- **시나리오**: `voided_at IS NOT NULL`인 shipment의 `shipment_units`는 이력으로만 사용
- **해결**: 정상 (B안의 핵심 설계)

### 3. order_item_units 테이블 수정 (B안)

#### 제시된 구조
```sql
-- order_item_units 테이블에 추가
ALTER TABLE order_item_units
  ADD COLUMN current_shipment_id BIGINT NULL,
  ADD FOREIGN KEY (current_shipment_id) 
    REFERENCES shipments(shipment_id) 
    ON DELETE RESTRICT;

-- 인덱스 추가
CREATE INDEX idx_current_shipment ON order_item_units(current_shipment_id);
```

#### 검증 결과
- ✅ **단일 진실 보장**: `current_shipment_id`로 "현재 유효 송장" 1개 고정
- ✅ **NULL 허용**: `unit_status = 'reserved'`일 때 NULL 정상
- ✅ **현재 시스템과 호환**: 신규 컬럼 추가이므로 충돌 없음

#### 잠재적 문제점 및 해결

**문제 1: current_shipment_id NULL 허용**
- **시나리오**: `unit_status = 'reserved'`일 때 `current_shipment_id = NULL`
- **해결**: 정상 (배송 전이므로 NULL이 맞음)

**문제 2: voided shipment 참조**
- **시나리오**: `current_shipment_id`가 `voided_at IS NOT NULL`인 shipment를 참조
- **해결**: 서버 검증 필요
```javascript
// 송장 교체 시 검증
const [shipment] = await connection.execute(
  'SELECT * FROM shipments WHERE shipment_id = ? AND voided_at IS NULL',
  [current_shipment_id]
);
if (shipment.length === 0) {
  throw new Error('유효하지 않은 shipment 참조');
}
```

**문제 3: current_shipment_id와 shipment_units 불일치**
- **시나리오**: `current_shipment_id = 123`인데 `shipment_units`에 `(123, unit_id)` 없음
- **해결**: 트랜잭션으로 보장
```javascript
// 송장 생성 시 동시에 처리
await connection.execute(
  'INSERT INTO shipment_units (shipment_id, order_item_unit_id) VALUES (?, ?)',
  [shipmentId, unitId]
);
await connection.execute(
  'UPDATE order_item_units SET current_shipment_id = ? WHERE order_item_unit_id = ?',
  [shipmentId, unitId]
);
```

---

## 🔄 상태 전이 규칙 검증 (B안)

### 1. shipped 전이 규칙

#### 제시된 규칙
```
shipment 생성 없이 unit_status = shipped 금지
shipped는 항상:
1. shipment 생성
2. shipment_units INSERT
3. order_item_units.current_shipment_id 설정
4. unit_status = shipped
이 한 트랜잭션에서만 가능
```

#### 검증 결과
- ✅ **SSOT 준수**: `unit_status`는 실물 SSOT 유지
- ✅ **증거성 보장**: shipment로 증거 남김
- ✅ **현재 시스템과 호환**: 신규 로직이므로 충돌 없음

#### 현재 시스템 비교
```javascript
// 현재: backend/index.js 1599-1671줄
// 관리자가 수동으로 orders.status 변경 가능
app.put('/api/admin/orders/:orderId/status', async (req, res) => {
  await connection.execute(
    'UPDATE orders SET status = ? WHERE order_id = ?',
    [status, orderId]
  );
});
```

**충돌 사항**:
- ❌ **현재**: 관리자 수동 상태 변경 가능
- ✅ **B안**: shipment 기반으로만 전이 허용
- ⚠️ **수정 필요**: 기존 관리자 상태 변경 API 제거 또는 집계 함수로 대체

### 2. 송장 교체 / 재발송 규칙 (B안의 핵심)

#### 제시된 규칙
```
허용 시나리오:
- 송장 오입력
- 택배사 변경
- 분실 재발송
- 반송 후 재출고

처리 흐름 (고정):
1. 기존 shipment를 voided_at + void_reason으로 무효화
2. 새 shipment 생성
3. shipment_units에 동일 unit 재매핑
4. order_item_units.current_shipment_id를 새 shipment로 교체
5. unit_status는 shipped 유지 (되돌리지 않음)
6. warranty_events / shipment_events 로그 기록

❗️중요:
- unit_status를 reserved로 되돌리는 행위 금지
- shipped → shipped (송장만 교체)
```

#### 검증 결과
- ✅ **운영 현실 반영**: 재발송/교체는 실제 발생
- ✅ **데이터 무결성**: 이력 보존 + 현재 상태 명확화
- ✅ **SSOT 준수**: `unit_status`는 `shipped` 유지 (되돌리지 않음)

#### 잠재적 문제점 및 해결

**문제 1: voided shipment와 current_shipment_id 불일치**
- **시나리오**: `current_shipment_id`가 voided shipment를 참조
- **해결**: 송장 교체 시 검증
```javascript
// 송장 교체 API
router.post('/api/admin/shipments/:shipmentId/replace', async (req, res) => {
  const { new_carrier_code, new_tracking_number, void_reason } = req.body;
  
  await connection.beginTransaction();
  
  try {
    // 1. 기존 shipment void
    await connection.execute(
      'UPDATE shipments SET voided_at = NOW(), void_reason = ? WHERE shipment_id = ?',
      [void_reason, shipmentId]
    );
    
    // 2. 새 shipment 생성
    const [newShipment] = await connection.execute(
      'INSERT INTO shipments (...) VALUES (...)',
      [...]
    );
    
    // 3. shipment_units 재매핑
    const [units] = await connection.execute(
      'SELECT order_item_unit_id FROM shipment_units WHERE shipment_id = ?',
      [shipmentId]
    );
    
    for (const unit of units) {
      await connection.execute(
        'INSERT INTO shipment_units (shipment_id, order_item_unit_id) VALUES (?, ?)',
        [newShipment.insertId, unit.order_item_unit_id]
      );
      
      // 4. current_shipment_id 교체
      await connection.execute(
        'UPDATE order_item_units SET current_shipment_id = ? WHERE order_item_unit_id = ?',
        [newShipment.insertId, unit.order_item_unit_id]
      );
    }
    
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
});
```

**문제 2: delivered 이후 재발송 정책**
- **시나리오**: 배송 완료 후 고객이 "받지 못했다"고 주장
- **해결**: 정책 확정 필요
  - 옵션 A: `delivered`는 절대 변경 불가 (물리적 종료)
  - 옵션 B: `delivered` → `return_received` → 신규 shipment (반품 후 재출고)

**권장**: 옵션 A (물리적 종료)
- 이유: `delivered`는 "물리적 종료 상태"로 취급
- 재발송은 "반품 수령 → 신규 shipment"로만 허용

### 3. delivered 이후 정책

#### 제시된 규칙
```
delivered 이후:
- 송장 교체 금지
- 재발송은 "반품 수령 → 신규 shipment"라는 별도 플로우로만 허용
- delivered는 "물리적 종료 상태"로 취급
```

#### 검증 결과
- ✅ **데이터 무결성**: `delivered`는 종료 상태로 고정
- ✅ **SSOT 준수**: `unit_status`는 실물 SSOT 유지

---

## 📊 orders.status 집계와의 관계 검증

### 제시된 규칙
```
orders.status는 order_item_units.unit_status만 보고 집계
shipment 교체는 orders.status에 영향 없음
shipped / partial_shipped 판단은:
- unit_status 기준
- shipment 개수/이력은 참고하지 않음
```

### 검증 결과
- ✅ **SSOT 준수**: `orders.status`는 집계용만 사용
- ✅ **단순성 유지**: shipment 복잡성은 shipment 레이어에서만 처리
- ✅ **현재 시스템과 호환**: 집계 함수로만 갱신 (기존 수동 변경 API 제거 필요)

### 현재 시스템 비교
```javascript
// 현재: backend/index.js 1599-1671줄
// 관리자가 수동으로 orders.status 변경
app.put('/api/admin/orders/:orderId/status', async (req, res) => {
  await connection.execute(
    'UPDATE orders SET status = ? WHERE order_id = ?',
    [status, orderId]
  );
});
```

**충돌 사항**:
- ❌ **현재**: 관리자 수동 상태 변경 가능
- ✅ **B안**: 집계 함수로만 갱신
- ⚠️ **수정 필요**: 기존 API 제거 또는 집계 함수로 대체

---

## 🎯 관리자 화면 사용 규칙 검증 (B안)

### 제시된 규칙
```
[배송 시작] → 신규 shipment 생성
[송장 교체] → 기존 shipment void + 신규 shipment
[재발송] → 동일 (사유 필수 입력)
[배송 완료] → unit_status delivered
```

### 검증 결과
- ✅ **운영 편의성**: 관리자 자유도 확보
- ✅ **데이터 무결성**: 서버 검증으로 보장
- ✅ **증거성**: 모든 변경이 로그로 기록

### 현재 시스템 비교
```javascript
// 현재: backend/index.js 1599-1671줄
// 관리자가 직접 orders.status 변경
const allowedStatuses = ['pending', 'confirmed', 'processing', 'shipping', 'delivered', 'cancelled'];
```

**충돌 사항**:
- ❌ **현재**: 관리자가 직접 `orders.status` 변경
- ✅ **B안**: shipment 기반으로만 전이, `orders.status`는 집계 함수로만 갱신
- ⚠️ **수정 필요**: 기존 관리자 상태 변경 API 제거 또는 집계 함수로 대체

---

## 🔍 최종 검증 결과

### ✅ B안의 올바른 부분

1. **이력 보존 + 현재 상태 명확화**: ✅ 올바름
   - 운영 현실 반영
   - 데이터 무결성 보장

2. **voided_at/void_reason 무효화 처리**: ✅ 올바름
   - 삭제하지 않고 무효화
   - 이력 보존

3. **current_shipment_id 단일 진실**: ✅ 올바름
   - 현재 유효 송장 1개 고정
   - 화면/집계/CS에서 명확

4. **복합키로 이력 허용**: ✅ 올바름
   - 같은 unit이 여러 shipment에 등장 가능
   - 재발송/교체 지원

5. **shipped 전이 규칙**: ✅ 올바름
   - shipment 기반으로만 전이
   - SSOT 원칙 준수

6. **delivered 이후 정책**: ✅ 올바름
   - 물리적 종료 상태로 취급
   - 재발송은 별도 플로우로만 허용

### ⚠️ 추가 확인 필요 사항

1. **UNIQUE(carrier_code, tracking_number)와 voided 충돌**
   - 해결: 애플리케이션 레벨 검증 (voided_at IS NULL인 경우만 UNIQUE)

2. **current_shipment_id 검증**
   - 해결: 서버 검증 로직 필요 (voided shipment 참조 방지)

3. **delivered 이후 재발송 정책**
   - 해결: 정책 확정 필요 (옵션 A 권장: 물리적 종료)

4. **기존 관리자 상태 변경 API**
   - 해결: 제거 또는 집계 함수로 대체

---

## 📋 최종 권장사항

### 즉시 반영 필요 (B안 채택)

1. ✅ **Shipment B안 채택 (운영형)**
   - 이력 보존 + 현재 상태 명확화
   - 재발송/송장 교체 지원

2. ✅ **current_shipment_id 추가**
   - 단일 진실 보장

3. ✅ **voided_at/void_reason 추가**
   - 무효화 처리

4. ✅ **복합키로 이력 허용**
   - 재발송/교체 지원

### 추가 구현 필요

1. ⚠️ **송장 교체 API**: 기존 shipment void + 신규 shipment 생성
2. ⚠️ **서버 검증 로직**: voided shipment 참조 방지
3. ⚠️ **기존 관리자 상태 변경 API 제거**: 집계 함수로 대체

---

**Shipment B안은 올바르며, 현재 시스템과 호환됩니다. 운영 현실을 반영한 안정적인 설계입니다.**






