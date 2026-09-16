import { createHmac, timingSafeEqual } from 'node:crypto';
import { transaction, getMeta, setMeta } from '../db/index.js';
import { fetchActiveSponsors } from './sponsors.js';

export { fetchActiveSponsors };

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Membership rules (documented in docs/economics.md#membership)
//
// A GitHub account is a member when:
//   - verification = open:            always
//   - verification = allowlist:       its login is in membership.allowlist
//   - verification = github_sponsors: it has an active, recurring sponsorship of at
//     least membership.monthly_contribution, OR it lost one less than
//     membership.grace_days ago.
// ---------------------------------------------------------------------------

function inAllowlist(config, login) {
  return (config.membership.allowlist ?? []).some((l) => String(l).toLowerCase() === String(login).toLowerCase());
}

export function membershipStatus(db, config, { githubId, login }, now = new Date()) {
  const mode = config.membership.verification;
  if (mode === 'open') return { active: true, reason: 'open' };
  if (mode === 'allowlist') return inAllowlist(config, login) ? { active: true, reason: 'allowlist' } : { active: false, reason: 'not_allowlisted' };

  const row = db.prepare('SELECT * FROM sponsorships WHERE github_id = ?').get(githubId);
  if (!row) return { active: false, reason: 'not_sponsor' };
  if (row.qualifies) return { active: true, reason: 'sponsor', monthlyCents: row.monthly_cents };
  if (row.grace_until && new Date(row.grace_until) > now) return { active: true, reason: 'grace', graceUntil: row.grace_until };
  return { active: false, reason: row.active ? 'below_contribution' : 'sponsorship_ended' };
}

export function countMembers(db, config, now = new Date()) {
  const mode = config.membership.verification;
  if (mode === 'open') return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (mode === 'allowlist') return (config.membership.allowlist ?? []).length;
  return db.prepare('SELECT COUNT(*) AS n FROM sponsorships WHERE qualifies = 1 OR grace_until > ?').get(now.toISOString()).n;
}

/** Monthly contributions currently flowing into the pool, in USD. */
export function monthlyIncomeUsd(db, config, now = new Date()) {
  if (config.membership.verification !== 'github_sponsors') return countMembers(db, config, now) * config.membership.monthly_contribution;
  return db.prepare('SELECT COALESCE(SUM(monthly_cents), 0) AS c FROM sponsorships WHERE qualifies = 1').get().c / 100;
}

export function applySponsorState(db, config, { githubId, login, monthlyCents = 0, oneTime = false, active, source }, now = new Date()) {
  const minCents = Math.round(config.membership.monthly_contribution * 100);
  const qualifies = active && !oneTime && monthlyCents >= minCents;
  const previous = db.prepare('SELECT qualifies, grace_until FROM sponsorships WHERE github_id = ?').get(githubId);
  let graceUntil = previous?.grace_until ?? null;
  if (qualifies) graceUntil = null;
  else if (previous?.qualifies) graceUntil = new Date(now.getTime() + config.membership.grace_days * DAY_MS).toISOString();

  db.prepare(`
    INSERT INTO sponsorships (github_id, login, monthly_cents, one_time, active, qualifies, grace_until, source, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(github_id) DO UPDATE SET login = excluded.login, monthly_cents = excluded.monthly_cents, one_time = excluded.one_time,
      active = excluded.active, qualifies = excluded.qualifies, grace_until = excluded.grace_until, source = excluded.source, updated_at = excluded.updated_at
  `).run(githubId, login ?? null, monthlyCents, oneTime ? 1 : 0, active ? 1 : 0, qualifies ? 1 : 0, graceUntil, source, now.toISOString());
}

// ---------------------------------------------------------------------------
// Webhooks: https://docs.github.com/webhooks/webhook-events-and-payloads#sponsorship
// ---------------------------------------------------------------------------

export function verifyWebhookSignature(secret, rawBody, signatureHeader) {
  if (!secret || typeof signatureHeader !== 'string' || !signatureHeader.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`);
  const actual = Buffer.from(signatureHeader);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function handleSponsorshipEvent(db, config, payload, now = new Date()) {
  const { action, sponsorship } = payload ?? {};
  const sponsor = sponsorship?.sponsor;
  if (!sponsor?.id) return { applied: false, reason: 'no_sponsor' };
  const tier = sponsorship.tier ?? {};
  const base = { githubId: sponsor.id, login: sponsor.login, monthlyCents: tier.monthly_price_in_cents ?? 0, oneTime: Boolean(tier.is_one_time), source: `webhook:${action}` };

  switch (action) {
    case 'created':
    case 'edited':
    case 'tier_changed':
      applySponsorState(db, config, { ...base, active: true }, now);
      return { applied: true };
    case 'cancelled':
      applySponsorState(db, config, { ...base, active: false }, now);
      return { applied: true };
    default:
      // pending_cancellation / pending_tier_change take effect later, with their own event.
      return { applied: false, reason: `ignored:${action}` };
  }
}

// ---------------------------------------------------------------------------
// Reconciliation: webhooks can be lost, so a periodic full sync is the source
// of truth. Sponsors missing from GitHub's list go into grace, never straight out.
// ---------------------------------------------------------------------------

export async function syncSponsors(db, config, { token, fetch }, now = new Date()) {
  const { login, type } = config.membership.sponsorable ?? {};
  const sponsors = await fetchActiveSponsors({ token, login, type, fetch });
  const seen = new Set(sponsors.map((s) => s.githubId));
  let deactivated = 0;
  transaction(db, () => {
    for (const s of sponsors) applySponsorState(db, config, { ...s, active: true, source: 'sync' }, now);
    for (const row of db.prepare('SELECT * FROM sponsorships WHERE active = 1').all()) {
      if (seen.has(row.github_id)) continue;
      applySponsorState(db, config, { githubId: row.github_id, login: row.login, monthlyCents: row.monthly_cents, oneTime: !!row.one_time, active: false, source: 'sync' }, now);
      deactivated++;
    }
    setMeta(db, 'sponsors_synced_at', now.toISOString());
  });
  return { sponsors: sponsors.length, deactivated };
}

/** Sync if the last successful sync is older than membership.sync_max_age_minutes. Never throws. */
export async function syncSponsorsIfStale(db, config, { token, fetch, logger = console }, now = new Date()) {
  if (config.membership.verification !== 'github_sponsors') return null;
  const last = getMeta(db, 'sponsors_synced_at');
  if (last && now - new Date(last) < config.membership.sync_max_age_minutes * 60_000) return null;
  try {
    return await syncSponsors(db, config, { token, fetch }, now);
  } catch (err) {
    logger.error?.(`[billing] sponsor sync failed: ${err.message}`);
    return null;
  }
}
