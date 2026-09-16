# Providers and models

## Providers (`config/providers.yml`)

```yaml
- id: openrouter
  type: openai-compatible          # or: mock
  enabled: true
  base_url: https://openrouter.ai/api/v1
  api_key_env: OPENROUTER_API_KEY  # the key itself stays in the environment
  headers: {}                      # extra upstream headers
  timeout_seconds: 300
  redistribution:
    allowed: null                  # true | false | null (unverified)
    terms_url: https://...
    verified_at: 2026-09-01
    notes: ...
```

Adapters live in `packages/providers/`. `openai-compatible` works with any upstream implementing Chat Completions; a new adapter only needs to expose `chatCompletions(body, { signal }) -> Response` in the OpenAI format.

### Terms verification is mandatory

Before a provider enters the production pool, check its terms for API redistribution, resale, multi-user gateway usage, credential sharing, commercial restrictions and rate-limit requirements. Record the outcome in `redistribution`.

With `POOL_ENV=production` the router **refuses** every provider whose `redistribution.allowed` is not `true`. In development unverified providers work but log a warning.

## Models (`config/models.yml`)

```yaml
aliases:
  community/fast: meta-llama/llama-3.3-70b-instruct

models:
  - id: meta-llama/llama-3.3-70b-instruct   # name clients use
    max_output_tokens: 8192
    routes:                                  # tried in order
      - provider: openrouter
        upstream_model: meta-llama/llama-3.3-70b-instruct
        pricing: { input_per_mtok: 0.13, output_per_mtok: 0.40 }   # actual cost, USD per 1M tokens
    retail: { input_per_mtok: 0.59, output_per_mtok: 0.79 }        # for the leverage metric
```

- **Aliases** (`community/fast`, `community/balanced`, `community/smart`) let the pool change the underlying model without breaking clients.
- **Routes** give failover: on a connection error, `5xx` or `429`, the gateway tries the next route and puts the failing provider in a 30-second cooldown.
- **Pricing** must reflect what the pool actually pays; it drives all accounting. The prices shipped in `models.yml` are illustrative: verify them before launch and keep them up to date through pull requests.
