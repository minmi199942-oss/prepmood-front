// checkout-payment.js - 3단계: 결제 방법 선택 및 결제 진행

document.addEventListener('DOMContentLoaded', function() {
  console.log('💳 3단계: 결제 방법 선택 페이지 로드됨');
  
  // 세션 스토리지에서 배송 데이터 가져오기
  const shippingDataStr = sessionStorage.getItem('checkoutShippingData');
  
  if (!shippingDataStr) {
    alert('배송 정보를 찾을 수 없습니다. 처음부터 다시 시작해주세요.');
    window.location.href = 'checkout.html';
    return;
  }
  
  const data = JSON.parse(shippingDataStr);
  console.log('📋 저장된 배송 데이터:', data);
  
  // 주문 요약 업데이트
  renderOrderItems(data.items);
  updateOrderSummary(data.items);
  renderShippingSummary(data.shipping);
  
  // 이벤트 바인딩
  bindEventListeners(data);
});

function renderOrderItems(items) {
  const container = document.getElementById('order-items');
  
  if (!items || items.length === 0) {
    container.innerHTML = '<p>주문할 상품이 없습니다.</p>';
    return;
  }
  
  container.innerHTML = items.map(item => `
    <div class="order-item">
      <img src="image/${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
      <div class="item-details">
        <div class="item-name">${escapeHtml(item.name)}</div>
        <div class="item-meta">색상: ${escapeHtml(item.color || 'N/A')} | 수량: ${item.quantity}</div>
      </div>
      <div class="item-price">₩${new Intl.NumberFormat('ko-KR').format(item.price * item.quantity)}</div>
    </div>
  `).join('');
}

function updateOrderSummary(items) {
  const totalPrice = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  document.getElementById('subtotal').textContent = `₩${new Intl.NumberFormat('ko-KR').format(totalPrice)}`;
  document.getElementById('total').textContent = `₩${new Intl.NumberFormat('ko-KR').format(totalPrice)}`;
}

function renderShippingSummary(shipping) {
  const container = document.getElementById('shipping-summary');
  
  container.innerHTML = `
    <p style="line-height: 1.6; font-size: 0.9rem; color: #666;">
      ${escapeHtml(shipping.recipient_first_name)} ${escapeHtml(shipping.recipient_last_name)}<br>
      ${escapeHtml(shipping.address)}, ${escapeHtml(shipping.city)}<br>
      ${escapeHtml(shipping.postal_code)}, ${escapeHtml(shipping.country)}<br>
      ${escapeHtml(shipping.phone)}
    </p>
  `;
}

function bindEventListeners(data) {
  const proceedBtn = document.getElementById('proceed-payment');
  if (proceedBtn) {
    proceedBtn.addEventListener('click', async function() {
      console.log('💳 결제 진행 시작');
      
      // 선택된 결제 방법 확인
      const selectedPayment = document.querySelector('input[name="payment"]:checked').value;
      console.log('💳 선택된 결제 방법:', selectedPayment);
      
      if (selectedPayment === 'toss') {
        // 토스페이먼츠 결제 진행
        await proceedWithTossPayment(data);
      } else {
        alert('현재 지원되는 결제 방법이 아닙니다.');
      }
    });
  }
}

async function proceedWithTossPayment(data) {
  try {
    console.log('💳 토스페이먼츠 결제 진행...');
    
    // 버튼 비활성화
    const proceedBtn = document.getElementById('proceed-payment');
    if (proceedBtn) {
      proceedBtn.disabled = true;
      proceedBtn.textContent = '처리 중...';
    }
    
    // 1. 주문 생성 (Idempotency 키 포함)
    const idemKey = uuidv4();
    console.log('🔑 Idempotency Key 생성:', idemKey);
    
    const requestPayload = {
      items: data.items.map(item => ({
        product_id: String(item.product_id || item.id),
        quantity: Number(item.quantity || 1)
      })),
      shipping: data.shipping
    };
    
    console.log('📤 주문 생성 API 호출...');
    const createRes = await window.secureFetch('https://prepmood.kr/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idemKey
      },
      credentials: 'include',
      body: JSON.stringify(requestPayload)
    });
    
    if (!createRes.ok) {
      const errorData = await createRes.json();
      throw new Error(errorData.details?.message || '주문 생성 실패');
    }
    
    const created = await createRes.json();
    console.log('✅ 주문 생성 성공:', created);
    
    const orderNumber = created.data.order_number;
    const amount = created.data.amount;
    
    // 2. 토스페이먼츠 결제 위젯 실행
    console.log('💳 토스페이먼츠 위젯 실행...');
    
    // TODO: 실제 토스페이먼츠 위젯 연동
    // 현재는 MOCK 모드로 처리
    const mockPayment = true; // 실제 운영 시 false로 변경
    
    if (mockPayment) {
      // MOCK 결제 처리
      console.log('🔄 MOCK 결제 처리...');
      
      const confirmRes = await window.secureFetch('https://prepmood.kr/api/payments/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          orderNumber: orderNumber,
          paymentKey: 'mock_key_' + Date.now(),
          amount: amount
        })
      });
      
      if (!confirmRes.ok) {
        const errorData = await confirmRes.json();
        throw new Error(errorData.details?.message || '결제 확인 실패');
      }
      
      const confirmed = await confirmRes.json();
      console.log('✅ 결제 확인 완료:', confirmed);
    } else {
      // 실제 토스페이먼츠 위젯 연동
      // const toss = TossPayments('test_pk_xxx'); // 환경변수에서 가져오기
      // const result = await toss.requestPayment({
      //   amount: amount,
      //   orderId: orderNumber,
      //   customerName: `${data.shipping.recipient_first_name} ${data.shipping.recipient_last_name}`,
      //   successUrl: window.location.origin + '/order-complete.html',
      //   failUrl: window.location.origin + '/checkout-payment.html?status=fail'
      // });
      // const { paymentKey } = result;
      // 
      // const confirmRes = await window.secureFetch('https://prepmood.kr/api/payments/confirm', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   credentials: 'include',
      //   body: JSON.stringify({ orderNumber, paymentKey, amount })
      // });
      // 
      // if (!confirmRes.ok) {
      //   throw new Error('결제 확인 실패');
      // }
    }
    
    // 3. 장바구니 비우기
    window.miniCart.clearCart();
    
    // 4. 주문 완료 페이지로 이동
    window.location.href = `order-complete.html?orderId=${orderNumber}`;
    
  } catch (error) {
    console.error('❌ 결제 처리 실패:', error);
    alert('결제 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    
    // 버튼 복구
    const proceedBtn = document.getElementById('proceed-payment');
    if (proceedBtn) {
      proceedBtn.disabled = false;
      proceedBtn.textContent = '확인 및 진행';
    }
  }
}

// UUID v4 생성 함수
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}


