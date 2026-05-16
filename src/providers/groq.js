'use strict';

const { chatCompletion } = require('./openai-compatible');

/** Groq — OpenAI-compatible API, very fast inference. */
module.exports = {
  name: 'groq',
  label: 'Groq',
  baseURL: 'https://api.groq.com/openai/v1',
  envKey: 'GROQ_API_KEY',
  defaultModel: 'openai/gpt-oss-120b',
  suggestedModels: [
    'openai/gpt-oss-120b',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
  ],
  keyHint: 'starts with "gsk_" — get one at https://console.groq.com/keys',

  generate({ apiKey, model, messages, signal }) {
    return chatCompletion({
      baseURL: this.baseURL,
      apiKey,
      model: model || this.defaultModel,
      messages,
      signal,
    });
  },
};
