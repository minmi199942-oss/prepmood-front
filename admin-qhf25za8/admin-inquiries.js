// admin-inquiries.js - 고객 문의 관리 페이지 스크립트

(function() {
  'use strict';

  // API 설정
  const API_ROOT = (window.location && window.location.origin) 
    ? window.location.origin.replace(/\/$/, '') 
    : '';
  const API = `${API_ROOT}/api`;

  let currentPage = 0;
  const PAGE_SIZE = 20;
  let currentInquiryId = null;
  let isActionBusy = false; // 액션 중복 실행 방지
  let refreshSeq = 0; // refreshCurrentInquiry 경합 방지

  // CSRF 토큰 가져오기 헬퍼
  function getCsrfToken() {
    // utils.js의 getCookie 사용 (없으면 직접 구현)
    if (typeof getCookie === 'function') {
      return getCookie('xsrf-token');
    }
    // 직접 구현
    const value = `; ${document.cookie}`;
    const parts = value.split(`; xsrf-token=`);
    if (parts.length === 2) {
      return parts.pop().split(';').shift();
    }
    return null;
  }

  // DOM 요소
  const elements = {
    loadingState: document.getElementById('loadingState'),
    inquiriesTableContainer: document.getElementById('inquiriesTableContainer'),
    inquiriesTableBody: document.getElementById('inquiriesTableBody'),
    emptyState: document.getElementById('emptyState'),
    statusFilter: document.getElementById('statusFilter'),
    categoryFilter: document.getElementById('categoryFilter'),
    dateFrom: document.getElementById('dateFrom'),
    dateTo: document.getElementById('dateTo'),
    searchInput: document.getElementById('searchInput'),
    searchBtn: document.getElementById('searchBtn'),
    resetBtn: document.getElementById('resetBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    pagination: document.getElementById('pagination'),
    newInquiries: document.getElementById('newInquiries'),
    inProgressInquiries: document.getElementById('inProgressInquiries'),
    todayInquiries: document.getElementById('todayInquiries'),
    inquiryDetailPanel: document.getElementById('inquiryDetailPanel'),
    closePanelBtn: document.getElementById('closePanelBtn'),
    inquiryDetailContent: document.getElementById('inquiryDetailContent'),
    replyMessage: document.getElementById('replyMessage'),
    sendReplyBtn: document.getElementById('sendReplyBtn'),
    statusSelect: document.getElementById('statusSelect'),
    updateStatusBtn: document.getElementById('updateStatusBtn'),
    adminMemo: document.getElementById('adminMemo'),
    saveMemoBtn: document.getElementById('saveMemoBtn'),
    replyHistoryContent: document.getElementById('replyHistoryContent')
  };

  // ============================================
  // 초기화
  // ============================================
  function initInquiriesPage() {
    setupEventListeners();
    loadInquiries();
    loadStats();
  }

  // ============================================
  // 이벤트 리스너 설정
  // ============================================
  function setupEventListeners() {
    // 필터 변경 (필터 변경 시 패널 닫기)
    elements.statusFilter.addEventListener('change', () => {
      currentPage = 0;
      if (currentInquiryId) closeDetailPanel();
      loadInquiries();
    });

    elements.categoryFilter.addEventListener('change', () => {
      currentPage = 0;
      if (currentInquiryId) closeDetailPanel();
      loadInquiries();
    });

    // 날짜 필터
    elements.dateFrom.addEventListener('change', () => {
      currentPage = 0;
      if (currentInquiryId) closeDetailPanel();
      loadInquiries();
    });

    elements.dateTo.addEventListener('change', () => {
      currentPage = 0;
      if (currentInquiryId) closeDetailPanel();
      loadInquiries();
    });

    // 빠른 날짜 선택
    document.querySelectorAll('.quick-date-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const days = parseInt(this.dataset.days);
        setQuickDateRange(days);
        currentPage = 0;
        if (currentInquiryId) closeDetailPanel();
        loadInquiries();
      });
    });

    // 검색
    elements.searchBtn.addEventListener('click', () => {
      currentPage = 0;
      if (currentInquiryId) closeDetailPanel();
      loadInquiries();
    });

    elements.searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        currentPage = 0;
        if (currentInquiryId) closeDetailPanel();
        loadInquiries();
      }
    });

    // 초기화
    elements.resetBtn.addEventListener('click', () => {
      resetFilters();
      currentPage = 0;
      loadInquiries();
    });

    // 새로고침
    elements.refreshBtn.addEventListener('click', () => {
      loadInquiries();
      loadStats();
    });

    // 하단 패널 닫기
    elements.closePanelBtn.addEventListener('click', () => {
      closeDetailPanel();
    });

    // 답변 전송
    elements.sendReplyBtn.addEventListener('click', sendReply);

    // 상태 변경
    elements.updateStatusBtn.addEventListener('click', updateStatus);

    // 메모 저장
    elements.saveMemoBtn.addEventListener('click', saveMemo);
  }

  // ============================================
  // 빠른 날짜 범위 설정
  // ============================================
  function setQuickDateRange(days) {
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - days);
    
    elements.dateFrom.value = fromDate.toISOString().split('T')[0];
    elements.dateTo.value = today.toISOString().split('T')[0];

    // 활성화 표시
    document.querySelectorAll('.quick-date-btn').forEach(btn => {
      btn.classList.remove('active');
      if (parseInt(btn.dataset.days) === days) {
        btn.classList.add('active');
      }
    });
  }

  // ============================================
  // 필터 초기화
  // ============================================
  function resetFilters() {
    elements.statusFilter.value = '';
    elements.categoryFilter.value = '';
    elements.dateFrom.value = '';
    elements.dateTo.value = '';
    elements.searchInput.value = '';
    
    document.querySelectorAll('.quick-date-btn').forEach(btn => {
      btn.classList.remove('active');
    });
  }

  // ============================================
  // 문의 목록 로드
  // ============================================
  async function loadInquiries() {
    const status = elements.statusFilter.value;
    const category = elements.categoryFilter.value;
    const dateFrom = elements.dateFrom.value;
    const dateTo = elements.dateTo.value;
    const search = elements.searchInput.value.trim();

    elements.loadingState.style.display = 'block';
    elements.inquiriesTableContainer.style.display = 'none';
    elements.emptyState.style.display = 'none';
    elements.pagination.style.display = 'none';

    try {
      const params = new URLSearchParams({
        limit: PAGE_SIZE,
        offset: currentPage * PAGE_SIZE
      });

      if (status) params.append('status', status);
      if (category) params.append('category', category);
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo) params.append('date_to', dateTo);
      if (search) params.append('search', search);

      const response = await fetch(`${API}/admin/inquiries?${params}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      elements.loadingState.style.display = 'none';

      if (!data.inquiries || data.inquiries.length === 0) {
        elements.emptyState.style.display = 'block';
        // 목록이 비어지면 패널 닫기 (필터 변경 시)
        if (currentInquiryId) {
          closeDetailPanel();
        }
        return;
      }

      renderInquiriesTable(data.inquiries);
      renderPagination(data.pagination);

      elements.inquiriesTableContainer.style.display = 'block';
      elements.pagination.style.display = 'flex';

    } catch (error) {
      console.error('문의 목록 로드 실패:', error.message);
      alert('문의 목록을 불러오는데 실패했습니다.');
      elements.loadingState.style.display = 'none';
    }
  }

  // ============================================
  // 안전한 날짜 포맷팅
  // ============================================
  function safeDate(dateValue) {
    if (!dateValue) return '-';
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return '-';
      return date.toLocaleString('ko-KR');
    } catch (error) {
      return '-';
    }
  }

  // ============================================
  // 문의 테이블 렌더링
  // ============================================
  function renderInquiriesTable(inquiries) {
    elements.inquiriesTableBody.innerHTML = inquiries.map(inquiry => {
      const createdAt = safeDate(inquiry.created_at);
      const customerName = `${inquiry.last_name || ''}${inquiry.first_name || ''}`.trim() || '-';
      
      return `
        <tr data-inquiry-id="${inquiry.id}" onclick="window.openInquiryDetail(${inquiry.id})">
          <td>${createdAt}</td>
          <td>${renderStatusBadge(inquiry.status)}</td>
          <td class="category-cell">${escapeHtml(inquiry.category || '-')}</td>
          <td class="topic-cell">${escapeHtml(inquiry.topic || '-')}</td>
          <td>${escapeHtml(customerName)}</td>
          <td>${escapeHtml(inquiry.email || '-')}</td>
          <td>${escapeHtml(inquiry.inquiry_number || '-')}</td>
        </tr>
      `;
    }).join('');

    // 목록 새로고침 후에도 선택 상태 유지
    if (currentInquiryId) {
      selectRow(currentInquiryId);
    }
  }

  // ============================================
  // 행 선택
  // ============================================
  function selectRow(inquiryId) {
    document.querySelectorAll('.inquiries-table tbody tr').forEach(tr => {
      tr.classList.remove('selected');
      if (parseInt(tr.dataset.inquiryId) === inquiryId) {
        tr.classList.add('selected');
      }
    });
  }

  // ============================================
  // 상태 배지 렌더링
  // ============================================
  function renderStatusBadge(status) {
    const statusMap = {
      'new': { label: '신규', class: 'badge-warning' },
      'in_progress': { label: '처리중', class: 'badge-info' },
      'answered': { label: '답변 완료', class: 'badge-success' },
      'closed': { label: '종료', class: 'badge-secondary' }
    };

    const { label, class: className } = statusMap[status] || { label: status, class: 'badge-secondary' };
    return `<span class="badge ${className}">${label}</span>`;
  }

  // ============================================
  // 페이지네이션 렌더링
  // ============================================
  function renderPagination(pagination) {
    const totalPages = Math.ceil(pagination.total / pagination.limit);
    const currentPageNum = Math.floor(pagination.offset / pagination.limit);

    let html = '';

    // 이전 페이지
    html += `<button ${currentPageNum === 0 ? 'disabled' : ''} onclick="window.changePage(${currentPageNum - 1})">이전</button>`;

    // 페이지 번호 (최대 5개)
    const startPage = Math.max(0, currentPageNum - 2);
    const endPage = Math.min(totalPages, startPage + 5);

    for (let i = startPage; i < endPage; i++) {
      html += `<button class="${i === currentPageNum ? 'active' : ''}" onclick="window.changePage(${i})">${i + 1}</button>`;
    }

    // 다음 페이지
    html += `<button ${!pagination.hasMore ? 'disabled' : ''} onclick="window.changePage(${currentPageNum + 1})">다음</button>`;

    elements.pagination.innerHTML = html;
  }

  // ============================================
  // 페이지 변경
  // ============================================
  window.changePage = function(page) {
    currentPage = page;
    loadInquiries();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ============================================
  // 통계 로드
  // ============================================
  async function loadStats() {
    try {
      const safeFetch = window.secureFetch || fetch;
      
      const response = await safeFetch(`${API}/admin/inquiries/stats`, {
        credentials: 'include'
      });

      if (!response.ok) {
        // 에러 응답 본문 확인
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
          console.error('[통계 API] 에러 응답:', errorData);
        } catch (e) {
          // JSON 파싱 실패 시 무시
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.success && data.stats) {
        elements.newInquiries.textContent = data.stats.new_count || 0;
        elements.inProgressInquiries.textContent = data.stats.in_progress_count || 0;
        elements.todayInquiries.textContent = data.stats.today_count || 0;
      } else {
        console.warn('[통계 API] 응답 형식 오류:', data);
        elements.newInquiries.textContent = '-';
        elements.inProgressInquiries.textContent = '-';
        elements.todayInquiries.textContent = '-';
      }

    } catch (error) {
      console.warn('통계 로드 실패 (무시됨):', error.message);
      // 통계가 없어도 기본값 표시
      elements.newInquiries.textContent = '-';
      elements.inProgressInquiries.textContent = '-';
      elements.todayInquiries.textContent = '-';
    }
  }

  // ============================================
  // 문의 상세 보기
  // ============================================
  window.openInquiryDetail = async function(inquiryId) {
    try {
      currentInquiryId = inquiryId;

      // 행 선택 표시
      selectRow(inquiryId);

      // 하단 패널 표시
      elements.inquiryDetailPanel.classList.add('show');
      document.body.classList.add('panel-open');

      // 상세 정보 로드
      const inquiryResponse = await fetch(`${API}/admin/inquiries/${inquiryId}`, {
        credentials: 'include'
      });

      // 권한 만료 체크
      if (inquiryResponse.status === 401 || inquiryResponse.status === 403) {
        alert('로그인이 만료되었습니다. 다시 로그인해주세요.');
        closeDetailPanel();
        window.location.href = 'login.html';
        return;
      }

      if (!inquiryResponse.ok) {
        throw new Error(`HTTP ${inquiryResponse.status}`);
      }

      const inquiryData = await inquiryResponse.json();
      if (inquiryData.success) {
        renderInquiryDetail(inquiryData.inquiry || inquiryData);
      }

      // replies는 선택 호출 (있으면 쓰고, 없으면 무시)
      try {
        const repliesResponse = await fetch(`${API}/admin/inquiries/${inquiryId}/replies`, {
          credentials: 'include'
        });
        if (repliesResponse.ok) {
          const repliesData = await repliesResponse.json();
          if (repliesData.success) {
            renderReplyHistory(repliesData.replies || []);
          } else {
            renderReplyHistory([]);
          }
        } else {
          renderReplyHistory([]);
        }
      } catch (error) {
        // replies 엔드포인트가 없어도 상세는 정상 표시
        console.warn('답변 이력 로드 실패 (무시됨):', error.message);
        renderReplyHistory([]);
      }

    } catch (error) {
      console.error('문의 상세 로드 실패:', error.message);
      alert('문의 정보를 불러오는데 실패했습니다.');
    }
  };

  // ============================================
  // 문의 상세 렌더링
  // ============================================
  function renderInquiryDetail(inquiry) {
    const createdAt = safeDate(inquiry.created_at);
    const customerName = `${inquiry.last_name || ''}${inquiry.first_name || ''}`.trim() || '-';
    const phone = inquiry.country_code && inquiry.phone 
      ? `${inquiry.country_code} ${inquiry.phone}` 
      : (inquiry.phone || '-');
    
    elements.inquiryDetailContent.innerHTML = `
      <div class="detail-item">
        <div class="detail-label">접수번호</div>
        <div class="detail-value">${escapeHtml(inquiry.inquiry_number || `#${inquiry.id}`)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">접수일시</div>
        <div class="detail-value">${createdAt}</div>
      </div>
      <h4>고객 정보</h4>
      <div class="detail-item">
        <div class="detail-label">이름</div>
        <div class="detail-value">${escapeHtml(customerName || '-')}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">이메일</div>
        <div class="detail-value">${escapeHtml(inquiry.email || '-')}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">전화번호</div>
        <div class="detail-value">${escapeHtml(phone)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">지역</div>
        <div class="detail-value">${escapeHtml(inquiry.region || '-')} ${escapeHtml(inquiry.city || '')}</div>
      </div>
      <h4>문의 내용</h4>
      <div class="detail-item">
        <div class="detail-label">문의유형</div>
        <div class="detail-value">${escapeHtml(inquiry.category || '-')}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">주제</div>
        <div class="detail-value">${escapeHtml(inquiry.topic || '-')}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">문의내용</div>
        <div class="detail-value" style="white-space: pre-wrap; line-height: 1.6;">${escapeHtml(inquiry.message || '-')}</div>
      </div>
    `;

    // 상태 선택 박스 업데이트
    elements.statusSelect.value = inquiry.status || 'new';
    
    // 관리자 메모 업데이트
    elements.adminMemo.value = inquiry.admin_memo || '';
  }

  // ============================================
  // 답변 이력 렌더링
  // ============================================
  function renderReplyHistory(replies) {
    if (!replies || replies.length === 0) {
      elements.replyHistoryContent.innerHTML = '<p style="color: #6c757d; font-size: 0.875rem;">답변이 없습니다.</p>';
      return;
    }

    elements.replyHistoryContent.innerHTML = replies.map(reply => {
      const createdAt = safeDate(reply.created_at);
      const adminName = reply.admin_first_name && reply.admin_last_name
        ? `${reply.admin_last_name}${reply.admin_first_name}`
        : (reply.admin_email || '관리자');
      
      const emailStatusBadge = reply.email_status === 'sent' 
        ? '<span class="badge badge-success" style="font-size: 0.7rem;">이메일 발송됨</span>'
        : reply.email_status === 'failed'
        ? `<span class="badge badge-danger" style="font-size: 0.7rem;">이메일 발송 실패</span>`
        : '';

      return `
        <div class="reply-item">
          <div class="reply-item-header">
            <span class="reply-item-author">${escapeHtml(adminName)}</span>
            <span class="reply-item-date">${createdAt}</span>
          </div>
          <div class="reply-item-message">${escapeHtml(reply.message || '')}</div>
          ${emailStatusBadge ? `<div class="reply-item-status">${emailStatusBadge}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  // ============================================
  // 하단 패널 닫기
  // ============================================
  function closeDetailPanel() {
    elements.inquiryDetailPanel.classList.remove('show');
    document.body.classList.remove('panel-open');
    currentInquiryId = null;
    
    // 행 선택 해제
    selectRow(null);
  }

  // ============================================
  // 현재 문의 새로고침 (상세 + 답변 이력 + 목록 + 통계)
  // ============================================
  async function refreshCurrentInquiry() {
    if (!currentInquiryId) return;

    // 마지막 호출만 반영하도록 보호
    const requestId = ++refreshSeq;

    try {
      // 상세 정보 재조회
      const inquiryResponse = await fetch(`${API}/admin/inquiries/${currentInquiryId}`, {
        credentials: 'include'
      });

      // 권한 만료 체크
      if (inquiryResponse.status === 401 || inquiryResponse.status === 403) {
        alert('로그인이 만료되었습니다. 다시 로그인해주세요.');
        closeDetailPanel();
        window.location.href = 'login.html';
        return;
      }

      if (inquiryResponse.ok) {
        const inquiryData = await inquiryResponse.json();
        // 마지막 요청인지 확인
        if (requestId !== refreshSeq) return;
        
        if (inquiryData.success) {
          renderInquiryDetail(inquiryData.inquiry || inquiryData);
        }
      }

      // 답변 이력 재조회
      try {
        const repliesResponse = await fetch(`${API}/admin/inquiries/${currentInquiryId}/replies`, {
          credentials: 'include'
        });
        if (repliesResponse.ok) {
          const repliesData = await repliesResponse.json();
          // 마지막 요청인지 확인
          if (requestId !== refreshSeq) return;
          
          if (repliesData.success) {
            renderReplyHistory(repliesData.replies || []);
          }
        }
      } catch (error) {
        console.warn('답변 이력 재조회 실패 (무시됨):', error.message);
      }

      // 목록 재조회
      await loadInquiries();
      // 마지막 요청인지 확인
      if (requestId !== refreshSeq) return;

      // 통계 재조회
      loadStats();

    } catch (error) {
      console.error('현재 문의 새로고침 실패:', error.message);
    }
  }

  // ============================================
  // 답변 전송
  // ============================================
  async function sendReply() {
    if (isActionBusy) return;
    
    if (!currentInquiryId) {
      alert('문의를 선택해주세요.');
      return;
    }

    const message = elements.replyMessage.value.trim();
    if (!message) {
      alert('답변 내용을 입력해주세요.');
      elements.replyMessage.focus();
      return;
    }

    // 액션 잠금
    isActionBusy = true;
    elements.sendReplyBtn.disabled = true;
    elements.updateStatusBtn.disabled = true;
    elements.saveMemoBtn.disabled = true;
    elements.sendReplyBtn.textContent = '전송 중...';

    try {
      // secureFetch 폴백
      const safeFetch = window.secureFetch || fetch;
      
      // CSRF 토큰 가져오기
      const csrfToken = getCsrfToken();
      const headers = {
        'Content-Type': 'application/json'
      };
      if (csrfToken) {
        headers['X-XSRF-TOKEN'] = csrfToken;
      }
      
      const response = await safeFetch(`${API}/admin/inquiries/${currentInquiryId}/reply`, {
        method: 'POST',
        credentials: 'include',
        headers: headers,
        body: JSON.stringify({ message })
      });

      // 권한 만료 체크
      if (response.status === 401 || response.status === 403) {
        alert('로그인이 만료되었습니다. 다시 로그인해주세요.');
        closeDetailPanel();
        window.location.href = 'login.html';
        return;
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || '답변 전송에 실패했습니다.');
      }

      // 성공
      alert('답변이 전송되었습니다.');
      elements.replyMessage.value = '';

      // 통합 새로고침 (상세 + 답변 이력 + 목록 + 통계)
      await refreshCurrentInquiry();

    } catch (error) {
      console.error('답변 전송 실패:', error.message);
      alert(error.message || '답변 전송 중 오류가 발생했습니다.');
    } finally {
      // 액션 잠금 해제
      isActionBusy = false;
      elements.sendReplyBtn.disabled = false;
      elements.updateStatusBtn.disabled = false;
      elements.saveMemoBtn.disabled = false;
      elements.sendReplyBtn.textContent = '답변 전송';
    }
  }

  // ============================================
  // 상태 변경
  // ============================================
  async function updateStatus() {
    if (isActionBusy) return;
    
    if (!currentInquiryId) {
      alert('문의를 선택해주세요.');
      return;
    }

    const status = elements.statusSelect.value;
    if (!status) {
      alert('상태를 선택해주세요.');
      return;
    }

    // 액션 잠금
    isActionBusy = true;
    elements.sendReplyBtn.disabled = true;
    elements.updateStatusBtn.disabled = true;
    elements.saveMemoBtn.disabled = true;
    elements.updateStatusBtn.textContent = '저장 중...';

    try {
      // secureFetch 폴백
      const safeFetch = window.secureFetch || fetch;
      
      // CSRF 토큰 가져오기
      const csrfToken = getCsrfToken();
      const headers = {
        'Content-Type': 'application/json'
      };
      if (csrfToken) {
        headers['X-XSRF-TOKEN'] = csrfToken;
      }
      
      const response = await safeFetch(`${API}/admin/inquiries/${currentInquiryId}/status`, {
        method: 'PUT',
        credentials: 'include',
        headers: headers,
        body: JSON.stringify({ status })
      });

      // 권한 만료 체크
      if (response.status === 401 || response.status === 403) {
        alert('로그인이 만료되었습니다. 다시 로그인해주세요.');
        closeDetailPanel();
        window.location.href = 'login.html';
        return;
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || '상태 변경에 실패했습니다.');
      }

      // 성공
      alert('상태가 변경되었습니다.');

      // 통합 새로고침 (상세 + 목록 + 통계)
      await refreshCurrentInquiry();

    } catch (error) {
      console.error('상태 변경 실패:', error.message);
      alert(error.message || '상태 변경 중 오류가 발생했습니다.');
    } finally {
      // 액션 잠금 해제
      isActionBusy = false;
      elements.sendReplyBtn.disabled = false;
      elements.updateStatusBtn.disabled = false;
      elements.saveMemoBtn.disabled = false;
      elements.updateStatusBtn.textContent = '상태 변경';
    }
  }

  // ============================================
  // 메모 저장
  // ============================================
  async function saveMemo() {
    if (isActionBusy) return;
    
    if (!currentInquiryId) {
      alert('문의를 선택해주세요.');
      return;
    }

    const memo = elements.adminMemo.value.trim();

    // 액션 잠금
    isActionBusy = true;
    elements.sendReplyBtn.disabled = true;
    elements.updateStatusBtn.disabled = true;
    elements.saveMemoBtn.disabled = true;
    elements.saveMemoBtn.textContent = '저장 중...';

    try {
      // secureFetch 폴백
      const safeFetch = window.secureFetch || fetch;
      
      // CSRF 토큰 가져오기
      const csrfToken = getCsrfToken();
      const headers = {
        'Content-Type': 'application/json'
      };
      if (csrfToken) {
        headers['X-XSRF-TOKEN'] = csrfToken;
      }
      
      const response = await safeFetch(`${API}/admin/inquiries/${currentInquiryId}/memo`, {
        method: 'PUT',
        credentials: 'include',
        headers: headers,
        body: JSON.stringify({ memo })
      });

      // 권한 만료 체크
      if (response.status === 401 || response.status === 403) {
        alert('로그인이 만료되었습니다. 다시 로그인해주세요.');
        closeDetailPanel();
        window.location.href = 'login.html';
        return;
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || '메모 저장에 실패했습니다.');
      }

      // 성공
      alert('메모가 저장되었습니다.');

      // 통합 새로고침 (상세 + 목록)
      await refreshCurrentInquiry();

    } catch (error) {
      console.error('메모 저장 실패:', error.message);
      alert(error.message || '메모 저장 중 오류가 발생했습니다.');
    } finally {
      // 액션 잠금 해제
      isActionBusy = false;
      elements.sendReplyBtn.disabled = false;
      elements.updateStatusBtn.disabled = false;
      elements.saveMemoBtn.disabled = false;
      elements.saveMemoBtn.textContent = '메모 저장';
    }
  }

  // ============================================
  // 유틸리티: HTML 이스케이프
  // ============================================
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================
  // 전역 함수 export
  // ============================================
  window.initInquiriesPage = initInquiriesPage;
  window.openInquiryDetail = window.openInquiryDetail;
  window.changePage = window.changePage;

})();

