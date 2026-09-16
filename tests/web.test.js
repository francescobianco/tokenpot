import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { createApp } from '../server.js';
import { testContext } from './helpers.js';

let server, base, ctx;

before(async () => {
  ({ ctx } = testContext({ env: { DEV_LOGIN: 'true', GITHUB_WEBHOOK_SECRET: 'whsec' } }));
  server = createServer(createApp(ctx));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test('landing page and transparency are public', async () => {
  const landing = await (await fetch(base)).text();
  assert.match(landing, /Continue with GitHub/);
  const t = await fetch(`${base}/transparency`);
  assert.equal(t.status, 200);
  assert.match(await t.text(), /Pool utilization/);
  const json = await (await fetch(`${base}/transparency/current.json`)).json();
  assert.equal(json.period, '2026-09');
  assert.equal((await fetch(`${base}/transparency/2020/01`)).status, 404);
});

test('login, generate key, use it, revoke it', async () => {
  const login = await fetch(`${base}/auth/dev?login=alice`, { redirect: 'manual' });
  assert.equal(login.status, 303);
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const dashboard = await (await fetch(base, { headers: { cookie } })).text();
  assert.match(dashboard, /Generate API key/);
  const csrf = dashboard.match(/name="csrf" value="([^"]+)"/)[1];

  const forged = await fetch(`${base}/keys/regenerate`, { method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: 'csrf=wrong' });
  assert.equal(forged.status, 403);

  const created = await (await fetch(`${base}/keys/regenerate`, { method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: `csrf=${encodeURIComponent(csrf)}` })).text();
  const key = created.match(/sk_live_[A-Za-z0-9_-]{32}/)[0];

  const completion = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'dev/echo', messages: [{ role: 'user', content: 'hi' }] }),
  });
  assert.equal(completion.status, 200);

  const after = await (await fetch(base, { headers: { cookie } })).text();
  assert.ok(!after.includes(key), 'plaintext key is shown only once');
  assert.match(after, /sk_live_\*+/);

  await fetch(`${base}/keys/revoke`, { method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: `csrf=${encodeURIComponent(csrf)}` });
  const denied = await fetch(`${base}/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: '{}' });
  assert.equal(denied.status, 401);
});

test('webhook requires a valid signature', async () => {
  const body = JSON.stringify({ action: 'created', sponsorship: { sponsor: { id: 5, login: 'bob' }, tier: { monthly_price_in_cents: 500 } } });
  const bad = await fetch(`${base}/webhooks/github`, { method: 'POST', headers: { 'x-github-event': 'sponsorship', 'x-hub-signature-256': 'sha256=00' }, body });
  assert.equal(bad.status, 401);
  const sig = `sha256=${createHmac('sha256', 'whsec').update(body).digest('hex')}`;
  const ok = await fetch(`${base}/webhooks/github`, { method: 'POST', headers: { 'x-github-event': 'sponsorship', 'x-hub-signature-256': sig }, body });
  assert.deepEqual(await ok.json(), { applied: true });
  assert.equal(ctx.db.prepare('SELECT qualifies FROM sponsorships WHERE github_id = 5').get().qualifies, 1);
});
