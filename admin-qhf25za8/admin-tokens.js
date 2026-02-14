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
    cancelOptionMetaBtn: document.getElementById('cancelOptionMetaBtn'),
    editTokenPk: document.getElementById('editTokenPk'),
    loadTokenBtn: document.getElementById('loadTokenBtn'),
    tokenEditFormWrap: document.getElementById('tokenEditFormWrap'),
    editProductName: document.getElementById('editProductName'),
    editRotCode: document.getElementById('editRotCode'),
    editSerialNumber: document.getElementById('editSerialNumber'),
    editWarrantyBottomCode: document.getElementById('editWarrantyBottomCode'),
    editDigitalWarrantyCode: document.getElementById('editDigitalWarrantyCode'),
    editDigitalWarrantyCollection: document.getElementById('editDigitalWarrantyCollection'),
    saveTokenEditBtn: document.getElementById('saveTokenEditBtn'),
    editTokenMessage: document.getElementById('editTokenMessage')
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
    if (elements.loadTokenBtn) elements.loadTokenBtn.addEventListener('click', loadTokenForEdit);
    if (elements.saveTokenEditBtn) elements.saveTokenEditBtn.addEventListener('click', saveTokenEdit);
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

  async function loadTokenForEdit() {
    const pk = elements.editTokenPk && elements.editTokenPk.value ? parseInt(elements.editTokenPk.value, 10) : 0;
    if (!pk || pk < 1) {
      if (elements.editTokenMessage) elements.editTokenMessage.textContent = 'token_pk를 입력하세요 (1 이상).';
      return;
    }
    if (elements.editTokenMessage) elements.editTokenMessage.textContent = '';
    try {
      const res = await fetch(`${API_BASE}/admin/tokens/${pk}`, { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (elements.editTokenMessage) elements.editTokenMessage.textContent = data.message || '조회 실패';
        if (elements.tokenEditFormWrap) elements.tokenEditFormWrap.style.display = 'none';
        return;
      }
      const t = data.token || {};
      if (elements.editProductName) elements.editProductName.value = t.product_name ?? '';
      if (elements.editRotCode) elements.editRotCode.value = t.rot_code ?? '';
      if (elements.editSerialNumber) elements.editSerialNumber.value = t.serial_number ?? '';
      if (elements.editWarrantyBottomCode) elements.editWarrantyBottomCode.value = t.warranty_bottom_code ?? '';
      if (elements.editDigitalWarrantyCode) elements.editDigitalWarrantyCode.value = t.digital_warranty_code ?? '';
      if (elements.editDigitalWarrantyCollection) elements.editDigitalWarrantyCollection.value = t.digital_warranty_collection ?? '';
      if (elements.tokenEditFormWrap) elements.tokenEditFormWrap.style.display = 'block';
      if (elements.editTokenMessage) elements.editTokenMessage.textContent = t.scan_count > 0 ? '이미 스캔된 토큰입니다. 수정 시 409가 반환될 수 있습니다.' : '';
    } catch (e) {
      console.error('토큰 조회 실패:', e.message);
      if (elements.editTokenMessage) elements.editTokenMessage.textContent = '조회 중 오류가 발생했습니다.';
    }
  }

  async function saveTokenEdit() {
    const pk = elements.editTokenPk && elements.editTokenPk.value ? parseInt(elements.editTokenPk.value, 10) : 0;
    if (!pk || pk < 1) {
      if (elements.editTokenMessage) elements.editTokenMessage.textContent = 'token_pk를 입력한 뒤 조회하세요.';
      return;
    }
    const body = {};
    if (elements.editProductName) body.product_name = elements.editProductName.value.trim() || null;
    if (elements.editRotCode) body.rot_code = elements.editRotCode.value.trim() || null;
    if (elements.editSerialNumber) body.serial_number = elements.editSerialNumber.value.trim() || null;
    if (elements.editWarrantyBottomCode) body.warranty_bottom_code = elements.editWarrantyBottomCode.value.trim() || null;
    if (elements.editDigitalWarrantyCode) body.digital_warranty_code = elements.editDigitalWarrantyCode.value.trim() || null;
    if (elements.editDigitalWarrantyCollection) body.digital_warranty_collection = elements.editDigitalWarrantyCollection.value.trim() || null;
    const keys = Object.keys(body).filter(k => body[k] !== undefined);
    if (keys.length === 0) {
      if (elements.editTokenMessage) elements.editTokenMessage.textContent = '수정할 필드를 하나 이상 입력하세요.';
      return;
    }
    const send = {};
    keys.forEach(k => { send[k] = body[k]; });
    if (elements.editTokenMessage) elements.editTokenMessage.textContent = '저장 중...';
    if (elements.saveTokenEditBtn) elements.saveTokenEditBtn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/admin/tokens/${pk}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(send)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (elements.editTokenMessage) elements.editTokenMessage.textContent = data.updated && data.updated.length ? `저장됨 (${data.updated.length}개 필드)` : (data.message || '저장됨');
      } else {
        if (elements.editTokenMessage) elements.editTokenMessage.textContent = data.message || `오류 ${res.status}`;
      }
    } catch (e) {
      console.error('토큰 수정 실패:', e.message);
      if (elements.editTokenMessage) elements.editTokenMessage.textContent = '저장 중 오류가 발생했습니다.';
    } finally {
      if (elements.saveTokenEditBtn) elements.saveTokenEditBtn.disabled = false;
    }
  }

  if (typeof window !== 'undefined') {
    window.AdminPages = window.AdminPages || {};
    window.AdminPages.tokens = { init };
  }
})();
