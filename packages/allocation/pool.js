// Stateful side of allocation: collects the inputs from the database and
// freezes the per-month parameters (multiplier, reserve release) the first
// time a month is seen, so they cannot drift during the month.

import { computeAllocation, nextMultiplier, reserveRelease, periodOf, previousPeriod } from './index.js';
import { countMembers, monthlyIncomeUsd } from '../billing/index.js';
import { poolCreditsUsed, ledgerSumBefore } from '../accounting/index.js';

export function getClosedReport(db, period) {
  const row = db.prepare('SELECT report_json FROM period_reports WHERE period = ?').get(period);
  return row ? JSON.parse(row.report_json) : null;
}

/** Reserve balance at the start of `period`: all closed months before it plus manual adjustments. */
export function reserveBalanceBefore(db, period) {
  const closed = db.prepare('SELECT report_json FROM period_reports WHERE period < ?').all(period)
    .reduce((sum, r) => sum + (JSON.parse(r.report_json).reserve?.contribution ?? 0), 0);
  return Math.round((closed + ledgerSumBefore(db, period, 'reserve_adjustment')) * 100) / 100;
}

function allocationFromRow(config, row) {
  return computeAllocation({ config, members: row.members, incomeUsd: row.income_usd, multiplier: row.multiplier, reserveReleaseUsd: row.reserve_release_usd });
}

function freeze(db, config, period, { members, incomeUsd }, now) {
  const prev = previousPeriod(period);
  const prevRow = db.prepare('SELECT * FROM allocations WHERE period = ?').get(prev);
  const prevReport = getClosedReport(db, prev);

  let previousUtilization = null;
  if (prevReport) previousUtilization = prevReport.usage.utilization;
  else if (prevRow) {
    const credits = allocationFromRow(config, prevRow).poolCredits;
    previousUtilization = credits > 0 ? poolCreditsUsed(db, prev) / credits : null;
  }

  const multiplier = nextMultiplier(prevRow?.multiplier ?? null, previousUtilization, config.allocation.multiplier);
  const balance = reserveBalanceBefore(db, period);
  const release = reserveRelease(balance, incomeUsd, config.reserve);
  const ts = now.toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO allocations (period, multiplier, previous_utilization, reserve_balance_start_usd, reserve_release_usd, members, income_usd, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(period, multiplier, previousUtilization, balance, release, members, incomeUsd, ts, ts);
  return db.prepare('SELECT * FROM allocations WHERE period = ?').get(period);
}

export function getAllocationRow(db, period) {
  return db.prepare('SELECT * FROM allocations WHERE period = ?').get(period) ?? null;
}

/** Allocation for the current month with live member count and income. */
export function getPoolAllocation(db, config, now = new Date()) {
  const period = periodOf(now);
  const members = countMembers(db, config, now);
  const incomeUsd = monthlyIncomeUsd(db, config, now);
  let row = getAllocationRow(db, period) ?? freeze(db, config, period, { members, incomeUsd }, now);
  if (row.members !== members || Math.abs(row.income_usd - incomeUsd) > 1e-9) {
    db.prepare('UPDATE allocations SET members = ?, income_usd = ?, updated_at = ? WHERE period = ?').run(members, incomeUsd, now.toISOString(), period);
    row = { ...row, members, income_usd: incomeUsd };
  }
  return {
    period,
    ...allocationFromRow(config, row),
    previousUtilization: row.previous_utilization,
    reserveBalanceStartUsd: row.reserve_balance_start_usd,
  };
}

/** Allocation of any month as recorded (null if the pool did not run that month). */
export function getRecordedAllocation(db, config, period) {
  const row = getAllocationRow(db, period);
  return row ? { period, ...allocationFromRow(config, row), previousUtilization: row.previous_utilization, reserveBalanceStartUsd: row.reserve_balance_start_usd } : null;
}
