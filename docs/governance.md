# Governance

Kept minimal on purpose.

## Principles

- Same contribution, same basic rights, same allocation rules.
- No hidden discounts, no private plans, no privileged users.
- Public economics, public algorithms, private individual usage.

## Changing the rules

Economic behaviour is configuration (`config/*.yml`) and code (`packages/allocation`). Any change goes through:

```
Pull request -> public discussion -> merge -> deploy -> new rule
```

The git history is the audit trail: anyone can see when a rule changed, why, and who approved it. The multiplier and reserve release are frozen at the start of each month; budget shares and limits apply from the next deploy.

## Project vs pool

- The **project** is this repository: open-source infrastructure.
- A **pool** is one deployment: its own GitHub OAuth app, funding, provider accounts, rules and members.

Anyone can run their own pool from this code. Operators of a pool are responsible for provider terms and for the legal and accounting nature of the contributions they collect.

## Open questions before a public launch

- **Provider terms**: see [providers.md](providers.md).
- **Sponsorship vs service**: GitHub Sponsors is a funding mechanism for open-source work. Whether a $5 sponsorship that grants API access is a donation or payment for a service (with tax/VAT implications) must be investigated for the operator's jurisdiction. The architecture does not rely on pretending a commercial transaction is a donation: the membership check is isolated in `packages/billing` and can be pointed at another payment mechanism.
