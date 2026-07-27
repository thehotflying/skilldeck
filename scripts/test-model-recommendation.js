#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const {
  MAX_CANDIDATES, outboundSkillSummary, selectCandidates, buildRecommendationMessages, parseRecommendation,
} = require('../model-recommendation');

const skills = [
  { stable_id: 'user:writing', name: '写作助手', description: '撰写和润色机构文章', one_line: '撰写和润色机构文章', category: '写作与内容', tags: ['文章', '润色'], absolute_path: '/secret/a', relative_path: 'writing/SKILL.md', treatment: { entry: 'ready' } },
  { stable_id: 'user:research', name: '研究助手', description: '检索公开资料并整理来源', one_line: '检索公开资料并整理来源', category: '研究与信息搜索', tags: ['检索'], absolute_path: '/secret/b', relative_path: 'research/SKILL.md', treatment: { entry: 'normal-gate' } },
];

const summary = outboundSkillSummary(skills[0]);
assert.deepEqual(Object.keys(summary), ['stable_id', 'name', 'description', 'category', 'tags', 'governance_status']);
assert.equal(JSON.stringify(summary).includes('/secret'), false);
assert.equal(JSON.stringify(summary).includes('relative_path'), false);

const candidates = selectCandidates(skills, '帮我检索养老服务资料', MAX_CANDIDATES);
assert.equal(candidates.length, 2);
const messages = buildRecommendationMessages({ task: '帮我检索养老服务资料', mode: 'skills', candidates });
assert.equal(messages.length, 2);
assert.equal(JSON.stringify(messages).includes('/secret'), false);
assert.equal(JSON.stringify(messages).includes('relative_path'), false);

const parsed = parseRecommendation(JSON.stringify({
  summary: '优先检索，再形成草稿。',
  recommendations: [{ stable_id: 'user:research', reason: '适合公开资料检索。' }, { stable_id: 'outside', reason: '不应出现。' }],
  expert: { title: '研究与写作', skill_ids: ['user:research', 'user:writing', 'outside'] },
}), candidates.map((item) => item.stable_id), 'expert');
assert.equal(parsed.recommendations.length, 1);
assert.deepEqual(parsed.expert.skill_ids, ['user:research', 'user:writing']);
assert.throws(() => parseRecommendation('not json', ['user:research'], 'skills'), /可识别/);

console.log('model-recommendation tests passed');
