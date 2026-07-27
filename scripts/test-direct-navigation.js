'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

const requiredViews = ['skills', 'scenes', 'assembly', 'plugins', 'health', 'duplicates', 'creation', 'migration', 'experts', 'model'];
for (const view of requiredViews) {
  if (!html.includes(`data-view="${view}"`)) throw new Error(`missing sidebar entry: ${view}`);
  if (!app.includes(`${view}: { title:`)) throw new Error(`missing view metadata: ${view}`);
}

for (const view of ['health', 'duplicates', 'creation', 'migration']) {
  if (!app.includes(`section === '${view}'`)) throw new Error(`missing direct governance renderer: ${view}`);
}

if (!html.includes('id="view-model"')) throw new Error('missing direct model settings page');
if (html.includes('id="set-modal"')) throw new Error('model settings must not remain a nested modal');
if (!app.includes("GOVERNANCE_VIEWS.has(state.view)")) throw new Error('direct governance view switching is missing');

console.log(JSON.stringify({ ok: true, direct_views: requiredViews, model_settings: 'page', governance_actions: 'operation_cards_only' }));
