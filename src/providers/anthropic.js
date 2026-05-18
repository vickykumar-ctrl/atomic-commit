'use strict';

/** Anthropic — uses the Messages API, which keeps `system` separate. */
module.exports = {
  name: 'anthropic',
  label: 'Anthropic (Claude)',
  baseURL: 'https://api.anthropic.com/v1',
  envKey: 'ANTHROPIC_API_KEY',
  defaultModel: 'claude-haiku-4-5-20251001',
  suggestedModels: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'],
  keyHint: 'starts with "sk-ant-" — get one at https://console.anthropic.com/settings/keys',

  async generate({ apiKey, model, messages, signal }) {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const rest = messages.filter((m) => m.role !== 'system');

    let res;
    try {
      res = await fetch(`${this.baseURL}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model || this.defaultModel,
          max_tokens: 400,
          temperature: 0.3,
          system,
          messages: rest,
        }),
        signal,
      });
    } catch (err) {
      throw new Error(`network error reaching ${this.baseURL}: ${err.message}`);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 413 || (res.status === 429 && /too large/i.test(body))) {
        const err = new Error(
          `the staged diff is too large for ${model || this.defaultModel}'s per-minute token limit`
        );
        err.code = 'TOO_LARGE';
        throw err;
      }
      throw new Error(`API responded ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    const content = data.content && data.content[0] ? data.content[0].text : '';
    if (!content || !content.trim()) {
      throw new Error('API returned an empty response');
    }
    return content.trim();
  },
};
