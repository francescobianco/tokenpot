// Usage and money accounting. Money is stored in integer micro-dollars.

export const MICRO = 1_000_000;

export function costMicroUsd(pricing, promptTokens, completionTokens) {
  if (!pricing) return 0;
  return Math.round(promptTokens * (pricing.input_per_mtok ?? 0) + completionTokens * (pricing.output_per_mtok ?? 0));
}

export function creditsFor(costMicro, config) {
  return (costMicro / MICRO) * config.credits.per_usd;
}

/** Rough token estimate used only when an upstream does not report usage. */
export function estimateTokens(text) {
  return Math.ceil(String(text ?? '').length / 4);
}

export function recordUsage(db, e) {
  db.prepare(`
    INSERT INTO usage_events (user_id, key_id, period, created_at, model, provider, upstream_model, status,
      prompt_tokens, completion_tokens, cost_micro_usd, retail_micro_usd, credits, overflow, estimated, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(e.userId, e.keyId, e.period, e.createdAt, e.model, e.provider ?? null, e.upstreamModel ?? null, e.status,
    e.promptTokens ?? 0, e.completionTokens ?? 0, e.costMicroUsd ?? 0, e.retailMicroUsd ?? 0, e.credits ?? 0,
    e.overflow ? 1 : 0, e.estimated ? 1 : 0, e.durationMs ?? null);
}

export function userCredits(db, userId, period) {
  return db.prepare('SELECT COALESCE(SUM(credits), 0) AS c FROM usage_events WHERE user_id = ? AND period = ?').get(userId, period).c;
}

export function userCreditsSince(db, userId, sinceIso) {
  return db.prepare('SELECT COALESCE(SUM(credits), 0) AS c FROM usage_events WHERE user_id = ? AND created_at >= ?').get(userId, sinceIso).c;
}

export function poolCreditsUsed(db, period) {
  return db.prepare('SELECT COALESCE(SUM(credits), 0) AS c FROM usage_events WHERE period = ?').get(period).c;
}

export function periodTotals(db, period) {
  const t = db.prepare(`
    SELECT COUNT(*) AS requests,
      COALESCE(SUM(CASE WHEN status < 400 THEN 1 ELSE 0 END), 0) AS successful,
      COALESCE(SUM(credits), 0) AS credits,
      COALESCE(SUM(CASE WHEN overflow = 1 THEN credits ELSE 0 END), 0) AS overflow_credits,
      COALESCE(SUM(cost_micro_usd), 0) AS cost_micro,
      COALESCE(SUM(retail_micro_usd), 0) AS retail_micro,
      COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
      COUNT(DISTINCT user_id) AS active_users
    FROM usage_events WHERE period = ?
  `).get(period);
  const providers = db.prepare(`
    SELECT provider, SUM(cost_micro_usd) AS cost_micro FROM usage_events
    WHERE period = ? AND provider IS NOT NULL GROUP BY provider ORDER BY cost_micro DESC
  `).all(period);
  return {
    requests: t.requests,
    successful: t.successful,
    credits: t.credits,
    overflowCredits: t.overflow_credits,
    costUsd: t.cost_micro / MICRO,
    retailUsd: t.retail_micro / MICRO,
    promptTokens: t.prompt_tokens,
    completionTokens: t.completion_tokens,
    activeUsers: t.active_users,
    providers: providers.map((p) => ({ provider: p.provider, costUsd: p.cost_micro / MICRO })),
  };
}

export const LEDGER_KINDS = ['infrastructure', 'income_adjustment', 'provider_adjustment', 'reserve_adjustment'];

export function addLedgerEntry(db, { period, kind, amountUsd, note }, now = new Date()) {
  if (!LEDGER_KINDS.includes(kind)) throw new Error(`Unknown ledger kind ${kind}; expected one of ${LEDGER_KINDS.join(', ')}`);
  if (!Number.isFinite(amountUsd)) throw new Error('amount must be a number');
  db.prepare('INSERT INTO ledger_entries (period, kind, amount_usd, note, created_at) VALUES (?, ?, ?, ?, ?)').run(period, kind, amountUsd, note ?? null, now.toISOString());
}

export function ledgerSum(db, period, kind) {
  return db.prepare('SELECT COALESCE(SUM(amount_usd), 0) AS s FROM ledger_entries WHERE period = ? AND kind = ?').get(period, kind).s;
}

export function ledgerSumBefore(db, period, kind) {
  return db.prepare('SELECT COALESCE(SUM(amount_usd), 0) AS s FROM ledger_entries WHERE period < ? AND kind = ?').get(period, kind).s;
}
