// The allocation algorithm. Pure, deterministic functions only: given the same
// inputs they always return the same allowance. This file is the answer to
// "why did I receive this allowance this month?". See docs/allocation.md.

export function periodOf(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

export function previousPeriod(period) {
  const [y, m] = period.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function isPeriod(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

const round = (n, digits = 6) => Math.round(n * 10 ** digits) / 10 ** digits;

/**
 * Individual multiplier for a month, derived from the previous month.
 *   utilization <  low  -> multiplier + step   (capacity went unused: give more)
 *   utilization >  high -> multiplier - step   (pool was under pressure: give less)
 *   otherwise           -> unchanged
 * Always clamped to [min, max]. With no history the initial value is used.
 */
export function nextMultiplier(previousMultiplier, previousUtilization, cfg) {
  if (previousMultiplier == null || previousUtilization == null) return cfg.initial;
  let m = previousMultiplier;
  if (previousUtilization < cfg.low_utilization) m += cfg.step;
  else if (previousUtilization > cfg.high_utilization) m -= cfg.step;
  return round(Math.min(cfg.max, Math.max(cfg.min, m)), 4);
}

/** Portion of the reserve above target that is returned to members as compute. */
export function reserveRelease(reserveBalanceUsd, monthlyIncomeUsd, cfg) {
  const target = cfg.target_months * monthlyIncomeUsd;
  return round(Math.max(0, reserveBalanceUsd - target) * cfg.excess_release, 2);
}

/**
 * Monthly allocation.
 *   provider budget = income x provider_share + reserve release
 *   pool credits    = provider budget x credits.per_usd          (hard cap, never exceeded)
 *   base allowance  = pool credits / members                     (strategy: equal)
 *   allowance       = base allowance x multiplier                (guaranteed per member)
 *   overflow cap    = pool credits x overflow.pool_ceiling       (best-effort beyond allowance)
 */
export function computeAllocation({ config, members, incomeUsd, multiplier, reserveReleaseUsd = 0 }) {
  if (config.allocation.strategy !== 'equal') throw new Error(`Unknown allocation strategy: ${config.allocation.strategy}`);
  const providerBudgetUsd = incomeUsd * config.budget.provider_share + reserveReleaseUsd;
  const poolCredits = providerBudgetUsd * config.credits.per_usd;
  const baseAllowance = members > 0 ? poolCredits / members : 0;
  return {
    members,
    incomeUsd: round(incomeUsd, 2),
    reserveReleaseUsd,
    providerBudgetUsd: round(providerBudgetUsd, 2),
    infrastructureBudgetUsd: round(incomeUsd * config.budget.infrastructure_share, 2),
    reserveBudgetUsd: round(incomeUsd * config.budget.reserve_share, 2),
    poolCredits: round(poolCredits, 2),
    baseAllowance: round(baseAllowance, 2),
    multiplier,
    allowance: round(baseAllowance * multiplier, 2),
    overflowEnabled: Boolean(config.allocation.overflow.enabled),
    overflowCeilingCredits: round(poolCredits * config.allocation.overflow.pool_ceiling, 2),
  };
}

/**
 * Whether a request may start, given consumption so far.
 * Returns { allowed, overflow, reason }.
 */
export function admit({ allocation, userCredits, userHourlyCredits, poolCredits, config }) {
  if (allocation.poolCredits <= 0 || poolCredits >= allocation.poolCredits) return { allowed: false, overflow: false, reason: 'pool_exhausted' };
  if (userHourlyCredits >= allocation.allowance * config.limits.max_hourly_allowance_share) return { allowed: false, overflow: false, reason: 'hourly_limit' };
  if (userCredits < allocation.allowance) return { allowed: true, overflow: false, reason: 'allowance' };
  if (allocation.overflowEnabled && poolCredits < allocation.overflowCeilingCredits) return { allowed: true, overflow: true, reason: 'community_overflow' };
  return { allowed: false, overflow: false, reason: 'allowance_exhausted' };
}
