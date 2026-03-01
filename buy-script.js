// buy-script.js - 제품 상세 페이지 스크립트

(function() {
  'use strict';

  const Logger = window.Logger || { log: function() {}, warn: function() {}, error: function() {} };

  // API 기본 URL 설정 (환경에 따라 자동 변경)
  const API_BASE_URL = (window.API_BASE)
    ? window.API_BASE
    : ((window.location && window.location.origin)
        ? window.location.origin.replace(/\/$/, '') + '/api'
        : '/api');

  // URL에서 제품 ID 가져오기
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id');

  let currentProduct = null;
  let selectedSize = '';
  let selectedColor = '';

  function escapeHtmlBuy(str) {
    if (str == null) return '';
    const s = String(str);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** 커스텀 드롭다운을 네이티브 select 옵션과 동기화 (cart 편집 스타일) */
  function syncBuyDropdownsFromSelects() {
    const sizeSelect = document.getElementById('size-select');
    const colorSelect = document.getElementById('color-select');
    const sizeDropdown = document.getElementById('buy-size-dropdown');
    const colorDropdown = document.getElementById('buy-color-dropdown');
    const sizeTriggerText = document.getElementById('buy-size-trigger-text');
    const colorTriggerText = document.getElementById('buy-color-trigger-text');

    if (sizeSelect && sizeDropdown && sizeTriggerText) {
      const opts = sizeSelect.options;
      let html = '';
      let selectedText = '사이즈를 선택해주세요';
      for (let i = 0; i < opts.length; i++) {
        const o = opts[i];
        const val = o.value;
        const text = o.textContent.trim();
        if (val === '') continue;
        const selected = sizeSelect.value === val;
        if (selected) selectedText = text;
        const dis = o.disabled ? ' is-out-of-stock disabled' : '';
        const sel = selected ? ' is-selected' : '';
        html += `<button type="button" class="buy-select-option${sel}${dis}" data-value="${escapeHtmlBuy(val)}" role="option"${o.disabled ? ' disabled' : ''}>${escapeHtmlBuy(text)}</button>`;
      }
      sizeDropdown.innerHTML = html;
      sizeTriggerText.textContent = selectedText;
    }

    if (colorSelect && colorDropdown && colorTriggerText) {
      const opts = colorSelect.options;
      let html = '';
      let selectedText = '색상을 선택해주세요';
      for (let i = 0; i < opts.length; i++) {
        const o = opts[i];
        const val = o.value;
        const text = o.textContent.trim();
        if (val === '') continue;
        const selected = colorSelect.value === val;
        if (selected) selectedText = text;
        const dis = o.disabled ? ' is-out-of-stock disabled' : '';
        const sel = selected ? ' is-selected' : '';
        html += `<button type="button" class="buy-select-option${sel}${dis}" data-value="${escapeHtmlBuy(val)}" role="option"${o.disabled ? ' disabled' : ''}>${escapeHtmlBuy(text)}</button>`;
      }
      colorDropdown.innerHTML = html;
      colorTriggerText.textContent = selectedText;
    }
  }

  // 제품 데이터에서 ID로 제품 찾기
  function findProductById(id) {
    if (!window.CATALOG_DATA) {
      if (window.Logger) {
        window.Logger.error('CATALOG_DATA가 없습니다');
      }
      return null;
    }

    // 직접 카테고리 구조로 검색
    for (const category in window.CATALOG_DATA) {
      for (const type in window.CATALOG_DATA[category]) {
        const products = window.CATALOG_DATA[category][type];
        const found = products.find(p => p.id === id);
        if (found) {
          return found;
        }
      }
    }
    
    if (window.Logger) {
      window.Logger.warn('제품을 찾을 수 없습니다:', id);
    }
    return null;
  }

  // 제품 정보 표시 (buy 페이지에만 있는 요소 사용 전 null 체크)
  async function displayProductInfo(product) {
    const productNameEl = document.getElementById('product-name');
    const productPriceEl = document.getElementById('product-price');
    if (!productNameEl) return; // buy 페이지가 아니면 아무것도 하지 않음

    if (!product) {
      productNameEl.textContent = '제품을 찾을 수 없습니다';
      return;
    }

    currentProduct = product;

    productNameEl.textContent = product.name;

    if (productPriceEl) {
      const formattedPrice = new Intl.NumberFormat('ko-KR', {
        style: 'currency',
        currency: 'KRW',
        maximumFractionDigits: 0
      }).format(product.price);
      productPriceEl.textContent = formattedPrice;
    }

    // 이미지 표시 (여러 장 시뮬레이션)
    displayProductImages(product);

    // 실제 재고 데이터에서 색상/사이즈 옵션 가져오기 (Query 방식)
    try {
      const encodedProductId = encodeURIComponent(product.id);
      const apiUrl = `${API_BASE_URL}/products/options?product_id=${encodedProductId}`;
      
      // 디버깅: API 호출 시작
      Logger.log('[상품 옵션 API] 호출 시작:', {
        product_id: product.id,
        encoded_id: encodedProductId,
        api_url: apiUrl
      });
      
      const response = await fetch(apiUrl);
      
      Logger.log('[상품 옵션 API] 응답 상태:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });
      
      if (response.ok) {
        const data = await response.json();
        
        Logger.log('[상품 옵션 API] 응답 데이터:', {
          success: data.success,
          has_options: !!data.options,
          sizes: data.options?.sizes || [],
          colors: data.options?.colors || [],
          sizes_count: data.options?.sizes?.length || 0,
          colors_count: data.options?.colors?.length || 0
        });
        
        if (data.success && data.options) {
          Logger.log('[상품 옵션 API] 옵션 생성 시작:', {
            sizes: data.options.sizes,
            colors: data.options.colors
          });
          
          generateSizeOptionsFromAPI(product, data.options.sizes);
          generateColorOptionsFromAPI(data.options.colors);
          return;
        } else {
          Logger.warn('[상품 옵션 API] 응답이 옵션을 포함하지 않음:', data);
        }
      } else {
        const errorText = await response.text();
        Logger.error('[상품 옵션 API] 조회 실패:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
      }
    } catch (error) {
      Logger.error('[상품 옵션 API] 예외 발생:', {
        message: error.message,
        stack: error.stack,
        error: error
      });
    }

    // API 조회 실패 시 기존 방식 사용 (하위 호환성)
    generateSizeOptions(product);
    generateColorOptions();
  }

  // 제품 ID에서 사이즈 정보 추출
  function extractSizesFromProductId(productId) {
    if (!productId) return [];

    // 제품 ID의 마지막 부분에서 사이즈 정보 추출
    // 예: PM-25-SH-Teneu-Solid-LB-S/M/L → S/M/L
    // 예: PM-25-TOP-Solid-Suit-Bustier-BK/GY-F → F
    // 예: PM-25-Outer-LeStripe-Suit-NV-S/L → S/L
    // 예: PM-25-Outer-London-Liberty-Toile-BK-S/L → S/L
    const parts = productId.split('-');
    const lastPart = parts[parts.length - 1];

    const validSizes = ['S', 'M', 'L', 'XL', 'XXL', 'F'];
    const sizes = [];

    // 마지막 부분이 F로 끝나는 경우 (예: BK/GY-F)
    if (lastPart.endsWith('F') && !lastPart.endsWith('TF')) {
      // F 앞에 하이픈이나 슬래시가 있는지 확인
      if (lastPart.includes('-F') || lastPart.endsWith('/F')) {
        sizes.push('F');
        return sizes;
      } else if (lastPart === 'F') {
        return ['F'];
      }
    }

    // 마지막 부분을 하이픈과 슬래시로 분리하여 사이즈 찾기
    // 예: BK/GY-F → ['BK', 'GY', 'F']
    // 예: NV-S/L → ['NV', 'S', 'L']
    // 예: S/M/L → ['S', 'M', 'L']
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

  // 사이즈 옵션 생성
  function generateSizeOptions(product) {
    if (!product || !product.id) return;

    const sizeSelect = document.getElementById('size-select');
    const sizeOptionGroup = sizeSelect ? sizeSelect.closest('.option-group') : null;
    
    if (!sizeSelect || !sizeOptionGroup) return;

    // 제품 ID에서 사이즈 추출
    const availableSizes = extractSizesFromProductId(product.id);

    // 사이즈가 없을 때만 사이즈 선택창 숨김 (액세서리 여부 무관)
    if (availableSizes.length === 0) {
      sizeOptionGroup.style.display = 'none';
      sizeSelect.innerHTML = '<option value="">사이즈를 선택해주세요</option><option value="Free" selected>Free</option>';
      selectedSize = 'Free';
      syncBuyDropdownsFromSelects();
      return;
    }

    sizeOptionGroup.style.display = 'block';
    sizeSelect.innerHTML = '<option value="">사이즈를 선택해주세요</option>';

    // 추출된 사이즈로 옵션 생성
    availableSizes.forEach(size => {
      const option = document.createElement('option');
      option.value = size;
      option.textContent = size === 'F' ? 'Free' : size;
      sizeSelect.appendChild(option);
    });
    syncBuyDropdownsFromSelects();
  }

  // 제품 이미지 표시 (같은 이미지 3장 반복)
  function displayProductImages(product) {
    const imagesWrapper = document.getElementById('product-images');
    if (!imagesWrapper) return;
    imagesWrapper.innerHTML = '';

    // 이미지 경로 처리: /uploads/products/로 시작하면 그대로 사용, 아니면 /image/ 추가
    let imageSrc = product.image || '';
    if (imageSrc.startsWith('/uploads/')) {
      // 업로드된 이미지 (새로 추가/수정된 이미지)
      imageSrc = imageSrc;
    } else if (imageSrc.startsWith('/image/')) {
      // 기존 이미지 경로
      imageSrc = imageSrc;
    } else if (imageSrc) {
      // 상대 경로인 경우 (기존 이미지 파일명만 있는 경우)
      imageSrc = imageSrc.startsWith('image/') ? '/' + imageSrc : '/image/' + imageSrc;
    } else {
      // 이미지가 없는 경우 기본 이미지
      imageSrc = '/image/shirt.jpg';
    }

    // 3개의 이미지 생성 (실제로는 같은 이미지)
    for (let i = 0; i < 3; i++) {
      const imgElement = document.createElement('img');
      imgElement.src = imageSrc;
      imgElement.alt = `${product.name} - 이미지 ${i + 1}`;
      imgElement.className = 'product-image';
      imagesWrapper.appendChild(imgElement);
    }
  }

  // 색상 옵션 생성 (가상 데이터 - 하위 호환성용)
  function generateColorOptions() {
    const colorSelect = document.getElementById('color-select');
    if (!colorSelect) return;
    
    const colors = [
      { value: 'Black', label: '블랙' },
      { value: 'White', label: '화이트' },
      { value: 'Grey', label: '그레이' },
      { value: 'Navy', label: '네이비' }
    ];

    colors.forEach(color => {
      const option = document.createElement('option');
      option.value = color.value;
      option.textContent = color.label;
      colorSelect.appendChild(option);
    });
    syncBuyDropdownsFromSelects();
  }

  // 색상 옵션 생성 (API 데이터 사용)
  function generateColorOptionsFromAPI(colors) {
    Logger.log('[generateColorOptionsFromAPI] 시작:', {
      colors: colors,
      colors_length: colors?.length
    });
    
    const colorSelect = document.getElementById('color-select');
    if (!colorSelect) {
      Logger.warn('[generateColorOptionsFromAPI] colorSelect 없음');
      return;
    }
    
    // 기본 옵션만 남기고 나머지 제거
    colorSelect.innerHTML = '<option value="">색상을 선택해주세요</option>';

    // 상품에 색상 옵션이 없으면 선택창은 플레이스홀더만 유지 (기본 색상 강제하지 않음)
    if (!colors || colors.length === 0) {
      Logger.log('[generateColorOptionsFromAPI] 색상 배열 비어있음 → 상품 옵션만 표시하므로 추가 없음');
      syncBuyDropdownsFromSelects();
      return;
    }

    // 색상 표시명 매핑
    const colorLabelMap = {
      'Black': '블랙',
      'Navy': '네이비',
      'White': '화이트',
      'Grey': '그레이',
      'Light Blue': '라이트 블루',
      'Light Grey': '라이트 그레이'
    };

    // API에서 받은 색상으로 옵션 생성 (재고 상태 포함)
    colors.forEach(colorObj => {
      // colors가 배열인데 각 요소가 객체인지 문자열인지 확인
      let color;
      let available = true;
      
      if (typeof colorObj === 'object' && colorObj !== null) {
        // 객체인 경우 color 속성 추출
        color = colorObj.color || colorObj['color'];
        available = colorObj.available !== undefined ? colorObj.available : true;
      } else {
        // 문자열인 경우 (하위 호환성)
        color = colorObj;
        available = true;
      }
      
      // color가 유효한지 확인
      if (!color || color === undefined || color === null) {
        Logger.error('[generateColorOptionsFromAPI] 유효하지 않은 color:', colorObj);
        return; // 건너뛰기
      }
      
      Logger.log('[generateColorOptionsFromAPI] 색상 옵션 추가:', {
        color: color,
        available: available,
        colorObj: colorObj
      });
      
      const option = document.createElement('option');
      option.value = String(color); // 명시적으로 문자열 변환
      
      // 색상 표시명 생성
      let displayText = colorLabelMap[color] || color;
      if (!available) {
        displayText += ' (품절)';
        option.disabled = true; // 품절 옵션은 선택 불가
        option.style.color = '#999'; // 품절 표시 스타일
      }
      
      option.textContent = displayText;
      colorSelect.appendChild(option);
      
      Logger.log('[generateColorOptionsFromAPI] 색상 옵션 추가 완료:', {
        color: color,
        available: available,
        displayText: displayText,
        option_value: option.value,
        option_text: option.textContent
      });
    });
    
    Logger.log('[generateColorOptionsFromAPI] 완료:', {
      options_count: colorSelect.options.length
    });
    syncBuyDropdownsFromSelects();
  }

  // 사이즈 옵션 생성 (API 데이터 사용)
  function generateSizeOptionsFromAPI(product, sizes) {
    Logger.log('[generateSizeOptionsFromAPI] 시작:', {
      product_id: product?.id,
      sizes: sizes,
      sizes_length: sizes?.length
    });
    
    if (!product || !product.id) {
      Logger.warn('[generateSizeOptionsFromAPI] product 없음');
      return;
    }

    const sizeSelect = document.getElementById('size-select');
    const sizeOptionGroup = sizeSelect ? sizeSelect.closest('.option-group') : null;
    
    if (!sizeSelect || !sizeOptionGroup) {
      Logger.warn('[generateSizeOptionsFromAPI] DOM 요소 없음:', {
        sizeSelect: !!sizeSelect,
        sizeOptionGroup: !!sizeOptionGroup
      });
      return;
    }

    // API에 사이즈가 없을 때만 사이즈 선택창 숨김 (액세서리 여부 무관, 팔찌 등은 나중에 사이즈 있을 수 있음)
    const hasNoSize = !sizes || sizes.length === 0;

    if (hasNoSize) {
      Logger.log('[generateSizeOptionsFromAPI] 사이즈 없음 → 사이즈 선택창 숨김');
      sizeOptionGroup.style.display = 'none';
      sizeSelect.innerHTML = '<option value="">사이즈를 선택해주세요</option><option value="Free" selected>Free</option>';
      selectedSize = 'Free';
      syncBuyDropdownsFromSelects();
      return;
    }

    // 상품에 있는 사이즈만 표시 (API 응답 기준)
    sizeOptionGroup.style.display = 'block';
    sizeSelect.innerHTML = '<option value="">사이즈를 선택해주세요</option>';

    Logger.log('[generateSizeOptionsFromAPI] 사이즈 옵션 생성:', sizes);

    // API에서 받은 사이즈로 옵션 생성 (재고 상태 포함)
    sizes.forEach(sizeObj => {
      Logger.log('[generateSizeOptionsFromAPI] sizeObj 원본:', sizeObj, '타입:', typeof sizeObj);
      
      // sizes가 배열인데 각 요소가 객체인지 문자열인지 확인
      let size;
      let available = true;
      
      if (typeof sizeObj === 'object' && sizeObj !== null) {
        // 객체인 경우 size 속성 추출
        size = sizeObj.size || sizeObj['size'];
        available = sizeObj.available !== undefined ? sizeObj.available : true;
      } else {
        // 문자열인 경우
        size = sizeObj;
        available = true;
      }
      
      // size가 유효한지 확인
      if (!size || size === undefined || size === null) {
        Logger.error('[generateSizeOptionsFromAPI] 유효하지 않은 size:', sizeObj);
        return; // 건너뛰기
      }
      
      Logger.log('[generateSizeOptionsFromAPI] 추출된 값:', {
        size: size,
        available: available,
        sizeObj: sizeObj
      });
      
      const option = document.createElement('option');
      option.value = String(size); // 명시적으로 문자열 변환
      
      // 사이즈 표시명 생성
      let displayText = String(size) === 'F' ? 'Free' : String(size);
      if (!available) {
        displayText += ' (품절)';
        option.disabled = true; // 품절 옵션은 선택 불가
        option.style.color = '#999'; // 품절 표시 스타일
      }
      
      option.textContent = displayText;
      sizeSelect.appendChild(option);
      
      Logger.log('[generateSizeOptionsFromAPI] 사이즈 옵션 추가 완료:', {
        size: size,
        available: available,
        displayText: displayText,
        option_value: option.value,
        option_text: option.textContent
      });
    });
    
    Logger.log('[generateSizeOptionsFromAPI] 완료:', {
      options_count: sizeSelect.options.length
    });
    syncBuyDropdownsFromSelects();
  }

  // 에러 메시지 표시
  function showErrorMessage(elementId, message) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
    }
  }

  // 에러 메시지 초기화
  function clearErrorMessages() {
    const sizeError = document.getElementById('size-error');
    const colorError = document.getElementById('color-error');
    
    if (sizeError) sizeError.style.display = 'none';
    if (colorError) colorError.style.display = 'none';
  }

  // 옵션 선택 감지
  function handleOptionChange() {
    const sizeSelect = document.getElementById('size-select');
    const colorSelect = document.getElementById('color-select');
    const cartBtn = document.getElementById('cart-btn');

    selectedSize = sizeSelect.value;
    selectedColor = colorSelect.value;

    // 옵션이 선택되면 에러 메시지 숨기기
    if (selectedSize) {
      const sizeError = document.getElementById('size-error');
      if (sizeError) sizeError.style.display = 'none';
    }
    
    if (selectedColor) {
      const colorError = document.getElementById('color-error');
      if (colorError) colorError.style.display = 'none';
    }

    // 버튼을 항상 활성화 (에러 메시지는 addToCart에서 처리)
    cartBtn.disabled = false;
    cartBtn.classList.add('enabled');
  }

  // 색상 변경 시 이미지 변경 (시뮬레이션)
  function handleColorChange() {
    const colorSelect = document.getElementById('color-select');
    selectedColor = colorSelect.value;

    // 실제로는 색상별 이미지가 있어야 하지만, 현재는 같은 이미지 사용
    // 추후 색상별 이미지 데이터 구조 확장 필요
    handleOptionChange();
  }

  // 장바구니 추가
  async function addToCart() {
    // 제품이 없는 경우
    if (!currentProduct) {
      if (window.Logger) {
        window.Logger.error('제품 정보 없음');
      }
      alert('제품 정보를 불러올 수 없습니다.');
      return false;
    }

    // 에러 메시지 초기화
    clearErrorMessages();

    // 제품 카테고리 확인 (액세서리 체크)
    const isAccessory = currentProduct.category === 'accessories' || 
                        currentProduct.id.toLowerCase().includes('acc-') ||
                        currentProduct.id.toLowerCase().startsWith('pm-25-acc-');

    // 사이즈와 색상 선택 검증 (액세서리는 사이즈 검증 제외)
    if (!isAccessory && !selectedSize) {
      showErrorMessage('size-error', '사이즈를 선택해야합니다.');
      return false;
    }
    
    if (!selectedColor) {
      showErrorMessage('color-error', '색상을 선택해야합니다.');
      return false;
    }
    
    // 액세서리의 경우 사이즈를 'Free'로 자동 설정
    if (isAccessory && !selectedSize) {
      selectedSize = 'Free';
    }

    // MiniCart API를 사용하여 장바구니에 추가
    const productToAdd = {
      id: currentProduct.id,
      name: currentProduct.name,
      price: currentProduct.price,
      image: currentProduct.image,
      size: selectedSize,
      color: selectedColor
    };

    // ⚠️ miniCart 인스턴스가 없으면 초기화될 때까지 대기 (이벤트 기반)
    if (!window.miniCart) {
      // 이벤트 기반 대기 (더 안전)
      const cartReady = new Promise((resolve) => {
        // 이미 초기화되었으면 즉시 resolve
        if (window.miniCart) {
          resolve();
          return;
        }
        
        // minicart:ready 이벤트 대기
        const handler = () => {
          window.removeEventListener('minicart:ready', handler);
          resolve();
        };
        window.addEventListener('minicart:ready', handler);
        
        // 최후의 fallback: 3초 타임아웃
        setTimeout(() => {
          window.removeEventListener('minicart:ready', handler);
          resolve(); // 타임아웃되어도 resolve (fallback 처리)
        }, 3000);
      });
      
      await cartReady;
      
      // 여전히 없으면 직접 localStorage에 저장 (비회원 장바구니 fallback)
      if (!window.miniCart) {
        try {
          // ⚠️ 기존 'guest_cart' 데이터 마이그레이션 (호환성)
          const oldCartKey = 'guest_cart';
          const GUEST_CART_KEY = 'pm_cart_v1'; // 버전 1
          const oldCart = localStorage.getItem(oldCartKey);
          if (oldCart) {
            localStorage.setItem(GUEST_CART_KEY, oldCart);
            localStorage.removeItem(oldCartKey);
          }
          
          let cartItems = JSON.parse(localStorage.getItem(GUEST_CART_KEY) || '[]');
          
          // 기존 아이템 확인 (같은 상품, 사이즈, 색상)
          const existingIndex = cartItems.findIndex(item => 
            item.id === productToAdd.id && 
            item.size === productToAdd.size && 
            item.color === productToAdd.color
          );
          
          if (existingIndex >= 0) {
            // 기존 아이템 수량 증가
            cartItems[existingIndex].quantity += (productToAdd.quantity || 1);
          } else {
            // 새 아이템 추가
            cartItems.push({
              id: productToAdd.id,
              product_id: productToAdd.id,
              name: productToAdd.name,
              price: productToAdd.price,
              image: productToAdd.image,
              size: productToAdd.size,
              color: productToAdd.color,
              quantity: productToAdd.quantity || 1,
              item_id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            });
          }
          
          localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cartItems));
          alert('장바구니에 추가되었습니다.');
          return true;
        } catch (error) {
          Logger.error('❌ localStorage 장바구니 추가 오류:', error);
          alert('장바구니 추가에 실패했습니다. 페이지를 새로고침해주세요.');
          return false;
        }
      }
    }
    
    // miniCart가 있으면 정상적으로 추가
    const added = await window.miniCart.addToCart(productToAdd);
    if (added) {
      // 미니 카트 열기
      if (window.miniCart.toggleMiniCart) {
        window.miniCart.toggleMiniCart();
      }
      return true;
    }
    return false;
  }

  // 로그인 상태 확인 (JWT 기반) - 401 오류 처리 개선
  async function isLoggedIn() {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        credentials: 'include'
      });
      
      // 401 오류인 경우 로그인하지 않은 것으로 처리
      if (response.status === 401) {
        return false;
      }
      
      if (!response.ok) {
        return false;
      }
      
      const data = await response.json();
      return data.success && data.user;
    } catch (error) {
      // 네트워크 오류나 기타 오류는 로그인하지 않은 것으로 처리
      return false;
    }
  }

  // 사용자 이메일 가져오기 (JWT 기반) - 401 오류 처리 개선
  async function getUserEmail() {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        credentials: 'include'
      });
      
      // 401 오류인 경우 null 반환
      if (response.status === 401) {
        return null;
      }
      
      if (!response.ok) {
        return null;
      }
      
      const data = await response.json();
      return data.success && data.user ? data.user.email : null;
    } catch (error) {
      return null;
    }
  }

  // 위시리스트 토글 (API 연동)
  // 위시리스트 이미지 업데이트 함수
  function updateWishlistImage(isActive) {
    const wishlistIcon = document.querySelector('#wishlist-btn .wishlist-icon');
    if (wishlistIcon) {
      wishlistIcon.src = isActive ? 'image/fullwishlist.jpg' : 'image/wishlist.jpg';
    }
  }

  async function toggleWishlist() {
    if (!currentProduct) return;

    // 로그인 체크
    if (!(await isLoggedIn())) {
      if (confirm('로그인이 필요한 서비스입니다.\n로그인 페이지로 이동하시겠습니까?')) {
        window.location.href = 'login.html';
      }
      return;
    }

    const wishlistBtn = document.getElementById('wishlist-btn');
    const isActive = wishlistBtn.classList.contains('active');

    try {
      // 사용자 이메일 가져오기 (JWT에서 추출)
      const userEmail = await getUserEmail();
      
      // API 호출
      const response = await fetch(`${API_BASE_URL}/wishlist/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Email': userEmail
        },
        credentials: 'include', // 쿠키 포함
        body: JSON.stringify({
          productId: currentProduct.id
        })
      });

      const data = await response.json();

      if (data.success) {
        if (data.action === 'added') {
          wishlistBtn.classList.add('active');
          updateWishlistImage(true);
          alert('위시리스트에 추가되었습니다.');
        } else {
          wishlistBtn.classList.remove('active');
          updateWishlistImage(false);
          alert('위시리스트에서 제거되었습니다.');
        }
      } else {
        alert(data.message || '위시리스트 처리에 실패했습니다.');
      }
    } catch (error) {
      Logger.error('위시리스트 토글 오류:', error);
      alert('서버와의 통신에 실패했습니다.');
    }
  }

  // 위시리스트 상태 확인 (API 연동)
  async function checkWishlistStatus() {
    if (!currentProduct || !(await isLoggedIn())) return;

    try {
      const userEmail = await getUserEmail();
      
      const response = await fetch(`${API_BASE_URL}/wishlist/check?productId=${currentProduct.id}`, {
        method: 'GET',
        headers: {
          'X-User-Email': userEmail
        },
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success && data.isInWishlist) {
        const wishlistBtn = document.getElementById('wishlist-btn');
        wishlistBtn.classList.add('active');
        updateWishlistImage(true);
      }
    } catch (error) {
      Logger.error('위시리스트 상태 확인 오류:', error);
    }
  }

  // 탭 전환 기능
  function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const targetTab = button.dataset.tab;

        // 모든 탭 버튼과 패널에서 active 제거
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabPanes.forEach(pane => pane.classList.remove('active'));

        // 클릭한 탭 버튼과 해당 패널에 active 추가
        button.classList.add('active');
        document.getElementById(`tab-${targetTab}`).classList.add('active');
      });
    });
  }

  // 초기화
  async function init() {
    // 제품 데이터 로드 대기
    if (typeof window.CATALOG_DATA === 'undefined' || !window.productsLoaded) {
      // productsLoaded 이벤트를 한 번만 구독 (재발송 시 init 중복 실행 방지)
      const onProductsLoaded = () => {
        window.removeEventListener('productsLoaded', onProductsLoaded);
        init();
      };
      window.addEventListener('productsLoaded', onProductsLoaded);
      window.addEventListener('productsLoadError', () => {
        if (window.Logger) {
          window.Logger.error('제품 데이터 로드 실패');
        }
        const productNameEl = document.getElementById('product-name');
        if (productNameEl) {
          productNameEl.textContent = '제품 데이터를 불러올 수 없습니다';
        }
      });
      return;
    }
    
    // 제품 정보 표시
    const product = findProductById(productId);
    await displayProductInfo(product);

    // buy 페이지가 아니면 (product-name이 없으면 displayProductInfo에서 이미 return됨) 이벤트 등록 생략
    const sizeSelectEl = document.getElementById('size-select');
    if (!sizeSelectEl) return;

    // 위시리스트 상태 확인
    checkWishlistStatus();

    // 이벤트 리스너 등록
    sizeSelectEl.addEventListener('change', handleOptionChange);
    document.getElementById('color-select').addEventListener('change', handleColorChange);
    document.getElementById('cart-btn').addEventListener('click', addToCart);
    document.getElementById('wishlist-btn').addEventListener('click', toggleWishlist);

    // 커스텀 드롭다운: 트리거 토글, 옵션 선택, 바깥 클릭 시 닫기
    document.addEventListener('click', function(e) {
      const sizeCustom = document.getElementById('buy-size-custom');
      const colorCustom = document.getElementById('buy-color-custom');
      const sizeTrigger = document.getElementById('buy-size-trigger');
      const colorTrigger = document.getElementById('buy-color-trigger');
      const sizeSelect = document.getElementById('size-select');
      const colorSelect = document.getElementById('color-select');

      if (sizeCustom && e.target.closest('#buy-size-custom')) {
        if (e.target.closest('.buy-select-trigger') || e.target.closest('#buy-size-trigger')) {
          const isOpen = sizeCustom.classList.toggle('is-dropdown-open');
          sizeTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
          if (colorCustom) {
            colorCustom.classList.remove('is-dropdown-open');
            if (colorTrigger) colorTrigger.setAttribute('aria-expanded', 'false');
          }
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        const sizeOpt = e.target.closest('.buy-select-option');
        if (sizeOpt && !sizeOpt.disabled) {
          const val = sizeOpt.getAttribute('data-value');
          sizeSelect.value = val || '';
          sizeTrigger.querySelector('.buy-select-trigger-text').textContent = sizeOpt.textContent.trim();
          sizeCustom.classList.remove('is-dropdown-open');
          sizeTrigger.setAttribute('aria-expanded', 'false');
          handleOptionChange();
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (colorCustom && e.target.closest('#buy-color-custom')) {
        if (e.target.closest('.buy-select-trigger') || e.target.closest('#buy-color-trigger')) {
          const isOpen = colorCustom.classList.toggle('is-dropdown-open');
          colorTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
          if (sizeCustom) {
            sizeCustom.classList.remove('is-dropdown-open');
            if (sizeTrigger) sizeTrigger.setAttribute('aria-expanded', 'false');
          }
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        const colorOpt = e.target.closest('.buy-select-option');
        if (colorOpt && !colorOpt.disabled) {
          const val = colorOpt.getAttribute('data-value');
          colorSelect.value = val || '';
          colorTrigger.querySelector('.buy-select-trigger-text').textContent = colorOpt.textContent.trim();
          colorCustom.classList.remove('is-dropdown-open');
          colorTrigger.setAttribute('aria-expanded', 'false');
          handleOptionChange();
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      // 바깥 클릭 시 둘 다 닫기
      if (sizeCustom) {
        sizeCustom.classList.remove('is-dropdown-open');
        if (sizeTrigger) sizeTrigger.setAttribute('aria-expanded', 'false');
      }
      if (colorCustom) {
        colorCustom.classList.remove('is-dropdown-open');
        if (colorTrigger) colorTrigger.setAttribute('aria-expanded', 'false');
      }
    });

    // 탭 초기화
    initTabs();
  }

  // DOM 로드 후 실행
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
