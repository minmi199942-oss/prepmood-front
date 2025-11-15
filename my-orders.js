// my-orders.js - 주문 내역 페이지 스크립트
// API_BASE는 utils.js에서 window.API_BASE로 설정됨
const API_BASE = window.API_BASE || 
  ((window.location && window.location.origin)
    ? window.location.origin.replace(/\/$/, '') + '/api'
    : '/api');

document.addEventListener('DOMContentLoaded', async function() {
  console.log('주문 내역 페이지 로드됨');
  
  // 로그인 상태 확인
  const userInfo = await checkLoginStatus();
  if (!userInfo) {
    window.location.href = 'login.html';
    return;
  }

  // 주문 내역 로드
  await loadOrders();
});

// 로그인 상태 확인
async function checkLoginStatus() {
  try {
    const response = await fetch(`${API_BASE}/auth/me`, {
      method: 'GET',
      credentials: 'include'
    });

    if (response.ok) {
      const data = await response.json();
      return data.user;
    }
    return null;
  } catch (error) {
    console.error('로그인 상태 확인 오류:', error);
    return null;
  }
}

// 주문 내역 로드
async function loadOrders() {
  try {
    const response = await fetch(`${API_BASE}/orders`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('주문 내역 조회 실패');
    }

    const data = await response.json();
    if (data.success && data.orders) {
      renderOrders(data.orders);
    } else {
      renderOrders([]);
    }
  } catch (error) {
    console.error('주문 내역 로드 오류:', error);
    renderOrders([]);
  }
}

function renderOrders(orders) {
  const ordersList = document.getElementById('orders-list');
  const noOrders = document.getElementById('no-orders');
  
  if (!ordersList || !noOrders) {
    console.error('주문 내역 컨테이너를 찾을 수 없습니다.');
    return;
  }

  if (!orders || orders.length === 0) {
    ordersList.style.display = 'none';
    noOrders.style.display = 'block';
    return;
  }

  ordersList.style.display = 'block';
  noOrders.style.display = 'none';

  // 기존 내용 제거하고 새로 렌더링
  ordersList.innerHTML = orders.map(order => {
    const orderDate = new Date(order.order_date).toLocaleDateString('ko-KR');
    const statusText = getStatusText(order.status);
    const statusClass = getStatusClass(order.status);

    return `
      <div class="order-item">
        <div class="order-image">
          ${order.items && order.items.length > 0 ? 
            `<img src="image/${escapeHtml(order.items[0].image)}" alt="${escapeHtml(order.items[0].name)}" class="product-image" onerror="this.src='image/default.jpg'">` : 
            `<img src="image/default.jpg" alt="상품" class="product-image">`
          }
        </div>
        <div class="order-details">
          <h3 class="product-name">${order.items && order.items.length > 0 ? escapeHtml(order.items[0].name) : '주문 #' + (order.order_number || order.order_id)}</h3>
          ${order.items && order.items.length > 1 ? `<p class="order-additional">외 ${order.items.length - 1}개 상품</p>` : ''}
          <p class="order-number">주문번호: ${order.order_number || 'PM' + String(order.order_id).padStart(6, '0')}</p>
          <p class="order-date">주문일: ${orderDate}</p>
          <p class="order-price">${formatPrice(order.total_price)}</p>
          <p class="order-status ${statusClass}">${statusText}</p>
        </div>
      </div>
    `;
  }).join('') + `
    <div class="shopping-button-container">
      <button class="shopping-button" onclick="window.location.href='index.html'">
        쇼핑 시작하기
      </button>
    </div>
  `;
}

// 상태 텍스트 변환
function getStatusText(status) {
  const statusMap = {
    'pending': '주문 대기',
    'confirmed': '주문 확인',
    'shipping': '배송 중',
    'delivered': '배송 완료',
    'cancelled': '주문 취소'
  };
  return statusMap[status] || status;
}

// 상태 CSS 클래스 변환
function getStatusClass(status) {
  const classMap = {
    'pending': 'status-pending',
    'confirmed': 'status-confirmed',
    'shipping': 'status-shipping',
    'delivered': 'status-delivered',
    'cancelled': 'status-cancelled'
  };
  return classMap[status] || '';
}

// HTML 이스케이프
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatPrice(price) {
  if (!price) return '₩0';
  return '₩' + new Intl.NumberFormat('ko-KR').format(price);
}




