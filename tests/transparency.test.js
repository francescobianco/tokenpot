import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { upsertUser, regenerateKey } from '../packages/auth/index.js';
import { recordUsage, addLedgerEntry } from '../packages/accounting/index.js';
import { getPoolAllocation } from '../packages/allocation/pool.js';
import { buildReport, closePeriod } from '../packages/transparency/index.js';
import { testContext } from './helpers.js';

test('monthly close feeds the reserve and next month multiplier', () => {
  const { ctx } = testContext();
  const { db, config } = ctx;
  const dir = mkdtempSync(join(tmpdir(), 'pool-transparency-'));
  for (let i = 1; i <= 4; i++) regenerateKey(db, upsertUser(db, { githubId: i, login: `u${i}` }).id);

  const sept = getPoolAllocation(db, config, new Date('2026-09-02T00:00:00Z'));
  assert.equal(sept.members, 4);
  assert.equal(sept.poolCredits, 17_000);
  assert.equal(sept.multiplier, 1);

  // 20% utilization: 3400 CC = $3.40 of provider cost
  recordUsage(db, { userId: 1, keyId: 1, period: '2026-09', createdAt: '2026-09-03T00:00:00Z', model: 'dev/echo', provider: 'mock', status: 200, credits: 3400, costMicroUsd: 3_400_000, retailMicroUsd: 10_000_000 });
  recordUsage(db, { userId: 2, keyId: 2, period: '2026-09', createdAt: '2026-09-03T00:00:00Z', model: 'dev/echo', provider: 'mock', status: 502 });
  addLedgerEntry(db, { period: '2026-09', kind: 'infrastructure', amountUsd: 1 });

  const live = buildReport(db, config, '2026-09', new Date('2026-09-20T00:00:00Z'));
  assert.equal(live.status, 'open');
  assert.throws(() => closePeriod(db, config, '2026-09', { now: new Date('2026-09-20T00:00:00Z'), dir }), /not ended/);

  const report = closePeriod(db, config, '2026-09', { now: new Date('2026-10-01T01:00:00Z'), dir });
  assert.equal(report.status, 'closed');
  assert.deepEqual(report.income, { sponsorships: 20, adjustments: 0, total: 20 });
  assert.equal(report.expenses.providers, 3.4);
  assert.equal(report.expenses.infrastructure, 1);
  assert.equal(report.reserve.contribution, 15.6);
  assert.equal(report.usage.utilization, 0.2);
  assert.equal(report.usage.requests, 2);
  assert.equal(report.usage.success_rate, 0.5);
  assert.equal(report.metrics.community_leverage, 0.5);
  assert.deepEqual(report.providers, { mock: 1 });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, '2026-09.json'), 'utf8')), report);
  assert.throws(() => closePeriod(db, config, '2026-09', { now: new Date('2026-10-01T01:00:00Z'), dir }), /already closed/);

  const oct = getPoolAllocation(db, config, new Date('2026-10-02T00:00:00Z'));
  assert.equal(oct.previousUtilization, 0.2);
  assert.equal(oct.multiplier, 1.1);
  assert.equal(oct.reserveBalanceStartUsd, 15.6);
  // no release: reserve (15.6) is below target (1 month = $20)
  assert.equal(oct.reserveReleaseUsd, 0);
  assert.equal(oct.allowance, 4675);
});
