'use strict';

const MAX_CANDIDATES = 60;
const MAX_TASK_LENGTH = 1_500;

function cleanText(value, maxLength = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function outboundSkillSummary(skill) {
  return {
    stable_id: cleanText(skill.stable_id, 180),
    name: cleanText(skill.name, 100),
    description: cleanText(skill.one_line || skill.description, 240),
    category: cleanText(skill.category, 80),
    tags: (skill.tags || []).map((tag) => cleanText(tag, 80)).filter(Boolean).slice(0, 12),
    governance_status: cleanText(skill.treatment?.entry || 'unknown', 40),
  };
}

function queryTerms(task) {
  const compact = cleanText(task, MAX_TASK_LENGTH).toLowerCase();
  const words = compact.match(/[\p{L}\p{N}_-]{2,}/gu) || [];
  return [...new Set(words)].slice(0, 24);
}

function candidateScore(skill, terms) {
  const haystack = `${skill.name} ${skill.description} ${skill.category} ${(skill.tags || []).join(' ')}`.toLowerCase();
  const matches = terms.reduce((score, term) => score + (haystack.includes(term) ? 4 : 0), 0);
  const availability = skill.treatment?.entry === 'ready' ? 1 : 0;
  return matches + availability;
}

function selectCandidates(skills, task, limit = MAX_CANDIDATES) {
  const terms = queryTerms(task);
  return (skills || [])
    .map((skill, index) => ({ skill, index, score: candidateScore(skill, terms) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.min(limit, MAX_CANDIDATES))
    .map(({ skill }) => outboundSkillSummary(skill));
}

function buildRecommendationMessages({ task, mode, candidates }) {
  const objective = mode === 'expert'
    ? '建议一个临时专家组合（2 至 5 个 Skill），并说明它继承的最高治理状态。'
    : '推荐最适合本次任务的 3 至 5 个 Skill。';
  const system = [
    '你是本地 SkillDeck 的推荐助手，只能做建议，不能执行工具、修改文件、联网、发布或绕过治理确认。',
    '请严格只引用候选列表中的 stable_id。每项推荐都要给出一句理由。',
    '返回 JSON，不要使用 Markdown。格式：{"summary":"...","recommendations":[{"stable_id":"...","reason":"..."}],"expert":{"title":"...","skill_ids":["..."]}}。',
  ].join('\n');
  const user = [
    `本次任务：${cleanText(task, MAX_TASK_LENGTH)}`,
    `目标：${objective}`,
    '候选清单仅含名称、简介、分类、标签与治理状态；不含正文和路径：',
    JSON.stringify(candidates),
  ].join('\n\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

function parseRecommendation(content, allowedIds, mode) {
  let parsed;
  try { parsed = JSON.parse(String(content || '').trim()); }
  catch (_) { throw new Error('模型没有返回可识别的推荐结果。'); }
  const allowed = new Set(allowedIds || []);
  const recommendations = (Array.isArray(parsed.recommendations) ? parsed.recommendations : [])
    .filter((item) => allowed.has(item?.stable_id))
    .slice(0, 5)
    .map((item) => ({ stable_id: item.stable_id, reason: cleanText(item.reason, 240) || '模型未提供理由。' }));
  const rawExpert = parsed.expert && typeof parsed.expert === 'object' ? parsed.expert : {};
  const expertIds = (Array.isArray(rawExpert.skill_ids) ? rawExpert.skill_ids : [])
    .filter((id) => allowed.has(id))
    .filter((id, index, list) => list.indexOf(id) === index)
    .slice(0, 5);
  return {
    summary: cleanText(parsed.summary, 500) || '模型未提供摘要。',
    recommendations,
    expert: mode === 'expert' && expertIds.length
      ? { title: cleanText(rawExpert.title, 80) || '建议的临时专家组合', skill_ids: expertIds }
      : null,
  };
}

module.exports = {
  MAX_CANDIDATES,
  MAX_TASK_LENGTH,
  outboundSkillSummary,
  selectCandidates,
  buildRecommendationMessages,
  parseRecommendation,
};
