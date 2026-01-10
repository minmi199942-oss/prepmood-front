# 최종 개선 사항 요약 (GPT 검토 반영)

## 🎯 핵심 원칙

**GPT의 검토 내용을 모두 반영하여 "구조적으로 오류가 안 나게" 구현 완료**

---

## ✅ 완료된 개선 사항

### 1. 주문 payload 생성 함수 SSOT 통합 ✅

#### 문제
- `checkout-script.js` 525-554줄: 주문 payload 생성
- `checkout-payment.js` 427-432줄: 주문 payload 생성 (size/color 추가)
- `checkout-payment.js` 237-243줄: 주문 payload 생성 (size/color 누락) ⚠️

→ **"427줄엔 있고 549줄엔 없고" 같은 문제 발생 위험**

#### 해결
- `utils/checkout-utils.js` 생성: `createOrderPayload()` 함수 (SSOT)
- 모든 주문 생성 경로에서 이 함수 사용:
  - `checkout-script.js` ✅
  - `checkout-payment.js` (proceedWithInicisPayment) ✅
  - `checkout-payment.js` (proceedWithTossPayment) ✅

#### 장점
- **단일 진실 원천(SSOT)**: 한 곳에서만 로직 관리
- **실수 방지**: 새로운 주문 경로 추가 시에도 자동으로 size/color 포함
- **유지보수 용이**: 로직 변경 시 한 곳만 수정

---

### 2. Color 표준값 DB 제약 추가 ✅

#### 문제
- 문서로만 표준을 정하면 시간이 지나면서 무조건 깨짐
- 프론트엔드/관리자 입력이 서로 다른 표기로 들어올 수 있음

#### 해결
- `color_standards` lookup 테이블 생성 (SSOT)
- 표준값: `Black`, `Navy`, `White`, `Grey`, `Light Blue`, `Light Grey`
- `stock_units.color` → `color_standards.color_code` FK 제약 추가
- `order_items.color` → `color_standards.color_code` FK 제약 추가
- 기존 데이터 정규화: 다양한 입력 형식 → 표준값

#### 장점
- **구조적 강제**: 틀린 값은 DB 레벨에서 저장 불가
- **재고 미매칭 방지**: 표준값만 허용하여 매칭 실패 근본 차단
- **정책 문서와 코드와 DB 일치**: 시간이 지나도 깨지지 않음

---

### 3. Size NULL 정책 쿼리 반영 ✅

#### 문제
- 주문에 size가 NULL일 때 조건이 없어서 모든 재고를 조회함
- "S가 품절인데 NULL 재고가 대신 배정되는" 사고 가능성

#### 해결
- `paid-order-processor.js`에서 정책 정확히 반영:
  ```sql
  -- size가 주문에 있으면: size = ? (정확 매칭)
  -- size가 주문에 없으면: size IS NULL (NULL 재고만 배정)
  ```

#### 정책 (확정)
- **의류**: 주문에 size가 오면 `size = ?`로 정확 매칭
- **타이/액세서리**: 주문에서 size를 보내지 않으면 `size IS NULL` 재고만 배정
- **핵심**: "주문에 size가 NULL이면, 재고도 size IS NULL만 배정"

#### 장점
- **정확 배정 보장**: 사이즈별 정확 배정이 목표
- **타이/액세서리 처리**: size 없는 상품도 자연스럽게 처리
- **오배정 방지**: "S가 품절인데 NULL 재고가 대신 배정되는" 사고 원천 차단

---

### 4. Color 정규화 함수 추가 ✅

#### 해결
- `normalizeColor()` 함수 추가 (SSOT)
- 다양한 입력 형식 → 표준값 변환:
  - `LightBlue` → `Light Blue`
  - `LB` → `Light Blue`
  - `BK` → `Black`
  - 등등...

#### 적용 범위
- 프론트엔드: `createOrderPayload()` 내부에서 자동 정규화
- 백엔드: 재고 추가 시 입력값 정규화 (필요 시)

---

## ⚠️ 선택적 개선 사항 (현재도 안전)

### 트랜잭션 부분 성공 개선 (선택)

#### 현재 상태
- ✅ **안전함**: 전체가 하나의 트랜잭션 안에서 실행되므로 롤백 보장
- ✅ **데이터 정합성**: 첫 아이템 성공, 두 번째 실패 시 전체 롤백

#### 개선 여지 (선택적)
- 모든 아이템 재고를 먼저 조회 (`SELECT ... FOR UPDATE SKIP LOCKED`)
- 그 다음 일괄 UPDATE/INSERT로 확정
- **장점**: 디버깅/가시성/성능 향상

#### 판단
- 현재도 안전하므로 **선택적 개선**으로 분류
- 운영 안정화 후 필요 시 리팩터링 고려

---

## 📋 적용 체크리스트

### 백엔드
- [x] `utils/checkout-utils.js` 생성 (SSOT 함수)
- [x] `checkout-script.js`에서 SSOT 함수 사용
- [x] `checkout-payment.js`에서 SSOT 함수 사용 (2곳 모두)
- [x] `paid-order-processor.js`에서 Size NULL 정책 반영
- [x] Color DB 제약 마이그레이션 작성 (`049_add_color_standard_check.sql`)

### 프론트엔드
- [x] `checkout.html`에 `checkout-utils.js` 추가
- [x] `checkout-payment.html`에 `checkout-utils.js` 추가
- [x] `checkout-script.js`에서 SSOT 함수 사용
- [x] `checkout-payment.js`에서 SSOT 함수 사용 (2곳 모두)

### 정책 문서
- [x] `SIZE_COLOR_STANDARDIZATION_POLICY.md` 작성
- [x] Color 표준값 목록 정의
- [x] Size NULL 정책 확정
- [x] 정규화 함수 정의

---

## 🚀 다음 단계 (VPS 실행)

### 1. 마이그레이션 실행 (순서 중요)
```bash
cd /var/www/html/backend

# 048: size, color 컬럼 추가 및 백필
mysql -u prepmood_user -p prepmood < migrations/048_add_stock_units_size_color.sql

# 049: Color 표준값 DB 제약 추가 (048 완료 후 실행)
mysql -u prepmood_user -p prepmood < migrations/049_add_color_standard_check.sql
```

### 2. 검증 쿼리
```sql
-- Color 표준값 확인
SELECT color_code, display_name FROM color_standards ORDER BY color_code;

-- stock_units.color 표준값 확인
SELECT color, COUNT(*) as count 
FROM stock_units 
WHERE color IS NOT NULL 
GROUP BY color 
ORDER BY color;

-- FK 제약 확인
SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE CONSTRAINT_NAME IN ('fk_stock_units_color_standard', 'fk_order_items_color_standard');
```

### 3. 테스트
- 주문 생성: 모든 경로에서 size/color 포함 확인
- 재고 배정: 사이즈별 정확 배정 확인
- 타이/액세서리: size NULL 처리 확인

---

## 📝 핵심 정책 (SSOT)

### Color 표준값 (DB 제약 강제)
```
Black
Navy
White
Grey
Light Blue    (띄어쓰기 필수)
Light Grey    (띄어쓰기 필수)
```

### Size 정책
- **의류**: 주문에 size가 있으면 → `size = ?` 정확 매칭
- **타이/액세서리**: 주문에 size가 없으면 → `size IS NULL` 재고만 배정

### 주문 payload 생성
- **SSOT**: `window.createOrderPayload(items, shipping)` 함수 사용
- **모든 주문 경로**: 이 함수를 통해 payload 생성
- **자동 정규화**: size/color 자동 정규화 포함

---

## ✅ 최종 평가

### 완료된 핵심 개선
1. ✅ 주문 payload 생성 함수 SSOT 통합
2. ✅ Color 표준값 DB 제약 추가
3. ✅ Size NULL 정책 쿼리 반영
4. ✅ Color 정규화 함수 추가

### 선택적 개선 (현재도 안전)
- 트랜잭션 부분 성공 개선: 현재도 안전함 (롤백 보장)

### 결과
- **"나중에 오류"** → **"구조적으로 오류가 안 나게"** ✅
- **단일 진실 원천(SSOT)** 구현 완료
- **DB 제약으로 정책 강제** 완료
- **모든 주문 경로 일관성** 보장

---

**문서 버전**: 1.0  
**최종 완료일**: 2026-01-11  
**검토자**: GPT + 사용자 승인
