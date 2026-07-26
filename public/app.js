const $ = (s) => document.querySelector(s);
const state = { skills: [], filtered: [], category: 'all', treatment: 'all', query: '', catalog: null };
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
}

function loadCatalog() {
  $('#count').textContent = '读取治理中心…';
  fetch('/api/governance')
    .then((res) => res.json().then((data) => ({ res, data })))
    .then(({ res, data }) => {
      if (!res.ok || data.error) throw new Error(data.error || '读取失败');
      state.catalog = data;
      state.skills = data.skills || [];
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
  $('#modal').style.display = 'grid';
}

function closeModal() { $('#modal').style.display = 'none'; }
let toastTimer;
function toast(msg) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.style.display = 'block';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3000);
}

setup();
loadCatalog();
