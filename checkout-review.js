// checkout-review.js - 2단계: 배송 정보 확인

document.addEventListener('DOMContentLoaded', function() {
  console.log('📋 2단계: 배송 정보 확인 페이지 로드됨');
  
  let shippingDataStr = sessionStorage.getItem('checkoutShippingData');
  
  if (!shippingDataStr) {
    try {
      const draftStr = localStorage.getItem('checkoutShippingDataDraft');
      if (draftStr) {
        const draft = JSON.parse(draftStr);
        if (draft && draft.data && draft.expiresAt && Date.now() < draft.expiresAt) {
          sessionStorage.setItem('checkoutShippingData', JSON.stringify(draft.data));
          shippingDataStr = JSON.stringify(draft.data);
          localStorage.removeItem('checkoutShippingDataDraft');
        }
      }
    } catch (e) {}
  }
  
  if (!shippingDataStr) {
    alert('배송 정보를 찾을 수 없습니다. 처음부터 다시 시작해주세요.');
    window.location.href = 'checkout.html';
    return;
  }
  
  const data = JSON.parse(shippingDataStr);
  console.log('📋 저장된 배송 데이터:', data);
  
  // 배송 정보 표시
  renderShippingInfo(data.shipping);
  
  // 주문 상품 표시 (좌측)
  renderOrderItems(data.items);
  
  // 우측 주문 요약에 상품 목록(이미지 포함) 채우기
  renderOrderSummaryItems(data.items);
  
  // 주문 요약 금액 업데이트
  updateOrderSummary(data.items);
  
  // 이벤트 바인딩
  bindEventListeners();
});

function renderShippingInfo(shipping) {
  const container = document.getElementById('shipping-info-review');
  
  container.innerHTML = `
    <div style="line-height: 1.8;">
      <p><strong>이름:</strong> ${escapeHtml(shipping.recipient_name || `${shipping.recipient_first_name || ''} ${shipping.recipient_last_name || ''}`.trim())}</p>
      <p><strong>이메일:</strong> ${escapeHtml(shipping.email)}</p>
      <p><strong>전화번호:</strong> ${escapeHtml(shipping.phone)}</p>
      <p><strong>주소:</strong> ${escapeHtml(shipping.address)}</p>
      <p><strong>도시:</strong> ${escapeHtml(shipping.city)}</p>
      <p><strong>우편번호:</strong> ${escapeHtml(shipping.postal_code)}</p>
      <p><strong>국가:</strong> ${escapeHtml(shipping.country)}</p>
    </div>
  `;
}

function renderOrderItems(items) {
  const container = document.getElementById('order-items-review');
  
  if (!items || items.length === 0) {
    container.innerHTML = '<p>주문할 상품이 없습니다.</p>';
    return;
  }
  
  container.innerHTML = items.map(item => {
    // ⚠️ 이미지 경로 처리: /uploads/products/로 시작하면 그대로 사용, 아니면 /image/ 추가
    let imageSrc = item.image || '';
    if (imageSrc.startsWith('/uploads/')) {
      imageSrc = imageSrc;
    } else if (imageSrc.startsWith('/image/')) {
      imageSrc = imageSrc;
    } else if (imageSrc) {
      imageSrc = imageSrc.startsWith('image/') ? '/' + imageSrc : '/image/' + imageSrc;
    } else {
      imageSrc = '/image/default.jpg';
    }
    
    return `
    <div style="display: flex; gap: 15px; padding: 15px 0; border-bottom: 1px solid #eee;">
      <div>
        <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(item.name)}" style="width: 80px; height: 80px; object-fit: cover;">
      </div>
      <div style="flex: 1;">
        <p style="font-weight: 600; margin-bottom: 5px;">${escapeHtml(item.name)}</p>
        <p style="color: #666; font-size: 0.9rem;">색상: ${escapeHtml(item.color || 'N/A')} | 수량: ${item.quantity}</p>
        <p style="margin-top: 10px; font-weight: 600;">₩${new Intl.NumberFormat('ko-KR').format(item.price * item.quantity)}</p>
      </div>
    </div>
  `;
  }).join('');
}

/** 우측 주문 요약 박스에 상품 목록(이미지·이름·수량·금액) 렌더링 */
function renderOrderSummaryItems(items) {
  const container = document.getElementById('order-items');
  if (!container) return;
  if (!items || items.length === 0) {
    container.innerHTML = '<p class="order-summary-empty">주문할 상품이 없습니다.</p>';
    return;
  }
  let imageSrc;
  container.innerHTML = items.map(item => {
    imageSrc = item.image || '';
    if (imageSrc.startsWith('/uploads/')) {
      // keep
    } else if (imageSrc.startsWith('/image/')) {
      // keep
    } else if (imageSrc) {
      imageSrc = imageSrc.startsWith('image/') ? '/' + imageSrc : '/image/' + imageSrc;
    } else {
      imageSrc = '/image/default.jpg';
    }
    const name = escapeHtml(item.name);
    const detailParts = [item.color, item.size, item.quantity + '개'].filter(Boolean).map(function (v) { return escapeHtml(String(v)); });
    const detailText = detailParts.join(' · ');
    const price = new Intl.NumberFormat('ko-KR').format(item.price * item.quantity);
    return `
      <div class="order-item">
        <img src="${escapeHtml(imageSrc)}" alt="${name}" class="order-item-image" onerror="this.src='/image/default.jpg'">
        <div class="order-item-info">
          <div class="order-item-name" title="${name}">${name}</div>
          <div class="order-item-details">${detailText}</div>
        </div>
        <div class="order-item-price">₩${price}</div>
      </div>
    `;
  }).join('');
}

function updateOrderSummary(items) {
  const totalPrice = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const subtotalEl = document.getElementById('subtotal');
  const totalEl = document.getElementById('total');
  if (subtotalEl) subtotalEl.textContent = `₩${new Intl.NumberFormat('ko-KR').format(totalPrice)}`;
  if (totalEl) totalEl.textContent = `₩${new Intl.NumberFormat('ko-KR').format(totalPrice)}`;
}

function bindEventListeners() {
  const proceedBtn = document.getElementById('proceed-to-payment');
  if (proceedBtn) {
    proceedBtn.addEventListener('click', function() {
      console.log('✅ 2단계 확인 완료 → 3단계로 이동');
      window.location.href = 'checkout-payment.html';
    });
  }
}


