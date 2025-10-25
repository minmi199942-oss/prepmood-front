// admin-products.js - 상품 관리 페이지 스크립트 (보안 강화 버전)

(function() {
  'use strict';

  // 로그인 체크 함수
  function checkAdminAuth() {
    const token = localStorage.getItem('admin_token');
    const username = localStorage.getItem('admin_username');
    
    if (!token || !username) {
      window.location.href = 'login.html';
      return false;
    }
    
    // 토큰 유효성 검사
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp <= Date.now()) {
        // 토큰 만료
        localStorage.removeItem('admin_token');
        localStorage.removeItem('admin_username');
        window.location.href = 'login.html';
        return false;
      }
      return true;
    } catch (error) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_username');
      window.location.href = 'login.html';
      return false;
    }
  }

  // 페이지 로드 시 로그인 체크
  if (!checkAdminAuth()) {
    return;
  }

  // API 설정
  const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'https://prepmood.kr/api'
    : 'https://prepmood.kr/api';

  // 관리자 키 (환경변수에서 가져오거나 기본값 사용)
  const ADMIN_KEY = 'prepmood_admin_2025_secure_key';

  // 전역 변수
  let products = [];
  let currentEditingProduct = null;

  // DOM 요소들
  const elements = {
    loadingState: document.getElementById('loadingState'),
    productsGrid: document.getElementById('productsGrid'),
    searchInput: document.getElementById('searchInput'),
    categoryFilter: document.getElementById('categoryFilter'),
    addProductBtn: document.getElementById('addProductBtn'),
    logoutBtn: document.getElementById('logoutBtn')
  };

  // 상품 목록 로드
  async function loadProducts() {
    try {
      elements.loadingState.style.display = 'block';
      elements.productsGrid.innerHTML = '';

      const response = await fetch(`${API_BASE_URL}/products`, {
        headers: {
          'X-Admin-Key': ADMIN_KEY
        }
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
      console.error('상품 로드 오류:', error);
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

    elements.productsGrid.innerHTML = productsToRender.map(product => `
      <div class="product-card" data-id="${product.id}">
        <img class="product-card-image" src="${product.image || 'image/shirt.jpg'}" alt="${escapeHtml(product.name)}" 
             onerror="this.src='image/shirt.jpg'">
        <div class="product-card-name">${escapeHtml(product.name)}</div>
        <div class="product-card-price">${formatKRW(product.price)}</div>
        <div class="product-card-meta">
          ${escapeHtml(product.gender)} • ${escapeHtml(product.category)} • ${escapeHtml(product.type)}
        </div>
        <div class="product-card-actions">
          <button onclick="openEditProductModal('${product.id}')" class="btn-secondary">수정</button>
          <button onclick="deleteProduct('${product.id}')" class="btn-danger">삭제</button>
        </div>
      </div>
    `).join('');
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
                   ${isEditing ? 'readonly' : 'required'}>
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
            <label for="productGender">성별</label>
            <select id="productGender" name="gender" required>
              <option value="">선택하세요</option>
              <option value="남성" ${product.gender === '남성' ? 'selected' : ''}>남성</option>
              <option value="여성" ${product.gender === '여성' ? 'selected' : ''}>여성</option>
            </select>
          </div>
          <div class="form-group">
            <label for="productCategory">카테고리</label>
            <select id="productCategory" name="category" required>
              <option value="">선택하세요</option>
              <option value="상의" ${product.category === '상의' ? 'selected' : ''}>상의</option>
              <option value="하의" ${product.category === '하의' ? 'selected' : ''}>하의</option>
              <option value="신발" ${product.category === '신발' ? 'selected' : ''}>신발</option>
              <option value="가방" ${product.category === '가방' ? 'selected' : ''}>가방</option>
              <option value="모자" ${product.category === '모자' ? 'selected' : ''}>모자</option>
              <option value="스카프" ${product.category === '스카프' ? 'selected' : ''}>스카프</option>
              <option value="액세서리" ${product.category === '액세서리' ? 'selected' : ''}>액세서리</option>
            </select>
          </div>
          <div class="form-group">
            <label for="productType">타입</label>
            <input type="text" id="productType" name="type" value="${product.type || ''}" required>
          </div>
          <div class="form-group">
            <label for="productDescription">설명</label>
            <textarea id="productDescription" name="description" rows="3">${product.description || ''}</textarea>
          </div>
          <div class="form-group">
            <label for="productImage">이미지</label>
            <div class="image-upload">
              <input type="file" id="productImage" accept="image/*">
              <button type="button" id="uploadBtn" class="btn-secondary">이미지 업로드</button>
              <div id="imagePreview" class="image-preview">
                ${product.image ? `<img src="${product.image}" alt="상품 이미지">` : ''}
              </div>
            </div>
          </div>
        </form>
        <div class="modal-footer">
          <button type="button" onclick="closeModal()" class="btn-secondary">취소</button>
          <button type="submit" class="btn-primary">저장</button>
        </div>
      </div>
    `;

    return modal;
  }

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
        headers: {
          'X-Admin-Key': ADMIN_KEY
        },
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
      console.error('이미지 업로드 오류:', error);
      throw error;
    }
  }

  // 상품 저장
  async function saveProduct() {
    try {
      console.log('🚀 saveProduct 함수 시작!');
      console.log('📝 폼 데이터 처리 시작...');
      
      // 현재 열려있는 모달에서 폼 찾기
      const modal = document.querySelector('.modal-overlay');
      const form = modal ? modal.querySelector('#productForm') : document.getElementById('productForm');
      
      console.log('🔍 모달 요소:', modal);
      console.log('🔍 폼 요소:', form);
      
      if (!form) {
        alert('폼을 찾을 수 없습니다!');
        return;
      }
      
      const formData = new FormData(form);
      
      // 폼 데이터 디버깅 추가
      console.log('📋 폼 필드들:');
      for (let [key, value] of formData.entries()) {
        console.log(`- ${key}: "${value}"`);
      }
      
      const productData = {
        id: formData.get('id'),
        name: formData.get('name'),
        price: parseInt(formData.get('price')),
        gender: formData.get('gender'),
        category: formData.get('category'),
        type: formData.get('type'),
        description: formData.get('description')
      };
      
      console.log('📦 productData:', productData);

      // 이미지 업로드 처리
      const imageInput = document.getElementById('productImage');
      const imageFile = imageInput && imageInput.files && imageInput.files.length > 0 ? imageInput.files[0] : null;
      if (imageFile) {
        productData.image = await uploadImage(imageFile);
      } else if (currentEditingProduct && currentEditingProduct.image) {
        productData.image = currentEditingProduct.image;
      }

      const isEditing = currentEditingProduct !== null;
      const url = isEditing 
        ? `${API_BASE_URL}/admin/products/${productData.id}`
        : `${API_BASE_URL}/admin/products`;
      
      const method = isEditing ? 'PUT' : 'POST';
      
      // 디버깅: URL과 데이터 확인
      console.log('🔍 디버깅 정보:');
      console.log('- isEditing:', isEditing);
      console.log('- productData.id:', productData.id);
      console.log('- URL:', url);
      console.log('- Method:', method);

      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_KEY
        },
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
      console.error('상품 저장 오류:', error);
      alert(`상품 저장 오류: ${error.message}`);
    }
  }

  // 상품 삭제
  async function deleteProduct(productId) {
    if (!confirm('정말로 이 상품을 삭제하시겠습니까?')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/admin/products/${productId}`, {
        method: 'DELETE',
        headers: {
          'X-Admin-Key': ADMIN_KEY
        }
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
      console.error('상품 삭제 오류:', error);
      alert(`상품 삭제 오류: ${error.message}`);
    }
  }

  // 로그아웃
  function logout() {
    if (confirm('로그아웃 하시겠습니까?')) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_username');
      window.location.href = 'login.html';
    }
  }

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

  // 이벤트 리스너 등록
  document.addEventListener('DOMContentLoaded', function() {
    // 검색 및 필터 이벤트
    elements.searchInput.addEventListener('input', filterProducts);
    elements.categoryFilter.addEventListener('change', filterProducts);
    
    // 버튼 이벤트
    elements.addProductBtn.addEventListener('click', openAddProductModal);
    elements.logoutBtn.addEventListener('click', logout);
    
    // 이미지 업로드 이벤트
    document.addEventListener('change', function(e) {
      if (e.target.id === 'productImage' && e.target.files[0]) {
        const file = e.target.files[0];
        const preview = document.getElementById('imagePreview');
        
        if (preview) {
          const reader = new FileReader();
          reader.onload = function(e) {
            preview.innerHTML = `<img src="${e.target.result}" alt="미리보기">`;
          };
          reader.readAsDataURL(file);
        }
      }
    });

    // 모달 외부 클릭 시 닫기
    document.addEventListener('click', function(e) {
      if (e.target.classList.contains('modal-overlay')) {
        closeModal();
      }
    });

    // ESC 키로 모달 닫기
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeModal();
      }
    });

    // 초기 상품 목록 로드
    loadProducts();
  });

  // 전역 함수로 등록 (HTML에서 호출하기 위해)
  window.openAddProductModal = openAddProductModal;
  window.openEditProductModal = openEditProductModal;
  window.deleteProduct = deleteProduct;
  window.closeModal = closeModal;
  window.saveProduct = saveProduct;
  window.loadProducts = loadProducts;

})();