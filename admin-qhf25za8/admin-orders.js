// admin-orders.js - 주문 관리 페이지 스크립트

(function() {
  'use strict';

  // API 설정
  const API_BASE = (window.API_BASE) 
    ? window.API_BASE 
    : ((window.location && window.location.origin)
        ? window.location.origin.replace(/\/$/, '') + '/api'
        : '/api');

  let currentPage = 0;
  const PAGE_SIZE = 20;
  let allOrders = [];

  // DOM 요소
  const elements = {
    loadingState: document.getElementById('loadingState'),
    ordersTableContainer: document.getElementById('ordersTableContainer'),
    ordersTableBody: document.getElementById('ordersTableBody'),
    emptyState: document.getElementById('emptyState'),
    statusFilter: document.getElementById('statusFilter'),
    searchInput: document.getElementById('searchInput'),
    refreshBtn: document.getElementById('refreshBtn'),
    pagination: document.getElementById('pagination'),
    todayOrders: document.getElementById('todayOrders'),
    todayRevenue: document.getElementById('todayRevenue'),
    pendingOrders: document.getElementById('pendingOrders'),
    orderDetailModal: document.getElementById('orderDetailModal'),
    closeModal: document.getElementById('closeModal'),
    closeDetailBtn: document.getElementById('closeDetailBtn'),
    orderDetailContent: document.getElementById('orderDetailContent'),
    modalOrderTitle: document.getElementById('modalOrderTitle'),
    logoutBtn: document.getElementById('logoutBtn')
  };

  // ============================================
  // 초기화
  // ============================================
  async function init() {
    // 관리자 권한 확인
    const hasAccess = await checkAdminAccess();
    if (!hasAccess) return;

    // 이벤트 리스너 설정
    setupEventListeners();

    // 주문 목록 로드
    await loadOrders();

    // 통계 로드
    loadStats();
  }

  // ============================================
  // 관리자 권한 확인
  // ============================================
  async function checkAdminAccess() {
    try {
      const response = await fetch(`${API_BASE}/admin/check`, {
        credentials: 'include'  // JWT 쿠키 포함
      });

      if (!response.ok) {
        console.error('관리자 권한 없음:', response.status);
        alert('관리자 권한이 없습니다.');
        window.location.href = 'login.html';
        return false;
      }

      const data = await response.json();
      console.log('✅ 관리자 인증 성공:', data.email);
      return true;

    } catch (error) {
      console.error('권한 확인 실패:', error);
      alert('로그인이 필요합니다.');
      window.location.href = 'login.html';
      return false;
    }
  }

  // ============================================
  // 이벤트 리스너 설정
  // ============================================
  function setupEventListeners() {
    // 필터 변경
    elements.statusFilter.addEventListener('change', () => {
      currentPage = 0;
      loadOrders();
    });

    // 검색
    let searchTimeout;
    elements.searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentPage = 0;
        loadOrders();
      }, 500);
    });

    // 새로고침
    elements.refreshBtn.addEventListener('click', () => {
      loadOrders();
      loadStats();
    });

    // 모달 닫기
    elements.closeModal.addEventListener('click', () => {
      elements.orderDetailModal.classList.remove('show');
    });

    elements.closeDetailBtn.addEventListener('click', () => {
      elements.orderDetailModal.classList.remove('show');
    });

    // 모달 배경 클릭 시 닫기
    elements.orderDetailModal.addEventListener('click', (e) => {
      if (e.target === elements.orderDetailModal) {
        elements.orderDetailModal.classList.remove('show');
      }
    });

    // 로그아웃
    elements.logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (confirm('로그아웃하시겠습니까?')) {
        try {
          await fetch(`${API_BASE}/logout`, {
            method: 'POST',
            credentials: 'include'
          });
        } catch (error) {
          console.error('로그아웃 오류:', error);
        }
        window.location.href = 'login.html';
      }
    });
  }

  // ============================================
  // 주문 목록 로드
  // ============================================
  async function loadOrders() {
    const status = elements.statusFilter.value;
    const search = elements.searchInput.value.trim();

    elements.loadingState.style.display = 'block';
    elements.ordersTableContainer.style.display = 'none';
    elements.emptyState.style.display = 'none';
    elements.pagination.style.display = 'none';

    try {
      const params = new URLSearchParams({
        limit: PAGE_SIZE,
        offset: currentPage * PAGE_SIZE
      });

      if (status) params.append('status', status);
      if (search) params.append('search', search);

      const response = await fetch(`${API_BASE}/admin/orders?${params}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      allOrders = data.orders || [];

      elements.loadingState.style.display = 'none';

      if (allOrders.length === 0) {
        elements.emptyState.style.display = 'block';
        return;
      }

      renderOrdersTable(allOrders);
      renderPagination(data.pagination);

      elements.ordersTableContainer.style.display = 'block';
      elements.pagination.style.display = 'flex';

    } catch (error) {
      console.error('주문 로드 실패:', error);
      elements.loadingState.style.display = 'none';
      alert('주문 목록을 불러오는데 실패했습니다.');
    }
  }

  // ============================================
  // 테이블 렌더링
  // ============================================
  function renderOrdersTable(orders) {
    elements.ordersTableBody.innerHTML = orders.map(order => {
      const orderDate = new Date(order.created_at);
      const dateStr = orderDate.toLocaleDateString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const customerName = order.shipping_name || `${order.last_name || ''}${order.first_name || ''}`;
      
      const itemsSummary = order.items.length > 0 
        ? order.items.slice(0, 2).map(item => 
            `${item.product_name}${item.size ? ` (${item.size})` : ''}`
          ).join('<br>')
        : '-';

      const moreItems = order.items.length > 2 ? `<br><small>외 ${order.items.length - 2}건</small>` : '';

      const priceFormatted = new Intl.NumberFormat('ko-KR', {
        style: 'currency',
        currency: 'KRW',
        maximumFractionDigits: 0
      }).format(order.total_price);

      return `
        <tr data-order-id="${order.order_id}">
          <td><strong>${order.order_number || `#${order.order_id}`}</strong></td>
          <td>${dateStr}</td>
          <td>
            ${customerName}<br>
            <small style="color: #6c757d;">${order.customer_email || ''}</small>
          </td>
          <td>${itemsSummary}${moreItems}</td>
          <td><strong>${priceFormatted}</strong></td>
          <td>${renderOrderStatusBadge(order.status)}</td>
          <td>
            <button class="btn-sm btn-primary" onclick="window.viewOrderDetail(${order.order_id})">
              상세
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ============================================
  // 상태 배지 렌더링
  // ============================================
  function renderOrderStatusBadge(status) {
    const statusMap = {
      'pending': { label: '결제 대기', class: 'badge-warning' },
      'confirmed': { label: '결제 완료', class: 'badge-success' },
      'processing': { label: '상품 준비중', class: 'badge-info' },
      'shipping': { label: '배송중', class: 'badge-primary' },
      'delivered': { label: '배송 완료', class: 'badge-secondary' },
      'cancelled': { label: '취소됨', class: 'badge-danger' }
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
    loadOrders();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ============================================
  // 주문 상세 보기
  // ============================================
  window.viewOrderDetail = async function(orderId) {
    try {
      const response = await fetch(`${API_BASE}/admin/orders/${orderId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      renderOrderDetailModal(data.order);

      elements.orderDetailModal.classList.add('show');

    } catch (error) {
      console.error('주문 상세 로드 실패:', error);
      alert('주문 정보를 불러오는데 실패했습니다.');
    }
  };

  // ============================================
  // 주문 상세 모달 렌더링
  // ============================================
  function renderOrderDetailModal(order) {
    elements.modalOrderTitle.textContent = `주문 상세 - ${order.order_number || `#${order.order_id}`}`;

    const customerName = order.shipping_name || `${order.last_name || ''}${order.first_name || ''}`;
    
    const priceFormatted = new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0
    }).format(order.total_price);

    elements.orderDetailContent.innerHTML = `
      <div class="order-detail-grid">
        <!-- 고객 정보 -->
        <div class="detail-section">
          <h4>고객 정보</h4>
          <dl>
            <dt>이름</dt>
            <dd>${customerName}</dd>
            <dt>이메일</dt>
            <dd>${order.customer_email || '-'}</dd>
            <dt>전화번호</dt>
            <dd>${order.shipping_phone || order.customer_phone || '-'}</dd>
          </dl>
        </div>

        <!-- 배송지 정보 -->
        <div class="detail-section">
          <h4>배송지 정보</h4>
          <dl>
            <dt>주소</dt>
            <dd>${order.shipping_address || '-'}</dd>
            <dt>우편번호</dt>
            <dd>${order.shipping_zipcode || '-'}</dd>
            <dt>국가</dt>
            <dd>${order.shipping_country || 'KR'}</dd>
          </dl>
        </div>

        <!-- 주문 정보 -->
        <div class="detail-section">
          <h4>주문 정보</h4>
          <dl>
            <dt>주문번호</dt>
            <dd>${order.order_number || `#${order.order_id}`}</dd>
            <dt>주문일시</dt>
            <dd>${new Date(order.created_at).toLocaleString('ko-KR')}</dd>
            <dt>총 금액</dt>
            <dd><strong>${priceFormatted}</strong></dd>
          </dl>
        </div>

        <!-- 주문 상태 변경 -->
        <div class="detail-section">
          <h4>주문 상태</h4>
          <dl>
            <dt>현재 상태</dt>
            <dd>${renderOrderStatusBadge(order.status)}</dd>
          </dl>
          <select id="orderStatusSelect" class="filter-input" style="width: 100%; margin-top: 0.5rem;">
            <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>결제 대기</option>
            <option value="confirmed" ${order.status === 'confirmed' ? 'selected' : ''}>결제 완료</option>
            <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>상품 준비중</option>
            <option value="shipping" ${order.status === 'shipping' ? 'selected' : ''}>배송중</option>
            <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>배송 완료</option>
            <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>취소됨</option>
          </select>
          <button class="btn-primary" style="width: 100%; margin-top: 0.5rem;" onclick="window.updateOrderStatus(${order.order_id}, '${order.status}')">
            상태 변경
          </button>
        </div>
      </div>

      <!-- 주문 상품 -->
      <div class="detail-section" style="margin-top: 1.5rem;">
        <h4>주문 상품</h4>
        <table class="detail-table">
          <thead>
            <tr>
              <th>상품명</th>
              <th>옵션</th>
              <th>수량</th>
              <th>가격</th>
            </tr>
          </thead>
          <tbody>
            ${order.items.map(item => {
              const itemPrice = new Intl.NumberFormat('ko-KR', {
                style: 'currency',
                currency: 'KRW',
                maximumFractionDigits: 0
              }).format(item.price);
              
              return `
                <tr>
                  <td>${item.product_name}</td>
                  <td>${item.color || '-'} / ${item.size || '-'}</td>
                  <td>${item.quantity}</td>
                  <td>${itemPrice}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      ${order.payment ? `
        <div class="detail-section" style="margin-top: 1.5rem;">
          <h4>결제 정보</h4>
          <dl>
            <dt>결제 수단</dt>
            <dd>${order.payment.gateway === 'mock' ? '모의 결제 (테스트)' : '토스페이먼츠'}</dd>
            <dt>결제 상태</dt>
            <dd>${order.payment.status}</dd>
            <dt>결제 키</dt>
            <dd><code style="font-size: 0.75rem;">${order.payment.payment_key}</code></dd>
          </dl>
        </div>
      ` : ''}
    `;
  }

  // ============================================
  // 주문 상태 변경
  // ============================================
  window.updateOrderStatus = async function(orderId, currentStatus) {
    const newStatus = document.getElementById('orderStatusSelect').value;

    if (newStatus === currentStatus) {
      alert('상태가 변경되지 않았습니다.');
      return;
    }

    if (!confirm(`주문 상태를 "${newStatus}"(으)로 변경하시겠습니까?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      alert('주문 상태가 변경되었습니다.');
      elements.orderDetailModal.classList.remove('show');
      loadOrders();  // 목록 새로고침
      loadStats();   // 통계 새로고침

    } catch (error) {
      console.error('상태 변경 실패:', error);
      alert('상태 변경에 실패했습니다.');
    }
  };

  // ============================================
  // 통계 로드
  // ============================================
  async function loadStats() {
    try {
      // 오늘 날짜
      const today = new Date().toISOString().split('T')[0];

      // 오늘 주문 조회
      const todayResponse = await fetch(`${API_BASE}/admin/orders?date_from=${today}&date_to=${today}`, {
        credentials: 'include'
      });

      if (todayResponse.ok) {
        const todayData = await todayResponse.json();
        const todayOrdersCount = todayData.orders.length;
        const todayRevenueTotal = todayData.orders.reduce((sum, order) => sum + parseFloat(order.total_price || 0), 0);

        elements.todayOrders.textContent = `${todayOrdersCount}건`;
        elements.todayRevenue.textContent = new Intl.NumberFormat('ko-KR', {
          style: 'currency',
          currency: 'KRW',
          maximumFractionDigits: 0
        }).format(todayRevenueTotal);
      }

      // 처리 대기 주문 (confirmed 상태)
      const pendingResponse = await fetch(`${API_BASE}/admin/orders?status=confirmed`, {
        credentials: 'include'
      });

      if (pendingResponse.ok) {
        const pendingData = await pendingResponse.json();
        elements.pendingOrders.textContent = `${pendingData.orders.length}건`;
      }

    } catch (error) {
      console.error('통계 로드 실패:', error);
      elements.todayOrders.textContent = '-';
      elements.todayRevenue.textContent = '-';
      elements.pendingOrders.textContent = '-';
    }
  }

  // ============================================
  // 페이지 로드 시 초기화
  // ============================================
  document.addEventListener('DOMContentLoaded', init);

})();




