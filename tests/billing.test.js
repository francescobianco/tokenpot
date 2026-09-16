import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { openDatabase } from '../packages/db/index.js';
import { applySponsorState, membershipStatus, countMembers, monthlyIncomeUsd, verifyWebhookSignature, handleSponsorshipEvent, syncSponsors } from '../packages/billing/index.js';
import { testConfig } from './helpers.js';

const config = testConfig({ env: { MEMBERSHIP_VERIFICATION: 'github_sponsors', GITHUB_SPONSORABLE_LOGIN: 'pool' } });
const t0 = new Date('2026-09-01T00:00:00Z');
const days = (n) => new Date(t0.getTime() + n * 86_400_000);

test('sponsors at or above the contribution are members; cancellation grants grace', () => {
  const db = openDatabase(':memory:');
  applySponsorState(db, config, { githubId: 1, login: 'alice', monthlyCents: 500, active: true, source: 'test' }, t0);
  applySponsorState(db, config, { githubId: 2, login: 'bob', monthlyCents: 300, active: true, source: 'test' }, t0);
  applySponsorState(db, config, { githubId: 3, login: 'carol', monthlyCents: 500, oneTime: true, active: true, source: 'test' }, t0);
  assert.equal(membershipStatus(db, config, { githubId: 1 }, t0).active, true);
  assert.equal(membershipStatus(db, config, { githubId: 2 }, t0).reason, 'below_contribution');
  assert.equal(membershipStatus(db, config, { githubId: 3 }, t0).active, false);
  assert.equal(membershipStatus(db, config, { githubId: 99 }, t0).reason, 'not_sponsor');
  assert.equal(countMembers(db, config, t0), 1);
  assert.equal(monthlyIncomeUsd(db, config, t0), 5);

  handleSponsorshipEvent(db, config, { action: 'cancelled', sponsorship: { sponsor: { id: 1, login: 'alice' }, tier: { monthly_price_in_cents: 500 } } }, days(10));
  assert.equal(membershipStatus(db, config, { githubId: 1 }, days(12)).reason, 'grace');
  assert.equal(countMembers(db, config, days(12)), 1);
  assert.equal(monthlyIncomeUsd(db, config, days(12)), 0);
  assert.equal(membershipStatus(db, config, { githubId: 1 }, days(18)).active, false);

  handleSponsorshipEvent(db, config, { action: 'created', sponsorship: { sponsor: { id: 1, login: 'alice' }, tier: { monthly_price_in_cents: 1000 } } }, days(20));
  assert.equal(membershipStatus(db, config, { githubId: 1 }, days(20)).reason, 'sponsor');
});

test('webhook signature verification', () => {
  const body = Buffer.from('{"action":"created"}');
  const sig = `sha256=${createHmac('sha256', 's3cret').update(body).digest('hex')}`;
  assert.equal(verifyWebhookSignature('s3cret', body, sig), true);
  assert.equal(verifyWebhookSignature('other', body, sig), false);
  assert.equal(verifyWebhookSignature('s3cret', body, undefined), false);
  assert.equal(verifyWebhookSignature(undefined, body, sig), false);
});

test('sync reconciles and puts missing sponsors in grace instead of cutting them off', async () => {
  const db = openDatabase(':memory:');
  let sponsors = [[1, 'alice', 500], [2, 'bob', 500]];
  const fetch = async (url, init) => {
    assert.equal(url, 'https://api.github.com/graphql');
    assert.match(JSON.parse(init.body).query, /sponsorshipsAsMaintainer/);
    return Response.json({ data: { owner: { sponsorshipsAsMaintainer: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: sponsors.map(([id, login, cents]) => ({ isOneTimePayment: false, tier: { monthlyPriceInCents: cents, isOneTime: false }, sponsorEntity: { __typename: 'User', login, databaseId: id } })),
    } } } });
  };
  assert.deepEqual(await syncSponsors(db, config, { token: 't', fetch }, t0), { sponsors: 2, deactivated: 0 });
  sponsors = [[1, 'alice', 500]];
  assert.deepEqual(await syncSponsors(db, config, { token: 't', fetch }, days(1)), { sponsors: 1, deactivated: 1 });
  assert.equal(membershipStatus(db, config, { githubId: 2 }, days(2)).reason, 'grace');
  assert.equal(membershipStatus(db, config, { githubId: 2 }, days(9)).active, false);

  const failing = async () => Response.json({ errors: [{ message: 'boom' }] });
  await assert.rejects(syncSponsors(db, config, { token: 't', fetch: failing }, days(3)), /boom/);
  assert.equal(membershipStatus(db, config, { githubId: 1 }, days(3)).active, true);
});
