'use strict';

const assert = require('node:assert/strict');
const { loadGovernanceCatalog } = require('../governance-adapter');

const catalog = loadGovernanceCatalog();
assert.equal(catalog.schema_version, 'skilldeck-governance.v1');
assert.equal(catalog.source_of_truth, 'skill-plugin-control-center');
assert.equal(catalog.evidence, 'current_read');
assert.ok(Array.isArray(catalog.skills));
assert.ok(catalog.skills.length > 0, '治理中心应返回至少一个技能档案');
assert.ok(catalog.skills.every((skill) => skill.stable_id && skill.source_layer));
assert.ok(catalog.skills.every((skill) => skill.absolute_path === null));
assert.ok(catalog.skills.every((skill) => skill.invocation.direct_execution_allowed === false));
assert.equal(catalog.safety.read_only, true);
assert.equal(catalog.safety.old_skilldeck_inventory_disabled, true);
console.log(JSON.stringify({
  ok: true,
  skill_files: catalog.skills.length,
  treatment_queue_total: catalog.summary.treatment_queue_total,
  duplicate_same_name_groups: catalog.summary.duplicate_same_name_groups,
}, null, 2));

