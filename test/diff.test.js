'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { classifyTrivial, redactSecrets, truncate } = require('../src/diff');

// ── classifyTrivial ──────────────────────────────────────────────────────

test('classifyTrivial: lockfile-only changes get a canned chore message', () => {
  const files = [
    { status: 'M', path: 'package-lock.json' },
    { status: 'M', path: 'frontend/yarn.lock' },
  ];
  assert.equal(classifyTrivial(files), 'chore: update dependency lockfile');
});

test('classifyTrivial: returns null when any real source file is staged', () => {
  const files = [
    { status: 'M', path: 'package-lock.json' },
    { status: 'M', path: 'src/index.js' },
  ];
  assert.equal(classifyTrivial(files), null);
});

test('classifyTrivial: returns null for an empty file list', () => {
  assert.equal(classifyTrivial([]), null);
});

// ── redactSecrets ────────────────────────────────────────────────────────

test('redactSecrets: masks known API key prefixes but keeps the prefix', () => {
  const out = redactSecrets('key is gsk_ABCDEFGHIJKLMNOPQRST here');
  assert.match(out, /gsk_\*\*\*REDACTED\*\*\*/);
  assert.ok(!out.includes('ABCDEFGHIJKLMNOPQRST'));
});

test('redactSecrets: masks AWS access key IDs', () => {
  const out = redactSecrets('+ aws = AKIAIOSFODNN7EXAMPLE');
  assert.match(out, /REDACTED-AWS-KEY/);
  assert.ok(!out.includes('AKIAIOSFODNN7EXAMPLE'));
});

test('redactSecrets: masks PEM private key blocks', () => {
  const pem =
    '-----BEGIN RSA PRIVATE KEY-----\nMIIabc123\n-----END RSA PRIVATE KEY-----';
  const out = redactSecrets(`+ ${pem}`);
  assert.match(out, /REDACTED-PRIVATE-KEY/);
  assert.ok(!out.includes('MIIabc123'));
});

test('redactSecrets: masks generic key/value assignments', () => {
  const out = redactSecrets('password = "hunter2supersecret"');
  assert.ok(!out.includes('hunter2supersecret'));
  assert.match(out, /REDACTED/);
});

test('redactSecrets: leaves ordinary code untouched', () => {
  const code = 'function add(a, b) { return a + b; }';
  assert.equal(redactSecrets(code), code);
});

// ── truncate ─────────────────────────────────────────────────────────────

test('truncate: returns the diff unchanged when under the limit', () => {
  const small = 'diff --git a/x b/x\n+hello';
  assert.equal(truncate(small, 1000), small);
});

test('truncate: shortens an oversized diff and marks the cut', () => {
  const big = 'diff --git a/x b/x\n' + '+line\n'.repeat(5000);
  const out = truncate(big, 2000);
  assert.ok(out.length < big.length);
  assert.match(out, /truncated/);
});

test('truncate: keeps every file represented in a multi-file diff', () => {
  const fileA = 'diff --git a/a.js b/a.js\n' + '+a\n'.repeat(2000);
  const fileB = 'diff --git a/b.js b/b.js\n' + '+b\n'.repeat(2000);
  const out = truncate(fileA + fileB, 4000);
  assert.match(out, /a\/a\.js/);
  assert.match(out, /a\/b\.js/);
});
