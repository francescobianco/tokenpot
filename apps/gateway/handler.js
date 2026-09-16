// OpenAI-compatible gateway: /v1/models and /v1/chat/completions.

import { HttpError, readJson, sendJson } from '../../packages/http/index.js';
import { findKey, touchKey } from '../../packages/auth/index.js';
import { membershipStatus } from '../../packages/billing/index.js';
import { admit } from '../../packages/allocation/index.js';
import { getPoolAllocation } from '../../packages/allocation/pool.js';
import { costMicroUsd, creditsFor, estimateTokens, recordUsage, userCredits, userCreditsSince, poolCreditsUsed } from '../../packages/accounting/index.js';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

function openAIError(res, err, logger) {
  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) logger.error?.('[gateway]', err);
  const type = err.type ?? (status === 401 ? 'authentication_error' : status === 429 ? 'rate_limit_error' : status >= 500 ? 'server_error' : 'invalid_request_error');
  if (res.headersSent) return res.destroy();
  sendJson(res, status, { error: { message: status >= 500 && !(err instanceof HttpError) ? 'Internal error' : err.message, type, param: null, code: err.code ?? null } }, { ...CORS, ...(err.headers ?? {}) });
}

function authenticate(ctx, req) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) throw new HttpError(401, 'Missing API key. Use "Authorization: Bearer sk_live_...".', { code: 'invalid_api_key' });
  const auth = findKey(ctx.db, token);
  if (!auth) throw new HttpError(401, 'Invalid or revoked API key.', { code: 'invalid_api_key' });
  const membership = membershipStatus(ctx.db, ctx.config, { githubId: auth.github_id, login: auth.login }, ctx.now());
  if (!membership.active) throw new HttpError(403, `Membership is not active (${membership.reason}). See ${ctx.config.pool.public_url}`, { code: 'membership_inactive', type: 'permission_error' });
  return auth;
}

const DENIALS = {
  pool_exhausted: [429, 'The community pool has used its whole compute budget for this month.', 'insufficient_quota'],
  allowance_exhausted: [429, 'Your monthly allowance is used up and no spare community capacity is available right now.', 'insufficient_quota'],
  hourly_limit: [429, 'Hourly fair-use limit reached. Try again later.', 'rate_limit_exceeded', { 'retry-after': '600' }],
};

/** Applies pool policy to the client request before it goes upstream. */
export function prepareUpstreamBody(body, model) {
  const out = { ...body };
  const cap = model.max_output_tokens;
  if (cap) {
    if (out.max_completion_tokens != null) out.max_completion_tokens = Math.min(Number(out.max_completion_tokens) || cap, cap);
    if (out.max_tokens != null || out.max_completion_tokens == null) out.max_tokens = Math.min(Number(out.max_tokens) || cap, cap);
  }
  if (out.stream) out.stream_options = { ...(out.stream_options ?? {}), include_usage: true };
  return out;
}

async function callUpstream(ctx, resolved, body, signal) {
  const { routes } = resolved;
  let lastError;
  for (let i = 0; i < routes.length; i++) {
    const { route, provider } = routes[i];
    const isLast = i === routes.length - 1;
    try {
      const response = await provider.chatCompletions({ ...body, model: route.upstream_model }, { signal });
      if ((response.status >= 500 || response.status === 429) && !isLast) {
        ctx.router.reportFailure(provider.id);
        await response.body?.cancel().catch(() => {});
        continue;
      }
      if (response.status >= 500) ctx.router.reportFailure(provider.id);
      return { response, route };
    } catch (err) {
      if (signal.aborted) throw err;
      ctx.router.reportFailure(provider.id);
      ctx.logger.warn?.(`[gateway] provider ${provider.id} failed: ${err.message}`);
      lastError = err;
    }
  }
  throw new HttpError(502, `Upstream provider unavailable${lastError ? `: ${lastError.name}` : ''}`, { code: 'upstream_error', type: 'server_error' });
}

async function relayError(res, response) {
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
    if (!payload.error) throw new Error();
  } catch {
    payload = { error: { message: text.slice(0, 500) || `Upstream error ${response.status}`, type: 'upstream_error', param: null, code: null } };
  }
  sendJson(res, response.status, payload, CORS);
}

/** Pipes an SSE stream to the client, extracting usage. Returns { usage, completionText }. */
async function relayStream(res, response, { forwardUsageChunk }) {
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';
  let usage = null;
  let completionText = '';

  const handleEvent = (block) => {
    const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
    if (data && data !== '[DONE]') {
      try {
        const json = JSON.parse(data);
        if (json.usage) usage = json.usage;
        for (const choice of json.choices ?? []) completionText += choice.delta?.content ?? '';
        if (json.usage && !forwardUsageChunk && !json.choices?.length) return;
      } catch { /* forward unparseable events untouched */ }
    }
    res.write(`${block}\n\n`);
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop();
    for (const part of parts) if (part.trim()) handleEvent(part);
  }
  buffer += decoder.decode();
  if (buffer.trim()) handleEvent(buffer);
  res.end();
  return { usage, completionText };
}

async function chatCompletions(ctx, req, res) {
  const { db, config } = ctx;
  const auth = authenticate(ctx, req);
  const body = await readJson(req, config.limits.max_request_body_bytes);
  if (typeof body.model !== 'string') throw new HttpError(400, 'Missing required parameter: model', { code: 'missing_model' });
  if (!Array.isArray(body.messages) || !body.messages.length) throw new HttpError(400, 'Missing required parameter: messages', { code: 'missing_messages' });

  const resolved = ctx.router.resolve(body.model);
  if (!resolved) throw new HttpError(404, `The model '${body.model}' does not exist or is not available.`, { code: 'model_not_found' });

  const slot = ctx.limiter.acquire(auth.key_id);
  if (!slot.ok) throw new HttpError(429, `Rate limit exceeded (${slot.reason}).`, { code: 'rate_limit_exceeded', headers: { 'retry-after': String(slot.retryAfter) } });

  const started = ctx.now();
  const abort = new AbortController();
  res.on('close', () => { if (!res.writableFinished) abort.abort(); });

  let route = null;
  let status = 0;
  let usage = null;
  let completionText = '';
  let decision = null;
  const allocation = getPoolAllocation(db, config, started);

  try {
    decision = admit({
      allocation,
      config,
      userCredits: userCredits(db, auth.user_id, allocation.period),
      userHourlyCredits: userCreditsSince(db, auth.user_id, new Date(started.getTime() - 3_600_000).toISOString()),
      poolCredits: poolCreditsUsed(db, allocation.period),
    });
    if (!decision.allowed) {
      const [code, message, errCode, headers] = DENIALS[decision.reason];
      throw new HttpError(code, message, { code: errCode, headers });
    }
    touchKey(db, auth.key_id, started);

    const upstreamBody = prepareUpstreamBody(body, resolved.model);
    let response;
    try {
      ({ response, route } = await callUpstream(ctx, resolved, upstreamBody, abort.signal));
    } catch (err) {
      status = err.status ?? 499;
      throw err;
    }
    status = response.status;
    const headers = { ...CORS, 'x-pool-overflow': String(decision.overflow) };

    if (!response.ok) return await relayError(res, response);

    if (body.stream) {
      res.writeHead(200, { ...headers, 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' });
      ({ usage, completionText } = await relayStream(res, response, { forwardUsageChunk: Boolean(body.stream_options?.include_usage) }));
    } else {
      const json = await response.json();
      usage = json.usage ?? null;
      completionText = (json.choices ?? []).map((c) => c.message?.content ?? '').join('');
      sendJson(res, 200, json, headers);
    }
  } finally {
    slot.release();
    if (status) {
      const estimated = !usage;
      const promptTokens = usage?.prompt_tokens ?? (route && status < 400 ? estimateTokens(JSON.stringify(body.messages)) : 0);
      const completionTokens = usage?.completion_tokens ?? estimateTokens(completionText);
      const cost = route ? costMicroUsd(route.pricing, promptTokens, completionTokens) : 0;
      recordUsage(db, {
        userId: auth.user_id,
        keyId: auth.key_id,
        period: allocation.period,
        createdAt: started.toISOString(),
        model: resolved.model.id,
        provider: route?.provider,
        upstreamModel: route?.upstream_model,
        status,
        promptTokens,
        completionTokens,
        costMicroUsd: cost,
        retailMicroUsd: costMicroUsd(resolved.model.retail ?? route?.pricing, promptTokens, completionTokens),
        credits: creditsFor(cost, config),
        overflow: decision?.overflow,
        estimated: estimated && cost > 0,
        durationMs: ctx.now() - started,
      });
    }
  }
}

function listModels(ctx, res) {
  const data = ctx.router.listModels().map((id) => ({ id, object: 'model', created: 0, owned_by: 'community' }));
  sendJson(res, 200, { object: 'list', data }, CORS);
}

export function createGatewayHandler(ctx) {
  return async function gateway(req, res) {
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS);
        return res.end();
      }
      if (req.method === 'GET' && pathname === '/v1/models') return listModels(ctx, res);
      if (req.method === 'GET' && pathname.startsWith('/v1/models/')) {
        const id = decodeURIComponent(pathname.slice('/v1/models/'.length));
        if (!ctx.router.listModels().includes(id)) throw new HttpError(404, `The model '${id}' does not exist`, { code: 'model_not_found' });
        return sendJson(res, 200, { id, object: 'model', created: 0, owned_by: 'community' }, CORS);
      }
      if (req.method === 'POST' && pathname === '/v1/chat/completions') return await chatCompletions(ctx, req, res);
      throw new HttpError(404, `Unknown endpoint ${req.method} ${pathname}`, { code: 'unknown_url' });
    } catch (err) {
      if (err.name === 'AbortError' && res.destroyed) return;
      openAIError(res, err, ctx.logger);
    }
  };
}
