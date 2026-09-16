# Economics

The pool is not designed to make a profit. Its objective is:

> Maximize useful LLM compute available to every member while keeping the pool financially sustainable.

All numbers below come from `config/pool.yml`. Changing them requires a pull request.

## Membership

| `membership.verification` | Who is a member |
|---|---|
| `github_sponsors` | GitHub accounts with an active **recurring** sponsorship of `membership.sponsorable` of at least `monthly_contribution` USD. |
| `allowlist` | GitHub logins listed in `membership.allowlist` (private pools). |
| `open` | Every logged-in GitHub account (local development only). |

Sponsorship state is kept in sync two ways:

1. **Webhooks** (`POST /webhooks/github`, event `sponsorship`): `created`, `edited` and `tier_changed` activate or update a sponsorship; `cancelled` ends it. `pending_*` events are ignored because GitHub sends the real event when the change takes effect.
2. **Reconciliation** (`npm run pool -- sync-sponsors`, and automatically on login when the last sync is older than `sync_max_age_minutes`): the list of active sponsors from the GitHub GraphQL API is the source of truth.

**Grace period.** When a qualifying sponsorship ends, is downgraded below the contribution, or disappears from a sync, access continues for `grace_days` days. If the sponsorship comes back in the meantime nothing happens. A failed sync changes nothing. Webhook or payment glitches must never lock a member out immediately.

Members in grace count towards the member total (they share the allowance) but not towards income.

## Money flow

```
monthly income = sum of qualifying recurring sponsorships
               ├─ provider_share        -> provider budget -> pool credits
               ├─ infrastructure_share  -> hosting, domains, ...
               └─ reserve_share         -> reserve
```

Actual numbers per month (see `packages/transparency/index.js`):

```
income           = recorded income + income_adjustment ledger entries
providers        = actual cost of all requests + provider_adjustment entries
infrastructure   = infrastructure ledger entries
reserve change   = income - providers - infrastructure
```

Unspent provider budget therefore ends up in the reserve automatically, and the reserve then feeds it back (see below).

## Compute credits (CC)

Tokens are a bad unit: models differ in cost by orders of magnitude. The pool accounts in **Community Compute Units**:

```
1 CC = 1 / credits.per_usd USD of actual provider cost   (default: $0.001)
```

A request's cost is `prompt_tokens × input price + completion_tokens × output price` using the pricing of the route that served it (`config/models.yml`). CC are an accounting instrument, not a currency; they cannot be transferred, bought or sold.

## Reserve

The reserve protects against usage spikes, provider price changes, refunds and billing timing. It is not profit.

- Target: `reserve.target_months` × monthly income.
- Above target, `reserve.excess_release` of the excess is added to next month's provider budget, so surplus goes back to members as compute instead of piling up.

## Metrics

| Metric | Definition |
|---|---|
| Pool utilization | credits consumed / pool credits |
| Community leverage | retail-equivalent value of the inference delivered / income. `retail` prices in `models.yml` are what an individual would pay. |
| Compute per member | credits consumed / members |
| Reserve coverage | reserve balance / monthly income |
| Success rate | requests with status < 400 / all forwarded requests |

## Monthly close

```
npm run pool -- ledger add 2026-09 infrastructure 24.00 "VPS September"
npm run pool -- close-period 2026-09
git add transparency/2026-09.json && git commit -m "Ledger: close 2026-09"
```

Closing freezes the report in the database and writes `transparency/YYYY-MM.json`. Committing the file makes the ledger part of the repository history.
