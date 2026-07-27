'use strict';

const assert = require('node:assert/strict');
const { loadGovernanceCatalog } = require('../governance-adapter');
const { planOperation, creationCard, dashboard } = require('../governance-operations');

function noAbsolutePaths(value) {
  return !JSON.stringify(value).includes('/Users/mac/');
}

const catalog = loadGovernanceCatalog();
const mutable = (catalog.skills || []).find((skill) => !skill.is_system && skill.source !== 'personal-plugin-cache');
assert.ok(mutable, 'needs one non-system, non-cache Skill fixture from the current catalog');

const evolve = planOperation({ action: 'evolve', ids: [mutable.stable_id] });
assert.equal(evolve.status, 'not_executed');
assert.equal(evolve.safety.local_execution_started, false);
assert.equal(evolve.safety.governance_catalog_modified, false);
assert.equal(noAbsolutePaths(evolve), true);

const create = creationCard({ kind: 'skill', name: 'p8-safety-probe', purpose: 'P8 read-only creation-card verification', triggers: ['P8 test'] });
assert.equal(create.status, 'not_executed');
assert.equal(create.safety.official_delegate_only, true);
assert.equal(noAbsolutePaths(create), true);

const data = dashboard();
assert.equal(data.safety.read_only, true);
assert.equal(data.safety.local_execution_started, false);
assert.equal(noAbsolutePaths(data), true);

console.log(JSON.stringify({ ok: true, skill_count: catalog.summary.skill_count, operation: evolve.plan_id, dashboard_components: data.components.components.length }));
