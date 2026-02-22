// 장바구니 페이지 스크립트

const API_BASE = (window.API_BASE)
  ? window.API_BASE
  : ((window.location && window.location.origin)
      ? window.location.origin.replace(/\/$/, '') + '/api'
      : '/api');

document.addEventListener('DOMContentLoaded', function() {
  Logger.log('🛒 장바구니 페이지 로드됨');
  
  // 미니 카트가 로드될 때까지 대기
  if (window.miniCart) {
    initializeCartPage();
  } else {
    // 미니 카트가 아직 로드되지 않았다면 대기
    const checkMiniCart = setInterval(() => {
      if (window.miniCart) {
        clearInterval(checkMiniCart);
        initializeCartPage();
      }
    }, 100);
  }
});

// 장바구니 데이터를 글로벌 변수로 저장
let globalCartItems = [];
let currentEditingItem = null;
let cartEventListenersBound = false;

// 즉시 전역 함수 선언 (HTML에서 onclick으로 호출 가능하도록)
async function editCartItem(itemId) {
  console.log('🚨 editCartItem 함수 호출됨! itemId:', itemId);
  Logger.log('✏️ 장바구니 아이템 수정:', itemId);
  Logger.log('🔍 globalCartItems:', globalCartItems);
  Logger.log('🔍 globalCartItems.length:', globalCartItems ? globalCartItems.length : 0);
  
  try {
    // globalCartItems가 비어있으면 다시 로드 시도
    if (!globalCartItems || globalCartItems.length === 0) {
      Logger.log('⚠️ globalCartItems가 비어있어서 다시 로드 시도');
      await renderCartItems();
    }
    
    // 아이템 찾기 (문자열 비교 정확히)
    const item = globalCartItems.find(i => String(i.item_id) === String(itemId));
    
    Logger.log('🔍 찾은 아이템:', item);
    Logger.log('🔍 모든 item_id들:', globalCartItems.map(i => ({ item_id: i.item_id, id: i.id, product_id: i.product_id })));
    
    if (!item) {
      Logger.error('❌ 상품을 찾을 수 없음. itemId:', itemId);
      Logger.error('❌ globalCartItems:', JSON.stringify(globalCartItems, null, 2));
      alert('상품을 찾을 수 없습니다. 페이지를 새로고침해주세요.');
      return;
    }
    
    currentEditingItem = item;
    
    // 제품 정보 확인 (product_id 또는 id 사용)
    const productId = item.product_id || item.id;
    Logger.log('🔍 제품 ID:', productId);
    
    // 사이즈 옵션 동적 생성
    await generateSizeOptionsForModal(productId);
    
    // 모달에 현재 값 설정
    const sizeSelect = document.getElementById('edit-size');
    const colorSelect = document.getElementById('edit-color');
    const quantityInput = document.getElementById('edit-quantity');
    
    if (sizeSelect) {
      sizeSelect.value = item.size || '';
    } else {
      Logger.error('❌ edit-size 요소를 찾을 수 없음');
    }
    
    if (colorSelect) {
      colorSelect.value = item.color || '';
    } else {
      Logger.error('❌ edit-color 요소를 찾을 수 없음');
    }
    
    if (quantityInput) {
      quantityInput.value = item.quantity || 1;
    } else {
      Logger.error('❌ edit-quantity 요소를 찾을 수 없음');
    }
    
    // 모달 표시
    const modal = document.getElementById('edit-modal');
    if (modal) {
      Logger.log('✅ 모달 표시 시도');
      // 클래스와 스타일 둘 다 설정 (더 확실하게)
      modal.classList.add('show');
      modal.style.display = 'block';
      modal.style.setProperty('display', 'block', 'important');
      Logger.log('✅ 모달 display 설정 완료:', modal.style.display);
      Logger.log('✅ 모달 클래스:', modal.className);
      
      // 모달이 실제로 보이는지 확인
      setTimeout(() => {
        const computedStyle = window.getComputedStyle(modal);
        Logger.log('✅ 모달 computed display:', computedStyle.display);
        Logger.log('✅ 모달 computed visibility:', computedStyle.visibility);
        Logger.log('✅ 모달 computed opacity:', computedStyle.opacity);
      }, 100);
    } else {
      Logger.error('❌ edit-modal 요소를 찾을 수 없음');
      alert('수정 모달을 찾을 수 없습니다.');
    }
  } catch (error) {
    Logger.error('❌ editCartItem 오류:', error);
    alert('상품 수정 중 오류가 발생했습니다: ' + error.message);
  }
}

async function removeCartItem(itemId) {
  Logger.log('🗑️ 장바구니 아이템 제거:', itemId);
  
  if (confirm('이 상품을 장바구니에서 제거하시겠습니까?')) {
    await window.miniCart.removeFromCart(itemId);
    // 서버에서 최신 데이터 로드 후 렌더링
    await renderCartItems();
  }
}

// 즉시 전역에 노출
window.editCartItem = editCartItem;
window.removeCartItem = removeCartItem;

async function initializeCartPage() {
  Logger.log('🛒 장바구니 페이지 초기화 시작');
  
  // ⚠️ 비회원 주문 지원: miniCart에서 장바구니 로드 (회원: 서버, 비회원: localStorage)
  if (window.miniCart) {
    await window.miniCart.loadCartFromServer();
  }
  
  // 장바구니 아이템 렌더링 (내부에서 miniCart 데이터 사용)
  await renderCartItems();
  
  Logger.log('🔍 renderCartItems 완료 후 globalCartItems:', globalCartItems);
  Logger.log('🔍 renderCartItems 완료 후 globalCartItems.length:', globalCartItems ? globalCartItems.length : 0);
  
  // 이벤트 리스너 등록
  bindEventListeners();
  
  Logger.log('✅ 장바구니 페이지 초기화 완료');
  Logger.log('🔍 최종 globalCartItems:', globalCartItems);
}

async function renderCartItems() {
  Logger.log('🎨 장바구니 아이템 렌더링 시작');
  
  // ⚠️ 비회원 주문 지원: miniCart에서 장바구니 데이터 로드 (회원: 서버, 비회원: localStorage)
  let cartItems = [];
  
  if (window.miniCart) {
    // miniCart에서 장바구니 가져오기 (이미 로드되어 있음)
    cartItems = window.miniCart.getCartItems() || [];
    globalCartItems = cartItems; // 글로벌 변수에 저장
    Logger.log('🛒 miniCart에서 장바구니 로드:', cartItems.length, '개 상품');
    Logger.log('🔍 globalCartItems 업데이트됨:', globalCartItems);
  } else {
    // miniCart가 없는 경우 (fallback): 직접 서버에서 로드 시도
    try {
      const response = await fetch(`${API_BASE}/cart`, {
        credentials: 'include'
      });
      const data = await response.json();
      
      Logger.log('📦 서버 응답 데이터:', data);
      
      if (data.success) {
        cartItems = data.items || [];
        globalCartItems = cartItems; // 글로벌 변수에 저장
        Logger.log('🛒 직접 서버에서 장바구니 로드:', cartItems.length, '개 상품');
        Logger.log('🔍 globalCartItems 업데이트됨:', globalCartItems);
      } else {
        Logger.log('❌ 서버에서 장바구니 로드 실패:', data.message);
      }
    } catch (error) {
      Logger.error('❌ 장바구니 로드 오류:', error);
    }
  }
  
  const cartItemsContainer = document.getElementById('cart-items');
  const cartItemCount = document.getElementById('cart-item-count');
  const cartTotal = document.getElementById('cart-total');
  
  Logger.log('📦 장바구니 아이템:', cartItems);
  Logger.log('📦 장바구니 아이템 길이:', cartItems.length);
  
  // 총 아이템 수/가격 업데이트 (선택된 항목 기준 - 초기에는 전체)
  function updateCartSelectionDisplay() {
    const container = document.getElementById('cart-items');
    if (!container) return;
    const checked = container.querySelectorAll('.cart-item-checkbox:checked');
    let selectedCount = 0;
    let selectedPrice = 0;
    checked.forEach(cb => {
      const row = cb.closest('.cart-item');
      if (row) {
        const qty = parseInt(row.getAttribute('data-quantity'), 10) || 1;
        const price = parseFloat(row.getAttribute('data-price')) || 0;
        selectedCount += qty;
        selectedPrice += price * qty;
      }
    });
    if (cartItemCount) cartItemCount.textContent = selectedCount;
    if (cartTotal) cartTotal.textContent = formatPrice(selectedPrice);
  }
  updateCartSelectionDisplay();
  
  // 장바구니가 비어있는 경우
  if (cartItems.length === 0) {
    if (cartItemsContainer) {
      cartItemsContainer.innerHTML = `
        <div class="empty-cart">
          <h2>장바구니가 비어있습니다</h2>
          <p>쇼핑을 계속하시려면 아래 버튼을 클릭하세요.</p>
          <a href="catalog.html" class="continue-shopping">쇼핑 계속하기</a>
        </div>
      `;
    }
    return;
  }
  
  // 장바구니 아이템 렌더링 (체크박스 포함)
  if (cartItemsContainer) {
    const itemId = (item) => String(item.item_id || item.id || '');
    const imageSrc = (item) => {
      let src = item.image || '';
      if (src.startsWith('/uploads/') || src.startsWith('/image/')) return src;
      return src ? (src.startsWith('image/') ? '/' + src : '/image/' + src) : '/image/default.jpg';
    };
    const itemsHtml = cartItems.map(item => `
      <div class="cart-item" data-item-id="${escapeHtml(itemId(item))}" data-quantity="${item.quantity || 1}" data-price="${item.price || 0}">
        <input type="checkbox" class="cart-item-checkbox" value="${escapeHtml(itemId(item))}" checked aria-label="체크아웃에 포함">
        <img src="${escapeHtml(imageSrc(item))}" alt="${escapeHtml(item.name)}" class="cart-item-image" onerror="this.src='/image/default.jpg'">
        <div class="cart-item-info">
          <h3 class="cart-item-name">${escapeHtml(item.name)}</h3>
          <div class="cart-item-price">${formatPrice(item.price)}</div>
          <div class="cart-item-details">
            <div class="cart-item-color">색상: ${escapeHtml(item.color)}</div>
            <div class="cart-item-quantity">수량: ${escapeHtml(item.quantity)}</div>
          </div>
          <div class="cart-item-actions">
            <button class="cart-item-edit" data-item-id="${escapeHtml(itemId(item))}" type="button">수정</button>
            <button class="cart-item-remove" data-item-id="${escapeHtml(itemId(item))}" type="button">제거</button>
          </div>
        </div>
      </div>
    `).join('');
    const selectAllHtml = cartItems.length > 0 ? `
      <div class="cart-select-all">
        <input type="checkbox" id="cart-select-all" class="cart-select-all-checkbox" checked aria-label="전체 선택">
        <label for="cart-select-all">전체 선택</label>
      </div>
    ` : '';
    cartItemsContainer.innerHTML = selectAllHtml + itemsHtml;
    
    // 이벤트 위임으로 수정/제거 버튼에 이벤트 리스너 추가 (한 번만)
    if (!cartEventListenersBound && cartItemsContainer) {
      cartItemsContainer.addEventListener('click', function(e) {
        const editBtn = e.target.closest('.cart-item-edit');
        const removeBtn = e.target.closest('.cart-item-remove');
        
        if (editBtn) {
          e.preventDefault();
          const id = editBtn.getAttribute('data-item-id');
          Logger.log('🔘 수정 버튼 클릭 (이벤트 위임):', id);
          editCartItem(id);
        }
        
        if (removeBtn) {
          e.preventDefault();
          const id = removeBtn.getAttribute('data-item-id');
          Logger.log('🔘 제거 버튼 클릭 (이벤트 위임):', id);
          removeCartItem(id);
        }
      });
      cartItemsContainer.addEventListener('change', function(e) {
        if (e.target && e.target.classList) {
          if (e.target.classList.contains('cart-item-checkbox')) {
            const selectAll = document.getElementById('cart-select-all');
            const itemCbs = cartItemsContainer.querySelectorAll('.cart-item-checkbox');
            const allChecked = itemCbs.length > 0 && Array.from(itemCbs).every(cb => cb.checked);
            if (selectAll) selectAll.checked = allChecked;
            updateCartSelectionDisplay();
          }
          if (e.target.classList.contains('cart-select-all-checkbox')) {
            const checkboxes = cartItemsContainer.querySelectorAll('.cart-item-checkbox');
            checkboxes.forEach(cb => { cb.checked = e.target.checked; });
            updateCartSelectionDisplay();
          }
        }
      });
      cartEventListenersBound = true;
      Logger.log('✅ 장바구니 이벤트 리스너 등록 완료');
    }
  }
  
  Logger.log('✅ 장바구니 아이템 렌더링 완료');
}

function bindEventListeners() {
  console.log('🔧 bindEventListeners 시작');
  
  // document에서 클릭 이벤트 위임
  document.addEventListener('click', function(e) {
    if (e.target && e.target.id === 'checkout-btn') {
      e.preventDefault();
      console.log('🎯 체크아웃 버튼 클릭됨!');
      Logger.log('🎯 체크아웃 버튼 클릭됨!');
      handleCheckout();
    }
  });
  
  console.log('✅ 이벤트 위임 설정 완료');
  Logger.log('✅ 이벤트 위임 설정 완료');
  
  // 도움말 아이템들
  const helpItems = document.querySelectorAll('.help-item');
  helpItems.forEach(item => {
    item.addEventListener('click', function() {
      // 도움말 토글 기능 (향후 구현)
      Logger.log('도움말 클릭됨:', this.textContent.trim());
    });
  });
  
  // 모달 이벤트 리스너
  const modal = document.getElementById('edit-modal');
  const modalClose = document.getElementById('modal-close');
  const modalCancel = document.getElementById('modal-cancel');
  const modalSave = document.getElementById('modal-save');
  
  if (modalClose) {
    modalClose.addEventListener('click', () => {
      if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
      }
    });
  }
  
  if (modalCancel) {
    modalCancel.addEventListener('click', () => {
      if (modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
      }
    });
  }
  
  if (modalSave) {
    modalSave.addEventListener('click', saveCartItemEdit);
  }
  
  // 모달 외부 클릭 시 닫기
  if (modal) {
    window.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('show');
        modal.style.display = 'none';
      }
    });
  }
}

async function saveCartItemEdit() {
  if (!currentEditingItem) return;
  
  const size = document.getElementById('edit-size').value;
  const color = document.getElementById('edit-color').value;
  const quantity = parseInt(document.getElementById('edit-quantity').value);
  
  if (!size || !color) {
    alert('사이즈와 색상을 선택해주세요.');
    return;
  }
  
  if (quantity < 1) {
    alert('수량은 1 이상이어야 합니다.');
    return;
  }
  
  try {
    // API로 수정 요청
    const response = await fetch(`${API_BASE}/cart/${currentEditingItem.item_id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        size: size,
        color: color,
        quantity: quantity
      })
    });
    
    if (!response.ok) {
      throw new Error('수정 실패');
    }
    
    // 모달 닫기
    const modal = document.getElementById('edit-modal');
    if (modal) {
      modal.classList.remove('show');
      modal.style.display = 'none';
    }
    
    // 장바구니 새로고침
    await renderCartItems();
    
    alert('장바구니 항목이 수정되었습니다.');
    
  } catch (error) {
    Logger.error('❌ 장바구니 수정 오류:', error);
    alert('수정에 실패했습니다. 잠시 후 다시 시도해주세요.');
  }
}



function handleCheckout() {
  console.log('💳 체크아웃 시작');
  Logger.log('💳 체크아웃 시작');
  
  const cartItemsContainer = document.getElementById('cart-items');
  if (!cartItemsContainer) {
    window.location.href = 'checkout.html';
    return;
  }
  const checked = cartItemsContainer.querySelectorAll('.cart-item-checkbox:checked');
  const selectedIds = Array.from(checked).map(cb => cb.value).filter(Boolean);
  if (selectedIds.length === 0) {
    alert('선택한 항목이 없습니다.');
    return;
  }
  try {
    sessionStorage.setItem('pm_checkout_selected_ids', JSON.stringify(selectedIds));
  } catch (e) {
    console.warn('pm_checkout_selected_ids 저장 실패:', e);
  }
  window.location.href = 'checkout.html';
}

function formatPrice(price) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(price);
}

  // 제품 ID에서 사이즈 정보 추출 (buy-script.js와 동일한 로직)
function extractSizesFromProductId(productId) {
  if (!productId) return [];

  const parts = productId.split('-');
  const lastPart = parts[parts.length - 1];

  const validSizes = ['S', 'M', 'L', 'XL', 'XXL', 'F'];
  const sizes = [];

  // 마지막 부분이 F로 끝나는 경우 (예: BK/GY-F)
  if (lastPart.endsWith('F') && !lastPart.endsWith('TF')) {
    if (lastPart.includes('-F') || lastPart.endsWith('/F')) {
      sizes.push('F');
      return sizes;
    } else if (lastPart === 'F') {
      return ['F'];
    }
  }

  // 마지막 부분을 하이픈과 슬래시로 분리하여 사이즈 찾기
  const allParts = lastPart.split(/[-/]/);
  
  allParts.forEach(part => {
    const trimmed = part.trim().toUpperCase();
    if (validSizes.includes(trimmed)) {
      sizes.push(trimmed);
    }
  });

  // 중복 제거 및 정렬
  const uniqueSizes = [...new Set(sizes)];
  const sizeOrder = ['S', 'M', 'L', 'XL', 'XXL', 'F'];
  uniqueSizes.sort((a, b) => {
    return sizeOrder.indexOf(a) - sizeOrder.indexOf(b);
  });

  return uniqueSizes;
}

// 모달용 사이즈 옵션 생성
async function generateSizeOptionsForModal(productId) {
  if (!productId) return;

  const sizeSelect = document.getElementById('edit-size');
  if (!sizeSelect) return;

  // 제품 ID에서 사이즈 추출
  const availableSizes = extractSizesFromProductId(productId);

  // 액세서리 체크
  const productIdLower = productId.toLowerCase();
  const isAccessory = productIdLower.includes('acc-') || productIdLower.startsWith('pm-25-acc-');

  // 기본 옵션만 남기고 나머지 제거
  sizeSelect.innerHTML = '<option value="">사이즈 선택</option>';

  // 사이즈가 없거나 액세서리인 경우 Free만 추가
  if (availableSizes.length === 0 || isAccessory) {
    const option = document.createElement('option');
    option.value = 'Free';
    option.textContent = 'Free';
    sizeSelect.appendChild(option);
    Logger.log('액세서리 제품: Free 사이즈만 추가');
    return;
  }

  // 추출된 사이즈로 옵션 생성
  availableSizes.forEach(size => {
    const option = document.createElement('option');
    option.value = size;
    option.textContent = size === 'F' ? 'Free' : size;
    sizeSelect.appendChild(option);
  });

  Logger.log('모달 사이즈 옵션 생성 완료:', availableSizes);
}

  
