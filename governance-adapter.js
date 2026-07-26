'use strict';

const { spawnSync } = require('node:child_process');

const CONTROL_CENTER_SCRIPT = '/Users/mac/Documents/插件制作工坊/plugins/skill-plugin-control-center/skills/skill-plugin-control-center/scripts/control_center.py';

const SOURCE_LAYERS = {
  'user-skills': '用户技能',
  'codex-local': 'Codex 本地技能',
  'personal-plugin-cache': '个人插件缓存',
};

function runControlCenter(command, args = []) {
  const result = spawnSync('python3', [CONTROL_CENTER_SCRIPT, '--format', 'json', command, ...args], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw new Error(`治理中心不可用：${result.error.message}`);
  if (result.status !== 0) throw new Error(`治理中心命令失败：${command}`);
  return JSON.parse(result.stdout);
}

function duplicateIndex(groups, kind) {
  const index = new Map();
  for (const group of groups || []) {
    for (const member of group.members || []) {
      const current = index.get(member.id) || [];
      current.push({ kind, key: group.key, member_count: group.members.length });
      index.set(member.id, current);
    }
  }
  return index;
}

function combineIndexes(...indexes) {
  const result = new Map();
  for (const index of indexes) for (const [id, groups] of index) result.set(id, [...(result.get(id) || []), ...groups]);
  return result;
}

function normalize(record, duplicateGroups) {
  const treatment = record.treatment || {};
  const groups = duplicateGroups.get(record.id) || [];
  return {
    stable_id: record.id,
    name: record.name,
    description: record.description || '',
    tags: record.triggers || [],
    category: treatment.category || '未分类',
    source: record.source,
    source_layer: SOURCE_LAYERS[record.source] || '未知来源',
    relative_path: record.relative_path,
    absolute_path: null,
    path_visibility: 'backend_only',
    lifecycle_status: 'discovered',
    verification_status: 'not_verified',
    treatment: {
      entry: treatment.entry || 'unknown',
      action: treatment.action || null,
      availability: treatment.availability || null,
      management_advice: treatment.management_advice || null,
      next_step: treatment.next_step || null,
      evidence: treatment.evidence || record.evidence || 'current_read',
    },
    risk_clues: record.risk_clues || {},
    evidence_level: record.evidence || 'current_read',
    duplicate: { groups, canonical_candidate: null, operation_card_ref: null },
    invocation: {
      modes: ['path', 'inject', 'local-cli'],
      direct_execution_allowed: false,
      reason: 'P2 is read-only; invocation gates are introduced in P4/P5.',
    },
  };
}

function loadGovernanceCatalog() {
  const records = runControlCenter('search', ['--query', '']);
  const treatment = runControlCenter('treatment', ['--group', 'all']);
  const duplicates = runControlCenter('duplicates');
  const groups = combineIndexes(
    duplicateIndex(duplicates.same_name, 'same_name'),
    duplicateIndex(duplicates.same_sha256, 'same_sha256'),
  );
  const skills = (records.results || []).map((record) => normalize(record, groups));
  return {
    schema_version: 'skilldeck-governance.v1',
    source_of_truth: 'skill-plugin-control-center',
    evidence: 'current_read',
    skills,
    summary: {
      skill_count: skills.length,
      treatment_total: treatment.total,
      treatment_groups: (treatment.entries || []).map(({ group, entry, count }) => ({ group, entry, count })),
      same_name_groups: (duplicates.same_name || []).length,
      same_sha256_groups: (duplicates.same_sha256 || []).length,
    },
    safety: {
      read_only: true,
      falls_back_to_legacy_scanner: false,
      exposes_absolute_paths: false,
      direct_execution_enabled: false,
    },
  };
}

module.exports = { CONTROL_CENTER_SCRIPT, loadGovernanceCatalog, normalize };

