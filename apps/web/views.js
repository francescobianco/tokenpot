import { escapeHtml as e } from '../../packages/http/index.js';

const STYLE = `
:root { --bg: #fbfbf9; --fg: #1d1d1b; --muted: #6b6b66; --line: #e3e2dc; --accent: #1f6f4a; --bar: #e9e8e2; --warn: #9a5b00; --code: #f1f0ea; }
@media (prefers-color-scheme: dark) { :root { --bg: #141413; --fg: #ecebe6; --muted: #9c9b94; --line: #2e2e2b; --accent: #5cc18f; --bar: #2a2a27; --warn: #e0a64a; --code: #1f1f1d; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 680px; margin: 0 auto; padding: 48px 16px 80px; }
header.top { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 40px; font-size: 14px; }
header.top a { color: var(--muted); text-decoration: none; margin-left: 16px; }
header.top a:hover { color: var(--fg); }
header.top .brand { color: var(--fg); font-weight: 600; margin-left: 0; }
h1 { font-size: 32px; line-height: 1.2; margin: 0 0 8px; letter-spacing: -0.01em; }
h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 36px 0 10px; font-weight: 600; }
p { margin: 0 0 12px; } .muted { color: var(--muted); } a { color: var(--accent); }
.price { font-size: 44px; font-weight: 650; margin: 28px 0; letter-spacing: -0.02em; } .price span { font-size: 18px; color: var(--muted); font-weight: 400; }
code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 14px; }
.field { background: var(--code); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; overflow-wrap: anywhere; }
.reveal { border-color: var(--accent); }
button, .button { font: inherit; font-size: 15px; border: 1px solid var(--line); background: transparent; color: var(--fg); padding: 8px 14px; border-radius: 8px; cursor: pointer; text-decoration: none; display: inline-block; }
button.primary, .button.primary { background: var(--fg); color: var(--bg); border-color: var(--fg); padding: 12px 20px; }
button:hover, .button:hover { border-color: var(--muted); }
form.inline { display: inline; } .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.bar { height: 10px; background: var(--bar); border-radius: 99px; overflow: hidden; margin: 6px 0 4px; }
.bar > div { height: 100%; background: var(--accent); }
.row { display: flex; justify-content: space-between; gap: 16px; padding: 7px 0; border-bottom: 1px solid var(--line); font-variant-numeric: tabular-nums; }
.row span:first-child { color: var(--muted); }
.notice { border-left: 3px solid var(--warn); padding: 8px 12px; margin: 16px 0; background: var(--code); border-radius: 0 8px 8px 0; }
pre { background: var(--code); border: 1px solid var(--line); border-radius: 8px; padding: 12px; overflow-x: auto; }
ul.plain { list-style: none; padding: 0; } ul.plain li { padding: 6px 0; border-bottom: 1px solid var(--line); }
footer { margin-top: 56px; font-size: 13px; color: var(--muted); }
`;

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const money = (n) => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`);

function bar(fraction) {
  const width = Math.max(0, Math.min(1, fraction || 0)) * 100;
  return `<div class="bar" role="progressbar" aria-valuenow="${width.toFixed(0)}" aria-valuemin="0" aria-valuemax="100"><div style="width:${width.toFixed(1)}%"></div></div>`;
}

const row = (label, value) => `<div class="row"><span>${e(label)}</span><span>${value}</span></div>`;

export function layout({ config, title, body, user, csrf }) {
  const nav = user
    ? `<a href="/transparency">Transparency</a><form class="inline" method="post" action="/auth/logout"><input type="hidden" name="csrf" value="${e(csrf)}"><button style="margin-left:16px;padding:4px 10px;font-size:14px">Log out</button></form>`
    : '<a href="/transparency">Transparency</a>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title ? `${title} · ${config.pool.name}` : config.pool.name)}</title><style>${STYLE}</style></head>
<body><main>
<header class="top"><a class="brand" href="/">${e(config.pool.name)}</a><nav>${nav}</nav></header>
${body}
<footer>Open-source infrastructure for collective access to inference. Public economics, public algorithms, private individual usage.</footer>
</main></body></html>`;
}

export function landingPage({ config, error }) {
  return `
<h1>Pool your LLM budget.<br>Share the compute.</h1>
<p class="muted">Community-funded LLM inference. One OpenAI-compatible API, one $${e(config.membership.monthly_contribution)} contribution, transparent economics.</p>
<div class="price">$${e(config.membership.monthly_contribution)} <span>/ month</span></div>
${error ? `<div class="notice">${e(error)}</div>` : ''}
<a class="button primary" href="/auth/github">Continue with GitHub</a>
<h2>How it works</h2>
<p>Log in with GitHub, become a $${e(config.membership.monthly_contribution)}/month sponsor, generate an API key, and point any OpenAI client at the pool:</p>
<pre class="mono">OPENAI_BASE_URL=${e(config.pool.api_url)}
OPENAI_API_KEY=sk_live_…</pre>
<p class="muted">Everyone contributes the same, everyone receives the same monthly fair-use allowance, and unused capacity stays with the community. <a href="/transparency">See where the money goes.</a></p>`;
}

export function dashboardPage({ config, user, membership, key, newKey, allocation, used, csrf, sponsorUrl, flash }) {
  const f = (action, label, primary = false) =>
    `<form class="inline" method="post" action="${action}"><input type="hidden" name="csrf" value="${e(csrf)}"><button${primary ? ' class="primary"' : ''}>${label}</button></form>`;

  let membershipBlock = '';
  if (!membership.active) {
    membershipBlock = `
<div class="notice"><strong>Membership not active.</strong> ${membership.reason === 'not_allowlisted' ? 'This pool is private and your account is not on its member list.' : `The pool is funded by $${e(config.membership.monthly_contribution)}/month GitHub sponsorships.`}</div>
<div class="actions">${sponsorUrl ? `<a class="button primary" href="${e(sponsorUrl)}">Sponsor on GitHub</a>` : ''}${config.membership.verification === 'github_sponsors' ? f('/membership/refresh', 'I have sponsored — check again') : ''}</div>`;
  } else if (membership.reason === 'grace') {
    membershipBlock = `<div class="notice">Your sponsorship has ended. Access continues until ${e(new Date(membership.graceUntil).toUTCString())}.${sponsorUrl ? ` <a href="${e(sponsorUrl)}">Renew</a>` : ''}</div>`;
  }

  const keyBlock = newKey
    ? `<div class="field mono reveal">${e(newKey)}</div><p class="muted" style="margin-top:8px">Copy it now: it is stored hashed and will not be shown again.</p>`
    : key
      ? `<div class="field mono">${e(key.display)}</div><p class="muted" style="margin-top:8px">Created ${e(key.created_at.slice(0, 10))}${key.last_used_at ? ` · last used ${e(key.last_used_at.slice(0, 10))}` : ''}</p>`
      : '<div class="field muted">No active key</div>';

  const keyActions = membership.active
    ? `<div class="actions">${key || newKey ? `${f('/keys/regenerate', 'Regenerate key')}${f('/keys/revoke', 'Revoke')}` : f('/keys/regenerate', 'Generate API key', true)}</div>`
    : '';

  const poolFraction = allocation.poolCredits > 0 ? used.pool / allocation.poolCredits : 0;
  const userFraction = allocation.allowance > 0 ? used.user / allocation.allowance : 0;

  return `
<p class="muted">Signed in as <strong>${e(user.login)}</strong></p>
<h1>Your API</h1>
${flash ? `<div class="notice">${e(flash)}</div>` : ''}
${membershipBlock}
<h2>Endpoint</h2>
<div class="field mono">${e(config.pool.api_url)}</div>
<h2>API key</h2>
${keyBlock}
${keyActions}
<h2>Monthly pool · ${e(allocation.period)}</h2>
${bar(poolFraction)}
<p class="muted">${pct(poolFraction)} of ${nf.format(allocation.poolCredits)} CC used by ${nf.format(allocation.members)} members</p>
<h2>Your usage</h2>
${bar(userFraction)}
<p class="muted">${nf.format(used.user)} of ${nf.format(allocation.allowance)} CC (${pct(userFraction)})${userFraction >= 1 ? (allocation.overflowEnabled ? ' · now using spare community capacity while available' : '') : ''}</p>
<p class="muted">1 CC = $${(1 / config.credits.per_usd).toFixed(4)} of provider cost. <a href="/transparency#allocation">Why this allowance?</a></p>
<h2>Quick start</h2>
<pre class="mono">curl ${e(config.pool.api_url)}/chat/completions \\
  -H "Authorization: Bearer $OPENAI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "community/fast", "messages": [{"role": "user", "content": "Hello"}]}'</pre>`;
}

function reportBody(report) {
  const providers = Object.entries(report.providers ?? {});
  const a = report.allocation;
  return `
${row('Active members', nf.format(report.members))}
${row('Gross contributions', money(report.income.total))}
${row('Provider spending', money(report.expenses.providers))}
${row('Infrastructure', money(report.expenses.infrastructure) + (report.expenses.infrastructure_estimate ? ` <span class="muted">(est. ${money(report.expenses.infrastructure_estimate)})</span>` : ''))}
${row('Reserve contribution', money(report.reserve.contribution))}
${row('Pool utilization', pct(report.usage.utilization))}
${row('Requests', nf.format(report.usage.requests))}
${row('Request success rate', pct(report.usage.success_rate))}
${row('Community leverage', report.metrics.community_leverage == null ? '—' : `${report.metrics.community_leverage}×`)}
<h2>Providers</h2>
${providers.length ? providers.map(([id, share]) => row(id, pct(share))).join('') : '<p class="muted">No provider spending yet.</p>'}
<h2>Reserve</h2>
${row('Balance at start of month', money(report.reserve.balance_start))}
${row('Released to members as compute', money(report.reserve.released_to_compute))}
${row('Balance at end of month', money(report.reserve.balance_end))}
${row('Target', money(report.reserve.target))}
<h2 id="allocation">Allocation</h2>
${row('Provider budget', money(a.provider_budget_usd))}
${row('Pool credits', `${nf.format(a.pool_credits)} CC`)}
${row('Equal share per member', `${nf.format(a.base_allowance)} CC`)}
${row('Multiplier', a.multiplier == null ? '—' : `${a.multiplier}×`)}
${row('Previous month utilization', pct(a.previous_utilization))}
${row('Allowance per member', `${nf.format(a.allowance_per_member)} CC`)}`;
}

export function transparencyPage({ config, report, periods }) {
  const b = config.budget;
  const m = config.allocation.multiplier;
  return `
<h1>Transparency</h1>
<p class="muted">Aggregate economics of the pool, generated from the accounting system. No individual usage is ever published.</p>
<h2>${e(report.period)} · ${e(report.status === 'open' ? 'live' : report.status)}</h2>
${reportBody(report)}
<h2>How the allowance is computed</h2>
<p>Every contributed dollar is split: ${pct(b.provider_share)} providers, ${pct(b.infrastructure_share)} infrastructure, ${pct(b.reserve_share)} reserve.
The provider budget (plus ${pct(config.reserve.excess_release)} of any reserve above ${config.reserve.target_months} month(s) of contributions) becomes the month's pool credits, at ${nf.format(config.credits.per_usd)} CC per dollar of provider cost.
Pool credits are divided equally among members, then multiplied by a factor between ${m.min}× and ${m.max}×: it grows by ${m.step} when the previous month used less than ${pct(m.low_utilization)} of the pool and shrinks by ${m.step} above ${pct(m.high_utilization)}.
The pool as a whole can never spend more than its credits.${config.allocation.overflow.enabled ? ` Members past their allowance may use spare capacity while the pool is below ${pct(config.allocation.overflow.pool_ceiling)} utilization.` : ''}</p>
<p class="muted">Rules: <code>config/pool.yml</code> · algorithm: <code>packages/allocation/index.js</code> · data: <a href="/transparency/current.json">current.json</a></p>
<h2>Monthly ledger</h2>
${periods.length ? `<ul class="plain">${periods.map((p) => `<li><a href="/transparency/${p.replace('-', '/')}">${e(p)}</a> · <a class="muted" href="/transparency/${p.replace('-', '/')}.json">json</a></li>`).join('')}</ul>` : '<p class="muted">No closed months yet.</p>'}`;
}

export function reportPage({ report }) {
  return `
<p><a href="/transparency">← Transparency</a></p>
<h1>${e(report.period)}</h1>
<p class="muted">Status: ${e(report.status)} · generated ${e(report.generated_at)}</p>
${reportBody(report)}
<h2>Raw report</h2>
<pre class="mono">${e(JSON.stringify(report, null, 2))}</pre>`;
}

export function errorPage({ status, message }) {
  return `<h1>${e(status)}</h1><p class="muted">${e(message)}</p><p><a href="/">Back</a></p>`;
}
