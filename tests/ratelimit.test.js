import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter } from '../packages/ratelimit/index.js';

test('per-minute, per-hour and concurrency limits', () => {
  let t = 0;
  const rl = new RateLimiter({ requests_per_minute: 2, requests_per_hour: 3, concurrent_requests: 1 }, () => t);
  const a = rl.acquire('k');
  assert.equal(a.ok, true);
  assert.equal(rl.acquire('k').reason, 'concurrent_requests');
  a.release();
  a.release(); // idempotent
  rl.acquire('k').release();
  const blocked = rl.acquire('k');
  assert.equal(blocked.reason, 'requests_per_minute');
  assert.equal(blocked.retryAfter, 60);
  assert.equal(rl.acquire('other').ok, true);
  t = 61_000;
  rl.acquire('k').release();
  assert.equal(rl.acquire('k').reason, 'requests_per_hour');
  t = 3_600_001;
  assert.equal(rl.acquire('k').ok, true);
});
