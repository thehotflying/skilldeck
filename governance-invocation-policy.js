'use strict';

const TREATMENT_RANK = {
  pending: 4,
  dedupe: 4,
  'strong-gate': 3,
  'normal-gate': 2,
  ready: 1,
  unknown: 4,
};

const TREATMENT_LABEL = {
  pending: '待整理',
  dedupe: '去重处理',
  'strong-gate': '强确认门',
  'normal-gate': '普通确认门',
  ready: '可直接用',
  unknown: '待核验',
};

function treatmentOf(skill) {
  return skill?.treatment?.entry || 'unknown';
}

function highestTreatment(skills) {
  return (skills || []).map(treatmentOf).sort((a, b) => (TREATMENT_RANK[b] || 4) - (TREATMENT_RANK[a] || 4))[0] || 'unknown';
}

function localReference(skill) {
  return `- ${skill.name}\n  治理编号：${skill.stable_id}\n  来源：${skill.source_layer}\n  相对文件：${skill.relative_path}`;
}

function buildPathInstruction(skills, task, title = '本机 Skill 调用指令') {
  const scope = String(task || '').trim() || '请先说明建议步骤；不要执行任何联网、写入、安装、发布或自动化动作。';
  return `${title}\n\n请使用下列已治理的本机 Skill 完成任务。先读取对应的本机 Skill 说明；本指令不构成对任何联网、写入、账号、发布、删除或自动化动作的授权。\n\n${skills.map(localReference).join('\n')}\n\n本次任务范围：${scope}`;
}

function operationCard(skills, treatment, task, expert) {
  const mode = expert ? '专家组合' : '技能';
  const names = skills.map((skill) => skill.name).join('、');
  return {
    kind: 'operation-card',
    allowed: false,
    direct_execution_allowed: false,
    treatment,
    treatment_label: TREATMENT_LABEL[treatment] || treatment,
    title: `${mode}暂不可直接调用`,
    summary: `${names} 的最高治理状态为「${TREATMENT_LABEL[treatment] || treatment}」。当前只能形成操作卡。`,
    task: String(task || '').trim() || null,
    required_next_step: treatment === 'strong-gate'
      ? '请单独确认本次要做什么、影响范围、是否可回滚和失败后的恢复方式。'
      : '请先完成元数据补齐或重复组主版本决策，再考虑调用。',
    members: skills.map((skill) => ({ stable_id: skill.stable_id, name: skill.name, treatment: treatmentOf(skill) })),
  };
}

function confirmationCard(skills, treatment, task, expert) {
  const names = skills.map((skill) => skill.name).join('、');
  return {
    kind: 'confirmation-card',
    allowed: false,
    direct_execution_allowed: false,
    treatment,
    treatment_label: TREATMENT_LABEL[treatment],
    title: '需要本次确认后才能生成调用指令',
    summary: `${names} 含有联网、写入或脚本等静态风险线索。确认只用于生成调用指令，不会执行 Skill。`,
    task: String(task || '').trim() || null,
    confirmation_text: '我确认仅为上述最小范围生成调用指令；真正执行任何风险动作时仍需再次确认。',
    members: skills.map((skill) => ({ stable_id: skill.stable_id, name: skill.name, treatment: treatmentOf(skill), risk_clues: skill.risk_clues })),
  };
}

function buildInvocationCard(skills, options = {}) {
  const selected = Array.isArray(skills) ? skills.filter(Boolean) : [];
  const expert = Boolean(options.expert);
  if (!selected.length) return { kind: 'invalid-card', allowed: false, error: '至少选择一个 Skill。' };
  const treatment = highestTreatment(selected);
  if (treatment === 'pending' || treatment === 'dedupe' || treatment === 'unknown') return operationCard(selected, treatment, options.task, expert);
  if (treatment === 'strong-gate') return operationCard(selected, treatment, options.task, expert);
  if (treatment === 'normal-gate' && !options.confirmed) return confirmationCard(selected, treatment, options.task, expert);

  return {
    kind: 'path-instruction',
    allowed: true,
    direct_execution_allowed: false,
    treatment,
    treatment_label: TREATMENT_LABEL[treatment],
    title: expert ? '专家组合调用指令' : '技能调用指令',
    summary: treatment === 'normal-gate' ? '已记录本次页面确认；这里只生成调用指令，不执行任何动作。' : '此 Skill 当前可直接生成路径式调用指令；这里只生成指令，不执行任何动作。',
    confirmed_for_card: treatment === 'normal-gate',
    instruction: buildPathInstruction(selected, options.task, expert ? '本机专家组合调用指令' : '本机 Skill 调用指令'),
    members: selected.map((skill) => ({ stable_id: skill.stable_id, name: skill.name, treatment: treatmentOf(skill) })),
  };
}

module.exports = { TREATMENT_LABEL, TREATMENT_RANK, highestTreatment, buildInvocationCard };
