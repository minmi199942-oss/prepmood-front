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

**테스트 방법 (API 직접 호출)**:
```bash
# 관리자 토큰 필요 (브라우저 개발자 도구에서 확인)
# 1. 관리자 페이지 로그인
# 2. 개발자 도구(F12) → Application → Local Storage → token 확인
# 3. 아래 명령어 실행 (TOKEN을 실제 토큰으로 교체)

curl -H "Authorization: Bearer {TOKEN}" \
  "https://prepmood.kr/api/admin/stock?product_id=PM-26-SH-Teneu-Solid-LB-S%2FM%2FL&limit=10"
```

**또는 브라우저에서**:
1. 관리자 페이지 로그인
2. 재고 관리 페이지 접속
3. 개발자 도구(F12) → Network 탭 열기
4. 재고 목록 로드 확인
5. Console에서 아래 코드 실행:
```javascript
// 관리자 토큰 가져오기
const token = localStorage.getItem('token') || sessionStorage.getItem('token');

// API 호출
fetch('https://prepmood.kr/api/admin/stock?product_id=PM-26-SH-Teneu-Solid-LB-S%2FM%2FL&limit=10', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
.then(r => r.json())
.then(data => console.log('재고 조회 결과:', data));
```

**예상 결과**:
- `success: true`
- `stock`: 재고 목록 배열
- 해당 상품의 재고만 필터링됨

**확인 사항**:
- [ ] HTTP 200 응답
- [ ] 재고 목록 정상 반환
- [ ] 필터링 정상 동작 (해당 상품의 재고만 반환)
- [ ] product_id가 legacy ID인 재고도 조회됨

---

### 4. 토큰 조회(상품별): legacy 입력
**목적**: 토큰 조회에서 legacy ID로도 정상 조회되는지 확인

**테스트 방법 (API 직접 호출)**:
```bash
# 관리자 토큰 필요 (브라우저 개발자 도구에서 확인)
curl -H "Authorization: Bearer {TOKEN}" \
  "https://prepmood.kr/api/admin/stock/products/PM-26-SH-Teneu-Solid-LB-S%2FM%2FL/tokens"
```

**또는 브라우저 Console에서**:
```javascript
// 관리자 토큰 가져오기
const token = localStorage.getItem('token') || sessionStorage.getItem('token');

// API 호출
fetch('https://prepmood.kr/api/admin/stock/products/PM-26-SH-Teneu-Solid-LB-S%2FM%2FL/tokens', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
.then(r => r.json())
.then(data => console.log('토큰 조회 결과:', data));
```

**예상 결과**:
- `success: true`
- `tokens`: 토큰 목록 반환 (배열)
- `product`: 상품 정보 반환 (id, name, short_name)

**확인 사항**:
- [ ] HTTP 200 응답
- [ ] 토큰 목록 정상 반환
- [ ] 상품 정보 정상 반환 (legacy ID로도 조회 가능)

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
