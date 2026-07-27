const $ = (s) => document.querySelector(s);
const state = { skills: [], filtered: [], category: 'all', treatment: 'all', query: '', catalog: null, current: null, expertIds: [], view: 'skills' };
const LABEL = { pending: '待整理', dedupe: '去重处理', 'normal-gate': '普通确认门', 'strong-gate': '强确认门', ready: '可直接用', unknown: '待核验' };
const GOVERNANCE_VIEWS = new Set(['health', 'duplicates', 'creation', 'migration']);
const VIEW_META = {
  skills: { title: 'Skill 总览', note: '查看统一库存与单项治理信息' },
  health: { title: '健康与安全', note: '直接查看静态检查摘要与风险线索' },
  duplicates: { title: '重复与合并', note: '直接比较副本差异并生成合并操作卡' },
  creation: { title: '创建与路由', note: '直接生成官方创建器委托卡，不创建文件' },
  migration: { title: '迁移与隔离', note: '直接查看旧入口收敛清单与可回滚隔离规划' },
  experts: { title: '专家组合', note: '临时组合多个 Skill，并继承最高治理状态' },
  model: { title: '模型与隐私', note: '配置、测试与推荐均保留明确的外部调用确认门' },
};
const esc = (v) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function theme(value) {
  document.documentElement.dataset.theme = value;
  $('#theme-ico').textContent = value === 'light' ? '☀️' : '🌙';
  $('#theme-label').textContent = value === 'light' ? '浅色' : '深色';
  try { localStorage.setItem('skilldeck-theme', value); } catch (_) {}
}

function setup() {
  const savedTheme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  theme(savedTheme);
  $('#refresh').addEventListener('click', loadCatalog);
  $('#theme-toggle').addEventListener('click', () => theme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
  $('#search').addEventListener('input', (e) => { state.query = e.target.value; filter(); });
  $('#m-close').addEventListener('click', closeModal);
  $('#m-cancel').addEventListener('click', closeModal);
  $('#m-generate').addEventListener('click', () => requestSkillCard());
  $('#m-add-expert').addEventListener('click', addCurrentToExpert);
  $('#m-evolve').addEventListener('click', () => requestGovernancePlan('evolve'));
  $('#m-absorb').addEventListener('click', () => requestGovernancePlan('absorb'));
  $('#m-quarantine').addEventListener('click', () => requestGovernancePlan('quarantine'));
  $('#governance-refresh').addEventListener('click', loadGovernanceDashboard);
  document.querySelectorAll('[data-view]').forEach((item) => item.addEventListener('click', () => switchView(item.dataset.view)));
  $('#expert-generate').addEventListener('click', requestExpertCard);
  $('#set-save').addEventListener('click', saveModelSettings);
  $('#set-test').addEventListener('click', testModelConnection);
  $('#ai-open').addEventListener('click', openAiRecommendation);
  $('#ai-close').addEventListener('click', closeAiRecommendation);
  $('#ai-cancel').addEventListener('click', closeAiRecommendation);
  $('#ai-generate').addEventListener('click', generateAiRecommendation);
  $('#gc-close').addEventListener('click', closeGovernanceCreate);
  $('#gc-cancel').addEventListener('click', closeGovernanceCreate);
  $('#gc-generate').addEventListener('click', generateGovernanceCreateCard);
}

function switchView(view) {
  state.view = VIEW_META[view] ? view : 'skills';
  const governance = GOVERNANCE_VIEWS.has(state.view);
  $('#view-skills').hidden = state.view !== 'skills';
  $('#view-governance').hidden = !governance;
  $('#view-experts').hidden = state.view !== 'experts';
  $('#view-model').hidden = state.view !== 'model';
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === state.view));
  const meta = VIEW_META[state.view];
  $('#workspace-title').textContent = meta.title;
  $('#workspace-note').textContent = meta.note;
  if (governance) {
    $('#governance-page-title').textContent = meta.title;
    $('#governance-page-note').textContent = meta.note;
  }
  if (state.view === 'experts') renderExpertWorkbench();
  if (governance) loadGovernanceDashboard();
  if (state.view === 'model') loadModelSettings();
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
  const manageable = !s.is_system && s.source !== 'personal-plugin-cache';
  $('#m-governance-actions').hidden = !manageable;
  $('#m-management-card').hidden = true;
  $('#m-management-card').innerHTML = '';
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

function governanceCardHtml(card) {
  const selected = (card.selected || card.members || card.targets || []).map((item) => item.name || item.stable_id || item.id).filter(Boolean);
  const title = card.command === 'compare' ? '差异比较结果' : (card.action === 'quarantine' ? '可回滚隔离操作卡' : `治理操作卡：${card.action || '创建'}`);
  const result = card.command === 'compare'
    ? `比较结论：${card.result === 'identical' ? '内容 SHA 相同，可作为低风险隔离候选继续人工复核。' : '存在差异或资料不完整，不能自动合并。'}`
    : (card.confirmation_required || '本次只生成计划，未执行任何文件操作。');
  const facts = [
    card.plan_id ? `计划 ID：${card.plan_id}` : null,
    card.status ? `状态：${card.status === 'not_executed' ? '未执行' : card.status}` : null,
    selected.length ? `对象：${selected.join('、')}` : null,
    card.minimum_scope ? `最小范围：${card.minimum_scope}` : null,
    card.backup ? `备份：${card.backup}` : null,
    card.validation ? `验证：${card.validation}` : null,
    card.rollback ? `回滚：${card.rollback}` : null,
    card.router_note || null,
  ].filter(Boolean);
  return `<div class="invocation-head"><strong>${esc(title)}</strong><span class="gov-badge gov-unknown">未执行</span></div><p>${esc(result)}</p><ul>${facts.map((fact) => `<li>${esc(fact)}</li>`).join('')}</ul><p class="invocation-note">未写入技能库、未移动文件、未安装插件、未连接外部服务。下一步必须确认这张计划卡的具体 ID。</p>`;
}

function renderGovernanceCard(container, card) {
  container.innerHTML = governanceCardHtml(card);
  container.hidden = false;
}

function requestGovernancePlan(action) {
  if (!state.current) return;
  const container = $('#m-management-card');
  container.hidden = false;
  container.textContent = '正在从技能管理中心生成操作卡…';
  requestCard('/api/governance-operation-card', { action, ids: [state.current.stable_id] })
    .then((card) => renderGovernanceCard(container, card))
    .catch((error) => { container.textContent = error.message || '无法生成治理操作卡。'; });
}

function loadGovernanceDashboard() {
  $('#governance-status').textContent = '正在从技能管理中心读取健康、重复与迁移信息…';
  fetch('/api/governance-dashboard')
    .then((res) => res.json().then((data) => ({ res, data })))
    .then(({ res, data }) => {
      if (!res.ok || data.error) throw new Error(data.error || '治理中心读取失败');
      renderGovernanceDashboard(data);
      $('#governance-status').textContent = `已读取当前治理数据：${data.summary?.skill_count || 0} 个 Skill；所有操作仍为只读操作卡。`;
    })
    .catch((error) => { $('#governance-status').textContent = error.message || '治理中心当前不可读取。'; $('#governance-dashboard').innerHTML = ''; });
}

function duplicateGroupHtml(group, index) {
  const members = (group.members || []).filter((member) => member.id && member.name);
  if (members.length < 2) return '';
  const optionHtml = members.map((member) => `<option value="${esc(member.id)}">${esc(member.name)} · ${esc(member.relative_path || member.source || '')}</option>`).join('');
  const key = `dup-${index}`;
  return `<article class="duplicate-item"><div class="duplicate-head"><strong>${esc(members[0].name)} 等 ${members.length} 份副本</strong><span class="source-badge">${esc(group.kind || '重复组')}</span></div><div class="duplicate-members">${members.map((member) => `<div class="duplicate-member"><span>${esc(member.name)} · ${esc(member.source || '未知来源')}</span><code>${esc(member.id)}</code></div>`).join('')}</div><div class="governance-actions"><select id="${key}-a" class="dir-select">${optionHtml}</select><select id="${key}-b" class="dir-select">${members.map((member, memberIndex) => `<option value="${esc(member.id)}" ${memberIndex === 1 ? 'selected' : ''}>${esc(member.name)} · ${esc(member.relative_path || member.source || '')}</option>`).join('')}</select><button class="btn ghost" data-compare="${key}" type="button">比较差异</button><button class="btn danger" data-merge="${key}" type="button">生成合并操作卡</button></div><div id="${key}-card" class="governance-card" hidden></div></article>`;
}

function renderGovernanceDashboard(data) {
  const findings = data.audit?.finding_count ?? 0;
  const namedGroups = data.duplicates?.same_name || [];
  const identicalGroups = data.duplicates?.same_sha256 || [];
  const components = data.components?.components || [];
  const legacy = data.legacy || {};
  const componentHtml = components.map((item) => `<li><strong>${esc(item.name)}</strong>：${esc(item.purpose || '')}</li>`).join('');
  const duplicateHtml = namedGroups.map((group, index) => duplicateGroupHtml({ ...group, kind: '同名重复' }, index)).join('') || '<p>当前未发现同名重复组。</p>';
  const legacyHtml = (legacy.items || []).map((item) => `<li><strong>${esc(item.legacy_skill)}</strong> → ${esc(item.replacement_component)}（${esc(item.disposition)}）</li>`).join('');
  const section = state.view;
  if (section === 'health') {
    $('#governance-dashboard').innerHTML = `<section class="governance-section"><h3>健康与安全检查</h3><p>当前静态检查发现 ${esc(findings)} 项问题或风险线索。这些是文件结构线索，不等同于真实运行行为；请选择具体 Skill 后再生成优化计划。</p><div class="governance-actions"><button id="gov-show-audit" class="btn ghost" type="button">查看检查摘要</button><button id="gov-go-skills" class="btn primary" type="button">前往 Skill 总览</button></div><div id="gov-audit-card" class="governance-card" hidden></div></section>`;
    $('#gov-show-audit').addEventListener('click', () => {
      const container = $('#gov-audit-card');
      const samples = (data.audit?.findings || []).slice(0, 12).map((finding) => finding.message || finding.issue || finding.id || JSON.stringify(finding));
      container.innerHTML = `<div class="invocation-head"><strong>健康检查摘要</strong><span class="gov-badge gov-unknown">只读</span></div><p>发现 ${esc(findings)} 项静态问题或风险线索。</p><ul>${samples.length ? samples.map((sample) => `<li>${esc(sample)}</li>`).join('') : '<li>没有可展示的摘要项。</li>'}</ul><p class="invocation-note">本页不会自动修复。请在 Skill 详情中生成“优化技能”操作卡。</p>`;
      container.hidden = false;
    });
    $('#gov-go-skills').addEventListener('click', () => switchView('skills'));
    return;
  }
  if (section === 'duplicates') {
    $('#governance-dashboard').innerHTML = `<section class="governance-section"><h3>重复差异与合并</h3><p>同名重复组 ${namedGroups.length} 个；完全相同内容组 ${identicalGroups.length} 个。必须先选择两份副本，比较差异后才能生成合并操作卡；本页不会合并文件。</p><div class="duplicate-list">${duplicateHtml}</div></section>`;
    document.querySelectorAll('[data-compare]').forEach((button) => button.addEventListener('click', () => requestDuplicateAction(button.dataset.compare, 'compare')));
    document.querySelectorAll('[data-merge]').forEach((button) => button.addEventListener('click', () => requestDuplicateAction(button.dataset.merge, 'merge')));
    return;
  }
  if (section === 'creation') {
    $('#governance-dashboard').innerHTML = `<section class="governance-section"><h3>创建与路由</h3><p>先生成名称冲突检查和官方创建器委托卡。普通 Skill、调用其他 Skill 的路由 Skill、Skills-only 插件都不会在本页直接创建。</p><div class="governance-actions"><button class="btn primary" data-create-kind="skill" type="button">创建普通 Skill</button><button class="btn ghost" data-create-kind="router" type="button">创建调用其他 Skill 的 Skill</button><button class="btn ghost" data-create-kind="plugin" type="button">创建插件</button></div></section>`;
    document.querySelectorAll('[data-create-kind]').forEach((button) => button.addEventListener('click', () => openGovernanceCreate(button.dataset.createKind)));
    return;
  }
  if (section === 'migration') {
    $('#governance-dashboard').innerHTML = `<section class="governance-section"><h3>迁移与可回滚隔离</h3><p>原中心登记 ${components.length} 项内部治理组件。旧管理 Skill 的迁移清单共 ${legacy.total || 0} 项；只有确认具体计划后，才可能进入可回滚隔离。</p><h4>已吸收的治理组件</h4><ul>${componentHtml}</ul><div class="governance-actions"><button id="gov-legacy-plan" class="btn danger" type="button">生成旧管理入口隔离卡</button></div><div id="gov-legacy-card" class="governance-card" hidden></div><h4>旧入口清单</h4><ul>${legacyHtml || '<li>当前没有可展示的旧入口。</li>'}</ul></section>`;
    $('#gov-legacy-plan').addEventListener('click', () => {
      const container = $('#gov-legacy-card'); container.hidden = false; container.textContent = '正在生成旧管理入口隔离卡…';
      requestCard('/api/governance-operation-card', { action: 'legacy-quarantine' }).then((card) => renderGovernanceCard(container, card)).catch((error) => { container.textContent = error.message || '无法生成隔离卡。'; });
    });
    return;
  }
  $('#governance-dashboard').innerHTML = '<section class="governance-section"><p>未识别的治理页面。请从左栏重新选择功能。</p></section>';
}

function requestDuplicateAction(key, action) {
  const first = $(`#${key}-a`).value;
  const second = $(`#${key}-b`).value;
  const container = $(`#${key}-card`);
  if (!first || !second || first === second) { container.hidden = false; container.textContent = '请选择两份不同的 Skill 副本。'; return; }
  container.hidden = false; container.textContent = action === 'compare' ? '正在比较差异…' : '正在生成合并操作卡…';
  const endpoint = action === 'compare' ? '/api/governance-compare' : '/api/governance-operation-card';
  const body = action === 'compare' ? { ids: [first, second] } : { action: 'merge', ids: [first, second] };
  requestCard(endpoint, body).then((card) => renderGovernanceCard(container, card)).catch((error) => { container.textContent = error.message || '无法生成治理结果。'; });
}

function openGovernanceCreate(kind) {
  state.createKind = kind;
  const router = kind === 'router';
  const plugin = kind === 'plugin';
  $('#gc-title').textContent = router ? '创建调用其他 Skill 的 Skill' : (plugin ? '创建插件' : '创建普通 Skill');
  $('#gc-kind-note').textContent = router ? '最终会创建普通 Skill；其内容将承担技能组合与路由职责。' : (plugin ? '固定为 Skills-only 插件，最终委托官方 plugin-creator。' : '最终委托官方 skill-creator。');
  $('#gc-trigger-label').hidden = plugin;
  $('#gc-triggers').hidden = plugin;
  $('#gc-name').value = ''; $('#gc-purpose').value = ''; $('#gc-triggers').value = '';
  $('#gc-status').textContent = '未创建任何文件。'; $('#gc-card').hidden = true; $('#gc-card').innerHTML = '';
  $('#governance-create-modal').style.display = 'grid';
}

function closeGovernanceCreate() { $('#governance-create-modal').style.display = 'none'; }

function generateGovernanceCreateCard() {
  const router = state.createKind === 'router';
  const kind = state.createKind === 'plugin' ? 'plugin' : 'skill';
  const name = $('#gc-name').value.trim();
  const purpose = $('#gc-purpose').value.trim();
  if (!name || !purpose) { $('#gc-status').textContent = '请填写英文短横线名称和用途。'; return; }
  const triggers = $('#gc-triggers').value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
  $('#gc-generate').disabled = true; $('#gc-status').textContent = '正在进行名称冲突与目标范围预检…';
  requestCard('/api/governance-create-card', { kind, name, purpose, triggers, router })
    .then((card) => { renderGovernanceCard($('#gc-card'), card); $('#gc-status').textContent = '已生成创建操作卡；尚未创建任何文件。'; })
    .catch((error) => { $('#gc-status').textContent = error.message || '无法生成创建操作卡。'; })
    .finally(() => { $('#gc-generate').disabled = false; });
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

function loadModelSettings() {
  $('#set-hint').textContent = '正在读取本地模型状态…';
  modelRequest('/api/model-config')
    .then(renderModelStatus)
    .catch((e) => { $('#set-hint').textContent = e.message || '无法读取模型设置。'; });
}

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

function openAiRecommendation() {
  $('#ai-modal').style.display = 'grid';
  $('#ai-task').value = '';
  $('#ai-confirm').checked = false;
  $('#ai-status').textContent = '未发送任何数据。请说明本次任务并确认外发范围。';
  $('#ai-result').hidden = true;
  $('#ai-result').innerHTML = '';
}

function closeAiRecommendation() { $('#ai-modal').style.display = 'none'; }

function selectedAiMode() {
  const checked = document.querySelector('input[name="ai-mode"]:checked');
  return checked ? checked.value : 'skills';
}

function generateAiRecommendation() {
  const task = $('#ai-task').value.trim();
  if (task.length < 2) { $('#ai-status').textContent = '请先写明本次要完成的任务。'; return; }
  if (!$('#ai-confirm').checked) {
    $('#ai-status').textContent = '请先勾选确认：本次会向模型服务发送任务说明和最小技能摘要。';
    return;
  }
  $('#ai-generate').disabled = true;
  $('#ai-status').textContent = '正在请求模型建议；不会执行 Skill 或改动治理库存…';
  modelRequest('/api/model-recommendation', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, mode: selectedAiMode(), confirmed_external: true }),
  })
    .then(renderAiRecommendation)
    .catch((e) => { $('#ai-status').textContent = e.message || '无法生成建议。'; })
    .finally(() => { $('#ai-generate').disabled = false; });
}

function renderAiRecommendation(data) {
  $('#ai-status').textContent = `已取得建议：本次仅外发 ${data.outbound?.candidate_count || 0} 个候选 Skill 的最小摘要；没有执行 Skill。`;
  const items = (data.recommendations || []).map((item) => `<article class="ai-item"><div><strong>${esc(item.name)}</strong><span class="gov-badge gov-${esc(item.treatment)}">${esc(LABEL[item.treatment] || item.treatment)}</span></div><p>${esc(item.description || '')}</p><p class="ai-reason">${esc(item.reason || '')}</p><button class="btn ghost ai-open-skill" type="button" data-ai-id="${esc(item.stable_id)}">查看 Skill</button></article>`).join('');
  const expert = data.expert ? `<div class="ai-expert"><strong>${esc(data.expert.title)}</strong><p>建议作为本次临时专家组合使用，最高治理状态：<span class="gov-badge gov-${esc(data.expert.highest_treatment)}">${esc(LABEL[data.expert.highest_treatment] || data.expert.highest_treatment)}</span></p><button id="ai-add-expert" class="btn primary" type="button">加入本次专家组合</button></div>` : '';
  $('#ai-result').innerHTML = `<p class="ai-summary">${esc(data.summary || '')}</p>${items || '<p class="ai-summary">模型没有给出可用的 Skill 建议。</p>'}${expert}`;
  $('#ai-result').hidden = false;
  $('#ai-result').querySelectorAll('[data-ai-id]').forEach((button) => button.addEventListener('click', () => {
    const skill = state.skills.find((item) => item.stable_id === button.dataset.aiId);
    if (skill) { closeAiRecommendation(); openDetail(skill); }
  }));
  const addExpert = $('#ai-add-expert');
  if (addExpert) addExpert.addEventListener('click', () => {
    state.expertIds = [...new Set([...state.expertIds, ...(data.expert.skill_ids || [])])];
    closeAiRecommendation();
    switchView('experts');
    toast('已加入本次专家组合；仍按最高治理状态生成操作卡或调用卡。');
  });
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
