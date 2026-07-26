#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { DEFAULT_CONFIG, isSafeEndpoint, normalizeMetadata, configStatus } = require('../model-config');

assert.equal(isSafeEndpoint('https://api.example.com/v1'), true);
assert.equal(isSafeEndpoint('http://localhost:11434/v1'), true);
assert.equal(isSafeEndpoint('http://127.0.0.1:8080'), true);
assert.equal(isSafeEndpoint('http://api.example.com'), false);
assert.equal(isSafeEndpoint('https://user:password@api.example.com'), false);
assert.equal(isSafeEndpoint('ftp://api.example.com'), false);

const config = normalizeMetadata({ provider_id: 'openai-compatible', base_url: 'https://api.example.com/v1/', model: 'example-model' });
assert.deepEqual(config, { provider_id: 'openai-compatible', base_url: 'https://api.example.com/v1', model: 'example-model', enabled_scope: 'recommendation_only' });
assert.throws(() => normalizeMetadata({ provider_id: '../unsafe' }), /服务标识/);
assert.throws(() => normalizeMetadata({ base_url: 'http://api.example.com' }), /API 地址/);
assert.deepEqual(normalizeMetadata({}), DEFAULT_CONFIG);

const status = configStatus(config, true, false);
assert.equal(status.has_keychain_secret, true);
assert.equal(status.legacy_plaintext_key_detected, false);
assert.deepEqual(status.outbound_policy.default_payload, ['Skill 名称', '一句话简介', '分类与标签']);
assert.equal(status.outbound_policy.never_default.includes('完整 SKILL.md'), true);
assert.equal(status.outbound_policy.execution_boundary.includes('不能执行 Skill'), true);

console.log('model-config tests passed');
