// admin-products.js - 상품 관리 페이지 스크립트 (보안 강화 버전)

(function() {
  'use strict';

  // API 설정
  const API_BASE_URL = (window.API_BASE)
    ? window.API_BASE
    : ((window.location && window.location.origin)
        ? window.location.origin.replace(/\/$/, '') + '/api'
        : '/api');

  // 전역 변수
  let products = [];
  let currentEditingProduct = null;

  // DOM 요소들
  const elements = {
    loadingState: document.getElementById('loadingState'),
    productsGrid: document.getElementById('productsGrid'),
    searchInput: document.getElementById('searchInput'),
    categoryFilter: document.getElementById('categoryFilter'),
    addProductBtn: document.getElementById('addProductBtn')
    // logoutBtn과 checkAdminAccess는 admin-layout.js에서 처리됨
  };

  // 카테고리 라벨 매핑 (renderProducts보다 먼저 정의)
  const CATEGORY_OPTIONS = [
    { value: 'tops', label: '상의' },
    { value: 'bottoms', label: '하의' },
    { value: 'outer', label: '아우터' },
    { value: 'bags', label: '가방' },
    { value: 'accessories', label: '액세서리' }
  ];

  const ACCESSORY_TYPE_OPTIONS = [
    { value: 'cap', label: '모자' },
    { value: 'wallet', label: '지갑' },
    { value: 'tie', label: '넥타이' },
    { value: 'scarf', label: '목도리' },
    { value: 'belt', label: '벨트' }
  ];

  function getCategoryLabel(value) {
    const option = CATEGORY_OPTIONS.find(opt => opt.value === value);
    return option ? option.label : value;
  }

  function getTypeLabel(value) {
    // 기존 데이터 호환성: 'ties'를 'tie'로 매핑
    if (value === 'ties') {
      value = 'tie';
    }
    const option = ACCESSORY_TYPE_OPTIONS.find(opt => opt.value === value);
    return option ? option.label : value;
  }
  
  // 타입 값을 정규화 (기존 데이터 호환성)
  function normalizeTypeValue(value) {
    // 기존 데이터의 'ties'를 'tie'로 변환
    if (value === 'ties') {
      return 'tie';
    }
    return value;
  }

  // 상품 목록 로드
  async function loadProducts() {
    try {
      elements.loadingState.style.display = 'block';
      elements.productsGrid.innerHTML = '';

      const response = await fetch(`${API_BASE_URL}/products`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        products = data.products || [];
        renderProducts(products);
      } else {
        throw new Error(data.message || '상품 목록을 불러오는데 실패했습니다.');
      }
    } catch (error) {
      // 로깅 정책: Phase 0 준수 (error 객체 전체 덤프 금지)
      console.error('상품 로드 오류:', error.message);
      elements.productsGrid.innerHTML = `
        <div class="error-state">
          <p>상품 목록을 불러올 수 없습니다.</p>
          <p>${error.message}</p>
          <button onclick="loadProducts()" class="btn-secondary">다시 시도</button>
        </div>
      `;
    } finally {
      elements.loadingState.style.display = 'none';
    }
  }

  // 상품 목록 렌더링
  function renderProducts(productsToRender) {
    if (productsToRender.length === 0) {
      elements.productsGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📦</div>
          <h3>등록된 상품이 없습니다</h3>
          <p>새 상품을 추가해보세요.</p>
          <button onclick="openAddProductModal()" class="btn-primary">+ 상품 추가</button>
        </div>
      `;
      return;
    }

    elements.productsGrid.innerHTML = productsToRender.map(product => {
      // 이미지 경로 정규화: 상대 경로를 절대 경로로 변환
      let imageUrl = '/image/shirt.jpg'; // 기본 이미지
      
      if (product.image) {
        // 이미 절대 경로인 경우 (/ 또는 http로 시작)
        if (product.image.startsWith('/') || product.image.startsWith('http')) {
          imageUrl = product.image;
        } else {
          // 상대 경로인 경우 /image/를 앞에 붙임
          imageUrl = '/image/' + product.image.replace(/^image\//, '');
        }
      }
      
      // 기존 데이터 호환성: 'ties'를 'tie'로 처리
      const normalizedProductType = product.type ? normalizeTypeValue(product.type) : null;
      const typeLabel = normalizedProductType ? (' • ' + getTypeLabel(normalizedProductType)) : '';
      
      return `
      <div class="product-card" data-id="${product.id}">
        <img class="product-card-image" src="${imageUrl}" alt="${escapeHtml(product.name)}" 
             onerror="this.src='/image/shirt.jpg'">
        <div class="product-card-name">${escapeHtml(product.name)}</div>
        <div class="product-card-price">${formatKRW(product.price)}</div>
        <div class="product-card-meta">
          Collection ${product.collection_year || 2026} • ${getCategoryLabel(product.category)}${typeLabel}
        </div>
        <div class="product-card-actions">
          <button onclick="openEditProductModal('${product.id}')" class="btn-secondary">수정</button>
          <button onclick="deleteProduct('${product.id}')" class="btn-danger">삭제</button>
        </div>
      </div>
      `;
    }).join('');
  }

  // 검색 및 필터링
  function filterProducts() {
    const searchTerm = elements.searchInput.value.toLowerCase();
    const categoryFilter = elements.categoryFilter.value;

    let filteredProducts = products;

    // 검색어 필터
    if (searchTerm) {
      filteredProducts = filteredProducts.filter(product =>
        product.name.toLowerCase().includes(searchTerm) ||
        product.id.toLowerCase().includes(searchTerm)
      );
    }

    // 카테고리 필터
    if (categoryFilter) {
      filteredProducts = filteredProducts.filter(product =>
        product.category === categoryFilter
      );
    }

    renderProducts(filteredProducts);
  }

  // 상품 추가 모달 열기
  function openAddProductModal() {
    currentEditingProduct = null;
    showProductModal();
  }

  // 상품 수정 모달 열기
  function openEditProductModal(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    currentEditingProduct = product;
    showProductModal();
  }

  // 상품 모달 표시
  function showProductModal() {
    const modal = createProductModal();
    document.body.appendChild(modal);
    modal.style.display = 'flex';
  }

  // 상품 모달 생성
  function createProductModal() {
    const isEditing = currentEditingProduct !== null;
    const product = currentEditingProduct || {};

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>${isEditing ? '상품 수정' : '새 상품 추가'}</h2>
          <button class="modal-close" onclick="closeModal()">&times;</button>
        </div>
        <form id="productForm" class="modal-body" onsubmit="event.preventDefault(); saveProduct();">
          <div class="form-group">
            <label for="productId">상품 ID</label>
            <input type="text" id="productId" name="id" value="${product.id || ''}" 
                   ${isEditing ? 'readonly' : 'required'}
                   placeholder="예: PM-25-SH-Teneu-Solid-LB"
                   oninput="validateProductId(this)">
            <small style="color: #666; display: block; margin-top: 4px;">
              ⚠️ 슬래시(/) 포함 금지. 사이즈는 재고 관리에서 별도 관리됩니다.<br>
              형식: PM-25-SH-상품명-색상코드 (예: PM-25-SH-Teneu-Solid-LB)
            </small>
            <div id="productIdError" style="color: red; font-size: 0.875rem; margin-top: 4px; display: none;"></div>
          </div>
          <div class="form-group">
            <label for="productName">상품명</label>
            <input type="text" id="productName" name="name" value="${product.name || ''}" required>
          </div>
          <div class="form-group">
            <label for="productPrice">가격</label>
            <input type="number" id="productPrice" name="price" value="${product.price || ''}" required>
          </div>
          <div class="form-group">
            <label for="productCollectionYear">컬렉션 연도</label>
            <input type="number" id="productCollectionYear" name="collection_year" 
                   value="${product.collection_year || 2026}" min="2000" max="2100" required>
            <small>기본값: 2026</small>
          </div>
          <div class="form-group">
            <label for="productCategory">카테고리</label>
            <select id="productCategory" name="category" required onchange="handleCategoryChange()">
              <option value="">선택하세요</option>
              ${CATEGORY_OPTIONS.map(opt => 
                `<option value="${opt.value}" ${product.category === opt.value ? 'selected' : ''}>${opt.label}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group" id="productTypeGroup" style="display: none;">
            <label for="productType">타입 <span style="color: red;">*</span></label>
            <select id="productType" name="type">
              <option value="">선택하세요</option>
              ${ACCESSORY_TYPE_OPTIONS.map(opt => {
                // 기존 데이터 호환성: 'ties'를 'tie'로 매핑
                const normalizedType = normalizeTypeValue(product.type);
                return `<option value="${opt.value}" ${normalizedType === opt.value ? 'selected' : ''}>${opt.label}</option>`;
              }).join('')}
            </select>
            <small>액세서리 카테고리일 때만 필수</small>
          </div>
          <div class="form-group">
            <label for="productDescription">설명</label>
            <textarea id="productDescription" name="description" rows="3">${product.description || ''}</textarea>
          </div>
          <div class="form-group">
            <label for="productImage">이미지</label>
            <div class="image-upload">
              <input type="file" id="productImage" accept="image/*" style="display: none;">
              <button type="button" id="uploadBtn" class="btn-secondary" onclick="document.getElementById('productImage').click()">이미지 선택</button>
              <div id="imagePreview" class="image-preview">
                ${product.image ? (() => {
                  const modalImageUrl = product.image.startsWith('/') || product.image.startsWith('http') 
                    ? product.image 
                    : '/image/' + product.image.replace(/^image\//, '');
                  return `<img src="${modalImageUrl}" alt="상품 이미지">`;
                })() : ''}
              </div>
            </div>
          </div>
          ${isEditing ? `
          <!-- 옵션 관리 섹션 (Phase 15-3) -->
          <div class="form-group" style="border-top: 1px solid #e5e5e5; padding-top: 1rem; margin-top: 1rem;">
            <label>옵션 관리</label>
            <div id="optionsSection" style="margin-top: 0.5rem;">
              <div id="optionsLoading" style="text-align: center; padding: 1rem; color: #666;">
                옵션 목록을 불러오는 중...
              </div>
              <div id="optionsList" style="display: none;"></div>
              <div style="margin-top: 1rem;">
                <button type="button" class="btn-secondary" onclick="window.openAddOptionModal('${product.id || ''}')" style="font-size: 0.9rem;">
                  + 옵션 추가
                </button>
              </div>
            </div>
          </div>
          ` : ''}
        </form>
        <div class="modal-footer">
          <button type="button" onclick="closeModal()" class="btn-secondary">취소</button>
          <button type="submit" class="btn-primary" onclick="saveProduct()">저장</button>
        </div>
      </div>
    `;

    // 모달이 DOM에 추가된 후 이벤트 리스너 등록
    setTimeout(() => {
      const categorySelect = modal.querySelector('#productCategory');
      const typeGroup = modal.querySelector('#productTypeGroup');
      const typeSelect = modal.querySelector('#productType');
      const uploadBtn = modal.querySelector('#uploadBtn');
      const imageInput = modal.querySelector('#productImage');
      const imagePreview = modal.querySelector('#imagePreview');
      
      // 이미지 업로드 버튼 이벤트 리스너 연결
      if (uploadBtn && imageInput) {
        uploadBtn.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          imageInput.click();
        });
      }
      
      // 이미지 파일 선택 이벤트 리스너 (모달 내부에 직접 연결)
      if (imageInput) {
        imageInput.addEventListener('change', function(e) {
          if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (imagePreview) {
              const reader = new FileReader();
              reader.onload = function(event) {
                imagePreview.innerHTML = `<img src="${event.target.result}" alt="미리보기">`;
              };
              reader.onerror = function() {
                console.error('이미지 읽기 오류');
              };
              reader.readAsDataURL(file);
            }
          }
        });
      }
      
      // 초기 상태 설정 (기존 상품이 accessories인 경우)
      if (categorySelect.value === 'accessories') {
        typeGroup.style.display = 'block';
        typeSelect.required = true;
        // 기존 상품의 type 값이 있으면 유지 (기존 데이터 호환성 처리)
        const normalizedProductType = product.type ? normalizeTypeValue(product.type) : null;
        if (normalizedProductType) {
          typeSelect.value = normalizedProductType;
        } else if (typeSelect.value === '') {
          // 기존 값이 없으면 첫 번째 옵션 선택 (기본값)
          typeSelect.value = ACCESSORY_TYPE_OPTIONS[0].value;
        }
      }
      
      // 옵션 관리 섹션 초기화 (수정 모달일 때만)
      if (isEditing && product.id) {
        setTimeout(() => loadProductOptions(product.id), 100);
      }
      
      // 카테고리 변경 이벤트
      categorySelect.addEventListener('change', function() {
        if (this.value === 'accessories') {
          typeGroup.style.display = 'block';
          typeSelect.required = true;
          // 값이 없으면 첫 번째 옵션 선택
          if (!typeSelect.value || typeSelect.value === '') {
            typeSelect.value = ACCESSORY_TYPE_OPTIONS[0].value;
          }
        } else {
          typeGroup.style.display = 'none';
          typeSelect.required = false;
          typeSelect.value = '';
        }
      });
    }, 0);

    return modal;
  }

  // 카테고리 변경 핸들러 (전역 함수로 등록)
  window.handleCategoryChange = function() {
    const categorySelect = document.getElementById('productCategory');
    const typeGroup = document.getElementById('productTypeGroup');
    const typeSelect = document.getElementById('productType');
    
    if (categorySelect && typeGroup && typeSelect) {
      if (categorySelect.value === 'accessories') {
        typeGroup.style.display = 'block';
        typeSelect.required = true;
      } else {
        typeGroup.style.display = 'none';
        typeSelect.required = false;
        typeSelect.value = '';
      }
    }
  };

  // 모달 닫기
  function closeModal() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
      modal.remove();
    }
  }

  // 이미지 업로드
  async function uploadImage(file) {
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch(`${API_BASE_URL}/admin/upload-image`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        return data.imageUrl;
      } else {
        throw new Error(data.message || '이미지 업로드에 실패했습니다.');
      }
    } catch (error) {
      // 로깅 정책: Phase 0 준수 (error 객체 전체 덤프 금지)
      console.error('이미지 업로드 오류:', error.message);
      throw error;
    }
  }

  // 상품 ID 유효성 검증 (Phase 1: 슬래시 제거 규칙)
  function validateProductId(input) {
    const productId = input.value.trim();
    const errorDiv = document.getElementById('productIdError');
    
    if (!productId) {
      errorDiv.style.display = 'none';
      return true;
    }
    
    // 슬래시(/) 포함 검증
    if (productId.includes('/')) {
      errorDiv.textContent = '❌ 상품 ID에 슬래시(/)를 포함할 수 없습니다. 사이즈는 재고 관리에서 별도 관리됩니다.';
      errorDiv.style.display = 'block';
      input.style.borderColor = '#dc3545';
      return false;
    }
    
    // 길이 검증 (128자)
    if (productId.length > 128) {
      errorDiv.textContent = '❌ 상품 ID는 최대 128자까지 입력 가능합니다.';
      errorDiv.style.display = 'block';
      input.style.borderColor = '#dc3545';
      return false;
    }
    
    // 형식 검증 (영문 대문자, 숫자, 하이픈만 허용)
    const validPattern = /^[A-Z0-9-]+$/;
    if (!validPattern.test(productId)) {
      errorDiv.textContent = '❌ 상품 ID는 영문 대문자, 숫자, 하이픈(-)만 사용 가능합니다.';
      errorDiv.style.display = 'block';
      input.style.borderColor = '#dc3545';
      return false;
    }
    
    errorDiv.style.display = 'none';
    input.style.borderColor = '';
    return true;
  }

  // 상품 저장
  async function saveProduct() {
    try {
      // 현재 열려있는 모달에서 폼 찾기
      const modal = document.querySelector('.modal-overlay');
      const form = modal ? modal.querySelector('#productForm') : document.getElementById('productForm');
      
      if (!form) {
        alert('폼을 찾을 수 없습니다!');
        return;
      }
      
      const formData = new FormData(form);
      
      // ⚠️ Phase 1: 상품 ID 유효성 검증 (슬래시 제거 규칙)
      const productId = formData.get('id');
      if (productId) {
        const productIdInput = form.querySelector('#productId');
        if (!validateProductId(productIdInput)) {
          alert('상품 ID 형식이 올바르지 않습니다. 슬래시(/)를 포함할 수 없습니다.');
          return;
        }
      }
      
      const category = formData.get('category');
      const typeValue = formData.get('type');
      
      // 빈 문자열을 null로 변환 및 기존 데이터 호환성 처리
      let normalizedType = (typeValue && typeValue.trim() !== '') ? typeValue : null;
      if (normalizedType) {
        normalizedType = normalizeTypeValue(normalizedType);
      }
      
      const productData = {
        id: formData.get('id'),
        name: formData.get('name'),
        price: parseInt(formData.get('price')),
        collection_year: parseInt(formData.get('collection_year')) || 2026,
        category: category,
        type: normalizedType,
        description: formData.get('description')
      };
      
      // non-accessories는 type을 null로 설정
      if (productData.category !== 'accessories') {
        productData.type = null;
      } else {
        // accessories는 type이 필수
        if (!productData.type) {
          alert('액세서리 카테고리는 타입을 선택해야 합니다.');
          return;
        }
      }

      // 이미지 업로드 처리 (modal은 이미 위에서 선언됨)
      const imageInput = modal ? modal.querySelector('#productImage') : document.getElementById('productImage');
      const imageFile = imageInput && imageInput.files && imageInput.files.length > 0 ? imageInput.files[0] : null;
      
      if (imageFile) {
        try {
          productData.image = await uploadImage(imageFile);
        } catch (error) {
          console.error('이미지 업로드 오류:', error.message);
          alert('이미지 업로드에 실패했습니다: ' + error.message);
          return;
        }
      } else if (currentEditingProduct && currentEditingProduct.image) {
        // 기존 이미지 유지
        productData.image = currentEditingProduct.image;
      }

      const isEditing = currentEditingProduct !== null;
      const url = isEditing 
        ? `${API_BASE_URL}/admin/products/${encodeURIComponent(productData.id)}`
        : `${API_BASE_URL}/admin/products`;
      
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(productData)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        alert(isEditing ? '상품이 수정되었습니다.' : '상품이 추가되었습니다.');
        closeModal();
        loadProducts();
      } else {
        throw new Error(data.message || '상품 저장에 실패했습니다.');
      }
    } catch (error) {
      // 로깅 정책: Phase 0 준수 (error 객체 전체 덤프 금지)
      console.error('상품 저장 오류:', error.message);
      alert(`상품 저장 오류: ${error.message}`);
    }
  }

  // 상품 삭제
  async function deleteProduct(productId) {
    if (!confirm('정말로 이 상품을 삭제하시겠습니까?')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/admin/products/${encodeURIComponent(productId)}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        alert('상품이 삭제되었습니다.');
        loadProducts();
      } else {
        throw new Error(data.message || '상품 삭제에 실패했습니다.');
      }
    } catch (error) {
      // 로깅 정책: Phase 0 준수 (error 객체 전체 덤프 금지)
      console.error('상품 삭제 오류:', error.message);
      alert(`상품 삭제 오류: ${error.message}`);
    }
  }

  // logout 함수는 admin-layout.js에서 처리됨

  // 유틸리티 함수들
  function formatKRW(amount) {
    return new Intl.NumberFormat('ko-KR', { 
      style: 'currency', 
      currency: 'KRW',
      maximumFractionDigits: 0 
    }).format(amount);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function init() {
    // 관리자 권한 확인은 admin-layout.js에서 처리됨
    // 여기서는 페이지별 기능만 초기화

    if (elements.searchInput) {
    elements.searchInput.addEventListener('input', filterProducts);
    }
    if (elements.categoryFilter) {
    elements.categoryFilter.addEventListener('change', filterProducts);
    }
    if (elements.addProductBtn) {
    elements.addProductBtn.addEventListener('click', openAddProductModal);
    }
    // 로그아웃은 admin-layout.js에서 처리됨
    
    // 이미지 파일 선택 이벤트 (모달 내부와 외부 모두 처리)
    document.addEventListener('change', function(e) {
      if (e.target.id === 'productImage' && e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const preview = document.getElementById('imagePreview');
        
        if (preview) {
          const reader = new FileReader();
          reader.onload = function(event) {
            preview.innerHTML = `<img src="${event.target.result}" alt="미리보기">`;
          };
          reader.readAsDataURL(file);
        }
      }
    });
    
    // 이미지 업로드 버튼 클릭 이벤트 (모달이 동적으로 생성되므로 이벤트 위임 사용)
    document.addEventListener('click', function(e) {
      if (e.target.id === 'uploadBtn' || (e.target.classList && e.target.classList.contains('btn-secondary') && e.target.textContent.includes('이미지'))) {
        const imageInput = document.getElementById('productImage');
        if (imageInput) {
          imageInput.click();
        }
      }
    });

    document.addEventListener('click', function(e) {
      if (e.target.classList && e.target.classList.contains('modal-overlay')) {
        closeModal();
      }
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeModal();
      }
    });

    initAddOptionModal();
    await loadProducts();
  }

  // init은 admin-layout.js의 inline 스크립트에서 호출됨
  // 네임스페이스 패턴으로 전역 충돌 방지
  window.AdminPages = window.AdminPages || {};
  window.AdminPages.products = window.AdminPages.products || {};
  window.AdminPages.products.init = init;

  // ==================== 옵션 관리 기능 (Phase 15-3) ====================
  
  // 옵션 목록 로드
  async function loadProductOptions(productId) {
    const optionsLoading = document.getElementById('optionsLoading');
    const optionsList = document.getElementById('optionsList');
    
    if (!optionsLoading || !optionsList) return;
    
    try {
      optionsLoading.style.display = 'block';
      optionsList.style.display = 'none';
      
      const response = await fetch(`${API_BASE_URL}/admin/products/${encodeURIComponent(productId)}/options`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        renderOptions(data.options);
      } else {
        throw new Error(data.message || '옵션 조회에 실패했습니다.');
      }
    } catch (error) {
      console.error('옵션 로드 오류:', error.message);
      optionsLoading.innerHTML = `<div style="color: #dc3545;">옵션 목록을 불러올 수 없습니다: ${error.message}</div>`;
    } finally {
      optionsLoading.style.display = 'none';
      optionsList.style.display = 'block';
    }
  }
  
  // 옵션 목록 렌더링
  function renderOptions(options) {
    const optionsList = document.getElementById('optionsList');
    if (!optionsList) return;
    
    if (options.length === 0) {
      optionsList.innerHTML = '<div style="padding: 1rem; color: #666; text-align: center;">등록된 옵션이 없습니다.</div>';
      return;
    }
    
    optionsList.innerHTML = `
      <table style="width: 100%; border-collapse: collapse; margin-top: 0.5rem;">
        <thead>
          <tr style="border-bottom: 2px solid #e5e5e5;">
            <th style="padding: 0.5rem; text-align: left; font-weight: 600;">색상</th>
            <th style="padding: 0.5rem; text-align: left; font-weight: 600;">사이즈</th>
            <th style="padding: 0.5rem; text-align: center; font-weight: 600;">재고</th>
            <th style="padding: 0.5rem; text-align: center; font-weight: 600;">정렬</th>
            <th style="padding: 0.5rem; text-align: center; font-weight: 600;">상태</th>
            <th style="padding: 0.5rem; text-align: center; font-weight: 600;">작업</th>
          </tr>
        </thead>
        <tbody>
          ${options.map(opt => `
            <tr style="border-bottom: 1px solid #f0f0f0;">
              <td style="padding: 0.5rem;">${escapeHtml(opt.color || '-')}</td>
              <td style="padding: 0.5rem;">${escapeHtml(opt.size || '-')}</td>
              <td style="padding: 0.5rem; text-align: center;">${opt.in_stock_count || 0}</td>
              <td style="padding: 0.5rem; text-align: center;">${opt.sort_order || 0}</td>
              <td style="padding: 0.5rem; text-align: center;">
                <span style="padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.85rem; background: ${opt.is_active ? '#d4edda' : '#f8d7da'}; color: ${opt.is_active ? '#155724' : '#721c24'};">
                  ${opt.is_active ? '활성' : '비활성'}
                </span>
              </td>
              <td style="padding: 0.5rem; text-align: center;">
                <button type="button" onclick="window.toggleOptionActive('${opt.product_id}', ${opt.option_id}, ${opt.is_active ? 'false' : 'true'})" 
                        class="btn-secondary" style="font-size: 0.85rem; padding: 0.3rem 0.6rem; margin-right: 0.3rem;">
                  ${opt.is_active ? '비활성화' : '활성화'}
                </button>
                <button type="button" onclick="window.deleteProductOption('${opt.product_id}', ${opt.option_id})" 
                        class="btn-danger" style="font-size: 0.85rem; padding: 0.3rem 0.6rem;">
                  삭제
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
  
  // 옵션 추가 모달 열기 (추천 목록 드롭다운 + 직접 입력)
  let addOptionProductId = null;
  async function openAddOptionModal(productId) {
    if (!productId) return;
    addOptionProductId = productId;
    const modal = document.getElementById('addOptionModal');
    const colorInput = document.getElementById('addOptionColor');
    const sizeInput = document.getElementById('addOptionSize');
    const colorList = document.getElementById('addOptionColorList');
    const sizeList = document.getElementById('addOptionSizeList');
    if (!modal || !colorInput || !sizeInput) return;

    colorInput.value = '';
    sizeInput.value = '';
    colorList.innerHTML = '';
    sizeList.innerHTML = '';

    try {
      const res = await fetch(`${API_BASE_URL}/admin/products/option-suggestions`, { credentials: 'include' });
      const data = await res.json();
      if (data.success && data.colors) {
        data.colors.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c;
          colorList.appendChild(opt);
        });
      }
      if (data.success && data.sizes) {
        data.sizes.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s;
          sizeList.appendChild(opt);
        });
      }
    } catch (e) {
      console.warn('옵션 추천 목록 로드 실패', e);
    }

    modal.classList.add('show');
    colorInput.focus();
  }

  function closeAddOptionModal() {
    const modal = document.getElementById('addOptionModal');
    if (modal) modal.classList.remove('show');
    addOptionProductId = null;
  }

  function initAddOptionModal() {
    const modal = document.getElementById('addOptionModal');
    const closeBtn = document.getElementById('addOptionModalClose');
    const cancelBtn = document.getElementById('addOptionCancelBtn');
    const submitBtn = document.getElementById('addOptionSubmitBtn');
    const colorInput = document.getElementById('addOptionColor');
    const sizeInput = document.getElementById('addOptionSize');
    if (!modal || !submitBtn) return;

    function doSubmit() {
      if (!addOptionProductId) return;
      const color = (colorInput && colorInput.value) ? colorInput.value.trim() : '';
      const size = (sizeInput && sizeInput.value) ? sizeInput.value.trim() : '';
      closeAddOptionModal();
      addProductOption(addOptionProductId, color, size);
    }

    if (closeBtn) closeBtn.addEventListener('click', closeAddOptionModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeAddOptionModal);
    submitBtn.addEventListener('click', doSubmit);
    if (colorInput) colorInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); doSubmit(); } });
    if (sizeInput) sizeInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); doSubmit(); } });
    modal.addEventListener('click', function(e) { if (e.target === modal) closeAddOptionModal(); });
  }
  
  // 옵션 추가
  async function addProductOption(productId, color, size) {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/products/${encodeURIComponent(productId)}/options`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          color: color || '',
          size: size || ''
        })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        alert('옵션이 추가되었습니다.');
        await loadProductOptions(productId);
      } else {
        throw new Error(data.message || '옵션 추가에 실패했습니다.');
      }
    } catch (error) {
      console.error('옵션 추가 오류:', error.message);
      alert(`옵션 추가 오류: ${error.message}`);
    }
  }
  
  // 옵션 활성화/비활성화 토글
  async function toggleOptionActive(productId, optionId, newActiveState) {
    try {
      const response = await fetch(`${API_BASE_URL}/admin/products/${encodeURIComponent(productId)}/options/${optionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          is_active: newActiveState
        })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        await loadProductOptions(productId);
      } else {
        throw new Error(data.message || '옵션 수정에 실패했습니다.');
      }
    } catch (error) {
      console.error('옵션 수정 오류:', error.message);
      alert(`옵션 수정 오류: ${error.message}`);
    }
  }
  
  // 옵션 삭제
  async function deleteProductOption(productId, optionId) {
    if (!confirm('정말로 이 옵션을 삭제하시겠습니까?')) {
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/admin/products/${encodeURIComponent(productId)}/options/${optionId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        alert('옵션이 삭제되었습니다.');
        await loadProductOptions(productId);
      } else {
        throw new Error(data.message || '옵션 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('옵션 삭제 오류:', error.message);
      alert(`옵션 삭제 오류: ${error.message}`);
    }
  }

  // 전역 함수로 등록 (HTML에서 호출하기 위해)
  window.openAddProductModal = openAddProductModal;
  window.openEditProductModal = openEditProductModal;
  window.deleteProduct = deleteProduct;
  window.closeModal = closeModal;
  window.saveProduct = saveProduct;
  window.loadProducts = loadProducts;
  window.loadProductOptions = loadProductOptions;
  window.openAddOptionModal = openAddOptionModal;
  window.toggleOptionActive = toggleOptionActive;
  window.deleteProductOption = deleteProductOption;

})();