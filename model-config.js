'use strict';

const fs = require('node:fs');
const path = require('node:path');

const KEYCHAIN_SERVICE = 'skilldeck-vnext.model-api';
const CONFIG_FILE = path.join(__dirname, '.skilldeck.local.json');
const DEFAULT_CONFIG = Object.freeze({ provider_id: 'default', base_url: '', model: '', enabled_scope: 'recommendation_only' });

function isSafeEndpoint(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.username || url.password || url.hash) return false;
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  } catch (_) { return false; }
}

function normalizeMetadata(input = {}) {
  const provider_id = String(input.provider_id || 'default').trim();
  const base_url = String(input.base_url || '').trim().replace(/\/+$/, '');
  const model = String(input.model || '').trim();
  if (!/^[A-Za-z0-9_-]{1,48}$/.test(provider_id)) throw new Error('服务标识只能使用字母、数字、下划线和连字符。');
  if (base_url && !isSafeEndpoint(base_url)) throw new Error('API 地址必须是 HTTPS，或本机 localhost 的 HTTP 地址。');
  if (model.length > 160) throw new Error('模型名称过长。');
  return { provider_id, base_url, model, enabled_scope: 'recommendation_only' };
}

function configStatus(metadata, hasSecret, legacyPlaintextKeyDetected) {
  return {
    provider_id: metadata.provider_id,
    base_url: metadata.base_url,
    model: metadata.model,
    enabled_scope: 'recommendation_only',
    has_keychain_secret: Boolean(hasSecret),
    legacy_plaintext_key_detected: Boolean(legacyPlaintextKeyDetected),
    outbound_policy: {
      enabled_scope: 'recommendation_only',
      default_payload: ['Skill 名称', '一句话简介', '分类与标签'],
      never_default: ['完整 SKILL.md', '内部或绝对路径', '住民、员工或机构资料'],
      execution_boundary: '模型只能辅助推荐、分类与摘要，不能执行 Skill 或绕过治理确认门。',
    },
  };
}

module.exports = { KEYCHAIN_SERVICE, CONFIG_FILE, DEFAULT_CONFIG, isSafeEndpoint, normalizeMetadata, configStatus };
