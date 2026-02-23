# 미구현 기능 구현 계획

## 📋 문서 목적
현재 시스템에서 미구현된 기능들을 정리하고, 구현 계획과 우선순위를 수립합니다.

## 📅 작성 일시
2026-01-XX

---

## 🔍 현재 상태 요약

**구현 완료**: 85%
- 주문 생성, 결제, Paid 처리, 인보이스 생성까지 정상 작동
- 회원 인보이스 조회, 보증서 조회/활성화/양도 모두 구현 완료

**미구현**: 15%
- 인보이스 이메일 발송
- 인보이스/보증서 다운로드 기능
- 비회원 인보이스 조회
- 보증서 활성화 시 환불 불가 고지 개선

---

## 📋 미구현 기능 상세

### 1. 비회원 인보이스 조회 (🔴 최우선)

#### 현재 상태
- ❌ **회원 전용**: `GET /api/invoices/:invoiceId`는 `authenticateToken` 필수
- ❌ **비회원 불가**: 비회원은 `guest_order_access_token`으로 주문은 조회 가능하나 인보이스는 불가
- ❌ **목록 조회 불가**: `GET /api/invoices/me`도 회원 전용

#### 문제점
- 비회원 주문 완료 후 인보이스를 확인할 수 없음
- 주문 확인 이메일에는 인보이스 링크가 있지만 접근 불가
- 비회원 주문 흐름이 불완전함

#### 구현 계획

##### 1-1. 비회원 인보이스 상세 조회 API
**엔드포인트**: `GET /api/guest/invoices/:invoiceId`

**인증 방식**:
- `guest_session_token` 쿠키 기반 (기존 비회원 주문 조회와 동일)
- 세션의 `order_id`와 인보이스의 `order_id` 일치 확인

**구현 위치**: `backend/invoice-routes.js`

**처리 흐름**:
1. `guest_session_token` 쿠키에서 세션 토큰 추출
2. `guest_order_sessions` 테이블에서 세션 검증
3. 세션의 `order_id`로 주문 확인
4. 주문의 `user_id IS NULL` 확인 (비회원 주문)
5. `invoices` 테이블에서 해당 주문의 인보이스 조회
6. 인보이스 반환 (회원 API와 동일한 형식)

**예상 작업 시간**: 2-3시간

##### 1-2. 비회원 인보이스 목록 조회 API
**엔드포인트**: `GET /api/guest/invoices`

**인증 방식**:
- `guest_session_token` 쿠키 기반
- 세션의 `order_id`로 해당 주문의 인보이스만 조회

**구현 위치**: `backend/invoice-routes.js`

**처리 흐름**:
1. `guest_session_token` 쿠키에서 세션 토큰 추출
2. `guest_order_sessions` 테이블에서 세션 검증
3. 세션의 `order_id`로 주문 확인
4. 해당 주문의 모든 인보이스 목록 조회
5. 인보이스 목록 반환 (회원 API와 동일한 형식)

**예상 작업 시간**: 1-2시간

**참고**: 비회원은 주문당 1개의 인보이스만 있으므로 목록은 사실상 1개 또는 0개

---

### 2. 보증서 활성화 시 환불 불가 고지 개선 (🟡 높은 우선순위)

#### 현재 상태
- ⚠️ **부분 구현**: `my-warranties.js`에서 간단한 `confirm()` 사용
- ⚠️ **고지 문구 불명확**: "활성화된 보증서는 양도 및 환불 정책이 적용됩니다."

#### 문제점
- 환불 불가 정책이 명확하지 않음
- 사용자가 활성화 후 환불 불가를 인지하지 못할 수 있음
- 법적 분쟁 가능성

#### 구현 계획

**위치**: `my-warranties.js` (192줄)

**개선 내용**:
```javascript
// 현재
const agreeText = `보증서를 활성화하시겠습니까?\n\n활성화된 보증서는 양도 및 환불 정책이 적용됩니다.`;

// 개선 후
const agreeText = `보증서를 활성화하시겠습니까?\n\n⚠️ 중요 안내\n\n보증서를 활성화하면 해당 상품은 사용 개시로 간주되어 새 상품으로 재판매가 불가능합니다.\n\n이에 따라 교환 및 환불이 제한됩니다.\n\n정말 활성화하시겠습니까?`;
```

**추가 개선 (선택사항)**:
- 모달 UI로 변경 (더 명확한 표시)
- 체크박스로 동의 확인 (단순 confirm보다 명확)

**예상 작업 시간**: 30분-1시간

---

### 3. 인보이스 이메일 발송 (🟡 중간 우선순위)

#### 현재 상태
- ❌ **발송 로직 없음**: `invoices.emailed_at` 컬럼은 있으나 사용 안 함
- ❌ **함수 없음**: `mailer.js`에 `sendInvoiceEmail` 함수 없음
- ✅ **주문 확인 이메일만 있음**: `sendOrderConfirmationEmail`만 구현됨

#### 문제점
- Paid 처리 후 인보이스가 생성되지만 이메일로 발송되지 않음
- 사용자가 인보이스를 확인하려면 마이페이지에 직접 접속해야 함

#### 구현 계획

##### 3-1. `sendInvoiceEmail` 함수 구현
**위치**: `backend/mailer.js`

**함수 시그니처**:
```javascript
async function sendInvoiceEmail(to, { invoiceNumber, invoiceId, invoiceLink, customerName = null, logoUrl = null })
```

**이메일 내용**:
- 제목: `[Pre.pMood] Digital Invoice · {invoiceNumber}`
- 인보이스 번호
- 인보이스 링크 (회원: 마이페이지 링크, 비회원: guest_session 링크)
- 주문 정보 요약
- 디지털 인보이스 확인 안내

**예상 작업 시간**: 2-3시간

##### 3-2. Paid 처리 후 이메일 발송 로직 추가
**위치**: `backend/payments-routes.js` 또는 `backend/utils/paid-order-processor.js`

**처리 흐름**:
1. `processPaidOrder()` 완료 후 인보이스 생성 확인
2. 인보이스 링크 생성
   - 회원: `/invoice-detail.html?invoiceId={invoiceId}`
   - 비회원: `/api/guest/orders/session?token={guest_order_access_token}` (주문 페이지에서 인보이스 접근)
3. `sendInvoiceEmail()` 호출
4. `invoices.emailed_at` 업데이트

**예상 작업 시간**: 1-2시간

**총 예상 작업 시간**: 3-5시간

---

### 4. 인보이스 다운로드 (PDF) (🟢 낮은 우선순위)

#### 현재 상태
- ❌ **기능 없음**: `invoice-detail.js` 596줄에 TODO 주석만 있음
- ❌ **버튼만 있음**: "결제 영수증 다운로드" 버튼은 있으나 기능 없음

#### 구현 계획

##### 4-1. PDF 생성 라이브러리 선택
**옵션**:
- `puppeteer`: HTML → PDF 변환 (렌더링 정확도 높음, 서버 리소스 많이 사용)
- `pdfkit`: 직접 PDF 생성 (가볍지만 레이아웃 구현 복잡)
- `jsPDF`: 클라이언트 사이드 (서버 부하 적음, 레이아웃 제한)

**권장**: `puppeteer` (HTML 기반이므로 기존 `invoice-detail.html` 활용 가능)

##### 4-2. PDF 생성 API 구현
**엔드포인트**: `GET /api/invoices/:invoiceId/download`

**처리 흐름**:
1. 인보이스 조회 (회원/비회원 인증)
2. 인보이스 HTML 렌더링 (기존 `invoice-detail.html` 스타일)
3. Puppeteer로 PDF 생성
4. PDF 파일 반환 (`Content-Type: application/pdf`)

**예상 작업 시간**: 4-6시간

##### 4-3. 프론트엔드 다운로드 기능 연결
**위치**: `invoice-detail.js` (596줄)

**구현**:
```javascript
document.getElementById('download-receipt-btn').addEventListener('click', async () => {
  const invoiceId = extractInvoiceIdFromUrl();
  const response = await fetch(`${API_BASE}/invoices/${invoiceId}/download`, {
    credentials: 'include'
  });
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `invoice-${invoiceId}.pdf`;
  a.click();
});
```

**예상 작업 시간**: 1시간

**총 예상 작업 시간**: 5-7시간

---

### 5. 보증서 일괄 다운로드 (🟢 낮은 우선순위)

#### 현재 상태
- ❌ **기능 없음**: `invoice-detail.js` 606줄에 TODO 주석만 있음
- ❌ **버튼만 있음**: "보증서 일괄 다운로드" 버튼은 있으나 기능 없음

#### 구현 계획

##### 5-1. 보증서 목록 조회 API
**엔드포인트**: `GET /api/invoices/:invoiceId/warranties`

**처리 흐름**:
1. 인보이스 조회 (회원/비회원 인증)
2. 인보이스의 `order_id`로 주문 확인
3. 주문의 모든 `warranties` 조회
4. 보증서 목록 반환

**예상 작업 시간**: 1-2시간

##### 5-2. 보증서 PDF 생성 및 ZIP 압축
**엔드포인트**: `GET /api/invoices/:invoiceId/warranties/download`

**처리 흐름**:
1. 인보이스의 모든 보증서 조회
2. 각 보증서를 PDF로 생성 (보증서 상세 페이지 기반)
3. ZIP 파일로 압축
4. ZIP 파일 반환 (`Content-Type: application/zip`)

**예상 작업 시간**: 3-4시간

##### 5-3. 프론트엔드 다운로드 기능 연결
**위치**: `invoice-detail.js` (606줄)

**예상 작업 시간**: 1시간

**총 예상 작업 시간**: 5-7시간

---

## 🎯 우선순위 및 구현 순서

### Phase 1: 핵심 기능 완성 (최우선)
1. **비회원 인보이스 조회** (🔴 최우선)
   - 비회원 주문 흐름 완성
   - 예상 시간: 3-5시간
   - 영향도: 높음 (비회원 주문 완성)

2. **보증서 활성화 시 환불 불가 고지 개선** (🟡 높은 우선순위)
   - 정책 명확화 및 법적 리스크 감소
   - 예상 시간: 30분-1시간
   - 영향도: 중간 (사용자 경험 및 법적 안전성)

### Phase 2: 사용자 경험 개선 (중간 우선순위)
3. **인보이스 이메일 발송** (🟡 중간 우선순위)
   - 사용자가 인보이스를 쉽게 확인 가능
   - 예상 시간: 3-5시간
   - 영향도: 중간 (사용자 편의성)

### Phase 3: 편의 기능 (낮은 우선순위)
4. **인보이스 다운로드 (PDF)** (🟢 낮은 우선순위)
   - 예상 시간: 5-7시간
   - 영향도: 낮음 (편의 기능)

5. **보증서 일괄 다운로드** (🟢 낮은 우선순위)
   - 예상 시간: 5-7시간
   - 영향도: 낮음 (편의 기능)

---

## 📊 예상 총 작업 시간

| Phase | 기능 | 예상 시간 |
|-------|------|-----------|
| Phase 1 | 비회원 인보이스 조회 | 3-5시간 |
| Phase 1 | 보증서 활성화 고지 개선 | 30분-1시간 |
| Phase 2 | 인보이스 이메일 발송 | 3-5시간 |
| Phase 3 | 인보이스 다운로드 | 5-7시간 |
| Phase 3 | 보증서 일괄 다운로드 | 5-7시간 |
| **총계** | | **17-25시간** |

---

## 🔧 기술 스택 및 의존성

### 필요한 npm 패키지
- **PDF 생성**: `puppeteer` (인보이스/보증서 다운로드용)
- **ZIP 압축**: `archiver` (보증서 일괄 다운로드용)

### 설치 명령어
```bash
npm install puppeteer archiver
```

---

## 📝 구현 시 주의사항

### 1. 비회원 인보이스 조회
- 기존 `guest_order_sessions` 인증 방식 재사용
- 세션의 `order_id`와 인보이스의 `order_id` 일치 확인 필수
- 수평 권한상승 방지 (다른 주문의 인보이스 접근 차단)

### 2. 인보이스 이메일 발송
- 회원/비회원 구분하여 링크 생성
- 이메일 발송 실패 시에도 주문 처리는 성공 유지 (비동기 처리)
- `invoices.emailed_at` 업데이트는 이메일 발송 성공 후에만

### 3. PDF 생성
- Puppeteer는 메모리 사용량이 크므로 서버 리소스 모니터링 필요
- PDF 생성 실패 시 적절한 에러 처리
- 캐싱 고려 (같은 인보이스는 재생성하지 않도록)

### 4. 보증서 활성화 고지
- 법적 요구사항 반영 확인
- 사용자가 명확히 이해할 수 있는 문구 사용
- 동의 확인은 필수

---

## ✅ 완료 조건

### Phase 1 완료 조건
- [ ] 비회원이 `guest_session_token`으로 인보이스 상세 조회 가능
- [ ] 비회원이 `guest_session_token`으로 인보이스 목록 조회 가능
- [ ] 보증서 활성화 시 환불 불가 고지 문구 개선 완료

### Phase 2 완료 조건
- [ ] Paid 처리 후 인보이스 이메일 자동 발송
- [ ] `invoices.emailed_at` 업데이트 확인
- [ ] 회원/비회원 모두 이메일 수신 가능

### Phase 3 완료 조건
- [ ] 인보이스 PDF 다운로드 기능 작동
- [ ] 보증서 일괄 다운로드 기능 작동
- [ ] 다운로드 파일 형식 정확성 확인

---

## 📚 참고 문서

- `SYSTEM_FLOW_DETAILED.md`: 시스템 전체 흐름
- `ORDER_FLOW_REVIEW.md`: 주문 흐름 점검 결과
- `backend/order-routes.js`: 비회원 주문 조회 API 참고
- `backend/mailer.js`: 이메일 발송 함수 참고

---

## 🎯 다음 단계

1. **우선순위 결정**: Phase 1부터 순차적으로 구현
2. **기술 검토**: PDF 생성 라이브러리 선택 및 테스트
3. **구현 시작**: 비회원 인보이스 조회 API부터 시작
