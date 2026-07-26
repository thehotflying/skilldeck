'use strict';

const assert = require('node:assert/strict');
const { buildInvocationCard, highestTreatment } = require('../governance-invocation-policy');

function skill(name, entry) {
  return {
    stable_id: `user-skills:${name}/SKILL.md`, name, source_layer: '用户技能', relative_path: `${name}/SKILL.md`,
    treatment: { entry }, risk_clues: entry === 'ready' ? {} : { write: true },
  };
}

const ready = skill('ready-skill', 'ready');
const normal = skill('normal-skill', 'normal-gate');
const strong = skill('strong-skill', 'strong-gate');
const dedupe = skill('dedupe-skill', 'dedupe');

assert.equal(buildInvocationCard([ready], { task: '整理候选清单' }).kind, 'path-instruction');
assert.equal(buildInvocationCard([normal], { task: '生成草稿' }).kind, 'confirmation-card');
assert.equal(buildInvocationCard([normal], { task: '生成草稿', confirmed: true }).kind, 'path-instruction');
assert.equal(buildInvocationCard([strong], { task: '同步外部系统' }).kind, 'operation-card');
assert.equal(buildInvocationCard([dedupe], { task: '生成草稿' }).kind, 'operation-card');
assert.equal(buildInvocationCard([ready, normal], { task: '组合任务', expert: true }).kind, 'confirmation-card');
assert.equal(highestTreatment([ready, normal, strong]), 'strong-gate');
assert.equal(buildInvocationCard([strong], {}).direct_execution_allowed, false);
assert.doesNotMatch(buildInvocationCard([ready], {}).instruction, /\/Users\//);

console.log(JSON.stringify({ ok: true, cases: 9 }));
