'use strict';

/**
 * Read-only adapter from the authoritative skill-plugin-control-center output
 * to the SkillDeck vNext frontend contract.
 *
 * This module deliberately does not scan a directory itself. A failed
 * governance read is returned as an error; it must never silently fall back to
 * SkillDeck's old ~/.claude/skills inventory.
 */

const { spawnSync } = require('node:child_process');

const CONTROL_CENTER_SCRIPT =
  '/Users/mac/Documents/插件制作工坊/plugins/skill-plugin-control-center/skills/' +
  'skill-plugin-control-center/scripts/control_center.py';

const SOURCE_LAYERS = {
  'user-skills': '用户技能',
  'codex-local': 'Codex 本地技能',
  'personal-plugin-cache': '个人插件缓存',
};

const TREATMENT_TO_ENTRY = {
  补齐元数据: '待整理',
  去重决策: '去重处理',
  加使用确认: '普通确认门',
  强确认门: '强确认门',
  保留为常用: '可直接用',
};

function runControlCenter(command, args = []) {
  const result = spawnSync('python3', [CONTROL_CENTER_SCRIPT, '--format', 'json', command, ...args], {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw new Error(`治理中心不可用：${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`治理中心命令失败（${command}）：${(result.stderr || '').trim() || `exit ${result.status}`}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`治理中心返回不是有效 JSON（${command}）：${error.message}`);
  }
}

function sourceLayer(source) {
  return SOURCE_LAYERS[source] || source || '未知来源';
}

function buildDuplicateIndex(duplicates) {
  const index = new Map();
  const add = (kind, groups) => {
    for (const group of groups || []) {
      const groupId = `${kind}:${group.key}`;
      for (const member of group.members || []) {
        const current = index.get(member.id) || { groups: [] };
        current.groups.push({
          group_id: groupId,
          kind,
          key: group.key,
          size: (group.members || []).length,
          member_count: (group.members || []).length,
        });
        index.set(member.id, current);
      }
    }
  };
  add('same_name', duplicates.same_name);
  add('same_sha256', duplicates.same_sha256);
  return index;
}

function normalizeRecord(record, treatmentById, duplicateIndex) {
  const treatment = treatmentById.get(record.id) || null;
  const treatmentEntry = treatment ? TREATMENT_TO_ENTRY[treatment.action] || 'unknown' : 'unknown';
  const duplicates = duplicateIndex.get(record.id) || { groups: [] };
  const hasDuplicate = duplicates.groups.some((group) => group.kind === 'same_name');
  return {
    stable_id: record.id,
    name: record.name,
    description: record.description || '',
    oneLine: (record.description || '（无描述）').split(/。|\.\s|；|当用户|触发/)[0].slice(0, 80),
    folder: record.id,
    category: treatment?.category || '未分类',
    tags: record.triggers || [],
    source: record.source,
    source_layer: sourceLayer(record.source),
    relative_path: record.relative_path,
    absolute_path: null,
    path_visibility: 'backend_only',
    status: 'discovered',
    verification_status: 'not_verified',
    treatment: {
      entry: treatmentEntry,
      action: treatment?.action || null,
      availability: treatment?.availability || null,
      risk_clues: treatment?.risk_clues || record.risk_clues || {},
      management_advice: treatment?.management_advice || null,
      next_step: treatment?.next_step || null,
      evidence: treatment ? 'treatment_queue' : 'current_read',
    },
    risk_clues: record.risk_clues || {},
    evidence_level: record.evidence || 'current_read',
    duplicate: {
      has_same_name: hasDuplicate,
      groups: duplicates.groups,
      canonical_candidate: null,
      operation_card_ref: null,
    },
    invocation: {
      modes: ['path'],
      direct_execution_allowed: false,
      direct_execution_reason: 'P2 仅接入只读治理档案；调用执行门在 P3/P5 验收后启用',
    },
  };
}

function loadGovernanceCatalog() {
  const search = runControlCenter('search', ['--query', '']);
  const treatment = runControlCenter('treatment', ['--group', 'all']);
  const duplicates = runControlCenter('duplicates');
  const treatmentRows = (treatment.entries || []).flatMap((entry) => entry.items || []);
  const treatmentById = new Map(treatmentRows.map((row) => [row['稳定ID'], row]));
  const duplicateIndex = buildDuplicateIndex(duplicates);
  const skills = (search.results || []).map((record) => normalizeRecord(record, treatmentById, duplicateIndex));
  return {
    schema_version: 'skilldeck-governance.v1',
    source_of_truth: 'skill-plugin-control-center',
    evidence: 'current_read',
    generated_at: new Date().toISOString(),
    skills,
    summary: {
      skill_files: skills.length,
      treatment_queue_total: treatment.total || 0,
      treatment_summary: treatment.summary || {},
      duplicate_same_name_groups: (duplicates.same_name || []).length,
      duplicate_same_sha256_groups: (duplicates.same_sha256 || []).length,
      baseline: null,
    },
    safety: {
      read_only: true,
      absolute_paths_exposed: false,
      old_skilldeck_inventory_disabled: true,
      external_api_used: false,
      local_execution_enabled: false,
    },
  };
}

module.exports = { CONTROL_CENTER_SCRIPT, loadGovernanceCatalog, normalizeRecord };
