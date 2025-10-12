// admin-products.js - 상품 관리 페이지 스크립트

(function() {
  'use strict';

  // API 설정
  const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'https://prepmood.kr/api'
    : 'https://prepmood.kr/api';

  // 관리자 키 (실제로는 로그인 시스템으로 대체해야 함)
  let ADMIN_KEY = localStorage.getItem('adminKey') || '';

  // 관리자 키 확인
  if (!ADMIN_KEY) {
    ADMIN_KEY = prompt('관리자 키를 입력하세요:');
    if (ADMIN_KEY) {
      localStorage.setItem('adminKey', ADMIN_KEY);
    } else {
      alert('관리자 권한이 필요합니다.');
      window.location.href = '../index.html';
      return;
    }
  }

  // 요소
  const loadingState = document.getElementById('loadingState');
  const emptyState = document.getElementById('emptyState');
  const productsGrid = document.getElementById('productsGrid');
  const addProductBtn = document.getElementById('addProductBtn');
  const productModal = document.getElementById('productModal');
  const closeModal = document.getElementById('closeModal');
  const cancelBtn = document.getElementById('cancelBtn');
  const productForm = document.getElementById('productForm');
  const modalTitle = document.getElementById('modalTitle');
  const imageInput = document.getElementById('imageInput');
  const previewImg = document.getElementById('previewImg');
  const uploadPlaceholder = document.getElementById('uploadPlaceholder');
  const searchInput = document.getElementById('searchInput');
  const categoryFilter = document.getElementById('categoryFilter');

  // 상태
  let products = [];
  let filteredProducts = [];
  let editingProductId = null;
  let uploadedImageUrl = null;

  // 카테고리별 타입 매핑
  const typesByCategory = {
    tops: [
      { value: 'shirts', label: '셔츠 (Shirts)' },
      { value: 'tshirts', label: '티셔츠 (T-Shirts)' },
      { value: 'knits', label: '니트 (Knits)' }
    ],
    bottoms: [
      { value: 'pants', label: '바지 (Pants)' },
      { value: 'jeans', label: '청바지 (Jeans)' },
      { value: 'shorts', label: '반바지 (Shorts)' }
    ],
    outer: [
      { value: 'jackets', label: '재킷 (Jackets)' },
      { value: 'coats', label: '코트 (Coats)' },
      { value: 'blazers', label: '블레이저 (Blazers)' }
    ],
    bags: [
      { value: 'backpacks', label: '백팩 (Backpacks)' },
      { value: 'totes', label: '토트백 (Totes)' },
      { value: 'crossbody', label: '크로스백 (Crossbody)' }
    ],
    accessories: [
      { value: 'jewelry', label: '쥬얼리 (Jewelry)' },
      { value: 'belts', label: '벨트 (Belts)' },
      { value: 'wallets', label: '지갑 (Wallets)' },
      { value: 'caps', label: '모자 (Caps)' }
    ]
  };

  // 초기화
  async function init() {
    await loadProducts();
    setupEventListeners();
    setupCategoryChange();
  }

  // 이벤트 리스너 설정
  function setupEventListeners() {
    addProductBtn.addEventListener('click', openAddModal);
    closeModal.addEventListener('click', closeProductModal);
    cancelBtn.addEventListener('click', closeProductModal);
    productForm.addEventListener('submit', handleFormSubmit);
    imageInput.addEventListener('change', handleImageSelect);
    searchInput.addEventListener('input', filterProducts);
    categoryFilter.addEventListener('change', filterProducts);

    // 모달 외부 클릭 시 닫기
    productModal.addEventListener('click', (e) => {
      if (e.target === productModal) {
        closeProductModal();
      }
    });
  }

  // 카테고리 변경 시 타입 옵션 업데이트
  function setupCategoryChange() {
    const categorySelect = document.getElementById('productCategory');
    const typeSelect = document.getElementById('productType');

    categorySelect.addEventListener('change', function() {
      const category = this.value;
      typeSelect.innerHTML = '<option value="">선택하세요</option>';

      if (category && typesByCategory[category]) {
        typesByCategory[category].forEach(type => {
          const option = document.createElement('option');
          option.value = type.value;
          option.textContent = type.label;
          typeSelect.appendChild(option);
        });
      }
    });
  }

  // 상품 목록 불러오기
  async function loadProducts() {
    try {
      loadingState.style.display = 'block';
      productsGrid.style.display = 'none';
      emptyState.style.display = 'none';

      const response = await fetch(`${API_BASE_URL}/products`);
      const data = await response.json();

      if (data.success) {
        products = data.products;
        filteredProducts = products;
        displayProducts(filteredProducts);
      } else {
        throw new Error(data.message || '상품 목록을 불러올 수 없습니다.');
      }

    } catch (error) {
      console.error('상품 목록 로드 오류:', error);
      alert('상품 목록을 불러오는데 실패했습니다: ' + error.message);
    } finally {
      loadingState.style.display = 'none';
    }
  }

  // 상품 표시
  function displayProducts(productsToShow) {
    if (productsToShow.length === 0) {
      productsGrid.style.display = 'none';
      emptyState.style.display = 'flex';
      return;
    }

    productsGrid.style.display = 'grid';
    emptyState.style.display = 'none';
    productsGrid.innerHTML = '';

    productsToShow.forEach(product => {
      const card = createProductCard(product);
      productsGrid.appendChild(card);
    });
  }

  // 상품 카드 생성
  function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';

    // 이미지 URL 처리
    let imageUrl = product.image || '../image/logo.png';
    if (imageUrl.startsWith('/uploads')) {
      imageUrl = `https://prepmood.kr${imageUrl}`;
    }

    // 카테고리/타입 표시
    const categoryLabel = getCategoryLabel(product.category);
    const typeLabel = getTypeLabel(product.category, product.type);
    const genderLabel = product.gender === 'men' ? '남성' : '여성';

    card.innerHTML = `
      <img src="${imageUrl}" alt="${escapeHtml(product.name)}" class="product-card-image" onerror="this.src='../image/logo.png'">
      <div class="product-card-name">${escapeHtml(product.name)}</div>
      <div class="product-card-price">${formatPrice(product.price)}</div>
      <div class="product-card-meta">${genderLabel} > ${categoryLabel} > ${typeLabel}</div>
      <div class="product-card-meta" style="font-size: 0.75rem; color: #999;">ID: ${product.id}</div>
      <div class="product-card-actions">
        <button class="btn-secondary" onclick="window.editProduct('${product.id}')">수정</button>
        <button class="btn-danger" onclick="window.deleteProduct('${product.id}')">삭제</button>
      </div>
    `;

    return card;
  }

  // 상품 필터링
  function filterProducts() {
    const searchTerm = searchInput.value.toLowerCase();
    const category = categoryFilter.value;

    filteredProducts = products.filter(product => {
      const matchesSearch = product.name.toLowerCase().includes(searchTerm) ||
                           product.id.toLowerCase().includes(searchTerm);
      const matchesCategory = !category || product.category === category;

      return matchesSearch && matchesCategory;
    });

    displayProducts(filteredProducts);
  }

  // 추가 모달 열기
  function openAddModal() {
    editingProductId = null;
    uploadedImageUrl = null;
    modalTitle.textContent = '새 상품 추가';
    productForm.reset();
    resetImagePreview();
    productModal.classList.add('show');
  }

  // 수정 모달 열기
  window.editProduct = async function(productId) {
    try {
      editingProductId = productId;
      modalTitle.textContent = '상품 수정';

      const product = products.find(p => p.id === productId);
      if (!product) {
        alert('상품을 찾을 수 없습니다.');
        return;
      }

      // 폼에 데이터 채우기
      document.getElementById('productId').value = product.id;
      document.getElementById('productId').disabled = true; // ID는 수정 불가
      document.getElementById('productName').value = product.name;
      document.getElementById('productPrice').value = product.price;
      document.getElementById('productGender').value = product.gender;
      document.getElementById('productCategory').value = product.category;

      // 카테고리 변경 이벤트 트리거
      document.getElementById('productCategory').dispatchEvent(new Event('change'));

      // 타입 설정 (비동기 처리)
      setTimeout(() => {
        document.getElementById('productType').value = product.type;
      }, 50);

      document.getElementById('productDescription').value = product.description || '';

      // 이미지 미리보기
      if (product.image) {
        uploadedImageUrl = product.image;
        showImagePreview(product.image);
      }

      productModal.classList.add('show');

    } catch (error) {
      console.error('상품 수정 모달 오류:', error);
      alert('상품 정보를 불러오는데 실패했습니다.');
    }
  };

  // 상품 삭제
  window.deleteProduct = async function(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (!confirm(`"${product.name}" 상품을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/admin/products/${productId}`, {
        method: 'DELETE',
        headers: {
          'X-Admin-Key': ADMIN_KEY
        }
      });

      const data = await response.json();

      if (data.success) {
        alert('상품이 삭제되었습니다.');
        await loadProducts();
      } else {
        throw new Error(data.message || '상품 삭제에 실패했습니다.');
      }

    } catch (error) {
      console.error('상품 삭제 오류:', error);
      alert('상품 삭제에 실패했습니다: ' + error.message);

      if (error.message.includes('401')) {
        alert('관리자 권한이 유효하지 않습니다. 다시 로그인해주세요.');
        localStorage.removeItem('adminKey');
        location.reload();
      }
    }
  };

  // 모달 닫기
  function closeProductModal() {
    productModal.classList.remove('show');
    productForm.reset();
    resetImagePreview();
    document.getElementById('productId').disabled = false;
    editingProductId = null;
    uploadedImageUrl = null;
  }

  // 이미지 선택
  function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // 파일 크기 확인 (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('이미지 파일은 5MB 이하여야 합니다.');
      return;
    }

    // 로컬 미리보기
    const reader = new FileReader();
    reader.onload = function(e) {
      showImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);

    // 서버에 업로드
    uploadImage(file);
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

      const data = await response.json();

      if (data.success) {
        uploadedImageUrl = data.imageUrl;
        console.log('✅ 이미지 업로드 성공:', uploadedImageUrl);
      } else {
        throw new Error(data.message || '이미지 업로드 실패');
      }

    } catch (error) {
      console.error('이미지 업로드 오류:', error);
      alert('이미지 업로드에 실패했습니다: ' + error.message);
    }
  }

  // 이미지 미리보기 표시
  function showImagePreview(imageUrl) {
    if (imageUrl.startsWith('/uploads')) {
      imageUrl = `https://prepmood.kr${imageUrl}`;
    }

    previewImg.src = imageUrl;
    previewImg.style.display = 'block';
    uploadPlaceholder.style.display = 'none';
  }

  // 이미지 미리보기 리셋
  function resetImagePreview() {
    previewImg.src = '';
    previewImg.style.display = 'none';
    uploadPlaceholder.style.display = 'block';
  }

  // 폼 제출
  async function handleFormSubmit(e) {
    e.preventDefault();

    const formData = {
      id: document.getElementById('productId').value.trim(),
      name: document.getElementById('productName').value.trim(),
      price: parseInt(document.getElementById('productPrice').value),
      image: uploadedImageUrl || '',
      gender: document.getElementById('productGender').value,
      category: document.getElementById('productCategory').value,
      type: document.getElementById('productType').value,
      description: document.getElementById('productDescription').value.trim()
    };

    // 유효성 검사
    if (!formData.id || !formData.name || !formData.price || !formData.gender || !formData.category || !formData.type) {
      alert('필수 항목을 모두 입력해주세요.');
      return;
    }

    try {
      const isEdit = !!editingProductId;
      const url = isEdit
        ? `${API_BASE_URL}/admin/products/${editingProductId}`
        : `${API_BASE_URL}/admin/products`;

      const method = isEdit ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': ADMIN_KEY
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (data.success) {
        alert(isEdit ? '상품이 수정되었습니다.' : '상품이 추가되었습니다.');
        closeProductModal();
        await loadProducts();
      } else {
        throw new Error(data.message || '저장에 실패했습니다.');
      }

    } catch (error) {
      console.error('상품 저장 오류:', error);
      alert('상품 저장에 실패했습니다: ' + error.message);

      if (error.message.includes('401')) {
        alert('관리자 권한이 유효하지 않습니다. 다시 로그인해주세요.');
        localStorage.removeItem('adminKey');
        location.reload();
      }
    }
  }

  // 유틸리티 함수
  function formatPrice(price) {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0
    }).format(price);
  }

  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  function getCategoryLabel(category) {
    const labels = {
      tops: '상의',
      bottoms: '하의',
      outer: '아우터',
      bags: '가방',
      accessories: '액세서리'
    };
    return labels[category] || category;
  }

  function getTypeLabel(category, type) {
    if (!typesByCategory[category]) return type;

    const typeObj = typesByCategory[category].find(t => t.value === type);
    return typeObj ? typeObj.label.split(' ')[0] : type;
  }

  // 초기화 실행
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

