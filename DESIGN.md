# Community LLM Pool

## Vision

Build a radically simple, transparent and open-source way for developers to collectively purchase LLM inference.

Instead of thousands of developers independently buying small amounts of API credits, the community creates a single purchasing pool.

Every member contributes the same small monthly amount.

The pool purchases LLM inference from one or more providers.

The available compute is then fairly distributed among members.

The project is not intended to maximize profit.

Its objective is:

> **Maximize useful LLM compute available to every member while keeping the pool financially sustainable.**

The entire mechanism — accounting, allocation algorithms, provider spending, reserves and usage statistics — should be transparent.

---

# Basic Product

The user experience should be extremely simple.

```text
Visit website
      ↓
Login with GitHub
      ↓
Become $5/month sponsor
      ↓
Generate API key
      ↓
Use API
```

That's essentially the whole product.

No complicated plans.

No token packages.

No pricing calculator.

No enterprise tiers initially.

One membership:

```text
$5 / month
```

One API.

One key.

---

# Developer Experience

After authentication, the user receives something similar to:

```text
API endpoint

https://api.example.org/v1
```

and:

```text
API key

sk_xxxxxxxxxxxxxxxxxxxxx
```

The endpoint should be compatible with the OpenAI API whenever practical.

Therefore existing software should require only:

```text
OPENAI_BASE_URL=https://api.example.org/v1
OPENAI_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxx
```

This allows the service to be used with:

* agents
* CLI tools
* development environments
* automation
* GitHub Actions
* personal applications
* experiments
* scripts
* existing OpenAI-compatible clients

The project should avoid creating its own unnecessary SDK ecosystem.

Compatibility is the feature.

---

# Authentication

Identity is based on GitHub.

```text
GitHub OAuth
     ↓
GitHub identity
     ↓
membership verification
     ↓
API access
```

GitHub becomes the identity layer for the community.

The application does not need traditional username/password registration.

---

# Funding

The desired funding mechanism is GitHub Sponsors.

Conceptually:

```text
GitHub account
      ↓
$5/month sponsorship
      ↓
active membership
      ↓
API access
```

The application should synchronize sponsorship status using the mechanisms officially provided by GitHub, such as webhooks/API where appropriate.

If sponsorship expires, API access eventually expires according to clearly documented rules.

The system should tolerate temporary webhook/payment inconsistencies rather than immediately disabling users.

---

# API Keys

Each member can manage their API key.

Minimum operations:

```text
Create
Revoke
Regenerate
```

The workflow should be intentionally boring.

Example:

```text
API KEY

sk_live_**************************

[ Regenerate ]
[ Revoke ]
```

If a key leaks, the user burns it and generates another one.

Initially there is no reason to build a complex IAM system.

One user → one active key may be sufficient for the MVP.

Multiple named keys can come later if real users request them.

---

# Economic Model

The fundamental equation is:

```text
community contributions
        ↓
available monthly budget
        ↓
operational costs
        ↓
reserve
        ↓
LLM provider budget
        ↓
available compute
        ↓
members
```

For example:

```text
1,000 members
×
$5

=

$5,000/month
```

Suppose:

```text
LLM providers       $4,300
Infrastructure        $200
Reserve               $500
---------------------------
Total                $5,000
```

The objective is not:

```text
revenue - costs = maximum profit
```

but approximately:

```text
contributions
≈
provider expenditure
+ infrastructure
+ safety reserve
```

The system should maximize:

```text
useful_compute_per_member
```

subject to:

```text
pool remains solvent
```

---

# Do Not Sell Tokens

The project should avoid defining:

```text
$5 = X tokens
```

Tokens are a poor economic abstraction because different models have dramatically different inference costs.

Instead, membership provides access to a **monthly fair-use compute allocation**.

Internally the system can introduce a normalized accounting unit.

Possible names:

```text
Compute Credits
Pool Credits
Inference Credits
Community Compute Units
```

These units are accounting instruments, not cryptocurrency and not transferable assets.

They exist only to normalize consumption across providers and models.

---

# Dynamic Allowance

The allowance should not necessarily remain constant.

It should respond to the economics of the pool.

For example:

```text
Month A

members:       1,000
funding:      $5,000
utilization:     45%

→ allowance can increase
```

Later:

```text
Month B

members:       2,400
funding:     $12,000
utilization:     91%

→ allowance may decrease
```

The system therefore seeks equilibrium.

Conceptually:

```text
                   utilization low
                         │
                         ▼
                  increase allowance
                         │
                         ▼
funding ───→ compute pool ───→ consumption
                         ▲
                         │
                  decrease allowance
                         ▲
                         │
                   utilization high
```

Rules should be deterministic and publicly documented.

---

# Unused Capacity

Not everyone will consume their entire allocation.

That is one of the important economic properties of the pool.

Example:

```text
Alice

monthly allocation:  1,000 CC
consumed:               420 CC
unused:                 580 CC
```

Unused capacity should ultimately remain available to the community rather than becoming private profit.

It may be redistributed through mechanisms such as:

```text
community overflow pool
```

Members who exhaust their normal allocation could consume spare community capacity while it exists.

Therefore the system can provide both:

```text
guaranteed/fair allocation

+

best-effort community capacity
```

This allows heavy users to benefit from unused capacity without compromising the sustainability of the pool.

---

# Statistical Multiplexing

The project relies partly on a simple observation:

> Not every member consumes maximum capacity simultaneously.

A pool of thousands of developers should have more predictable aggregate consumption than a single developer.

As membership increases:

```text
individual consumption
       │
       │ noisy
       ▼

aggregate consumption
       │
       │ progressively predictable
       ▼

capacity planning
```

This statistical multiplexing can create value without requiring commercial markup.

---

# Collective Purchasing Power

The second major advantage appears as the community grows.

Initially:

```text
100 members
→ $500/month
```

The project may simply purchase ordinary API credits.

At:

```text
1,000 members
→ $5,000/month
```

provider optimization becomes meaningful.

At:

```text
10,000 members
→ $50,000/month
```

the community becomes a meaningful compute buyer.

Instead of every member individually buying retail inference, the project can potentially negotiate:

```text
volume discounts
reserved capacity
committed spend
bulk inference
dedicated endpoints
```

with providers.

The resulting discount should return to members through increased compute allowance.

Therefore:

```text
more members
      ↓
larger purchasing pool
      ↓
better provider economics
      ↓
more compute/member
      ↓
more attractive membership
      ↓
more members
```

This is the project's potential network effect.

---

# Provider Layer

The system should never depend permanently on one provider.

Architecture:

```text
                    Gateway
                       │
             Provider Router
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
   Provider A     Provider B      Provider C
```

Providers may initially include aggregators or direct LLM vendors.

The router can consider:

```text
model requested
provider availability
latency
actual cost
remaining provider budget
rate limits
quality requirements
```

The public API remains stable even if the backend changes.

---

# Model Names

Where possible, expose familiar model identifiers.

Potentially also provide aliases:

```text
community/fast
community/balanced
community/smart
```

These aliases allow the router to change underlying providers without breaking clients.

For example:

```text
community/fast
      ↓
currently Model X

community/smart
      ↓
currently Model Y
```

Users who require a specific model can explicitly request it when available.

---

# Transparency

Transparency is a core feature, not marketing.

A public dashboard should expose aggregate economics.

Example:

```text
September 2026

Active members              1,284

Gross contributions        $6,420

Provider spending          $5,430
Infrastructure               $240
Reserve                      $750

Pool utilization             71.3%

Requests                  842,391
```

Potential provider breakdown:

```text
Provider A        42%
Provider B        31%
Provider C        27%
```

No individual usage should be publicly exposed.

The project publishes aggregate information while preserving member privacy.

---

# Public Ledger

Historical monthly accounting should remain available.

Something like:

```text
/transparency/2026/09
/transparency/2026/10
/transparency/2026/11
```

or repository data:

```text
transparency/
├── 2026-09.json
├── 2026-10.json
└── 2026-11.json
```

Each report could contain:

```yaml
period: 2026-09

members: 1284

income:
  sponsorships: 6420

expenses:
  providers: 5430
  infrastructure: 240

reserve:
  contribution: 750

usage:
  requests: 842391
  utilization: 0.713
```

Numbers should preferably be generated automatically from the accounting system rather than manually entered.

---

# Reserve

Running permanently at zero margin would be dangerous.

The project therefore needs a transparent reserve.

For example:

```text
5–15% safety reserve
```

The reserve protects against:

```text
unexpected usage spikes
provider pricing changes
infrastructure incidents
refunds
billing timing differences
currency fluctuations
```

The reserve is not profit.

Its target size and rules should be public.

If the reserve grows beyond the defined threshold, the algorithm can increase community compute rather than accumulating money indefinitely.

---

# Rate Limiting

A fair-use pool requires rate limits even when monthly capacity remains available.

Possible dimensions:

```text
requests/minute
requests/hour
concurrent requests
monthly compute credits
community overflow capacity
```

This prevents one compromised API key from consuming a significant fraction of community resources.

---

# Abuse Protection

The system should assume that API keys will occasionally leak.

Therefore:

```text
per-key rate limits
monthly allowance
anomaly detection
immediate revoke
easy regeneration
```

No single key should ever be capable of financially damaging the entire pool.

---

# Open Source

The entire infrastructure should be open source.

This includes:

```text
gateway
authentication
provider adapters
allocation algorithm
rate limiting
accounting
transparency generation
dashboard
deployment configuration
```

Most importantly:

> The allocation algorithm must be inspectable.

Members should be able to answer:

> Why did I receive this allowance this month?

by reading the code.

---

# Self-Hosting

The software should eventually be usable independently of the original community.

Another group should be able to deploy:

```text
their GitHub OAuth
their funding mechanism
their provider accounts
their allocation rules
their users
```

This separates:

```text
PROJECT
open-source infrastructure

from

POOL
one specific deployment/community
```

This distinction is important strategically and potentially legally.

The repository builds the infrastructure.

A deployment operates a particular compute pool.

---

# MVP

Do not start by building the complete economic system.

The first version should prove the basic loop:

```text
GitHub Login
      ↓
verify membership
      ↓
generate API key
      ↓
OpenAI-compatible gateway
      ↓
one upstream provider
      ↓
track usage
      ↓
monthly limit
```

Minimum components:

```text
1. GitHub OAuth

2. GitHub Sponsors membership verification

3. API-key generation/revocation

4. OpenAI-compatible /v1 endpoint

5. One upstream provider

6. Per-user usage accounting

7. Rate limiting

8. Simple monthly allowance

9. Minimal transparency page
```

Everything else can evolve from actual usage.

---

# Possible Repository Structure

```text
project/
├── apps/
│   ├── web/
│   └── gateway/
│
├── packages/
│   ├── auth/
│   ├── billing/
│   ├── accounting/
│   ├── providers/
│   ├── router/
│   └── allocation/
│
├── config/
│   ├── models.yml
│   ├── providers.yml
│   └── pool.yml
│
├── transparency/
│
├── migrations/
│
├── docs/
│   ├── economics.md
│   ├── allocation.md
│   ├── providers.md
│   └── governance.md
│
└── .github/
```

---

# Configuration Example

The economic behavior should ideally be configuration-driven.

```yaml
membership:
  monthly_contribution: 5

pool:
  provider_budget: 0.85
  infrastructure_budget: 0.05
  reserve_budget: 0.10

limits:
  requests_per_minute: 30
  concurrent_requests: 5

allocation:
  strategy: equal
  overflow: community

reserve:
  target_months: 1
```

Percentages are illustrative, not final.

---

# Governance Principle

Keep governance minimal initially.

Core principles:

```text
same contribution
same basic rights
same allocation rules

no hidden discounts
no private plans
no privileged users

public economics
public algorithms
private individual usage
```

Changes to economic rules should be visible through the repository history.

For example:

```text
Pull Request
     ↓
discussion
     ↓
merge
     ↓
new allocation rule
```

Git becomes part of the governance audit trail.

---

# What This Project Is Not

It is not intended to become:

```text
another LLM SaaS

another AI chat interface

another coding agent

another model marketplace

a cryptocurrency

a token speculation system

a reseller hiding margins behind credits
```

It is infrastructure for **collective access to inference**.

---

# Important Constraint: Provider Terms

Before launching the public pool, each upstream provider must be verified for:

```text
API redistribution
resale
multi-user gateway usage
credential sharing restrictions
commercial/non-commercial restrictions
rate-limit requirements
```

The project being open source or nonprofit-oriented does not automatically make redistribution permissible.

Provider compatibility should therefore be explicit:

```yaml
provider:
  name: Example

  redistribution:
    allowed: true

  source:
    terms_url: ...

  verified_at: ...
```

A provider should not enter the production pool until its terms are compatible with the deployment model.

---

# Important Constraint: Sponsorship vs Service

GitHub Sponsors may be an excellent mechanism for funding the project, but the legal/accounting distinction between:

```text
supporting an OSS project

and

paying $5 specifically to receive an API service
```

must be investigated before launch.

The technical architecture should not depend on pretending that a commercial transaction is a donation.

Transparency applies here too.

---

# The Core Product

Strip everything away and the product remains:

```text
──────────────────────────────

Community LLM

$5 / month

[ Continue with GitHub ]

──────────────────────────────
```

After login:

```text
Your API

Endpoint
https://api.example.org/v1

API Key
sk_****************************

[ Regenerate key ]

Monthly pool
██████████████░░░░ 72%

Your usage
██████░░░░░░░░░░░ 31%

──────────────────────────────
```

A developer should understand the entire product in thirty seconds.

---

# Positioning

Possible concise description:

> **Community-funded LLM inference. One API, one $5 contribution, transparent economics.**

Or:

> **An open-source cooperative pool for LLM inference.**

Or more developer-oriented:

> **Pool your LLM budget. Share the compute.**

The project should avoid claiming to provide "cheap tokens".

The interesting proposition is:

> Thousands of developers collectively purchase inference instead of purchasing it individually.

---

# Long-Term Flywheel

The hypothesis behind the project is:

```text
developers contribute $5
          ↓
shared inference budget
          ↓
unused capacity is pooled
          ↓
better utilization
          ↓
community grows
          ↓
larger purchasing power
          ↓
better provider agreements
          ↓
more compute for $5
          ↓
community grows
```

Unlike a traditional provider, efficiency gains are returned primarily to the community rather than being optimized for margin.

---

# Success Metric

The primary metric should not be revenue.

It should be:

```text
COMPUTE VALUE DELIVERED
───────────────────────
MEMBER CONTRIBUTION
```

For example:

```text
$5 contribution
      ↓
$17.40 equivalent retail inference
```

would produce:

```text
community leverage = 3.48×
```

That number could become one of the project's defining metrics.

Other important metrics:

```text
active members
pool utilization
provider cost
compute/member
community leverage
reserve coverage
unused capacity
request success rate
```

---

# Fundamental Hypothesis

Individual developers are inefficient buyers of LLM inference.

They:

```text
consume irregularly
buy at retail prices
maintain several subscriptions
leave allowances unused
have almost zero negotiating power
```

A sufficiently large community can aggregate these characteristics.

Therefore the project attempts to convert:

```text
many small
unpredictable
retail consumers
```

into:

```text
one large
predictable
wholesale buyer
```

and redistribute the resulting efficiency back to those same developers.

That is the experiment.

The first objective is not to prove that the project can become large.

It is to answer a much smaller question:

> **Can 100 developers putting $5 each into a transparent shared pool obtain materially more useful LLM inference than 100 developers independently spending those same $5?**

If the answer is yes, everything else can grow from there.
