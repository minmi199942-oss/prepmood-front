# 검색 기능 보안·보완 계획 (Gemini 피드백 검토)

> Gemini가 Cursor 구상에 대해 남긴 피드백을, **실제 프로젝트 구조와 코드**를 기준으로 검토한 결과와 실행 계획입니다.  
> 토큰을 아끼지 말고 코드·환경을 확인했으며, 우리 구조에 맞지 않는 부분은 제외·수정했습니다.

---

## 1. 우리 프로젝트의 검색 구조 (사실 확인)

### 1.1 상품 검색 (search.html)

| 항목 | 실제 구현 |
|------|-----------|
| **데이터 소스** | **100% 클라이언트** — `catalog-data.js` / `product-data.js`의 `CATALOG_DATA` (프론트 정적 데이터) |
| **백엔드 API** | **없음** — 상품 검색용 `GET /api/search?keyword=...` 같은 API는 존재하지 않음 |
| **검색어 표시** | `document.getElementById('search-query').textContent = \`"${currentSearchQuery}" 검색 결과\`` 사용 (209, 220, 406, 408, 549행) |
| **실시간 검색** | 없음 — 검색은 버튼 클릭·엔터 시에만 실행 (`input` 이벤트는 주석 처리됨) |
| **fetch 사용** | 검색 결과를 서버에서 가져오지 않음 → **AbortController로 이전 요청 취소하는 로직 없음** |
| **히스토리** | `performNewSearch()`에서 `history.pushState`로 URL만 갱신 (SPA처럼 내비게이션 없음, 페이지 리로드 시 search.html 자체 로드) |

→ **정리**: Gemini가 말한 “검색어를 innerHTML로 넣으면 XSS”, “이전 fetch가 늦게 도착해 결과가 뒤바뀌는 race”, “백엔드 LIKE 쿼리에 LIMIT 없음”은 **현재 상품 검색은 클라이언트 전용이고 백엔드 검색 API가 없기 때문에**, 상품 검색 흐름에는 **그대로 해당되지 않습니다**.  
다만 **다른 검색/에러 메시지**와 **추후 백엔드 검색 API 추가 시**에는 아래 보완 사항이 필요합니다.

### 1.2 그 외 검색·목록 API (백엔드)

| API | 파일 | 검색 처리 | LIMIT | 빈 검색어 처리 |
|-----|------|-----------|--------|----------------|
| 주문 목록 검색 | `backend/index.js` (`/api/admin/orders`) | `search` 있으면 LIKE 5곳 (Prepared Statement) | `limitNum` (기본 50, 최대 200) | `if (search)` — 빈 문자열은 LIKE 미적용. 공백만 있는 경우는 적용됨 |
| 문의 목록 검색 | `backend/inquiry-routes.js` (`/api/admin/inquiries`) | `search` 있으면 LIKE 3곳 (Prepared Statement) | `limitNum` (최대 200) | `if (search)` — 빈 문자열은 LIKE 미적용 |
| 보증서 검색 | `backend/warranty-event-routes.js` (`/api/admin/warranties/search`) | `q` 필수, trim 후 형식별 쿼리 | LIMIT 50 (일부 분기) | **있음** — `!q \|\| q.trim().length === 0` 시 400 반환 |

→ **정리**:  
- **보증서 검색**은 이미 빈 검색어 400, LIMIT, Prepared Statement 적용되어 있음.  
- **주문/문의**는 LIMIT 있음. 빈/공백 검색어는 “차단”이 아니라 “LIKE 조건 미적용”이라 서버 부하는 적지만, **명시적으로 빈·공백만 있는 검색어는 400으로 거절**하는 방어가 있으면 좋음.

---

## 2. Gemini 피드백 항목별 정리

### 2.1 받아들일 부분 (우리 구조에 맞게 적용)

| Gemini 제안 | 우리 상황 | 조치 |
|-------------|-----------|------|
| **검색어 표시 시 XSS 방지** | 상품 검색어는 이미 `textContent` 사용. 다만 **에러 메시지** 등 다른 경로에서 사용자/외부 입력을 innerHTML에 넣지 말 것 | `search.html`의 `showError(message)`에서 `message`를 innerHTML이 아닌 **textContent**로 넣도록 수정 (방어적 코딩). 다른 검색/에러 UI도 “사용자 입력·API 메시지”는 textContent 또는 escapeHtml 원칙 유지 |
| **한글 IME 조합 중 API 호출 금지** | 현재 상품 검색은 실시간 입력 검색이 없음. **추후** 입력 시 실시간으로 API 호출하는 검색을 넣을 경우 | 그때 **input 이벤트에서 `event.isComposing === true`이면 요청 건너뛰기** 적용 |
| **이전 검색 요청 취소 (Race Condition)** | 상품 검색은 fetch 없음. **추후** 서버 검색 API를 쓰는 자동완성/실시간 검색을 넣을 경우 | **AbortController**로 새 요청 시 이전 요청 abort 적용 |
| **백엔드 검색 결과 개수 제한** | 상품 검색 API는 없음. 주문/문의/보증은 이미 LIMIT 있음 | **추후** 상품 등에 대한 `GET /api/search?keyword=...` 추가 시 **반드시 LIMIT (예: 20~50)** 적용 |
| **빈 검색어 API 차단** | 보증서는 이미 400. 주문/문의는 `if (search)`만 있음 | 주문·문의 검색 파라미터에 대해 **빈 문자열·공백만 있으면 400** 반환하도록 백엔드 보완 권장 |

### 2.2 이미 잘 되어 있는 부분 (유지)

- **search.html**
  - 검색어 표시: `search-query`에 **textContent**만 사용.
  - 상품 카드: `escapeHtml(product.id, name, mainCategory, subCategory, category)` 사용 후 템플릿에 삽입.
- **utils.js**
  - `escapeHtml()` 구현 (textContent 기반).
- **백엔드**
  - 주문/문의/보증 검색: Prepared Statement 사용 (SQL 인젝션 방지).
  - 보증서 검색: 빈 검색어 400, LIMIT 50.
- **header-loader.js**
  - 검색 모달에서 “검색어를 입력해 주세요”는 **고정 문자열**만 innerHTML에 넣음 (사용자 검색어 미포함).

### 2.3 우리 구조와 맞지 않아 “삭제/수정”할 부분

| Gemini 가정 | 실제 | 처리 |
|-------------|------|------|
| “검색어에 대한 결과가 없습니다”를 **innerHTML로 검색어와 함께** 표시한다 | search.html에서는 **결과 없음** 시 별도 문구만 보여 주고, 검색어는 **항상 textContent**로만 표시됨 | **해당 없음** — 별도 수정 불필요. 다만 “결과 없음” 문구를 동적으로 만들 때도 검색어는 textContent 유지 |
| 상품 검색이 **백엔드 API**(예: `admin_products` LIKE)로 동작한다 | 상품 검색은 **클라이언트 전용**, 백엔드 상품 검색 API 없음 | **해당 없음**. 추후 API 추가 시에만 LIMIT/빈 키워드 차단 적용 |
| “디바운싱 400ms”가 이미 검색에 적용되어 있다 | 상품 검색은 버튼/엔터만 사용, 실시간 입력 검색 없음 | 실시간 검색 추가 시 디바운싱 + isComposing + AbortController 함께 고려 |

---

## 3. 보안·보완 실행 계획

### 3.1 필수 (단기)

1. **search.html — showError() XSS 방어**
   - **현재**: `showError(message)`가 `message`를 그대로 `innerHTML`에 넣음 (고정 문자열만 넘기므로 당장 위험은 낮음).
   - **조치**: `message`를 **textContent**로 넣도록 수정 (예: 에러 메시지용 `<p>`를 만들고 `textContent = message` 설정 후 DOM에 추가).  
   - **이유**: 나중에 메시지를 URL/API 등 외부에서 받을 경우를 대비한 방어적 코딩.

2. **백엔드 — 빈/공백 검색어 명시적 차단 (선택이지만 권장)**
   - **주문 목록** (`/api/admin/orders`): `search`를 trim한 뒤, 빈 문자열이면 400 응답 (또는 search 무시하고 진행해도 됨. 정책에 따라 “빈 검색어로 호출 금지”로 가려면 400).
   - **문의 목록** (`/api/admin/inquiries`): 동일하게 `search` trim 후 빈 문자열이면 400 또는 무시.
   - **이미 양호**: 보증서 검색은 그대로 유지.

### 3.2 추후 (백엔드 상품 검색 API 추가 시)

- **API 설계**
  - 예: `GET /api/products/search?keyword=...` 또는 기존 상품 라우트 확장.
  - **필수**: `keyword`가 없거나 trim 후 빈 문자열이면 **400 Bad Request**.
  - **필수**: 쿼리에 **LIMIT 20** (또는 50 등 고정값).  
  - LIKE 사용 시에도 **Prepared Statement** 유지 (이미 원칙이므로 유지).

- **프론트 (실시간 검색 추가 시)**
  - **input** 이벤트에서:
    - `event.isComposing === true`이면 **요청하지 않음** (한글 조합 중 중복 요청·깜빡임 방지).
    - **AbortController**: 새 검색 시 이전 `fetch`를 **abort**하여, 늦게 도착한 응답이 화면을 덮지 않도록 처리.
  - 검색어를 화면에 표시할 때는 **textContent** 또는 **escapeHtml**만 사용 (현재도 동일 원칙 유지).

### 3.3 삭제할 코드

- **없음.**  
- Gemini가 지적한 “innerHTML로 검색어 표시”는 우리 코드에 없고, “상품 검색용 백엔드 LIKE 쿼리”도 없으므로, **삭제할 특정 라인은 없음**.  
- 다만 **showError**만 위 3.1대로 수정하면 됨.

---

## 4. 요약 표

| 구분 | 항목 | 현재 상태 | 조치 |
|------|------|-----------|------|
| **XSS** | 검색어 표시 | textContent 사용 중 | 유지. 에러 메시지는 showError에서 textContent로 변경 |
| **XSS** | 상품 카드 | escapeHtml 사용 중 | 유지 |
| **IME** | 한글 조합 중 요청 | 실시간 검색 없음 | 추후 실시간 검색 시 isComposing 체크 추가 |
| **Race** | 이전 fetch 취소 | 상품 검색에 fetch 없음 | 추후 API 검색 시 AbortController 적용 |
| **백엔드** | 상품 검색 API | 없음 | 추후 추가 시 LIMIT + 빈 keyword 400 |
| **백엔드** | 주문/문의 search | LIMIT 있음, 빈 검색어는 조건만 미적용 | 선택: 빈/공백 search 시 400 또는 명시적 무시 |
| **백엔드** | 보증서 검색 | 400 + LIMIT + Prepared Statement | 유지 |

---

## 5. 수정 시 참고용 지침 (Cursor에 넘길 때)

아래는 “추후 상품 검색을 API로 확장·실시간 검색을 넣을 때” Cursor에게 넘기기 좋은 요약 문장입니다.

- **XSS**: 검색어·에러 메시지를 화면에 넣을 때는 **textContent** 또는 **escapeHtml**만 사용할 것. (이미 대부분 적용됨.)
- **한글 IME**: input 이벤트에서 **event.isComposing === true**이면 검색 API 호출을 건너뛸 것.
- **Race Condition**: 새 검색 시 **AbortController**로 이전 fetch를 취소할 것.
- **백엔드**: 검색 API는 **keyword 없거나 공백만 있으면 400**, 쿼리에는 **LIMIT 20(또는 N)** 필수.

---

## 6. 진행 전 점검 (영향·보안·보완)

아래는 **실제 코드 기준**으로 수정 전·후 영향을 정리한 내용입니다.

### 6.1 search.html — showError(message) 수정

| 점검 항목 | 결과 |
|-----------|------|
| **호출처** | `showError`는 **2곳**에서만 호출: `'상품 데이터를 불러올 수 없습니다.'`, `'상품 데이터가 로드되지 않았습니다.'` — 모두 **고정 문자열** |
| **영향** | 메시지를 innerHTML → textContent로 바꿔도 **표시 문구는 동일**. HTML이 포함된 메시지를 넘기는 호출이 없으므로 **기능/UI 변화 없음** |
| **보안** | 현재는 위험 없음. **방어적 코딩**: 나중에 `message`를 URL/API 등 외부에서 받도록 바꿀 경우에도 XSS 발생하지 않도록 **지금 textContent로 통일** |
| **구현 시 주의** | 에러 영역은 기존처럼 `no-results` 래퍼 + 제목 + 버튼 유지. `message`만 `<p>`에 **textContent**로 넣으면 됨 (다른 부분은 기존 구조 유지) |

### 6.2 search.html — URL 검색어(q) 처리

| 점검 항목 | 결과 |
|-----------|------|
| **decodeURIComponent(query)** | `q`가 악성 스크립트로 인코딩되어 있어도, `currentSearchQuery`는 **textContent**와 **input.value**에만 사용됨 → **실행되지 않음** |
| **결론** | **추가 수정 불필요**. 기존만으로 XSS 안전 |

### 6.3 백엔드 — 주문/문의 검색에 “빈 검색어 400” 추가 시

| 점검 항목 | 결과 |
|-----------|------|
| **관리자 주문 목록** (`admin-orders.js`) | `search = elements.searchInput.value.trim()` 후 **`if (search) params.append('search', search)`** → 검색창 비우면 **search 파라미터를 아예 보내지 않음** |
| **관리자 문의 목록** (`admin-inquiries.js`) | 동일하게 **`if (search) params.append('search', search)`** → 검색 초기화 시에도 **search 미전송** |
| **영향** | 백엔드에서 “**search 파라미터가 있지만 값이 빈 문자열 또는 공백만 있으면 400**”으로 해도, **정상 사용(검색 초기화) 시에는 400이 발생하지 않음**. 직접 `?search=` 또는 `?search=   ` 로 호출하는 경우에만 400 |
| **보안** | 빈/공백만 있는 검색어로 불필요한 LIKE 쿼리 실행 방지 및 정책상 “유효하지 않은 검색” 명시적 거절 |
| **구현 시 주의** | **파라미터가 없을 때**는 기존처럼 `if (search)`로 LIKE 미적용만 하고 400 하지 않음. **파라미터는 있는데 trim 결과가 빈 문자열일 때만** 400 반환 |

### 6.4 문제 될 수 있는 부분 (현재 없음)

- **showError**: 호출처가 고정 문자열뿐이라, textContent로 바꿔도 **기존 동작과 동일**.
- **백엔드 400**: 관리자 UI는 빈 검색 시 `search`를 보내지 않으므로 **기존 플로우 유지**, **영향 없음**.
- **SQL 인젝션**: 주문/문의 검색은 이미 Prepared Statement 사용 → **추가 보안 이슈 없음**.

### 6.5 보완이 필요한 점 (수정으로 해소)

1. **search.html showError**  
   - `message`를 **반드시 textContent로만** 출력 (DOM으로 `<p>` 생성 후 `textContent = message` 설정).

2. **backend/index.js 주문 목록**  
   - `req.query.search`가 **존재하지만** `String(req.query.search).trim() === ''`이면 **400** 반환.  
   - 그 외는 기존처럼 `search` 변수를 trim한 값으로 두고, `if (search)`일 때만 LIKE 적용.

3. **backend/inquiry-routes.js 문의 목록**  
   - 위와 동일: `search` 파라미터가 있으나 trim 후 빈 문자열이면 **400**.  
   - trim한 값으로 `if (search)` 시에만 LIKE 적용.

---

*이 문서는 프로젝트 규칙에 따라, 기존 SSOT 문서를 대체하지 않으며, 검색·보안 보완 작업의 계획만 담고 있습니다.*
