const $ = (s) => document.querySelector(s);
const state = { skills: [], filtered: [], category: 'all', treatment: 'all', query: '', catalog: null, current: null, expertIds: [], view: 'skills' };
const LABEL = { pending: '待整理', dedupe: '去重处理', 'normal-gate': '普通确认门', 'strong-gate': '强确认门', ready: '可直接用', unknown: '待核验' };
const esc = (v) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function theme(value) {
  document.documentElement.dataset.theme = value;
  $('#theme-ico').textContent = value === 'light' ? '☀️' : '🌙';
  $('#theme-label').textContent = value === 'light' ? '浅色' : '深色';
}

function setup() {
  theme('dark');
  $('#refresh').addEventListener('click', loadCatalog);
  $('#search').addEventListener('input', (e) => { state.query = e.target.value; filter(); });
  $('#m-close').addEventListener('click', closeModal);
  $('#m-cancel').addEventListener('click', closeModal);
  $('#m-generate').addEventListener('click', () => requestSkillCard());
  $('#m-add-expert').addEventListener('click', addCurrentToExpert);
  $('#experts-tab').addEventListener('click', () => switchView('experts'));
  document.querySelector('[data-view="skills"]').addEventListener('click', () => switchView('skills'));
  $('#expert-generate').addEventListener('click', requestExpertCard);
  $('#set-open').addEventListener('click', openModelSettings);
  $('#set-close').addEventListener('click', closeModelSettings);
  $('#set-cancel').addEventListener('click', closeModelSettings);
  $('#set-save').addEventListener('click', saveModelSettings);
  $('#set-test').addEventListener('click', testModelConnection);
}

function switchView(view) {
  state.view = view;
  $('#view-skills').hidden = view !== 'skills';
  $('#view-experts').hidden = view !== 'experts';
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view || (item.id === 'experts-tab' && view === 'experts')));
  if (view === 'experts') renderExpertWorkbench();
}

function loadCatalog() {
  $('#count').textContent = '读取治理中心…';
  fetch('/api/governance')
    .then((res) => res.json().then((data) => ({ res, data })))
    .then(({ res, data }) => {
      if (!res.ok || data.error) throw new Error(data.error || '读取失败');
      state.catalog = data;
      state.skills = data.skills || [];
      updateExpertCount();
      renderBanner();
      renderFilters();
      filter();
    })
    .catch((e) => {
      state.catalog = null;
      state.skills = [];
      $('#grid').innerHTML = '';
      $('#governance-banner').innerHTML = '<strong>治理中心暂不可读取</strong><span>为避免显示两套不一致的库存，页面没有退回旧目录扫描。</span>';
      $('#empty').style.display = 'block';
      $('#empty').textContent = e.message || '未知错误';
      $('#count').textContent = '';
      renderFilters();
    });
}

function renderBanner() {
  const c = state.catalog;
  const groups = (c.summary.treatment_groups || []).map((g) => `<span class="gov-count">${esc(LABEL[g.entry] || g.entry)} ${g.count}</span>`).join('');
  $('#governance-banner').innerHTML = `<div><strong>治理中心统一库存</strong><span>只读 · ${esc(c.source_of_truth)} · 当前读取</span></div><div class="gov-summary">${groups}<span class="gov-count">同名重复组 ${c.summary.same_name_groups}</span></div>`;
}

function renderFilters() {
  const cats = ['all', ...new Set(state.skills.map((x) => x.category || '未分类'))];
  $('#cats').innerHTML = cats.map((x) => `<button class="cat ${x === state.category ? 'active' : ''}" data-category="${esc(x)}">${esc(x === 'all' ? '全部分类' : x)}</button>`).join('');
  $('#cats').querySelectorAll('[data-category]').forEach((b) => b.addEventListener('click', () => { state.category = b.dataset.category; renderFilters(); filter(); }));
  const entries = ['all', ...new Set(state.skills.map((x) => x.treatment?.entry || 'unknown'))];
  $('#treatment-filters').innerHTML = entries.map((x) => `<button class="cat ${x === state.treatment ? 'active' : ''}" data-treatment="${esc(x)}">${esc(x === 'all' ? '全部治理状态' : (LABEL[x] || x))}</button>`).join('');
  $('#treatment-filters').querySelectorAll('[data-treatment]').forEach((b) => b.addEventListener('click', () => { state.treatment = b.dataset.treatment; renderFilters(); filter(); }));
}

function risk(skill) {
  const clues = Object.entries(skill.risk_clues || {}).filter(([, value]) => value).map(([key]) => key);
  return clues.length ? `风险线索：${clues.join('、')}` : '未发现静态风险线索';
}

function filter() {
  const q = state.query.trim().toLowerCase();
  state.filtered = state.skills.filter((s) => {
    const text = `${s.name} ${s.description} ${(s.tags || []).join(' ')}`.toLowerCase();
    return (state.category === 'all' || s.category === state.category)
      && (state.treatment === 'all' || s.treatment?.entry === state.treatment)
      && (!q || text.includes(q));
  });
  $('#count').textContent = `显示 ${state.filtered.length} / ${state.skills.length} 个 Skill`;
  $('#empty').style.display = state.filtered.length ? 'none' : 'block';
  if (!state.filtered.length) $('#empty').textContent = '没有符合当前筛选条件的 Skill。';
  renderGrid();
}

function renderGrid() {
  $('#grid').innerHTML = state.filtered.map((s, i) => {
    const entry = s.treatment?.entry || 'unknown';
    return `<article class="card"><div class="card-top"><div class="card-name">${esc(s.name)}</div><span class="card-cat">${esc(s.category)}</span></div><div class="card-desc">${esc(s.one_line || s.description || '（无描述）')}</div><div class="card-badges"><span class="gov-badge gov-${esc(entry)}">${esc(LABEL[entry] || entry)}</span><span class="source-badge">${esc(s.source_layer)}</span></div><div class="card-risk">${esc(risk(s))}</div><div class="card-foot"><span class="card-folder">${esc(s.relative_path)}</span><button class="use-btn" data-index="${i}">查看</button></div></article>`;
  }).join('');
  $('#grid').querySelectorAll('.use-btn').forEach((b) => b.addEventListener('click', () => openDetail(state.filtered[Number(b.dataset.index)])));
}

function openDetail(s) {
  state.current = s;
  const entry = s.treatment?.entry || 'unknown';
  const groups = s.duplicate?.groups || [];
  $('#m-name').textContent = s.name;
  $('#m-cat').textContent = `${s.category} · ${LABEL[entry] || entry}`;
  $('#m-desc').textContent = s.description || '（无描述）';
  const rows = [
    ['来源', s.source_layer], ['相对位置', s.relative_path], ['唯一编号', s.stable_id], ['风险线索', risk(s)],
    ['重复关系', groups.length ? `${groups.length} 组；${groups.map((g) => `${g.kind}（${g.member_count} 项）`).join('、')}` : '未发现同名或同内容重复组'],
    ['处理建议', s.treatment?.management_advice || '等待治理证据'],
    ['下一步', s.treatment?.next_step || '仅查看；调用与变更操作将在后续安全阶段接入'],
  ];
  $('#m-meta').innerHTML = rows.map(([k, v]) => `<div class="detail-row"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');
  $('#m-task').value = '';
  $('#m-confirm').checked = false;
  $('#m-confirm-wrap').hidden = entry !== 'normal-gate';
  $('#m-card').hidden = true;
  $('#m-card').innerHTML = '';
  $('#m-generate').textContent = entry === 'strong-gate' || entry === 'pending' || entry === 'dedupe' ? '生成操作卡' : '生成调用卡';
  $('#m-add-expert').textContent = state.expertIds.includes(s.stable_id) ? '已加入专家组合' : '加入专家组合';
  $('#modal').style.display = 'grid';
}

function closeModal() { $('#modal').style.display = 'none'; }

function requestCard(url, body) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then((res) => res.json().then((data) => ({ res, data })))
    .then(({ res, data }) => {
      if (!res.ok || data.error) throw new Error(data.error || '生成操作卡失败');
      return data;
    });
}

function requestSkillCard() {
  if (!state.current) return;
  const body = { skill_id: state.current.stable_id, task: $('#m-task').value.trim(), confirmed: $('#m-confirm').checked };
  $('#m-generate').disabled = true;
  requestCard('/api/invocation-card', body)
    .then((card) => renderInvocationCard($('#m-card'), card))
    .catch((e) => toast(e.message || '生成失败'))
    .finally(() => { $('#m-generate').disabled = false; });
}

function copyText(text) {
  if (!navigator.clipboard || !navigator.clipboard.writeText) return Promise.resolve(false);
  return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
}

function renderInvocationCard(container, card) {
  const isInstruction = card.kind === 'path-instruction';
  const detail = isInstruction
    ? `<pre class="modal-cmd">${esc(card.instruction)}</pre><button class="btn primary copy-card" type="button">复制调用指令</button>`
    : `<div class="card-summary">${esc(card.required_next_step || card.confirmation_text || '')}</div>`;
  container.innerHTML = `<div class="invocation-head"><strong>${esc(card.title || '操作卡')}</strong><span class="gov-badge gov-${esc(card.treatment || 'unknown')}">${esc(card.treatment_label || '待核验')}</span></div><p>${esc(card.summary || '')}</p>${detail}<p class="invocation-note">此卡没有执行 Skill、没有发送外部请求、没有写入技能库；${card.safety?.confirmation_persisted === false ? '页面确认也不会被保存。' : ''}</p>`;
  container.hidden = false;
  const button = container.querySelector('.copy-card');
  if (button) button.addEventListener('click', () => copyText(card.instruction).then((ok) => toast(ok ? '调用指令已复制；请由你发送到 Codex 对话。' : '复制失败，请手动复制指令。')));
}

function expertSkills() { return state.expertIds.map((id) => state.skills.find((skill) => skill.stable_id === id)).filter(Boolean); }

function highestEntry(skills) {
  const rank = { pending: 4, dedupe: 4, unknown: 4, 'strong-gate': 3, 'normal-gate': 2, ready: 1 };
  return skills.map((skill) => skill.treatment?.entry || 'unknown').sort((a, b) => rank[b] - rank[a])[0] || 'unknown';
}

function addCurrentToExpert() {
  if (!state.current) return;
  if (!state.expertIds.includes(state.current.stable_id)) state.expertIds.push(state.current.stable_id);
  $('#m-add-expert').textContent = '已加入专家组合';
  updateExpertCount();
  toast('已加入本次专家组合；未保存到任何库存。');
}

function updateExpertCount() {
  $('#expert-selected-count').textContent = state.expertIds.length ? `(${state.expertIds.length})` : '';
}

function renderExpertWorkbench() {
  const skills = expertSkills();
  const entry = highestEntry(skills);
  updateExpertCount();
  $('#expert-members').innerHTML = skills.length
    ? skills.map((skill) => `<span class="expert-member">${esc(skill.name)} <button type="button" data-remove-id="${esc(skill.stable_id)}" aria-label="移除 ${esc(skill.name)}">×</button></span>`).join('')
    : '<div class="expert-empty">还没有成员。打开任意 Skill 的详情后，选择“加入专家组合”。</div>';
  $('#expert-members').querySelectorAll('[data-remove-id]').forEach((button) => button.addEventListener('click', () => {
    state.expertIds = state.expertIds.filter((id) => id !== button.dataset.removeId);
    renderExpertWorkbench();
  }));
  if (!skills.length) {
    $('#expert-status').textContent = '尚未形成专家组合。';
    $('#expert-confirm-wrap').hidden = true;
    $('#expert-card').hidden = true;
    return;
  }
  $('#expert-status').innerHTML = `组合最高治理状态：<span class="gov-badge gov-${esc(entry)}">${esc(LABEL[entry] || entry)}</span>。所有成员均按这个最高等级处理。`;
  $('#expert-confirm-wrap').hidden = entry !== 'normal-gate';
  $('#expert-confirm').checked = false;
  $('#expert-card').hidden = true;
}

function requestExpertCard() {
  const skills = expertSkills();
  if (!skills.length) { toast('请先加入至少一个 Skill。'); return; }
  $('#expert-generate').disabled = true;
  requestCard('/api/expert-card', { skill_ids: skills.map((skill) => skill.stable_id), task: $('#expert-task').value.trim(), confirmed: $('#expert-confirm').checked })
    .then((card) => renderInvocationCard($('#expert-card'), card))
    .catch((e) => toast(e.message || '生成失败'))
    .finally(() => { $('#expert-generate').disabled = false; });
}

function modelRequest(url, options) {
  return fetch(url, options).then((res) => res.json().then((data) => ({ res, data }))).then(({ res, data }) => {
    if (!res.ok || data.error) throw new Error(data.error || '模型设置请求失败');
    return data;
  });
}

function renderModelStatus(config) {
  $('#set-provider').value = config.provider_id || 'default';
  $('#set-url').value = config.base_url || '';
  $('#set-model').value = config.model || '';
  $('#set-key').value = '';
  $('#set-test-confirm').checked = false;
  const detail = config.has_keychain_secret ? '密钥已安全保存在 macOS 钥匙串。' : '尚未保存密钥。';
  $('#set-hint').textContent = `${detail} 目前仅允许“推荐、分类与摘要”；不发送完整 Skill 正文或内部资料。`;
  const warning = $('#set-legacy-warning');
  if (config.legacy_plaintext_key_detected) {
    warning.hidden = false;
    warning.textContent = '发现旧版明文密钥字段：本版本不会读取或使用它。请重新输入密钥后保存，系统会仅保留不含密钥的元数据。';
  } else {
    warning.hidden = true;
    warning.textContent = '';
  }
}

function openModelSettings() {
  $('#set-modal').style.display = 'grid';
  $('#set-hint').textContent = '正在读取本地模型状态…';
  modelRequest('/api/model-config')
    .then(renderModelStatus)
    .catch((e) => { $('#set-hint').textContent = e.message || '无法读取模型设置。'; });
}

function closeModelSettings() { $('#set-modal').style.display = 'none'; }

function saveModelSettings() {
  const payload = {
    provider_id: $('#set-provider').value.trim(),
    base_url: $('#set-url').value.trim(),
    model: $('#set-model').value.trim(),
    api_key: $('#set-key').value,
  };
  $('#set-save').disabled = true;
  $('#set-hint').textContent = '正在保存本地元数据；密钥不会写入项目文件。';
  modelRequest('/api/model-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    .then((data) => { renderModelStatus(data); toast('模型设置已保存；没有发起外部请求。'); })
    .catch((e) => { $('#set-hint').textContent = e.message || '保存失败。'; })
    .finally(() => { $('#set-save').disabled = false; });
}

function testModelConnection() {
  if (!$('#set-test-confirm').checked) {
    $('#set-hint').textContent = '请先勾选确认：测试将访问模型提供商，但不会发送 Skill 或机构资料。';
    return;
  }
  $('#set-test').disabled = true;
  $('#set-hint').textContent = '正在访问模型提供商的元数据端点…';
  modelRequest('/api/model-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed_external: true }) })
    .then((data) => { $('#set-hint').textContent = `连接成功（HTTP ${data.status}）；没有发送 Skill 或机构资料。`; })
    .catch((e) => { $('#set-hint').textContent = e.message || '连接测试失败。'; })
    .finally(() => { $('#set-test').disabled = false; });
}

let toastTimer;
function toast(msg) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.style.display = 'block';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3000);
}

setup();
loadCatalog();
