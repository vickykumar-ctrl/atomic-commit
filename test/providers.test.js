'use strict';

// Mock-fetch tests for the provider layer — no real network calls are made.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const groq = require('../src/providers/groq');
const openai = require('../src/providers/openai');
const anthropic = require('../src/providers/anthropic');
const { getProvider, registry } = require('../src/providers');
const { mockFetch, jsonResponse, errorResponse } = require('./helpers');

const chatOk = (content) => jsonResponse({ choices: [{ message: { content } }] });

// ── Groq (OpenAI-compatible) ─────────────────────────────────────────────

test('groq: sends correct URL, auth header and model, returns trimmed text', async () => {
  const m = mockFetch(() => chatOk('  feat: add thing  '));
  try {
    const result = await groq.generate({
      apiKey: 'gsk_secret',
      model: 'my-model',
      messages: [{ role: 'user', content: 'hi' }],
    });
    assert.equal(result, 'feat: add thing');
    assert.equal(m.calls.length, 1);
    assert.equal(m.calls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(m.calls[0].opts.headers.Authorization, 'Bearer gsk_secret');
    assert.equal(m.calls[0].opts.method, 'POST');
    assert.equal(m.calls[0].body.model, 'my-model');
    assert.deepEqual(m.calls[0].body.messages, [{ role: 'user', content: 'hi' }]);
  } finally {
    m.restore();
  }
});

test('groq: falls back to the default model when none is given', async () => {
  const m = mockFetch(() => chatOk('x'));
  try {
    await groq.generate({ apiKey: 'k', messages: [] });
    assert.equal(m.calls[0].body.model, 'openai/gpt-oss-120b');
  } finally {
    m.restore();
  }
});

test('groq: throws with status text on a non-OK response', async () => {
  const m = mockFetch(() => errorResponse(401, 'invalid api key', 'Unauthorized'));
  try {
    await assert.rejects(
      groq.generate({ apiKey: 'bad', messages: [] }),
      /401.*invalid api key/s
    );
  } finally {
    m.restore();
  }
});

test('groq: throws when the response has no content', async () => {
  const m = mockFetch(() => chatOk('   '));
  try {
    await assert.rejects(groq.generate({ apiKey: 'k', messages: [] }), /empty/);
  } finally {
    m.restore();
  }
});

test('groq: tags a 413 response with err.code TOO_LARGE', async () => {
  const m = mockFetch(() =>
    errorResponse(413, 'Request too large for model ...', 'Payload Too Large')
  );
  try {
    await assert.rejects(
      groq.generate({ apiKey: 'k', model: 'm', messages: [] }),
      (err) => err.code === 'TOO_LARGE' && /too large/i.test(err.message)
    );
  } finally {
    m.restore();
  }
});

test('groq: tags a 429 "too large" rate-limit response as TOO_LARGE', async () => {
  const m = mockFetch(() =>
    errorResponse(429, 'Request too large for model ... tokens per minute')
  );
  try {
    await assert.rejects(
      groq.generate({ apiKey: 'k', model: 'm', messages: [] }),
      (err) => err.code === 'TOO_LARGE'
    );
  } finally {
    m.restore();
  }
});

test('groq: wraps a network failure in a readable error', async () => {
  const m = mockFetch(() => {
    throw new Error('ECONNREFUSED');
  });
  try {
    await assert.rejects(groq.generate({ apiKey: 'k', messages: [] }), /network error/);
  } finally {
    m.restore();
  }
});

// ── OpenAI ───────────────────────────────────────────────────────────────

test('openai: targets the OpenAI host and default model', async () => {
  const m = mockFetch(() => chatOk('fix: y'));
  try {
    const result = await openai.generate({ apiKey: 'sk-x', messages: [] });
    assert.equal(result, 'fix: y');
    assert.equal(m.calls[0].url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(m.calls[0].body.model, 'gpt-4o-mini');
  } finally {
    m.restore();
  }
});

// ── Anthropic (Messages API) ─────────────────────────────────────────────

test('anthropic: posts to /messages, separates system, sets headers', async () => {
  const m = mockFetch(() => jsonResponse({ content: [{ text: '  docs: z ' }] }));
  try {
    const result = await anthropic.generate({
      apiKey: 'sk-ant-key',
      model: 'claude-test',
      messages: [
        { role: 'system', content: 'SYSTEM PROMPT' },
        { role: 'user', content: 'USER MSG' },
      ],
    });
    assert.equal(result, 'docs: z');

    const call = m.calls[0];
    assert.match(call.url, /\/messages$/);
    assert.equal(call.opts.headers['x-api-key'], 'sk-ant-key');
    assert.equal(call.opts.headers['anthropic-version'], '2023-06-01');
    assert.equal(call.body.model, 'claude-test');
    assert.equal(call.body.system, 'SYSTEM PROMPT');
    assert.equal(call.body.messages.length, 1);
    assert.equal(call.body.messages[0].role, 'user');
  } finally {
    m.restore();
  }
});

test('anthropic: throws on a non-OK response', async () => {
  const m = mockFetch(() => errorResponse(429, 'rate limited'));
  try {
    await assert.rejects(
      anthropic.generate({ apiKey: 'k', messages: [] }),
      /429.*rate limited/s
    );
  } finally {
    m.restore();
  }
});

// ── registry ─────────────────────────────────────────────────────────────

test('getProvider: resolves known providers and rejects unknown ones', () => {
  assert.equal(getProvider('groq'), groq);
  assert.equal(getProvider('openai'), openai);
  assert.equal(getProvider('anthropic'), anthropic);
  assert.throws(() => getProvider('nope'), /unknown provider/);
});

test('every registered provider exposes the required interface', () => {
  for (const [name, p] of Object.entries(registry)) {
    assert.equal(p.name, name, `${name}: name matches key`);
    assert.equal(typeof p.generate, 'function', `${name}: has generate()`);
    assert.equal(typeof p.envKey, 'string', `${name}: has envKey`);
    assert.equal(typeof p.defaultModel, 'string', `${name}: has defaultModel`);
  }
});
