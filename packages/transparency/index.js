// Public ledger. Reports contain aggregates only, never individual usage.

import { writeFileSync, readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT_DIR } from '../config/index.js';
import { periodOf, isPeriod } from '../allocation/index.js';
import { getRecordedAllocation, getClosedReport, reserveBalanceBefore } from '../allocation/pool.js';
import { periodTotals, ledgerSum } from '../accounting/index.js';

export const TRANSPARENCY_DIR = process.env.TRANSPARENCY_DIR ?? join(ROOT_DIR, 'transparency');

const usd = (n) => Math.round(n * 100) / 100;
const ratio = (n) => Math.round(n * 10_000) / 10_000;

export function buildReport(db, config, period, now = new Date()) {
  const allocation = getRecordedAllocation(db, config, period);
  const totals = periodTotals(db, period);

  const incomeAdjustments = ledgerSum(db, period, 'income_adjustment');
  const sponsorships = allocation?.incomeUsd ?? 0;
  const income = sponsorships + incomeAdjustments;
  const providers = totals.costUsd + ledgerSum(db, period, 'provider_adjustment');
  const infrastructure = ledgerSum(db, period, 'infrastructure');
  const contribution = income - providers - infrastructure;
  const balanceStart = allocation?.reserveBalanceStartUsd ?? reserveBalanceBefore(db, period);
  const balanceEnd = balanceStart + contribution + ledgerSum(db, period, 'reserve_adjustment');

  const poolCredits = allocation?.poolCredits ?? 0;
  const members = allocation?.members ?? 0;

  return {
    period,
    status: getClosedReport(db, period) ? 'closed' : period < periodOf(now) ? 'pending_close' : 'open',
    generated_at: now.toISOString(),
    members,
    income: { sponsorships: usd(sponsorships), adjustments: usd(incomeAdjustments), total: usd(income) },
    expenses: {
      providers: usd(providers),
      infrastructure: usd(infrastructure),
      ...(period === periodOf(now) ? { infrastructure_estimate: config.infrastructure?.monthly_estimate_usd ?? 0 } : {}),
    },
    reserve: {
      balance_start: usd(balanceStart),
      released_to_compute: allocation?.reserveReleaseUsd ?? 0,
      contribution: usd(contribution),
      balance_end: usd(balanceEnd),
      target: usd(config.reserve.target_months * income),
    },
    allocation: {
      strategy: config.allocation.strategy,
      credits_per_usd: config.credits.per_usd,
      provider_budget_usd: allocation?.providerBudgetUsd ?? 0,
      pool_credits: poolCredits,
      base_allowance: allocation?.baseAllowance ?? 0,
      multiplier: allocation?.multiplier ?? null,
      previous_utilization: allocation?.previousUtilization == null ? null : ratio(allocation.previousUtilization),
      allowance_per_member: allocation?.allowance ?? 0,
    },
    usage: {
      requests: totals.requests,
      success_rate: totals.requests ? ratio(totals.successful / totals.requests) : null,
      active_members: totals.activeUsers,
      prompt_tokens: totals.promptTokens,
      completion_tokens: totals.completionTokens,
      credits: usd(totals.credits),
      overflow_credits: usd(totals.overflowCredits),
      utilization: poolCredits > 0 ? ratio(totals.credits / poolCredits) : 0,
      unused_credits: usd(Math.max(0, poolCredits - totals.credits)),
    },
    providers: Object.fromEntries(totals.providers.map((p) => [p.provider, totals.costUsd > 0 ? ratio(p.costUsd / totals.costUsd) : 0])),
    metrics: {
      retail_equivalent_usd: usd(totals.retailUsd),
      community_leverage: income > 0 ? Math.round((totals.retailUsd / income) * 100) / 100 : null,
      compute_per_member_credits: members > 0 ? usd(totals.credits / members) : 0,
      reserve_coverage_months: income > 0 ? Math.round((balanceEnd / income) * 100) / 100 : null,
    },
  };
}

/** Freezes a finished month into the public ledger and writes transparency/YYYY-MM.json. */
export function closePeriod(db, config, period, { now = new Date(), force = false, dir = TRANSPARENCY_DIR } = {}) {
  if (!isPeriod(period)) throw new Error(`Invalid period ${period}; expected YYYY-MM`);
  if (period >= periodOf(now)) throw new Error(`Period ${period} has not ended yet`);
  if (getClosedReport(db, period) && !force) throw new Error(`Period ${period} is already closed (use --force to regenerate)`);
  // Remove the previous version first so buildReport reads the reserve chain, not itself.
  db.prepare('DELETE FROM period_reports WHERE period = ?').run(period);
  const report = { ...buildReport(db, config, period, now), status: 'closed' };
  db.prepare('INSERT INTO period_reports (period, report_json, closed_at) VALUES (?, ?, ?)').run(period, JSON.stringify(report), now.toISOString());
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${period}.json`), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export function listReportPeriods(db, dir = TRANSPARENCY_DIR) {
  const periods = new Set(db.prepare('SELECT period FROM period_reports').all().map((r) => r.period));
  if (existsSync(dir)) for (const f of readdirSync(dir)) if (/^\d{4}-\d{2}\.json$/.test(f)) periods.add(f.slice(0, 7));
  return [...periods].sort().reverse();
}

export function getReport(db, config, period, { now = new Date(), dir = TRANSPARENCY_DIR } = {}) {
  const closed = getClosedReport(db, period);
  if (closed) return closed;
  const file = join(dir, `${period}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  if (!getRecordedAllocation(db, config, period)) return null;
  return buildReport(db, config, period, now);
}
