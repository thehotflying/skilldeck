'use strict';

const workbench = require('../p10-workbench');

function assert(condition, message) { if (!condition) throw new Error(message); }
function noSideEffects(value) {
  const safety = value.safety || {};
  assert(safety.read_only === true, 'must stay read-only');
  assert(safety.not_executed === true, 'must stay not_executed');
  assert(safety.local_execution_started === false, 'must not start local execution');
  assert(safety.external_request_started === false, 'must not start external request');
  assert(!JSON.stringify(value).includes('/Users/mac/'), 'must not expose absolute paths');
}

assert(workbench.SCENES.map((scene) => scene.id).join(',') === 'ppt,writing,research', 'must expose three fixed generic scenes');
const scene = workbench.sceneCatalog('ppt');
assert(scene.candidates.length > 1, 'PPT scene needs candidates');
noSideEffects(scene);
const ids = scene.suggested.slice(0, 2).map((item) => item.stable_id);
const scenePlan = workbench.scenePlan({ sceneId: 'ppt', ids });
noSideEffects(scenePlan);
assert(scenePlan.status === 'not_executed', 'scene plan must not execute');
const analysis = workbench.assemblyAnalysis(ids);
noSideEffects(analysis);
assert(analysis.dependency_status === 'unknown_static_only', 'dependency claim must remain static-only');
const assembly = workbench.pluginAssemblyPlan({ name: 'p10-safety-probe', purpose: 'P10 local safety verification only', ids });
noSideEffects(assembly);
assert(assembly.safety.migration_started === false, 'assembly must not migrate skills');
const plugins = workbench.myPlugins();
noSideEffects(plugins);
assert(plugins.plugins.length > 0, 'must discover installed plugins');
const change = workbench.pluginChangePlan({ action: 'evolve', pluginId: plugins.plugins[0].plugin_id, ids });
noSideEffects(change);
assert(change.status === 'not_executed', 'plugin change plan must not execute');

console.log(JSON.stringify({ ok: true, scenes: workbench.SCENES.length, ppt_candidates: scene.candidates.length, installed_plugins: plugins.plugins.length, plan_ids: [scenePlan.plan_id, assembly.plan_id, change.plan_id] }));
