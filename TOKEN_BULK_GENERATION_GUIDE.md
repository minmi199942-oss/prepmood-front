# 토큰 일괄 생성 가이드

**작성일**: 2026-01-16  
**목적**: 관리자 페이지에서 xlsx 파일을 통해 토큰을 일괄 생성하는 전체 프로세스

---

## ⚠️ 중요: 사전 점검 필수

**UNIQUE 제약 추가 전에 반드시 실행해야 합니다.**

### 사전 점검 SQL

**파일**: `backend/scripts/check_token_master_unique_constraints.sql`

**실행 방법**:
```bash
# VPS에서 실행
cd /var/www/html/backend
mysql -u prepmood_user -p prepmood < scripts/check_token_master_unique_constraints.sql
```

**점검 항목**:
1. NULL/빈 문자열 확인 (`serial_number`, `warranty_bottom_code`)
2. 중복 확인 (`serial_number`, `warranty_bottom_code`)

**결과 해석**:
- **NULL/빈문자열이 있으면**: 업로드 모드에서 NULL 금지 검증 필요
- **중복이 있으면**: 정리 후 UNIQUE 제약 추가
- **모두 0이면**: UNIQUE 제약 추가 가능

**상세 SQL 내용은 `backend/scripts/check_token_master_unique_constraints.sql` 파일 참조**

---

## 📋 전체 프로세스 개요

토큰 일괄 생성은 다음 단계로 구성됩니다:

1. **상품 등록** (관리자 페이지) - `product_id` 확정
2. **xlsx 파일 준비** (필수 컬럼 포함)
3. **토큰 일괄 생성** (관리자 페이지) - xlsx 업로드
4. **재고 등록** (관리자 페이지) - `token_pk` 연결

---

## 📝 xlsx 파일 구조

### 필수 컬럼

| 컬럼명 | 설명 | 예시 | 비고 |
|--------|------|------|------|
| `product_id` | 상품 ID (admin_products.id) | `PM-26-SH-Teneu-Solid-LB` | 필수, admin_products에 존재해야 함 |
| `serial_number` | 시리얼 넘버 (고유값) | `SN-001` | 필수, 고유값 |
| `warranty_bottom_code` | 보증서 하단 코드 (고유값) | `WB-001` | 필수, 고유값 |

### 선택 컬럼

| 컬럼명 | 설명 | 예시 | 비고 |
|--------|------|------|------|
| `rot_code` | ROT 코드 | `ROT-001` | 선택, 중복 가능 |
| `digital_warranty_code` | 디지털 보증서 코드 | `DW-001` | 선택, 중복 가능 |
| `digital_warranty_collection` | 디지털 보증서 컬렉션 | `Collection-26` | 선택, 상품 라인 공통 |

### 자동 생성 (xlsx에 불필요)

- `token`: 20자 랜덤 (자동 생성, UNIQUE)
- `internal_code`: `SN-{serial_number}` 또는 `AUTO-{번호}` (자동 생성)

---

## 📄 xlsx 템플릿 예시

### 예시 1: 최소 필수 컬럼

```
product_id | serial_number | warranty_bottom_code
PM-26-SH-Teneu-Solid-LB | SN-001 | WB-001
PM-26-SH-Teneu-Solid-LB | SN-002 | WB-002
PM-26-SH-Teneu-Solid-LB | SN-003 | WB-003
```

### 예시 2: 모든 컬럼 포함

```
product_id | serial_number | warranty_bottom_code | rot_code | digital_warranty_code | digital_warranty_collection
PM-26-SH-Teneu-Solid-LB | SN-001 | WB-001 | ROT-001 | DW-001 | Collection-26
PM-26-SH-Teneu-Solid-LB | SN-002 | WB-002 | ROT-002 | DW-002 | Collection-26
PM-26-SH-Teneu-Solid-LB | SN-003 | WB-003 | ROT-003 | DW-003 | Collection-26
```

**주의사항**:
- 1행 = 1토큰 (500개 토큰 생성 시 500행 필요)
- 헤더 행 포함 (첫 번째 행)
- 빈 행은 무시됨

---

## 🔍 검증 규칙

### 1. 필수 컬럼 존재 확인

xlsx 파일에 다음 컬럼이 반드시 있어야 함:
- `product_id`
- `serial_number`
- `warranty_bottom_code`

**실패 조건**: 필수 컬럼이 없으면 업로드 실패

---

### 2. 빈 값 검증

**규칙**: `trim()` 후 빈 문자열(`''`) 또는 NULL 금지

**검증 대상**:
- `product_id`
- `serial_number`
- `warranty_bottom_code`

**처리**:
```javascript
const serialNumber = String(row['serial_number'] || '').trim();
if (!serialNumber) {
    throw new Error('serial_number는 필수입니다.');
}
```

**실패 조건**: 빈 값이 있으면 업로드 실패

---

### 3. 파일 내 중복 검증 (DB 접근 전)

**규칙**: 같은 파일 내에서 동일한 고유값이 2번 이상 나타나면 실패

**검증 대상**:
- `serial_number` (파일 내 중복 금지)
- `warranty_bottom_code` (파일 내 중복 금지)

**처리**:
```javascript
const serialNumbers = new Set();
for (const row of rows) {
    if (serialNumbers.has(row.serial_number)) {
        throw new Error(`파일 내 serial_number 중복: ${row.serial_number}`);
    }
    serialNumbers.add(row.serial_number);
}
```

**실패 조건**: 파일 내 중복이 있으면 업로드 실패

---

### 4. DB 중복 선검증 (성능 최적화)

**규칙**: DB에 이미 존재하는 고유값과 충돌 확인

**검증 대상**:
- `serial_number` (DB 기존 값과 충돌 확인)
- `warranty_bottom_code` (DB 기존 값과 충돌 확인)

**처리**:
```javascript
// IN 조회로 묶어서 한 번에 확인
const [existing] = await connection.execute(
    `SELECT serial_number, warranty_bottom_code 
     FROM token_master 
     WHERE serial_number IN (?) OR warranty_bottom_code IN (?)`,
    [serialNumbersArray, warrantyBottomCodesArray]
);
```

**실패 조건**: DB 중복이 있으면 업로드 실패

---

### 5. product_id 검증

**규칙**: `admin_products` 테이블에 존재하는 `product_id`만 허용

**처리**:
```javascript
const [product] = await connection.execute(
    'SELECT id FROM admin_products WHERE id = ?',
    [productId]
);
if (product.length === 0) {
    throw new Error(`product_id를 찾을 수 없습니다: ${productId}`);
}
```

**실패 조건**: 존재하지 않는 `product_id`면 업로드 실패

---

### 6. UI 선택 product_id vs xlsx product_id 교차검증

**규칙**: UI에서 선택한 `product_id`와 xlsx의 `product_id`가 일치해야 함

**처리**:
```javascript
// UI에서 선택한 product_id
const selectedProductId = req.body.product_id;

// xlsx 첫 행의 product_id
const xlsxProductId = rows[0].product_id;

if (selectedProductId !== xlsxProductId) {
    throw new Error(`product_id 불일치: UI=${selectedProductId}, xlsx=${xlsxProductId}`);
}
```

**실패 조건**: 불일치하면 업로드 실패

---

## 📊 실패 리포트 포맷

### 표준 에러 응답 구조

```json
{
  "success": false,
  "message": "업로드 실패: 3건의 오류 발견",
  "total_rows": 500,
  "errors": [
    {
      "row": 17,
      "field": "serial_number",
      "code": "DUP_IN_FILE",
      "message": "파일 내 17행과 23행에서 동일한 serial_number 발견: SN-001"
    },
    {
      "row": 45,
      "field": "warranty_bottom_code",
      "code": "DUP_IN_DB",
      "message": "DB에 이미 존재하는 warranty_bottom_code: WB-045"
    },
    {
      "row": 78,
      "field": "product_id",
      "code": "PRODUCT_NOT_FOUND",
      "message": "admin_products에 존재하지 않는 product_id: PM-26-INVALID"
    },
    {
      "row": 120,
      "field": "serial_number",
      "code": "EMPTY_VALUE",
      "message": "serial_number는 필수입니다."
    },
    {
      "row": 200,
      "field": "product_id",
      "code": "PRODUCT_ID_MISMATCH",
      "message": "UI 선택 product_id(PM-26-SH-A)와 xlsx product_id(PM-26-SH-B) 불일치"
    }
  ]
}
```

### 에러 코드 정의

| 코드 | 설명 | 발생 조건 |
|------|------|----------|
| `DUP_IN_FILE` | 파일 내 중복 | 같은 파일 내 동일 값 2번 이상 |
| `DUP_IN_DB` | DB 중복 | DB에 이미 존재하는 값 |
| `EMPTY_VALUE` | 빈 값 | trim() 후 빈 문자열 또는 NULL |
| `PRODUCT_NOT_FOUND` | 상품 없음 | admin_products에 존재하지 않는 product_id |
| `PRODUCT_ID_MISMATCH` | product_id 불일치 | UI 선택과 xlsx 불일치 |
| `MISSING_COLUMN` | 컬럼 누락 | 필수 컬럼이 없음 |

---

## 🔄 트랜잭션 정책

### 원자성 원칙: 전부 성공 / 전부 실패

**규칙**: 500행 업로드에서 1건이라도 실패하면 전부 롤백

**구현**:
```javascript
await connection.beginTransaction();
try {
    // 1. 검증 (빈 값, 중복, product_id 등)
    // 2. 토큰 생성 (500개)
    // 3. INSERT (500개)
    
    await connection.commit();
    
    res.json({
        success: true,
        message: "500개 토큰 생성 완료",
        data: {
            created_count: 500,
            token_pk_range: [123, 124, ..., 622]
        }
    });
} catch (error) {
    await connection.rollback();
    
    // 실패 리포트 반환
    res.status(400).json({
        success: false,
        message: "업로드 실패",
        errors: errorReport
    });
}
```

**이유**:
- 부분 성공 시 데이터 정합성 문제
- 복구 어려움
- 관리자 혼란

---

## 🗄️ DB 제약 (UNIQUE 추가)

### 현재 상태

- `token_master.token`: UNIQUE ✅ (이미 존재)
- `token_master.serial_number`: 인덱스만 (UNIQUE 없음)
- `token_master.warranty_bottom_code`: 인덱스만 (UNIQUE 없음)

### UNIQUE 제약 추가 (사전 점검 완료 후)

**사전 조건**:
1. ✅ 사전 점검 SQL 실행 (`backend/scripts/check_token_master_unique_constraints.sql`)
2. ✅ 중복/NULL/빈문자열이 모두 0인지 확인
3. ✅ 중복이 있으면 정리 후 실행

**실행 SQL** (마이그레이션 파일로 생성 예정):
```sql
-- 사전 점검 완료 후 실행
-- 파일: backend/migrations/084_add_token_master_unique_constraints.sql

ALTER TABLE token_master
ADD CONSTRAINT uk_token_master_serial_number UNIQUE (serial_number);

ALTER TABLE token_master
ADD CONSTRAINT uk_token_master_warranty_bottom_code UNIQUE (warranty_bottom_code);
```

**주의사항**:
- NULL 허용 컬럼이므로 NULL은 여러 개 허용됨 (MySQL 특성)
- 업로드 모드에서 NULL/빈 문자열 금지 검증 필수
- 기존 데이터에 중복이 있으면 UNIQUE 추가 실패
- 실패 시 중복 데이터 정리 후 재시도

**실행 순서**:
1. 사전 점검 SQL 실행
2. 결과 확인 (중복/NULL 모두 0인지)
3. UNIQUE 제약 추가 SQL 실행

---

## 🚀 사용 방법

### 1단계: 상품 등록 (필수)

1. 관리자 페이지 → 상품 관리 (`/admin-qhf25za8/products.html`)
2. "+ 새 상품 추가" 클릭
3. 상품 정보 입력:
   - 상품 ID: `PM-26-SH-New-Product-LB` (예시)
   - 상품명, 가격, 카테고리 등
4. 저장 → `product_id` 확정

---

### 2단계: xlsx 파일 준비

**템플릿 다운로드** (향후 구현):
- 관리자 페이지에서 "xlsx 템플릿 다운로드" 클릭
- `product_id`가 자동으로 채워진 템플릿 다운로드

**수동 생성**:
1. Excel 파일 생성
2. 첫 번째 행에 헤더 입력:
   ```
   product_id | serial_number | warranty_bottom_code | rot_code | digital_warranty_code | digital_warranty_collection
   ```
3. 각 행마다 데이터 입력 (1행 = 1토큰)
4. 저장

---

### 3단계: 토큰 일괄 생성

1. 관리자 페이지 → 토큰 관리 (또는 상품 관리)
2. "토큰 일괄 생성" 버튼 클릭
3. 모달에서:
   - 상품 선택: 드롭다운에서 `product_id` 선택
   - xlsx 파일 업로드
4. "생성" 클릭
5. 결과 확인:
   - 성공: 생성된 `token_pk` 목록 표시
   - 실패: 실패 리포트 표시 (행 번호, 필드, 원인)

---

### 4단계: 재고 등록 (선택)

1. 관리자 페이지 → 재고 관리 (`/admin-qhf25za8/stock.html`)
2. "재고 추가" 클릭
3. 생성된 `token_pk` 입력
4. 사이즈, 색상 입력
5. 저장

---

## ⚠️ 주의사항

### 1. 고유값 정책

**고유값 3개**:
- `token` (자동 생성, UNIQUE)
- `serial_number` (xlsx 입력, UNIQUE)
- `warranty_bottom_code` (xlsx 입력, UNIQUE)

**중요**:
- 고유값은 각 토큰마다 고유해야 함
- 파일 내 중복 금지
- DB 중복 금지

---

### 2. 빈 값 처리

**규칙**: 고유값 필드는 빈 값 금지

**처리**:
- `trim()` 후 빈 문자열(`''`) → 에러
- NULL → 에러
- 공백만 있는 값 → `trim()` 후 빈 문자열 → 에러

---

### 3. product_id 교차검증

**규칙**: UI 선택과 xlsx `product_id` 일치 필수

**이유**:
- 실수로 다른 상품의 토큰이 생성되는 것 방지
- 데이터 정합성 보장

---

### 4. 트랜잭션 원자성

**규칙**: 전부 성공 아니면 전부 실패

**이유**:
- 부분 성공 시 데이터 정합성 문제
- 복구 어려움

---

## 📊 데이터 흐름

### 토큰 일괄 생성

```
사용자 입력 (xlsx 파일)
  ↓
파일 파싱
  ↓
검증 (빈 값, 파일 내 중복, DB 중복, product_id)
  ↓
트랜잭션 시작
  ↓
토큰 생성 (500개)
  ↓
INSERT (500개)
  ↓
트랜잭션 커밋
  ↓
성공 응답 (token_pk 목록)
```

### 실패 시

```
검증 실패 또는 INSERT 실패
  ↓
트랜잭션 롤백
  ↓
실패 리포트 생성
  ↓
에러 응답 (행 번호, 필드, 원인)
```

---

## 🔧 API 엔드포인트

### POST `/api/admin/tokens/bulk-generate`

**요청** (multipart/form-data):
```
product_id: "PM-26-SH-Teneu-Solid-LB"
xlsx_file: <파일>
```

**성공 응답**:
```json
{
  "success": true,
  "message": "500개 토큰 생성 완료",
  "data": {
    "product_id": "PM-26-SH-Teneu-Solid-LB",
    "created_count": 500,
    "token_pk_range": [123, 124, ..., 622],
    "first_token_pk": 123,
    "last_token_pk": 622
  }
}
```

**실패 응답**:
```json
{
  "success": false,
  "message": "업로드 실패: 3건의 오류 발견",
  "total_rows": 500,
  "errors": [
    {
      "row": 17,
      "field": "serial_number",
      "code": "DUP_IN_FILE",
      "message": "파일 내 17행과 23행에서 동일한 serial_number 발견: SN-001"
    }
  ]
}
```

---

## ✅ 체크리스트

### 업로드 전
- [ ] 상품 등록 완료 (`product_id` 확정)
- [ ] xlsx 파일 준비 (필수 컬럼 포함)
- [ ] 파일 내 중복 확인 (수동 또는 스크립트)
- [ ] DB 사전 점검 SQL 실행 (UNIQUE 제약 추가 전)

### 업로드 시
- [ ] 상품 선택 (드롭다운)
- [ ] xlsx 파일 업로드
- [ ] 검증 통과 확인
- [ ] 생성된 `token_pk` 확인

### 업로드 후
- [ ] 재고 등록 (선택, `token_pk` 사용)
- [ ] `token_master` 테이블 확인

---

## 🎯 요약

### 필수 단계
1. ✅ **상품 등록** (관리자 페이지) - `product_id` 확정
2. ✅ **xlsx 파일 준비** (필수 컬럼: product_id, serial_number, warranty_bottom_code)
3. ✅ **토큰 일괄 생성** (관리자 페이지) - xlsx 업로드
4. ⚠️ **재고 등록** (선택, 관리자 페이지) - `token_pk` 연결

### 핵심 포인트
- **1행 = 1토큰**: 500개 토큰 생성 시 xlsx에 500행 필요
- **고유값 3개**: token(자동), serial_number, warranty_bottom_code
- **트랜잭션**: 전부 성공 아니면 전부 실패
- **검증 순서**: 파일 내 중복 → DB 중복 → product_id
- **교차검증**: UI 선택 product_id vs xlsx product_id 일치 확인

---

**문서 버전**: 1.0  
**작성일**: 2026-01-16
