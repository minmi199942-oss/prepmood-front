// admin-warranties.js - 보증서 관리 페이지 스크립트

(function() {
  'use strict';

  // API 설정
  const API_BASE = (window.API_BASE) 
    ? window.API_BASE 
    : ((window.location && window.location.origin)
        ? window.location.origin.replace(/\/$/, '') + '/api'
        : '/api');

  // DOM 요소
  const elements = {
    searchForm: document.getElementById('searchForm'),
    searchInput: document.getElementById('searchInput'),
    searchResults: document.getElementById('searchResults'),
    resultsCount: document.getElementById('resultsCount'),
    loadingState: document.getElementById('loadingState'),
    emptyState: document.getElementById('emptyState'),
    warrantiesTable: document.getElementById('warrantiesTable'),
    warrantiesTableBody: document.getElementById('warrantiesTableBody'),
    warrantyDetailModal: document.getElementById('warrantyDetailModal'),
    closeModal: document.getElementById('closeModal'),
    warrantyDetailContent: document.getElementById('warrantyDetailContent'),
    reasonModal: document.getElementById('reasonModal'),
    reasonModalTitle: document.getElementById('reasonModalTitle'),
    reasonInput: document.getElementById('reasonInput'),
    closeReasonModal: document.getElementById('closeReasonModal'),
    cancelReasonBtn: document.getElementById('cancelReasonBtn'),
    confirmReasonBtn: document.getElementById('confirmReasonBtn')
  };

  // 현재 액션 정보 저장
  let currentAction = null;
  let currentWarrantyId = null;

  // ============================================
  // 초기화
  // ============================================
  async function init() {
    // 관리자 권한 확인은 admin-layout.js에서 처리됨
    // 헤더 렌더링 (warranties 페이지 추가 필요)
    if (window.renderAdminHeader) {
      window.renderAdminHeader('warranties');
    }

    // 이벤트 리스너 설정
    setupEventListeners();
  }

  // ============================================
  // 이벤트 리스너 설정
  // ============================================
  function setupEventListeners() {
    // 검색 폼 제출
    elements.searchForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await searchWarranties();
    });

    // 모달 닫기
    elements.closeModal.addEventListener('click', () => {
      elements.warrantyDetailModal.classList.remove('show');
    });

    // 모달 배경 클릭 시 닫기
    elements.warrantyDetailModal.addEventListener('click', (e) => {
      if (e.target === elements.warrantyDetailModal) {
        elements.warrantyDetailModal.classList.remove('show');
      }
    });

    // Reason 모달 닫기
    if (elements.closeReasonModal) {
      elements.closeReasonModal.addEventListener('click', () => {
        closeReasonModal();
      });
    }

    if (elements.cancelReasonBtn) {
      elements.cancelReasonBtn.addEventListener('click', () => {
        closeReasonModal();
      });
    }

    if (elements.confirmReasonBtn) {
      elements.confirmReasonBtn.addEventListener('click', () => {
        handleReasonConfirm();
      });
    }

    // Reason 모달 배경 클릭 시 닫기
    if (elements.reasonModal) {
      elements.reasonModal.addEventListener('click', (e) => {
        if (e.target === elements.reasonModal) {
          closeReasonModal();
        }
      });
    }
  }

  // ============================================
  // 보증서 검색
  // ============================================
  async function searchWarranties() {
    const query = elements.searchInput.value.trim();

    if (!query) {
      alert('검색어를 입력해주세요.');
      return;
    }

    elements.loadingState.style.display = 'block';
    elements.emptyState.style.display = 'none';
    elements.warrantiesTable.style.display = 'none';
    elements.searchResults.style.display = 'block';

    try {
      const response = await fetch(`${API_BASE}/admin/warranties/search?q=${encodeURIComponent(query)}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      elements.loadingState.style.display = 'none';

      if (!data.success) {
        throw new Error(data.message || '검색 실패');
      }

      elements.resultsCount.textContent = `검색 결과: ${data.count}개`;

      if (data.count === 0) {
        elements.emptyState.style.display = 'block';
        return;
      }

      // 단건이면 상세 바로 이동, 다건이면 리스트 표시
      if (data.count === 1) {
        await showWarrantyDetail(data.warranties[0].id);
      } else {
        renderWarrantiesTable(data.warranties);
        elements.warrantiesTable.style.display = 'table';
      }

    } catch (error) {
      console.error('보증서 검색 실패:', error.message);
      elements.loadingState.style.display = 'none';
      alert('보증서 검색 중 오류가 발생했습니다.');
    }
  }

  // ============================================
  // 보증서 테이블 렌더링
  // ============================================
  function renderWarrantiesTable(warranties) {
    elements.warrantiesTableBody.innerHTML = warranties.map(w => {
      const statusBadge = getStatusBadge(w.status, w.is_resold);
      const ownerInfo = w.owner ? `${w.owner.name || w.owner.email}` : '-';
      const createdDate = w.created_at ? new Date(w.created_at).toLocaleDateString('ko-KR') : '-';

      return `
        <tr data-warranty-id="${w.id}" style="cursor: pointer;">
          <td>${escapeHtml(w.public_id || '-')}</td>
          <td>${escapeHtml(w.product_name || '-')}</td>
          <td>${statusBadge}</td>
          <td><code>${escapeHtml(w.token || '-')}</code></td>
          <td>${escapeHtml(w.serial_number || '-')}</td>
          <td>${escapeHtml(ownerInfo)}</td>
          <td>${createdDate}</td>
        </tr>
      `;
    }).join('');

    // 행 클릭 이벤트
    elements.warrantiesTableBody.querySelectorAll('tr').forEach(row => {
      row.addEventListener('click', () => {
        const warrantyId = row.dataset.warrantyId;
        showWarrantyDetail(parseInt(warrantyId, 10));
      });
    });
  }

  // ============================================
  // 상태 배지 생성
  // ============================================
  function getStatusBadge(status, isResold) {
    const badges = {
      'active': '<span class="badge badge-success">활성화</span>',
      'issued': '<span class="badge badge-info">발급됨</span>',
      'issued_unassigned': '<span class="badge badge-secondary">미할당</span>',
      'suspended': '<span class="badge badge-warning">제재</span>',
      'revoked': '<span class="badge badge-danger">환불됨</span>'
    };

    let badge = badges[status] || `<span class="badge badge-secondary">${status}</span>`;
    
    if (isResold) {
      badge += ' <span class="badge badge-resold">재판매됨</span>';
    }

    return badge;
  }

  // ============================================
  // 보증서 상세 조회
  // ============================================
  async function showWarrantyDetail(warrantyId) {
    currentWarrantyId = warrantyId; // 현재 보증서 ID 저장
    
    elements.warrantyDetailContent.innerHTML = '<div class="loading-state">로딩 중...</div>';
    elements.warrantyDetailModal.classList.add('show');

    try {
      const response = await fetch(`${API_BASE}/admin/warranties/${warrantyId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || '조회 실패');
      }

      renderWarrantyDetail(data);

    } catch (error) {
      console.error('보증서 상세 조회 실패:', error.message);
      elements.warrantyDetailContent.innerHTML = `
        <div class="empty-state">
          <p>보증서 상세 정보를 불러오는데 실패했습니다.</p>
          <p style="color: #dc3545; font-size: 0.875rem;">${escapeHtml(error.message)}</p>
        </div>
      `;
    }
  }

  // ============================================
  // 보증서 상세 렌더링
  // ============================================
  function renderWarrantyDetail(data) {
    const { warranty, status_card, owner_card, connection_card, events } = data;

    // 정책 경고 배지
    const policyBadge = status_card.policy_badge 
      ? `<span class="badge badge-${status_card.policy_badge.type === 'error' ? 'danger' : status_card.policy_badge.type === 'warning' ? 'warning' : 'info'}">${escapeHtml(status_card.policy_badge.message)}</span>`
      : '';

    // 재판매 배지
    const resoldBadge = status_card.is_resold 
      ? '<span class="badge badge-resold">재판매됨</span>'
      : '';

    // 소유자 정보
    const ownerInfo = owner_card.current_owner 
      ? `${escapeHtml(owner_card.current_owner.name || owner_card.current_owner.email)} (${escapeHtml(owner_card.current_owner.email)})`
      : '없음';

    // 연결 정보
    let connectionHtml = '<p>연결 정보 없음</p>';
    if (connection_card) {
      const { order, order_item, stock_unit, invoices, invoice_linkage_status } = connection_card;
      
      connectionHtml = `
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">주문번호</span>
            <span class="detail-value">${escapeHtml(order.order_number || '-')}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">주문 상태</span>
            <span class="detail-value">${escapeHtml(order.status || '-')}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">제품명</span>
            <span class="detail-value">${escapeHtml(order_item.product_name || '-')}</span>
          </div>
          ${stock_unit ? `
          <div class="detail-item">
            <span class="detail-label">시리얼 넘버</span>
            <span class="detail-value">${escapeHtml(stock_unit.serial_number || '-')}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">ROT 코드</span>
            <span class="detail-value">${escapeHtml(stock_unit.rot_code || '-')}</span>
          </div>
          ` : ''}
        </div>
        ${invoice_linkage_status ? `
        <div style="margin-top: 1rem; padding: 0.75rem; background: #f8f9fa; border-radius: 4px;">
          <strong>인보이스 연동 상태:</strong> 
          <span class="badge badge-${invoice_linkage_status.badge_type}" style="margin-left: 0.5rem;">
            ${escapeHtml(invoice_linkage_status.label)}
          </span>
        </div>
        ` : ''}
        ${invoices.original ? `
        <div style="margin-top: 1rem;">
          <strong>원본 인보이스:</strong> ${escapeHtml(invoices.original.invoice_number)} 
          (${new Date(invoices.original.issued_at).toLocaleDateString('ko-KR')})
          ${invoices.original.total_amount ? ` - 총액: ${Number(invoices.original.total_amount).toLocaleString('ko-KR')}원` : ''}
        </div>
        ` : ''}
        ${invoices.credit_notes && invoices.credit_notes.length > 0 ? `
        <div style="margin-top: 1rem;">
          <strong>Credit Note:</strong>
          <ul>
            ${invoices.credit_notes.map(cn => `
              <li>${escapeHtml(cn.invoice_number)} (${new Date(cn.issued_at).toLocaleDateString('ko-KR')})</li>
            `).join('')}
          </ul>
        </div>
        ` : ''}
      `;
    }

    // 소유자 변경 이력
    const ownershipHistory = owner_card.ownership_history.length > 0
      ? owner_card.ownership_history.map(h => {
          const fromUser = h.old_value.owner_user_id || '없음';
          const toUser = h.new_value.owner_user_id || '없음';
          return `
            <div class="timeline-item">
              <div class="timeline-header">
                <span class="timeline-type">${h.event_type === 'ownership_transferred' ? '양도' : '소유자 변경'}</span>
                <span class="timeline-date">${new Date(h.created_at).toLocaleString('ko-KR')}</span>
              </div>
              <div>${fromUser} → ${toUser}</div>
              ${h.reason ? `<div style="font-size: 0.75rem; color: #6c757d; margin-top: 0.25rem;">${escapeHtml(h.reason)}</div>` : ''}
            </div>
          `;
        }).join('')
      : '<p style="color: #6c757d;">소유자 변경 이력이 없습니다.</p>';

    // 이력 타임라인
    const eventsTimeline = events.length > 0
      ? events.map(e => {
          const eventTypeLabels = {
            'status_change': '상태 변경',
            'owner_change': '소유자 변경',
            'ownership_transferred': '양도',
            'suspend': '제재',
            'unsuspend': '제재 해제',
            'revoke': '환불'
          };
          return `
            <div class="timeline-item">
              <div class="timeline-header">
                <span class="timeline-type">${eventTypeLabels[e.event_type] || e.event_type}</span>
                <span class="timeline-date">${new Date(e.created_at).toLocaleString('ko-KR')}</span>
              </div>
              <div style="font-size: 0.875rem;">
                ${JSON.stringify(e.old_value) !== '{}' ? `이전: ${JSON.stringify(e.old_value)}` : ''}
                ${JSON.stringify(e.new_value) !== '{}' ? ` → 현재: ${JSON.stringify(e.new_value)}` : ''}
              </div>
              ${e.reason ? `<div style="font-size: 0.75rem; color: #6c757d; margin-top: 0.25rem;">${escapeHtml(e.reason)}</div>` : ''}
            </div>
          `;
        }).join('')
      : '<p style="color: #6c757d;">이력이 없습니다.</p>';

    elements.warrantyDetailContent.innerHTML = `
      <!-- 보증서 상태 카드 -->
      <div class="detail-card">
        <h4>보증서 상태</h4>
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">상태</span>
            <span class="detail-value">${getStatusBadge(status_card.status, status_card.is_resold)} ${policyBadge}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">활성화 일시</span>
            <span class="detail-value">${status_card.activated_at ? new Date(status_card.activated_at).toLocaleString('ko-KR') : '-'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">환불 일시</span>
            <span class="detail-value">${status_card.revoked_at ? new Date(status_card.revoked_at).toLocaleString('ko-KR') : '-'}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">제품명</span>
            <span class="detail-value">${escapeHtml(warranty.product_name || '-')}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">토큰</span>
            <span class="detail-value"><code>${escapeHtml(warranty.token || '-')}</code></span>
          </div>
          <div class="detail-item">
            <span class="detail-label">시리얼 넘버</span>
            <span class="detail-value">${escapeHtml(warranty.serial_number || '-')}</span>
          </div>
        </div>
      </div>

      <!-- 소유자 정보 카드 -->
      <div class="detail-card">
        <h4>소유자 정보</h4>
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">현재 소유자</span>
            <span class="detail-value">${escapeHtml(ownerInfo)}</span>
          </div>
        </div>
        <div style="margin-top: 1rem;">
          <strong>소유자 변경 이력:</strong>
          <div class="timeline">
            ${ownershipHistory}
          </div>
        </div>
      </div>

      <!-- 연결 정보 카드 -->
      <div class="detail-card">
        <h4>연결 정보</h4>
        ${connectionHtml}
      </div>

      <!-- 보증서 이력 타임라인 -->
      <div class="detail-card">
        <h4>보증서 이력</h4>
        <div class="timeline">
          ${eventsTimeline}
        </div>
      </div>

      <!-- 관리자 액션 섹션 -->
      <div class="detail-card" style="border-top: 2px solid #dee2e6; margin-top: 1.5rem;">
        <h4>관리자 액션</h4>
        ${renderAdminActions(status_card.status)}
      </div>

      <!-- QR 코드 다운로드 버튼 -->
      <div style="text-align: center; margin-top: 1.5rem;">
        <button class="btn-search" onclick="downloadQRCode('${warranty.public_id}')">QR 코드 다운로드</button>
      </div>
    `;
  }

  // ============================================
  // 관리자 액션 버튼 렌더링
  // ============================================
  function renderAdminActions(warrantyStatus) {
    const actions = [];
    
    // 정지 버튼 (active 또는 issued일 때)
    if (warrantyStatus === 'active' || warrantyStatus === 'issued') {
      actions.push({
        type: 'suspend',
        label: '정지',
        color: 'warning',
        icon: '⚠️'
      });
    }
    
    // 정지 해제 버튼 (suspended일 때)
    if (warrantyStatus === 'suspended') {
      actions.push({
        type: 'unsuspend',
        label: '정지 해제',
        color: 'success',
        icon: '✅'
      });
    }
    
    // 환불 처리 버튼 (issued 또는 issued_unassigned일 때)
    // ⚠️ active 상태는 환불 불가 (정책 고정)
    if (warrantyStatus === 'issued' || warrantyStatus === 'issued_unassigned') {
      actions.push({
        type: 'refund',
        label: '환불 처리',
        color: 'danger',
        icon: '💰'
      });
    }
    
    if (actions.length === 0) {
      return '<p style="color: #6c757d;">현재 상태에서 수행 가능한 관리자 액션이 없습니다.</p>';
    }
    
    return `
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        ${actions.map(action => `
          <button 
            class="btn-${action.color}" 
            onclick="window.showReasonModal('${escapeHtml(action.type)}', '${escapeHtml(action.label)}')"
            style="padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; font-size: 0.875rem; font-weight: 500; ${getButtonStyle(action.color)}"
          >
            ${action.icon} ${escapeHtml(action.label)}
          </button>
        `).join('')}
      </div>
    `;
  }

  // ============================================
  // 버튼 스타일 생성
  // ============================================
  function getButtonStyle(color) {
    const styles = {
      'warning': 'background: #ffc107; color: #212529;',
      'success': 'background: #28a745; color: white;',
      'danger': 'background: #dc3545; color: white;'
    };
    return styles[color] || 'background: #6c757d; color: white;';
  }

  // ============================================
  // Reason 모달 표시
  // ============================================
  window.showReasonModal = function(actionType, actionLabel) {
    if (!currentWarrantyId) {
      alert('보증서 정보를 불러올 수 없습니다.');
      return;
    }

    currentAction = {
      type: actionType,
      label: actionLabel
    };

    if (elements.reasonModalTitle) {
      elements.reasonModalTitle.textContent = `${escapeHtml(actionLabel)} - 변경 사유 입력`;
    }

    if (elements.reasonInput) {
      elements.reasonInput.value = '';
    }

    if (elements.reasonModal) {
      elements.reasonModal.style.display = 'flex';
      elements.reasonModal.classList.add('show');
      
      // 포커스
      if (elements.reasonInput) {
        setTimeout(() => elements.reasonInput.focus(), 100);
      }
    }
  };

  // ============================================
  // Reason 모달 닫기
  // ============================================
  function closeReasonModal() {
    if (elements.reasonModal) {
      elements.reasonModal.style.display = 'none';
      elements.reasonModal.classList.remove('show');
    }
    
    currentAction = null;
    
    if (elements.reasonInput) {
      elements.reasonInput.value = '';
    }
  }

  // ============================================
  // Reason 확인 처리
  // ============================================
  async function handleReasonConfirm() {
    if (!currentAction || !currentWarrantyId) {
      alert('액션 정보를 불러올 수 없습니다.');
      return;
    }

    const reason = elements.reasonInput ? elements.reasonInput.value.trim() : '';

    // 최소 길이 검증
    if (reason.length < 10) {
      alert('변경 사유는 최소 10자 이상 입력해주세요.');
      if (elements.reasonInput) {
        elements.reasonInput.focus();
      }
      return;
    }

    // 확인 대화상자
    const actionLabel = currentAction.label;
    const reasonPreview = reason.substring(0, 50) + (reason.length > 50 ? '...' : '');
    if (!confirm(`${actionLabel}을(를) 진행하시겠습니까?\n\n변경 사유: ${reasonPreview}`)) {
      return;
    }

    // 버튼 비활성화
    if (elements.confirmReasonBtn) {
      elements.confirmReasonBtn.disabled = true;
      elements.confirmReasonBtn.textContent = '처리 중...';
    }

    try {
      await executeWarrantyAction(currentWarrantyId, currentAction.type, reason);
      closeReasonModal();
    } catch (error) {
      console.error('액션 실행 실패:', error);
      
      // 동시성 충돌 감지 시 사용자 친화적 메시지 및 새로고침 옵션
      if (error.message.includes('상태가 변경되어') || error.message.includes('새로고침') ||
          error.message.includes('affectedRows') || error.message.includes('ALREADY_REFUNDED') ||
          error.message.includes('이미 환불') || error.message.includes('활성화된 보증서') ||
          error.message.includes('수행할 수 없습니다')) {
        const shouldReload = confirm(`${error.message}\n\n지금 새로고침하시겠습니까?`);
        if (shouldReload) {
          location.reload();
        }
      } else {
        alert(`처리 중 오류가 발생했습니다: ${error.message}`);
      }
    } finally {
      if (elements.confirmReasonBtn) {
        elements.confirmReasonBtn.disabled = false;
        elements.confirmReasonBtn.textContent = '확인';
      }
    }
  }

  // ============================================
  // 보증서 액션 실행
  // ============================================
  async function executeWarrantyAction(warrantyId, actionType, reason) {
    try {
      let response;
      
      if (actionType === 'suspend' || actionType === 'unsuspend') {
        // 보증서 이벤트 생성 API 호출
        response = await fetch(`${API_BASE}/admin/warranties/${warrantyId}/events`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            type: actionType,
            reason: reason
          })
        });
      } else if (actionType === 'refund') {
        // 환불 처리 API 호출
        response = await fetch(`${API_BASE}/admin/refunds/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            warranty_id: warrantyId,
            reason: reason
          })
        });
      } else {
        throw new Error(`지원하지 않는 액션 타입입니다: ${actionType}`);
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || '처리 실패');
      }

      alert('처리가 완료되었습니다.');
      
      // 상세 정보 다시 로드
      await showWarrantyDetail(warrantyId);

    } catch (error) {
      console.error('보증서 액션 실행 실패:', error);
      
      // HTTP 에러 응답에서 상세 메시지 추출
      if (error.response) {
        const errorData = error.response.data || {};
        const errorMessage = errorData.message || error.message;
        
        // 동시성 충돌 등 특정 에러에 대한 사용자 친화적 메시지
        if (errorMessage.includes('상태') || errorMessage.includes('변경') || 
            errorMessage.includes('affectedRows') || errorMessage.includes('ALREADY_REFUNDED') ||
            errorMessage.includes('이미 환불') || errorMessage.includes('활성화된 보증서') ||
            errorMessage.includes('수행할 수 없습니다') || errorMessage.includes('상태가 변경')) {
          throw new Error('보증서 상태가 변경되어 이 작업을 수행할 수 없습니다. 페이지를 새로고침 후 다시 시도해주세요.');
        }
        
        throw new Error(errorMessage);
      }
      
      // 동시성 충돌 등 특정 에러에 대한 사용자 친화적 메시지
      if (error.message.includes('상태') || error.message.includes('변경') || 
          error.message.includes('affectedRows') || error.message.includes('ALREADY_REFUNDED') ||
          error.message.includes('이미 환불') || error.message.includes('활성화된 보증서') ||
          error.message.includes('수행할 수 없습니다') || error.message.includes('상태가 변경')) {
        throw new Error('보증서 상태가 변경되어 이 작업을 수행할 수 없습니다. 페이지를 새로고침 후 다시 시도해주세요.');
      }
      
      throw error;
    }
  }

  // ============================================
  // QR 코드 다운로드
  // ============================================
  window.downloadQRCode = function(publicId) {
    // 기존 QR 코드 다운로드 API 활용
    window.open(`/api/admin/qrcode/download?public_id=${publicId}`, '_blank');
  };

  // ============================================
  // 유틸리티 함수
  // ============================================
  function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================
  // 페이지 로드 시 초기화
  // ============================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
