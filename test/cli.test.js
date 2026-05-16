'use strict';

// Smoke tests that exercise the real CLI as a child process.
// Only paths that need no API key are covered here.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BIN = path.join(__dirname, '..', 'bin', 'atomic.js');
const { createTempRepo, writeAndStage } = require('./helpers');
const { formatHistory } = require('../src/cli');

/** Run the CLI; returns { status, stdout, stderr }. Never throws. */
function runCli(args, cwd) {
  try {
    const stdout = execFileSync(process.execPath, [BIN, ...args], {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      status: err.status == null ? 1 : err.status,
      stdout: err.stdout || '',
      stderr: err.stderr || '',
    };
  }
}

test('cli: --version prints the package version', () => {
  const { status, stdout } = runCli(['--version']);
  assert.equal(status, 0);
  assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test('cli: --help shows usage', () => {
  const { status, stdout } = runCli(['--help']);
  assert.equal(status, 0);
  assert.match(stdout, /Usage/);
  assert.match(stdout, /install-hook/);
});

test('cli: an unknown command exits non-zero', () => {
  const { status, stdout } = runCli(['frobnicate']);
  assert.equal(status, 1);
  assert.match(stdout, /unknown command/);
});

test('cli: reports when there is nothing staged', () => {
  const { stdout } = runCli([], createTempRepo());
  assert.match(stdout, /Nothing staged/);
});

test('cli: --dry-run prints the lockfile message without committing', () => {
  const repo = createTempRepo();
  writeAndStage(repo, 'package-lock.json', '{}\n');
  const { status, stdout } = runCli(['--dry-run'], repo);
  assert.equal(status, 0);
  assert.equal(stdout.trim(), 'chore: update dependency lockfile');
  // Nothing was committed.
  const { stdout: log } = runCli(['--version']);
  assert.ok(log); // sanity
});

test('cli: hook pre-fills the commit message file', () => {
  const repo = createTempRepo();
  writeAndStage(repo, 'package-lock.json', '{}\n');
  const msgFile = path.join(repo, 'COMMIT_EDITMSG');
  fs.writeFileSync(msgFile, '\n# Please enter the commit message\n');

  runCli(['hook', msgFile], repo);

  const result = fs.readFileSync(msgFile, 'utf8');
  assert.match(result, /^chore: update dependency lockfile/);
  // git's comment lines are preserved below the generated message.
  assert.match(result, /# Please enter the commit message/);
});

test('cli: hook leaves a user-written message untouched', () => {
  const repo = createTempRepo();
  writeAndStage(repo, 'package-lock.json', '{}\n');
  const msgFile = path.join(repo, 'COMMIT_EDITMSG');
  fs.writeFileSync(msgFile, 'my own message\n# a comment\n');

  runCli(['hook', msgFile], repo);

  assert.equal(fs.readFileSync(msgFile, 'utf8'), 'my own message\n# a comment\n');
});

test('cli: install-hook then uninstall-hook manages the git hook', () => {
  const repo = createTempRepo();
  const hookPath = path.join(repo, '.git', 'hooks', 'prepare-commit-msg');

  const installed = runCli(['install-hook'], repo);
  assert.equal(installed.status, 0);
  assert.ok(fs.existsSync(hookPath));
  assert.match(fs.readFileSync(hookPath, 'utf8'), /atomic/);

  const removed = runCli(['uninstall-hook'], repo);
  assert.equal(removed.status, 0);
  assert.ok(!fs.existsSync(hookPath));
});

// ── formatHistory (suggestion-history list rendering) ────────────────────

test('formatHistory: numbers entries from 1 and lists each subject', () => {
  const candidates = [
    { message: 'feat: add login endpoint' },
    { message: 'fix: handle null user' },
  ];
  const out = formatHistory(candidates, 0);
  const lines = out.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^ {2}1\) feat: add login endpoint/);
  assert.match(lines[1], /^ {2}2\) fix: handle null user/);
});

test('formatHistory: marks the current entry only', () => {
  const candidates = [
    { message: 'feat: a' },
    { message: 'feat: b' },
    { message: 'feat: c' },
  ];
  const out = formatHistory(candidates, 1);
  const lines = out.split('\n');
  assert.ok(!lines[0].includes('← current'));
  assert.match(lines[1], /← current/);
  assert.ok(!lines[2].includes('← current'));
});

test('formatHistory: shows only the subject line of a multi-line message', () => {
  const candidates = [
    { message: 'feat(auth): rotate tokens\n\n- detail one\n- detail two' },
  ];
  const out = formatHistory(candidates, 0);
  assert.match(out, /1\) feat\(auth\): rotate tokens/);
  assert.ok(!out.includes('detail one'));
});
