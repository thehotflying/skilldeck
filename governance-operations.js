'use strict';

// P8 is deliberately an operation-card bridge, never a filesystem executor.
// It accepts only stable IDs discovered from the current governance catalog and
// only forwards the control-center's fixed, read-only planning commands.
const { loadGovernanceCatalog, runControlCenter } = require('./governance-adapter');

const ACTIONS = new Set(['absorb', 'merge', 'evolve', 'quarantine']);
const CREATE_KINDS = new Set(['skill', 'plugin']);

function safety(extra = {}) {
  return {
    read_only: true,
    not_executed: true,
    local_execution_started: false,
    governance_catalog_modified: false,
    external_request_started: false,
    absolute_paths_exposed: false,
    ...extra,
  };
}

function sanitize(value, key = '') {
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (!value || typeof value !== 'object') return value;
  const hiddenKeys = new Set(['path', 'legacy_path', 'target_path', 'quarantine_root', 'official_delegate', 'absolute_path']);
  const result = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    if (hiddenKeys.has(childKey)) continue;
    result[childKey] = sanitize(childValue, childKey);
  }
  return result;
}

function normalizeIds(value) {
  const ids = Array.isArray(value) ? value : [];
  const clean = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 512))];
  if (!clean.length || clean.length !== ids.length) throw new Error('请选择当前治理库存中的 Skill。');
  return clean;
}

function currentSkills(ids) {
  const catalog = loadGovernanceCatalog();
  const byId = new Map((catalog.skills || []).map((skill) => [skill.stable_id, skill]));
  const selected = ids.map((id) => byId.get(id));
  if (selected.some((skill) => !skill)) throw new Error('所选 Skill 已不在当前治理库存中；请刷新后重试。');
  return { catalog, selected };
}

function toArgs(ids) {
  return ids.flatMap((id) => ['--id', id]);
}

function planOperation({ action, ids }) {
  if (!ACTIONS.has(action)) throw new Error('不支持的治理操作。');
  const stableIds = normalizeIds(ids);
  if (action === 'merge' ? stableIds.length !== 2 : stableIds.length !== 1) {
    throw new Error(action === 'merge' ? '合并必须明确选择两份 Skill。' : '该操作一次只能针对一份 Skill。');
  }
  const { selected } = currentSkills(stableIds);
  if (selected.some((skill) => skill.is_system || skill.source === 'personal-plugin-cache')) {
    throw new Error('官方系统 Skill 与插件缓存只能登记和观察，不能在控制台中吸收、合并、优化或隔离。');
  }
  const card = runControlCenter('plan', ['--action', action, ...toArgs(stableIds)]);
  return sanitize({
    ...card,
    selected: selected.map((skill) => ({ stable_id: skill.stable_id, name: skill.name, treatment: skill.treatment.entry, source: skill.source_layer })),
    safety: safety({ confirmation_required: true, permanent_delete_supported: false }),
  });
}

function compareSkills({ ids }) {
  const stableIds = normalizeIds(ids);
  if (stableIds.length !== 2) throw new Error('差异比较必须明确选择两份 Skill。');
  const { selected } = currentSkills(stableIds);
  const comparison = runControlCenter('compare', toArgs(stableIds));
  return sanitize({
    ...comparison,
    selected: selected.map((skill) => ({ stable_id: skill.stable_id, name: skill.name, treatment: skill.treatment.entry, source: skill.source_layer })),
    safety: safety({ skill_body_exposed: false }),
  });
}

function creationCard({ kind, name, purpose, triggers = [], router = false }) {
  if (!CREATE_KINDS.has(kind)) throw new Error('不支持的创建类型。');
  const cleanName = String(name || '').trim();
  const cleanPurpose = String(purpose || '').trim();
  if (cleanName.length > 80 || cleanPurpose.length > 1000) throw new Error('名称或用途过长。');
  const cleanTriggers = Array.isArray(triggers) ? triggers.filter((item) => typeof item === 'string' && item.trim()).slice(0, 3) : [];
  const command = kind === 'skill' ? 'create-skill-plan' : 'create-plugin-plan';
  const args = ['--name', cleanName, '--purpose', cleanPurpose];
  if (kind === 'skill') for (const trigger of cleanTriggers) args.push('--trigger', trigger.trim());
  const card = runControlCenter(command, args);
  return sanitize({
    ...card,
    request_role: router ? 'router-skill' : kind,
    router_note: router ? '这是一个普通 Skill 的创建预检；后续内容将设计为调用、组合或路由其他 Skill，最终创建仍委托官方 skill-creator。' : null,
    safety: safety({ official_delegate_only: true, confirmation_required: true }),
  });
}

function legacyQuarantineCard() {
  return sanitize({
    ...runControlCenter('quarantine-legacy-plan'),
    safety: safety({ confirmation_required: true, permanent_delete_supported: false }),
  });
}

function dashboard() {
  const catalog = loadGovernanceCatalog();
  const audit = runControlCenter('audit');
  const duplicates = runControlCenter('duplicates');
  const components = runControlCenter('components');
  const legacy = runControlCenter('legacy-management');
  return sanitize({
    evidence: 'current_read',
    summary: catalog.summary,
    audit,
    duplicates: {
      same_name: duplicates.same_name || [],
      same_sha256: duplicates.same_sha256 || [],
    },
    components,
    legacy,
    safety: safety({ source_of_truth: catalog.source_of_truth }),
  });
}

module.exports = { planOperation, compareSkills, creationCard, legacyQuarantineCard, dashboard };
