'use strict';

const { chatCompletion } = require('./openai-compatible');

/** OpenAI — same wire protocol as Groq, different host. */
module.exports = {
  name: 'openai',
  label: 'OpenAI',
  baseURL: 'https://api.openai.com/v1',
  envKey: 'OPENAI_API_KEY',
  defaultModel: 'gpt-4o-mini',
  suggestedModels: ['gpt-4o-mini', 'gpt-4o'],
  keyHint: 'starts with "sk-" — get one at https://platform.openai.com/api-keys',

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
