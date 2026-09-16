# Allocation

> Why did I receive this allowance this month?

The whole algorithm lives in [`packages/allocation/index.js`](../packages/allocation/index.js) as pure functions. Its inputs are stored in the `allocations` table and published on `/transparency`.

## Once per month (frozen on the first request of the month)

```
previous utilization = credits consumed last month / pool credits last month

multiplier = previous multiplier
           + step   if previous utilization < low_utilization
           - step   if previous utilization > high_utilization
           clamped to [min, max]            (initial value if there is no history)

reserve release = max(0, reserve balance − target_months × monthly income) × excess_release
```

## Continuously (members and income are live)

```
provider budget = monthly income × provider_share + reserve release
pool credits    = provider budget × credits.per_usd
equal share     = pool credits / members
allowance       = equal share × multiplier
```

Because income grows with members, the equal share stays roughly constant as people join or leave during the month.

## Admission of a request

A request is accepted when, at the moment it starts:

1. the pool has consumed less than **pool credits** (hard cap: the pool never overspends), and
2. the member has consumed less than `limits.max_hourly_allowance_share` of the allowance in the last hour (leaked-key protection), and
3. either the member is below their **allowance**, or overflow is enabled and the pool is below `overflow.pool_ceiling` of pool credits (**community overflow**: spare capacity left by others).

Otherwise the gateway answers `429` with code `insufficient_quota` or `rate_limit_exceeded`.

## Why a multiplier?

Not every member uses their full share. Handing out exactly `pool / members` would leave most of the budget unused (and returned to the reserve months later). The multiplier is statistical multiplexing made explicit: if last month the pool was underused, everyone gets a bigger guaranteed allowance this month; if it was under pressure, the allowance shrinks back. Meanwhile, the pool-wide hard cap keeps the pool solvent whatever happens.

## Per-request bounds

- `max_output_tokens` per model caps `max_tokens` / `max_completion_tokens`, so a single request has a bounded cost.
- Requests are charged after completion using the usage reported by the provider (or a length-based estimate if none is reported, flagged as `estimated`). Admission is checked when a request starts, so concurrent requests can overshoot a limit by at most `concurrent_requests × max request cost`.
- `limits.requests_per_minute`, `requests_per_hour` and `concurrent_requests` apply per API key.
