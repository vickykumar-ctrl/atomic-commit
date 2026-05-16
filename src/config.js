'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const git = require('./git');
const { getProvider } = require('./providers');

const GLOBAL_PATH = path.join(os.homedir(), '.atomicrc');
const PROJECT_FILENAME = '.atomicrc';

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

/** Path to the project-level config (repo root, or cwd if not a repo). */
function projectConfigPath(cwd = process.cwd()) {
  return path.join(git.repoRoot(cwd) || cwd, PROJECT_FILENAME);
}

/**
 * Resolve effective config. Precedence (first wins):
 *   1. CLI flags
 *   2. environment variables
 *   3. project .atomicrc      (provider/model only — never a key)
 *   4. global ~/.atomicrc     (may hold the key)
 */
function loadConfig({ cwd = process.cwd(), flags = {} } = {}) {
  const global = readJson(GLOBAL_PATH);
  const project = readJson(projectConfigPath(cwd));

  const provider =
    flags.provider ||
    process.env.ATOMIC_PROVIDER ||
    project.provider ||
    global.provider ||
    'groq';

  const providerDef = getProvider(provider);

  // API key: flag > generic env > provider-specific env > global file.
  const apiKey =
    flags.apiKey ||
    process.env.ATOMIC_API_KEY ||
    process.env[providerDef.envKey] ||
    global.apiKey ||
    '';

  const model =
    flags.model ||
    process.env.ATOMIC_MODEL ||
    project.model ||
    global.model ||
    providerDef.defaultModel;

  const maxDiffChars =
    Number(flags.maxDiffChars) ||
    Number(project.maxDiffChars) ||
    Number(global.maxDiffChars) ||
    12000;

  return { provider, providerDef, apiKey, model, maxDiffChars };
}

/** Persist the global config with secure (0600) permissions. */
function saveGlobalConfig(data) {
  const existing = readJson(GLOBAL_PATH);
  const merged = { ...existing, ...data };
  fs.writeFileSync(GLOBAL_PATH, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(GLOBAL_PATH, 0o600);
  } catch {
    /* best effort on platforms without chmod */
  }
  return GLOBAL_PATH;
}

module.exports = {
  GLOBAL_PATH,
  PROJECT_FILENAME,
  projectConfigPath,
  loadConfig,
  saveGlobalConfig,
};
