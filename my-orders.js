// my-orders.js - 주문 내역 페이지 스크립트
document.addEventListener('DOMContentLoaded', function() {
  console.log('주문 내역 페이지 로드됨');
  
  // 임시 주문 데이터 (실제로는 API에서 가져와야 함)
  const mockOrders = [
    {
      id: 'ORD-001',
      date: '2025-01-15',
      status: '배송완료',
      items: [
        { name: 'Classic Oxford Shirt', price: 89000, quantity: 1, image: 'image/shirt.jpg' },
        { name: 'Canvas Daypack', price: 129000, quantity: 1, image: 'image/cap.jpg' }
      ],
      total: 218000
    },
    {
      id: 'ORD-002', 
      date: '2025-01-10',
      status: '배송중',
      items: [
        { name: 'Soft Cotton Shirt', price: 79000, quantity: 2, image: 'image/shirt.jpg' }
      ],
      total: 158000
    }
  ];

  renderOrders(mockOrders);
});

function renderOrders(orders) {
  const ordersContainer = document.getElementById('orders-container');
  
  if (!ordersContainer) {
    console.error('orders-container를 찾을 수 없습니다.');
    return;
  }

  if (orders.length === 0) {
    ordersContainer.innerHTML = `
      <div class="empty-orders">
        <h2>주문 내역이 없습니다</h2>
        <p>아직 주문한 상품이 없습니다.</p>
        <a href="catalog.html" class="btn-primary">쇼핑하러 가기</a>
      </div>
    `;
    return;
  }

  ordersContainer.innerHTML = orders.map(order => `
    <div class="order-card">
      <div class="order-header">
        <div class="order-info">
          <h3>주문번호: ${escapeHtml(order.id)}</h3>
          <p class="order-date">주문일: ${escapeHtml(order.date)}</p>
        </div>
        <div class="order-status status-${order.status === '배송완료' ? 'completed' : 'shipping'}">
          ${escapeHtml(order.status)}
        </div>
      </div>
      
      <div class="order-items">
        ${order.items.map(item => `
          <div class="order-item">
            <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" onerror="this.src='image/default.jpg'">
            <div class="item-info">
              <h4>${escapeHtml(item.name)}</h4>
              <p>수량: ${escapeHtml(item.quantity)}</p>
              <p class="item-price">${formatPrice(item.price)}</p>
            </div>
          </div>
        `).join('')}
      </div>
      
      <div class="order-footer">
        <div class="order-total">
          총 주문금액: <strong>${formatPrice(order.total)}</strong>
        </div>
        <div class="order-actions">
          <button class="btn-secondary" onclick="viewOrderDetail('${escapeHtml(order.id)}')">주문 상세</button>
          ${order.status === '배송완료' ? '<button class="btn-primary" onclick="reorder(\'' + escapeHtml(order.id) + '\')">재주문</button>' : ''}
        </div>
      </div>
    </div>
  `).join('');
}

function formatPrice(price) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price);
}

function viewOrderDetail(orderId) {
  console.log('주문 상세 보기:', orderId);
  alert('주문 상세 기능은 준비 중입니다.');
}

function reorder(orderId) {
  console.log('재주문:', orderId);
  alert('재주문 기능은 준비 중입니다.');
}



