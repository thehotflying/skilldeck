'use strict';

// P10 is a read-only planning layer. It obtains every Skill from the existing
// governance catalog and every plugin row from the control center's fixed
// `inventory` command. It never accepts a filesystem path or runs an executor.
const crypto = require('node:crypto');
const { loadGovernanceCatalog, runControlCenter } = require('./governance-adapter');

const TREATMENT_RANK = { ready: 1, 'normal-gate': 2, 'strong-gate': 3, pending: 4, dedupe: 4, unknown: 4 };
const SCENES = Object.freeze([
  {
    id: 'ppt', title: 'PPT 工作台',
    description: '从资料、结构、数据和视觉能力中挑选可审阅的演示文稿工作组合。',
    categories: ['视觉与设计', '数据与办公', '写作与内容', '文档与知识'],
    keywords: ['ppt', 'slide', '演示', 'presentation', '图表', '图示', 'deck'],
    roles: ['资料与结构', '内容撰写', '图表与视觉', '审阅与交付'],
  },
  {
    id: 'writing', title: '文档写作工作台',
    description: '从写作、编辑、文档和审阅能力中挑选可审阅的内容生产组合。',
    categories: ['写作与内容', '文档与知识', '产品与经营'],
    keywords: ['write', 'writing', 'article', 'content', '文档', '写作', '编辑', '报告', 'markdown'],
    roles: ['需求澄清', '起草与改写', '事实与格式复核', '交付整理'],
  },
  {
    id: 'research', title: '信息收集工作台',
    description: '从研究、检索、资料整理和总结能力中挑选可确认的信息收集组合。',
    categories: ['研究与信息搜索', '文档与知识', '决策与顾问'],
    keywords: ['research', 'search', 'information', 'web', '信息', '研究', '检索', '资料', '搜索', '摘要'],
    roles: ['检索范围', '资料获取', '证据整理', '结论复核'],
  },
]);

const PLUGIN_CHANGE_TYPES = Object.freeze(['add', 'replace', 'merge', 'split', 'evolve', 'rollback']);

function safety(extra = {}) {
  return {
    read_only: true,
    not_executed: true,
    local_execution_started: false,
    governance_catalog_modified: false,
    external_request_started: false,
    absolute_paths_exposed: false,
    confirmation_required: true,
    ...extra,
  };
}

function planId(prefix, payload) {
  return `${prefix}-${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 12)}`;
}

function publicSkill(skill) {
  return {
    stable_id: skill.stable_id,
    name: skill.name,
    description: skill.one_line || skill.description || '（无说明）',
    category: skill.category || '未分类',
    treatment: skill.treatment?.entry || 'unknown',
    source: skill.source_layer || '未知来源',
    risk_types: Object.keys(skill.risk_clues || {}).filter((key) => (skill.risk_clues || {})[key]),
    duplicate_groups: skill.duplicate?.groups || [],
    is_system: Boolean(skill.is_system),
    is_plugin_cache: skill.source === 'personal-plugin-cache',
  };
}

function catalogSkills(ids) {
  const catalog = loadGovernanceCatalog();
  const byId = new Map((catalog.skills || []).map((skill) => [skill.stable_id, skill]));
  const requested = Array.isArray(ids) ? [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 512))] : [];
  const selected = requested.map((id) => byId.get(id));
  if (selected.length !== requested.length || selected.some((skill) => !skill)) throw new Error('所选 Skill 已不在当前治理库存中；请刷新后重试。');
  return { catalog, selected, byId };
}

function rankTreatment(skills) {
  return skills.reduce((highest, skill) => {
    const entry = skill.treatment?.entry || 'unknown';
    return (TREATMENT_RANK[entry] || 4) > (TREATMENT_RANK[highest] || 0) ? entry : highest;
  }, 'ready');
}

function textOf(skill) {
  return `${skill.name || ''} ${skill.one_line || ''} ${skill.description || ''} ${(skill.tags || []).join(' ')}`.toLowerCase();
}

function sceneScore(scene, skill) {
  const text = textOf(skill);
  const categoryScore = scene.categories.includes(skill.category) ? 4 : 0;
  const keywordScore = scene.keywords.reduce((total, keyword) => total + (text.includes(keyword.toLowerCase()) ? 2 : 0), 0);
  const duplicatePenalty = (skill.duplicate?.groups || []).length ? 1 : 0;
  const riskPenalty = (TREATMENT_RANK[skill.treatment?.entry || 'unknown'] || 4) - 1;
  return categoryScore + keywordScore - duplicatePenalty - riskPenalty * 0.1;
}

function sceneCatalog(sceneId) {
  const scene = SCENES.find((item) => item.id === sceneId);
  if (!scene) throw new Error('未识别的场景工作台。');
  const catalog = loadGovernanceCatalog();
  const candidates = (catalog.skills || [])
    .map((skill) => ({ skill, score: sceneScore(scene, skill) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name))
    .slice(0, 24)
    .map(({ skill, score }) => ({ ...publicSkill(skill), score }));
  const suggested = candidates.slice(0, 6);
  return {
    evidence: 'current_read',
    scene: { id: scene.id, title: scene.title, description: scene.description, roles: scene.roles },
    candidates,
    suggested,
    highest_treatment: rankTreatment(suggested.map((item) => ({ treatment: { entry: item.treatment } }))),
    safety: safety({ source_of_truth: catalog.source_of_truth, no_natural_language_auto_trigger: true }),
  };
}

function scenePlan({ sceneId, ids }) {
  const scene = SCENES.find((item) => item.id === sceneId);
  if (!scene) throw new Error('未识别的场景工作台。');
  const { catalog, selected } = catalogSkills(ids);
  if (!selected.length || selected.length > 12) throw new Error('场景方案需要选择 1 至 12 个当前 Skill。');
  const members = selected.map(publicSkill);
  const highest = rankTreatment(selected);
  return {
    command: 'scene-plan',
    plan_id: planId('scene', { sceneId, ids: members.map((item) => item.stable_id) }),
    status: 'not_executed',
    scene: { id: scene.id, title: scene.title, roles: scene.roles },
    selected: members,
    suggested_sequence: scene.roles.map((role, index) => ({ order: index + 1, role, member: members[index % members.length].name })),
    highest_treatment: highest,
    call_boundary: highest === 'ready' ? '只生成路径式调用指引，未执行。' : '先显示风险与最小执行范围；未执行。',
    validation: ['新会话发现所选 Skill', '确认风险门不被绕过', '确认没有发生未授权写入、联网或自动化'],
    rollback: '当前未执行任何变更，无需回滚；未来若保存场景模板，需提供单独删除与恢复记录。',
    safety: safety({ source_of_truth: catalog.source_of_truth, no_natural_language_auto_trigger: true }),
  };
}

function roleFor(skill) {
  const text = textOf(skill);
  if (/research|search|信息|研究|检索|资料/.test(text)) return '资料与研究';
  if (/write|article|content|写作|编辑|文档/.test(text)) return '内容与文档';
  if (/image|visual|design|图|slide|ppt|视觉/.test(text)) return '视觉与呈现';
  if (/review|audit|check|审阅|检查|治理/.test(text)) return '审阅与治理';
  return '专用能力';
}

function assemblyAnalysis(ids) {
  const { catalog, selected } = catalogSkills(ids);
  if (selected.length < 2 || selected.length > 12) throw new Error('插件装配需要选择 2 至 12 个当前 Skill。');
  const members = selected.map(publicSkill);
  const roleGroups = new Map();
  for (const member of members) {
    const role = roleFor(member);
    roleGroups.set(role, [...(roleGroups.get(role) || []), member.name]);
  }
  const duplicates = members.flatMap((member) => (member.duplicate_groups || []).map((group) => ({ skill: member.name, kind: group.kind, member_count: group.member_count })));
  const risk = members.filter((member) => member.risk_types.length).map((member) => ({ skill: member.name, clues: member.risk_types, treatment: member.treatment }));
  const referenceOnly = members.filter((member) => member.is_system || member.is_plugin_cache).map((member) => member.name);
  return {
    evidence: 'current_read',
    selected: members,
    suggested_responsibilities: [...roleGroups.entries()].map(([role, names]) => ({ role, skills: names })),
    duplicate_clues: duplicates,
    static_risk_clues: risk,
    dependency_status: 'unknown_static_only',
    dependency_note: '当前只根据风险线索与重复关系提示人工复核；没有执行依赖解析或复制。',
    reference_only_members: referenceOnly,
    highest_treatment: rankTreatment(selected),
    safety: safety({ source_of_truth: catalog.source_of_truth, migration_started: false }),
  };
}

function pluginAssemblyPlan({ name, purpose, ids }) {
  const cleanName = String(name || '').trim();
  const cleanPurpose = String(purpose || '').trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanName) || cleanName.length > 64) throw new Error('插件名称必须是 1 至 64 位英文短横线名称。');
  if (!cleanPurpose || cleanPurpose.length > 1000) throw new Error('请说明插件用途（不超过 1000 字）。');
  const analysis = assemblyAnalysis(ids);
  return {
    command: 'plugin-assembly-plan',
    plan_id: planId('assembly', { name: cleanName, purpose: cleanPurpose, ids: analysis.selected.map((item) => item.stable_id) }),
    status: 'not_executed',
    plugin: { name: cleanName, purpose: cleanPurpose, intended_entry: cleanName, kind: 'Skills-only' },
    selected: analysis.selected,
    suggested_subskills: analysis.suggested_responsibilities,
    duplicate_clues: analysis.duplicate_clues,
    dependency_status: analysis.dependency_status,
    dependency_note: analysis.dependency_note,
    static_risk_clues: analysis.static_risk_clues,
    reference_only_members: analysis.reference_only_members,
    tests: ['官方 plugin-creator 格式校验', '每个迁入 Skill 的元数据与触发检查', '新会话发现测试', '风险门与操作卡回归测试'],
    backup: '执行前为每个来源 Skill 和目标插件 manifest 记录 SHA-256，并建立恢复 manifest。',
    rollback: '若后续用户确认真实迁移，按恢复 manifest 还原到迁移前 SHA-256；当前没有任何文件变更。',
    execution_gate: '必须由用户确认此 plan_id，随后才可委托官方 plugin-creator 并逐项迁移。',
    safety: safety({ migration_started: false, official_delegate_only: true, permanent_delete_supported: false }),
  };
}

function parseInstalledPlugins() {
  const inventory = runControlCenter('inventory');
  const stdout = String((inventory.plugin_commands || []).find((item) => item.status === 'ok')?.stdout || '');
  let marketplace = '';
  const plugins = [];
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    const market = line.match(/^Marketplace `([^`]+)`$/);
    if (market) { marketplace = market[1]; continue; }
    if (!line || line.startsWith('PLUGIN ') || line.startsWith('/')) continue;
    const cells = line.split(/\s{2,}/);
    if (cells.length < 3 || !cells[0].includes('@')) continue;
    const [plugin_id, status, version = '未提供'] = cells;
    if (!status.startsWith('installed')) continue;
    const [name] = plugin_id.split('@');
    plugins.push({ plugin_id, name, marketplace, status, version });
  }
  return plugins;
}

function pluginComposition(plugin, catalog) {
  const prefix = `${plugin.name}/`;
  const members = (catalog.skills || []).filter((skill) => skill.source === 'personal-plugin-cache' && String(skill.relative_path || '').startsWith(prefix));
  return members.map(publicSkill);
}

function myPlugins() {
  const catalog = loadGovernanceCatalog();
  const plugins = parseInstalledPlugins().map((plugin) => {
    const members = pluginComposition(plugin, catalog);
    return {
      ...plugin,
      composition: members.map((member) => ({ name: member.name, treatment: member.treatment, risk_types: member.risk_types })),
      composition_evidence: members.length ? 'personal_plugin_cache_current_read' : 'not_observed_in_personal_plugin_cache',
      highest_treatment: members.length ? rankTreatment(members.map((member) => ({ treatment: { entry: member.treatment } }))) : 'unknown',
    };
  });
  return {
    evidence: 'current_read',
    plugins,
    safety: safety({ source_of_truth: catalog.source_of_truth, plugin_files_modified: false }),
  };
}

function pluginChangePlan({ action, pluginId, ids = [], name = '', purpose = '' }) {
  if (!PLUGIN_CHANGE_TYPES.includes(action)) throw new Error('不支持的插件变更类型。');
  const plugins = myPlugins().plugins;
  const current = pluginId ? plugins.find((plugin) => plugin.plugin_id === pluginId) : null;
  if (action !== 'add' && !current) throw new Error('请选择当前可发现的已安装插件。');
  const selected = ids.length ? assemblyAnalysis(ids) : null;
  const cleanName = String(name || '').trim();
  const cleanPurpose = String(purpose || '').trim();
  if (action === 'add' && (!cleanName || !cleanPurpose)) throw new Error('新增插件计划需要名称和用途。');
  const subject = current || { plugin_id: cleanName, name: cleanName, marketplace: '待用户选择', status: 'not_created', version: '未创建' };
  return {
    command: 'plugin-change-plan',
    plan_id: planId('plugin', { action, plugin: subject.plugin_id, ids: selected?.selected.map((item) => item.stable_id) || [], name: cleanName, purpose: cleanPurpose }),
    status: 'not_executed',
    action,
    plugin: subject,
    selected_skills: selected?.selected || [],
    assembly_analysis: selected ? {
      suggested_responsibilities: selected.suggested_responsibilities,
      duplicate_clues: selected.duplicate_clues,
      static_risk_clues: selected.static_risk_clues,
      dependency_status: selected.dependency_status,
      reference_only_members: selected.reference_only_members,
    } : null,
    proposal: cleanPurpose || `为 ${subject.name} 生成 ${action} 变更方案。`,
    backup: '真实变更前需要记录插件 manifest、可见版本、受影响 Skill SHA-256，并创建恢复 manifest。',
    validation: ['官方插件格式校验', '插件缓存重新安装', '新会话发现与菜单回归', '确认风险门未被绕过'],
    rollback: '当前没有修改。真实变更只能按恢复 manifest 回滚，不能使用永久删除作为默认操作。',
    execution_gate: '必须确认这一张具体计划卡，且明确范围、备份、验证和回滚后才能实施。',
    safety: safety({ plugin_files_modified: false, plugin_installation_started: false, permanent_delete_supported: false }),
  };
}

module.exports = { SCENES, sceneCatalog, scenePlan, assemblyAnalysis, pluginAssemblyPlan, myPlugins, pluginChangePlan };
