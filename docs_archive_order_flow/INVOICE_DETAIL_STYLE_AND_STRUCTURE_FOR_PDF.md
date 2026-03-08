# invoice-detail 화면 → PDF용 스타일·구조 정리

**목적**: Puppeteer로 "invoice-detail과 동일한 디자인"의 PDF를 만들기 위해, 실제 화면이 **어떤 HTML/CSS/폰트**로 렌더되는지 정리. 1단계(HTML 템플릿) 구현 시 이 문서를 기준으로 그대로 반영하면 됨.

---

## 1. 진입점과 로드 자원

| 구분 | 파일/URL | 역할 |
|------|----------|------|
| **HTML** | `invoice-detail.html` | 루트. `#invoice-pages-wrapper`(빈 div), `#invoice-action-buttons`(버튼 3개), `invoice-detail-grid.js` 로드. |
| **폰트** | `https://cdn.jsdelivr.net/gh/fonts-archive/Paperlogy/Paperlogy.css` | `font-family: 'Paperlogy', 'Georgia', serif` 로 사용. |
| **CSS** | `invoice-detail-grid.css` (상대 경로) | 인보이스 그리드·페이지·버튼·미디어쿼리 전부. |
| **JS** | `invoice-detail-grid.js` | API 또는 더미 데이터로 `invoice` 객체 로드 → `render(invoice)` → `splitItemsIntoPages` + `createPageHTML` 로 DOM 생성. |

**PDF에 필요한 것**: **폰트(Paperlogy)** + **invoice-detail-grid.css 중 “문서 한 장”에 해당하는 부분** + **createPageHTML이 만드는 .invoice-page 내부 HTML 구조**.

---

## 2. JS가 만드는 DOM 구조 (invoice-detail-grid.js)

### 2.1 최상위

- `#invoice-pages-wrapper` 안에:
  - **페이지별**: `div.invoice-page-block` (data-page="1", "2", ...)
  - 각 block 안: **`div.invoice-page`** (실제 문서 한 장) + **`div.warranty-buttons-column`** (보증서 보기 버튼들)
  - 그 외: `ensureNavButtons()` 로 **`.invoice-nav-prev`**, **`.invoice-nav-next`** 버튼이 wrapper에 추가됨.

**PDF용**: **`.invoice-page` 내부만** 사용. `invoice-page-block`, `warranty-buttons-column`, `invoice-nav-*`, `invoice-action-buttons` 는 **화면 전용**이므로 PDF HTML에서는 제외하거나 숨김 처리.

### 2.2 한 페이지의 “문서” 내용 (`.invoice-page` 내부)

`createPageHTML(pageData, invoiceData, pageNumber)` 가 만드는 **inner** 는 아래와 같음.

**일반 페이지 (7행 구조)**  
클래스: `invoice-page`

- `grid-header invoice-detail-header`
  - `invoice-header-left`: `h1.invoice-header-title` ("INVOICE") + `div.invoice-header-meta` (INVOICE NO., ISSUE DATE)
  - `invoice-header-right`: 로고 SVG (`getLogoSvg()`)
- `grid-sep grid-sep-header` → `div.grid-sep-inner`
- `grid-items`
  - `h2.invoice-section-title` ("DESCRIPTION")
  - `table.invoice-items-table` (thead 비표시용 있음, tbody에 상품 행)
- `grid-sep grid-sep-price` (또는 `grid-sep-hidden`) → `div.grid-sep-inner`
- `grid-summary` (또는 `grid-summary-hidden`)
  - `invoice-summary-container`
  - 행: Subtotal, Tax, Payment Method, `invoice-summary-row total` (Total)
- `grid-sep grid-sep-footer` → `div.grid-sep-inner`
- `grid-footer invoice-detail-footer`
  - `invoice-footer-section` (PRE.PMOOD): COMPANY NAME, BUSINESS ADDRESS, EMAIL
  - `invoice-footer-section` (CUSTOMER): NAME, ID, ADDRESS

**확장 페이지 (5행 구조)**  
클래스: `invoice-page extended-items`

- grid-header, grid-sep-header, grid-items 동일
- **grid-sep-price + grid-summary 없음**
- grid-sep-footer, grid-footer 동일

**데이터 소스**: `invoiceData` (DB `invoices` 행과 동일). `payload_json`, `invoice_number`, `issued_at`, `billing_name`, `shipping_name`, `net_amount`, `tax_amount`, `total_amount`, `payment_method`, `membership_id` 등. `createPageHTML` 내부에서 `formatIssueDate`, `formatCurrency`, `maskEmail`, `escapeHtml` 적용.

---

## 3. 스타일이 적용되는 CSS (invoice-detail-grid.css)

### 3.1 PDF에 꼭 필요한 영역 — “한 장” (.invoice-page)

아래는 **전부 `.invoice-page` 또는 그 자손**에 대한 규칙. PDF용 HTML에 **동일 클래스/구조**를 쓰고, 이 CSS를 인라인하거나 `<style>` 로 넣으면 화면과 동일하게 나옴.

| 라인(대략) | 선택자 | 내용 요약 |
|------------|--------|-----------|
| 177–187 | `.invoice-page` | 751.4px × 990px, grid, padding 80 85 80 100, box-shadow, overflow hidden |
| 191–194 | `.invoice-page.extended-items` | grid-template-rows 5행 (159px 1px 486.5px 1px 162px) |
| 196–228 | `.invoice-page .grid-sep*` | 구분선 행, grid-sep-inner 0.5px, margin-left (10 / 6 / 34) |
| 224–228 | `.grid-sep-hidden`, `.grid-summary-hidden` | visibility: hidden |
| 231–262 | `.grid-header`, `.grid-items`, `.grid-summary`, `.grid-footer` | grid 배치, flex |
| 266–298 | `.invoice-header-*`, `.invoice-brand-logo` | 헤더 레이아웃, 제목 17px, meta 11px, 로고 198×37 |
| 301–358 | `.grid-items` 패딩, `.invoice-section-title`, `.invoice-items-table` | DESCRIPTION, 테이블 566.4px, td 55% / 10.4% / 34.6%, padding 등 |
| 361–412 | `.grid-summary`, `.invoice-summary-*`, `.invoice-summary-row.total::before` | Summary 영역, 250px, 행 간격, Total 위 구분선 |
| 416–482 | `.grid-footer`, `.invoice-footer-*` | 푸터 패딩, PRE.PMOOD/CUSTOMER 섹션 너비, 폰트 13px/12px |

**공통**: `font-family: 'Paperlogy', 'Georgia', serif` (body 및 상속). 색상 `#000`, 구분선 `#e0e0e0` / `rgba(204,204,204,1)`.

### 3.2 브레이크포인트 (PDF는 PC만 사용)

- **PC (기본, 1440px 이상)**: 위 값들이 그대로 적용. **PDF는 이 브레이크포인트만** 쓰면 됨 (뷰포트 751.4×990 또는 A4에 맞춰 조정).
- **Tablet** `@media (max-width: 1439px)`: 557–685 라인 부근. `.invoice-page` 707.5×970, padding/폰트/테이블 너비 등 변경. PDF 미사용.
- **Mobile** `@media (max-width: 768px)`: 689–932 라인 부근. 269×371 등. PDF 미사용.

즉, **PDF용 CSS는 “PC 기본 블록”만 포함**하면 됨. (미디어 쿼리 중 `min-width: 1440px` 또는 기본 규칙만 사용.)

### 3.3 PDF에서 제외할 CSS (화면 전용)

- `*`, `body` (배경 #E6E6E6, flex 등은 PDF 배경에 따라 선택)
- `.invoice-pages-wrapper`, `.invoice-page-block` (position/transform/stack 애니메이션)
- `.invoice-page-block .warranty-buttons-column`, `.warranty-view-btn`
- `.invoice-nav-prev`, `.invoice-nav-next`
- `.invoice-action-buttons`, `.action-btn*`

PDF에서는 **문서 영역(.invoice-page)만** 렌더하므로, 위 선택자는 HTML에 넣지 않거나, 넣더라도 `display: none` 등으로 제거해도 됨.

---

## 4. 폰트

- **화면**: `Paperlogy.css` (CDN) 로드 → `font-family: 'Paperlogy', 'Georgia', serif`
- **PDF**: 서버에서 CDN 의존 시 지연/실패 가능. **로컬 Paperlogy 웹폰트(WOFF/WOFF2) 또는 TTF를 두고 `@font-face`** 로 넣는 것을 권장. (라이선스 확인 필요.)

---

## 5. 1단계 구현 시 체크리스트

- [ ] **HTML 구조**: `createPageHTML` 과 동일한 **문자열** 생성 (grid-header, grid-sep, grid-items, grid-summary, grid-footer, extended 여부). 데이터는 `invoice` 행 + `payload_json.items` 기준으로 `splitItemsIntoPages` 규칙 적용 (PC: 5행/13행 트리거).
- [ ] **클래스명**: `.invoice-page`, `.invoice-page.extended-items`, `.grid-header`, `.invoice-detail-header`, `.invoice-header-title`, `.invoice-header-meta`, `.invoice-brand-logo`, `.grid-sep`, `.grid-sep-inner`, `.grid-sep-header` / `grid-sep-price` / `grid-sep-footer`, `.grid-items`, `.invoice-section-title`, `.invoice-items-table`, `.grid-summary`, `.invoice-summary-container`, `.invoice-summary-row`, `.invoice-summary-row.total`, `.grid-footer`, `.invoice-detail-footer`, `.invoice-footer-section`, `.invoice-footer-title`, `.invoice-footer-info`, `.invoice-footer-row`, `.invoice-footer-label`, `.invoice-footer-value` — **invoice-detail-grid.css와 동일** 유지.
- [ ] **CSS**: PC 기본 규칙만 포함 (위 3.1 표). `.invoice-page` 751.4×990, padding, grid-template-rows (7행 / 5행), 구분선·테이블·Summary·푸터 스타일 전부.
- [ ] **폰트**: `@font-face` 또는 링크로 Paperlogy 적용.
- [ ] **로고**: `getLogoSvg()` 와 동일한 SVG 문자열 포함.
- [ ] **포맷 함수**: `formatIssueDate`, `formatCurrency`, `maskEmail`, `escapeHtml` — 서버(Node)에서 동일 로직 적용.

이 문서만 따라가면 invoice-detail 화면과 **동일한 스타일 코드**로 PDF용 HTML을 만들 수 있음.
