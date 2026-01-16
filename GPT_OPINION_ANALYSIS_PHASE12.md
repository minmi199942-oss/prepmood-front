# GPT 의견 분석: Phase 12 기존 API 유지 문제점

## 📋 GPT 의견 요약

**핵심 지적**: "기존 API(/shipped, /delivered)를 그대로 유지"는 가능하지만, 그대로 두면 위험해질 수 있다.

**문제점**:
- 기존 API가 `shipments`/`shipment_units`를 건드리지 않고 `order_item_units`만 직접 업데이트하는 방식
- "송장 기반 SSOT"가 깨지고 나중에 데이터가 갈라진다

**해결 방안**:
1. 기존 API도 내부적으로는 `shipment-routes`의 함수(공통 서비스)를 호출해서 `shipments`/`shipment_units`까지 동일하게 기록
2. 아예 기존 API는 "deprecated"로 표시하고 관리자 UI에서 호출을 막기

---

## ✅ GPT 의견 검증 결과

### 1. SSOT 원칙 확인

**문서 확인** (`SHIPMENT_B_OPTION_ANALYSIS.md` 196-207줄):
```
shipment 생성 없이 unit_status = shipped 금지
shipped는 항상:
1. shipment 생성
2. shipment_units INSERT
3. order_item_units.current_shipment_id 설정
4. unit_status = shipped
이 한 트랜잭션에서만 가능
```

**검증 결과**: ✅ **GPT의 지적이 정확합니다**
- 설계 문서에 명확히 "shipment 생성 없이 unit_status = shipped 금지" 규칙이 있음
- 기존 API는 이 규칙을 위반하고 있음

### 2. 기존 API 구현 확인

**기존 API** (`backend/index.js` 1868-1879줄):
```javascript
// ❌ shipments/shipment_units 테이블을 건드리지 않음
const [updateResult] = await connection.execute(
    `UPDATE order_item_units
     SET unit_status = 'shipped',
         carrier_code = ?,
         tracking_number = ?,
         shipped_at = NOW()
     WHERE ...`
);
```

**새 API** (`backend/shipment-routes.js` 236-260줄):
```javascript
// ✅ shipments 테이블에 기록
const [shipmentResult] = await connection.execute(
    `INSERT INTO shipments ...`
);

// ✅ shipment_units 테이블에 연결
await connection.execute(
    `INSERT INTO shipment_units ...`
);

// ✅ order_item_units.current_shipment_id 업데이트
await connection.execute(
    `UPDATE order_item_units
     SET current_shipment_id = ?, ...`
);
```

**검증 결과**: ✅ **GPT의 지적이 정확합니다**
- 기존 API는 `shipments`/`shipment_units`를 사용하지 않음
- 새 API는 `shipments`/`shipment_units`를 사용함
- 두 API가 서로 다른 데이터를 업데이트하게 되어 SSOT가 깨짐

### 3. 데이터 불일치 시나리오

**문제 시나리오**:
1. 관리자가 기존 `/shipped` API 사용 → `order_item_units`만 업데이트, `shipments` 없음
2. 나중에 새 `/shipments` API 사용 → `shipments` 생성, `current_shipment_id` 업데이트
3. 결과: `order_item_units.tracking_number`와 `shipments.tracking_number`가 불일치 가능
4. 송장 교체/재발송 기능 사용 시 문제 발생

**검증 결과**: ✅ **GPT의 지적이 정확합니다**
- 두 API를 병행 사용하면 데이터 불일치 발생 가능
- 송장 교체 정책(B안)이 제대로 작동하지 않을 수 있음

---

## 🔧 해결 방안

### 옵션 1: 기존 API를 새 API로 리팩토링 (권장)

**방법**: 기존 `/shipped` API 내부에서 `shipment-routes`의 공통 함수 호출

**장점**:
- 기존 API 엔드포인트 유지 (프론트엔드 수정 최소화)
- SSOT 원칙 준수
- 점진적 마이그레이션 가능

**단점**:
- 코드 중복 제거를 위한 리팩토링 필요

### 옵션 2: 기존 API를 deprecated로 표시

**방법**: 
- 기존 API에 `@deprecated` 주석 추가
- 관리자 UI에서 호출 차단
- 새 API만 사용하도록 전환

**장점**:
- 명확한 전환 경로
- SSOT 원칙 준수

**단점**:
- 프론트엔드 수정 필요
- 기존 사용 중인 코드가 있다면 모두 수정 필요

### 옵션 3: 기존 API 완전 제거

**방법**: 기존 `/shipped`, `/delivered` API 완전 제거

**장점**:
- 가장 깔끔한 해결책
- SSOT 원칙 완벽 준수

**단점**:
- 프론트엔드 수정 필수
- 기존 사용 중인 코드가 있다면 모두 수정 필요

---

## 📝 권장 조치

**즉시 조치**:
1. 기존 `/shipped` API를 새 `/shipments` API 로직으로 리팩토링
2. 기존 `/delivered` API는 그대로 유지 (shipments와 무관)
3. 기존 API에 deprecation 경고 추가 (점진적 전환)

**장기 조치**:
- 관리자 UI에서 새 API만 사용하도록 전환
- 기존 API 완전 제거 (프론트엔드 전환 완료 후)

---

## ✅ Phase 10 요구사항 검증

GPT의 Phase 10 제안이 계획표와 일치하는지 확인:

**계획표 요구사항** (`COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md` 1145-1192줄):
- ✅ `GET /api/guest/orders/:orderId` 엔드포인트
- ✅ `guest_order_access_token` 기반 인증
- ✅ 토큰 검증 후 httpOnly Cookie 설정
- ✅ Redirect 처리
- ✅ 주문 상세 정보 노출

**GPT 제안**:
- ✅ 접근 토큰 기반 "읽기 전용" 조회
- ✅ `GET /api/guest/orders/:orderId` 또는 `GET /api/guest/orders/:orderNumber`
- ✅ 쿠키/헤더로 `guest_access_token` 제출
- ✅ Claim 후 revoked 토큰 처리 (이미 Phase 6에 구현됨)

**검증 결과**: ✅ **GPT의 제안이 계획표와 일치합니다**

**추가 제안 (GPT)**:
- 노출 데이터 범위 확정 (필요 최소 원칙)
- 민감정보 마스킹
- Claim 후 403/410 에러

**검증 결과**: ✅ **합리적인 보안 제안입니다**

---

## 🎯 최종 판단

1. **GPT의 Phase 12 지적**: ✅ **정확합니다** - ✅ **수정 완료**
2. **GPT의 Phase 10 제안**: ✅ **계획표와 일치하며 합리적입니다**
3. **다음 단계**: ✅ Phase 12 기존 API 수정 완료 → Phase 10 구현 준비 완료

## ✅ 수정 완료 사항

### Phase 12 기존 API 수정
- ✅ `/api/admin/orders/:orderId/shipped` API 수정 완료
  - `shipments` 테이블에 송장 기록 추가
  - `shipment_units` 테이블에 연결 추가
  - `order_item_units.current_shipment_id` 업데이트 추가
  - `orders.status` 집계 함수 호출 추가
- ✅ `/api/admin/orders/:orderId/delivered` API 수정 완료
  - `orders.status` 집계 함수 호출 추가 (기존에 누락되어 있었음)

**결과**: 기존 API도 SSOT 원칙을 준수하도록 수정 완료
