import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAllocation, nextMultiplier, reserveRelease, admit, previousPeriod, periodOf } from '../packages/allocation/index.js';
import { testConfig } from './helpers.js';

const config = testConfig();
const mcfg = config.allocation.multiplier;

test('periods', () => {
  assert.equal(periodOf(new Date('2026-01-31T23:59:59Z')), '2026-01');
  assert.equal(previousPeriod('2026-01'), '2025-12');
  assert.equal(previousPeriod('2026-10'), '2026-09');
});

test('equal allocation splits the provider budget', () => {
  const a = computeAllocation({ config, members: 1000, incomeUsd: 5000, multiplier: 1, reserveReleaseUsd: 0 });
  assert.equal(a.providerBudgetUsd, 4250);
  assert.equal(a.poolCredits, 4_250_000);
  assert.equal(a.allowance, 4250);
  assert.equal(a.overflowCeilingCredits, 3_825_000);
});

test('reserve release and multiplier raise the allowance', () => {
  const a = computeAllocation({ config, members: 1000, incomeUsd: 5000, multiplier: 1.2, reserveReleaseUsd: 1000 });
  assert.equal(a.poolCredits, 5_250_000);
  assert.equal(a.allowance, 6300);
});

test('multiplier follows previous utilization within bounds', () => {
  assert.equal(nextMultiplier(null, null, mcfg), 1);
  assert.equal(nextMultiplier(1, 0.45, mcfg), 1.1);
  assert.equal(nextMultiplier(1.5, 0.7, mcfg), 1.5);
  assert.equal(nextMultiplier(1.5, 0.91, mcfg), 1.4);
  assert.equal(nextMultiplier(1, 0.99, mcfg), 1);
  assert.equal(nextMultiplier(3, 0.1, mcfg), 3);
});

test('reserve release only above target', () => {
  assert.equal(reserveRelease(4000, 5000, config.reserve), 0);
  assert.equal(reserveRelease(7000, 5000, config.reserve), 1000);
});

test('admission: allowance, overflow, exhaustion, hourly cap', () => {
  const allocation = computeAllocation({ config, members: 10, incomeUsd: 50, multiplier: 1 }); // 42500 CC, 4250 each
  const base = { allocation, config, userHourlyCredits: 0 };
  assert.deepEqual(admit({ ...base, userCredits: 100, poolCredits: 1000 }), { allowed: true, overflow: false, reason: 'allowance' });
  assert.deepEqual(admit({ ...base, userCredits: 4250, poolCredits: 1000 }), { allowed: true, overflow: true, reason: 'community_overflow' });
  assert.equal(admit({ ...base, userCredits: 4250, poolCredits: 40_000 }).reason, 'allowance_exhausted');
  assert.equal(admit({ ...base, userCredits: 0, poolCredits: 42_500 }).reason, 'pool_exhausted');
  assert.equal(admit({ ...base, userCredits: 0, poolCredits: 0, userHourlyCredits: 1100 }).reason, 'hourly_limit');
});
