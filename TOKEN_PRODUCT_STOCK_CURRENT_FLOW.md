# 토큰·상품·재고·QR 현재 흐름 및 개선 방향

**작성 목적**: 새 상품/토큰/재고 추가 경로(xlsx vs 관리자 vs SQL)와, 토큰 추가 후 QR 코드 생성/개선 방안을 한 문서에 정리합니다.  
**Part I·II**: 현재 방식과 QR 개선 방향. **Part III**: SSOT 정리 + 외부(GPT) 의견 검토 + 할 일 결정(이 문서 하나로 통합).

---

## Part I. 토큰·상품·재고 현재 진행 방식

### 1. 현재 흐름 요약

| 단계 | 대상 | 방법 | 기존 데이터 영향 |
|------|------|------|------------------|
| 1. 토큰 | `token_master` | **관리자 토큰 생성** 또는 xlsx 초기화 또는 SQL 수동 | **관리자/SQL: 기존 유지.** init만 기존 전부 삭제 |
| 2. 상품 | `admin_products` | 관리자 페이지 UI | 기존 상품 유지, 추가만 됨 |
| 3. 재고 | `stock_units` | 관리자 페이지 UI (token_pk 선택) | 기존 재고 유지, 추가만 됨 |

**관리자 토큰 생성**: 상품·옵션(사이즈/색상) 선택 후 "토큰 N개 생성" → **기존 token_master는 건드리지 않고 INSERT만** 함. (아래 §2-5 참고)  
**문제( xlsx 경로 )**: xlsx + init을 쓰면 **기존 token_master를 전부 지운 뒤** xlsx만 넣기 때문에 기존 토큰이 초기화됩니다. 새 토큰만 넣고 싶으면 **관리자 토큰 생성** 또는 SQL 수동을 쓰면 됨.

---

### 2. 토큰 (`token_master`) — 현재 방식

#### 2-1. init-token-master-from-xlsx.js (초기화)

- **역할**: `products.xlsx` 읽기 → **`DELETE FROM token_master`** → xlsx 행만 INSERT.
- **경로**: `backend/init-token-master-from-xlsx.js`.
- **결과**:
  - 기존 토큰 **전부 삭제**.
  - xlsx에 있는 행만 새 토큰으로 들어감.
- **용도**: 최초 세팅 또는 "xlsx가 곧 전체 토큰 목록"인 경우에만 사용.  
  **새 상품만 추가할 때 쓰면 기존 토큰이 모두 사라짐.**

```javascript
// 166-175줄 부근
if (existingCount > 0) {
    await connection.execute('DELETE FROM token_master');
    // ...
}
// 이후 xlsx 행만 INSERT
```

#### 2-2. update-token-master-from-xlsx.js (업데이트만)

- **역할**: xlsx 읽기 → `product_name`(admin_products.short_name)으로 매칭 → **기존 행만 UPDATE** (serial_number, rot_code, warranty_bottom_code 등).
- **경로**: `backend/update-token-master-from-xlsx.js`.
- **결과**:
  - 기존 토큰 유지.
  - **새 행 INSERT 없음.** xlsx에 새 상품을 추가해도 **새 토큰이 생기지 않음**.

즉, "기존 토큰은 건드리지 않고, xlsx에 있는 **새 상품에 대한 새 토큰**만 추가"하는 스크립트는 **현재 없음**.

#### 2-3. reset-token-master.js

- **역할**: `warranties`가 비어 있을 때만 `DELETE FROM token_master` 수행 (xlsx 사용 안 함).
- **용도**: 테이블 비우기 전용. 새 상품/토큰 추가 흐름과는 별개.

#### 2-4. VPS_TOKEN_MASTER_FULL_INIT.sh

- **역할**: `stock_units` 삭제 → FK 제거 → **init-token-master-from-xlsx.js** 실행 → FK 복원.
- **결과**: init과 동일하게 **기존 token_master 전부 삭제 후 xlsx 기준으로만 재생성**.  
  새 상품만 넣고 싶을 때 쓰면 역시 기존 토큰 초기화 문제가 그대로 발생.

#### 2-5. 관리자 토큰 생성 (POST /api/admin/tokens) ✅

- **역할**: **상품·옵션(사이즈/색상) 기준으로** 토큰 N개를 **INSERT만** 수행. 기존 token_master 행은 삭제/수정하지 않음.
- **경로**: API `backend/token-admin-routes.js` (POST `/api/admin/tokens`), UI `admin-qhf25za8/tokens.html` → "토큰 생성" 버튼.
- **입력**: `product_id`, `size`, `color`, `count`(1~100). 해당 조합의 `product_options` 행이 있어야 하고, 옵션 메타(rot_code, warranty_bottom_prefix, serial_prefix 등)가 채워져 있어야 함.
- **결과**:
  - **기존 토큰 유지.** 새 행만 INSERT.
  - product_name, serial_number, warranty_bottom_code, rot_code 등은 옵션/시퀀스에서 자동 채움.
- **용도**: **기존 토큰 초기화 없이 새 토큰만 추가**하는 공식 경로. xlsx/init 없이 관리자만으로 가능.

즉, "새 토큰만 추가"는 **SQL 수동** 말고도 **관리자 페이지(토큰 관리 → 상품·옵션 선택 → 토큰 생성)** 로 가능합니다.  
(이 경로는 NEW_PRODUCT_ADDITION_GUIDE의 "방법 3: 관리자 페이지에서 토큰 추가 → 아직 미구현"과 달리 **이미 구현되어 있음**.)

---

### 3. 상품 (`admin_products`) — 현재 방식

- **방법**: 관리자 페이지 `/admin-qhf25za8/products.html` → "+ 새 상품 추가".
- **API**: `POST` (product-routes.js 쪽에서 `INSERT INTO admin_products`).
- **특징**: xlsx 불필요. 기존 상품은 그대로 두고 **추가만** 됨.

---

### 4. 재고 (`stock_units`) — 현재 방식

- **방법**: 관리자 페이지 `/admin-qhf25za8/stock.html` → "재고 추가" → 상품 선택 후 **token_pk(들)** 선택.
- **API**: `POST /api/admin/stock` (stock-routes.js). Body: `product_id`, `token_pk` (단일 또는 배열).
- **제약**: **이미 `token_master`에 존재하는 `token_pk`만** 사용 가능.  
  따라서 "새 상품"을 넣으려면:
  1. `admin_products`에 상품 추가 (UI로 가능).
  2. **그 상품에 매핑된 토큰을 `token_master`에 먼저 넣어야 함** → **관리자 토큰 생성**(tokens.html, §2-5) 또는 xlsx init(기존 토큰 삭제) 또는 SQL 수동 INSERT.

---

### 5. 가이드 문서에서의 권장 (NEW_PRODUCT_ADDITION_GUIDE.md) 및 실제 구현

- **방법 1 (xlsx 일괄)**: init 사용 → **기존 토큰 삭제됨** → 새 상품 추가용으로는 비권장.
- **방법 2 (SQL 직접)**: **기존 토큰 유지하면서 새 토큰만** `INSERT INTO token_master (...)` 로 추가 → 가능.
- **방법 3**: 관리자 페이지에서 토큰 추가 → 가이드에는 "아직 미구현"으로 되어 있으나, **실제로는 구현됨** (§2-5: `tokens.html` + `POST /api/admin/tokens`). 상품·옵션 선택 후 "토큰 N개 생성"으로 **기존 토큰 유지하면서 새 토큰만** 추가 가능.

즉, "기존 토큰 초기화 없이 새 토큰만 추가"하는 경로는 **관리자 토큰 생성** 또는 **SQL 수동** 두 가지입니다.

---

### 6. xlsx 파일 역할 정리

- **products.xlsx**
  - **init**: 이 파일이 "전체 토큰 목록"으로 간주됨. 실행 시 **token_master 전체를 지우고** xlsx 행만 넣음.
  - **update**: "이미 있는 토큰"의 serial_number, rot_code, warranty_bottom_code 등만 갱신. **새 토큰 추가는 안 함.**

따라서 "xlsx에 한 줄만 추가해서 새 토큰만 넣고 싶다"는 흐름은 **현재 구조로는 불가**하고,  
xlsx에 새 줄을 넣고 init을 돌리면 **항상 기존 토큰이 초기화**되는 구조입니다.

---

### 7. 관련 파일 위치 (토큰·상품·재고)

| 구분 | 파일 |
|------|------|
| 토큰 init (전체 삭제 후 xlsx만 반영) | `backend/init-token-master-from-xlsx.js` |
| 토큰 update (기존 행만 수정, 신규 토큰 없음) | `backend/update-token-master-from-xlsx.js` |
| 토큰 테이블만 비우기 | `backend/reset-token-master.js` |
| VPS 전체 초기화 (stock 삭제 + init) | `VPS_TOKEN_MASTER_FULL_INIT.sh` |
| 가이드 (init/update/수동 SQL 설명) | `VPS_TOKEN_MASTER_INIT_GUIDE.md`, `NEW_PRODUCT_ADDITION_GUIDE.md` |
| 재고 추가 API | `backend/stock-routes.js` (POST /api/admin/stock) |
| 상품 추가 API | `backend/product-routes.js` (admin_products INSERT) |
| **토큰 생성 API (기존 유지, INSERT만)** | `backend/token-admin-routes.js` (POST /api/admin/tokens) |
| 토큰 생성 UI | `admin-qhf25za8/tokens.html`, `admin-tokens.js` |

---

### 8. Part I 결론 (토큰·상품·재고 현재 상태)

1. **새 상품 추가**: 관리자 UI로 가능. xlsx 불필요.
2. **새 토큰 추가**
   - **관리자 토큰 생성** (tokens.html → 상품·옵션 선택 → 토큰 생성) → **기존 토큰 유지, 새 토큰만 INSERT.** ✅
   - xlsx + init → **가능하지만 기존 토큰 전부 삭제** (초기화 문제).
   - xlsx + update → **새 토큰 추가 불가** (기존 행만 수정).
   - **기존 토큰 유지하면서 새 토큰만 넣는 방법**: **관리자 토큰 생성** 또는 **SQL 수동 INSERT**.
3. **새 재고 추가**: 관리자 UI로 가능. 단, 해당 상품의 **token_pk**가 이미 `token_master`에 있어야 함 (관리자에서 토큰 생성해 두면 됨).

**xlsx init 없이** 새 토큰만 추가하려면 **관리자 토큰 생성**을 쓰면 되고,  
"xlsx에 일일이 입력해서 init으로 등록"하는 경로만 쓰면 **기존 토큰 초기화 문제**가 그대로 발생합니다.  
관리자 토큰 생성은 **기존 데이터를 지우지 않는 경로**로 이미 있습니다.  
**메타(serial_number, rot_code, warranty_bottom_code 등)**: token_master에는 **발급 시점 스냅샷**으로 유지. 값을 바꾸고 싶으면 재발급/재생성 절차로 처리.

---

## Part II. QR 코드 — 현재 구조 및 개선 방향

관리자에서 토큰을 추가한 뒤, 해당 토큰의 **QR 이미지**를 어떻게 만들고 개선할지 정리합니다.

### 9. QR 현재 구조 (요약)

| 구분 | 내용 |
|------|------|
| **토큰 저장** | 관리자 페이지 → `POST /api/admin/tokens` → `token_master`에 저장 (product_name, warranty_bottom_code, serial_number 등 포함) |
| **QR 이미지** | `output_qrcodes/{internal_code}.png` (디스크 파일). **현재 생성 경로는 2개** (Part III §16.2와 일치): **(A)** 관리자 토큰 생성 시 단건/다건 자동 생성(`token-admin-routes.js` → `generateOneQR`). **(B)** 전체 재생성 `node generate-qr-codes.js`. |
| **전체 재생성** | `generate-qr-codes.js` = DB의 **모든** token_master 행을 읽어서, **전부** QR PNG 생성/덮어쓰기. 토큰 생성 시 자동 생성(A)과 별도 경로. |
| **다운로드** | 관리자에서 "QR 코드 다운로드" → `output_qrcodes/` 안의 PNG들을 ZIP으로 제공 (정책: Part III §18 — 기본 DB 매칭만 포함, 옵션 orphan 포함 등). |
| **스캔** | QR URL = `https://prepmood.kr/a/{token}` → `/a/:token`에서 token_master 조회 → 있으면 warranty 조회 → success/warning/error |

**현재 상태**  
- (A)로 **토큰 추가 시 해당 토큰용 QR가 자동 생성**되므로, 새 토큰만 넣을 때는 전량 스크립트를 돌리지 않아도 됨.  
- (B)는 "전체를 한 번에 다시 만들 때"(예: qr-config 크기 전면 변경) 사용.

---

### 10. QR 목표 흐름 (원하는 것)

1. 관리자에서 **토큰 추가** (상품, product name, warranty_bottom_code 등 입력) → 서버 DB에 저장.
2. 그 **토큰에 대한 QR 코드 1장만** 바로 생성되어 `output_qrcodes/`에 저장.
3. 관리자에서 **QR 다운로드**(ZIP 또는 단일) 시, 새로 만든 토큰도 포함.
4. 그 QR를 찍으면 **정품 인증** (기존 `/a/:token` 흐름) 그대로 동작.

즉, **"토큰 추가 = 해당 토큰용 QR 1개 생성"**이 되면, `generate-qr-codes.js`를 매번 전량 실행하지 않아도 됨.

---

### 11. QR 개선 방향 (설계 옵션)

#### 11-1. 공통으로 필요한 것

- **단일 QR 생성 로직 1곳에 모음**
  - 입력: `token`(20자), `internal_code`(파일명용).
  - 출력: `output_qrcodes/{internal_code}.png` 한 개 생성.
  - 옵션: `qr-config.json`의 `default`(또는 지정 프리셋) 사용.
  - 이걸 **공용 유틸**로 두고,
    - CLI 스크립트(`generate-qr-codes.js`)는 "전체 token_master 조회 → 루프에서 이 유틸 호출"
    - 관리자 토큰 생성/재생성은 "해당 토큰 1개만 이 유틸 호출"
  로 쓰면, 크기/설정이 한 곳에서만 관리됨.

#### 11-2. 옵션 A: 토큰 생성 시 자동으로 QR 1개 생성

- **권장 설계(목표)**: QR 생성은 **commit 이후**에 수행. **현재 구현**: commit **이전** 생성(§16.2 참고).
- **동작**: 생성된 토큰 각각에 대해 `(token, internal_code)`로 위 공용 유틸 호출 → PNG 1개씩 저장.
- **장점**: 관리자는 "토큰 만들기"만 하면 되고, 별도 "QR 생성" 버튼을 안 눌러도 됨.
- **고려**: 토큰을 한 번에 많이 만들면(예: 100개) 요청 한 번에 QR 100개 생성되므로, 응답이 조금 길어질 수 있음. 필요하면 "비동기로 큐에 넣고 나중에 생성"으로 바꿀 수 있음.

#### 11-3. 옵션 B: 관리자 화면에서 "QR 생성" 버튼으로 1개씩 생성

- **API**: 예) `POST /api/admin/qrcode/generate`
  - 파라미터: `internal_code` 또는 `token_pk` 중 하나.
  - 서버에서 해당 token_master 1건 조회 → `(token, internal_code)`로 공용 유틸 호출 → PNG 1개 저장.
- **동작**: 토큰 생성 시에는 QR를 안 만들고, 관리자 목록/상세에서 "이 토큰 QR 생성" 버튼을 눌렀을 때만 생성.
- **장점**: 토큰 생성 API는 가볍고, 필요한 것만 골라서 QR 생성 가능.
- **단점**: 토큰 추가 후 한 번 더 "QR 생성"을 눌러줘야 함.

#### 11-4. 옵션 C: A + B 둘 다

- 토큰 **생성 시**에는 자동으로 해당 토큰들 QR 생성 (옵션 A).
- **이미 있는 토큰**은 관리자에서 "QR 재생성" 버튼으로 1개씩 생성 (옵션 B).
  - 예: PNG를 지웠거나, qr-config 크기 변경 후 "이 토큰만 다시 만들고 싶을 때".

---

### 12. QR 추천

- **단기**: **옵션 C (A + B)**
  - 토큰 추가 시 자동 QR 1개 생성 → 관리자 작업이 단순해짐.
  - 나중에 "이 토큰만 다시 생성"이 필요하면 "QR 재생성" API/버튼으로 처리.
- **구현 순서 제안**
  1. **공용 유틸**
     - 예: `backend/utils/qr-generator.js`
     - `loadQRConfig()`, `generateOneQR(token, internalCode [, options])`
     - `output_qrcodes` 경로·`AUTH_BASE_URL`·`qr-config.json` 경로는 기존 `generate-qr-codes.js`와 동일하게.
  2. **generate-qr-codes.js 리팩터**
     - DB에서 전체 조회한 뒤, 루프에서 `generateOneQR(product.token, product.internal_code)` 호출.
     - 중복 제거: 설정 로드/경로는 유틸에서만 사용.
  3. **토큰 생성 시 QR 자동 생성 (옵션 A)**
     - `token-admin-routes.js`의 `POST /admin/tokens`에서, commit 성공 후 생성된 각 `{ token, internal_code }`에 대해 `generateOneQR(token, internal_code)` 호출.
     - 실패해도 토큰 생성 자체는 성공으로 두고, 로그만 남기거나 응답에 `qr_generated: false` 같은 플래그 추가 가능.
  4. **단일 QR 재생성 API (옵션 B)**
     - 예: `POST /api/admin/qrcode/generate` (또는 `qrcode-download-routes.js`에 추가)
     - `internal_code` 또는 `token_pk` 받아서 해당 1건만 `generateOneQR` 호출.
  5. **관리자 UI (선택)**
     - 토큰 목록/상세에 "QR 생성" 또는 "QR 재생성" 버튼 추가 → 위 API 호출.

---

### 13. QR와 기존 것과의 관계

- **배포 시 `node generate-qr-codes.js`**
  - 그대로 둬도 됨.
  - "전체를 한 번에 qr-config 기준으로 다시 만들고 싶을 때"(예: 크기 전면 변경)용.
- **다운로드**
  - 지금처럼 `output_qrcodes/` 디렉터리 내용을 ZIP/단일로 서빙하면 됨.
  - 토큰 생성 시(또는 "QR 재생성" 시) 새 PNG가 같은 경로에 저장되므로, 다음 다운로드부터 자동으로 포함됨.
- **정품 인증**
  - 변경 없음. QR 안의 URL은 `https://prepmood.kr/a/{token}`이고, token_master에만 있으면 기존처럼 동작.

---

### 14. 관련 파일 위치 (QR)

| 구분 | 파일 |
|------|------|
| QR 일괄 생성 스크립트 | `backend/generate-qr-codes.js` |
| QR 설정 (크기/여백 등) | `backend/qr-config.json` |
| QR ZIP/단일 다운로드 API | `backend/qrcode-download-routes.js` |
| QR 이미지 저장 경로 | `output_qrcodes/` (프로젝트 루트) |

---

### 15. Part II 요약 (QR)

| 항목 | 내용 |
|------|------|
| **문제** | 새 토큰 추가해도 QR는 "전체 재생성" 스크립트에 의존해서 불편함. |
| **목표** | 토큰 추가 → 해당 토큰용 QR 1장만 생성 → 다운로드/스캔에 바로 사용. |
| **방법** | (1) 단일 QR 생성 공용 유틸 도입, (2) 토큰 생성 API에서 생성 직후 해당 토큰만 QR 생성, (3) 필요 시 "QR 재생성" API/버튼 추가. |
| **기존** | `generate-qr-codes.js`는 "전체 재생성"용으로 유지. 배포·다운로드·정품 인증 흐름은 그대로. |

이렇게 하면 "관리자에서 토큰·상품 생성 → product name, warranty_bottom_code 등 저장 → 그 토큰용 QR가 나오고, 찍으면 정품 인증" 흐름을 한 번에 편하게 구축할 수 있음.

---

## Part III. SSOT 정리 · 외부 의견 검토 · 할 일 결정

(코드·DB·문서 기준으로 재점검 후, GPT 등 외부 의견 중 적합한 것만 반영해 **이 문서 하나에 통합**함. SSOT·검토 결론·할 일은 **이 파일만으로 참조**하면 되며, 별도 참조 파일 경로는 두지 않음.)

---

### 16. SSOT 정리 (운영 기준 — 한 문서에서 모두 참조)

| 구분 | SSOT | 코드/위치 |
|------|------|-----------|
| **QR 내부 데이터** | **URL 한 줄**: `{AUTH_BASE_URL}{token}` (예: `https://prepmood.kr/a/{20자 token}`). QR 이미지에는 이 URL만 인코딩됨. | `generate-qr-codes.js`, `utils/qr-generator.js`: `url = baseUrl + token` |
| **QR 파일명** | **internal_code** = PNG 파일명용. 스캔 판정과 무관. `output_qrcodes/{internal_code}.png`. | 동일. 관리자 생성 시 internal_code = 랜덤 8~10자; xlsx/init은 별도 규칙(의도된 차이). **충돌**: 현재 DB에 internal_code UNIQUE 없음(MUL만). **UNIQUE 적용 순서**: (1) internal_code 중복 여부 사전 점검 쿼리 → (2) 중복 있으면 정리(리네임/재생성/수동) → (3) UNIQUE 인덱스 추가 → (4) 생성 로직에서 충돌 시 재시도. **보완 선택지**: (A) 위 순서로 UNIQUE 추가 + 재시도 — **권장**. (B) UNIQUE 없이 생성 시 DB 존재 검사 후 재시도 — 비권장(경쟁 조건에 취약). |
| **재고 1단위** | **stock_units 1행 = token_master 1행(token_pk)** 1:1. | `stock_units.token_pk` UNI, FK → token_master.token_pk |
| **스캔 판정(정품/차단)** | **token_master.token** 조회 + **token_master.is_blocked** 만으로 결정. warranties는 별도 조회(보증서 표시용). | `auth-routes.js`: MySQL `SELECT * FROM token_master WHERE token = ?` → `is_blocked === 1` 이면 차단. SQLite 미사용. |
| **revoke(토큰 무효화)** | **token_master.is_blocked = 1** 이 유일 SSOT. 스캔은 MySQL만 사용하므로, 다른 저장소(예: SQLite) 동기화는 레거시용이며 제거해도 동작에 영향 없음. | `qrcode-download-routes.js` POST `/api/admin/auth/revoke`: MySQL UPDATE 후 `auth-db.revokeToken(token)`(SQLite) 호출 있음 → 제거 권장. |
| **재고 토큰(token_master) 필수** | 식별: token(20자), internal_code, product_id, product_name, is_blocked(기본 0). 권장: option_id, serial_number, rot_code, warranty_bottom_code. | 관리자 토큰 생성 경로: 위 항목 전부 채움. product_id=canonicalId, option_id=opt.option_id 항상 SET. |
| **메타(serial_number 등)** | **발급 시점 스냅샷** 유지. 변경 필요 시 재발급/재생성 절차로 처리. | ADMIN_TOKEN_PRODUCT_STOCK_DESIGN 등에 정책 있음. |

**16.1 revoke 정책 (문장으로 확정)**  
- **is_blocked=1의 의미**: 스캔(`/a/:token`)에서 **즉시 차단(가품/무효)** 처리한다.  
- **warranties.revoked vs token_master.is_blocked**: warranties.revoked = 보증서만 무효(토큰은 스캔 가능). is_blocked = 토큰 자체 차단(스캔 시 무조건 차단). 스캔 시 **먼저 is_blocked** 확인 → 1이면 차단 후 보증서 조회.  
- **revoke API**: MySQL `token_master.is_blocked = 1` 만 변경. **추가 동기화(SQLite 등) 하지 않음.** 레거시 SQLite 호출은 제거.  
- **차단 사유(선택·나중에)**: is_blocked=1만으로는 “왜 차단됐는지”가 DB에 남지 않음. 운영/감사용으로 **선택 필드** 도입 권장: blocked_at, blocked_reason, blocked_by_admin_id 등. 메시지 문구는 문서에 고정하지 않음.  
- **차단 해제(unblock) 정책**: **결정: unblock 허용.** 관리자 전용 API 또는 admin-cli로만 수행. token_master.is_blocked=0 갱신 시 **감사 로그 필수**(unblocked_at, unblocked_by 등). (선택) 차단 사유(blocked_reason 등)가 기록된 경우에만 해제 가능하도록 제한. “unblock 허용. 관리자 전용 API 또는 admin-cli. token_master.is_blocked=0 갱신 + 감사 로그(unblocked_at, unblocked_by).” 허용하지 않기로 하면 “unblock 비허용. 차단 후 해제 불가.”로 문서에 명시.

**16.2 토큰 생성 후 QR 자동 생성 — 시점 정리 (문서 충돌 해소)**  
- **(과거)** 토큰 생성 후 QR 자동 생성 없음. 전체 스크립트만 사용.  
- **(현재)** **근거(코드 앵커)**: `backend/token-admin-routes.js`의 POST `/admin/tokens` — **INSERT 루프 후 commit 완료**, 그 다음 생성된 토큰 목록에 대해 `generateOneQR` 호출 + `qr_generated_at`/`qr_last_error` 갱신. 즉 **QR 생성은 commit 이후**에만 실행됨(정책 A).  
- **운영 리스크 1**: 실패 시 토큰은 성공·로그만 남고 즉시 재시도 경로 없음.  
- **운영 리스크 2 (타이밍)**: 커밋 전에 PNG를 만들기 때문에, **이후 commit 실패 또는 rollback이 나면 “DB에는 없는 토큰인데 디스크에만 PNG가 남는 orphan”이 구조적으로 발생**함. orphan의 가장 큰 공급원이므로 **SSOT 정책: orphan은 원칙적으로 발생시키지 않는다.**  
- **운영 정책(둘 중 하나 확정)**  
  - **정책 A(권장)**: QR 생성은 반드시 **commit 이후**(또는 비동기 잡)에만 실행. rollback 시 PNG가 생기지 않아 orphan이 구조적으로 발생하지 않음.  
  - **정책 B(차선)**: 커밋 전 생성 허용하되, ZIP/UI는 **qr_generated_at 기반으로만 신뢰**. orphan은 주기적 청소로 정리.  
  **현재**: 정책 A 적용됨(코드가 commit 이후 QR 생성). 정책 B는 레거시/차선.  
- **권장 방향(선택지)**  
  - **권장**: DB 트랜잭션을 먼저 **commit 완료** → 그 다음 generateOneQR 실행(또는 큐/잡으로 분리). 그러면 rollback 시 PNG가 생기지 않음.  
  - **타협**: 현재 구조 유지하되, generateOneQR 성공 후 DB에 qr_generated_at을 찍고 **“DB에 기록된 것만 신뢰”**하는 운영 규칙으로 고정. ZIP/UI는 qr_generated_at이 있는 것만 “QR 생성됨”으로 간주.

**16.3 권장 시스템 흐름 (현재 문서 기준)**  
1. 상품/옵션 준비: `admin_products`, `product_options` 메타(rot_code, warranty_bottom_prefix 등) 충족.  
2. 토큰 생성: 관리자 `POST /api/admin/tokens` → DB INSERT.  
3. QR 생성: **권장** = commit 완료 후 generateOneQR 실행(또는 큐/잡). **차선** = 커밋 전 생성 + qr_generated_at으로 신뢰 경계.  
4. 재고 등록: `POST /api/admin/stock`에서 `product_id` 정합성 강제(이미 구현).  
5. 운영 다운로드: DB 매칭만 기본 포함, `include_orphans` 옵션, included/orphan/missing_png 수치로 고정.

---

### 17. 외부(GPT) 의견 검토 요약 (정확성 재점검)

- **“QR = URL 한 줄, internal_code = 파일명용, 재고 = token_pk 1:1, 스캔 = token + is_blocked”**  
  → 코드와 일치. **적합.**

- **“상품/옵션 메타 필수”**  
  → `token-admin-routes.js`에서 rot_code·warranty_bottom_prefix·serial_prefix·digital_warranty_* 전부 없으면 400. **이미 구현.**

- **“토큰 생성 시 product_id·option_id·serial_number 등 채움, 응답에 created 포함”**  
  → INSERT에 전부 포함, 응답 `created: [{ token_pk, token_masked, internal_code, warranty_bottom_code }]`. **이미 구현.**

- **“토큰 생성 직후 해당 토큰만 QR 생성”**  
  → `token-admin-routes.js`에서 각 INSERT 직후(동일 트랜잭션 내) `generateOneQR({ token, internal_code })` 호출(206~215줄). **이미 구현.** 단건 재생성 API(옵션 B)는 **미구현.**

- **“재고 등록 시 token_master.product_id == 요청 product_id 검증”**  
  → `stock-routes.js`에서 불일치 시 400. **이미 구현.** option_id 검증은 요청에 옵션 없어 **현재 불가**, 추후 검토.

- **“revoke = MySQL is_blocked만, SQLite 제거”**  
  → 스캔은 MySQL만 사용. revoke 시 SQLite `revokeToken` 호출이 있음. **제거 시 동작 동일.** 수용.

- **“qr_generated_at 또는 qr_status로 QR 생성 상태 DB 기록”**  
  → 현재 token_master에 해당 컬럼 없음. **도입 시 UI/운영·ZIP 필터에 유리.** 수용(구현 순서에서 반영).

- **“ZIP 다운로드 시 DB 매칭 없는 orphan 기본 제외, 옵션으로 포함 + orphan 목록”**  
  → 현재는 디스크 전체 PNG 포함. **기본 제외 + 옵션 포함 + 목록** 제안 수용(구현 시 반영).

- **“product_id/option_id 스키마 NOT NULL”**  
  → 생성 경로는 이미 항상 채움. 레거시 NULL 행 가능하므로 **당장 NOT NULL 필수 아님.** 문서로 “신규 생성은 항상 채움”만 명시.

- **“internal_code를 serial_number 스타일로”**  
  → 관리자 경로는 랜덤 8~10자, xlsx/init은 별도. **둘 다 허용, 문서에만 명시.**

---

### 18. 할 일 결정 (우선순위·구체 액션)

**즉시(문서)**  
- 이 문서(Part III §16)를 SSOT로 유지.  
- “메타 = 발급 시점 스냅샷, 변경 시 재발급” 문구를 Part I 또는 Part III에 한 줄 추가해 두기.

**즉시(코드)**  
- **revoke SSOT 정리**: `backend/qrcode-download-routes.js`의 `POST /api/admin/auth/revoke`에서 MySQL `UPDATE token_master SET is_blocked = 1` 후 호출하는 **SQLite `revokeToken(token)` 호출 제거.** (스캔은 MySQL만 사용하므로 제거해도 동작 동일.)

**다음 단계(선택·권장)**  
0. **트랜잭션 범위(대량 생성 시)**: 토큰 INSERT는 **commit까지 1트랜잭션**으로 끝낸다. QR 생성 및 qr_generated_at 갱신은 **commit 이후 별도 단계**(비트랜잭션 또는 토큰별 UPDATE)로 수행. 파일 IO를 트랜잭션 안에 두지 않아 DB 락·시간 최소화하고, rollback 시 orphan이 생기지 않음(정책 A와 일치).  
1. **QR 생성 상태 DB 반영** (필수에 가깝다): `token_master`에 `qr_generated_at`(datetime NULL) + `qr_last_error`(varchar, 길이 제한). **원자성·갱신 규칙**: (1) **파일이 디스크에 정상 생성(또는 overwrite 완료)된 것이 확인된 뒤에만** qr_generated_at 갱신. (2) 성공 시 qr_generated_at=NOW(), qr_last_error=NULL. (3) 실패 시 qr_last_error=마지막 실패 에러 요약만 저장, **qr_generated_at은 건드리지 않음**(기존 값 또는 NULL 유지). 단건/일괄 재생성도 동일 규칙.  
   **"파일 생성 확인" 최소 정의**(문서/코드 일치): **성공** = `fs.stat`로 파일 존재 + size > 0, 또는 `toFile()` 완료 성공. **실패** = 예외, 경로/권한 문제, toFile reject. 구현에서 이 기준이 흔들리면 문서만 남으므로 코드와 동일하게 유지.  
2. **단건 QR 재생성 API**: `POST /api/admin/qrcode/generate` (token_pk 또는 internal_code). QR 상태 컬럼 도입 시 **세트로 두는 것을 권장** — 실패 시 재시도 경로가 되어 정책이 완결됨.  
3. **ZIP orphan 처리**: **정의**: orphan = `output_qrcodes/{internal_code}.png`는 존재하나 `token_master`에 해당 internal_code가 없는 것. **기본**: DB에 존재하는 internal_code만 ZIP 포함. **옵션**: `?include_orphans=1` 시 orphan 포함 + ZIP 내 `orphans.txt`(internal_code 목록 + 개수, 가능하면 파일 mtime 등). **included_count 기준(고정)**: **기준 A** — ZIP에 **실제로 담긴 파일 수**(archive.file 호출 수). DB 매칭 수가 아니라 "아카이브에 들어간 파일 개수". missing_png_count와 함께 쓰면 운영상 직관적. **로그/응답 수치**(코드와 1:1로 고정): **included_count**, **orphan_count**, **missing_png_count**(DB에는 있는데 디스크에 파일이 없는 경우). 관리자 UI에서 “orphan N개 제외”, “missing_png N개” 안내 가능.

**하지 않기로 한 것**  
- 스키마에서 product_id/option_id NOT NULL 강제(레거시 대비).  
- internal_code 형식을 serial_number 스타일로 통일(관리자=랜덤 유지).

**option_id / 재고 검증 — 장기 방향 (한 줄)**  
현재 stock 추가 요청 바디에 option_id(또는 size/color)가 없어 option_id 검증 불가. **장기 방향**: (A) product_id + token_pk만으로 충분하고 옵션 추적은 token_master.option_id로만 한다. 또는 (B) 옵션 기반 재고 강화 시 요청에 option_id(또는 size/color) 포함하고 서버에서 option_id까지 검증한다. 한 줄이라도 문서에 남겨 두면 “옵션 검증을 왜 안 했지?” 논의 시 기준이 됨.

**배포·마이그레이션 순서 (087 qr_generated_at/qr_last_error)**  
- **올바른 순서**: (1) **배포 먼저** (push → deploy.sh 실행 → 새 코드·migrations/087 파일이 서버에 반영됨). (2) **배포가 끝난 뒤** 서버에서 마이그레이션 087 실행. (배포 전에는 서버에 087 파일이 없으므로 “배포 전에 마이그레이션”은 불가.)  
- **서버에서 087 실행 예**: `cd /var/www/html/backend && mysql -u 사용자 -p DB명 < migrations/087_add_token_master_qr_status.sql` (환경에 맞게 사용자/DB명 치환).  
- **순서를 지키지 않을 때**: 087을 실행하지 않은 채로 배포만 하면, 앱이 `UPDATE token_master SET qr_generated_at = ..., qr_last_error = ...` 를 실행할 때 **MySQL 에러(Unknown column 'qr_generated_at')** 가 발생한다. 그 결과 **토큰 생성(POST /api/admin/tokens)** 과 **단건 QR 재생성(POST /api/admin/qrcode/generate)** 이 500 에러로 실패한다. 로그인·상품 목록 등 다른 API는 영향 없음. 087 실행 후에는 정상 동작.

**테스트/검증 항목 (변경 시 깨질 수 있는 지점 — §18 대응)**  
이 문서를 SSOT로 참조할 때, 변경 후 아래를 최소한 점검하면 된다.  
- 토큰 생성 → QR 생성 성공 시 PNG 존재; **강제 실패 시나리오**(예: output_qrcodes 쓰기 불가)에서 토큰은 성공·QR만 실패인지.  
- ZIP 다운로드: 기본 동작 시 orphan 제외; `include_orphans=1` 시 orphan 포함 + orphans.txt.  
- revoke 후 스캔: 해당 토큰으로 `/a/:token` 접근 시 **is_blocked 우선** 차단 확인.  
- 재고 등록: token_master.product_id와 요청 product_id 불일치 시 **400** 확인.

---

### 19. Part III 요약

| 항목 | 내용 |
|------|------|
| **SSOT** | Part III §16에 QR·재고·스캔·revoke·재고 토큰 필수 항목·메타 스냅샷 정리. 이 문서 하나로 참조. |
| **외부 의견** | GPT 제안 중 코드와 일치하는 것은 “이미 구현”으로 정리, 보완 제안 중 revoke SQLite 제거·qr_generated_at·ZIP orphan 처리는 수용. NOT NULL 강제·option_id 검증·internal_code 형식 통일은 불필요·조정으로 둠. |
| **할 일** | (1) revoke에서 SQLite 호출 제거. (2) 문서 보강 반영: 코드 앵커·운영 리스크·원자성 규칙·internal_code UNIQUE 권장·orphan 정의·missing_png_count·revoke 선택 필드·검증 항목. (3) 선택·권장: qr_generated_at+원자성 규칙·단건 재생성 API(세트)·ZIP orphan+수치 로그. **실질 코드 액션 3개**: SQLite revoke 제거; qr_generated_at/qr_last_error 마이그레이션+갱신 로직+단건 API; ZIP orphan 기본 제외+옵션+included/orphan/missing_png 수치. |
