# GPT Phase 10 제안 분석 및 검증

## 📋 GPT 제안 요약

**핵심 제안**:
1. **2단 구성**: 세션 발급/검증 엔드포인트 + 주문 조회 엔드포인트
2. **order_number 기반**: `orderId` 대신 `order_number` 사용
3. **세션 토큰 교환 방식** (옵션 B 권장): 원본 토큰과 세션 분리
4. **Claim 후 차단**: `orders.user_id IS NOT NULL` 또는 `revoked_at IS NOT NULL` 시 403/410
5. **최소 노출 원칙**: 주소/전화 기본 제외 또는 마스킹

---

## ✅ 검증 결과

### 1. order_number vs orderId 사용 정책

**현재 시스템 확인**:
- ✅ `payments-routes.js`: `order_number`를 주로 사용 (400+ 라인에서 사용)
- ✅ `order-routes.js`: `order_number` 생성 및 사용 (`generateOrderNumber` 함수)
- ✅ `orders` 테이블: `order_number VARCHAR(32) NOT NULL UNIQUE`
- ✅ `payments` 테이블: `order_number` FK 사용

**계획표 확인**:
- ❌ `COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md`: `GET /api/guest/orders/:orderId` (orderId 사용)
- ❌ `SYSTEM_FLOW_DETAILED.md`: `/guest/orders/:orderId?token=xxx` (orderId 사용)

**검증 결과**: ✅ **GPT의 order_number 제안이 정확합니다**
- 현재 시스템은 `order_number`를 주로 사용
- `order_number`는 UNIQUE 제약이 있어 조회에 적합
- 프론트엔드/로그/CS 관점에서 `order_number`가 더 편리
- 계획표의 `orderId` 사용은 일관성 부족

**권장 조치**: ✅ **order_number로 통일**

---

### 2. 2단 구성 (세션 발급 + 주문 조회)

**GPT 제안**:
1. `GET /api/guest/orders/session?token=...` (세션 발급/검증)
2. `GET /api/guest/orders/:orderNumber` (주문 조회)

**계획표 확인**:
- `SYSTEM_FLOW_DETAILED.md` 297-301줄: "토큰 검증 → httpOnly Cookie 설정 → Redirect" 흐름 명시
- 단일 엔드포인트로 처리하는 것으로 보임

**검증 결과**: ✅ **GPT의 2단 구성이 더 안전하고 명확합니다**
- 토큰과 세션 분리로 보안 강화
- URL에서 토큰 제거 (쿠키로만 관리)
- 명확한 책임 분리 (세션 발급 vs 조회)

**권장 조치**: ✅ **2단 구성 채택**

---

### 3. 세션 토큰 교환 방식 (옵션 B)

**GPT 제안**:
- 원본 `guest_order_access_token`은 검증만
- 별도 세션 토큰 발급 (24시간 TTL)
- 쿠키에는 세션 토큰만 저장

**현재 DB 구조 확인**:
- `guest_order_access_tokens.token` (VARCHAR(100), 평문)
- `expires_at`, `revoked_at` 존재
- 세션 테이블 없음

**검증 결과**: ✅ **옵션 B가 더 안전하지만, 테스트 기간에는 옵션 A도 가능**
- 옵션 A: 구현 빠름, 테스트 기간 허용 가능
- 옵션 B: 보안 강화, 운영 환경 권장
- 현재 테이블 구조는 옵션 A 지원 (추가 테이블 불필요)

**권장 조치**: 
- **테스트 기간**: 옵션 A (빠른 구현)
- **운영 전**: 옵션 B로 전환 (보안 강화)

---

### 4. Claim 후 차단 로직

**GPT 제안**:
- `orders.user_id IS NOT NULL` 확인
- `guest_order_access_tokens.revoked_at IS NOT NULL` 확인
- 403 또는 410 응답

**현재 구현 확인**:
- ✅ `order-routes.js` 1257-1264줄: Claim 시 `revoked_at` 설정 구현됨
- ✅ `order-routes.js` 963줄: `user_id IS NULL` 확인 로직 존재

**검증 결과**: ✅ **GPT의 제안이 현재 구현과 일치합니다**
- Claim 로직이 이미 `revoked_at` 설정 구현
- `user_id IS NOT NULL` 확인 로직 존재
- 410 응답이 사용자에게 더 명확함

**권장 조치**: ✅ **GPT 제안대로 구현**

---

### 5. 최소 노출 원칙

**GPT 제안**:
- 주소/전화 기본 제외 또는 마스킹
- 최소 노출: `order_number`, `order_date`, `total_price`, `status`, `items`, `shipments`

**계획표 확인**:
- `SYSTEM_FLOW_DETAILED.md` 307줄: "배송지 정보" 포함 명시
- `COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md` 1170줄: "배송지 정보" 포함 명시

**검증 결과**: ⚠️ **계획표와 GPT 제안이 다름**
- 계획표: 배송지 정보 포함
- GPT: 배송지 정보 기본 제외 (보안 강화)

**권장 조치**: 
- **기본**: 배송지 정보 제외 (GPT 제안)
- **필요 시**: 마스킹 처리 (예: 주소 일부만, 전화번호 마스킹)

---

### 6. 엔드포인트 설계

**GPT 제안**:
1. `GET /api/guest/orders/session?token=...` (세션 발급)
2. `GET /api/guest/orders/:orderNumber` (주문 조회)

**계획표**:
- `GET /api/guest/orders/:orderId` (단일 엔드포인트)

**검증 결과**: ✅ **GPT의 2단 구성이 더 안전하고 명확합니다**

**권장 조치**: ✅ **GPT 제안대로 구현**

---

## 🔧 구현 체크리스트 (GPT 제안 반영)

### 필수 구현 사항

1. ✅ **세션 발급 엔드포인트**
   - `GET /api/guest/orders/session?token=...`
   - 토큰 검증 (`expires_at`, `revoked_at`, `orders.user_id IS NULL`)
   - httpOnly Cookie 설정 (옵션 A: 원본 토큰, 옵션 B: 세션 토큰)
   - 302 Redirect (`/guest/orders.html?order=ORD-...`)

2. ✅ **주문 조회 엔드포인트**
   - `GET /api/guest/orders/:orderNumber`
   - 쿠키 기반 세션 검증
   - 수평 권한상승 방지 (세션 order_number == 요청 order_number)
   - 최소 노출 데이터 반환

3. ✅ **Claim 후 차단**
   - `orders.user_id IS NOT NULL` → 410
   - `guest_order_access_tokens.revoked_at IS NOT NULL` → 410
   - `expires_at < NOW()` → 410

4. ✅ **보안 설정**
   - 쿠키: `Secure`, `SameSite=Lax`
   - 로깅: 토큰 원문 찍지 않기 (앞 6자만)
   - 주소/전화 기본 제외 또는 마스킹

---

## 📝 계획표 수정 사항

### COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md 수정 필요:
1. `GET /api/guest/orders/:orderId` → `GET /api/guest/orders/:orderNumber`
2. 2단 구성 명시 (세션 발급 + 주문 조회)
3. 배송지 정보 기본 제외 명시

### SYSTEM_FLOW_DETAILED.md 수정 필요:
1. `/guest/orders/:orderId` → `/guest/orders/:orderNumber`
2. 2단 구성 흐름 명시

---

## 🎯 최종 판단

### GPT 제안 평가

1. **order_number 사용**: ✅ **정확함** - 현재 시스템과 일치
2. **2단 구성**: ✅ **권장됨** - 보안 및 명확성 향상
3. **세션 토큰 교환**: ✅ **옵션 B 권장** (테스트 기간 옵션 A 허용)
4. **Claim 후 차단**: ✅ **정확함** - 현재 구현과 일치
5. **최소 노출 원칙**: ✅ **권장됨** - 보안 강화

### 보완 사항

1. **옵션 A vs B 결정**: 테스트 기간에는 옵션 A, 운영 전 옵션 B 전환
2. **배송지 정보 정책**: 기본 제외, 필요 시 마스킹
3. **계획표 업데이트**: order_number 기반으로 수정

---

## ✅ 결론

**GPT의 Phase 10 제안은 정확하고 현실적입니다.**

**주요 장점**:
- 현재 시스템(`order_number` 사용)과 일치
- 보안 강화 (2단 구성, 세션 토큰 교환)
- Claim 로직과 일관성 유지
- 최소 노출 원칙으로 보안 강화

**권장 조치**:
1. ✅ GPT 제안대로 구현 진행
2. ✅ 계획표를 `order_number` 기반으로 수정
3. ✅ 테스트 기간에는 옵션 A, 운영 전 옵션 B 전환
