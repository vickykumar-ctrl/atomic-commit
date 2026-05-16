'use strict';

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const git = require('../src/git');
const { createTempRepo, createTempDir, writeAndStage, gitC } = require('./helpers');

const ORIGINAL_CWD = process.cwd();
afterEach(() => process.chdir(ORIGINAL_CWD));

test('isGitRepo: true inside a repo, false outside one', () => {
  process.chdir(createTempRepo());
  assert.equal(git.isGitRepo(), true);

  process.chdir(createTempDir());
  assert.equal(git.isGitRepo(), false);
});

test('stagedFiles: reports status and path for each staged file', () => {
  const repo = createTempRepo();
  writeAndStage(repo, 'a.js', 'const a = 1;\n');
  writeAndStage(repo, 'b.js', 'const b = 2;\n');
  process.chdir(repo);

  const files = git.stagedFiles();
  assert.equal(files.length, 2);
  assert.deepEqual(
    files.map((f) => f.path).sort(),
    ['a.js', 'b.js']
  );
  assert.ok(files.every((f) => f.status === 'A'));
});

test('stagedFiles: returns an empty array when nothing is staged', () => {
  process.chdir(createTempRepo());
  assert.deepEqual(git.stagedFiles(), []);
});

test('stagedDiff: contains the staged content', () => {
  const repo = createTempRepo();
  writeAndStage(repo, 'hello.js', 'console.log("hi");\n');
  process.chdir(repo);

  const diff = git.stagedDiff();
  assert.match(diff, /hello\.js/);
  assert.match(diff, /console\.log\("hi"\)/);
});

test('recentSubjects: empty on a fresh repo, populated after a commit', () => {
  const repo = createTempRepo();
  process.chdir(repo);
  assert.deepEqual(git.recentSubjects(), []);

  writeAndStage(repo, 'x.js', 'const x = 1;\n');
  gitC(repo, ['commit', '-m', 'feat: first commit', '--no-verify']);
  assert.deepEqual(git.recentSubjects(5), ['feat: first commit']);
});

test('commit: creates a commit and preserves a multi-line message', () => {
  const repo = createTempRepo();
  writeAndStage(repo, 'file.js', 'const v = 1;\n');
  process.chdir(repo);

  const message = 'feat: add file\n\n- introduces a value constant\n- used by callers';
  git.commit(message, { noVerify: true });

  const body = gitC(repo, ['log', '-1', '--pretty=%B']);
  assert.equal(body, message);
});
