# 고객 문의하기 서비스 최종 설계안 검토

## ✅ 수정 반영 사항

### 1. **사용자 데이터 매핑 - 회원가입 양식 기준**

**회원가입 양식 구조 확인:**
- `lastName` (성) - 필수
- `firstName` (이름) - 필수
- `birthdate` (생년월일) - 필수
- `phone` (전화번호) - 선택
- `countryCode` (국가 코드) - 전화번호와 함께 사용

**현재 API 응답 구조:**
- `/api/auth/me`: `name` (합쳐진 이름), `phone`, `birthdate`
- DB: `last_name`, `first_name` (분리)

**해결 방안:**
```javascript
// contact.js - tryAutofillFromLogin 함수
async function tryAutofillFromLogin() {
  try {
    const res = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json' },
    });
    
    if (!res.ok) return;
    
    const data = await res.json();
    if (data.success && data.user) {
      // 이름 분리 (DB는 last_name, first_name이지만 API는 name으로 반환)
      const nameParts = (data.user.name || '').split(' ');
      if (nameParts.length >= 2) {
        els.lastName.value = nameParts[0]; // 성
        els.firstName.value = nameParts.slice(1).join(' '); // 이름
      } else if (nameParts.length === 1) {
        els.lastName.value = nameParts[0];
      }
      
      els.email.value = data.user.email || '';
      
      // 전화번호 처리 (countryCode + phone 분리)
      if (data.user.phone) {
        // 전화번호가 "+82-010-1234-5678" 형식인 경우
        const phoneMatch = data.user.phone.match(/^(\+\d{1,3})[- ]?(.+)$/);
        if (phoneMatch) {
          els.countryCode.value = phoneMatch[1]; // +82
          els.phone.value = phoneMatch[2].replace(/[^0-9]/g, ''); // 01012345678
        } else {
          els.phone.value = data.user.phone.replace(/[^0-9]/g, '');
        }
      }
    }
  } catch (_) {
    // 무시
  }
}
```

**또는 더 나은 방법:**
- `/api/auth/me-optional` 엔드포인트 추가 (optionalAuth 사용)
- 응답에 `last_name`, `first_name` 분리해서 반환

### 2. **보안 - 기존 환경에 맞춰 개선**

**현재 보안 구조:**
- CSRF: `xsrf-token` 쿠키 + `X-XSRF-TOKEN` 헤더
- Rate Limit: `express-rate-limit` 사용
- XSS 방지: `escapeHtml` 사용

**문의하기에 적용:**
```javascript
// contact.js - CSRF 토큰 처리
function getCSRFToken() {
  // 쿠키에서 xsrf-token 읽기
  const cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'xsrf-token') {
      return decodeURIComponent(value);
    }
  }
  return null;
}

// 폼 제출 시
const response = await fetch('/api/inquiries', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'X-XSRF-Token': getCSRFToken(), // CSRF 토큰 추가
  },
  body: JSON.stringify(payload),
});
```

**Rate Limit:**
```javascript
// backend/inquiry-routes.js
const { rateLimit } = require('express-rate-limit');

const inquiryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 5, // 최대 5회
  message: '너무 많은 문의 요청이 있습니다. 잠시 후 다시 시도해주세요.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // 로그인 사용자는 user_id, 비로그인은 IP
    return req.user?.userId ? `inquiry:user:${req.user.userId}` : `inquiry:ip:${req.ip}`;
  }
});
```

### 3. **관리자 문의 관리 페이지**

**기존 관리자 페이지 구조 분석:**
- `admin-layout.js`: 공통 헤더/네비게이션
- `admin-orders.js`: 주문 관리 페이지 (참고용)
- `admin-products.js`: 상품 관리 페이지 (참고용)

**문의 관리 페이지 구조 (admin-orders.js 패턴 참고):**

#### 3.1 HTML 구조 (`admin-qhf25za8/inquiries.html`)
```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>고객 문의 관리 | Pre.pMood Admin</title>
  <link rel="stylesheet" href="../assets/css/global.css">
  <link rel="stylesheet" href="admin.css">
</head>
<body>
  <!-- 관리자 헤더는 admin-layout.js에서 동적 생성됨 -->

  <main class="admin-main">
    <div class="admin-container">
      
      <!-- 상단 툴바 -->
      <div class="admin-toolbar">
        <h2>고객 문의 관리</h2>
        <div class="toolbar-actions">
          <!-- 필터: 상태 -->
          <select id="statusFilter" class="filter-select">
            <option value="">전체 상태</option>
            <option value="new">신규</option>
            <option value="in_progress">처리중</option>
            <option value="answered">답변 완료</option>
            <option value="closed">종료</option>
          </select>
          
          <!-- 필터: 관심분야 -->
          <select id="categoryFilter" class="filter-select">
            <option value="">전체 분야</option>
            <option value="I. 제품 관련 안내">제품 관련 안내</option>
            <option value="II. 구매 및 제공 가능 여부">구매 및 제공 가능 여부</option>
            <!-- ... 나머지 카테고리 -->
          </select>
          
          <!-- 검색 -->
          <input type="text" id="searchInput" placeholder="이메일/이름/접수번호" class="search-input">
          
          <button id="refreshBtn" class="btn-secondary">🔄 새로고침</button>
        </div>
      </div>

      <!-- 통계 카드 -->
      <div class="stats-cards">
        <div class="stat-card">
          <div class="stat-label">신규 문의</div>
          <div class="stat-value warning" id="newInquiries">-</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">처리중</div>
          <div class="stat-value" id="inProgressInquiries">-</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">오늘 접수</div>
          <div class="stat-value" id="todayInquiries">-</div>
        </div>
      </div>

      <!-- 문의 테이블 -->
      <div class="inquiries-table-container" id="inquiriesTableContainer" style="display: none;">
        <table class="inquiries-table">
          <thead>
            <tr>
              <th>접수번호</th>
              <th>접수일시</th>
              <th>고객 정보</th>
              <th>관심분야</th>
              <th>주제</th>
              <th>상태</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody id="inquiriesTableBody">
            <!-- JavaScript로 동적 생성 -->
          </tbody>
        </table>
      </div>

      <!-- 빈 상태 -->
      <div class="empty-state" id="emptyState" style="display: none;">
        <div class="empty-icon">📧</div>
        <h3>문의가 없습니다</h3>
      </div>

      <!-- 페이지네이션 -->
      <div class="pagination" id="pagination" style="display: none;">
        <!-- JavaScript로 동적 생성 -->
      </div>

    </div>
  </main>

  <!-- 문의 상세/답변 모달 -->
  <div class="modal" id="inquiryDetailModal">
    <div class="modal-content modal-large">
      <div class="modal-header">
        <h3 id="modalInquiryTitle">문의 상세</h3>
        <button class="modal-close" id="closeModal">&times;</button>
      </div>
      
      <div class="modal-body" id="inquiryDetailContent">
        <!-- 문의 정보 -->
        <div class="inquiry-info-section">
          <h4>고객 정보</h4>
          <div class="info-grid">
            <div><strong>접수번호:</strong> <span id="detailInquiryNumber">-</span></div>
            <div><strong>접수일시:</strong> <span id="detailCreatedAt">-</span></div>
            <div><strong>이름:</strong> <span id="detailCustomerName">-</span></div>
            <div><strong>이메일:</strong> <span id="detailEmail">-</span></div>
            <div><strong>전화번호:</strong> <span id="detailPhone">-</span></div>
            <div><strong>지역:</strong> <span id="detailRegion">-</span></div>
          </div>
        </div>

        <div class="inquiry-content-section">
          <h4>문의 내용</h4>
          <div class="content-box">
            <div><strong>관심분야:</strong> <span id="detailCategory">-</span></div>
            <div><strong>주제:</strong> <span id="detailTopic">-</span></div>
            <div><strong>메시지:</strong></div>
            <div class="message-box" id="detailMessage">-</div>
          </div>
        </div>

        <!-- 답변 작성 섹션 -->
        <div class="reply-section">
          <h4>답변 작성</h4>
          <textarea id="replyMessage" rows="5" placeholder="고객에게 답변할 내용을 입력하세요..."></textarea>
          <div class="reply-actions">
            <button id="sendReplyBtn" class="btn-primary">답변 전송</button>
            <button id="saveDraftBtn" class="btn-secondary">임시 저장</button>
          </div>
        </div>

        <!-- 답변 이력 -->
        <div class="reply-history-section">
          <h4>답변 이력</h4>
          <div id="replyHistory">
            <!-- JavaScript로 동적 생성 -->
          </div>
        </div>

        <!-- 상태 변경 -->
        <div class="status-section">
          <label>상태 변경:</label>
          <select id="statusSelect">
            <option value="new">신규</option>
            <option value="in_progress">처리중</option>
            <option value="answered">답변 완료</option>
            <option value="closed">종료</option>
          </select>
          <button id="updateStatusBtn" class="btn-secondary">상태 변경</button>
        </div>

        <!-- 관리자 메모 -->
        <div class="memo-section">
          <label>관리자 메모:</label>
          <textarea id="adminMemo" rows="3" placeholder="내부 메모 (고객에게 보이지 않음)"></textarea>
          <button id="saveMemoBtn" class="btn-secondary">메모 저장</button>
        </div>
      </div>
      
      <div class="modal-footer">
        <button class="btn-secondary" id="closeDetailBtn">닫기</button>
      </div>
    </div>
  </div>

  <!-- 공통 레이아웃 스크립트 -->
  <script src="admin-layout.js"></script>
  <script src="admin-inquiries.js"></script>
  <script>
    // 관리자 페이지 초기화
    initAdminLayout('inquiries').then(() => {
      // 페이지별 초기화
      if (typeof initInquiriesPage === 'function') {
        initInquiriesPage();
      }
    });
  </script>
</body>
</html>
```

#### 3.2 JavaScript 구조 (`admin-qhf25za8/admin-inquiries.js`)
```javascript
// admin-inquiries.js - 고객 문의 관리 페이지 스크립트

(function() {
  'use strict';

  const API_BASE = '/api';
  let currentPage = 0;
  const PAGE_SIZE = 20;
  let allInquiries = [];
  let currentInquiryId = null;

  // DOM 요소
  const elements = {
    loadingState: document.getElementById('loadingState'),
    inquiriesTableContainer: document.getElementById('inquiriesTableContainer'),
    inquiriesTableBody: document.getElementById('inquiriesTableBody'),
    emptyState: document.getElementById('emptyState'),
    statusFilter: document.getElementById('statusFilter'),
    categoryFilter: document.getElementById('categoryFilter'),
    searchInput: document.getElementById('searchInput'),
    refreshBtn: document.getElementById('refreshBtn'),
    pagination: document.getElementById('pagination'),
    newInquiries: document.getElementById('newInquiries'),
    inProgressInquiries: document.getElementById('inProgressInquiries'),
    todayInquiries: document.getElementById('todayInquiries'),
    inquiryDetailModal: document.getElementById('inquiryDetailModal'),
    closeModal: document.getElementById('closeModal'),
    closeDetailBtn: document.getElementById('closeDetailBtn'),
    inquiryDetailContent: document.getElementById('inquiryDetailContent'),
    modalInquiryTitle: document.getElementById('modalInquiryTitle'),
    // 답변 관련
    replyMessage: document.getElementById('replyMessage'),
    sendReplyBtn: document.getElementById('sendReplyBtn'),
    saveDraftBtn: document.getElementById('saveDraftBtn'),
    replyHistory: document.getElementById('replyHistory'),
    // 상태 변경
    statusSelect: document.getElementById('statusSelect'),
    updateStatusBtn: document.getElementById('updateStatusBtn'),
    // 메모
    adminMemo: document.getElementById('adminMemo'),
    saveMemoBtn: document.getElementById('saveMemoBtn')
  };

  // 초기화
  async function initInquiriesPage() {
    setupEventListeners();
    await loadInquiries();
    loadStats();
  }

  // 이벤트 리스너 설정
  function setupEventListeners() {
    elements.statusFilter.addEventListener('change', () => {
      currentPage = 0;
      loadInquiries();
    });

    elements.categoryFilter.addEventListener('change', () => {
      currentPage = 0;
      loadInquiries();
    });

    let searchTimeout;
    elements.searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentPage = 0;
        loadInquiries();
      }, 500);
    });

    elements.refreshBtn.addEventListener('click', () => {
      loadInquiries();
      loadStats();
    });

    // 모달 닫기
    elements.closeModal.addEventListener('click', closeModal);
    elements.closeDetailBtn.addEventListener('click', closeModal);
    elements.inquiryDetailModal.addEventListener('click', (e) => {
      if (e.target === elements.inquiryDetailModal) {
        closeModal();
      }
    });

    // 답변 전송
    elements.sendReplyBtn.addEventListener('click', sendReply);
    
    // 상태 변경
    elements.updateStatusBtn.addEventListener('click', updateStatus);
    
    // 메모 저장
    elements.saveMemoBtn.addEventListener('click', saveMemo);
  }

  // 문의 목록 로드
  async function loadInquiries() {
    const status = elements.statusFilter.value;
    const category = elements.categoryFilter.value;
    const search = elements.searchInput.value.trim();

    elements.loadingState.style.display = 'block';
    elements.inquiriesTableContainer.style.display = 'none';
    elements.emptyState.style.display = 'none';

    try {
      const params = new URLSearchParams({
        limit: PAGE_SIZE,
        offset: currentPage * PAGE_SIZE
      });

      if (status) params.append('status', status);
      if (category) params.append('category', category);
      if (search) params.append('search', search);

      const response = await fetch(`${API_BASE}/admin/inquiries?${params}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      allInquiries = data.inquiries || [];

      elements.loadingState.style.display = 'none';

      if (allInquiries.length === 0) {
        elements.emptyState.style.display = 'block';
        return;
      }

      renderInquiriesTable(allInquiries);
      renderPagination(data.pagination);

      elements.inquiriesTableContainer.style.display = 'block';

    } catch (error) {
      console.error('문의 로드 실패:', error.message);
      elements.loadingState.style.display = 'none';
      alert('문의 목록을 불러오는데 실패했습니다.');
    }
  }

  // 테이블 렌더링
  function renderInquiriesTable(inquiries) {
    elements.inquiriesTableBody.innerHTML = inquiries.map(inquiry => {
      const statusBadge = getStatusBadge(inquiry.status);
      const createdDate = new Date(inquiry.created_at).toLocaleDateString('ko-KR');
      const createdTime = new Date(inquiry.created_at).toLocaleTimeString('ko-KR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });

      return `
        <tr>
          <td>${escapeHtml(inquiry.inquiry_number || inquiry.id)}</td>
          <td>${createdDate}<br/>${createdTime}</td>
          <td>
            ${escapeHtml(inquiry.first_name)} ${escapeHtml(inquiry.last_name)}<br/>
            <small>${escapeHtml(inquiry.email)}</small>
          </td>
          <td>${escapeHtml(inquiry.category)}</td>
          <td>${escapeHtml(inquiry.topic)}</td>
          <td>${statusBadge}</td>
          <td>
            <button class="btn-small btn-primary" onclick="openInquiryDetail(${inquiry.id})">
              상세보기
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 상태 배지
  function getStatusBadge(status) {
    const badges = {
      'new': '<span class="badge badge-warning">신규</span>',
      'in_progress': '<span class="badge badge-info">처리중</span>',
      'answered': '<span class="badge badge-success">답변 완료</span>',
      'closed': '<span class="badge badge-secondary">종료</span>'
    };
    return badges[status] || status;
  }

  // 문의 상세 열기
  async function openInquiryDetail(inquiryId) {
    currentInquiryId = inquiryId;
    
    try {
      const response = await fetch(`${API_BASE}/admin/inquiries/${inquiryId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const inquiry = data.inquiry;

      // 모달 내용 채우기
      document.getElementById('detailInquiryNumber').textContent = inquiry.inquiry_number || inquiry.id;
      document.getElementById('detailCreatedAt').textContent = new Date(inquiry.created_at).toLocaleString('ko-KR');
      document.getElementById('detailCustomerName').textContent = `${inquiry.first_name} ${inquiry.last_name}`;
      document.getElementById('detailEmail').textContent = inquiry.email;
      document.getElementById('detailPhone').textContent = inquiry.phone || '-';
      document.getElementById('detailRegion').textContent = inquiry.region || '-';
      document.getElementById('detailCategory').textContent = inquiry.category;
      document.getElementById('detailTopic').textContent = inquiry.topic;
      document.getElementById('detailMessage').textContent = inquiry.message;
      
      // 상태 선택
      elements.statusSelect.value = inquiry.status;
      
      // 관리자 메모
      elements.adminMemo.value = inquiry.admin_memo || '';

      // 답변 이력 로드
      await loadReplyHistory(inquiryId);

      // 모달 열기
      elements.inquiryDetailModal.classList.add('show');

    } catch (error) {
      console.error('문의 상세 로드 실패:', error.message);
      alert('문의 정보를 불러오는데 실패했습니다.');
    }
  }

  // 답변 이력 로드
  async function loadReplyHistory(inquiryId) {
    try {
      const response = await fetch(`${API_BASE}/admin/inquiries/${inquiryId}/replies`, {
        credentials: 'include'
      });

      if (!response.ok) {
        elements.replyHistory.innerHTML = '<p>답변 이력을 불러올 수 없습니다.</p>';
        return;
      }

      const data = await response.json();
      const replies = data.replies || [];

      if (replies.length === 0) {
        elements.replyHistory.innerHTML = '<p>아직 답변이 없습니다.</p>';
        return;
      }

      elements.replyHistory.innerHTML = replies.map(reply => `
        <div class="reply-item">
          <div class="reply-header">
            <strong>${escapeHtml(reply.admin_name || '관리자')}</strong>
            <span class="reply-date">${new Date(reply.created_at).toLocaleString('ko-KR')}</span>
          </div>
          <div class="reply-content">${escapeHtml(reply.message)}</div>
        </div>
      `).join('');

    } catch (error) {
      console.error('답변 이력 로드 실패:', error.message);
      elements.replyHistory.innerHTML = '<p>답변 이력을 불러올 수 없습니다.</p>';
    }
  }

  // 답변 전송
  async function sendReply() {
    if (!currentInquiryId) return;

    const message = elements.replyMessage.value.trim();
    if (!message) {
      alert('답변 내용을 입력해주세요.');
      return;
    }

    try {
      const csrfToken = getCSRFToken();
      const response = await fetch(`${API_BASE}/admin/inquiries/${currentInquiryId}/reply`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-XSRF-Token': csrfToken
        },
        body: JSON.stringify({
          message: message
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        alert('답변이 전송되었습니다.');
        elements.replyMessage.value = '';
        
        // 답변 이력 새로고침
        await loadReplyHistory(currentInquiryId);
        
        // 문의 목록 새로고침
        await loadInquiries();
        loadStats();
      }

    } catch (error) {
      console.error('답변 전송 실패:', error.message);
      alert('답변 전송에 실패했습니다.');
    }
  }

  // 상태 변경
  async function updateStatus() {
    if (!currentInquiryId) return;

    const status = elements.statusSelect.value;

    try {
      const csrfToken = getCSRFToken();
      const response = await fetch(`${API_BASE}/admin/inquiries/${currentInquiryId}/status`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-XSRF-Token': csrfToken
        },
        body: JSON.stringify({
          status: status
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      alert('상태가 변경되었습니다.');
      await loadInquiries();
      loadStats();

    } catch (error) {
      console.error('상태 변경 실패:', error.message);
      alert('상태 변경에 실패했습니다.');
    }
  }

  // 메모 저장
  async function saveMemo() {
    if (!currentInquiryId) return;

    const memo = elements.adminMemo.value.trim();

    try {
      const csrfToken = getCSRFToken();
      const response = await fetch(`${API_BASE}/admin/inquiries/${currentInquiryId}/memo`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-XSRF-Token': csrfToken
        },
        body: JSON.stringify({
          admin_memo: memo
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      alert('메모가 저장되었습니다.');

    } catch (error) {
      console.error('메모 저장 실패:', error.message);
      alert('메모 저장에 실패했습니다.');
    }
  }

  // 통계 로드
  async function loadStats() {
    try {
      const response = await fetch(`${API_BASE}/admin/inquiries/stats`, {
        credentials: 'include'
      });

      if (!response.ok) return;

      const data = await response.json();
      if (data.success) {
        elements.newInquiries.textContent = data.stats.new || 0;
        elements.inProgressInquiries.textContent = data.stats.in_progress || 0;
        elements.todayInquiries.textContent = data.stats.today || 0;
      }

    } catch (error) {
      console.error('통계 로드 실패:', error.message);
    }
  }

  // 모달 닫기
  function closeModal() {
    elements.inquiryDetailModal.classList.remove('show');
    currentInquiryId = null;
  }

  // CSRF 토큰 가져오기
  function getCSRFToken() {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'xsrf-token') {
        return decodeURIComponent(value);
      }
    }
    return null;
  }

  // 페이지네이션 렌더링 (admin-orders.js 참고)
  function renderPagination(pagination) {
    // admin-orders.js의 renderPagination 함수 참고
  }

  // 전역 함수 (HTML에서 호출)
  window.openInquiryDetail = openInquiryDetail;

  // 전역 초기화 함수
  window.initInquiriesPage = initInquiriesPage;

})();
```

#### 3.3 백엔드 API 구조

**필요한 엔드포인트:**
```javascript
// backend/inquiry-routes.js

// 1. 문의 접수 (공개)
POST /api/inquiries
- optionalAuth (로그인 선택)
- inquiryLimiter (rate limit)
- verifyCSRF (CSRF 보호)
- 허니팟 필드 체크
- 문의 저장

// 2. 문의 목록 조회 (관리자)
GET /api/admin/inquiries
- authenticateToken
- requireAdmin
- 쿼리: status, category, search, limit, offset
- 페이지네이션

// 3. 문의 상세 조회 (관리자)
GET /api/admin/inquiries/:id
- authenticateToken
- requireAdmin

// 4. 답변 전송 (관리자)
POST /api/admin/inquiries/:id/reply
- authenticateToken
- requireAdmin
- verifyCSRF
- 이메일 발송 (고객에게)

// 5. 상태 변경 (관리자)
PUT /api/admin/inquiries/:id/status
- authenticateToken
- requireAdmin
- verifyCSRF

// 6. 메모 저장 (관리자)
PUT /api/admin/inquiries/:id/memo
- authenticateToken
- requireAdmin
- verifyCSRF

// 7. 통계 조회 (관리자)
GET /api/admin/inquiries/stats
- authenticateToken
- requireAdmin
```

#### 3.4 DB 구조 (답변 이력 포함)

```sql
CREATE TABLE inquiries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  inquiry_number VARCHAR(20) UNIQUE NOT NULL, -- INQ-20250101-001 형식
  user_id BIGINT NULL, -- 로그인 사용자 (NULL 허용)

  -- 고객 정보
  salutation VARCHAR(10) NOT NULL,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(120) NOT NULL,
  region VARCHAR(10) NOT NULL,
  city VARCHAR(80) NULL,
  country_code VARCHAR(10) NULL,
  phone VARCHAR(30) NULL,

  -- 문의 내용
  category VARCHAR(80) NOT NULL,
  topic VARCHAR(120) NOT NULL,
  message TEXT NOT NULL,
  privacy_consent TINYINT(1) NOT NULL DEFAULT 0,

  -- 관리
  status ENUM('new','in_progress','answered','closed') NOT NULL DEFAULT 'new',
  admin_memo TEXT NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_category (category),
  INDEX idx_created_at (created_at),
  INDEX idx_inquiry_number (inquiry_number)
);

-- 답변 이력 테이블
CREATE TABLE inquiry_replies (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  inquiry_id BIGINT NOT NULL,
  admin_user_id BIGINT NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_inquiry_id (inquiry_id),
  INDEX idx_created_at (created_at)
);
```

#### 3.5 admin-layout.js 수정

```javascript
// admin-layout.js의 NAV_MENU에 추가
const NAV_MENU = [
  { id: 'products', label: '상품 관리', href: 'products.html' },
  { id: 'orders', label: '주문 관리', href: 'orders.html' },
  { id: 'inquiries', label: '고객 문의', href: 'inquiries.html' }, // 활성화
];
```

## 📋 최종 검토 결과

### ✅ 잘 설계된 부분

1. **회원가입 양식 기준 매핑** - 적절함
2. **보안 구조** - 기존 환경과 일치
3. **관리자 페이지 구조** - admin-orders.js 패턴 따름
4. **답변 기능** - 이메일 발송 포함 적절

### ⚠️ 추가 고려사항

1. **접수번호 생성 규칙**
   - 형식: `INQ-YYYYMMDD-XXX` (예: `INQ-20250101-001`)
   - 일별 순차 증가

2. **이메일 발송**
   - 답변 전송 시 고객에게 자동 이메일
   - MailerSend 또는 Nodemailer 사용

3. **답변 이력 관리**
   - `inquiry_replies` 테이블로 이력 관리
   - 관리자 이름 표시

4. **XSS 방지**
   - 모든 사용자 입력 `escapeHtml` 처리
   - 관리자 메모도 XSS 방지

5. **에러 처리**
   - 사용자 친화적 에러 메시지
   - 관리자에게는 상세 로그

## ✅ 최종 평가

**설계안이 매우 잘 구성되었습니다.**

다만 다음 사항만 확인하면 됩니다:
1. ✅ 사용자 데이터 매핑 - 회원가입 양식 기준으로 수정 완료
2. ✅ 보안 - 기존 환경(CSRF, Rate Limit) 반영 완료
3. ✅ 관리자 페이지 - admin-orders.js 패턴 따름 적절

**구현 준비 완료 상태입니다.**







