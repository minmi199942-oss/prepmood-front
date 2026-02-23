# 보안·UX 리뷰 (Google AI Studio 결과) — 보관용

> 아래 내용은 외부 리뷰 결과를 **기록만** 해둔 문서입니다. **실행(수정 작업)은 하지 않습니다.**

---

## 1. 보안 점검 (Security Review)

### 1.1 인젝션 (Injection)

**SQL Injection: [안전함]**  
대부분의 데이터베이스 쿼리가 mysql2/promise의 execute 메서드와 ? 플레이스홀더를 사용하여 파라미터 바인딩을 수행하고 있습니다.  
예: backend/order-routes.js의 SELECT * FROM orders WHERE order_number = ?  
동적 쿼리 생성 부분(backend/utils/query-helpers.js의 buildInClause)도 파라미터 배열을 분리하여 처리하고 있어 안전합니다.

**XSS (Cross-Site Scripting): [Low]**  
- 현황: 프론트엔드(utils.js)에 escapeHtml 함수가 구현되어 있고, innerHTML을 사용하는 대부분의 구간(예: cart-script.js, admin-products.js)에서 데이터를 출력하기 전에 이 함수를 통과시키고 있습니다.  
- 잠재적 위험: admin-products.js 등에서 innerHTML 템플릿 리터럴을 과도하게 사용하고 있습니다. 개발자가 실수로 escapeHtml을 누락하면 바로 XSS로 이어질 수 있는 구조입니다.  
- 권장 수정: textContent를 주로 사용하거나, DOMPurify 같은 라이브러리를 도입하는 것이 안전합니다. 현재 구조를 유지한다면 코드 리뷰 시 escapeHtml 누락 여부를 철저히 확인해야 합니다.

### 1.2 인증/세션 (Auth & Session)

**JWT 저장 방식: [안전함]**  
backend/auth-middleware.js에서 setTokenCookie 함수를 통해 httpOnly: true, secure: true (프로덕션), sameSite: 'lax' 옵션으로 JWT를 쿠키에 저장하고 있습니다. 이는 XSS로 인한 토큰 탈취를 방지하는 모범 사례입니다.

**비로그인 접근 제어: [Medium]**  
- 위치: backend/stock-routes.js, backend/token-admin-routes.js  
- 요약: 관리자 API(requireAdmin)는 잘 보호되고 있으나, 일부 조회성 API나 비회원 주문 조회 로직(backend/order-routes.js)에서 guest_session_token 검증 로직이 복잡하여, 세션 만료/탈취 시나리오에 대한 엣지 케이스 테스트가 필요합니다.  
- 권장 수정: 비회원 세션 토큰(guest_order_sessions)의 엔트로피는 충분해 보이나(32바이트), 만료 시간(24시간) 외에 IP 바인딩 등을 추가하면 보안을 강화할 수 있습니다.

### 1.3 민감 정보 (Sensitive Data)

**환경 변수 및 키 관리: [Low]**  
- 위치: config.js  
- 요약: TOSS_CLIENT_KEY, RECAPTCHA_SITE_KEY가 클라이언트 측 코드에 노출되어 있습니다.  
- 판단: 이는 Client/Public Key이므로 노출되어도 되는 정보입니다. 단, TOSS_SECRET_KEY 등은 백엔드 .env에서 관리되고 있어 안전합니다.

**관리자 계정: [Medium]**  
- 위치: backend/auth-middleware.js -> isAdminEmail  
- 요약: 관리자 권한을 DB의 역할(Role) 컬럼이 아닌, 환경변수 ADMIN_EMAILS에 하드코딩된 이메일 목록과 문자열 비교로 처리하고 있습니다.  
- 권장 수정: 초기 단계에서는 무방하나, 운영자가 늘어나거나 변경될 때마다 서버를 재배포해야 하는 단점이 있습니다. users 테이블에 role 컬럼(ENUM: 'user', 'admin')을 추가하여 DB 기반으로 권한을 관리하는 것을 권장합니다.

### 1.4 CSRF · CORS

**CSRF: [안전함]**  
backend/csrf-middleware.js에서 Double-Submit Cookie 패턴을 구현하여 X-XSRF-TOKEN 헤더를 검증하고 있습니다. 모든 상태 변경 요청(POST, PUT, DELETE)에 미들웨어가 적용되어 있습니다.

**CORS: [Low]**  
backend/index.js에서 allowedOrigins를 통해 화이트리스트 기반으로 관리하고 있습니다. 로컬호스트 및 프로덕션 도메인만 허용하고 있어 적절합니다.

### 1.5 파일/경로 (File & Path)

**배포 웹훅: [High]**  
- 위치: backend/deploy-webhook.js  
- 요약: spawn('bash', ['-x', DEPLOY_SCRIPT]...)를 사용하여 쉘 스크립트를 실행합니다. GitHub 서명 검증(verifyWebhookSignature 로직은 있으나 해당 파일 내에서는 구현체가 보이지 않고 crypto로 직접 구현됨)이 제대로 이루어지지 않으면 RCE(Remote Code Execution) 취약점이 될 수 있습니다.  
- 권장 수정: deploy-webhook.js 내의 서명 검증 로직이 DEPLOY_WEBHOOK_SECRET 환경변수를 사용하여 엄격하게 이루어지는지 재확인해야 합니다. 코드는 구현되어 있으나, Secret 키 관리가 매우 중요합니다.

### 1.6 기타 (Rate Limit, Idempotency)

**Rate Limit: [안전함]**  
express-rate-limit을 사용하여 일반 API, 로그인, 이메일 발송 등 중요 엔드포인트에 대해 속도 제한을 걸어두었습니다.

**Idempotency (멱등성): [우수함]**  
주문 생성 등 중요 로직에 Idempotency-Key 헤더와 orders_idempotency 테이블을 사용하여 중복 결제/주문을 방지하는 로직이 구현되어 있습니다. 이는 이커머스에서 매우 중요한 부분입니다.

---

## 2. UI/UX 점검 (Luxury Brand Perspective)

이 서비스는 "Pre.pMood"라는 명품/럭셔리 브랜드를 지향하고 있습니다. 이에 맞춘 UI/UX 검토 결과입니다.

### 2.1 UI · 비주얼 (Visual Identity)

- **일관성**: Paperlogy 폰트와 흑백 위주의 절제된 컬러 팔레트를 사용하여 명품 브랜드 특유의 미니멀리즘을 잘 구현하고 있습니다. 특히 invoice-letter-design.html 등에서 보여주는 디지털 인보이스 디자인은 브랜드의 '기록(Record)'이라는 철학을 시각적으로 잘 전달합니다.
- **타이포그래피**: 웹 폰트 로딩 전략(header-loader.js)이 적용되어 있으나, 폰트 로딩 전 깜빡임(FOUT)이 발생할 수 있습니다. font-display: swap이 CSS에 적용되어 있는지 확인이 필요합니다.
- **이미지 퀄리티**: 현재 더미 이미지(/image/default.jpg) 처리 로직이 많습니다. 럭셔리 브랜드는 이미지가 생명입니다. 고해상도 이미지가 로딩되는 동안의 스켈레톤 UI나 블러 처리(Blur-up)가 부족하여 로딩 시 덜컹거리는 느낌을 줄 수 있습니다.

### 2.2 UX · 편의성 (User Experience)

**Alert/Confirm 사용: [Critical - UX 관점]**  
- 위치: cart-script.js, buy-script.js 등 전반적인 프론트엔드 로직.  
- 문제점: "장바구니에 추가되었습니다.", "로그인이 필요합니다." 등의 메시지를 브라우저 기본 alert() 창으로 띄우고 있습니다. 이는 사이트의 고급스러움을 심각하게 해칩니다.  
- 권장 수정: 브랜드 톤앤매너에 맞는 **커스텀 모달(Modal)**이나 우측 상단/하단에서 부드럽게 나타나는 토스트(Toast) 메시지로 전면 교체해야 합니다.

**결제 흐름**: 토스페이먼츠 연동 로직(checkout-payment.js)은 깔끔하게 구현되어 있으나, 결제 실패 시 리다이렉트 처리 후 사용자에게 보여지는 에러 메시지가 구체적이어야 합니다. 현재는 "결제에 실패했습니다" 정도로 단순화될 가능성이 있습니다.

### 2.3 신뢰 · 프리미엄 체감 (Trust & Premium)

- **One Unit One Record**: one-unit-one-record.html과 같은 철학 페이지는 매우 훌륭합니다. 이 가치를 구매 과정에서도 지속적으로 노출해야 합니다. (예: 장바구니나 결제 대기 화면에서 "당신만의 고유 시리얼 넘버가 생성되는 중입니다"와 같은 마이크로카피 사용).
- **정품 인증 경험**: QR 코드 스캔 후 연결되는 authenticity.html의 경험이 중요합니다. 모바일에서 카메라 권한 요청 시 UX가 매끄러워야 하며, 인증 성공 시 나타나는 애니메이션이나 비주얼 피드백이 더 화려하고 고급스러울 필요가 있습니다. (현재는 다소 정적인 HTML 렌더링으로 보입니다).

---

## 3. 우선 조치 제안 (Action Plan)

### 보안 최우선 조치

1. **배포 웹훅 보안 검증**: backend/deploy-webhook.js가 외부에서 무작위로 호출되지 않도록 방화벽(GitHub IP 대역만 허용) 또는 Secret 검증 로직이 정상 작동하는지 테스트하십시오.
2. **관리자 권한 하드코딩 제거**: 장기적으로 ADMIN_EMAILS 환경변수 의존도를 낮추고 DB 기반 RBAC(Role-Based Access Control)로 전환하십시오.

### UX/UI 최우선 조치 (Luxury Brand 강화)

1. **alert() / confirm() 제거**: 모든 alert을 커스텀 UI(Toast, Modal)로 교체하십시오. 이것만으로도 사이트의 품격이 크게 올라갑니다.
2. **로딩 경험 개선**: 데이터가 로딩되는 동안 흰 화면이나 텍스트가 툭 튀어나오는 것 대신, 브랜드 로고가 은은하게 맥동(Pulse)하는 로더나 스켈레톤 스크린을 적용하십시오.
3. **마이크로 인터랙션 추가**: 버튼 호버, 클릭, 페이지 전환 시 부드러운 transition과 animation을 CSS에 추가하여 고급스러운 조작감을 제공하십시오.

---

> 이 코드는 기능적으로는 이커머스의 핵심(결제, 재고, 인증)을 잘 구현하고 있으며, 보안적으로도 기본기가 탄탄한 편입니다. **UX의 디테일(특히 알림창 처리)**만 보강한다면 훌륭한 럭셔리 브랜드 커머스 사이트가 될 것입니다.

---

## 검증 및 판단 (코드베이스 대조 결과)

- **실행은 하지 않음** — 위 권장 사항은 참고용으로만 보관.

### 보안 관련

| 항목 | 판단 | 비고 |
|------|------|------|
| SQL Injection | **정확함** | `execute` + `?` 및 `buildInClause` 파라미터 분리 확인됨. |
| XSS / escapeHtml | **정확함** | utils.js·다수 스크립트에서 escapeHtml 사용. innerHTML 다수 사용으로 누락 시 위험 있다는 지적 타당. |
| JWT httpOnly/secure/sameSite | **정확함** | auth-middleware.js에 httpOnly: true, secure: isSecure, sameSite: 'lax' 확인. |
| ADMIN_EMAILS / isAdminEmail | **정확함** | auth-middleware.js, index.js에서 환경변수 기반 관리자 판별 확인. |
| CSRF | **정확함** | csrf-middleware.js Double-Submit Cookie 패턴 적용됨. |
| **배포 웹훅 [High]** | **과장됨** | deploy-webhook.js **내부에** 서명 검증이 구현되어 있음: `x-hub-signature-256` 수신, `crypto.createHmac('sha256', secret)`, payload로 digest 계산 후 비교. Secret 미설정/서명 없음/불일치 시 401 반환. 따라서 "구현체가 보이지 않는다"는 repomix 추출 범위 또는 리뷰어 오독 가능성 있음. **실제로는 안전한 구현.** |
| Rate Limit | **정확함** | express-rate-limit 사용(apiLimiter, authLimiter 등) 확인. |
| Idempotency | **정확함** | 주문 생성 시 Idempotency-Key·orders_idempotency 사용하는 설계와 일치. |

### UX 관련

| 항목 | 판단 | 비고 |
|------|------|------|
| alert/confirm 과다 사용 | **정확함** | cart-script, buy-script, mini-cart, checkout, my-profile, guest/orders 등 전반에서 alert/confirm 다수 사용 확인. |
| Toast/Modal 권장 | **타당함** | 명품 사이트 톤에는 기본 alert보다 커스텀 UI가 적합하다는 의견 일치. |
| 로딩·스켈레톤·마이크로 인터랙션 | **타당함** | 개선 시 체감 품질 향상에 도움 됨. |

### 종합

- **대부분의 진단은 코드와 일치하고, 권장 사항도 타당함.**  
- **예외:** 배포 웹훅은 "구현체가 보이지 않는다"는 부분은 **잘못된 인상**이며, 실제 코드에는 HMAC-SHA256 서명 검증이 구현되어 있어 High로 분류할 근거는 약함.  
- 문서는 **참고용 보관**만 하며, 수정 작업은 별도 결정 후 진행.

---

## 4. 추가 보완사항 (한 단계 업 — Google AI Studio 후속 답변)

현재 구축된 시스템은 **기능적 요구사항(결제, 재고, 인증)**과 **기본적인 보안(CSRF, SQLi 방지)**을 충실히 이행하고 있습니다. 하지만 "지속 가능한 운영", "대규모 트래픽 대비", 그리고 **"진정한 럭셔리 브랜드의 기술적 완성도"**를 위해 한 단계 더 나아갈 수 있는 개선점들입니다.

### 4.1 아키텍처 및 코드 품질 (Architecture & Code Quality)

현재 코드는 Controller와 Service 로직이 라우트 파일(*-routes.js) 하나에 섞여 있는 구조입니다. 프로젝트가 커지면 유지보수가 어려워집니다.

**계층 분리 (Layered Architecture) 도입**
- **현재**: 라우터 파일 안에서 DB 쿼리, 비즈니스 로직, 응답 처리를 모두 수행.
- **제안**: Controller(요청/응답·유효성 검사) / Service(비즈니스 로직) / Repository(DAO, SQL 전담).  
  효과: "재고 차감 로직이 변경되면?" → Service만 수정하면 됨. 코드 재사용성 증가.

**중앙 집중식 에러 처리 (Centralized Error Handling)**
- **현재**: 각 라우트마다 try-catch 후 res.status(500).json(...) 반복.
- **제안**: next(error)로 에러를 넘기고, app.use((err, req, res, next) => { ... }) 미들웨어에서 로그 기록 및 표준화된 에러 응답(Slack/Discord 알림 연동 등) 처리.

### 4.2 심화 보안 (Advanced Security)

**CSP (Content Security Policy) 적용**
- **현재**: helmet({ contentSecurityPolicy: false })로 비활성화 상태.
- **제안**: 스크립트 소스(Toss, Google 등)를 화이트리스트로 관리하는 CSP를 설정. XSS 공격을 원천 차단하는 강력한 수단.

**비즈니스 로직 기반 Rate Limiting**
- **현재**: API 호출 횟수 제한 (IP/User 기준).
- **제안**: 결제 실패 연속 5회 시 해당 계정/IP 30분 차단 (Card Stuffing 방지). QR 코드 조회가 비정상적으로 빠르면(스크래핑 의심) 차단.

**관리자 감사 로그 (Audit Logging)**
- **현재**: 주요 액션에 Logger.log 사용.
- **제안**: admin_audit_logs 테이블을 만들고 누가(Admin ID), 언제, 무엇을(Before/After) 변경했는지 DB에 영구 기록. (보증서 상태 변경, 재고 강제 수정 시 필수)

### 4.3 데이터 무결성 및 동시성 (Data Integrity & Concurrency)

**낙관적 락 (Optimistic Locking) 검토**
- **현재**: FOR UPDATE(비관적 락)로 동시성 제어. 트래픽 집중 시 DB 병목·데드락 원인이 될 수 있음.
- **제안**: 재고 테이블에 version 컬럼 추가, 업데이트 시 WHERE version = ? 조건으로 낙관적 락 혼용 시 성능 개선 가능.

**데이터 스냅샷 강화**
- **제안**: warranties 발급 시점의 약관·정책 버전을 스냅샷으로 저장해 두면 향후 법적 분쟁 시 유리.

### 4.4 인프라 및 배포 (DevOps)

**Secret 관리 강화**
- **현재**: .env 파일 사용.
- **제안**: AWS Parameter Store, HashiCorp Vault 등 비밀 관리 도구 사용 또는 프로덕션에서 환경 변수 암호화 관리.

**무중단 배포 (Zero Downtime Deployment)**
- **현재**: deploy-webhook이 쉘 스크립트 실행 시 서버가 잠시 멈출 수 있음.
- **제안**: PM2의 reload 활용 또는 Docker + Blue/Green 배포로 배포 중 끊김 최소화.

### 4.5 럭셔리 브랜드 특화 기능 (Luxury Experience)

**디지털 인장 (Digital Signature)**  
서버 Private Key로 보증서 데이터를 암호화 서명하여 QR 데이터에 포함. DB 변조 시에도 서명 불일치로 가품/위변조를 수학적으로 증명 가능.

**소유권 이력 시각화 (Provenance)**  
authenticity.html·마이페이지에서 제품 여정(생산 → 검수 → 1차 구매 → 양도 → 현재 소유자)을 타임라인 UI로 표시. "이 제품의 역사는 깨끗하다"를 시각적으로 전달.

**QR 코드 동적 보안 (선택)**  
물리 태그(NFC) 도입 시, 스캔마다 URL이 바뀌는 Rolling Code 칩으로 물리적 복제 원천 차단 검토.

### 4.6 프론트엔드 성능 및 접근성

**이미지 최적화**: WebP/AVIF 서빙, loading="lazy" 또는 Intersection Observer로 지연 로딩.  
**접근성(a11y)**: 이미지 alt, 폼 aria-label 명확화. "모든 사람에게 열려 있는 명품" 이미지 강화.

### 4.7 다음 단계 추천 (우선순위)

1. **UX**: alert() 제거 및 커스텀 모달 적용 (브랜드 이미지 직결)
2. **보안**: 관리자 감사 로그(Audit Log) 구축 (내부 통제)
3. **아키텍처**: 라우터에서 비즈니스 로직 분리 (유지보수성)

---

## 추가 보완사항 — 검증 및 판단

- **실행은 하지 않음.** 참고용 보관.

### 잘 맞는 부분

| 항목 | 의견 |
|------|------|
| 계층 분리 (Controller/Service/Repository) | 라우트에 다 들어 있는 현재 구조 기준 타당. 규모 커질 때 단계적 도입 가능. |
| 중앙 에러 처리 (next → error 미들웨어) | Express 권장 패턴. 로그/알림 일원화에 유리. |
| CSP 적용 | XSS 완화에 유효. 스크립트/도메인 화이트리스트 설정 권장. |
| 비즈니스별 Rate Limit | 결제 실패 N회 차단, QR 과다 조회 제한 등 심화 보안으로 의미 있음. |
| 관리자 감사 로그 | 보증서/재고 변경 이력 DB 영구 저장은 운영·내부 통제에 실질적 도움. |
| Secret 관리 (Vault 등) | 프로덕션·팀 확대 시 고려. 당장 필수는 아님. |
| 무중단 배포 (PM2 reload 등) | restart 대신 reload로 끊김 감소. 배포 방식에 따라 적용 가치 있음. |
| 디지털 서명(보증서 payload) | DB 변조 시 서명 불일치로 위변조 증명 가능. 구현 난이도·우선순위만 별도 판단. |
| Provenance 타임라인 UI | 정품/이력 스토리 노출은 럭셔리 브랜드와 잘 맞는 제안. |
| 이미지 WebP·lazy, a11y | 일반적인 품질 개선. 타당. |

### 맥락 보면서 볼 부분

| 항목 | 보완 의견 |
|------|-----------|
| 낙관적 락 vs FOR UPDATE | FOR UPDATE가 항상 병목/데드락 원인은 아님. 동시 갱신 빈도에 따라 다름. 충돌 적으면 현 구조 유지, 트래픽·동시 결제 증가 시 version + 낙관적 락 검토. |
| QR Rolling Code / NFC | "물리 태그 도입 시 고려" 수준의 선택 사항. 하드웨어 정책 정해질 때 검토해도 됨. |

### 종합

- **이상한 말 없음.** 아키텍처·보안·인프라·럭셔리 기능까지 "한 단계 업" 제안으로 잘 정리됨.
- **우선순위(UX 알림 → 감사 로그 → 비즈니스 로직 분리)**도 현실적.
- **전부 당장 할 필요는 없음.** 단기(alert 제거, PM2 reload) → 중기(감사 로그, CSP, 비즈니스 Rate Limit) → 장기(계층 분리, Vault, 디지털 서명·Provenance UI) 순으로 단계적 도입 권장.
