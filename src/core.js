'use strict';

const git = require('./git');
const diff = require('./diff');
const prompt = require('./prompt');

/** Error with a `.code` field so callers can branch on the cause. */
function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Produce a commit message for the currently staged changes.
 * Returns { message, files, trivial }.
 *
 * Throws with err.code one of:
 *   NOT_A_REPO   - cwd is not inside a git repository
 *   NO_STAGED    - nothing is staged
 *   NO_KEY       - no API key configured for the chosen provider
 *   (other)      - provider / network error
 */
async function produceMessage(config, { signal } = {}) {
  if (!git.isGitRepo()) {
    throw fail('NOT_A_REPO', 'not inside a git repository');
  }

  const files = git.stagedFiles();
  if (files.length === 0) {
    throw fail('NO_STAGED', 'no staged changes — run `git add` first');
  }

  // Lockfile-only changes get a canned message; no LLM call needed.
  const trivial = diff.classifyTrivial(files);
  if (trivial) {
    return { message: trivial, files, trivial: true };
  }

  if (!config.apiKey) {
    throw fail(
      'NO_KEY',
      `no API key for provider "${config.provider}". ` +
        `Run \`atomic init\` or set ${config.providerDef.envKey}.`
    );
  }

  let staged = git.stagedDiff();
  staged = diff.redactSecrets(staged);
  staged = diff.truncate(staged, config.maxDiffChars);

  const messages = prompt.buildMessages({
    diff: staged,
    files,
    recentSubjects: git.recentSubjects(10),
  });

  const raw = await config.providerDef.generate({
    apiKey: config.apiKey,
    model: config.model,
    messages,
    signal,
  });

  return { message: prompt.clean(raw), files, trivial: false };
}

module.exports = { produceMessage };
