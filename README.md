# atomic

**AI-assisted [Conventional Commit](https://www.conventionalcommits.org/) messages, generated from your staged diff.**

Stop staring at a blank commit message. `atomic` reads `git diff --staged`, asks an LLM to write a proper `type(scope): subject` message with a body, and lets you accept, edit, or regenerate it before committing.

You bring your own API key — **Groq**, **OpenAI**, or **Anthropic**. Groq is the default and is fast and cheap.

---

## Install

Requires **Node.js 18+**.

```bash
git clone https://github.com/vickykumar-ctrl/atomic-commit.git
cd atomic-commit
npm install -g .

# then, anywhere
atomic --help
```

## Setup

Run the one-time wizard — it stores your provider, key, and model in `~/.atomicrc` (chmod `600`):

```bash
atomic init
```

Or skip the file and use environment variables:

```bash
export GROQ_API_KEY=gsk_...
```

## Use

### CLI

```bash
git add .
atomic
```

```
┌─ proposed commit message ────────────────────────────
│ feat(auth): add refresh-token rotation on login
│
│ - issue a new refresh token on every successful login
│ - invalidate the previous token to limit replay windows
└──────────────────────────────────────────────────────

[a]ccept  [e]dit  [r]egenerate  [q]uit:
```

| Action | Result |
|--------|--------|
| `a`    | Commit with the message as-is |
| `e`    | Open `$EDITOR` to tweak it, then commit |
| `r`    | Generate a fresh suggestion |
| `l`    | List every suggestion from this session and jump back to one |
| `q`    | Abort — nothing is committed |

Every suggestion is kept for the session, so regenerating never loses an
earlier one. Once you've regenerated at least once, `l` lists them all
numbered — pick a number to return to that suggestion and accept it:

```
  1) feat: add login endpoint
  2) feat(auth): rotate refresh token on login
  3) feat(auth): add token rotation  ← current
Pick a number (or blank to cancel):
```

Useful flags:

```bash
atomic --yes              # commit immediately, no prompt
atomic --dry-run          # print the message only
atomic --provider openai --model gpt-4o-mini
atomic --type fix         # force the commit type (feat, fix, docs, refactor, ...)
atomic --max-diff-chars 9000   # raise/lower the diff size cap (default 6000)
atomic --no-verify        # pass through to git commit
```

### Getting the type right

A diff alone is ambiguous — a changed `if` could be a bug fix, a refactor, or a
feature. atomic uses three signals (most authoritative first) so it classifies
the commit correctly:

```bash
atomic --type fix                          # 1. you state the type outright
atomic "fixed the login crash on empty password"  # 2. a free-text intent hint
git checkout -b fix/login-crash && atomic  # 3. the branch name (fix/, hotfix/, feat/, ...)
```

With none of these, atomic still infers the type from the diff — the signals
just make a bug fix reliably come out as `fix:` instead of a guess.

### Git hook

Install a `prepare-commit-msg` hook so a plain `git commit` is pre-filled automatically:

```bash
atomic install-hook       # run inside the repo
```

Now `git commit` (without `-m`) opens your editor with an AI-generated message ready to review. It stays out of the way for `git commit -m`, merges, squashes, and amends. Bypass it once with:

```bash
ATOMIC_SKIP=1 git commit
```

Remove it with `atomic uninstall-hook` (a pre-existing hook is backed up and restored).

## Configuration

Precedence — first match wins:

1. CLI flags (`--provider`, `--model`)
2. Environment variables — `GROQ_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`, or generic `ATOMIC_API_KEY`, `ATOMIC_PROVIDER`, `ATOMIC_MODEL`
3. Project `./.atomicrc` — provider/model only, **never a key**
4. Global `~/.atomicrc` — may hold the key

```jsonc
// ~/.atomicrc
{
  "provider": "groq",
  "model": "openai/gpt-oss-120b",
  "apiKey": "gsk_...",
  "maxDiffChars": 6000
}
```

```jsonc
// ./.atomicrc  (safe to commit — keyless; pin the model per project)
{ "provider": "groq", "model": "llama-3.3-70b-versatile" }
```

`maxDiffChars` caps how much of the staged diff is sent to the model
(default `6000`). The default is sized for Groq's free tier — raise it on a
paid tier for more context, lower it if you hit a per-minute token limit.

## How it works

```
git add .
  │
  ▼
atomic ──► git diff --staged ──► redact secrets ──► truncate large diffs
  │                                                      │
  │                                                      ▼
  │                                          provider (Groq / OpenAI / Anthropic)
  │                                                      │
  ▼                                                      ▼
review loop  ◄──────────────  Conventional Commit message
  │
  ▼
git commit
```

Built-in safeguards:

- **Secret redaction** — known key patterns (`gsk_`, `sk-`, AWS keys, PEM blocks) are stripped before the diff leaves your machine.
- **Large diffs** — capped at `maxDiffChars` (default 6000) and truncated per-file so every changed file is still represented while staying within the provider's per-minute token limit.
- **Lockfile-only changes** — get a canned `chore:` message with no API call.
- **Hook safety** — the hook never blocks a commit; on any error it silently falls back to the normal editor.

## Tests

The suite uses Node's built-in test runner — no test dependencies:

```bash
npm test
```

It covers:

| File | What it checks |
|------|----------------|
| `test/providers.test.js` | Provider layer with a **mocked `fetch`** — request URL/headers/body, model fallback, error statuses, empty responses, network failures |
| `test/diff.test.js`      | Secret redaction, large-diff truncation, lockfile detection |
| `test/prompt.test.js`    | Prompt assembly and message cleanup |
| `test/config.test.js`    | Config precedence (flags > env > project > global) and secure save |
| `test/core.test.js`      | `produceMessage` end-to-end against temp repos with a stubbed provider |
| `test/git.test.js`       | Git helpers against real temporary repositories |
| `test/cli.test.js`       | CLI smoke tests run as a child process |

`fetch` is never called for real — `test/helpers.js` swaps in a mock that records every request, so the provider tests are fast and offline.

## Uninstall

First remove the git hook from any repo where you installed it (run inside that repo):

```bash
atomic uninstall-hook
```

Then uninstall the global command:

```bash
npm uninstall -g atomic-commit
```

Optionally delete your saved config — note it contains your API key:

```bash
rm ~/.atomicrc
```

## License

MIT
