import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../server.js';
import { upsertUser, regenerateKey } from '../packages/auth/index.js';
import { recordUsage } from '../packages/accounting/index.js';
import { testContext } from './helpers.js';

let server, base, ctx, key, user;

before(async () => {
  ({ ctx } = testContext());
  server = createServer(createApp(ctx));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  user = upsertUser(ctx.db, { githubId: 42, login: 'alice' });
  ({ key } = regenerateKey(ctx.db, user.id));
});

after(() => server.close());

const chat = (body, apiKey = key) => fetch(`${base}/v1/chat/completions`, {
  method: 'POST',
  headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const events = () => ctx.db.prepare('SELECT * FROM usage_events ORDER BY id').all();

test('lists models including aliases that have a usable provider', async () => {
  const res = await fetch(`${base}/v1/models`);
  const ids = (await res.json()).data.map((m) => m.id);
  assert.ok(ids.includes('dev/echo'));
  assert.ok(!ids.includes('community/fast'), 'openrouter has no key in tests');
});

test('rejects missing and invalid keys', async () => {
  assert.equal((await chat({ model: 'dev/echo', messages: [{ role: 'user', content: 'hi' }] }, '')).status, 401);
  const res = await chat({ model: 'dev/echo', messages: [{ role: 'user', content: 'hi' }] }, 'sk_live_nope');
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, 'invalid_api_key');
});

test('unknown model is a 404 in OpenAI format', async () => {
  const res = await chat({ model: 'nope/nope', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, 'model_not_found');
});

test('non-streaming completion is proxied and accounted', async () => {
  const res = await chat({ model: 'dev/echo', messages: [{ role: 'user', content: 'hello pool' }] });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.choices[0].message.content, 'echo: hello pool');
  const e = events().at(-1);
  assert.equal(e.user_id, user.id);
  assert.equal(e.provider, 'mock');
  assert.equal(e.status, 200);
  assert.equal(e.prompt_tokens, json.usage.prompt_tokens);
  assert.ok(e.credits > 0);
  assert.equal(e.period, '2026-09');
});

test('streaming completion relays SSE, strips the usage chunk unless requested, and records usage', async () => {
  const res = await chat({ model: 'dev/echo', stream: true, messages: [{ role: 'user', content: 'one two three' }] });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const text = await res.text();
  assert.ok(text.trim().endsWith('data: [DONE]'));
  const chunks = text.split('\n\n').filter((b) => b.startsWith('data: {')).map((b) => JSON.parse(b.slice(6)));
  assert.equal(chunks.map((c) => c.choices[0]?.delta?.content ?? '').join(''), 'echo: one two three');
  assert.ok(chunks.every((c) => !c.usage));
  const e = events().at(-1);
  assert.equal(e.estimated, 0);
  assert.equal(e.completion_tokens, 4);

  const withUsage = await (await chat({ model: 'dev/echo', stream: true, stream_options: { include_usage: true }, messages: [{ role: 'user', content: 'x' }] })).text();
  assert.match(withUsage, /"usage"/);
});

test('max_tokens is capped to the model limit', async () => {
  const { prepareUpstreamBody } = await import('../apps/gateway/handler.js');
  const model = { max_output_tokens: 100 };
  assert.equal(prepareUpstreamBody({ max_tokens: 5000 }, model).max_tokens, 100);
  assert.equal(prepareUpstreamBody({}, model).max_tokens, 100);
  assert.deepEqual(prepareUpstreamBody({ max_completion_tokens: 50 }, model), { max_completion_tokens: 50 });
  assert.deepEqual(prepareUpstreamBody({ stream: true }, model).stream_options, { include_usage: true });
});

test('exhausted pool returns insufficient_quota', async () => {
  // single member pool: 5 USD * 0.85 * 1000 = 4250 CC
  recordUsage(ctx.db, { userId: user.id, keyId: 1, period: '2026-09', createdAt: '2026-09-01T00:00:00.000Z', model: 'dev/echo', status: 200, credits: 4300 });
  const res = await chat({ model: 'dev/echo', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error.code, 'insufficient_quota');
  ctx.db.prepare('DELETE FROM usage_events WHERE credits = 4300').run();
});

test('inactive membership is rejected', async () => {
  const other = upsertUser(ctx.db, { githubId: 7, login: 'mallory' });
  const { key: otherKey } = regenerateKey(ctx.db, other.id);
  ctx.config.membership.verification = 'allowlist';
  try {
    const res = await chat({ model: 'dev/echo', messages: [{ role: 'user', content: 'hi' }] }, otherKey);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error.code, 'membership_inactive');
  } finally {
    ctx.config.membership.verification = 'open';
  }
});

test('regenerating a key revokes the old one', async () => {
  const old = key;
  ({ key } = regenerateKey(ctx.db, user.id));
  assert.equal((await chat({ model: 'dev/echo', messages: [{ role: 'user', content: 'hi' }] }, old)).status, 401);
  assert.equal((await chat({ model: 'dev/echo', messages: [{ role: 'user', content: 'hi' }] })).status, 200);
});
