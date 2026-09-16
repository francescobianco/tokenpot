// Adapter for any upstream exposing the OpenAI Chat Completions API
// (OpenAI, OpenRouter, Together, Groq, vLLM, ...).

export function createOpenAICompatibleProvider(def, { env, fetch = globalThis.fetch }) {
  const apiKey = def.api_key_env ? env[def.api_key_env] : null;
  const baseUrl = String(def.base_url ?? '').replace(/\/+$/, '');
  const timeoutMs = (def.timeout_seconds ?? 300) * 1000;

  return {
    id: def.id,
    name: def.name ?? def.id,
    isConfigured: () => Boolean(baseUrl && apiKey),
    chatCompletions(body, { signal } = {}) {
      const signals = [AbortSignal.timeout(timeoutMs)];
      if (signal) signals.push(signal);
      return fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}`, ...(def.headers ?? {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.any(signals),
      });
    },
  };
}
