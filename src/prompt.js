'use strict';

// The ten Conventional Commit types — the single source of truth, also used
// by the CLI to validate a `--type` override.
const TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore',
];

const SYSTEM_PROMPT = `You write high-quality git commit messages that follow the Conventional Commits specification.

Rules:
- Output ONLY the commit message. No preamble, no explanation, no markdown code fences.
- Format: a subject line "<type>(<scope>): <description>", then optionally a blank line and a body.
- type is exactly one of: feat, fix, docs, style, refactor, perf, test, build, ci, chore.
- Infer <scope> from the changed area or files; if no clear scope, omit "(<scope>)" entirely.
- Subject: imperative mood ("add", not "added" or "adds"), lower-case description, no trailing period, 72 characters or fewer.
- For non-trivial changes, add a body using "- " bullet points that explain WHAT changed and WHY. Wrap body lines at ~100 characters.
- For small or obvious changes, a single subject line is enough. Do not pad with a body.
- Describe only what the diff actually shows. Never invent changes that are not present.
- When recent commit subjects are provided, match their style and tone.

Choosing the type:
- fix: corrects faulty behaviour — a wrong condition, off-by-one, missing null/undefined or error handling, a crash, an incorrect result. Prefer fix whenever the change makes existing code behave correctly.
- feat: adds a new user-facing capability, command, or option that did not exist before.
- refactor: restructures code without changing its observable behaviour (rename, extract, simplify, deduplicate).
- perf: a change made specifically to improve performance.
- docs: documentation or comments only. style: formatting/whitespace only, no logic change. test: tests only.
- build: build system or dependency changes. ci: CI configuration. chore: routine maintenance that fits no other type.
- When the diff alone is ambiguous, prefer the type that matches the developer's stated intent, the branch name, or an explicitly required type if any of those are given below.`;

/** Build the chat messages array sent to the provider. */
function buildMessages({ diff, files, recentSubjects, branch, type, intent }) {
  const fileList = files
    .map((f) => `  ${f.status} ${f.path}`)
    .join('\n');

  const styleBlock = recentSubjects && recentSubjects.length
    ? `Recent commit subjects in this repo (match this style):\n${recentSubjects
        .map((s) => `  - ${s}`)
        .join('\n')}\n\n`
    : '';

  // Intent signals, listed most-authoritative first so the model weights them
  // ahead of a bare guess from the diff.
  let hints = '';
  if (type) {
    hints +=
      `The developer explicitly requires this commit type: "${type}". ` +
      `Use exactly this type for the subject line.\n`;
  }
  if (intent) {
    hints += `What the developer says they changed: ${intent}\n`;
  }
  if (branch) {
    hints +=
      `Current git branch: "${branch}". A fix/bugfix/hotfix/feat/chore/... ` +
      `prefix hints at the commit type, but the diff is authoritative.\n`;
  }
  if (hints) hints += '\n';

  const userContent =
    `${styleBlock}` +
    `${hints}` +
    `Staged files:\n${fileList}\n\n` +
    `Staged diff:\n\`\`\`diff\n${diff}\n\`\`\`\n\n` +
    `Write the commit message for these staged changes.`;

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];
}

/** Strip code fences and stray labels a model might wrap the message in. */
function clean(text) {
  let t = (text || '').trim();
  t = t.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '');
  t = t.replace(/^(commit message|message)\s*:\s*/i, '');
  return t.trim();
}

module.exports = { SYSTEM_PROMPT, TYPES, buildMessages, clean };
