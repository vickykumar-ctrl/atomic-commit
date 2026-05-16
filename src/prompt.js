'use strict';

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
- When recent commit subjects are provided, match their style and tone.`;

/** Build the chat messages array sent to the provider. */
function buildMessages({ diff, files, recentSubjects }) {
  const fileList = files
    .map((f) => `  ${f.status} ${f.path}`)
    .join('\n');

  const styleBlock = recentSubjects && recentSubjects.length
    ? `Recent commit subjects in this repo (match this style):\n${recentSubjects
        .map((s) => `  - ${s}`)
        .join('\n')}\n\n`
    : '';

  const userContent =
    `${styleBlock}` +
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

module.exports = { SYSTEM_PROMPT, buildMessages, clean };
