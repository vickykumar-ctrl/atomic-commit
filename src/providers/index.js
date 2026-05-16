'use strict';

const groq = require('./groq');
const openai = require('./openai');
const anthropic = require('./anthropic');

const registry = { groq, openai, anthropic };

/** Look up a provider by name, throwing a helpful error if unknown. */
function getProvider(name) {
  const provider = registry[name];
  if (!provider) {
    throw new Error(
      `unknown provider "${name}". Available: ${Object.keys(registry).join(', ')}`
    );
  }
  return provider;
}

module.exports = { getProvider, registry };
