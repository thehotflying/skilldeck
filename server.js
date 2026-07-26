#!/usr/bin/env node
// SkillDeck vNext — skills-governance visual frontend.
// It has one source of truth: the existing Skill Plugin Control Center.
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { URL } = require('node:url');
const { loadGovernanceCatalog } = require('./governance-adapter');
const { buildInvocationCard } = require('./governance-invocation-policy');
const { KEYCHAIN_SERVICE, CONFIG_FILE, DEFAULT_CONFIG, normalizeMetadata, configStatus } = require('./model-config');

const PORT = process.env.PORT || 4177;
const PUBLIC = path.join(__dirname, 'public');
const LEGACY_PATHS = new Set([
  '/api/skills', '/api/dirs', '/api/pick-dir', '/api/prompt', '/api/run', '/api/settings',
  '/api/experts', '/api/experts/auto', '/api/expert-prompt',
]);

function loadConfig() {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (_) {}
  let metadata = DEFAULT_CONFIG;
  try { metadata = normalizeMetadata(raw); } catch (_) {}
  return { ...metadata, legacyPlaintextKeyDetected: Boolean(raw.deepseekApiKey || raw.apiKey) };
}

function runSecurity(args, captureStdout = false) {
  return new Promise((resolve) => {
    const child = spawn('security', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => { if (captureStdout) stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('close', (code) => resolve({ ok: code === 0, stdout: stdout.trim(), stderr: stderr.trim() }));
    child.on('error', () => resolve({ ok: false, stdout: '', stderr: '无法访问 macOS 钥匙串。' }));
  });
}

async function keychainHasSecret(providerId) {
  return (await runSecurity(['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', providerId])).ok;
}

async function readKeychainSecret(providerId) {
  const result = await runSecurity(['find-generic-password', '-w', '-s', KEYCHAIN_SERVICE, '-a', providerId], true);
  return result.ok ? result.stdout : '';
}

async function writeKeychainSecret(providerId, secret) {
  const value = String(secret || '').trim();
  if (!value) return false;
  const result = await runSecurity(['add-generic-password', '-U', '-s', KEYCHAIN_SERVICE, '-a', providerId, '-w', value]);
  if (!result.ok) throw new Error('无法写入 macOS 钥匙串。请检查系统钥匙串权限。');
  return true;
}

function sendJson(res, code, object) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(object));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    let settled = false;
    const finish = (result) => {
      if (!settled) { settled = true; resolve(result); }
    };
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) finish({ __tooLarge: true });
    });
    req.on('end', () => {
      if (settled) return;
      try { finish(body ? JSON.parse(body) : {}); } catch (_) { finish({}); }
    });
    req.on('error', () => finish({}));
  });
}

function serveStatic(res, file) {
  const full = path.join(PUBLIC, file);
  if (!full.startsWith(PUBLIC) || !fs.existsSync(full)) { res.writeHead(404); return res.end('not found'); }
  const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }[path.extname(full)] || 'text/plain';
  res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
  fs.createReadStream(full).pipe(res);
}

function governanceUnavailable(res, error) {
  return sendJson(res, 503, {
    error: `治理中心当前不可读取：${error.message || error}`,
    evidence: 'unknown',
    safety: { falls_back_to_legacy_scanner: false },
  });
}

async function modelStatus() {
  const cfg = loadConfig();
  return configStatus(cfg, await keychainHasSecret(cfg.provider_id), cfg.legacyPlaintextKeyDetected);
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://localhost:${PORT}`);
  const p = requestUrl.pathname;

  if (p === '/') return serveStatic(res, 'index.html');
  if (p === '/app.js' || p === '/style.css') return serveStatic(res, p.slice(1));

  if (p === '/api/governance' && req.method === 'GET') {
    try { return sendJson(res, 200, loadGovernanceCatalog()); }
    catch (error) { return governanceUnavailable(res, error); }
  }

  // P4: cards never execute a Skill, disclose an absolute path, or persist a confirmation.
  if ((p === '/api/invocation-card' || p === '/api/expert-card') && req.method === 'POST') {
    const body = await readBody(req);
    if (body.__tooLarge) return sendJson(res, 413, { error: '请求内容过大。', external_request_started: false });
    const requestedIds = p === '/api/expert-card'
      ? (Array.isArray(body.skill_ids) ? body.skill_ids : [])
      : [body.skill_id].filter(Boolean);
    try {
      const catalog = loadGovernanceCatalog();
      const byId = new Map((catalog.skills || []).map((skill) => [skill.stable_id, skill]));
      const selected = requestedIds.map((id) => byId.get(id)).filter(Boolean);
      if (!selected.length || selected.length !== requestedIds.length) {
        return sendJson(res, 400, { error: '选择的 Skill 已不存在于当前治理库存；请先刷新页面。', external_request_started: false });
      }
      const card = buildInvocationCard(selected, { task: body.task, confirmed: body.confirmed === true, expert: p === '/api/expert-card' });
      return sendJson(res, 200, {
        ...card,
        safety: {
          read_only: true,
          no_skill_body_exposed: true,
          absolute_paths_exposed: false,
          local_execution_started: false,
          external_request_started: false,
          confirmation_persisted: false,
        },
      });
    } catch (error) { return governanceUnavailable(res, error); }
  }

  // P5: configuration stores metadata locally, and stores a submitted secret only in macOS Keychain.
  if (p === '/api/model-config' && req.method === 'GET') return sendJson(res, 200, await modelStatus());

  if (p === '/api/model-config' && req.method === 'POST') {
    const body = await readBody(req);
    if (body.__tooLarge) return sendJson(res, 413, { error: '请求内容过大。', external_request_started: false });
    let metadata;
    try { metadata = normalizeMetadata({ provider_id: body.provider_id, base_url: body.base_url, model: body.model }); }
    catch (error) { return sendJson(res, 400, { error: error.message, external_request_started: false }); }
    const submittedKey = typeof body.api_key === 'string' ? body.api_key.trim() : '';
    try {
      // Keychain write happens before metadata write, so an unavailable keychain cannot produce a fake-ready state.
      if (submittedKey) await writeKeychainSecret(metadata.provider_id, submittedKey);
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(metadata, null, 2) + '\n', { mode: 0o600 });
      try { fs.chmodSync(CONFIG_FILE, 0o600); } catch (_) {}
      return sendJson(res, 200, { ok: true, ...configStatus(metadata, await keychainHasSecret(metadata.provider_id), false), external_request_started: false, secret_returned: false });
    } catch (error) {
      return sendJson(res, 500, { error: error.message || '保存本地模型设置失败。', external_request_started: false });
    }
  }

  // This is the sole P5 outbound operation. It needs an explicit checkbox and sends no Skill data.
  if (p === '/api/model-test' && req.method === 'POST') {
    const body = await readBody(req);
    if (body.confirmed_external !== true) {
      return sendJson(res, 400, { error: '请先勾选“我确认现在访问模型提供商”，再测试连接。', external_request_started: false });
    }
    const cfg = loadConfig();
    if (!cfg.base_url || !cfg.model || !(await keychainHasSecret(cfg.provider_id))) {
      return sendJson(res, 409, { error: '请先填写 API 地址和模型名称，并把密钥保存到 macOS 钥匙串。', external_request_started: false });
    }
    const secret = await readKeychainSecret(cfg.provider_id);
    if (!secret) return sendJson(res, 503, { error: '无法从 macOS 钥匙串读取该模型密钥。', external_request_started: false });
    try {
      const response = await fetch(`${cfg.base_url}/models`, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(8000) });
      return sendJson(res, response.ok ? 200 : 502, {
        ok: response.ok, status: response.status, checked: '模型提供商元数据端点',
        payload_sent: '没有发送 Skill 数据或机构资料', external_request_started: true,
      });
    } catch (_) {
      return sendJson(res, 502, { error: '无法连接模型提供商；请核对地址、网络和密钥权限。', external_request_started: true });
    }
  }

  if (LEGACY_PATHS.has(p)) {
    return sendJson(res, 410, {
      error: '旧版接口已关闭：它可能绕开技能管理中心统一库存或确认门。',
      safety: { legacy_path_disabled: true, direct_execution_enabled: false, arbitrary_directory_scan_enabled: false },
    });
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, () => console.log(`SkillDeck vNext 已启动：http://localhost:${PORT}`));
