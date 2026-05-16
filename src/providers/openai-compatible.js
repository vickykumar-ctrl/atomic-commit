'use strict';

/**
 * Call any OpenAI-compatible `/chat/completions` endpoint.
 * Groq and OpenAI both speak this protocol; only the baseURL differs.
 */
async function chatCompletion({ baseURL, apiKey, model, messages, signal }) {
  let res;
  try {
    res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 600,
      }),
      signal,
    });
  } catch (err) {
    throw new Error(`network error reaching ${baseURL}: ${err.message}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API responded ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : '';
  if (!content || !content.trim()) {
    throw new Error('API returned an empty response');
  }
  return content.trim();
}

module.exports = { chatCompletion };
