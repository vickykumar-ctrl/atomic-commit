'use strict';

// Shared test utilities: a mock for global `fetch` and temp git repos.
// Not a test file itself (name does not match the runner's pattern).

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Replace global.fetch with a stub driven by `handler(url, opts)`.
 * Returns { calls, restore }. Each call records { url, opts, body }.
 */
function mockFetch(handler) {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    let body;
    try {
      body = opts.body ? JSON.parse(opts.body) : undefined;
    } catch {
      body = opts.body;
    }
    calls.push({ url, opts, body });
    return handler(url, opts);
  };
  return {
    calls,
    restore() {
      global.fetch = original;
    },
  };
}

/** Build a successful JSON Response-like object. */
function jsonResponse(body, { status = 200, statusText = 'OK' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** Build a failed Response-like object whose `text()` is the error body. */
function errorResponse(status, bodyText, statusText = 'Error') {
  return {
    ok: false,
    status,
    statusText,
    json: async () => ({}),
    text: async () => bodyText,
  };
}

/** Run a git command inside `dir` and return trimmed stdout. */
function gitC(dir, args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
}

/** Create an initialized, configured temp git repository. Returns its path. */
function createTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-test-'));
  gitC(dir, ['init', '-q']);
  gitC(dir, ['config', 'user.email', 'test@example.com']);
  gitC(dir, ['config', 'user.name', 'Test']);
  gitC(dir, ['config', 'commit.gpgsign', 'false']);
  return dir;
}

/** Write `content` to `file` inside `dir` and stage it. */
function writeAndStage(dir, file, content) {
  const full = path.join(dir, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  gitC(dir, ['add', file]);
}

/** A throwaway directory that is NOT a git repository. */
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-plain-'));
}

module.exports = {
  mockFetch,
  jsonResponse,
  errorResponse,
  gitC,
  createTempRepo,
  createTempDir,
  writeAndStage,
};
