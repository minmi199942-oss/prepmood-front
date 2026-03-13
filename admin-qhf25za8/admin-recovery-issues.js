(function() {
  'use strict';

  const Logger = window.Logger || {
    log: function(){},
    warn: function(){},
    error: function(){ if (window.console && window.console.error) window.console.error.apply(window.console, arguments); }
  };

  const API_BASE = (window.API_BASE)
    ? window.API_BASE
    : ((window.location && window.location.origin)
        ? window.location.origin.replace(/\/$/, '') + '/api'
        : '/api');

  const PAGE_SIZE = 20;
  let currentPage = 1;
  let totalItems = 0;

  const REASON_LABELS = {
    NO_MATCHING_ATTEMPT: '연결할 payment_attempt를 찾지 못함',
    RETRYABLE_UNRESOLVED_ATTEMPT: '조건 만족 시 자동 재시도 후보',
    NON_RETRYABLE_UNRESOLVED_ATTEMPT: '현재 상태에서는 자동 재시도 불가',
    MULTIPLE_HOLD_ATTEMPTS: 'hold 시도가 여러 개라 자동 판단 불가',
    MIXED_HOLD_AND_LEGACY_ATTEMPTS: 'hold/legacy 혼합으로 수동 검토 필요'
  };

  function getReasonLabel(code) {
    if (!code) return '-';
    return REASON_LABELS[code] || code;
  }

  const state = {
    list: [],
    selectedIssueId: null
  };

  const elements = {
    refreshIssuesBtn: document.getElementById('refreshIssuesBtn'),
    issueCodeFilter: document.getElementById('issueCodeFilter'),
    useHoldFilter: document.getElementById('useHoldFilter'),
    recoveryTableBody: document.getElementById('recoveryTableBody'),
    recoverySummary: document.getElementById('recoverySummary'),
    prevIssuesBtn: document.getElementById('prevIssuesBtn'),
    nextIssuesBtn: document.getElementById('nextIssuesBtn'),
    issuesPageInfo: document.getElementById('issuesPageInfo'),
    recoveryDetailContainer: document.getElementById('recoveryDetailContainer')
  };

  async function init() {
    setupEventListeners();
    await loadIssues();
  }

  function setupEventListeners() {
    if (elements.refreshIssuesBtn) {
      elements.refreshIssuesBtn.addEventListener('click', () => {
        currentPage = 1;
        loadIssues();
      });
    }

    if (elements.issueCodeFilter) {
      elements.issueCodeFilter.addEventListener('change', () => {
        currentPage = 1;
        loadIssues();
      });
    }

    if (elements.useHoldFilter) {
      elements.useHoldFilter.addEventListener('change', () => {
        currentPage = 1;
        loadIssues();
      });
    }

    if (elements.prevIssuesBtn) {
      elements.prevIssuesBtn.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage -= 1;
          loadIssues();
        }
      });
    }

    if (elements.nextIssuesBtn) {
      elements.nextIssuesBtn.addEventListener('click', () => {
        const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
        if (currentPage < totalPages) {
          currentPage += 1;
          loadIssues();
        }
      });
    }
  }

  async function loadIssues() {
    const issueCode = elements.issueCodeFilter ? elements.issueCodeFilter.value : '';
    const useHoldValue = elements.useHoldFilter ? elements.useHoldFilter.value : '';

    try {
      const params = new URLSearchParams({
        page: currentPage,
        pageSize: PAGE_SIZE
      });

      if (issueCode) params.append('issueCode', issueCode);
      if (useHoldValue) params.append('useHold', useHoldValue);

      const response = await fetch(`${API_BASE}/admin/recovery/issues?${params.toString()}`, {
        credentials: 'include'
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data || !data.success) {
        const msg = (data && data.message) || `복구 이슈 조회 실패 (${response.status})`;
        alert(msg);
        Logger.error('복구 이슈 목록 조회 실패', { status: response.status, body: data });
        return;
      }

      const payload = data.data || {};
      const items = payload.items || [];
      const pagination = payload.pagination || {};

      state.list = items;
      totalItems = pagination.total || 0;

      renderIssuesTable(items);
      renderPagination(pagination);

      if (!state.selectedIssueId && items.length > 0) {
        selectIssue(items[0].id);
      } else if (state.selectedIssueId) {
        const exists = items.some(it => it.id === state.selectedIssueId);
        if (exists) {
          selectIssue(state.selectedIssueId);
        } else if (items.length > 0) {
          selectIssue(items[0].id);
        } else {
          renderEmptyDetail();
        }
      } else {
        renderEmptyDetail();
      }
    } catch (error) {
      Logger.error('복구 이슈 목록 조회 중 예외', { error: error.message });
      alert('복구 이슈 목록을 불러오는 중 오류가 발생했습니다.');
    }
  }

  function renderIssuesTable(items) {
    if (!elements.recoveryTableBody) return;

    if (!items.length) {
      elements.recoveryTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding: 1rem; color: #868e96;">
            현재 등록된 복구 이슈가 없습니다.
          </td>
        </tr>
      `;
      if (elements.recoverySummary) {
        elements.recoverySummary.textContent = '이슈 0건';
      }
      return;
    }

    elements.recoveryTableBody.innerHTML = items.map(issue => {
      const useHoldBadge = issue.useHold
        ? '<span class="badge badge-info">use_hold</span>'
        : '<span class="badge badge-light">legacy</span>';

      const candidateLabel = issue.recommendedActionCandidateLabel
        ? escapeHtml(issue.recommendedActionCandidateLabel)
        : '-';

      const lastSeen = issue.lastSeenAt
        ? formatKoreanDateTime(issue.lastSeenAt)
        : '-';

      const lastResultBadge = issue.lastRetryResult
        ? `<span class="badge ${issue.lastRetryResult === 'SUCCESS' ? 'badge-success' : 'badge-warning'}">${escapeHtml(issue.lastRetryResult)}</span>`
        : '-';

      const lastError = issue.lastErrorCode
        ? escapeHtml(issue.lastErrorCode)
        : '-';

      const paymentKeyMasked = maskMiddle(issue.paymentKey || '', 4, 4);

      let rowClass = '';
      if (issue.issueCode === 'USE_HOLD_RECOVERY_UNRESOLVED') {
        rowClass = 'row-critical';
      } else if (
        (issue.issueCode === 'UNRESOLVED_ATTEMPT' && issue.useHold) ||
        issue.lastRetryResult === 'FAILED'
      ) {
        rowClass = 'row-warning-row';
      }

      const selectedClass = state.selectedIssueId === issue.id ? ' style="outline: 2px solid #495057; outline-offset: -2px;"' : '';

      return `
        <tr data-issue-id="${issue.id}" class="${rowClass}"${selectedClass}>
          <td>
            <div class="mono">#${issue.id}</div>
            <div><span class="badge badge-secondary">${escapeHtml(issue.issueCode || '')}</span></div>
            <div class="label-muted truncate" title="${escapeHtml(issue.reasonCode || '')}">${escapeHtml(issue.reasonCode || '')}</div>
          </td>
          <td>
            <div class="mono truncate-sm" title="${escapeHtml(issue.orderNumber || '')}">
              ${escapeHtml(issue.orderNumber || '') || '-'}
            </div>
            <div>${useHoldBadge}</div>
            <div class="mono truncate-sm" title="${escapeHtml(issue.paymentKey || '')}">
              ${escapeHtml(paymentKeyMasked)}
            </div>
          </td>
          <td>
            <div class="truncate" title="${candidateLabel}">${candidateLabel}</div>
          </td>
          <td>
            <div>${lastResultBadge}</div>
            <div class="label-muted truncate" title="${lastError}">${lastError}</div>
          </td>
          <td>
            <div class="mono">${escapeHtml(lastSeen)}</div>
          </td>
        </tr>
      `;
    }).join('');

    elements.recoveryTableBody.querySelectorAll('tr').forEach(row => {
      row.addEventListener('click', () => {
        const id = parseInt(row.getAttribute('data-issue-id'), 10);
        if (!Number.isNaN(id)) {
          selectIssue(id);
        }
      });
    });

    if (elements.recoverySummary) {
      elements.recoverySummary.textContent = `총 ${totalItems}건 중 ${items.length}건 표시 중`;
    }
  }

  function renderPagination(pagination) {
    const page = pagination.page || currentPage || 1;
    const pageSize = pagination.pageSize || PAGE_SIZE;
    const total = pagination.total || totalItems || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    currentPage = page;

    if (elements.issuesPageInfo) {
      elements.issuesPageInfo.textContent = `페이지 ${page} / ${totalPages}`;
    }
    if (elements.prevIssuesBtn) {
      elements.prevIssuesBtn.disabled = page <= 1;
    }
    if (elements.nextIssuesBtn) {
      elements.nextIssuesBtn.disabled = page >= totalPages;
    }
  }

  function renderEmptyDetail() {
    if (!elements.recoveryDetailContainer) return;
    elements.recoveryDetailContainer.innerHTML = `
      <div class="empty-detail">
        아직 선택된 이슈가 없습니다.<br/>
        왼쪽 목록에서 확인할 이슈를 클릭하세요.
      </div>
    `;
  }

  async function selectIssue(issueId) {
    if (!issueId) {
      state.selectedIssueId = null;
      renderEmptyDetail();
      return;
    }

    state.selectedIssueId = issueId;

    if (!elements.recoveryDetailContainer) return;

    elements.recoveryDetailContainer.innerHTML = `
      <div class="empty-detail">
        이슈 상세를 불러오는 중입니다...
      </div>
    `;

    try {
      const response = await fetch(`${API_BASE}/admin/recovery/issues/${issueId}`, {
        credentials: 'include'
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data || !data.success) {
        const msg = (data && data.message) || `이슈 상세 조회 실패 (${response.status})`;
        alert(msg);
        Logger.error('복구 이슈 상세 조회 실패', { issueId, status: response.status, body: data });
        renderEmptyDetail();
        return;
      }

      const payload = data.data || {};
      renderIssueDetail(payload);
      updateListSelection(issueId);
    } catch (error) {
      Logger.error('복구 이슈 상세 조회 중 예외', { issueId, error: error.message });
      alert('복구 이슈 상세 정보를 불러오는 중 오류가 발생했습니다.');
      renderEmptyDetail();
    }
  }

  function updateListSelection(issueId) {
    if (!elements.recoveryTableBody) return;
    elements.recoveryTableBody.querySelectorAll('tr').forEach(row => {
      const id = parseInt(row.getAttribute('data-issue-id'), 10);
      if (!Number.isNaN(id) && id === issueId) {
        row.style.background = '#e9ecef';
      } else {
        row.style.background = '';
      }
    });
  }

  function renderIssueDetail(data) {
    if (!elements.recoveryDetailContainer) return;

    const issue = data.issue || {};
    const live = data.liveState || {};
    const resolution = data.resolution || {};
    const action = data.action || {};
    const logs = data.logs || [];
    const snapshot = issue.payloadSnapshot || {};

    const orderId = issue.orderId || null;
    const orderNumber = issue.orderNumber || '';
    const paymentKey = issue.paymentKey || '';

    const storedReasonCode = issue.storedReasonCode || '';
    const currentReasonCode = action.currentReasonCode || '';

    const storedReasonLabel = getReasonLabel(storedReasonCode);
    const currentReasonLabel = getReasonLabel(currentReasonCode);

    const useHold = !!issue.useHold;

    const useHoldBadge = useHold
      ? '<span class="badge badge-info">use_hold 주문</span>'
      : '<span class="badge badge-light">legacy 주문</span>';

    const paymentsStatus = live.paymentsStatus || null;
    const paymentsStatusLabel = paymentsStatus
      ? `<span class="badge badge-secondary">${escapeHtml(paymentsStatus)}</span>`
      : '-';

    const recommendedCandidate = issue.recommendedActionSnapshot || null;
    const recommendedCandidateLabel = recommendedCandidate
      ? `<span class="badge badge-light">${escapeHtml(recommendedCandidate)}</span>`
      : '-';

    const recommendedAction = action.recommendedAction || null;
    const recommendedActionLabel = action.recommendedActionLabel
      ? escapeHtml(action.recommendedActionLabel)
      : (recommendedAction ? escapeHtml(recommendedAction) : '-');

    const allowedBadge = (typeof action.actionAllowed === 'boolean')
      ? `<span class="badge ${action.actionAllowed ? 'badge-success' : 'badge-warning'}">
          ${action.actionAllowed ? '자동 재시도 조건 충족' : '자동 재시도 불가'}
        </span>`
      : '-';

    const allowedReason = action.actionAllowedReason
      ? escapeHtml(action.actionAllowedReason)
      : '-';

    const paidEventsCount = live.paidEventsCount != null ? Number(live.paidEventsCount) : null;
    const orderItemUnitsCount = live.orderItemUnitsCount != null ? Number(live.orderItemUnitsCount) : null;
    const activeHoldsCount = live.activeHoldsCount != null ? Number(live.activeHoldsCount) : null;
    const invoicesCount = live.invoicesCount != null ? Number(live.invoicesCount) : null;
    const alreadyProcessed = !!live.alreadyProcessed;
    const hasActiveClaim = !!live.hasActiveClaim;

    const snapshotHoldIds = Array.isArray(snapshot.holdAttemptIds) ? snapshot.holdAttemptIds : [];
    const snapshotLegacyIds = Array.isArray(snapshot.legacyAttemptIds) ? snapshot.legacyAttemptIds : [];
    const snapshotMatchedIds = Array.isArray(snapshot.matchedAttemptIds) ? snapshot.matchedAttemptIds : [];

    const summaryAutoRetry = (typeof action.actionAllowed === 'boolean')
      ? (action.actionAllowed ? '자동 재시도 후보' : '자동 재시도 불가')
      : '판단 불가';

    elements.recoveryDetailContainer.innerHTML = `
      <div class="detail-summary-card">
        <div class="summary-item">
          <span class="label-muted">결제/이벤트:</span>
          <span class="value-strong">
            ${paymentsStatus ? escapeHtml(paymentsStatus) : '상태 없음'}
          </span>
          <span class="label-muted">· paid_events:</span>
          <span class="value-strong">${paidEventsCount != null ? paidEventsCount : '-'}</span>
          <span class="label-muted">· units:</span>
          <span class="value-strong">${orderItemUnitsCount != null ? orderItemUnitsCount : '-'}</span>
          <span class="label-muted">· holds:</span>
          <span class="value-strong">${activeHoldsCount != null ? activeHoldsCount : '-'}</span>
            <span class="label-muted">· invoices:</span>
            <span class="value-strong">${invoicesCount != null ? invoicesCount : '-'}</span>
        </div>
        <div class="summary-item">
          <span class="label-muted">자동 재시도:</span>
          <span class="value-strong">${escapeHtml(summaryAutoRetry)}</span>
          ${action.currentReasonCode ? `<span class="label-muted">(${escapeHtml(action.currentReasonCode)})</span>` : ''}
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-section">
          <h4>기본 정보</h4>
          <dl>
            <dt>주문 ID / 주문번호</dt>
            <dd>
              <span class="value-strong mono">${orderId != null ? orderId : '-'}</span>
              ${orderNumber ? `<br><span class="mono">${escapeHtml(orderNumber)}</span>` : ''}
            </dd>
            <dt>paymentKey</dt>
            <dd class="mono">${escapeHtml(paymentKey || '-')}</dd>
            <dt>이슈 코드</dt>
            <dd>
              <span class="badge badge-secondary">${escapeHtml(issue.issueCode || '-')}</span>
            </dd>
            <dt>플로우</dt>
            <dd>${useHoldBadge}</dd>
            <dt>발생 시각</dt>
            <dd>
              <span class="mono">${formatKoreanDateTime(issue.firstSeenAt) || '-'}</span>
              <br/>
              <span class="label-muted">마지막 관측: ${formatKoreanDateTime(issue.lastSeenAt) || '-'}</span>
            </dd>
          </dl>
        </div>

        <div class="detail-section">
          <h4>이유 비교 (스냅샷 vs 현재)</h4>
          <div class="reason-card-grid">
            <div class="reason-card">
              <div class="reason-title">저장 당시 이유</div>
              <div class="reason-label">${escapeHtml(storedReasonLabel || '-')}</div>
              <span class="code-token">${escapeHtml(storedReasonCode || '-')}</span>
            </div>
            <div class="reason-card is-current">
              <div class="reason-title">현재 상태 기준 이유</div>
              <div class="reason-label">${escapeHtml(currentReasonLabel || '-')}</div>
              <span class="code-token">${escapeHtml(currentReasonCode || '-')}</span>
            </div>
          </div>
          <div class="section-note">
            저장 당시 이유는 이슈가 기록될 때의 판단이고,<br/>
            현재 이유는 지금 라이브 상태를 다시 진단한 결과입니다.
          </div>
        </div>

        <div class="detail-section">
          <h4>현재 상태 요약</h4>
          <dl>
            <dt>결제 상태 (payments.status)</dt>
            <dd>${paymentsStatusLabel}</dd>
            <dt>paid_events 개수</dt>
            <dd>${paidEventsCount != null ? paidEventsCount : '-'}</dd>
            <dt>order_item_units 개수</dt>
            <dd>${orderItemUnitsCount != null ? orderItemUnitsCount : '-'}</dd>
            <dt>ACTIVE holds 개수</dt>
            <dd>${activeHoldsCount != null ? activeHoldsCount : '-'}</dd>
            <dt>invoices 개수</dt>
            <dd>${invoicesCount != null ? invoicesCount : '-'}</dd>
            <dt>이미 처리된 paid_event_processing 성공 여부</dt>
            <dd>${alreadyProcessed ? '<span class="badge badge-success">이미 처리됨</span>' : '<span class="badge badge-light">미처리 또는 실패</span>'}</dd>
            <dt>진행 중인 recovery claim 여부</dt>
            <dd>${hasActiveClaim ? '<span class="badge badge-warning">IN_PROGRESS claim 존재</span>' : '<span class="badge badge-light">진행 중 claim 없음</span>'}</dd>
          </dl>
        </div>
      </div>

      <div class="divider"></div>

      <div class="detail-grid">
        <div class="detail-section">
          <h4>추천 액션 (후보 vs 현재)</h4>
          <dl>
            <dt>리스트 기준 후보 액션 (snapshot)</dt>
            <dd>${recommendedCandidateLabel}</dd>
            <dt>현재 상태 기준 최종 추천</dt>
            <dd>
              <div class="candidate-label">
                <strong>${recommendedAction ? escapeHtml(recommendedAction) : '-'}</strong><br/>
                <span>${recommendedActionLabel}</span>
              </div>
            </dd>
            <dt>자동 재시도 가능 여부</dt>
            <dd>
              ${allowedBadge}<br/>
              <span class="section-note">사유: ${allowedReason}</span>
            </dd>
          </dl>
          <div class="section-note">
            <strong>주의:</strong> 이 화면은 <strong>읽기 전용</strong>입니다.<br/>
            실제 재시도 버튼은 claim/lock 설계가 완료된 뒤에만 추가됩니다.
          </div>
        </div>

        <div class="detail-section">
          <h4>payload snapshot (화이트리스트)</h4>
          <dl>
            <dt>orderId / paymentKey / gateway</dt>
            <dd>
              <span class="mono">${snapshot.orderId != null ? snapshot.orderId : '-'}</span><br/>
              <span class="mono truncate-sm">${escapeHtml(snapshot.paymentKey || '-')}</span><br/>
              <span class="mono">${escapeHtml(snapshot.gateway || '-')}</span>
            </dd>
            <dt>reasonCode (snapshot 기준)</dt>
            <dd>${escapeHtml(snapshot.reasonCode || '-')}</dd>
            <dt>holdAttemptIds</dt>
            <dd class="mono">${snapshotHoldIds.length ? snapshotHoldIds.join(', ') : '-'}</dd>
            <dt>legacyAttemptIds</dt>
            <dd class="mono">${snapshotLegacyIds.length ? snapshotLegacyIds.join(', ') : '-'}</dd>
            <dt>matchedAttemptIds</dt>
            <dd class="mono">${snapshotMatchedIds.length ? snapshotMatchedIds.join(', ') : '-'}</dd>
          </dl>
        </div>
      </div>

      <div class="divider"></div>

      <div class="detail-section">
        <h4>액션 로그 타임라인</h4>
        <div class="logs-list">
          ${renderLogs(logs)}
        </div>
        <div class="section-note">
          가장 최근 50개의 액션 로그만 표시됩니다.
        </div>
      </div>
    `;
  }

  function renderLogs(logs) {
    if (!logs || !logs.length) {
      return '<div class="log-item">아직 기록된 액션 로그가 없습니다.</div>';
    }

    return logs.map(log => {
      const time = formatKoreanDateTime(log.created_at);
      const actor = log.actor || '-';
      const actorType = log.actor_type || '-';
      const action = log.action || '-';
      const result = log.result || '-';
      const errorCode = log.error_code || '';
      const issueCode = log.issue_code || '';
      const reasonCode = log.reason_code || '';

      const resultBadge = `<span class="badge ${result === 'SUCCESS' ? 'badge-success' : 'badge-danger'}">${escapeHtml(result)}</span>`;

      return `
        <div class="log-item">
          <div class="log-meta">
            <span class="log-time mono">${escapeHtml(time || '')}</span>
            <span class="log-action">${escapeHtml(action)}</span>
            ${resultBadge}
            <span class="badge badge-light">${escapeHtml(actorType)}</span>
            <span class="mono truncate-sm" title="${escapeHtml(actor)}">${escapeHtml(actor)}</span>
          </div>
          <div class="label-muted">
            이슈 코드: ${escapeHtml(issueCode || '-')} / 이유: ${escapeHtml(reasonCode || '-')}
            ${errorCode ? ` / 에러: ${escapeHtml(errorCode)}` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function escapeHtml(text) {
    if (text == null) return '';
    const str = String(text);
    return str.replace(/[&<>"']/g, function(m) {
      switch (m) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case '\'': return '&#039;';
        default: return m;
      }
    });
  }

  function formatKoreanDateTime(value) {
    if (!value) return '';
    try {
      const date = (value instanceof Date) ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return date.toLocaleString('ko-KR', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  }

  function maskMiddle(value, start, end) {
    if (!value) return '';
    const str = String(value);
    if (str.length <= start + end) return str;
    return `${str.slice(0, start)}...${str.slice(str.length - end)}`;
  }

  window.AdminPages = window.AdminPages || {};
  window.AdminPages.recoveryIssues = {
    init
  };
})();
