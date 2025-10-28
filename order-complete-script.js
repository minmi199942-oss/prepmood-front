// 주문 완료 페이지 스크립트
document.addEventListener('DOMContentLoaded', function() {
  console.log('✅ 주문 완료 페이지 로드됨');
  
  // URL에서 주문 ID 가져오기
  const urlParams = new URLSearchParams(window.location.search);
  const orderId = urlParams.get('orderId');
  
  if (orderId) {
    loadOrderDetails(orderId);
  } else {
    console.warn('⚠️ 주문 ID가 없습니다');
    // 주문 ID가 없으면 기본 메시지만 표시
    document.getElementById('order-info-section').style.display = 'none';
  }
});

async function loadOrderDetails(orderId) {
  try {
    console.log('📋 주문 상세 정보 로딩 중...', orderId);
    
    const response = await fetch(`https://prepmood.kr/api/orders/${orderId}`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`주문 정보 조회 실패: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success && data.order) {
      displayOrderInfo(data.order);
    } else {
      throw new Error('주문 정보를 찾을 수 없습니다');
    }
    
  } catch (error) {
    console.error('❌ 주문 정보 로딩 실패:', error);
    // 오류가 발생해도 기본 메시지는 표시
    document.getElementById('order-info-section').style.display = 'none';
  }
}

function displayOrderInfo(order) {
  console.log('📋 주문 정보 표시:', order);
  
  // 주문 정보 섹션 표시
  const orderInfoSection = document.getElementById('order-info-section');
  orderInfoSection.style.display = 'block';
  
  // 주문 번호
  document.getElementById('order-id').textContent = `#${order.order_id}`;
  
  // 주문 금액
  document.getElementById('order-total').textContent = formatPrice(order.total_price);
  
  // 예상 배송일
  if (order.shipping && order.shipping.estimated_delivery) {
    const deliveryDate = new Date(order.shipping.estimated_delivery);
    document.getElementById('estimated-delivery').textContent = 
      deliveryDate.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
  }
  
  // 배송 정보 표시
  if (order.shipping) {
    displayShippingInfo(order.shipping);
  }
}

function displayShippingInfo(shipping) {
  const shippingContent = document.getElementById('shipping-info-content');
  
  if (!shipping) {
    shippingContent.innerHTML = '<p>배송 정보가 없습니다.</p>';
    return;
  }
  
  const shippingInfo = `
    <div class="shipping-detail">
      <p><strong>수령인:</strong> ${escapeHtml(shipping.first_name)} ${escapeHtml(shipping.last_name)}</p>
      <p><strong>연락처:</strong> ${escapeHtml(shipping.phone)}</p>
      <p><strong>이메일:</strong> ${escapeHtml(shipping.email)}</p>
      <p><strong>배송 주소:</strong></p>
      <p>${escapeHtml(shipping.address)}</p>
      <p>${escapeHtml(shipping.city)}, ${escapeHtml(shipping.postal_code)}</p>
      <p>${escapeHtml(shipping.country)}</p>
      <p><strong>배송 방법:</strong> ${getShippingMethodText(shipping.method)}</p>
      ${shipping.cost > 0 ? `<p><strong>배송비:</strong> ${formatPrice(shipping.cost)}</p>` : '<p><strong>배송비:</strong> 무료</p>'}
    </div>
  `;
  
  shippingContent.innerHTML = shippingInfo;
}

function getShippingMethodText(method) {
  const methods = {
    'standard': '일반 배송 (3-5일)',
    'express': '당일 배송',
    'overnight': '익일 배송'
  };
  return methods[method] || '일반 배송';
}

function formatPrice(price) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
