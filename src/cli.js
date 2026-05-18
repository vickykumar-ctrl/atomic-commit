'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const git = require('./git');
const { produceMessage } = require('./core');
const { loadConfig, saveGlobalConfig, GLOBAL_PATH } = require('./config');
const { registry, getProvider } = require('./providers');
const hook = require('./hook/install');

const { version } = require('../package.json');

// ── tiny terminal helpers ────────────────────────────────────────────────
const tty = process.stdout.isTTY;
const c = {
  dim: (s) => (tty ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (tty ? `\x1b[1m${s}\x1b[0m` : s),
  green: (s) => (tty ? `\x1b[32m${s}\x1b[0m` : s),
  red: (s) => (tty ? `\x1b[31m${s}\x1b[0m` : s),
  cyan: (s) => (tty ? `\x1b[36m${s}\x1b[0m` : s),
  yellow: (s) => (tty ? `\x1b[33m${s}\x1b[0m` : s),
};

function out(s = '') {
  process.stdout.write(`${s}\n`);
}

// A single readline interface is shared across every prompt, and every input
// line is captured into a queue as it arrives. readline emits all buffered
// `line` events synchronously when input arrives in one chunk; a fresh
// interface per question — or rl.question() alone — only keeps the line it is
// waiting on and drops the rest, breaking piped/scripted input and fast typing.
let sharedRl = null;
let lineQueue = [];
let pendingWaiter = null;
let inputEnded = false;

function input() {
  if (sharedRl) return sharedRl;
  lineQueue = [];
  pendingWaiter = null;
  inputEnded = false;
  sharedRl = readline.createInterface({ input: process.stdin, output: process.stdout });
  sharedRl.on('line', (line) => {
    if (pendingWaiter) {
      const waiter = pendingWaiter;
      pendingWaiter = null;
      waiter(line);
    } else {
      lineQueue.push(line);
    }
  });
  sharedRl.on('close', () => {
    inputEnded = true;
    if (pendingWaiter) {
      const waiter = pendingWaiter;
      pendingWaiter = null;
      waiter('');
    }
  });
  return sharedRl;
}

/** Close the shared readline interface so the process can exit. */
function closeInput() {
  if (sharedRl) {
    sharedRl.close();
    sharedRl = null;
  }
}

/** Ask a question on stdin and resolve with the trimmed answer. */
function ask(question) {
  const rl = input();
  return new Promise((resolve) => {
    if (lineQueue.length) {
      resolve(lineQueue.shift().trim());
      return;
    }
    if (inputEnded) {
      resolve('');
      return;
    }
    pendingWaiter = (line) => resolve(String(line).trim());
    rl.setPrompt(question);
    rl.prompt();
  });
}

/** Run a lightweight spinner while `promise` is pending. */
async function withSpinner(label, promise) {
  if (!tty) return promise;
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const timer = setInterval(() => {
    process.stdout.write(`\r${c.cyan(frames[i++ % frames.length])} ${label}`);
  }, 80);
  try {
    return await promise;
  } finally {
    clearInterval(timer);
    process.stdout.write(`\r${' '.repeat(label.length + 4)}\r`);
  }
}

/** Open the user's $EDITOR on `initial` text and return the saved result. */
function editInEditor(initial) {
  // Release stdin so the editor gets a clean terminal; ask() lazily reopens.
  closeInput();
  const tmp = path.join(os.tmpdir(), `atomic-edit-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(tmp, initial);
  const editor = process.env.VISUAL || process.env.EDITOR || 'vi';
  const [bin, ...rest] = editor.split(' ');
  const res = spawnSync(bin, [...rest, tmp], { stdio: 'inherit' });
  let result = initial;
  if (!res.error) result = fs.readFileSync(tmp, 'utf8').trim();
  fs.rmSync(tmp, { force: true });
  return result;
}

function printBox(message, label = '') {
  const title = `proposed commit message${label ? ` ${label}` : ''}`;
  out();
  out(c.dim(`┌─ ${title} ` + '─'.repeat(Math.max(2, 51 - title.length))));
  for (const line of message.split('\n')) out(c.dim('│ ') + line);
  out(c.dim('└' + '─'.repeat(54)));
  out();
}

/**
 * Render the in-session suggestion history as a numbered list, marking the
 * entry the user is currently viewing. Pure — exported for unit testing.
 */
function formatHistory(candidates, currentIndex) {
  return candidates
    .map((candidate, i) => {
      const subject = candidate.message.split('\n')[0];
      const marker = i === currentIndex ? c.cyan('  ← current') : '';
      return `  ${i + 1}) ${subject}${marker}`;
    })
    .join('\n');
}

// ── argument parsing ─────────────────────────────────────────────────────
function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--yes' || a === '-y') flags.yes = true;
    else if (a === '--dry-run' || a === '-n') flags.dryRun = true;
    else if (a === '--no-verify') flags.noVerify = true;
    else if (a === '--help' || a === '-h') flags.help = true;
    else if (a === '--version' || a === '-v') flags.version = true;
    else if (a === '--provider') flags.provider = argv[++i];
    else if (a === '--model') flags.model = argv[++i];
    else if (a === '--max-diff-chars') flags.maxDiffChars = argv[++i];
    else if (a.startsWith('--provider=')) flags.provider = a.slice(11);
    else if (a.startsWith('--model=')) flags.model = a.slice(8);
    else if (a.startsWith('--max-diff-chars=')) flags.maxDiffChars = a.slice(17);
    else positional.push(a);
  }
  return { flags, positional };
}

const HELP = `${c.bold('atomic')} — AI-assisted Conventional Commit messages

${c.bold('Usage')}
  atomic                 Generate a message for staged changes, then commit
  atomic init            Set up your provider, API key and model
  atomic install-hook    Install the prepare-commit-msg git hook in this repo
  atomic uninstall-hook  Remove the git hook
  atomic --help          Show this help

${c.bold('Options')}
  -y, --yes          Commit immediately without the review prompt
  -n, --dry-run      Print the message only; do not commit
      --no-verify    Pass --no-verify to git commit
      --provider <p> Override provider (groq | openai | anthropic)
      --model <m>    Override the model
      --max-diff-chars <n>  Cap the diff sent to the model (default 6000)
  -v, --version      Print version

${c.bold('Config')}  precedence: flags > env vars > ./.atomicrc > ~/.atomicrc
  API key env vars:  GROQ_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY
                     (or the generic ATOMIC_API_KEY)
`;

// ── commands ─────────────────────────────────────────────────────────────

async function cmdInit() {
  out(c.bold('\natomic setup\n'));

  const names = Object.keys(registry);
  out('Providers:');
  names.forEach((n, i) => out(`  ${i + 1}) ${registry[n].label}`));
  const pick = await ask(`Choose a provider [1-${names.length}] (1): `);
  const provider = names[(parseInt(pick, 10) || 1) - 1] || names[0];
  const def = getProvider(provider);

  out(`\n${def.label} API key — ${c.dim(def.keyHint)}`);
  const apiKey = await ask('Paste your API key: ');
  if (!apiKey) throw new Error('no API key entered — aborting');

  out(`\nSuggested models: ${def.suggestedModels.join(', ')}`);
  const modelInput = await ask(`Model (${def.defaultModel}): `);
  const model = modelInput || def.defaultModel;

  const saved = saveGlobalConfig({ provider, apiKey, model });
  out(c.green(`\n✓ Saved to ${saved} (permissions 600).`));
  out(c.dim('  Run `atomic` in a repo with staged changes to try it.\n'));
}

function cmdInstallHook() {
  const target = hook.install();
  out(c.green(`✓ Installed git hook: ${target}`));
  out(c.dim('  Now `git commit` (without -m) will pre-fill an AI message.'));
  out(c.dim('  Bypass once with: ATOMIC_SKIP=1 git commit'));
}

function cmdUninstallHook() {
  const target = hook.uninstall();
  if (target) out(c.green(`✓ Removed git hook: ${target}`));
  else out(c.yellow('No atomic hook was installed.'));
}

/** `atomic hook <file>` — invoked by the git hook. Must never throw. */
async function cmdHook(file) {
  try {
    if (!file || !fs.existsSync(file)) return;
    const existing = fs.readFileSync(file, 'utf8');
    // If the user already typed a real (non-comment) message, leave it alone.
    const userText = existing
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#'))
      .join('')
      .trim();
    if (userText) return;

    const config = loadConfig();
    const { message } = await produceMessage(config);
    fs.writeFileSync(file, `${message}\n\n${existing}`);
  } catch {
    // Swallow everything: a failing hook must not block the commit.
  }
}

async function cmdGenerate(flags) {
  const config = loadConfig({ flags });

  let result;
  try {
    result = await withSpinner(
      `generating message with ${config.providerDef.label} (${config.model})…`,
      produceMessage(config)
    );
  } catch (err) {
    if (err.code === 'NO_STAGED') {
      out(c.yellow('Nothing staged. Stage changes with `git add` first.'));
      process.exitCode = 1;
      return;
    }
    if (err.code === 'NOT_A_REPO') {
      out(c.red('Not a git repository.'));
      process.exitCode = 1;
      return;
    }
    if (err.code === 'NO_KEY') {
      out(c.red(err.message));
      process.exitCode = 1;
      return;
    }
    if (err.code === 'TOO_LARGE') {
      out(c.red(`${err.message}.`));
      out(c.dim('  Stage fewer files or commit in smaller chunks,'));
      out(c.dim('  lower --max-diff-chars, or upgrade your provider tier.'));
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  // Every suggestion is kept for this run so the user can return to an
  // earlier one instead of being stuck regenerating.
  const candidates = [{ message: result.message, trivial: result.trivial }];
  let currentIndex = 0;

  if (flags.dryRun) {
    out(candidates[0].message);
    return;
  }

  if (flags.yes) {
    git.commit(candidates[0].message, { noVerify: flags.noVerify });
    out(c.green('✓ Committed.'));
    return;
  }

  // Interactive review loop.
  for (;;) {
    const current = candidates[currentIndex];
    const message = current.message;
    const counter = candidates.length > 1 ? `(${currentIndex + 1}/${candidates.length})` : '';
    printBox(message, counter);
    if (current.trivial) out(c.dim('(lockfile-only change — generated without an API call)'));

    const listOption = candidates.length > 1 ? `  ${c.bold('[l]')}ist` : '';
    const choice = (
      await ask(
        `${c.bold('[a]')}ccept  ${c.bold('[e]')}dit  ${c.bold('[r]')}egenerate${listOption}  ${c.bold('[q]')}uit: `
      )
    ).toLowerCase();

    if (choice === 'a' || choice === '') {
      git.commit(message, { noVerify: flags.noVerify });
      out(c.green('✓ Committed.'));
      return;
    }
    if (choice === 'e') {
      const edited = editInEditor(message);
      if (!edited) {
        out(c.yellow('Empty message — aborted.'));
        return;
      }
      git.commit(edited, { noVerify: flags.noVerify });
      out(c.green('✓ Committed.'));
      return;
    }
    if (choice === 'r') {
      let next;
      try {
        next = await withSpinner('regenerating…', produceMessage(config));
      } catch (err) {
        if (err.code === 'TOO_LARGE') {
          out(c.red(`${err.message}.`));
          out(c.dim('  Lower --max-diff-chars or stage fewer files, then try again.'));
        } else {
          out(c.red(`Regeneration failed: ${err.message}`));
        }
        continue;
      }
      const duplicate = candidates.findIndex((cdt) => cdt.message === next.message);
      if (duplicate !== -1) {
        currentIndex = duplicate;
        out(c.dim('That suggestion matches an earlier one — showing it.'));
      } else {
        candidates.push({ message: next.message, trivial: next.trivial });
        currentIndex = candidates.length - 1;
      }
      continue;
    }
    if (choice === 'l' && candidates.length > 1) {
      out();
      out(formatHistory(candidates, currentIndex));
      const pick = await ask('Pick a number (or blank to cancel): ');
      if (pick === '') continue;
      const n = Number(pick);
      if (!Number.isInteger(n) || n < 1 || n > candidates.length) {
        out(c.yellow(`Enter a number between 1 and ${candidates.length}.`));
        continue;
      }
      currentIndex = n - 1;
      continue;
    }
    if (choice === 'q') {
      out(c.dim('Aborted — nothing committed.'));
      return;
    }
    out(c.yellow(`Please enter ${candidates.length > 1 ? 'a, e, r, l, or q' : 'a, e, r, or q'}.`));
  }
}

// ── entrypoint ───────────────────────────────────────────────────────────
async function run(argv) {
  const { flags, positional } = parseArgs(argv);

  if (flags.version) return out(version);
  if (flags.help) return out(HELP);

  const command = positional[0];
  try {
    switch (command) {
      case undefined:
        await cmdGenerate(flags);
        break;
      case 'init':
        await cmdInit();
        break;
      case 'install-hook':
        cmdInstallHook();
        break;
      case 'uninstall-hook':
        cmdUninstallHook();
        break;
      case 'hook':
        await cmdHook(positional[1]);
        break;
      case 'help':
        out(HELP);
        break;
      default:
        out(c.red(`unknown command "${command}"`));
        out(HELP);
        process.exitCode = 1;
    }
  } finally {
    // Always release stdin, otherwise an open readline keeps the process alive.
    closeInput();
  }
}

module.exports = { run, formatHistory };
