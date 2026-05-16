'use strict';

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { produceMessage } = require('../src/core');
const { createTempRepo, createTempDir, writeAndStage } = require('./helpers');

const ORIGINAL_CWD = process.cwd();
afterEach(() => process.chdir(ORIGINAL_CWD));

/** Build a config object with a stubbed provider so no network call happens. */
function makeConfig({ generate, apiKey = 'test-key', maxDiffChars = 12000 } = {}) {
  return {
    provider: 'groq',
    providerDef: {
      name: 'groq',
      envKey: 'GROQ_API_KEY',
      generate: generate || (async () => 'feat: generated message'),
    },
    apiKey,
    model: 'test-model',
    maxDiffChars,
  };
}

test('produceMessage: throws NOT_A_REPO outside a git repository', async () => {
  process.chdir(createTempDir());
  await assert.rejects(produceMessage(makeConfig()), (err) => {
    assert.equal(err.code, 'NOT_A_REPO');
    return true;
  });
});

test('produceMessage: throws NO_STAGED when nothing is staged', async () => {
  process.chdir(createTempRepo());
  await assert.rejects(produceMessage(makeConfig()), (err) => {
    assert.equal(err.code, 'NO_STAGED');
    return true;
  });
});

test('produceMessage: throws NO_KEY when the API key is missing', async () => {
  const repo = createTempRepo();
  writeAndStage(repo, 'index.js', 'console.log(1);\n');
  process.chdir(repo);
  await assert.rejects(produceMessage(makeConfig({ apiKey: '' })), (err) => {
    assert.equal(err.code, 'NO_KEY');
    return true;
  });
});

test('produceMessage: lockfile-only change skips the provider entirely', async () => {
  const repo = createTempRepo();
  writeAndStage(repo, 'package-lock.json', '{}\n');
  process.chdir(repo);

  let called = false;
  const result = await produceMessage(
    makeConfig({
      generate: async () => {
        called = true;
        return 'should not run';
      },
    })
  );

  assert.equal(called, false);
  assert.equal(result.trivial, true);
  assert.equal(result.message, 'chore: update dependency lockfile');
});

test('produceMessage: real change calls the provider and cleans the result', async () => {
  const repo = createTempRepo();
  writeAndStage(repo, 'src/add.js', 'export const add = (a, b) => a + b;\n');
  process.chdir(repo);

  let seenMessages;
  const result = await produceMessage(
    makeConfig({
      generate: async ({ messages }) => {
        seenMessages = messages;
        return '```\nfeat(add): add an addition helper\n```';
      },
    })
  );

  assert.equal(result.trivial, false);
  assert.equal(result.message, 'feat(add): add an addition helper');
  // The staged diff must reach the provider.
  assert.match(seenMessages[1].content, /src\/add\.js/);
  assert.match(seenMessages[1].content, /addition helper|add = \(a, b\)/);
});

test('produceMessage: redacts secrets from the diff before sending it', async () => {
  const repo = createTempRepo();
  writeAndStage(repo, 'config.js', 'const KEY = "gsk_ABCDEFGHIJKLMNOPQRSTUVWX";\n');
  process.chdir(repo);

  let seenMessages;
  await produceMessage(
    makeConfig({
      generate: async ({ messages }) => {
        seenMessages = messages;
        return 'chore: add config';
      },
    })
  );

  const userContent = seenMessages[1].content;
  assert.ok(!userContent.includes('gsk_ABCDEFGHIJKLMNOPQRSTUVWX'), 'secret leaked');
  assert.match(userContent, /REDACTED/);
});

test('produceMessage: truncates an oversized diff before sending it', async () => {
  const repo = createTempRepo();
  writeAndStage(repo, 'big.txt', 'x'.repeat(8000) + '\n');
  process.chdir(repo);

  let seenMessages;
  await produceMessage(
    makeConfig({
      maxDiffChars: 1000,
      generate: async ({ messages }) => {
        seenMessages = messages;
        return 'chore: add big file';
      },
    })
  );

  assert.match(seenMessages[1].content, /truncated/);
});
