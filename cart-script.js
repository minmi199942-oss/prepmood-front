// ====================================
// 장바구니 스크립트
// ====================================

// API 엔드포인트 설정
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'https://prepmood.kr/api'
  : 'https://prepmood.kr/api';

let cartData = null;

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', () => {
  checkLogin();
  loadCart();
});

// 로그인 체크
function checkLogin() {
  const userEmail = sessionStorage.getItem('userEmail');
  if (!userEmail) {
    alert('로그인이 필요한 서비스입니다.');
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

// 장바구니 불러오기
async function loadCart() {
  try {
    const userEmail = sessionStorage.getItem('userEmail');
    
    const response = await fetch(`${API_BASE_URL}/cart`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': userEmail
      },
      credentials: 'include'
    });

    const data = await response.json();

    if (data.success) {
      cartData = data;
      displayCart(data);
    } else {
      console.error('장바구니 조회 실패:', data.message);
      showError('장바구니를 불러오는데 실패했습니다.');
    }
  } catch (error) {
    console.error('장바구니 불러오기 오류:', error);
    showError('서버와의 통신에 실패했습니다.');
  } finally {
    document.getElementById('loading').style.display = 'none';
  }
}

// 장바구니 표시
function displayCart(data) {
  const emptyCart = document.getElementById('empty-cart');
  const cartContent = document.getElementById('cart-content');
  const cartItemsContainer = document.getElementById('cart-items');

  if (!data.items || data.items.length === 0) {
    emptyCart.style.display = 'block';
    cartContent.style.display = 'none';
    return;
  }

  emptyCart.style.display = 'none';
  cartContent.style.display = 'grid';

  // 장바구니 아이템 렌더링
  cartItemsContainer.innerHTML = data.items.map(item => `
    <div class="cart-item" data-item-id="${item.item_id}">
      <img src="${item.image || 'image/placeholder.jpg'}" alt="${item.name}" class="item-image" onerror="this.src='image/placeholder.jpg'">
      <div class="item-details">
        <div class="item-name">${item.name}</div>
        <div class="item-info">카테고리: ${item.category || '-'}</div>
        <div class="item-info">타입: ${item.type || '-'}</div>
        ${item.size ? `<div class="item-info">사이즈: ${item.size}</div>` : ''}
        ${item.color ? `<div class="item-info">색상: ${item.color}</div>` : ''}
        <div class="item-price">₩${item.price.toLocaleString()}</div>
      </div>
      <div class="item-actions">
        <div class="quantity-controls">
          <button class="quantity-btn" onclick="updateQuantity(${item.item_id}, ${item.quantity - 1})" ${item.quantity <= 1 ? 'disabled' : ''}>-</button>
          <span class="quantity-display">${item.quantity}</span>
          <button class="quantity-btn" onclick="updateQuantity(${item.item_id}, ${item.quantity + 1})">+</button>
        </div>
        <button class="btn-remove" onclick="removeItem(${item.item_id})">삭제</button>
      </div>
    </div>
  `).join('');

  // 주문 요약 업데이트
  updateOrderSummary(data);
}

// 주문 요약 업데이트
function updateOrderSummary(data) {
  const subtotal = data.totalPrice || 0;
  const shipping = subtotal >= 50000 ? 0 : (subtotal > 0 ? 3000 : 0);
  const total = subtotal + shipping;

  document.getElementById('subtotal').textContent = `₩${subtotal.toLocaleString()}`;
  document.getElementById('shipping').textContent = shipping === 0 ? '무료' : `₩${shipping.toLocaleString()}`;
  document.getElementById('total').textContent = `₩${total.toLocaleString()}`;
}

// 수량 변경
async function updateQuantity(itemId, newQuantity) {
  if (newQuantity < 1) return;

  try {
    const userEmail = sessionStorage.getItem('userEmail');

    const response = await fetch(`${API_BASE_URL}/cart/item/${itemId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': userEmail
      },
      credentials: 'include',
      body: JSON.stringify({ quantity: newQuantity })
    });

    const data = await response.json();

    if (data.success) {
      // 장바구니 새로고침
      await loadCart();
    } else {
      alert(data.message || '수량 변경에 실패했습니다.');
    }
  } catch (error) {
    console.error('수량 변경 오류:', error);
    alert('서버와의 통신에 실패했습니다.');
  }
}

// 아이템 삭제
async function removeItem(itemId) {
  if (!confirm('이 상품을 장바구니에서 삭제하시겠습니까?')) {
    return;
  }

  try {
    const userEmail = sessionStorage.getItem('userEmail');

    const response = await fetch(`${API_BASE_URL}/cart/item/${itemId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': userEmail
      },
      credentials: 'include'
    });

    const data = await response.json();

    if (data.success) {
      // 장바구니 새로고침
      await loadCart();
    } else {
      alert(data.message || '삭제에 실패했습니다.');
    }
  } catch (error) {
    console.error('삭제 오류:', error);
    alert('서버와의 통신에 실패했습니다.');
  }
}

// 장바구니 전체 비우기
async function clearCart() {
  if (!confirm('장바구니를 비우시겠습니까?')) {
    return;
  }

  try {
    const userEmail = sessionStorage.getItem('userEmail');

    const response = await fetch(`${API_BASE_URL}/cart/clear`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': userEmail
      },
      credentials: 'include'
    });

    const data = await response.json();

    if (data.success) {
      // 장바구니 새로고침
      await loadCart();
    } else {
      alert(data.message || '장바구니 비우기에 실패했습니다.');
    }
  } catch (error) {
    console.error('장바구니 비우기 오류:', error);
    alert('서버와의 통신에 실패했습니다.');
  }
}

// 주문하기
function checkout() {
  if (!cartData || !cartData.items || cartData.items.length === 0) {
    alert('장바구니가 비어있습니다.');
    return;
  }

  // TODO: 주문 페이지로 이동
  alert('주문 시스템은 아직 구현되지 않았습니다.');
}

// 에러 표시
function showError(message) {
  const loading = document.getElementById('loading');
  loading.innerHTML = `<p style="color: #e74c3c;">${message}</p>`;
}

