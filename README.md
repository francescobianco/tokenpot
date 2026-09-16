# tokenpot

**Pool your LLM budget. Share the compute.**

Community-funded LLM inference: one OpenAI-compatible API, one $5/month contribution, transparent economics.
Open-source infrastructure for a cooperative inference pool. See [DESIGN.md](DESIGN.md) for the vision.

```
GitHub login → $5/month sponsor → API key → OPENAI_BASE_URL=https://your-pool/v1
```

## What is implemented (MVP)

| Component | Where |
|---|---|
| GitHub OAuth login | `packages/auth/github.js`, `apps/web` |
| GitHub Sponsors membership (webhooks + reconciliation + grace period) | `packages/billing` |
| One API key per member: create / regenerate / revoke, stored hashed | `packages/auth/keys.js` |
| OpenAI-compatible `/v1/chat/completions` (streaming too) and `/v1/models` | `apps/gateway` |
| Provider adapters (any OpenAI-compatible upstream), model aliases, failover | `packages/providers`, `packages/router` |
| Per-member usage accounting in compute credits | `packages/accounting` |
| Rate limits (per minute, per hour, concurrency, hourly allowance share) | `packages/ratelimit`, `packages/allocation` |
| Dynamic monthly allowance with community overflow and reserve | `packages/allocation` |
| Transparency page, JSON reports, monthly public ledger | `packages/transparency`, `/transparency`, `transparency/` |

Stack: Node.js ≥ 22.13, SQLite (`node:sqlite`), no framework. The only runtime dependency is `yaml`.

## Quick start (local, no GitHub or provider needed)

```bash
npm install
cp .env.example .env
# in .env: MEMBERSHIP_VERIFICATION=open  MOCK_PROVIDER_ENABLED=true  DEV_LOGIN=true
npm start
```

Open http://localhost:3000, click **Continue with GitHub** (a fake dev login when `GITHUB_CLIENT_ID` is empty), generate a key, then:

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk_live_..." -H "Content-Type: application/json" \
  -d '{"model": "dev/echo", "messages": [{"role": "user", "content": "Hello"}]}'
```

Any OpenAI client works:

```bash
export OPENAI_BASE_URL=http://localhost:3000/v1
export OPENAI_API_KEY=sk_live_...
```

## Running a real pool

1. **GitHub OAuth app**: callback URL `$PUBLIC_URL/auth/github/callback`. Set `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.
2. **GitHub Sponsors**: set `GITHUB_SPONSORABLE_LOGIN`, a `$5/month` tier, and `GITHUB_SPONSORS_TOKEN` (a token of the sponsorable account). Add a webhook for the *Sponsorship* event to `$PUBLIC_URL/webhooks/github` with `GITHUB_WEBHOOK_SECRET`.
3. **Providers**: set the API keys, verify each provider's terms and mark `redistribution.allowed: true` in `config/providers.yml`, and check prices in `config/models.yml`.
4. `POOL_ENV=production`, a random `SESSION_SECRET` (≥ 32 chars), an `https://` `PUBLIC_URL`.
5. Schedule `npm run pool -- sync-sponsors` (e.g. hourly) and `npm run pool -- close-period` (on the 1st of each month), then commit `transparency/*.json`.

`npm start` serves website and API on one port (`/v1/*` → gateway). To split them, run `npm run start:web` and `npm run start:gateway` behind a reverse proxy. Run a single gateway instance: rate-limit state is in memory.

```bash
docker build -t tokenpot . && docker run -p 3000:3000 --env-file .env -v tokenpot-data:/app/data tokenpot
```

## Operator CLI

```
npm run pool -- sync-sponsors
npm run pool -- allocation
npm run pool -- report [YYYY-MM]
npm run pool -- ledger add 2026-09 infrastructure 24 "VPS"
npm run pool -- close-period [YYYY-MM] [--force]
npm run pool -- revoke-key <github-login>
```

## Repository layout

```
apps/web          website: landing, login, dashboard, keys, transparency, webhooks
apps/gateway      OpenAI-compatible API
packages/         auth, billing, accounting, allocation, providers, router, ratelimit, transparency, config, db, http
config/           pool.yml (economic rules), providers.yml, models.yml
migrations/       SQLite schema
transparency/     closed monthly reports (public ledger)
docs/             economics, allocation, providers, governance
```

## Documentation

- [Economics](docs/economics.md): membership, money flow, credits, reserve, metrics
- [Allocation](docs/allocation.md): exactly how your allowance is computed
- [Providers](docs/providers.md): adapters, models, aliases, terms verification
- [Governance](docs/governance.md): how rules change

## Tests

```bash
npm test
```

## License

MIT
