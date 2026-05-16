'use strict';

const fs = require('fs');
const path = require('path');
const git = require('../git');

const HOOK_NAME = 'prepare-commit-msg';
const TEMPLATE = path.join(__dirname, 'prepare-commit-msg.tmpl');
const MARKER = 'atomic — AI-assisted commit messages';

/** Absolute path to the installed `bin/atomic.js` entrypoint. */
function binPath() {
  return path.resolve(__dirname, '..', '..', 'bin', 'atomic.js');
}

function hooksDir() {
  if (!git.isGitRepo()) {
    throw new Error('not inside a git repository — run this from your project');
  }
  // Respect a configured core.hooksPath if the project uses one.
  let dir;
  try {
    const { execFileSync } = require('child_process');
    const configured = execFileSync('git', ['config', '--get', 'core.hooksPath'], {
      encoding: 'utf8',
    }).trim();
    dir = configured
      ? path.resolve(git.repoRoot(), configured)
      : path.join(git.gitDir(), 'hooks');
  } catch {
    dir = path.join(git.gitDir(), 'hooks');
  }
  return dir;
}

/** Install the prepare-commit-msg hook into the current repo. */
function install() {
  const dir = hooksDir();
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, HOOK_NAME);

  // Preserve a foreign existing hook by backing it up.
  if (fs.existsSync(target)) {
    const current = fs.readFileSync(target, 'utf8');
    if (!current.includes(MARKER)) {
      const backup = `${target}.pre-atomic`;
      fs.copyFileSync(target, backup);
      process.stdout.write(`Existing hook backed up to ${backup}\n`);
    }
  }

  const script = fs
    .readFileSync(TEMPLATE, 'utf8')
    .replace('__NODE__', process.execPath)
    .replace('__BIN__', binPath());

  fs.writeFileSync(target, script, { mode: 0o755 });
  fs.chmodSync(target, 0o755);
  return target;
}

/** Remove the hook, restoring a backed-up hook if one exists. */
function uninstall() {
  const dir = hooksDir();
  const target = path.join(dir, HOOK_NAME);

  if (!fs.existsSync(target)) return null;
  const current = fs.readFileSync(target, 'utf8');
  if (!current.includes(MARKER)) {
    throw new Error(`${target} was not installed by atomic — leaving it untouched`);
  }

  const backup = `${target}.pre-atomic`;
  if (fs.existsSync(backup)) {
    fs.copyFileSync(backup, target);
    fs.rmSync(backup, { force: true });
  } else {
    fs.rmSync(target, { force: true });
  }
  return target;
}

module.exports = { install, uninstall, HOOK_NAME };
