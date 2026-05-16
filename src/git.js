'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/** Run a git command and return trimmed stdout. Throws on failure. */
function git(args, opts = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
    stdio: ['ignore', 'pipe', opts.inheritStderr ? 'inherit' : 'pipe'],
  }).trim();
}

/** True when the current working directory is inside a git work tree. */
function isGitRepo() {
  try {
    return git(['rev-parse', '--is-inside-work-tree']) === 'true';
  } catch {
    return false;
  }
}

/** Absolute path to the repository root, or null if not in a repo. */
function repoRoot(cwd = process.cwd()) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      cwd,
    }).trim();
  } catch {
    return null;
  }
}

/** Absolute path to the .git directory (handles worktrees / submodules). */
function gitDir() {
  return path.resolve(repoRoot() || '.', git(['rev-parse', '--git-dir']));
}

/** The full staged diff (`git diff --staged`). */
function stagedDiff() {
  return git(['diff', '--staged', '--no-color']);
}

/**
 * Staged files as [{ status, path }]. Status is the first letter of
 * git's name-status output: A added, M modified, D deleted, R renamed...
 */
function stagedFiles() {
  const out = git(['diff', '--staged', '--name-status', '--no-color']);
  if (!out) return [];
  return out.split('\n').map((line) => {
    const parts = line.split('\t');
    const status = parts[0][0];
    // For renames/copies the new path is the last column.
    const filePath = parts[parts.length - 1];
    return { status, path: filePath };
  });
}

/** Recent commit subject lines, for style reference. Empty on a fresh repo. */
function recentSubjects(count = 10) {
  try {
    const out = git(['log', `-${count}`, '--pretty=%s']);
    return out ? out.split('\n') : [];
  } catch {
    return [];
  }
}

/** Create a commit with the given message. Uses a temp file to keep newlines. */
function commit(message, { noVerify = false } = {}) {
  const tmp = path.join(os.tmpdir(), `atomic-msg-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(tmp, message);
  try {
    const args = ['commit', '-F', tmp];
    if (noVerify) args.push('--no-verify');
    execFileSync('git', args, { stdio: 'inherit' });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

module.exports = {
  isGitRepo,
  repoRoot,
  gitDir,
  stagedDiff,
  stagedFiles,
  recentSubjects,
  commit,
};
