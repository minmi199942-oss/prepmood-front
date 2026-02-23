# 보증서·QR 관련 코드 점검 결과

**점검일**: 코드 기준 전체 흐름 및 파일 단위 검토.

---

## 1. 전체 흐름 (코드 기준)

### 1-1. 토큰 생성 (관리자)

| 단계 | 파일 | 내용 |
|------|------|------|
| 요청 | `admin-qhf25za8/tokens.html` → `admin-tokens.js` | 상품·옵션(사이즈/색상)·개수 선택 후 "토큰 생성" 클릭 |
| API | `token-admin-routes.js` | `POST /api/admin/tokens` (또는 `POST /admin/tokens` — index에서 prefix 확인 필요) |
| DB | `token_master` INSERT | `token`(20자 랜덤), `internal_code`(8~10자 랜덤), `product_name`, `serial_number`, `warranty_bottom_code`, `rot_code` 등 옵션/시퀀스에서 채움. **QR PNG 생성 없음.** |

- **경로**: `backend/token-admin-routes.js` 86~251행.  
- **특징**: commit 후 바로 응답. `output_qrcodes/{internal_code}.png` 생성 로직 없음.

---

### 1-2. QR 이미지 생성 (현재 유일 경로)

| 단계 | 파일 | 내용 |
|------|------|------|
| 실행 | CLI | `node backend/generate-qr-codes.js` [preset] |
| DB | `token_master` | `SELECT token, internal_code, product_name` 전건 조회 |
| 설정 | `backend/qr-config.json` | `default` 또는 인자로 준 preset (width, margin, errorCorrectionLevel, color) |
| 출력 | `output_qrcodes/{internal_code}.png` | URL = `AUTH_BASE_URL` + token (예: `https://prepmood.kr/a/` + token) |

- **경로**: `backend/generate-qr-codes.js` 35행(OUTPUT_DIR), 36행(BASE_URL), 111~116행(SELECT), 126~129행(URL/파일명), 139~149행(QRCode.toFile).  
- **의존성**: `process.env.AUTH_BASE_URL`, `process.env.DB_*`, `qr-config.json`.  
- **배포**: `deploy.sh` 309~319행에서 배포 시 `node generate-qr-codes.js` 실행 (실패해도 배포는 계속).

---

### 1-3. QR 다운로드 (관리자)

| 구분 | 경로 | 파일 | 동작 |
|------|------|------|------|
| ZIP | `GET /api/admin/qrcodes/download` | `qrcode-download-routes.js` 45~164행 | `output_qrcodes/` 하위 `.png` 전부 읽어서 ZIP. 내부 파일명: DB에서 `internal_code`별로 `serial_number` → `product_name` → `internal_code` 순으로 결정. |
| 단일 | `GET /api/admin/qrcode/download?public_id=xxx` | 동일 218~314행 | `warranties` + `token_master` 조인으로 해당 보증서의 `internal_code` 조회 후 `output_qrcodes/{internal_code}.png` 서빙. 없으면 404. |

- **QR_CODES_DIR**: `path.join(__dirname, '..', 'output_qrcodes')` (28행) = 프로젝트 루트의 `output_qrcodes`.  
- **ZIP 시 디스크에 있지만 DB에 없는 internal_code**: `nameByInternalCode[internalCode]` 없음 → `internalCode` 그대로 파일명으로 사용 (134행 부근).

---

### 1-4. QR 스캔 → 정품/보증서 (사용자)

| 단계 | 파일 | 내용 |
|------|------|------|
| 진입 | `GET /a/:token` | `auth-routes.js` 182행~ |
| 미들웨어 | `auth-middleware.js` | `requireAuthForHTML`: 토큰 형식 `[a-zA-Z0-9]{20}` 아니면 fake. **로그인 없으면** `login.html?returnTo=/a/...` 리다이렉트. |
| DB 조회 | `auth-routes.js` | `token_master` WHERE token = ? (206~210행). 없으면 **가품**(fake). `is_blocked === 1`이면 **가품**(227~231행). |
| 보증서 조회 | `auth-routes.js` | `warranties` WHERE token_pk = ? (244~250행). 없으면 "보증서 없음" error 템플릿(266~271행). revoked면 "보증서 무효" (284~316행). |
| 성공 시 | `auth-routes.js` | token_master 스캔 카운트/ first_scanned_at 갱신, scan_logs INSERT, **첫 스캔이면 success.ejs, 재스캔이면 warning.ejs** (376~401행). |

- **정품 인증 판단**: 모두 **MySQL** `token_master` / `warranties` 기준. SQLite 사용하지 않음.

---

### 1-5. 보증서 생성 (결제 후)

- **processPaidOrder** (paid-order-processor 등): 결제 이벤트 처리 시 `order_item_units` 생성, 이어서 `warranties` INSERT (token_pk당 1건, UNIQUE(token_pk) 설계).  
- QR 스캔 시에는 이 **warranties**만 조회하며, 스캔 시점에 warranty가 없으면 "보증서가 아직 발급되지 않았습니다" 메시지.

---

## 2. 파일별 요약

| 파일 | 역할 | 비고 |
|------|------|------|
| `backend/generate-qr-codes.js` | token_master 전건 조회 후 QR PNG 일괄 생성. 출력 디렉터리·BASE_URL·qr-config 읽기. | 단일 토큰용 QR 생성/공용 유틸 없음. |
| `backend/qr-config.json` | default / samples 프리셋 (width, margin, errorCorrectionLevel, color). | generate-qr-codes.js가 default 사용. |
| `backend/qrcode-download-routes.js` | ZIP 다운로드, 단일(public_id) 다운로드, **토큰 무효화 API**. | revokeToken은 auth-db(SQLite) 호출 → 아래 이슈. |
| `backend/token-admin-routes.js` | 관리자 토큰 생성. product_options 기반 INSERT. | QR 생성 호출 없음. |
| `backend/auth-routes.js` | GET /a/:token (정품/보증서), POST /a/:token (보증서 JSON), 보증서 목록/상세. | 전부 MySQL. |
| `backend/auth-middleware.js` | requireAuthForHTML: /a/:token 형식 검사 + JWT 검사, 미로그인 시 login으로 returnTo. | |
| `backend/auth-db.js` | SQLite (prep.db) products 테이블: getProductByToken, updateFirstVerification, updateReVerification, **revokeToken**. | 정품 인증 라우트는 MySQL만 사용. revoke만 SQLite. |
| `backend/index.js` | `/qrcodes` 정적은 NODE_ENV !== 'production'일 때만. authRoutes, qrcodeDownloadRoutes, tokenAdminRoutes 마운트. **initDatabase()**로 SQLite 초기화. | |

---

## 3. 발견된 이슈 및 불일치

### 3-1. 토큰 무효화(revoke)가 MySQL과 연동되지 않음

- **현재**: `POST /api/admin/auth/revoke` (qrcode-download-routes.js 318~364행)에서 `auth-db.revokeToken(token)` 호출.  
- **auth-db.revokeToken** (auth-db.js 201~226행): **SQLite** `products` 테이블의 `status = 3`으로만 업데이트.  
- **스캔 시**: auth-routes.js는 **MySQL** `token_master.is_blocked`만 검사. SQLite를 보지 않음.  
- **결과**: 관리자에서 "토큰 무효화"를 눌러도 **스캔 시 가품 처리되지 않음**. MySQL `token_master.is_blocked`를 1로 바꾸는 로직이 없음.

**권장**:  
- 관리자 revoke 시 **MySQL** `token_master`의 `is_blocked = 1`, `updated_at = NOW()` 로 업데이트하도록 변경.  
- 필요하면 auth-db의 revokeToken은 레거시로 두고, qrcode-download-routes(또는 전용 라우트)에서 MySQL 업데이트만 하거나, revokeToken을 MySQL용으로 교체.

---

### 3-2. 관리자 토큰 생성 후 QR PNG 미생성

- 관리자에서 토큰만 만들면 `token_master`에만 들어가고, `output_qrcodes/{internal_code}.png`는 생성되지 않음.  
- 그래서 "QR 코드 다운로드"에 새 토큰이 포함되려면 **서버에서 `node generate-qr-codes.js` 전량 실행**이 필요함.  
- 문서(TOKEN_PRODUCT_STOCK_CURRENT_FLOW.md)의 개선 방향대로, **토큰 생성 성공 후 해당 토큰만 QR 생성하는 공용 유틸 + 호출**이 필요함.

---

### 3-3. 디스크와 DB 불일치 시 스캔 결과

- QR PNG는 **과거/다른 환경**에서 만들어진 경우, 그 안의 **token**이 현재 서버 **token_master**에 없을 수 있음.  
- 그러면 같은 서버에서 "QR 다운로드"로 받은 파일이라도, 스캔 시 **가품**으로 나옴.  
- 대응: 배포 시 `generate-qr-codes.js` 실행(deploy.sh에 있음)으로 **서버 DB 기준** PNG 재생성. 또는 토큰 추가 시 해당 토큰만 QR 생성하는 흐름 도입.

---

### 3-4. ZIP 내부 파일명 — 디스크에만 있는 PNG

- 디스크에는 `xxx.png`가 있는데 `token_master`에 해당 `internal_code`가 없으면, ZIP 시 `nameByInternalCode[internalCode]`가 없어서 **internal_code 그대로** 파일명으로 사용됨 (134행).  
- 의도된 동작이며, DB에 없는 구 PNG는 internal_code 이름으로 들어감.

---

### 3-5. 단일 다운로드(public_id) — warranty 필수

- `GET /api/admin/qrcode/download?public_id=xxx`는 **warranties**에 해당 public_id가 있어야 하고, 그 보증서의 token_master.internal_code로 PNG 경로를 찾음.  
- 아직 결제/보증서가 없는 토큰은 **단일 다운로드(public_id)로는 제공 불가**. ZIP 다운로드로만 포함 가능(해당 internal_code.png가 디스크에 있을 때).

---

## 4. 배포·경로 일치 여부

- **generate-qr-codes.js** OUTPUT_DIR: `path.join(__dirname, '..', 'output_qrcodes')` → 스크립트가 `backend/`에서 실행되면 **프로젝트 루트/output_qrcodes**.  
- **qrcode-download-routes.js** QR_CODES_DIR: 동일.  
- **index.js** 정적: `path.join(__dirname, '..', 'output_qrcodes')` (production이 아닐 때만).  
- **deploy.sh**: `LIVE_BACKEND`에서 `node generate-qr-codes.js` 실행 → 서버에서는 `/var/www/html/output_qrcodes`에 PNG 생성.  
- **배포 시 output_qrcodes 폴더 동기화**: deploy에는 **output_qrcodes를 repo에서 복사하는 단계 없음**. 서버에 있는 PNG는 전부 **서버에서 실행한 generate-qr-codes.js** 결과만 있음. (repo에 output_qrcodes를 넣고 동기화하는 구조가 아님.)

---

## 5. 정리

| 항목 | 상태 |
|------|------|
| 토큰 생성 (관리자) | ✅ 구현됨. QR 생성 없음. |
| QR 일괄 생성 | ✅ generate-qr-codes.js. 배포 시 실행됨. |
| QR ZIP/단일 다운로드 | ✅ 구현됨. 파일명 정책(serial_number > product_name > internal_code) 반영됨. |
| 스캔 → token_master/warranties | ✅ MySQL 기준. 로그인 필수, token 없음/차단 시 가품, warranty 없음/revoked 시 에러 메시지. |
| 토큰 무효화(revoke) | ❌ SQLite만 갱신. MySQL token_master.is_blocked 미반영 → 스캔 시 반영 안 됨. |
| 토큰 추가 시 QR 1장 생성 | ❌ 미구현. 문서 개선안대로 공용 유틸 + 토큰 생성 후 호출 필요. |

원하는 방향(관리자에서 토큰 생성 → 해당 QR만 편하게 생성)으로 가려면,  
1) **토큰 무효화를 MySQL `token_master.is_blocked`에 연동**하고,  
2) **단일 QR 생성 유틸 + 토큰 생성 API 이후 호출**을 추가하면 됨.

---

## 6. 오류·중복·보완·보안·효율 정리

### 6-1. 오류 / 동작 버그

| 구분 | 내용 | 조치 |
|------|------|------|
| **Revoke 미반영** | `POST /api/admin/auth/revoke`가 SQLite만 갱신. 스캔은 MySQL `token_master.is_blocked`만 봄. | Revoke 시 MySQL `token_master`에 `is_blocked=1`, `updated_at=NOW()` 반영. |
| **auth-routes에서 revokeToken import** | auth-routes.js가 auth-db의 revokeToken을 import만 하고 사용처 없음. | 사용하지 않으면 import 제거. Revoke는 qrcode-download-routes에서만 호출. |
| **initDatabase() 서버 기동 시** | index.js에서 `initDatabase()`로 SQLite(prep.db) 초기화. 정품 인증은 MySQL만 사용하므로 불필요한 DB 생성. | 레거시 제거 시 initDatabase 호출 제거 검토. 또는 revoke를 MySQL로 옮긴 뒤 SQLite 의존 제거. |

---

### 6-2. 중복 / 불일치

| 구분 | 내용 | 조치 |
|------|------|------|
| **이중 DB (SQLite + MySQL)** | 정품 인증·스캔은 MySQL. revoke·auth-db는 SQLite. 같은 “토큰”을 두 저장소가 가짐. | Revoke를 MySQL로 통일하고, auth-db SQLite는 단계적으로 제거 또는 “레거시 전용”으로 명시. |
| **DB 설정 중복** | qrcode-download-routes에서 ZIP/단일 처리 시마다 dbConfig 객체를 새로 정의. generate-qr-codes.js도 별도 dbConfig. | 공용 dbConfig 모듈(예: config.js 또는 backend/utils/db.js)로 통일하면 유지보수·환경 일치에 유리. |
| **QR 생성 로직 단일화 없음** | QR PNG 생성은 generate-qr-codes.js 안에만 있음. 토큰 생성 API에서 “한 장만” 만들 수 없음. | 단일 QR 생성 공용 유틸 도입 후, CLI와 토큰 생성 API에서 공통 사용. |

---

### 6-3. 보안

| 구분 | 내용 | 조치 |
|------|------|------|
| **returnTo(Open Redirect)** | 로그인 리다이렉트 시 returnTo는 화이트리스트(validateReturnTo)로 검증 후 사용됨. 로그인 POST에서만 검증. | 유지. (QR 스캔 → 로그인 시 returnTo는 서버가 세팅한 req.originalUrl이라 위험 낮음.) |
| **토큰 형식** | `/a/:token`은 `[a-zA-Z0-9]{20}`만 허용. 그 외는 가품 페이지. | 유지. |
| **관리자 전용** | ZIP/단일 다운로드·revoke는 authenticateToken + requireAdmin. | 유지. |
| **Rate limit** | authLimiter(15분 50회), adminDownloadLimiter(15분 10회). | 유지. 필요 시 IP/계정별 세분화 검토. |
| **ZIP IN 절** | `internal_code IN (${placeholders})`에 쓰는 값은 디스크 파일명(서버 제어). placeholder + 배열로 바인딩. | SQL 인젝션 위험 낮음. 유지. |
| **public_id** | 단일 다운로드 시 `[a-zA-Z0-9-_]{1,64}` 검증. | 유지. |
| **로그 노출** | Logger에 token 앞뒤 4자만 노출. | 유지. |
| **JWT** | 쿠키 기반, requireAuthForHTML에서 검증. | 프로젝트 보안 규칙 유지. |

---

### 6-4. 보완할 점

| 구분 | 내용 | 조치 |
|------|------|------|
| **토큰 생성 후 QR** | 관리자에서 토큰만 생성하면 PNG 없음. | 단일 QR 생성 유틸 + 토큰 생성 API 성공 후 해당 토큰만 PNG 생성. |
| **Revoke 연동** | 관리자 revoke가 스캔 결과에 반영되지 않음. | MySQL `token_master.is_blocked` 업데이트 추가. |
| **디스크·DB 불일치** | 예전/다른 환경에서 만든 PNG는 스캔 시 가품 가능. | 배포 시 generate-qr-codes.js 실행 유지 또는 “토큰 추가 시 QR 1장 생성”으로 서버 기준 유지. |
| **단일 다운로드 전제** | public_id → warranty 필수. 결제 전 토큰은 단일 다운로드 불가. | 기획 유지 시 문서화. 또는 “internal_code 기반 단일 다운로드” API 추가 검토. |
| **에러 시 connection** | ZIP 처리 중 예외 시 connection.end() in catch. | 이미 try/catch/finally에서 처리됨. 유지. |

---

### 6-5. 효율 / 개선

| 구분 | 내용 | 조치 |
|------|------|------|
| **ZIP 대량 파일** | PNG 수백~수천 개일 때 readdirSync + 전부 archive.file 시 메모리·시간 증가. | 필요 시 스트리밍 유지하면서 배치 크기 제한 또는 “최근 N개/옵션” 등 제한 검토. |
| **QR 일괄 재생성** | 배포마다 전량 생성. 토큰 수 많으면 배포 시간 증가. | 토큰 추가 시 “해당 토큰만” 생성 도입 시, 배포에서는 “변경분만” 또는 “스킵” 옵션 검토. |
| **공용 유틸** | loadQRConfig + toFile 로직이 generate-qr-codes.js에만 있음. | `utils/qr-generator.js` 등으로 분리해 CLI·API·재생성 API에서 공통 사용. |
| **scan_logs 실패** | INSERT 실패해도 페이지는 성공 응답. | 의도된 동작. 로그만 유지. |

---

### 6-6. 요약 (우선순위)

| 우선순위 | 항목 | 유형 |
|----------|------|------|
| **높음** | Revoke 시 MySQL `token_master.is_blocked` 반영 | 오류/기능 |
| **높음** | 토큰 생성 후 해당 토큰 QR 1장 생성 (공용 유틸 + API 연동) | 보완/효율 |
| **중간** | auth-db SQLite와 revoke 의존 제거(MySQL로 통일 후) | 중복/정리 |
| **중간** | DB 설정·QR 생성 로직 공용 모듈화 | 중복/효율 |
| **낮음** | ZIP 대량 시 옵션/제한, 배포 시 QR 재생성 전략 | 효율 |
| **참고** | returnTo·토큰 형식·관리자 인증·Rate limit | 보안 유지 |
