// Echo provider for development and tests: behaves like an OpenAI-compatible
// upstream without sending anything anywhere.

function lastUserText(messages = []) {
  const msg = [...messages].reverse().find((m) => m.role === 'user');
  if (!msg) return '';
  return typeof msg.content === 'string' ? msg.content : (msg.content ?? []).map((p) => p.text ?? '').join('');
}

export function createMockProvider(def) {
  return {
    id: def.id,
    name: def.name ?? def.id,
    isConfigured: () => true,
    async chatCompletions(body) {
      const text = `echo: ${lastUserText(body.messages)}`;
      const promptTokens = Math.ceil(JSON.stringify(body.messages ?? []).length / 4);
      const words = text.split(/(?<= )/);
      const usage = { prompt_tokens: promptTokens, completion_tokens: words.length, total_tokens: promptTokens + words.length };
      const id = `chatcmpl-mock-${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);

      if (!body.stream) {
        return Response.json({
          id, object: 'chat.completion', created, model: body.model,
          choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
          usage,
        });
      }

      const encoder = new TextEncoder();
      const event = (data) => encoder.encode(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
      const chunk = (delta, finish = null) => ({ id, object: 'chat.completion.chunk', created, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] });
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(event(chunk({ role: 'assistant', content: '' })));
          for (const w of words) controller.enqueue(event(chunk({ content: w })));
          controller.enqueue(event(chunk({}, 'stop')));
          if (body.stream_options?.include_usage) controller.enqueue(event({ id, object: 'chat.completion.chunk', created, model: body.model, choices: [], usage }));
          controller.enqueue(event('[DONE]'));
          controller.close();
        },
      });
      return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
    },
  };
}
