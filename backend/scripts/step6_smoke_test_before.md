# Step 6 전 스모크 테스트 가이드

## 📋 테스트 목적
Step 5 (Dual-read) 구현이 정상 동작하는지 확인

## ✅ 테스트 항목 (4개)

### 1. 상품 옵션 API: legacy ID로 호출
**목적**: 기존 legacy ID로도 정상 조회되는지 확인

**테스트 방법**:
```bash
# 예시: PM-26-SH-Teneu-Solid-LB-S/M/L (legacy ID)
curl "https://prepmood.kr/api/products/options?product_id=PM-26-SH-Teneu-Solid-LB-S%2FM%2FL"
```

**예상 결과**:
- `success: true`
- `options.sizes`: 사이즈 목록 (예: S, M, L)
- `options.colors`: 색상 목록 (예: Light Blue)
- 각 옵션에 `available` 속성 포함

**확인 사항**:
- [ ] HTTP 200 응답
- [ ] 사이즈 목록 정상 반환
- [ ] 색상 목록 정상 반환
- [ ] available 속성 정상

---

### 2. 상품 옵션 API: canonical ID로 호출
**목적**: canonical ID로도 정상 조회되는지 확인

**테스트 방법**:
```bash
# 예시: PM-26-SH-Teneu-Solid-LB-S (canonical ID, 사이즈 제거)
curl "https://prepmood.kr/api/products/options?product_id=PM-26-SH-Teneu-Solid-LB-S"
```

**예상 결과**:
- `success: true`
- `options.sizes`: 사이즈 목록 (예: S, M, L) - **1번과 동일해야 함**
- `options.colors`: 색상 목록 (예: Light Blue) - **1번과 동일해야 함**

**확인 사항**:
- [ ] HTTP 200 응답
- [ ] 1번과 동일한 결과 반환
- [ ] Dual-read 정상 동작 확인

---

### 3. 관리자 재고 조회: legacy 필터
**목적**: 관리자 재고 조회에서 legacy ID 필터가 정상 동작하는지 확인

**테스트 방법**:
1. 관리자 페이지 로그인
2. 재고 관리 페이지 접속
3. 상품 ID 필터에 legacy ID 입력 (예: `PM-26-SH-Teneu-Solid-LB-S/M/L`)
4. 조회 버튼 클릭

**또는 API 직접 호출**:
```bash
# 관리자 토큰 필요
curl -H "Authorization: Bearer {admin_token}" \
  "https://prepmood.kr/api/admin/stock?product_id=PM-26-SH-Teneu-Solid-LB-S%2FM%2FL"
```

**예상 결과**:
- 재고 목록 정상 반환
- 해당 상품의 재고만 필터링됨

**확인 사항**:
- [ ] 재고 목록 정상 표시
- [ ] 필터링 정상 동작
- [ ] product_id가 legacy ID인 재고도 조회됨

---

### 4. 토큰 조회(상품별): legacy 입력
**목적**: 토큰 조회에서 legacy ID로도 정상 조회되는지 확인

**테스트 방법**:
```bash
# 관리자 토큰 필요
curl -H "Authorization: Bearer {admin_token}" \
  "https://prepmood.kr/api/admin/stock/products/PM-26-SH-Teneu-Solid-LB-S%2FM%2FL/tokens"
```

**예상 결과**:
- `success: true`
- `tokens`: 토큰 목록 반환
- `product`: 상품 정보 반환

**확인 사항**:
- [ ] HTTP 200 응답
- [ ] 토큰 목록 정상 반환
- [ ] 상품 정보 정상 반환

---

## 📝 테스트 결과 기록

테스트 완료 후 아래 항목을 체크하세요:

- [ ] 테스트 1: 상품 옵션 API (legacy ID) - ✅ 통과
- [ ] 테스트 2: 상품 옵션 API (canonical ID) - ✅ 통과
- [ ] 테스트 3: 관리자 재고 조회 (legacy 필터) - ✅ 통과
- [ ] 테스트 4: 토큰 조회 (legacy 입력) - ✅ 통과

**모든 테스트 통과 시**: Step 6 진행 가능 ✅

**테스트 실패 시**: Step 5 코드 재검토 필요 ⚠️

---

## 🔍 문제 발생 시 확인 사항

1. **옵션 API 404 오류**:
   - `resolveProductId()` 함수가 정상 동작하는지 확인
   - DB에 canonical_id가 정상 백필되었는지 확인

2. **재고 조회 실패**:
   - `stock-routes.js`의 dual-read 로직 확인
   - JOIN 조건 확인

3. **토큰 조회 실패**:
   - `stock-routes.js`의 token 조회 dual-read 로직 확인
   - 서브쿼리 조건 확인

---

**작성일**: 2026-01-11  
**버전**: 1.0
