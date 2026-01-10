# products.xlsx 파일 업데이트 안전성 가이드

## ✅ 파일 업로드 자체는 안전합니다

### 1. products.xlsx 파일의 역할
- **단순 데이터 소스 파일**: DB와 직접 연결되지 않음
- **스크립트 실행 시에만 읽힘**: 파일을 덮어쓰는 것은 완전히 안전
- **기존 파일 백업 자동**: scp로 덮어쓰면 기존 파일은 사라지지만, DB 데이터는 그대로 유지

### 2. 파일 업로드 방법

```bash
# 로컬에서 실행
scp products.xlsx root@<VPS_IP>:/var/www/html/products.xlsx

# 예시
scp products.xlsx root@143.198.xxx.xxx:/var/www/html/products.xlsx
```

**결과:**
- ✅ 기존 `/var/www/html/products.xlsx` 파일이 새 파일로 교체됨
- ✅ 기존 DB 데이터는 영향 없음 (파일과 DB는 별개)
- ✅ 파일 권한 자동 설정 (scp가 처리)

---

## ⚠️ 주의사항: 스크립트 실행 선택

### 상황별 안전성

#### 시나리오 1: 기존 데이터 유지 + 필드 업데이트만 (✅ 권장)

**스크립트:** `update-token-master-from-xlsx.js`

```bash
# VPS에서 실행
cd /var/www/html/backend
node update-token-master-from-xlsx.js
```

**동작:**
- ✅ 기존 `token_master` 데이터 유지
- ✅ `product_name`으로 매칭하여 `serial_number`, `rot_code`, `warranty_bottom_code`만 업데이트
- ✅ warranties, stock_units 등 참조 테이블 영향 없음
- ✅ **완전히 안전**

**조건:**
- xlsx 파일에 `serial_number`, `rot_code`, `warranty_bottom_code` 컬럼이 있어야 함
- xlsx 파일의 `product_name`이 DB의 `token_master.product_name` 또는 `admin_products.name`과 매칭되어야 함

---

#### 시나리오 2: 완전 초기화 (⚠️ 주의 필요)

**스크립트:** `init-token-master-from-xlsx.js`

```bash
# VPS에서 실행
cd /var/www/html/backend
node init-token-master-from-xlsx.js
```

**동작:**
- ⚠️ 기존 `token_master` 데이터 **전부 삭제**
- ✅ 새 토큰 생성하여 재생성
- ❌ **warranties 테이블에 데이터가 있으면 실패** (FK 제약 `ON DELETE RESTRICT`)

**위험:**
- warranties 테이블이 `token_pk`를 FK로 참조하고 있음
- `DELETE FROM token_master` 시 FK 제약 때문에 에러 발생
- **warranties가 비어있어야만 실행 가능**

---

## 🔍 실행 전 확인사항

### 1. warranties 테이블 상태 확인

```bash
# VPS에서 실행
mysql -u prepmood_user -p prepmood -e "SELECT COUNT(*) as warranty_count FROM warranties;"
```

**결과에 따른 조치:**

#### Case A: warranties가 비어있음 (0개)
```bash
# ✅ 완전 초기화 가능
node reset-token-master.js  # 안전 체크 포함
node init-token-master-from-xlsx.js  # 토큰 재생성
```

#### Case B: warranties에 데이터가 있음 (1개 이상)
```bash
# ✅ 업데이트만 가능 (안전)
node update-token-master-from-xlsx.js  # 기존 데이터 유지하고 필드만 업데이트
```

---

### 2. 현재 token_master 상태 확인

```bash
# VPS에서 실행
mysql -u prepmood_user -p prepmood -e "
SELECT 
    COUNT(*) as total_tokens,
    COUNT(serial_number) as with_serial_number,
    COUNT(rot_code) as with_rot_code,
    COUNT(warranty_bottom_code) as with_warranty_bottom_code
FROM token_master;"
```

---

### 3. xlsx 파일 구조 확인

**최신 products.xlsx 파일에는 다음 컬럼이 있어야 함:**

필수:
- `product_name` (제품명)

선택 (하나 이상 있어야 업데이트 가능):
- `serial_number` (시리얼 넘버)
- `rot_code` (ROT 코드)
- `warranty_bottom_code` (보증서 하단 코드)

기타:
- `digital_warranty_code` (디지털 보증서 코드)
- `digital_warranty_collection` (디지털 보증서 컬렉션)

**주의:** 컬럼명에 공백이 있으면 안 됨 (예: `serial_number ` 대신 `serial_number`)

---

## 📋 권장 실행 순서

### Step 1: 파일 업로드 (항상 안전)

```bash
# 로컬에서 실행
scp products.xlsx root@<VPS_IP>:/var/www/html/products.xlsx
```

### Step 2: VPS에서 상태 확인

```bash
# VPS에서 실행
cd /var/www/html/backend

# warranties 상태 확인
mysql -u prepmood_user -p prepmood -e "SELECT COUNT(*) FROM warranties;"

# token_master 상태 확인
mysql -u prepmood_user -p prepmood -e "SELECT COUNT(*) FROM token_master;"
```

### Step 3: 적절한 스크립트 실행

#### Option A: warranties가 비어있음 → 완전 초기화

```bash
# 안전 체크 포함
node reset-token-master.js

# 토큰 재생성
node init-token-master-from-xlsx.js
```

#### Option B: warranties에 데이터가 있음 → 업데이트만

```bash
# 기존 데이터 유지하고 필드만 업데이트
node update-token-master-from-xlsx.js
```

---

## 🚨 문제 발생 시 복구 방법

### 문제 1: warranties FK 제약으로 init 실패

**증상:**
```
Error: Cannot delete from token_master because warranties references it
```

**해결:**
- `update-token-master-from-xlsx.js` 사용 (기존 데이터 유지)

### 문제 2: xlsx 파일 구조 불일치

**증상:**
```
[UPDATE] 업데이트할 제품 데이터가 없습니다.
```

**해결:**
1. xlsx 파일 컬럼명 확인 (`node update-token-master-from-xlsx.js` 실행 시 디버깅 로그 확인)
2. 컬럼명이 정확한지 확인 (`serial_number`, `rot_code`, `warranty_bottom_code`)
3. `product_name`이 DB의 제품명과 매칭되는지 확인

### 문제 3: product_name 매칭 실패

**증상:**
```
[UPDATE] ⚠️ admin_products에서 상품을 찾을 수 없음: ...
```

**해결:**
- xlsx 파일의 `product_name`을 `admin_products.name`과 정확히 일치시켜야 함
- 부분 매칭도 시도하지만, 정확한 매칭 권장

---

## ✅ 최종 확인 체크리스트

- [ ] 로컬에 최신 `products.xlsx` 파일 준비 완료
- [ ] xlsx 파일에 `product_name` 컬럼 있음
- [ ] xlsx 파일에 `serial_number`, `rot_code`, `warranty_bottom_code` 중 하나 이상 있음
- [ ] VPS에서 warranties 테이블 상태 확인 완료
- [ ] 적절한 스크립트 선택 완료 (update vs init)
- [ ] 실행 전 DB 백업 권장 (선택사항)

---

## 📝 요약

1. **파일 업로드 자체는 완전히 안전** (파일과 DB는 별개)
2. **update 스크립트는 항상 안전** (기존 데이터 유지)
3. **init 스크립트는 warranties가 비어있어야만 실행 가능** (FK 제약)
4. **실행 전 warranties 상태 확인 필수**
