const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let appState = null;
let activeView = 'overview';
let toastTimer = null;
let pendingSourceChange = null;
let integrationConfig = { geminiConfigured: false, supabaseConnected: false, persistence: 'local-json' };
let authReady = Promise.resolve();
if (window.parent !== window) {
  authReady = new Promise(resolve => {
    const receiveSession = event => {
      if (event.origin !== window.location.origin || event.data?.type !== 'dante-auth-session') return;
      if (event.data.accessToken) sessionStorage.setItem('dante-access-token', event.data.accessToken);
      else sessionStorage.removeItem('dante-access-token');
      window.removeEventListener('message', receiveSession);
      resolve();
    };
    window.addEventListener('message', receiveSession);
    window.parent.postMessage({ type: 'dante-auth-request' }, window.location.origin);
  });
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function currentSource() { return appState?.sources?.find(source => source.id === 'pro-storage'); }
function linkedItems() { return (appState?.content || []).filter(item => item.linkedSourceIds?.length); }
function sourceLinkedItems(sourceId) { return (appState?.content || []).filter(item => item.linkedSourceIds?.includes(sourceId)); }
function pendingItems() { return (appState?.content || []).filter(item => item.status === 'needs_review' && item.finding).sort((a, b) => (b.finding.priorityScore || 0) - (a.finding.priorityScore || 0)); }
function fmtDate(value) {
  if (!value) return 'just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'just now';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}
function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

async function api(url, body) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const accessToken = sessionStorage.getItem('dante-access-token');
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(url, body ? {
    method: 'POST', headers, body: JSON.stringify(body)
  } : { cache: 'no-store', headers });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  if (body && window.parent !== window) window.parent.postMessage({ type: 'dante-workspace-updated' }, window.location.origin);
  return result;
}

function statusChip(status) {
  if (status === 'needs_review') return '<span class="status-pill status-review">Needs review</span>';
  if (status === 'exception') return '<span class="status-pill status-exception">Exception approved</span>';
  return '<span class="status-pill status-current"><span></span>In sync</span>';
}

function renderStats() {
  const source = currentSource();
  const linked = linkedItems();
  const pending = pendingItems();
  const stats = [
    ['Approved sources', appState.sources.filter(item => item.status === 'approved').length, 'Current, team-approved guidance', '▤', ''],
    ['Linked content', linked.length, 'Connected to approved sources', '▧', ''],
    ['Needs review', pending.length, pending.length ? 'A source change needs a decision' : 'No open review decisions', '◎', pending.length ? 'stat-alert' : ''],
    ['Source version', `v${source.version}`, 'Latest approved version', '↻', '']
  ];
  $('#stats').innerHTML = stats.map(([label, value, note, icon, extra]) => `<article class="stat-card ${extra}"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></article>`).join('');
}

function renderIntegrationStatus() {
  const node = $('#integration-status');
  if (!node) return;
  const gemini = integrationConfig.geminiConfigured
    ? `Gemini assist is available (${escapeHtml(integrationConfig.geminiModel)}); it runs only when the reviewer opts in.`
    : 'Gemini is not configured, so rule checks stay in manual review.';
  const database = integrationConfig.supabaseConnected
    ? 'Supabase Postgres is connected; workspace state is protected by your signed-in account.'
    : 'Supabase is not connected; this workspace saves to local JSON.';
  node.innerHTML = `<b>${gemini}</b><span> ${escapeHtml(database)}</span>`;
}

function renderTrendChart() {
  const target = $('#trend-chart');
  if (!target) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today); date.setDate(today.getDate() - 6 + index);
    return { date, key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`, findings: 0, resolved: 0, passed: 0 };
  });
  const dayKey = value => { const date = new Date(value); return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; };
  for (const event of appState.audit || []) {
    const day = days.find(row => row.key === dayKey(event.at));
    if (!day) continue;
    if (event.type === 'finding_created') day.findings += 1;
    if (event.type === 'review_resolved') day.resolved += 1;
    if (event.type === 'content_reviewed' && event.result === 'supported') day.passed += 1;
  }
  const total = days.reduce((sum, day) => sum + day.findings + day.resolved + day.passed, 0);
  if (!total) {
    target.innerHTML = '<div class="trend-empty">No review activity has been recorded in the last seven days.</div>';
    return;
  }
  const max = Math.max(1, ...days.map(day => day.findings + day.resolved + day.passed));
  const chartHeight = 128, baseline = 151, chartTop = 18, slot = 100, start = 35, barWidth = 11, gap = 3;
  const bars = days.map((day, index) => {
    const x = start + index * slot;
    const values = [['findings', day.findings, '#df6f62'], ['resolved', day.resolved, '#339b71'], ['passed', day.passed, '#7782d6']];
    const dailyTotal = values.reduce((sum, [, value]) => sum + value, 0);
    const tallest = Math.max(...values.map(([, value]) => value));
    const rects = values.map(([key, value, color], barIndex) => {
      const height = value ? Math.max(2, (value / max) * chartHeight) : 0;
      return `<rect x="${x + barIndex * (barWidth + gap)}" y="${baseline - height}" width="${barWidth}" height="${height}" rx="3" fill="${color}"><title>${value} ${key}</title></rect>`;
    }).join('');
    const label = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(day.date);
    const totalLabel = dailyTotal ? `<text x="${x + 20}" y="${Math.max(13, baseline - (tallest / max) * chartHeight - 6)}" text-anchor="middle" class="trend-total">${dailyTotal}</text>` : '';
    return `${rects}${totalLabel}<text x="${x + 20}" y="177" text-anchor="middle">${label}</text>`;
  }).join('');
  target.innerHTML = `<svg class="trend-svg" viewBox="0 0 700 190" role="img" aria-label="Recorded checks over the last seven days"><line x1="16" y1="${baseline}" x2="685" y2="${baseline}" stroke="#e8e9ef"/><line x1="16" y1="${chartTop}" x2="685" y2="${chartTop}" stroke="#f1f1f5" stroke-dasharray="3 5"/>${bars}</svg>`;
}

function renderStatusAndFacts() {
  const source = currentSource();
  const linked = linkedItems();
  const first = sourceLinkedItems(source.id)[0];
  const claim = first?.finding?.evidenceSpan?.claim || first?.latestCheck?.evidenceSpan?.claim || `${source.value} ${source.unit}`;
  $('#fact-value').innerHTML = `${source.value} <small>${escapeHtml(source.unit)}</small>`;
  $('#source-version').textContent = `v${source.version}`;
  $('#source-updated').textContent = fmtDate(source.updatedAt);
  $('#visual-source-value').textContent = `${source.value} ${source.unit}`;
  $('#visual-version').textContent = `v${source.version}`;
  $('#visual-content-value').textContent = claim;
  updateSelectedSourceHint();
  $('#source-nav-count').textContent = appState.sources.length;
  const isStale = first?.status === 'needs_review';
  $('#visual-status').textContent = isStale ? 'REVIEW NEEDED' : first?.status === 'exception' ? 'EXCEPTION' : 'IN SYNC';
  $('#visual-status').className = `node-status ${isStale ? 'node-status-warning' : ''}`;
  $('#visual-impact-title').textContent = isStale ? 'A changed fact surfaced an old claim' : 'Connected, so change is traceable';
  $('#visual-impact-copy').textContent = isStale ? `${pendingItems().length} item needs a human decision` : `${appState.sources.filter(item => item.status === 'approved').length} approved source · ${linked.length} linked ${linked.length === 1 ? 'item' : 'items'}`;
  $('#queue-count').textContent = pendingItems().length;
  $('#content-queue-count').textContent = pendingItems().length;
  $('#impact-nav-dot').classList.toggle('visible', pendingItems().length > 0);
  $('#simulate-change').innerHTML = source.value === 100 ? 'Update approved fact <span>→</span>' : 'Try another source change <span>→</span>';
  renderImpact();
}

function renderContentTable(selector) {
  const rows = [...appState.content];
  if (!rows.length) {
    $(selector).innerHTML = '<tr><td colspan="5"><div class="empty-panel"><strong>No content yet</strong>Submit a draft to connect it to an approved source.</div></td></tr>';
    return;
  }
  $(selector).innerHTML = rows.map(item => {
    const source = appState.sources.find(row => item.linkedSourceIds?.includes(row.id));
    const version = source ? `v${item.sourceVersions?.[source.id] || source.version}` : 'No linked source';
    return `<tr><td><span class="content-title-cell"><span class="file-icon">▧</span>${escapeHtml(item.title)}</span></td><td>${escapeHtml(item.channel)}</td><td class="link-cell">${source ? `${escapeHtml(source.title)} · ${version}` : '—'}</td><td>${statusChip(item.status)}</td><td>${item.status === 'needs_review' ? `<button class="small-action" data-open-review="${escapeHtml(item.id)}">Review</button>` : ''}</td></tr>`;
  }).join('');
}

function findingCard(item) {
  const finding = item.finding;
  const span = finding.evidenceSpan;
  let revisedText = item.body;
  if (span?.claim && finding.result === 'conflict') {
    const at = revisedText.indexOf(span.claim);
    if (at >= 0) revisedText = `${revisedText.slice(0, at)}${finding.newValue} ${finding.newUnit || 'GB'}${revisedText.slice(at + span.claim.length)}`;
  }
  const excerpt = span ? `${escapeHtml(span.before)}<mark class="claim-highlight">${escapeHtml(span.claim)}</mark>${escapeHtml(span.after)}`
    : (finding.candidates || []).map(candidate => `<span class="candidate-claim">${escapeHtml(candidate.evidence?.before || '')}<mark class="claim-highlight">${escapeHtml(candidate.exact)}</mark>${escapeHtml(candidate.evidence?.after || '')}</span>`).join('<br>') || 'No matching claim in this text; reviewer confirmation required.';
  const sourceEvidence = finding.sourceEvidence ? `<div class="finding-source-quote"><b>Approved source evidence</b><br>“${escapeHtml(finding.sourceEvidence)}”</div>` : '';
  const aiSummary = finding.aiVerdict ? `<div class="ai-result"><b>Gemini assist: ${escapeHtml(finding.aiVerdict)}</b> · Advisory only; reviewer decides.</div>` : '';
  const suggestion = finding.suggestedFix ? `<div class="finding-suggestion"><b>Possible edit</b><br>${escapeHtml(finding.suggestedFix)}</div>` : '';
  const actions = item.status === 'needs_review' ? `<div class="finding-evidence">${escapeHtml(finding.evidenceText || '')}</div><div class="finding-source"><span class="source-chip">SOURCE v${escapeHtml(finding.sourceVersion || '')}</span>${escapeHtml(finding.sourceTitle || 'Approved source')} ${finding.newValue ? `· ${escapeHtml(finding.newValue)} ${escapeHtml(finding.newUnit || '')}` : ''}</div>${sourceEvidence}${aiSummary}${suggestion}<details class="revision-editor"><summary>Review or edit the proposed content</summary><textarea class="revised-content" rows="3" aria-label="Revised content for ${escapeHtml(item.title)}">${escapeHtml(revisedText)}</textarea><small>The saved revision is checked again against the current approved source.</small></details><textarea class="resolution-note" rows="2" placeholder="Reviewer note (required for exceptions or a manual rule decision)" aria-label="Decision note for ${escapeHtml(item.title)}"></textarea><div class="queue-actions"><button class="small-action primary" data-resolve="revise" data-content-id="${escapeHtml(item.id)}">Save revision and verify</button><button class="small-action" data-resolve="exception" data-content-id="${escapeHtml(item.id)}">Approve exception</button></div>` : `<div class="finding-evidence">${escapeHtml(finding.resolutionNote || '')}</div>`;
  const priority = finding.priority || 'Standard';
  return `<article class="queue-item"><div class="queue-top"><span class="issue-pill">${escapeHtml(finding.type || 'Needs review')}</span><span class="priority-pill ${priority === 'High priority' ? 'priority-high' : priority === 'Review soon' ? 'priority-medium' : ''}">${escapeHtml(priority)}</span><span class="review-age">${fmtDate(finding.createdAt || item.reviewedAt)}</span></div><h4>${escapeHtml(item.title)}</h4><div class="quote-box">${excerpt}</div>${actions}</article>`;
}

function renderReviewQueue() {
  const pending = pendingItems();
  const overview = $('#review-queue-body');
  const full = $('#full-review-queue');
  if (!pending.length) {
    const empty = '<div class="queue-empty"><span class="empty-check">✓</span><span><b>All clear</b><br>There are no content items waiting for review.</span></div>';
    overview.innerHTML = empty;
    full.innerHTML = `<div class="empty-panel"><strong>Nothing needs a decision</strong>When a check needs a person, the evidence will appear here.</div>`;
  } else {
    overview.innerHTML = findingCard(pending[0]);
    full.innerHTML = pending.map(findingCard).join('');
  }
}

function renderSourceLibrary() {
  const source = currentSource();
  $('#source-library-list').innerHTML = `<article class="panel source-library-card"><div class="source-card-top"><div class="source-title-group"><span class="panel-icon purple-icon">▤</span><div><h3 class="source-card-title">${escapeHtml(source.title)}</h3><div class="source-card-meta">${escapeHtml(source.category)} · Approved by Samriddha Chaudhury</div></div></div><span class="status-pill status-approved"><span></span>Approved</span></div><div class="source-fact-large"><div><small>APPROVED VALUE</small><b>${source.value} ${escapeHtml(source.unit)}</b><p>Used by ${sourceLinkedItems(source.id).length} linked ${sourceLinkedItems(source.id).length === 1 ? 'content item' : 'content items'}</p></div><span class="version-badge">VERSION ${source.version}</span></div><form id="source-update-form" class="source-update-form"><label>New approved storage value<input id="source-value-input" type="number" min="1" step="1" value="${source.value}" required></label><button class="button button-primary" type="submit">Approve source update <span>→</span></button></form></article>`;
  const history = [...source.history].reverse();
  $('#version-history').innerHTML = history.map((entry, index) => `<div class="version-row"><span class="version-badge">v${entry.version}</span><div><b>${entry.value} ${escapeHtml(entry.unit)}</b><small>${index === 0 ? 'Current approved fact' : 'Previous approved fact'}</small></div><time>${fmtDate(entry.approvedAt)}</time></div>`).join('');
  const sourceSelect = $('#content-source');
  const chosen = sourceSelect?.value;
  const approved = appState.sources.filter(item => item.status === 'approved');
  if (sourceSelect) {
    sourceSelect.innerHTML = approved.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)} · ${escapeHtml(item.category || item.kind)}</option>`).join('');
    if (approved.some(item => item.id === chosen)) sourceSelect.value = chosen;
    updateSelectedSourceHint();
  }
  const extra = $('#additional-sources');
  const query = ($('#source-search')?.value || '').trim().toLocaleLowerCase();
  const matches = item => `${item.title} ${item.category || ''} ${item.guidance || ''} ${item.value || ''} ${item.unit || ''}`.toLocaleLowerCase().includes(query);
  $('#source-library-list').classList.toggle('hidden', Boolean(query) && !matches(source));
  const matchingSources = appState.sources.filter(item => item.id !== 'pro-storage' && matches(item));
  if (extra) extra.innerHTML = matchingSources.map(item => `<article class="additional-source"><div><span class="source-chip">${escapeHtml(item.category || item.kind)}</span><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.guidance || '')}</p><small>${item.status === 'pending' ? 'Pending approval' : `Approved · version ${item.version}`}</small></div>${item.status === 'pending' ? `<button class="small-action primary" data-approve-source="${escapeHtml(item.id)}">Approve source</button>` : '<span class="status-pill status-approved"><span></span>Approved</span>'}</article>`).join('') || (query && !matches(source) ? '<div class="empty-panel">No approved source matches this search.</div>' : '');
}

function updateSelectedSourceHint() {
  const select = $('#content-source');
  const label = $('#form-current-fact');
  const source = appState?.sources?.find(item => item.id === select?.value);
  if (label) label.textContent = source ? source.kind === 'fact' || !source.kind ? `${source.value} ${source.unit}` : source.guidance : 'Choose an approved source';
}

function renderImpact() {
  const source = currentSource();
  const history = source.history || [];
  const previous = history.length > 1 ? history[history.length - 2] : history[history.length - 1];
  const hasChange = history.length > 1;
  const affected = appState.content.filter(item => item.status !== 'exception' && item.linkedSourceIds?.includes(source.id) && (item.status === 'needs_review' || (item.sourceVersions?.[source.id] || source.version) < source.version));
  $('#impact-summary-title').textContent = hasChange ? `Version ${source.version} changed from ${previous.value} to ${source.value} GB` : 'Waiting for a source change';
  $('#impact-summary-subtitle').textContent = hasChange ? 'Dante checked linked content against the newly approved source.' : 'Update the Pro plan storage fact to see Dante trace the impact.';
  $('#impact-event-status').textContent = hasChange ? 'Change detected' : 'No recent change';
  $('#impact-event-status').className = `status-pill ${hasChange ? 'status-review' : 'status-neutral'}`;
  $('#impact-old').textContent = `${previous.value} ${source.unit}`;
  $('#impact-new').textContent = `${source.value} ${source.unit}`;
  $('#impact-old-version').textContent = `Version ${previous.version}`;
  $('#impact-new-version').textContent = `Version ${source.version}`;
  const linked = appState.content.filter(item => item.linkedSourceIds?.includes(source.id));
  const sourceBlock = `<div class="dependency-source"><span class="dependency-source-icon">▤</span><div><small>APPROVED SOURCE · v${source.version}</small><b>${escapeHtml(source.title)}</b><strong>${source.value} ${escapeHtml(source.unit)}</strong></div><span class="status-pill status-approved"><span></span>Approved</span></div>`;
  const contentBlocks = linked.map(item => {
    const statusClass = item.status === 'needs_review' ? 'map-needs-review' : item.status === 'exception' ? 'map-exception' : 'map-current';
    const proof = item.finding?.candidates?.length ? 'Multiple possible claims need a reviewer to choose.'
      : item.finding?.evidenceSpan?.claim ? `Claim: ${item.finding.evidenceSpan.claim}`
        : item.latestCheck?.evidenceSpan?.claim ? `Verified claim: ${item.latestCheck.evidenceSpan.claim}`
          : item.finding?.evidenceText || (item.status === 'current' ? `Verified against v${item.sourceVersions?.[source.id] || source.version}` : 'Linked to this approved source');
    return `<div class="dependency-edge"><article class="dependency-content"><span class="dependency-doc">▧</span><div class="dependency-content-copy"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.channel)} · linked at v${escapeHtml(item.sourceVersions?.[source.id] || 1)}</small><p>${escapeHtml(proof)}</p></div>${statusChip(item.status)}</article></div>`;
  }).join('');
  $('#impact-map').innerHTML = `<div class="dependency-layout">${sourceBlock}<div class="dependency-branches"><div class="branch-caption">${linked.length} saved content ${linked.length === 1 ? 'link' : 'links'}</div>${contentBlocks || '<div class="empty-panel">No content is linked to this source.</div>'}</div></div>`;
  $('#affected-count').textContent = affected.length;
  if (!affected.length) {
    $('#affected-list').innerHTML = '<div class="queue-empty"><span class="empty-check">✓</span><span><b>No unresolved impact items</b><br>When linked content differs from a new approved fact, Dante lists it here.</span></div>';
  } else {
    $('#affected-list').innerHTML = affected.map(item => `<article class="affected-item"><span class="affected-doc">▧</span><div class="affected-main"><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.finding?.evidenceText || 'This item uses an earlier source version.')}<br><span class="source-chip">${escapeHtml(item.channel)}</span> · Previously reviewed against v${escapeHtml(item.sourceVersions?.[source.id] || 1)}</p><button class="small-action" data-open-review="${escapeHtml(item.id)}">Open review details</button></div>${statusChip(item.status)}</article>`).join('');
  }
}

function renderAudit() {
  const events = [...(appState.audit || [])].reverse().slice(0, 12);
  $('#audit-history').innerHTML = events.length ? events.map(event => {
    const label = ({ source_submitted: 'Source submitted', source_approved: 'Source approved', content_linked: 'Source linked', content_reviewed: 'Content checked', finding_created: 'Review finding', review_resolved: 'Reviewer decision', finding_auto_cleared: 'Finding cleared' })[event.type] || 'Workspace event';
    return `<article class="audit-row"><span class="audit-marker ${event.type === 'finding_created' ? 'audit-warning' : event.type === 'review_resolved' ? 'audit-decision' : ''}"></span><div><div class="audit-title">${escapeHtml(label)} <span>${fmtDate(event.at)}</span></div><p>${escapeHtml(event.details)}</p><small>${escapeHtml(event.actor)}</small></div></article>`;
  }).join('') : '<div class="empty-panel">No changes recorded yet.</div>';
}

function renderPreview(preview) {
  pendingSourceChange = { sourceId: preview.sourceId, value: preview.proposed, expectedVersion: preview.currentVersion };
  $('#preview-current').textContent = `${preview.current} ${preview.unit}`;
  $('#preview-proposed').textContent = `${preview.proposed} ${preview.unit}`;
  $('#preview-impact-count').textContent = preview.affected.length;
  $('#preview-unchanged-count').textContent = preview.unchanged.length;
  $('#preview-subtitle').textContent = `${preview.sourceTitle} · v${preview.currentVersion} · ${preview.linkedCount} linked ${preview.linkedCount === 1 ? 'item' : 'items'} checked`;
  if (!preview.items.length) {
    $('#preview-items').innerHTML = '<div class="empty-panel">No content is linked to this source yet.</div>';
  } else {
    $('#preview-items').innerHTML = preview.items.map(item => {
      const ok = item.status === 'supported';
      const quote = item.evidenceSpan
        ? `${escapeHtml(item.evidenceSpan.before)}<mark class="claim-highlight">${escapeHtml(item.evidenceSpan.claim)}</mark>${escapeHtml(item.evidenceSpan.after)}`
        : (item.candidates || []).map(candidate => `<span>${escapeHtml(candidate.evidence?.before || '')}<mark class="claim-highlight">${escapeHtml(candidate.exact)}</mark>${escapeHtml(candidate.evidence?.after || '')}</span>`).join('<br>') || 'No matching claim found.';
      return `<article class="preview-item"><span class="preview-status ${ok ? 'preview-ok' : 'preview-risk'}">${ok ? 'MATCHES' : 'REVIEW'}</span><div class="preview-item-main"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.channel)} · ${escapeHtml(item.priority)}</small><div class="preview-quote">${quote}</div><p>${escapeHtml(item.evidenceText)}</p></div></article>`;
    }).join('');
  }
  $('#impact-preview-modal').classList.remove('hidden');
}

function render() {
  if (!appState) return;
  renderStats(); renderTrendChart(); renderStatusAndFacts(); renderIntegrationStatus(); renderReviewQueue(); renderSourceLibrary(); renderAudit();
  renderContentTable('#content-table-body'); renderContentTable('#content-table-full');
  const dateText = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase();
  $('.eyebrow').textContent = dateText;
}

function showView(name) {
  activeView = name;
  $$('.view').forEach(view => view.classList.toggle('hidden', view.id !== `view-${name}`));
  $$('.nav-item').forEach(link => link.classList.toggle('active', link.dataset.view === name));
  $('#crumb-current').textContent = ({ overview: 'Overview', sources: 'Approved sources', content: 'Content review', impact: 'Change impact' })[name] || 'Overview';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function openImpactPreview(value) {
  const source = currentSource();
  const preview = await api('/api/source/preview', { sourceId: source.id, value });
  renderPreview(preview);
}

async function approveSourceChange() {
  if (!pendingSourceChange) return;
  appState = await api('/api/source/approve', pendingSourceChange);
  pendingSourceChange = null;
  $('#impact-preview-modal').classList.add('hidden');
  render();
  showToast(`Version ${currentSource().version} approved. ${pendingItems().length} item${pendingItems().length === 1 ? '' : 's'} need review.`);
}

document.addEventListener('click', async event => {
  const nav = event.target.closest('[data-view]');
  const viewLink = event.target.closest('[data-view-link]');
  const resolveButton = event.target.closest('[data-resolve]');
  const openReview = event.target.closest('[data-open-review]');
  try {
    if (nav) { event.preventDefault(); showView(nav.dataset.view); return; }
    if (viewLink) { showView(viewLink.dataset.viewLink); return; }
    if (event.target.closest('#simulate-change') || event.target.closest('#impact-update')) {
      const source = currentSource();
      await openImpactPreview(source.value === 100 ? 200 : source.value + 50);
      return;
    }
    if (event.target.closest('#preview-close') || event.target.closest('#preview-cancel')) { $('#impact-preview-modal').classList.add('hidden'); return; }
    if (event.target.closest('#preview-approve')) { await approveSourceChange(); return; }
    if (event.target.id === 'impact-preview-modal') { event.target.classList.add('hidden'); return; }
    if (event.target.closest('#reset-demo')) {
      appState = await api('/api/reset', {}); render(); showView('overview'); showToast('Demo scenario reset to the approved 100 GB fact.'); return;
    }
    const approveSourceButton = event.target.closest('[data-approve-source]');
    if (approveSourceButton) { appState = await api('/api/sources/approve', { sourceId: approveSourceButton.dataset.approveSource }); render(); showToast('Source approved and available for content review.'); return; }
    if (resolveButton) {
      const itemCard = resolveButton.closest('.queue-item');
      const note = itemCard?.querySelector('.resolution-note')?.value?.trim() || '';
      const revisedText = itemCard?.querySelector('.revised-content')?.value || '';
      if (resolveButton.dataset.resolve === 'exception' && !note) { showToast('Add a reason before approving an exception.'); return; }
      appState = await api('/api/review/resolve', { contentId: resolveButton.dataset.contentId, action: resolveButton.dataset.resolve, note, revisedText });
      render(); showToast(resolveButton.dataset.resolve === 'revise' ? 'Content revised to match the current source.' : 'Exception recorded for reviewer follow-up.'); return;
    }
    if (openReview) { showView('content'); return; }
    if (event.target.closest('[data-action="open-review"]')) showView('content');
  } catch (error) { showToast(error.message); }
});

document.addEventListener('submit', async event => {
  if (event.target.id === 'source-update-form') {
    event.preventDefault();
    const value = Number($('#source-value-input').value);
    try { await openImpactPreview(value); }
    catch (error) { showToast(error.message); }
  }
  if (event.target.id === 'content-form') {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      appState = await api('/api/content/analyze', { title: form.get('title'), channel: form.get('channel'), sourceId: form.get('sourceId'), body: form.get('body'), aiConsent: form.get('aiConsent') === 'yes' });
      render(); event.target.reset();
      const latest = appState.content[0];
      showToast(latest.status === 'needs_review' ? 'Review created with an evidence link.' : 'Content matches the current approved fact.');
    } catch (error) { showToast(error.message); }
  }
  if (event.target.id === 'source-create-form') {
    event.preventDefault();
    const form = new FormData(event.target);
    try { appState = await api('/api/sources/create', { title: form.get('title'), kind: form.get('kind'), guidance: form.get('guidance') }); render(); event.target.reset(); showToast('New source saved as pending approval.'); }
    catch (error) { showToast(error.message); }
  }
});

document.addEventListener('change', event => { if (event.target.id === 'content-source') updateSelectedSourceHint(); });
document.addEventListener('input', event => { if (event.target.id === 'source-search') renderSourceLibrary(); });

async function boot() {
  try { await authReady; [appState, integrationConfig] = await Promise.all([api('/api/state'), api('/api/config')]); render(); }
  catch (error) { document.body.innerHTML = `<main style="font:14px Segoe UI,Arial;padding:50px;color:#202334"><h1>Dante could not load</h1><p>${escapeHtml(error.message)}</p></main>`; }
}
boot();
