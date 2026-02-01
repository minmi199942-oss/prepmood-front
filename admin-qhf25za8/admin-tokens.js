/**
 * admin-tokens.js - 토큰 관리 페이지
 * 상품·옵션 선택 후 토큰 생성, 옵션 메타 설정
 */

(function() {
  'use strict';

  const API_BASE = (window.API_BASE) ? window.API_BASE
    : (window.location && window.location.origin ? window.location.origin.replace(/\/$/, '') + '/api' : '/api');

  let allProducts = [];
  let productOptions = [];
  let selectedOption = null;

  const elements = {
    tokenProductId: document.getElementById('tokenProductId'),
    tokenOptionSelect: document.getElementById('tokenOptionSelect'),
    optionMetaStatus: document.getElementById('optionMetaStatus'),
    optionMetaBtn: document.getElementById('optionMetaBtn'),
    tokenCount: document.getElementById('tokenCount'),
    createTokensBtn: document.getElementById('createTokensBtn'),
    createResult: document.getElementById('createResult'),
    createdCount: document.getElementById('createdCount'),
    createdTokenList: document.getElementById('createdTokenList'),
    optionMetaModal: document.getElementById('optionMetaModal'),
    closeOptionMetaModal: document.getElementById('closeOptionMetaModal'),
    optionMetaForm: document.getElementById('optionMetaForm'),
    metaOptionId: document.getElementById('metaOptionId'),
    metaRotCode: document.getElementById('metaRotCode'),
    metaWarrantyBottomPrefix: document.getElementById('metaWarrantyBottomPrefix'),
    metaSerialPrefix: document.getElementById('metaSerialPrefix'),
    metaDigitalWarrantyCode: document.getElementById('metaDigitalWarrantyCode'),
    metaDigitalWarrantyCollection: document.getElementById('metaDigitalWarrantyCollection'),
    metaSeasonCode: document.getElementById('metaSeasonCode'),
    cancelOptionMetaBtn: document.getElementById('cancelOptionMetaBtn')
  };

  function isOptionMetaOk(opt) {
    if (!opt) return false;
    const s = (v) => (v != null && String(v).trim() !== '');
    return s(opt.rot_code) && s(opt.warranty_bottom_prefix) && s(opt.serial_prefix) &&
           s(opt.digital_warranty_code) && s(opt.digital_warranty_collection);
  }

  function updateMetaStatusAndButtons() {
    selectedOption = productOptions.find(o => String(o.option_id) === elements.tokenOptionSelect.value) || null;
    const ok = isOptionMetaOk(selectedOption);
    elements.optionMetaStatus.textContent = ok ? 'OK' : '미설정';
    elements.optionMetaStatus.className = 'meta-status ' + (ok ? 'ok' : 'missing');
    elements.optionMetaBtn.disabled = !selectedOption;
    elements.createTokensBtn.disabled = !selectedOption || !ok;
  }

  async function init() {
    setupEventListeners();
    await loadProducts();
  }

  function setupEventListeners() {
    elements.tokenProductId.addEventListener('change', onProductChange);
    elements.tokenOptionSelect.addEventListener('change', updateMetaStatusAndButtons);
    elements.optionMetaBtn.addEventListener('click', openOptionMetaModal);
    elements.createTokensBtn.addEventListener('click', createTokens);
    elements.closeOptionMetaModal.addEventListener('click', closeOptionMetaModal);
    elements.cancelOptionMetaBtn.addEventListener('click', closeOptionMetaModal);
    elements.optionMetaModal.addEventListener('click', (e) => { if (e.target === elements.optionMetaModal) closeOptionMetaModal(); });
    elements.optionMetaForm.addEventListener('submit', saveOptionMeta);
  }

  async function loadProducts() {
    try {
      const res = await fetch(`${API_BASE}/products`, { credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      allProducts = data.products || data || [];
      const select = elements.tokenProductId;
      select.innerHTML = '<option value="">상품 선택</option>';
      allProducts.forEach(p => {
        const id = p.id || p.product_id;
        const name = p.name || p.product_name || id;
        select.appendChild(new Option(name, id));
      });
    } catch (e) {
      console.error('상품 로드 실패:', e.message);
      alert('상품 목록을 불러오는데 실패했습니다.');
    }
  }

  async function onProductChange() {
    const productId = elements.tokenProductId.value;
    elements.tokenOptionSelect.innerHTML = '<option value="">옵션 선택</option>';
    elements.tokenOptionSelect.disabled = !productId;
    productOptions = [];
    selectedOption = null;
    updateMetaStatusAndButtons();
    elements.createResult.style.display = 'none';
    if (!productId) return;
    try {
      const res = await fetch(`${API_BASE}/admin/products/${encodeURIComponent(productId)}/options`, { credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      productOptions = data.options || data || [];
      const select = elements.tokenOptionSelect;
      select.innerHTML = '<option value="">옵션 선택</option>';
      productOptions.forEach(o => {
        const label = [o.size || '', o.color || ''].filter(Boolean).join(' / ') || `옵션 ${o.option_id}`;
        select.appendChild(new Option(label, o.option_id));
      });
      elements.tokenOptionSelect.disabled = false;
    } catch (e) {
      console.error('옵션 로드 실패:', e.message);
      alert('옵션 목록을 불러오는데 실패했습니다.');
    }
  }

  function openOptionMetaModal() {
    if (!selectedOption) return;
    elements.metaOptionId.value = selectedOption.option_id;
    elements.metaRotCode.value = selectedOption.rot_code || '';
    elements.metaWarrantyBottomPrefix.value = selectedOption.warranty_bottom_prefix || '';
    elements.metaSerialPrefix.value = selectedOption.serial_prefix || '';
    elements.metaDigitalWarrantyCode.value = selectedOption.digital_warranty_code || '';
    elements.metaDigitalWarrantyCollection.value = selectedOption.digital_warranty_collection || '';
    elements.metaSeasonCode.value = selectedOption.season_code || '';
    elements.optionMetaModal.style.display = 'flex';
  }

  function closeOptionMetaModal() {
    elements.optionMetaModal.style.display = 'none';
  }

  async function saveOptionMeta(e) {
    e.preventDefault();
    const optionId = elements.metaOptionId.value;
    if (!optionId) return;
    const body = {
      rot_code: elements.metaRotCode.value.trim() || null,
      warranty_bottom_prefix: elements.metaWarrantyBottomPrefix.value.trim() || null,
      serial_prefix: elements.metaSerialPrefix.value.trim() || null,
      digital_warranty_code: elements.metaDigitalWarrantyCode.value.trim() || null,
      digital_warranty_collection: elements.metaDigitalWarrantyCollection.value.trim() || null,
      season_code: elements.metaSeasonCode.value.trim() || null
    };
    try {
      const res = await fetch(`${API_BASE}/admin/product-options/${optionId}/meta`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.message || '저장에 실패했습니다.');
        return;
      }
      const opt = productOptions.find(o => String(o.option_id) === optionId);
      if (opt) {
        opt.rot_code = body.rot_code;
        opt.warranty_bottom_prefix = body.warranty_bottom_prefix;
        opt.serial_prefix = body.serial_prefix;
        opt.digital_warranty_code = body.digital_warranty_code;
        opt.digital_warranty_collection = body.digital_warranty_collection;
        opt.season_code = body.season_code;
      }
      closeOptionMetaModal();
      updateMetaStatusAndButtons();
      alert('옵션 메타가 저장되었습니다.');
    } catch (e) {
      console.error('옵션 메타 저장 실패:', e.message);
      alert('저장 중 오류가 발생했습니다.');
    }
  }

  async function createTokens() {
    if (!selectedOption || !isOptionMetaOk(selectedOption)) return;
    const productId = elements.tokenProductId.value;
    const count = Math.min(Math.max(parseInt(elements.tokenCount.value, 10) || 1, 1), 100);
    elements.createTokensBtn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/admin/tokens`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: productId,
          size: selectedOption.size || '',
          color: selectedOption.color || '',
          count
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.message || '토큰 생성에 실패했습니다.');
        return;
      }
      elements.createdCount.textContent = data.count || 0;
      const list = data.created || [];
      let html = '<table><thead><tr><th>token_pk</th><th>토큰(마스킹)</th><th>internal_code</th><th>warranty_bottom_code</th></tr></thead><tbody>';
      list.forEach(t => {
        html += `<tr><td>${t.token_pk}</td><td>${t.token_masked || '-'}</td><td>${t.internal_code || '-'}</td><td>${t.warranty_bottom_code || '-'}</td></tr>`;
      });
      html += '</tbody></table>';
      elements.createdTokenList.innerHTML = html;
      elements.createResult.style.display = 'block';
      alert(`${data.count}개 토큰이 생성되었습니다.`);
    } catch (e) {
      console.error('토큰 생성 실패:', e.message);
      alert('토큰 생성 중 오류가 발생했습니다.');
    } finally {
      updateMetaStatusAndButtons();
    }
  }

  if (typeof window !== 'undefined') {
    window.AdminPages = window.AdminPages || {};
    window.AdminPages.tokens = { init };
  }
})();
