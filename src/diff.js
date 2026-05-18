'use strict';

// Lockfiles and other generated artifacts that don't need an LLM call.
const LOCKFILES = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|composer\.lock|Gemfile\.lock|poetry\.lock|Cargo\.lock)$/;

/**
 * If every staged file is a dependency lockfile, return a ready-made
 * `chore:` message so we can skip the LLM entirely. Otherwise null.
 */
function classifyTrivial(files) {
  if (files.length === 0) return null;
  if (files.every((f) => LOCKFILES.test(f.path))) {
    return 'chore: update dependency lockfile';
  }
  return null;
}

// Patterns for secrets that must never leave the developer's machine.
const SECRET_RULES = [
  // Known key prefixes (Groq gsk_, OpenAI sk-, GitHub ghp_/github_pat_, Anthropic sk-ant-).
  {
    re: /\b(sk-ant-|gsk_|github_pat_|ghp_|sk-)[A-Za-z0-9_-]{12,}/g,
    fn: (m, p1) => `${p1}***REDACTED***`,
  },
  // AWS access key IDs.
  { re: /\bAKIA[0-9A-Z]{16}\b/g, fn: () => '***REDACTED-AWS-KEY***' },
  // PEM private key blocks.
  {
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    fn: () => '***REDACTED-PRIVATE-KEY***',
  },
  // Generic `key = "value"` / `password: value` assignments.
  {
    re: /\b(api[_-]?key|secret|token|password|passwd|auth)(["'\s:=]+)([^\s"',]{8,})/gi,
    fn: (m, k, sep) => `${k}${sep}***REDACTED***`,
  },
];

/** Best-effort redaction of obvious secrets from a diff before sending it. */
function redactSecrets(text) {
  let out = text;
  for (const { re, fn } of SECRET_RULES) out = out.replace(re, fn);
  return out;
}

// Room reserved per file for the "... [N chars truncated]" note so the
// truncated output as a whole still fits inside `maxChars`.
const TRUNCATE_NOTE = 60;
// Below this per-file budget there is no point showing hunks at all.
const MIN_HUNK_BUDGET = 200;

/**
 * Keep the diff at or under `maxChars`. Splits by file and truncates each
 * file's hunk proportionally so the model still sees every changed file.
 * When too many files are staged for any meaningful per-file budget, falls
 * back to listing just the file headers. The result never exceeds `maxChars`.
 */
function truncate(diffText, maxChars) {
  if (diffText.length <= maxChars) return diffText;

  const sections = diffText.split(/(?=^diff --git )/m).filter(Boolean);
  if (sections.length === 0) {
    return `${diffText.slice(0, maxChars)}\n... [diff truncated]\n`;
  }

  const budget = Math.floor(maxChars / sections.length);

  // Too many files to show real hunks — keep just the per-file header lines
  // so every file is still represented without blowing the size cap.
  if (budget < MIN_HUNK_BUDGET) {
    const note = `... [${sections.length} files staged — diff bodies omitted]\n`;
    let out = '';
    for (const section of sections) {
      const header = `${section.split('\n')[0]}\n`;
      if (out.length + header.length > maxChars - note.length) break;
      out += header;
    }
    return `${out}${note}`;
  }

  return sections
    .map((section) => {
      if (section.length <= budget) return section;
      const keep = budget - TRUNCATE_NOTE;
      const dropped = section.length - keep;
      return `${section.slice(0, keep)}\n... [${dropped} chars truncated for this file]\n`;
    })
    .join('');
}

module.exports = { classifyTrivial, redactSecrets, truncate };
