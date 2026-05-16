'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildMessages, clean } = require('../src/prompt');

// ── buildMessages ────────────────────────────────────────────────────────

test('buildMessages: produces a system + user message pair', () => {
  const messages = buildMessages({
    diff: 'diff --git a/x b/x',
    files: [{ status: 'M', path: 'x.js' }],
    recentSubjects: [],
  });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.match(messages[0].content, /Conventional Commits/);
});

test('buildMessages: embeds the diff and the staged file list', () => {
  const messages = buildMessages({
    diff: 'THE-DIFF-CONTENT',
    files: [{ status: 'A', path: 'src/new.js' }],
    recentSubjects: [],
  });
  assert.match(messages[1].content, /THE-DIFF-CONTENT/);
  assert.match(messages[1].content, /A src\/new\.js/);
});

test('buildMessages: includes recent subjects when provided', () => {
  const messages = buildMessages({
    diff: 'd',
    files: [{ status: 'M', path: 'x' }],
    recentSubjects: ['feat: earlier change', 'fix: a bug'],
  });
  assert.match(messages[1].content, /feat: earlier change/);
  assert.match(messages[1].content, /Recent commit subjects/);
});

test('buildMessages: omits the style block when there is no history', () => {
  const messages = buildMessages({
    diff: 'd',
    files: [{ status: 'M', path: 'x' }],
    recentSubjects: [],
  });
  assert.ok(!messages[1].content.includes('Recent commit subjects'));
});

// ── clean ────────────────────────────────────────────────────────────────

test('clean: strips surrounding markdown code fences', () => {
  assert.equal(clean('```\nfeat: add x\n```'), 'feat: add x');
  assert.equal(clean('```text\nfix: y\n```'), 'fix: y');
});

test('clean: strips a leading "Commit message:" label', () => {
  assert.equal(clean('Commit message: chore: bump'), 'chore: bump');
});

test('clean: trims whitespace and leaves a plain message intact', () => {
  assert.equal(clean('  feat: plain message  '), 'feat: plain message');
});

test('clean: tolerates empty or missing input', () => {
  assert.equal(clean(''), '');
  assert.equal(clean(undefined), '');
});
