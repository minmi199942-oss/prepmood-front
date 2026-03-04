// 장바구니 페이지 스크립트

const API_BASE = (window.API_BASE)
  ? window.API_BASE
  : ((window.location && window.location.origin)
      ? window.location.origin.replace(/\/$/, '') + '/api'
      : '/api');

const GUEST_CART_KEY = 'pm_cart_v1';
const isDevHost = () => (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

/** 장바구니 페이지용 간단 토스트 (3번 이슈: 옵션 로드 실패/편집 불가 시 피드백) */
function showCartToast(message) {
  const text = typeof message === 'string' ? message : '알 수 없는 오류';
  const el = document.createElement('div');
  el.setAttribute('class', 'cart-toast');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = text;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('cart-toast--visible'));
  setTimeout(() => {
    el.classList.remove('cart-toast--visible');
    setTimeout(() => el.remove(), 300);
  }, 2800);
  el.addEventListener('click', () => {
    el.classList.remove('cart-toast--visible');
    setTimeout(() => el.remove(), 300);
  }, { once: true });
}

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
let cartEventListenersBound = false;

// 편집 버튼 클릭 시: 옵션 개수에 따라 색상만/사이즈만/둘 다 표시
async function toggleCartItemEdit(itemId) {
  const item = globalCartItems.find(i => String(i.item_id || i.id) === String(itemId));
  if (!item) return;

  const cartItem = Array.from(document.querySelectorAll('.cart-item')).find(el => el.getAttribute('data-item-id') === String(itemId));
  const editArea = cartItem ? cartItem.querySelector('.cart-item-edit-area') : null;
  const editRows = cartItem ? cartItem.querySelector('.cart-edit-rows') : null;
  if (!editArea || !editRows) return;

  const isShown = editArea.classList.contains('is-open');
  if (isShown) {
    editArea.classList.remove('is-open');
    return;
  }

  const productId = item.product_id || item.id;
  const currentSize = item.size || '';
  const currentColor = item.color || '';
  const options = await fetchProductOptions(productId);
  if (options.error) {
    showCartToast('옵션을 불러올 수 없습니다. 잠시 후 다시 시도해주세요.');
    return;
  }
  const hasMultipleColors = options.colors.length > 1;
  const hasMultipleSizes = options.sizes.length > 1;
  if (!hasMultipleColors && !hasMultipleSizes) {
    showCartToast('편집할 옵션이 없습니다.');
    return;
  }

  // 다른 아이템의 편집 영역은 닫기 (한 번에 하나만 열림)
  document.querySelectorAll('.cart-item-edit-area.is-open').forEach(function(area) {
    if (area !== editArea) area.classList.remove('is-open');
  });

  const rows = [];

  if (hasMultipleColors) {
    const colorList = await getColorsForCartEdit(productId, currentSize, currentColor, options);
    const colorOptionsHtml = colorList.map(({ color, inStock }) => {
      const selected = (currentColor || '') === color;
      const label = inStock ? escapeHtml(color) : `${escapeHtml(color)} (품절)`;
      const extraClass = inStock ? '' : ' is-out-of-stock';
      const disabled = inStock ? '' : ' disabled aria-disabled="true"';
      return `<button type="button" class="cart-color-option${selected ? ' is-selected' : ''}${extraClass}" data-color="${escapeHtml(color)}" data-in-stock="${inStock ? 'true' : 'false'}" role="option"${selected ? ' aria-selected="true"' : ''}${disabled}>${label}</button>`;
    }).join('');
    rows.push(`
      <div class="cart-edit-row cart-color-edit-row">
        <label class="cart-edit-label">색상:</label>
        <div class="cart-color-custom" data-item-id="${escapeHtml(itemId)}" data-type="color">
          <button type="button" class="cart-color-trigger" aria-expanded="false" aria-haspopup="listbox" aria-label="색상 선택">
            <span class="cart-color-trigger-text">${escapeHtml(String(currentColor).trim())}</span>
            <span class="cart-color-trigger-arrow" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2 4l4 4 4-4H2z"/></svg></span>
          </button>
          <div class="cart-color-dropdown" role="listbox">${colorOptionsHtml}</div>
        </div>
      </div>
    `);
  }

  if (hasMultipleSizes) {
    const sizeList = await getSizesForCartEdit(productId, currentColor, currentSize, options);
    const sizeOptionsHtml = sizeList.map(({ size, inStock }) => {
      const sizeStr = String(size).trim();
      const selected = (currentSize || '') === sizeStr;
      const label = inStock ? escapeHtml(sizeStr || '-') : `${escapeHtml(sizeStr || '-')} (품절)`;
      const extraClass = inStock ? '' : ' is-out-of-stock';
      const disabled = inStock ? '' : ' disabled aria-disabled="true"';
      return `<button type="button" class="cart-size-option${selected ? ' is-selected' : ''}${extraClass}" data-size="${escapeHtml(sizeStr)}" data-in-stock="${inStock ? 'true' : 'false'}" role="option"${selected ? ' aria-selected="true"' : ''}${disabled}>${label}</button>`;
    }).join('');
    rows.push(`
      <div class="cart-edit-row cart-size-edit-row">
        <label class="cart-edit-label">사이즈:</label>
        <div class="cart-size-custom" data-item-id="${escapeHtml(itemId)}" data-type="size">
          <button type="button" class="cart-size-trigger" aria-expanded="false" aria-haspopup="listbox" aria-label="사이즈 선택">
            <span class="cart-size-trigger-text">${escapeHtml(String(currentSize).trim()) || '-'}</span>
            <span class="cart-size-trigger-arrow" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2 4l4 4 4-4H2z"/></svg></span>
          </button>
          <div class="cart-size-dropdown" role="listbox">${sizeOptionsHtml}</div>
        </div>
      </div>
    `);
  }

  editRows.innerHTML = rows.join('');
  editArea.offsetHeight;
  requestAnimationFrame(() => {
    editArea.classList.add('is-open');
  });
}

// 상품별 재고 가능 수량 조회
async function fetchProductStockCount(productId, size, color) {
  if (!productId) return 0;
  try {
    const params = new URLSearchParams({ product_id: productId });
    if (size) params.set('size', size);
    if (color) params.set('color', color);
    const res = await fetch(`${API_BASE}/products/stock-count?${params}`, { credentials: 'include' });
    const data = await res.json();
    return data.success && typeof data.available_count === 'number' ? data.available_count : 0;
  } catch (e) {
    Logger.warn('재고 수량 조회 실패:', e.message);
    return 0;
  }
}

// 상품별 옵션 한 번에 조회 (색상·사이즈 목록만, 재고 여부는 별도)
// 실패 시 { colors, sizes, error: true } 반환 → 토스트로 일시 오류 안내
async function fetchProductOptions(productId) {
  if (!productId) return { colors: [], sizes: [] };
  try {
    const res = await fetch(`${API_BASE}/products/options?product_id=${encodeURIComponent(productId)}`, { credentials: 'include' });
    const data = await res.json();
    if (!data.success || !data.options) {
      Logger.warn('옵션 조회 실패: success 또는 options 없음');
      return { colors: [], sizes: [], error: true };
    }
    const colors = Array.isArray(data.options.colors)
      ? data.options.colors.map(c => (typeof c === 'string' ? c : c.color)).filter(Boolean)
      : [];
    const sizes = Array.isArray(data.options.sizes)
      ? data.options.sizes.map(s => (typeof s === 'string' ? s : s.size)).filter(Boolean)
      : [];
    return { colors, sizes };
  } catch (e) {
    Logger.warn('옵션 조회 실패:', e.message);
    return { colors: [], sizes: [], error: true };
  }
}

// 하위 호환: 색상만 필요할 때
async function fetchProductColors(productId) {
  const { colors } = await fetchProductOptions(productId);
  return colors;
}

// 장바구니 색상 편집용: 해당 상품의 모든 색상 + 선택한 사이즈 기준 재고 여부 반환
// 반환: { color: string, inStock: boolean }[]
// options: 선택. 넘기면 fetchProductOptions 재호출 없이 사용 (호출 횟수 절감)
async function getColorsForCartEdit(productId, size, currentColor, options) {
  const productColors = (options && Array.isArray(options.colors)) ? options.colors : await fetchProductColors(productId);
  const list = [];
  const seen = new Set();
  for (const color of productColors) {
    if (seen.has(color)) continue;
    seen.add(color);
    const count = await fetchProductStockCount(productId, size, color);
    list.push({ color, inStock: count > 0 });
  }
  if (currentColor && !seen.has(currentColor)) {
    const count = await fetchProductStockCount(productId, size, currentColor);
    list.unshift({ color: currentColor, inStock: count > 0 });
  }
  return list;
}

// 장바구니 사이즈 편집용: 해당 상품의 모든 사이즈 + 선택한 색상 기준 재고 여부
// options: 선택. 넘기면 fetchProductOptions 재호출 없이 사용 (호출 횟수 절감)
async function getSizesForCartEdit(productId, color, currentSize, options) {
  const sizes = (options && Array.isArray(options.sizes)) ? options.sizes : (await fetchProductOptions(productId)).sizes;
  const list = [];
  const seen = new Set();
  for (const size of sizes) {
    const key = (size || '').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    const count = await fetchProductStockCount(productId, size, color);
    list.push({ size: size || '', inStock: count > 0 });
  }
  if (currentSize !== undefined && currentSize !== null && currentSize !== '' && !seen.has(String(currentSize).trim())) {
    const count = await fetchProductStockCount(productId, currentSize, color);
    list.unshift({ size: String(currentSize).trim(), inStock: count > 0 });
  }
  return list;
}

async function updateCartQuantity(itemId, newQuantity, row, qtySpan) {
  if (!window.miniCart || !window.miniCart.updateQuantity) return;
  await window.miniCart.updateQuantity(itemId, newQuantity);
  await renderCartItems();
}

async function updateCartColor(itemId, newColor) {
  const item = globalCartItems.find(i => String(i.item_id || i.id) === String(itemId));
  if (!item) return;

  const useGuest = window.miniCart && typeof window.miniCart.checkLoginStatus === 'function'
    ? (await window.miniCart.checkLoginStatus()).status === 'guest'
    : isDevHost();

  if (useGuest) {
    try {
      const raw = localStorage.getItem(GUEST_CART_KEY) || '[]';
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const idx = arr.findIndex(i => String(i.item_id || i.id) === String(itemId));
        if (idx >= 0) {
          arr[idx].color = newColor;
          localStorage.setItem(GUEST_CART_KEY, JSON.stringify(arr));
          if (window.miniCart) window.miniCart.loadCartFromLocalStorage();
          await renderCartItems();
          return;
        }
      }
    } catch (e) {
      Logger.warn('비회원 색상 업데이트 실패', e);
      return;
    }
  }

  try {
    const res = await fetch(`${API_BASE}/cart/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        size: item.size || '',
        color: newColor,
        quantity: item.quantity || 1
      })
    });
    const data = await res.json();
    if (data.success) {
      await renderCartItems();
    } else {
      alert(data.message || '색상 변경에 실패했습니다.');
    }
  } catch (e) {
    Logger.error('색상 업데이트 오류:', e);
    alert('색상 변경 중 오류가 발생했습니다.');
  }
}

async function updateCartSize(itemId, newSize) {
  const item = globalCartItems.find(i => String(i.item_id || i.id) === String(itemId));
  if (!item) return;

  const useGuest = window.miniCart && typeof window.miniCart.checkLoginStatus === 'function'
    ? (await window.miniCart.checkLoginStatus()).status === 'guest'
    : isDevHost();

  if (useGuest) {
    try {
      const raw = localStorage.getItem(GUEST_CART_KEY) || '[]';
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const idx = arr.findIndex(i => String(i.item_id || i.id) === String(itemId));
        if (idx >= 0) {
          arr[idx].size = newSize;
          localStorage.setItem(GUEST_CART_KEY, JSON.stringify(arr));
          if (window.miniCart) window.miniCart.loadCartFromLocalStorage();
          await renderCartItems();
          return;
        }
      }
    } catch (e) {
      Logger.warn('비회원 사이즈 업데이트 실패', e);
      return;
    }
  }

  try {
    const res = await fetch(`${API_BASE}/cart/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        size: newSize,
        color: item.color || '',
        quantity: item.quantity || 1
      })
    });
    const data = await res.json();
    if (data.success) {
      await renderCartItems();
    } else {
      alert(data.message || '사이즈 변경에 실패했습니다.');
    }
  } catch (e) {
    Logger.error('사이즈 업데이트 오류:', e);
    alert('사이즈 변경 중 오류가 발생했습니다.');
  }
}

function showRemoveConfirmModal(itemId) {
  const item = globalCartItems.find(i => String(i.item_id || i.id) === String(itemId));
  if (!item) return;
  const modal = document.getElementById('cart-remove-modal');
  if (!modal) return;
  const imageSrc = (src) => {
    let s = (src || '').toString().trim();
    if (s.startsWith('/uploads/') || s.startsWith('/image/')) return s;
    if (s) return s.startsWith('image/') ? '/' + s : '/image/' + s;
    return isDevHost() ? '/image/hat.jpg' : '/image/default.jpg';
  };
  const img = modal.querySelector('#cart-remove-modal-image');
  const nameEl = modal.querySelector('#cart-remove-modal-name');
  const colorEl = modal.querySelector('#cart-remove-modal-color');
  const priceEl = modal.querySelector('#cart-remove-modal-price');
  if (img) {
    img.src = imageSrc(item.image);
    img.alt = item.name || '';
    img.onerror = function() { this.src = '/image/hat.jpg'; this.onerror = null; };
  }
  if (nameEl) nameEl.textContent = item.name || '';
  if (colorEl) {
    colorEl.textContent = (item.color || '').trim() || '';
    colorEl.style.display = (item.color || '').trim() ? '' : 'none';
  }
  if (priceEl) priceEl.textContent = formatPrice(item.price);
  modal.setAttribute('data-remove-item-id', itemId);
  modal.style.display = 'block';
  modal.classList.add('show');
}

function hideRemoveConfirmModal() {
  const modal = document.getElementById('cart-remove-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('show');
    modal.removeAttribute('data-remove-item-id');
  }
}

async function removeCartItem(itemId) {
  Logger.log('🗑️ 장바구니 아이템 제거:', itemId);
  hideRemoveConfirmModal();

  if (!window.miniCart || typeof window.miniCart.removeFromCart !== 'function') {
    Logger.warn('removeCartItem: miniCart.removeFromCart 없음');
    return;
  }
  await window.miniCart.removeFromCart(itemId);
  await renderCartItems();
}

// 즉시 전역에 노출
window.toggleColorEdit = toggleCartItemEdit;
window.toggleCartItemEdit = toggleCartItemEdit;
window.removeCartItem = removeCartItem;

async function initializeCartPage() {
  Logger.log('🛒 장바구니 페이지 초기화 시작');
  
  if (window.miniCart) {
    await window.miniCart.loadCartFromServer();
  }
  
  // 개발 한정: 서버 없을 때(unknown)는 localStorage를 읽지 않으므로, 빈 경우 직접 로드 후 없으면 개발용 1개 추가
  if (isDevHost() && window.miniCart) {
    let items = window.miniCart.getCartItems() || [];
    if (items.length === 0) {
      window.miniCart.loadCartFromLocalStorage();
      items = window.miniCart.getCartItems() || [];
    }
    if (items.length === 0) {
      try {
        window.miniCart.addToCartLocalStorage({
          id: 'dev-cart-1',
          name: '솔리드 수트 슬림 타이 Solid Suit Slim Tie 26 - Black',
          price: 10000,
          size: 'M',
          color: 'Black',
          quantity: 1,
          image: '/image/hat.jpg'
        });
      } catch (e) {
        Logger.warn('개발용 장바구니 아이템 추가 실패', e);
      }
    }
  }
  
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
      let src = (item.image || '').toString().trim();
      if (src.startsWith('/uploads/') || src.startsWith('/image/')) return src;
      if (src) return src.startsWith('image/') ? '/' + src : '/image/' + src;
      return isDevHost() ? '/image/hat.jpg' : '/image/default.jpg';
    };
    const pid = (item) => item.product_id || item.id || '';
    const counts = await Promise.all(cartItems.map(item =>
      fetchProductStockCount(pid(item), item.size || '', item.color || '')
    ));
    const itemsHtml = cartItems.map((item, idx) => {
      const id = itemId(item);
      const qty = item.quantity || 1;
      const maxQty = counts[idx] ?? 999;
      const outOfStock = maxQty === 0;
      const atLimit = outOfStock || qty >= maxQty;
      // 재고 없음: 수량 1개여도 메시지 표시. 제한 수량 도달: qty > 1일 때만 표시
      const limitMsgHtml = outOfStock
        ? '<p class="cart-qty-limit-msg">이 제품은 현재 재고가 없습니다.</p>'
        : (atLimit && qty > 1 ? '<p class="cart-qty-limit-msg">이 제품의 제한 수량에 도달했습니다.</p>' : '');
      const plusDisabled = atLimit ? ' disabled aria-label="제한 수량 도달"' : '';
      return `
      <div class="cart-item" data-item-id="${escapeHtml(id)}" data-quantity="${qty}" data-max-quantity="${maxQty}" data-price="${item.price || 0}">
        <input type="checkbox" class="cart-item-checkbox" value="${escapeHtml(id)}" checked aria-label="체크아웃에 포함">
        <img src="${escapeHtml(imageSrc(item))}" alt="${escapeHtml(item.name)}" class="cart-item-image" onerror="this.src='/image/hat.jpg'; this.onerror=null;">
        <div class="cart-item-info">
          <h3 class="cart-item-name">${escapeHtml(item.name)}</h3>
          ${(item.color || '').trim() || (item.size || '').trim() ? `<p class="cart-item-option">${[item.color, item.size].filter(Boolean).map(x => escapeHtml(String(x).trim())).join(' · ')}</p>` : ''}
          <div class="cart-item-details">
            <div class="cart-item-quantity-row">
              <span class="cart-item-quantity-label">수량</span>
              <div class="cart-quantity-control">
                <button type="button" class="cart-qty-btn cart-qty-minus" data-item-id="${escapeHtml(id)}" aria-label="수량 감소">−</button>
                <span class="cart-qty-value" data-item-id="${escapeHtml(id)}">${qty}</span>
                <button type="button" class="cart-qty-btn cart-qty-plus" data-item-id="${escapeHtml(id)}" aria-label="수량 증가"${plusDisabled}>+</button>
              </div>
            </div>
            ${limitMsgHtml}
            <div class="cart-item-edit-area">
              <div class="cart-edit-rows"></div>
            </div>
          </div>
          <div class="cart-item-actions">
            <button class="cart-item-edit" data-item-id="${escapeHtml(id)}" type="button">편집</button>
            <button class="cart-item-remove" data-item-id="${escapeHtml(id)}" type="button">제거</button>
          </div>
        </div>
        <div class="cart-item-price">${formatPrice(item.price)}</div>
      </div>
    `;
    }).join('');
    const selectAllHtml = cartItems.length > 0 ? `
      <div class="cart-select-all">
        <input type="checkbox" id="cart-select-all" class="cart-select-all-checkbox" checked aria-label="전체 선택">
        <label for="cart-select-all">전체 선택</label>
      </div>
    ` : '';
    cartItemsContainer.innerHTML = selectAllHtml + itemsHtml;
    updateCartSelectionDisplay();

    // 이벤트 위임으로 편집/제거/수량 버튼에 이벤트 리스너 추가 (한 번만)
    if (!cartEventListenersBound && cartItemsContainer) {
      cartItemsContainer.addEventListener('click', function(e) {
        const editBtn = e.target.closest('.cart-item-edit');
        const removeBtn = e.target.closest('.cart-item-remove');
        const qtyMinus = e.target.closest('.cart-qty-minus');
        const qtyPlus = e.target.closest('.cart-qty-plus');
        
        if (editBtn) {
          e.preventDefault();
          toggleCartItemEdit(editBtn.getAttribute('data-item-id'));
        }
        if (removeBtn) {
          e.preventDefault();
          showRemoveConfirmModal(removeBtn.getAttribute('data-item-id'));
        }
        if (qtyMinus || qtyPlus) {
          e.preventDefault();
          const id = (qtyMinus || qtyPlus).getAttribute('data-item-id');
          const row = (qtyMinus || qtyPlus).closest('.cart-item');
          if (!row) return;
          const qtySpan = row.querySelector('.cart-qty-value');
          const maxQty = parseInt(row.getAttribute('data-max-quantity'), 10) || 999;
          let qty = parseInt(qtySpan ? qtySpan.textContent : 1, 10) || 1;
          if (qtyPlus && qty >= maxQty) return;
          qty = qtyMinus ? Math.max(1, qty - 1) : qty + 1;
          updateCartQuantity(id, qty, row, qtySpan);
        }
      });
      cartItemsContainer.addEventListener('click', function(e) {
        const trigger = e.target.closest('.cart-color-trigger');
        const option = e.target.closest('.cart-color-option');
        const colorLabel = e.target.closest('.cart-edit-label');
        const colorRow = e.target.closest('.cart-color-edit-row');
        const customWrap = e.target.closest('.cart-color-custom');
        const editArea = e.target.closest('.cart-item-edit-area');
        if ((trigger && customWrap) || (colorLabel && colorRow && colorRow.contains(colorLabel))) {
          e.preventDefault();
          e.stopPropagation();
          const wrap = customWrap || (colorRow && colorRow.querySelector('.cart-color-custom'));
          const trig = wrap ? wrap.querySelector('.cart-color-trigger') : null;
          if (wrap) {
            const isOpen = wrap.classList.toggle('is-dropdown-open');
            if (trig) trig.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
          }
          return;
        }
        if (option && customWrap) {
          e.preventDefault();
          e.stopPropagation();
          if (option.getAttribute('data-in-stock') === 'false') return;
          const itemId = customWrap.getAttribute('data-item-id');
          const newColor = option.getAttribute('data-color');
          if (itemId && newColor !== null) {
            customWrap.classList.remove('is-dropdown-open');
            const t = customWrap.querySelector('.cart-color-trigger');
            if (t) t.setAttribute('aria-expanded', 'false');
            updateCartColor(itemId, newColor);
          }
          return;
        }
        const sizeTrigger = e.target.closest('.cart-size-trigger');
        const sizeOption = e.target.closest('.cart-size-option');
        const sizeRow = e.target.closest('.cart-size-edit-row');
        const sizeWrap = e.target.closest('.cart-size-custom');
        const sizeLabel = e.target.closest('.cart-edit-label');
        if ((sizeTrigger && sizeWrap) || (sizeLabel && sizeRow && sizeRow.contains(sizeLabel))) {
          e.preventDefault();
          e.stopPropagation();
          const wrap = sizeWrap || (sizeRow && sizeRow.querySelector('.cart-size-custom'));
          const trig = wrap ? wrap.querySelector('.cart-size-trigger') : null;
          if (wrap) {
            const isOpen = wrap.classList.toggle('is-dropdown-open');
            if (trig) trig.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
          }
          return;
        }
        if (sizeOption && sizeWrap) {
          e.preventDefault();
          e.stopPropagation();
          if (sizeOption.getAttribute('data-in-stock') === 'false') return;
          const itemId = sizeWrap.getAttribute('data-item-id');
          const newSize = sizeOption.getAttribute('data-size');
          if (itemId && newSize !== null) {
            sizeWrap.classList.remove('is-dropdown-open');
            const t = sizeWrap.querySelector('.cart-size-trigger');
            if (t) t.setAttribute('aria-expanded', 'false');
            updateCartSize(itemId, newSize);
          }
          return;
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

    // 바깥 클릭 시 커스텀 색상 드롭다운 닫기 (한 번만 등록)
    if (cartItemsContainer && !document.body.hasAttribute('data-cart-color-dropdown-bound')) {
      document.body.setAttribute('data-cart-color-dropdown-bound', '1');
      document.addEventListener('click', function(e) {
        if (e.target.closest('.cart-color-custom') || e.target.closest('.cart-size-custom')) return;
        document.querySelectorAll('.cart-color-custom.is-dropdown-open').forEach(function(el) {
          el.classList.remove('is-dropdown-open');
          const t = el.querySelector('.cart-color-trigger');
          if (t) t.setAttribute('aria-expanded', 'false');
        });
        document.querySelectorAll('.cart-size-custom.is-dropdown-open').forEach(function(el) {
          el.classList.remove('is-dropdown-open');
          const t = el.querySelector('.cart-size-trigger');
          if (t) t.setAttribute('aria-expanded', 'false');
        });
      });
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
      Logger.log('도움말 클릭됨:', this.textContent.trim());
    });
  });

  // 제거 확인 모달: 취소, 닫기, 네
  const removeModal = document.getElementById('cart-remove-modal');
  if (removeModal) {
    removeModal.addEventListener('click', function(e) {
      if (e.target === removeModal) hideRemoveConfirmModal();
    });
    const closeBtn = removeModal.querySelector('.cart-remove-modal-close');
    const cancelBtn = removeModal.querySelector('.cart-remove-modal-cancel');
    const confirmBtn = removeModal.querySelector('.cart-remove-modal-confirm');
    if (closeBtn) closeBtn.addEventListener('click', hideRemoveConfirmModal);
    if (cancelBtn) cancelBtn.addEventListener('click', hideRemoveConfirmModal);
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function() {
        const itemId = removeModal.getAttribute('data-remove-item-id');
        if (itemId) removeCartItem(itemId);
      });
    }
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

