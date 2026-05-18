'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Point HOME at a temp dir BEFORE requiring config, so the global ~/.atomicrc
// it resolves is isolated from the real machine.
const TEMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-home-'));
process.env.HOME = TEMP_HOME;

const { loadConfig, saveGlobalConfig, GLOBAL_PATH } = require('../src/config');
const { createTempDir } = require('./helpers');

const ENV_KEYS = [
  'ATOMIC_PROVIDER',
  'ATOMIC_MODEL',
  'ATOMIC_API_KEY',
  'GROQ_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
];

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  fs.rmSync(GLOBAL_PATH, { force: true });
});

test('loadConfig: sensible defaults when nothing is configured', () => {
  const cfg = loadConfig({ cwd: createTempDir() });
  assert.equal(cfg.provider, 'groq');
  assert.equal(cfg.model, 'openai/gpt-oss-120b');
  assert.equal(cfg.apiKey, '');
  assert.equal(cfg.maxDiffChars, 6000);
});

test('loadConfig: CLI flags take top precedence', () => {
  process.env.ATOMIC_PROVIDER = 'groq';
  const cfg = loadConfig({
    cwd: createTempDir(),
    flags: { provider: 'openai', model: 'gpt-4o' },
  });
  assert.equal(cfg.provider, 'openai');
  assert.equal(cfg.model, 'gpt-4o');
});

test('loadConfig: reads the provider-specific API key env var', () => {
  process.env.GROQ_API_KEY = 'gsk_from_env';
  const cfg = loadConfig({ cwd: createTempDir() });
  assert.equal(cfg.apiKey, 'gsk_from_env');
});

test('loadConfig: ATOMIC_API_KEY overrides the provider-specific var', () => {
  process.env.GROQ_API_KEY = 'gsk_specific';
  process.env.ATOMIC_API_KEY = 'generic_key';
  const cfg = loadConfig({ cwd: createTempDir() });
  assert.equal(cfg.apiKey, 'generic_key');
});

test('loadConfig: ATOMIC_PROVIDER selects the matching env key var', () => {
  process.env.ATOMIC_PROVIDER = 'anthropic';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-env';
  const cfg = loadConfig({ cwd: createTempDir() });
  assert.equal(cfg.provider, 'anthropic');
  assert.equal(cfg.apiKey, 'sk-ant-env');
});

test('loadConfig: a project .atomicrc supplies provider and model', () => {
  const dir = createTempDir();
  fs.writeFileSync(
    path.join(dir, '.atomicrc'),
    JSON.stringify({ provider: 'openai', model: 'gpt-4o' })
  );
  const cfg = loadConfig({ cwd: dir });
  assert.equal(cfg.provider, 'openai');
  assert.equal(cfg.model, 'gpt-4o');
});

test('loadConfig: env vars override the project file', () => {
  const dir = createTempDir();
  fs.writeFileSync(path.join(dir, '.atomicrc'), JSON.stringify({ provider: 'openai' }));
  process.env.ATOMIC_PROVIDER = 'anthropic';
  const cfg = loadConfig({ cwd: dir });
  assert.equal(cfg.provider, 'anthropic');
});

test('saveGlobalConfig: persists values that loadConfig then reads back', () => {
  saveGlobalConfig({ provider: 'groq', apiKey: 'gsk_saved', model: 'saved-model' });
  assert.ok(fs.existsSync(GLOBAL_PATH));

  const cfg = loadConfig({ cwd: createTempDir() });
  assert.equal(cfg.apiKey, 'gsk_saved');
  assert.equal(cfg.model, 'saved-model');
});

test('saveGlobalConfig: writes the file with owner-only (600) permissions', () => {
  saveGlobalConfig({ apiKey: 'secret' });
  const mode = fs.statSync(GLOBAL_PATH).mode & 0o777;
  assert.equal(mode, 0o600);
});
