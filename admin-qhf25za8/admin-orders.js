// admin-orders.js - 주문 관리 페이지 스크립트

(function() {
  'use strict';

  const Logger = window.Logger || { log: function(){}, warn: function(){}, error: function(){ if (window.console && window.console.error) window.console.error.apply(window.console, arguments); } };

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
    downloadQRCodesBtn: document.getElementById('downloadQRCodesBtn'),
    pagination: document.getElementById('pagination'),
    todayOrders: document.getElementById('todayOrders'),
    todayRevenue: document.getElementById('todayRevenue'),
    pendingOrders: document.getElementById('pendingOrders'),
    orderDetailModal: document.getElementById('orderDetailModal'),
    closeModal: document.getElementById('closeModal'),
    closeDetailBtn: document.getElementById('closeDetailBtn'),
    orderDetailContent: document.getElementById('orderDetailContent'),
    modalOrderTitle: document.getElementById('modalOrderTitle')
    // logoutBtn은 admin-layout.js에서 처리됨
  };

  // ============================================
  // 초기화
  // ============================================
  async function init() {
    // 관리자 권한 확인은 admin-layout.js에서 처리됨
    // 여기서는 페이지별 기능만 초기화

    // 이벤트 리스너 설정
    setupEventListeners();

    // 주문 목록 로드
    await loadOrders();

    // 통계 로드
    loadStats();
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

    // QR 코드 다운로드
    if (elements.downloadQRCodesBtn) {
      elements.downloadQRCodesBtn.addEventListener('click', downloadQRCodes);
    }

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

    // 로그아웃은 admin-layout.js에서 처리됨
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

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        elements.loadingState.style.display = 'none';
        const message = (data && data.message) || `요청 실패 (${response.status})`;
        alert(message);
        return;
      }
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
      // 로깅 정책: Phase 0 준수 (error 객체 전체 덤프 금지)
      Logger.error('주문 로드 실패:', error.message);
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

      const customerName = order.shipping_name || order.customer_name || '-';
      const customerEmail = order.shipping_email || order.customer_email || '';
      const isGuestOrder = !order.user_id && order.guest_id;
      
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
          <td>
            <strong>${order.order_number || `#${order.order_id}`}</strong>
            ${isGuestOrder ? '<br><small class="badge badge-secondary" style="font-size: 0.7rem; margin-top: 0.25rem;">비회원</small>' : ''}
          </td>
          <td>${dateStr}</td>
          <td>
            ${customerName}<br>
            <small style="color: #6c757d;">${customerEmail}</small>
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
  // 유닛 상태 배지 렌더링 (order_item_units용)
  // ============================================
  function renderUnitStatusBadge(unitStatus) {
    const statusMap = {
      'reserved': { label: '예약됨', class: 'badge-warning' },
      'shipped': { label: '출고됨', class: 'badge-primary' },
      'delivered': { label: '배송완료', class: 'badge-success' },
      'refunded': { label: '환불됨', class: 'badge-danger' }
    };

    const { label, class: className } = statusMap[unitStatus] || { label: unitStatus, class: 'badge-secondary' };
    return `<span class="badge ${className}">${label}</span>`;
  }

  // ============================================
  // 토큰 마스킹 (앞 4자 + ... + 뒤 4자)
  // ============================================
  function maskToken(token) {
    if (!token || token.length < 8) return token;
    return `${token.substring(0, 4)}...${token.substring(token.length - 4)}`;
  }

  // ============================================
  // HTML 이스케이프 (XSS 방지)
  // ============================================
  function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================
  // 보증서 상태 배지 생성
  // ============================================
  function getWarrantyStatusBadge(status) {
    const statusMap = {
      'issued_unassigned': { label: '미할당', class: 'badge-secondary' },
      'issued': { label: '발급됨', class: 'badge-info' },
      'active': { label: '활성화', class: 'badge-success' },
      'suspended': { label: '제재', class: 'badge-warning' },
      'revoked': { label: '환불됨', class: 'badge-danger' }
    };

    const { label, class: className } = statusMap[status] || { label: status, class: 'badge-secondary' };
    return `<span class="badge ${className}">${label}</span>`;
  }

  // ============================================
  // 송장번호 추적 링크 생성
  // ============================================
  function getTrackingUrl(carrierCode, trackingNumber) {
    if (!carrierCode || !trackingNumber) return null;

    // 택배사별 추적 URL 템플릿
    const carrierTemplates = {
      'CJ': 'https://www.cjlogistics.com/ko/tool/parcel/tracking?param={tracking_number}',
      'HANJIN': 'https://www.hanjin.co.kr/kor/CMS/DeliveryMgr/WaybillSch?mCode=MN038&schLang=KR&wblnum={tracking_number}',
      'ILYANG': 'https://ilyanglogis.com/delivery/delivery_search.jsp?dlvry_type=1&dlvry_num={tracking_number}',
      'KGB': 'https://www.cvsnet.co.kr/invoice/tracking.do?invoice_no={tracking_number}'
    };

    const template = carrierTemplates[carrierCode];
    if (!template) return null;

    return template.replace('{tracking_number}', encodeURIComponent(trackingNumber));
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
      
      if (!data.success) {
        throw new Error(data.message || '조회 실패');
      }

      // 새로운 3단 구조: { order, invoice, credit_notes, order_items }
      renderOrderDetailModal(data);

      elements.orderDetailModal.classList.add('show');

    } catch (error) {
      // 로깅 정책: Phase 0 준수 (error 객체 전체 덤프 금지)
      Logger.error('주문 상세 로드 실패:', error.message);
      alert('주문 정보를 불러오는데 실패했습니다.');
    }
  };

  // ============================================
  // 주문 상세 모달 렌더링 (3단 구조)
  // ============================================
  function renderOrderDetailModal(data) {
    const { order, invoice, credit_notes, order_items } = data;
    
    elements.modalOrderTitle.textContent = `주문 상세 - ${order.order_number || `#${order.order_id}`}`;

    const customerName = order.customer_info?.name || order.shipping_info?.name || '-';
    const customerEmail = order.customer_info?.email || order.shipping_info?.email || '-';
    const customerPhone = order.customer_info?.phone || order.shipping_info?.phone || '-';
    const isGuestOrder = !order.user_id && order.guest_id;
    
    const priceFormatted = new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0
    }).format(order.total_amount);

    // 1단: 주문 정보 카드 (인보이스 정보 포함)
    const invoiceHtml = invoice ? `
      <div class="detail-section">
        <h4>인보이스 정보</h4>
        <dl>
          <dt>인보이스 번호</dt>
          <dd>${escapeHtml(invoice.invoice_number)}</dd>
          <dt>발급 일시</dt>
          <dd>${new Date(invoice.issued_at).toLocaleString('ko-KR')}</dd>
          <dt>총액</dt>
          <dd><strong>${new Intl.NumberFormat('ko-KR', {
            style: 'currency',
            currency: 'KRW',
            maximumFractionDigits: 0
          }).format(invoice.total_amount)}</strong></dd>
          ${invoice.document_url ? `
          <dt>인보이스 링크</dt>
          <dd><a href="${escapeHtml(invoice.document_url)}" target="_blank" rel="noopener noreferrer">인보이스 보기</a></dd>
          ` : ''}
        </dl>
      </div>
      ${credit_notes && credit_notes.length > 0 ? `
      <div class="detail-section">
        <h4>Credit Note</h4>
        <dl>
          ${credit_notes.map(cn => `
            <dt>Credit Note 번호</dt>
            <dd>${escapeHtml(cn.invoice_number)} (${new Date(cn.issued_at).toLocaleDateString('ko-KR')})</dd>
          `).join('')}
        </dl>
      </div>
      ` : ''}
    ` : '';

    // 2단: 주문 항목 리스트
    const orderItemsHtml = order_items && order_items.length > 0 ? `
      <div class="detail-section" style="margin-top: 1.5rem;">
        <h4>주문 항목</h4>
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
            ${order_items.map(item => {
              const itemPrice = new Intl.NumberFormat('ko-KR', {
                style: 'currency',
                currency: 'KRW',
                maximumFractionDigits: 0
              }).format(item.price);
              
              return `
                <tr>
                  <td>${escapeHtml(item.product_name || '-')}</td>
                  <td>${escapeHtml(item.color || '-')} / ${escapeHtml(item.size || '-')}</td>
                  <td>${item.quantity}</td>
                  <td>${itemPrice}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    ` : '';

    // 3단: 주문 항목 단위 테이블 (시리얼 넘버, 토큰, 배송 상태, 보증서 상태)
    // 모든 units를 수집
    const allUnits = [];
    order_items.forEach(item => {
      if (item.units && item.units.length > 0) {
        item.units.forEach(unit => {
          allUnits.push({ ...unit, item_product_name: item.product_name, item_size: item.size, item_color: item.color });
        });
      }
    });

    const unitsTableHtml = allUnits.length > 0 ? `
      <div class="detail-section" style="margin-top: 1.5rem;">
        <h4>주문 항목 단위 (출고/배송 관리)</h4>
        <table class="detail-table" id="orderItemUnitsTable">
          <thead>
            <tr>
              <th><input type="checkbox" id="selectAllUnits" onchange="window.toggleSelectAllUnits()"></th>
              <th>순번</th>
              <th>상품명</th>
              <th>시리얼 넘버</th>
              <th>토큰</th>
              <th>배송 상태</th>
              <th>보증서 상태</th>
              <th>택배사</th>
              <th>송장번호</th>
              <th>출고일</th>
              <th>배송완료일</th>
            </tr>
          </thead>
          <tbody>
            ${allUnits.map(unit => {
              const isShippedOrDelivered = unit.unit_status === 'shipped' || unit.unit_status === 'delivered';
              const carrierCode = unit.current_shipment?.carrier_code || unit.carrier_code;
              const trackingNumber = unit.current_shipment?.tracking_number || unit.tracking_number;
              const trackingUrl = getTrackingUrl(carrierCode, trackingNumber);
              const shippedDate = unit.current_shipment?.shipped_at || unit.shipped_at 
                ? new Date(unit.current_shipment?.shipped_at || unit.shipped_at).toLocaleString('ko-KR', { 
                    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
                  }) 
                : '-';
              const deliveredDate = unit.delivered_at 
                ? new Date(unit.delivered_at).toLocaleString('ko-KR', { 
                    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
                  }) 
                : '-';
              
              // 보증서 상태 배지
              const warrantyBadge = unit.warranty_status 
                ? getWarrantyStatusBadge(unit.warranty_status)
                : '<span class="badge badge-secondary">없음</span>';
              
              return `
                <tr data-unit-id="${unit.order_item_unit_id}" data-status="${unit.unit_status}">
                  <td>
                    <input 
                      type="checkbox" 
                      class="unit-checkbox" 
                      value="${unit.order_item_unit_id}"
                      ${isShippedOrDelivered ? 'disabled' : ''}
                      onchange="window.updateActionButtonsState()"
                    >
                  </td>
                  <td>${unit.unit_seq || '-'}</td>
                  <td>${escapeHtml(unit.item_product_name || '-')}</td>
                  <td>${escapeHtml(unit.serial_number || '-')}</td>
                  <td style="font-family: monospace; font-size: 0.75rem;">
                    <code title="전체 토큰: ${escapeHtml(unit.token || '-')}">${escapeHtml(unit.token || '-')}</code>
                  </td>
                  <td>${renderUnitStatusBadge(unit.unit_status)}</td>
                  <td>${warrantyBadge}</td>
                  <td>${escapeHtml(carrierCode || '-')}</td>
                  <td>
                    ${trackingUrl && trackingNumber 
                      ? `<a href="${trackingUrl}" target="_blank" rel="noopener noreferrer" style="color: #007bff;">${escapeHtml(trackingNumber)}</a>`
                      : (trackingNumber ? escapeHtml(trackingNumber) : '-')}
                  </td>
                  <td>${shippedDate}</td>
                  <td>${deliveredDate}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <!-- 액션 버튼 영역 -->
        <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
          <button 
            class="btn-primary" 
            id="shippedBtn"
            onclick="window.openShippedModal(${order.order_id})"
            disabled
          >
            출고 처리
          </button>
          <button 
            class="btn-success" 
            id="deliveredBtn"
            onclick="window.openDeliveredModal(${order.order_id})"
            disabled
          >
            배송완료 처리
          </button>
        </div>
      </div>
    ` : '';

    elements.orderDetailContent.innerHTML = `
      <!-- 1단: 주문 정보 카드 -->
      <div class="order-detail-grid">
        <!-- 고객 정보 -->
        <div class="detail-section">
          <h4>고객 정보</h4>
          <dl>
            <dt>이름</dt>
            <dd>${escapeHtml(customerName)}</dd>
            <dt>이메일</dt>
            <dd>${escapeHtml(customerEmail)}</dd>
            <dt>전화번호</dt>
            <dd>${escapeHtml(customerPhone)}</dd>
          </dl>
        </div>

        <!-- 배송지 정보 -->
        <div class="detail-section">
          <h4>배송지 정보</h4>
          <dl>
            <dt>주소</dt>
            <dd>${escapeHtml(order.shipping_info?.address || '-')}</dd>
            <dt>우편번호</dt>
            <dd>${escapeHtml(order.shipping_info?.postal_code || '-')}</dd>
            <dt>국가</dt>
            <dd>${escapeHtml(order.shipping_info?.country || 'KR')}</dd>
          </dl>
        </div>

        <!-- 주문 정보 -->
        <div class="detail-section">
          <h4>주문 정보</h4>
          <dl>
            <dt>주문번호</dt>
            <dd>${escapeHtml(order.order_number || `#${order.order_id}`)}</dd>
            <dt>주문 유형</dt>
            <dd>
              ${isGuestOrder 
                ? '<span class="badge badge-secondary">비회원 주문</span>' 
                : '<span class="badge badge-primary">회원 주문</span>'}
            </dd>
            ${isGuestOrder ? `
            <dt>Guest ID</dt>
            <dd><code style="font-size: 0.85rem;">${escapeHtml(order.guest_id)}</code></dd>
            ` : order.user_id ? `
            <dt>회원 ID</dt>
            <dd>${escapeHtml(order.user_id)}</dd>
            ` : ''}
            <dt>주문일시</dt>
            <dd>${new Date(order.created_at).toLocaleString('ko-KR')}</dd>
            <dt>결제일시</dt>
            <dd>${order.paid_at ? new Date(order.paid_at).toLocaleString('ko-KR') : '-'}</dd>
            <dt>총 금액</dt>
            <dd><strong>${priceFormatted}</strong></dd>
            <dt>주문 상태</dt>
            <dd>${renderOrderStatusBadge(order.status)}</dd>
          </dl>
          <div style="padding: 0.5rem; background-color: #f5f5f5; border-radius: 4px; font-size: 0.9rem; color: #666; margin-top: 0.5rem;">
            <strong>※ 주문 상태는 자동으로 집계됩니다.</strong><br>
            <small>배송/환불 처리를 통해 상태를 변경하세요.</small>
          </div>
        </div>

        ${invoiceHtml}
      </div>

      ${orderItemsHtml}

      ${unitsTableHtml}
    `;
  }

  // ============================================
  // 주문 상태 변경
  // ⚠️ 제거됨: orders.status는 집계 결과(뷰/표시용)이며, 직접 정책 판단 기준으로 사용하지 않습니다.
  // 
  // 설계 원칙 (FINAL_EXECUTION_SPEC_REVIEW.md):
  // - orders.status는 집계 함수로만 갱신되며, 관리자 수동 수정 금지
  // - 상태 변경은 order_item_units.unit_status나 paid_events 변경으로만 가능
  // 
  // 대체 방법:
  // - 배송 처리: order_item_units.unit_status를 'shipped'로 변경 → orders.status 자동 집계
  // - 환불 처리: order_item_units.unit_status를 'refunded'로 변경 → orders.status 자동 집계
  // - 결제 처리: paid_events 생성 → orders.status 자동 집계
  // ============================================

  // ============================================
  // 전체 선택/해제
  // ============================================
  window.toggleSelectAllUnits = function() {
    const selectAll = document.getElementById('selectAllUnits');
    const checkboxes = document.querySelectorAll('.unit-checkbox:not(:disabled)');
    
    checkboxes.forEach(cb => {
      cb.checked = selectAll.checked;
    });
    
    updateActionButtonsState();
  };

  // ============================================
  // 액션 버튼 상태 업데이트
  // ============================================
  window.updateActionButtonsState = function() {
    const checkboxes = document.querySelectorAll('.unit-checkbox:checked:not(:disabled)');
    const checkedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    if (checkedIds.length === 0) {
      document.getElementById('shippedBtn')?.setAttribute('disabled', '');
      document.getElementById('deliveredBtn')?.setAttribute('disabled', '');
      return;
    }
    
    // 선택된 유닛들의 상태 확인
    const rows = Array.from(document.querySelectorAll('#orderItemUnitsTable tbody tr'));
    const selectedRows = rows.filter(row => checkedIds.includes(parseInt(row.dataset.unitId)));
    
    const hasReserved = selectedRows.some(row => row.dataset.status === 'reserved');
    const hasShipped = selectedRows.some(row => row.dataset.status === 'shipped');
    
    // 출고 처리 버튼: reserved 상태만 선택 가능
    const shippedBtn = document.getElementById('shippedBtn');
    if (shippedBtn) {
      if (hasReserved && selectedRows.every(row => row.dataset.status === 'reserved')) {
        shippedBtn.removeAttribute('disabled');
      } else {
        shippedBtn.setAttribute('disabled', '');
      }
    }
    
    // 배송완료 처리 버튼: shipped 상태만 선택 가능
    const deliveredBtn = document.getElementById('deliveredBtn');
    if (deliveredBtn) {
      if (hasShipped && selectedRows.every(row => row.dataset.status === 'shipped')) {
        deliveredBtn.removeAttribute('disabled');
      } else {
        deliveredBtn.setAttribute('disabled', '');
      }
    }
  };

  // ============================================
  // 출고 처리 모달 열기
  // ============================================
  window.openShippedModal = function(orderId) {
    const checkboxes = document.querySelectorAll('.unit-checkbox:checked:not(:disabled)');
    const unitIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    if (unitIds.length === 0) {
      alert('출고할 유닛을 선택해주세요.');
      return;
    }
    
    const carrierCode = prompt('택배사 코드를 입력하세요 (예: CJ, ILYANG, KGB):');
    if (!carrierCode) return;
    
    const trackingNumber = prompt('송장번호를 입력하세요:');
    if (!trackingNumber) return;
    
    if (!confirm(`${unitIds.length}개 유닛을 출고 처리하시겠습니까?`)) {
      return;
    }
    
    processShipped(orderId, unitIds, carrierCode.trim(), trackingNumber.trim());
  };

  // ============================================
  // 출고 처리 API 호출
  // ============================================
  async function processShipped(orderId, unitIds, carrierCode, trackingNumber) {
    try {
      const response = await fetch(`${API_BASE}/admin/orders/${orderId}/shipped`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          unitIds: unitIds,
          carrierCode: carrierCode,
          trackingNumber: trackingNumber
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      alert('출고 처리가 완료되었습니다.');
      window.viewOrderDetail(orderId);  // 상세 정보 새로고침

    } catch (error) {
      Logger.error('출고 처리 실패:', error.message);
      alert(`출고 처리에 실패했습니다: ${error.message}`);
    }
  }

  // ============================================
  // 배송완료 처리 모달 열기
  // ============================================
  window.openDeliveredModal = function(orderId) {
    const checkboxes = document.querySelectorAll('.unit-checkbox:checked:not(:disabled)');
    const unitIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    if (unitIds.length === 0) {
      alert('배송완료 처리할 유닛을 선택해주세요.');
      return;
    }
    
    if (!confirm(`${unitIds.length}개 유닛을 배송완료 처리하시겠습니까?`)) {
      return;
    }
    
    processDelivered(orderId, unitIds);
  };

  // ============================================
  // 배송완료 처리 API 호출
  // ============================================
  async function processDelivered(orderId, unitIds) {
    try {
      const response = await fetch(`${API_BASE}/admin/orders/${orderId}/delivered`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          unitIds: unitIds
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      alert('배송완료 처리가 완료되었습니다.');
      window.viewOrderDetail(orderId);  // 상세 정보 새로고침

    } catch (error) {
      Logger.error('배송완료 처리 실패:', error.message);
      alert(`배송완료 처리에 실패했습니다: ${error.message}`);
    }
  }

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
      // 로깅 정책: Phase 0 준수 (error 객체 전체 덤프 금지)
      Logger.error('통계 로드 실패:', error.message);
      elements.todayOrders.textContent = '-';
      elements.todayRevenue.textContent = '-';
      elements.pendingOrders.textContent = '-';
    }
  }

  // ============================================
  // QR 코드 다운로드
  // ============================================
  async function downloadQRCodes() {
    try {
      // 버튼 비활성화
      if (elements.downloadQRCodesBtn) {
        elements.downloadQRCodesBtn.disabled = true;
        elements.downloadQRCodesBtn.textContent = '⏳ 다운로드 중...';
      }

      // API 호출
      const response = await fetch(`${API_BASE}/admin/qrcodes/download`, {
        credentials: 'include'  // JWT 쿠키 포함
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          alert('관리자 권한이 필요합니다.');
          return;
        }
        const errorData = await response.json().catch(() => ({ message: '다운로드 실패' }));
        throw new Error(errorData.message || 'QR 코드 다운로드에 실패했습니다.');
      }

      // Blob으로 변환
      const blob = await response.blob();
      
      // 파일명 추출 (Content-Disposition 헤더에서)
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'qrcodes.zip';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // 다운로드
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      // 성공 메시지
      alert('QR 코드 ZIP 파일이 다운로드되었습니다.');

    } catch (error) {
      // 로깅 정책: Phase 0 준수 (error 객체 전체 덤프 금지)
      Logger.error('QR 코드 다운로드 실패:', error.message);
      alert('QR 코드 다운로드에 실패했습니다: ' + error.message);
    } finally {
      // 버튼 활성화
      if (elements.downloadQRCodesBtn) {
        elements.downloadQRCodesBtn.disabled = false;
        elements.downloadQRCodesBtn.textContent = '📥 QR 코드 다운로드';
      }
    }
  }

  // ============================================
  // 페이지 로드 시 초기화
  // ============================================
  // init은 admin-layout.js의 inline 스크립트에서 호출됨
  // 네임스페이스 패턴으로 전역 충돌 방지
  window.AdminPages = window.AdminPages || {};
  window.AdminPages.orders = window.AdminPages.orders || {};
  window.AdminPages.orders.init = init;

})();




