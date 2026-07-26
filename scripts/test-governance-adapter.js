'use strict';

const assert = require('node:assert/strict');
const { loadGovernanceCatalog } = require('../governance-adapter');

const catalog = loadGovernanceCatalog();
assert.equal(catalog.schema_version, 'skilldeck-governance.v1');
assert.equal(catalog.source_of_truth, 'skill-plugin-control-center');
assert.equal(catalog.safety.read_only, true);
assert.equal(catalog.safety.falls_back_to_legacy_scanner, false);
assert.equal(catalog.safety.exposes_absolute_paths, false);
assert.equal(catalog.safety.direct_execution_enabled, false);
assert.ok(catalog.skills.length > 0);
assert.ok(catalog.skills.every((skill) => skill.stable_id && skill.source_layer));
assert.ok(catalog.skills.every((skill) => skill.absolute_path === null));
assert.ok(catalog.skills.every((skill) => skill.invocation.direct_execution_allowed === false));
console.log(JSON.stringify({
  ok: true,
  skills: catalog.summary.skill_count,
  same_name_groups: catalog.summary.same_name_groups,
  treatment_groups: catalog.summary.treatment_groups,
}, null, 2));

