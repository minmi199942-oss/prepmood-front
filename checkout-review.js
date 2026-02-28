// checkout-review.js - 2단계: 배송 정보 확인

function isDevHost() {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

/** 개발 환경 전용 샘플 데이터 (디자인 확인용) */
function getDevSampleData() {
  return {
    shipping: {
      recipient_name: '홍길동',
      email: 'dev@example.com',
      phone: '010-1234-5678',
      address: '서울시 강남구 테헤란로 123',
      city: '서울',
      postal_code: '06134',
      country: '대한민국'
    },
    items: [
      { name: '디자인용 샘플 상품', image: '/image/hat.jpg', color: 'Black', size: 'M', quantity: 1, price: 25000 }
    ]
  };
}

document.addEventListener('DOMContentLoaded', function() {
  Logger.log('📋 2단계: 배송 정보 확인 페이지 로드됨');

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

  let data;
  if (shippingDataStr) {
    data = JSON.parse(shippingDataStr);
    Logger.log('📋 저장된 배송 데이터:', data);
  } else if (isDevHost()) {
    data = getDevSampleData();
    Logger.log('🎨 개발 환경: 배송 데이터 없음 — 샘플 데이터로 디자인 확인');
  } else {
    alert('배송 정보를 찾을 수 없습니다. 처음부터 다시 시작해주세요.');
    window.location.href = 'checkout.html';
    return;
  }

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
  if (!container) return;

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

/** 우측 주문 요약: checkout.html과 동일 스타일 (cart-item checkout-summary-item, summary-rows, formatPrice) */
function renderOrderSummaryItems(items) {
  const container = document.getElementById('order-items');
  const subtotalEl = document.getElementById('subtotal');
  const totalEl = document.getElementById('total');
  if (!container) return;
  const fmt = typeof formatPrice === 'function' ? formatPrice : function (n) { return '₩' + new Intl.NumberFormat('ko-KR').format(n); };

  if (!items || items.length === 0) {
    container.innerHTML = '<p class="order-summary-empty">주문할 상품이 없습니다.</p>';
    if (subtotalEl) subtotalEl.textContent = fmt(0);
    if (totalEl) totalEl.textContent = fmt(0);
    return;
  }

  const subtotalPrice = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  if (subtotalEl) subtotalEl.textContent = fmt(subtotalPrice);
  if (totalEl) totalEl.textContent = fmt(subtotalPrice);

  container.innerHTML = items.map(item => {
    let imageSrc = item.image || '';
    if (imageSrc.startsWith('/uploads/') || imageSrc.startsWith('/image/')) {
      // keep
    } else if (imageSrc) {
      imageSrc = imageSrc.startsWith('image/') ? '/' + imageSrc : '/image/' + imageSrc;
    } else {
      imageSrc = '/image/default.jpg';
    }
    const optionParts = [item.color, item.size].filter(function (v) { return (v || '').toString().trim(); }).map(function (v) { return escapeHtml(String(v).trim()); });
    const optionHtml = optionParts.length ? '<p class="cart-item-option">' + optionParts.join(' · ') + '</p>' : '';
    const qty = item.quantity || 1;
    const lineTotal = (item.price || 0) * qty;
    return (
      '<div class="cart-item checkout-summary-item">' +
      '<img src="' + escapeHtml(imageSrc) + '" alt="' + escapeHtml(item.name) + '" class="cart-item-image" onerror="this.src=\'/image/default.jpg\'">' +
      '<div class="cart-item-info">' +
      '<h3 class="cart-item-name">' + escapeHtml(item.name) + '</h3>' +
      optionHtml +
      '<div class="cart-item-details">' +
      '<div class="cart-item-quantity-row"><span class="cart-item-quantity-label">수량</span><span class="cart-qty-value">' + qty + '</span></div>' +
      '</div></div>' +
      '<div class="cart-item-price">' + fmt(lineTotal) + '</div></div>'
    );
  }).join('');
}

function updateOrderSummary(items) {
  const totalPrice = items && items.length ? items.reduce((sum, item) => sum + (item.price * item.quantity), 0) : 0;
  const fmt = typeof formatPrice === 'function' ? formatPrice : function (n) { return '₩' + new Intl.NumberFormat('ko-KR').format(n); };
  const subtotalEl = document.getElementById('subtotal');
  const totalEl = document.getElementById('total');
  if (subtotalEl) subtotalEl.textContent = fmt(totalPrice);
  if (totalEl) totalEl.textContent = fmt(totalPrice);
}

function bindEventListeners() {
  const proceedBtn = document.getElementById('proceed-to-payment');
  if (proceedBtn) {
    proceedBtn.addEventListener('click', function() {
      Logger.log('✅ 2단계 확인 완료 → 3단계로 이동');
      window.location.href = 'checkout-payment.html';
    });
  }
}


