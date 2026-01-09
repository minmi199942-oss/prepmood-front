// admin-stock.js - 재고 관리 페이지 스크립트

(function() {
  'use strict';

  // API 설정
  const API_BASE = (window.API_BASE) 
    ? window.API_BASE 
    : ((window.location && window.location.origin)
        ? window.location.origin.replace(/\/$/, '') + '/api'
        : '/api');

  let currentPage = 0;
  const PAGE_SIZE = 50;
  let allStock = [];
  let allProducts = [];
  let availableTokens = [];

  // DOM 요소
  const elements = {
    loadingState: document.getElementById('loadingState'),
    stockTableContainer: document.getElementById('stockTableContainer'),
    stockTableBody: document.getElementById('stockTableBody'),
    emptyState: document.getElementById('emptyState'),
    productFilter: document.getElementById('productFilter'),
    statusFilter: document.getElementById('statusFilter'),
    addStockBtn: document.getElementById('addStockBtn'),
    pagination: document.getElementById('pagination'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    pageInfo: document.getElementById('pageInfo'),
    totalStock: document.getElementById('totalStock'),
    inStockCount: document.getElementById('inStockCount'),
    reservedCount: document.getElementById('reservedCount'),
    soldCount: document.getElementById('soldCount'),
    addStockModal: document.getElementById('addStockModal'),
    closeAddStockModal: document.getElementById('closeAddStockModal'),
    addStockForm: document.getElementById('addStockForm'),
    addStockProductId: document.getElementById('addStockProductId'),
    tokenListContainer: document.getElementById('tokenListContainer'),
    tokenList: document.getElementById('tokenList'),
    tokenListLoading: document.getElementById('tokenListLoading'),
    tokenListEmpty: document.getElementById('tokenListEmpty'),
    cancelAddStockBtn: document.getElementById('cancelAddStockBtn'),
    submitAddStockBtn: document.getElementById('submitAddStockBtn'),
    stockDetailModal: document.getElementById('stockDetailModal'),
    closeStockDetailModal: document.getElementById('closeStockDetailModal'),
    stockDetailContent: document.getElementById('stockDetailContent')
  };

  // ============================================
  // 초기화
  // ============================================
  async function init() {
    // 관리자 권한 확인은 admin-layout.js에서 처리됨
    // 여기서는 페이지별 기능만 초기화

    setupEventListeners();
    await loadProducts();
    await loadStock();
    await loadStats();
  }

  // ============================================
  // 이벤트 리스너 설정
  // ============================================
  function setupEventListeners() {
    // 필터 변경
    elements.productFilter.addEventListener('change', () => {
      currentPage = 0;
      loadStock();
    });

    elements.statusFilter.addEventListener('change', () => {
      currentPage = 0;
      loadStock();
    });

    // 재고 추가 버튼
    elements.addStockBtn.addEventListener('click', openAddStockModal);

    // 모달 닫기
    elements.closeAddStockModal.addEventListener('click', closeAddStockModal);
    elements.cancelAddStockBtn.addEventListener('click', closeAddStockModal);
    elements.closeStockDetailModal.addEventListener('click', closeStockDetailModal);

    // 모달 외부 클릭 시 닫기
    elements.addStockModal.addEventListener('click', (e) => {
      if (e.target === elements.addStockModal) {
        closeAddStockModal();
      }
    });

    elements.stockDetailModal.addEventListener('click', (e) => {
      if (e.target === elements.stockDetailModal) {
        closeStockDetailModal();
      }
    });

    // 상품 선택 시 토큰 목록 로드
    elements.addStockProductId.addEventListener('change', async () => {
      const productId = elements.addStockProductId.value;
      if (productId) {
        await loadAvailableTokens(productId);
      } else {
        elements.tokenListContainer.style.display = 'none';
        elements.tokenListEmpty.style.display = 'none';
        elements.submitAddStockBtn.disabled = true;
      }
    });

    // 재고 추가 폼 제출
    elements.addStockForm.addEventListener('submit', handleAddStock);

    // 페이지네이션
    elements.prevBtn.addEventListener('click', () => {
      if (currentPage > 0) {
        currentPage--;
        loadStock();
      }
    });

    elements.nextBtn.addEventListener('click', () => {
      currentPage++;
      loadStock();
    });
  }

  // ============================================
  // 상품 목록 로드
  // ============================================
  async function loadProducts() {
    try {
      const response = await fetch(`${API_BASE}/products`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        allProducts = data.products || [];
        
        // 상품 필터 드롭다운 채우기
        elements.productFilter.innerHTML = '<option value="">전체 상품</option>';
        allProducts.forEach(product => {
          const option = document.createElement('option');
          option.value = product.id;
          option.textContent = `${product.name} (${product.id})`;
          elements.productFilter.appendChild(option);
        });

        // 재고 추가 모달의 상품 선택 드롭다운 채우기
        elements.addStockProductId.innerHTML = '<option value="">상품을 선택하세요</option>';
        allProducts.forEach(product => {
          const option = document.createElement('option');
          option.value = product.id;
          option.textContent = `${product.name} (${product.id})`;
          elements.addStockProductId.appendChild(option);
        });
      }
    } catch (error) {
      console.error('상품 로드 실패:', error.message);
    }
  }

  // ============================================
  // 재고 목록 로드
  // ============================================
  async function loadStock() {
    const productId = elements.productFilter.value;
    const status = elements.statusFilter.value;

    elements.loadingState.style.display = 'block';
    elements.stockTableContainer.style.display = 'none';
    elements.emptyState.style.display = 'none';
    elements.pagination.style.display = 'none';

    try {
      const params = new URLSearchParams({
        limit: PAGE_SIZE,
        offset: currentPage * PAGE_SIZE
      });

      if (productId) params.append('product_id', productId);
      if (status) params.append('status', status);

      const response = await fetch(`${API_BASE}/admin/stock?${params}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      allStock = data.stock || [];

      elements.loadingState.style.display = 'none';

      if (allStock.length === 0) {
        elements.emptyState.style.display = 'block';
        return;
      }

      renderStockTable(allStock);
      renderPagination(data.pagination);

      elements.stockTableContainer.style.display = 'block';
      elements.pagination.style.display = 'flex';

    } catch (error) {
      console.error('재고 로드 실패:', error.message);
      elements.loadingState.style.display = 'none';
      alert('재고 목록을 불러오는데 실패했습니다.');
    }
  }

  // ============================================
  // 재고 테이블 렌더링
  // ============================================
  function renderStockTable(stockList) {
    elements.stockTableBody.innerHTML = '';

    stockList.forEach(item => {
      const row = document.createElement('tr');
      
      const statusBadge = getStatusBadge(item.status);
      const orderInfo = item.reserved_by_order_number 
        ? `<a href="orders.html?orderId=${item.reserved_by_order_id}" style="color: #007bff;">${item.reserved_by_order_number}</a>`
        : '-';

      row.innerHTML = `
        <td>${item.stock_unit_id}</td>
        <td>${item.product_name}</td>
        <td class="token-masked">${item.token}</td>
        <td>${item.internal_code || '-'}</td>
        <td>${item.serial_number || '-'}</td>
        <td>${statusBadge}</td>
        <td>${orderInfo}</td>
        <td>${formatDate(item.created_at)}</td>
        <td>
          <button class="btn-secondary btn-sm" onclick="window.AdminPages.stock.viewDetail(${item.stock_unit_id})">
            상세
          </button>
        </td>
      `;

      elements.stockTableBody.appendChild(row);
    });
  }

  // ============================================
  // 상태 배지 생성
  // ============================================
  function getStatusBadge(status) {
    const statusMap = {
      'in_stock': { label: '재고 있음', class: 'in-stock' },
      'reserved': { label: '예약됨', class: 'reserved' },
      'sold': { label: '판매됨', class: 'sold' },
      'returned': { label: '반품됨', class: 'returned' }
    };

    const statusInfo = statusMap[status] || { label: status, class: '' };
    return `<span class="badge ${statusInfo.class}">${statusInfo.label}</span>`;
  }

  // ============================================
  // 페이지네이션 렌더링
  // ============================================
  function renderPagination(pagination) {
    if (!pagination) return;

    const totalPages = Math.ceil(pagination.total / PAGE_SIZE);
    elements.pageInfo.textContent = `페이지 ${currentPage + 1} / ${totalPages || 1}`;
    elements.prevBtn.disabled = currentPage === 0;
    elements.nextBtn.disabled = !pagination.hasMore;
  }

  // ============================================
  // 통계 로드
  // ============================================
  async function loadStats() {
    try {
      const response = await fetch(`${API_BASE}/admin/stock/stats`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        const stats = data.stats.by_status || [];
        const total = stats.reduce((sum, s) => sum + s.count, 0);
        const inStock = stats.find(s => s.status === 'in_stock')?.count || 0;
        const reserved = stats.find(s => s.status === 'reserved')?.count || 0;
        const sold = stats.find(s => s.status === 'sold')?.count || 0;

        elements.totalStock.textContent = total;
        elements.inStockCount.textContent = inStock;
        elements.reservedCount.textContent = reserved;
        elements.soldCount.textContent = sold;
      }
    } catch (error) {
      console.error('통계 로드 실패:', error.message);
    }
  }

  // ============================================
  // 재고 추가 모달 열기
  // ============================================
  function openAddStockModal() {
    elements.addStockModal.style.display = 'flex';
    elements.addStockProductId.value = '';
    elements.tokenListContainer.style.display = 'none';
    elements.tokenListEmpty.style.display = 'none';
    elements.tokenListLoading.style.display = 'none';
    elements.submitAddStockBtn.disabled = true;
    availableTokens = [];
  }

  // ============================================
  // 재고 추가 모달 닫기
  // ============================================
  function closeAddStockModal() {
    elements.addStockModal.style.display = 'none';
    elements.addStockForm.reset();
    elements.tokenListContainer.style.display = 'none';
    elements.tokenListEmpty.style.display = 'none';
    elements.tokenListLoading.style.display = 'none';
    availableTokens = [];
  }

  // ============================================
  // 사용 가능한 토큰 로드
  // ============================================
  async function loadAvailableTokens(productId) {
    elements.tokenListContainer.style.display = 'none';
    elements.tokenListEmpty.style.display = 'none';
    elements.tokenListLoading.style.display = 'block';
    elements.submitAddStockBtn.disabled = true;

    try {
      const response = await fetch(`${API_BASE}/admin/stock/products/${productId}/tokens`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        availableTokens = data.tokens || [];
        elements.tokenListLoading.style.display = 'none';

        if (availableTokens.length === 0) {
          elements.tokenListEmpty.style.display = 'block';
        } else {
          renderTokenList(availableTokens);
          elements.tokenListContainer.style.display = 'block';
        }
      }
    } catch (error) {
      console.error('토큰 로드 실패:', error.message);
      elements.tokenListLoading.style.display = 'none';
      alert('사용 가능한 토큰을 불러오는데 실패했습니다.');
    }
  }

  // ============================================
  // 토큰 목록 렌더링
  // ============================================
  function renderTokenList(tokens) {
    elements.tokenList.innerHTML = '';

    tokens.forEach(token => {
      const item = document.createElement('div');
      item.className = 'token-item';
      
      item.innerHTML = `
        <input type="checkbox" 
               id="token-${token.token_pk}" 
               value="${token.token_pk}"
               onchange="window.AdminPages.stock.updateSubmitButton()">
        <label for="token-${token.token_pk}" class="token-info">
          ${token.token} (${token.internal_code || '-'})
          ${token.serial_number ? ` - ${token.serial_number}` : ''}
        </label>
      `;

      elements.tokenList.appendChild(item);
    });
  }

  // ============================================
  // 제출 버튼 상태 업데이트
  // ============================================
  function updateSubmitButton() {
    const checked = elements.tokenList.querySelectorAll('input[type="checkbox"]:checked');
    elements.submitAddStockBtn.disabled = checked.length === 0;
  }

  // ============================================
  // 재고 추가 처리
  // ============================================
  async function handleAddStock(e) {
    e.preventDefault();

    const productId = elements.addStockProductId.value;
    const checked = elements.tokenList.querySelectorAll('input[type="checkbox"]:checked');
    const tokenPkArray = Array.from(checked).map(cb => parseInt(cb.value));

    if (!productId || tokenPkArray.length === 0) {
      alert('상품과 최소 1개 이상의 토큰을 선택해주세요.');
      return;
    }

    elements.submitAddStockBtn.disabled = true;
    elements.submitAddStockBtn.textContent = '추가 중...';

    try {
      const response = await fetch(`${API_BASE}/admin/stock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          product_id: productId,
          token_pk: tokenPkArray
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || '재고 추가에 실패했습니다.');
      }

      const data = await response.json();
      
      if (data.success) {
        alert(`${data.added_count}개의 재고가 추가되었습니다.`);
        closeAddStockModal();
        await loadStock();
        await loadStats();
      }
    } catch (error) {
      console.error('재고 추가 실패:', error.message);
      alert(error.message || '재고 추가에 실패했습니다.');
    } finally {
      elements.submitAddStockBtn.disabled = false;
      elements.submitAddStockBtn.textContent = '추가';
    }
  }

  // ============================================
  // 재고 상세 조회
  // ============================================
  async function viewDetail(stockUnitId) {
    try {
      const response = await fetch(`${API_BASE}/admin/stock/${stockUnitId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        renderStockDetail(data.stock);
        elements.stockDetailModal.style.display = 'flex';
      }
    } catch (error) {
      console.error('재고 상세 조회 실패:', error.message);
      alert('재고 상세 정보를 불러오는데 실패했습니다.');
    }
  }

  // ============================================
  // 재고 상세 렌더링
  // ============================================
  function renderStockDetail(stock) {
    const statusBadge = getStatusBadge(stock.status);
    const orderInfo = stock.reserved_by_order_number 
      ? `<a href="orders.html?orderId=${stock.reserved_by_order_id}" style="color: #007bff;">${stock.reserved_by_order_number}</a>`
      : '-';

    elements.stockDetailContent.innerHTML = `
      <div style="padding: 1rem;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 0.5rem; font-weight: 600; width: 150px;">재고 ID</td>
            <td style="padding: 0.5rem;">${stock.stock_unit_id}</td>
          </tr>
          <tr>
            <td style="padding: 0.5rem; font-weight: 600;">상품명</td>
            <td style="padding: 0.5rem;">${stock.product_name} (${stock.product_id})</td>
          </tr>
          <tr>
            <td style="padding: 0.5rem; font-weight: 600;">토큰 (전체)</td>
            <td style="padding: 0.5rem; font-family: monospace;">${stock.token}</td>
          </tr>
          <tr>
            <td style="padding: 0.5rem; font-weight: 600;">토큰 PK</td>
            <td style="padding: 0.5rem;">${stock.token_pk}</td>
          </tr>
          <tr>
            <td style="padding: 0.5rem; font-weight: 600;">내부 코드</td>
            <td style="padding: 0.5rem;">${stock.internal_code || '-'}</td>
          </tr>
          <tr>
            <td style="padding: 0.5rem; font-weight: 600;">시리얼 넘버</td>
            <td style="padding: 0.5rem;">${stock.serial_number || '-'}</td>
          </tr>
          <tr>
            <td style="padding: 0.5rem; font-weight: 600;">ROT 코드</td>
            <td style="padding: 0.5rem;">${stock.rot_code || '-'}</td>
          </tr>
          <tr>
            <td style="padding: 0.5rem; font-weight: 600;">보증서 하단 코드</td>
            <td style="padding: 0.5rem;">${stock.warranty_bottom_code || '-'}</td>
          </tr>
          <tr>
            <td style="padding: 0.5rem; font-weight: 600;">상태</td>
            <td style="padding: 0.5rem;">${statusBadge}</td>
          </tr>
          <tr>
            <td style="padding: 0.5rem; font-weight: 600;">예약 주문</td>
            <td style="padding: 0.5rem;">${orderInfo}</td>
          </tr>
          <tr>
            <td style="padding: 0.5rem; font-weight: 600;">예약일시</td>
            <td style="padding: 0.5rem;">${stock.reserved_at ? formatDate(stock.reserved_at) : '-'}</td>
          </tr>
          <tr>
            <td style="padding: 0.5rem; font-weight: 600;">판매일시</td>
            <td style="padding: 0.5rem;">${stock.sold_at ? formatDate(stock.sold_at) : '-'}</td>
          </tr>
          <tr>
            <td style="padding: 0.5rem; font-weight: 600;">생성일</td>
            <td style="padding: 0.5rem;">${formatDate(stock.created_at)}</td>
          </tr>
          <tr>
            <td style="padding: 0.5rem; font-weight: 600;">수정일</td>
            <td style="padding: 0.5rem;">${formatDate(stock.updated_at)}</td>
          </tr>
        </table>
      </div>
    `;
  }

  // ============================================
  // 재고 상세 모달 닫기
  // ============================================
  function closeStockDetailModal() {
    elements.stockDetailModal.style.display = 'none';
  }

  // ============================================
  // 날짜 포맷팅
  // ============================================
  function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // ============================================
  // 페이지 로드 시 초기화
  // ============================================
  // init은 admin-layout.js의 inline 스크립트에서 호출됨
  // 네임스페이스 패턴으로 전역 충돌 방지
  window.AdminPages = window.AdminPages || {};
  window.AdminPages.stock = window.AdminPages.stock || {};
  window.AdminPages.stock.init = init;
  window.AdminPages.stock.viewDetail = viewDetail;
  window.AdminPages.stock.updateSubmitButton = updateSubmitButton;

})();
