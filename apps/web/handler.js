import { HttpError, readBody, readForm, sendHtml, sendJson, redirect, parseCookies, setCookie } from '../../packages/http/index.js';
import {
  authorizeUrl, exchangeCode, fetchGithubUser, createSessionToken, readSessionToken, csrfToken, verifyCsrf, randomToken,
  upsertUser, getUser, getActiveKey, regenerateKey, revokeKey,
} from '../../packages/auth/index.js';
import { membershipStatus, verifyWebhookSignature, handleSponsorshipEvent, syncSponsors, syncSponsorsIfStale } from '../../packages/billing/index.js';
import { getMeta } from '../../packages/db/index.js';
import { userCredits, poolCreditsUsed } from '../../packages/accounting/index.js';
import { getPoolAllocation } from '../../packages/allocation/pool.js';
import { isPeriod } from '../../packages/allocation/index.js';
import { buildReport, getReport, listReportPeriods } from '../../packages/transparency/index.js';
import { layout, landingPage, dashboardPage, transparencyPage, reportPage, errorPage } from './views.js';

const SESSION_COOKIE = 'pool_session';
const STATE_COOKIE = 'pool_oauth_state';
const SESSION_TTL = 30 * 86_400;
const FORCED_SYNC_MIN_INTERVAL_MS = 60_000;

export function createWebHandler(ctx) {
  const { db, config, env } = ctx;
  const secure = config.pool.public_url.startsWith('https://');
  const redirectUri = `${config.pool.public_url}/auth/github/callback`;
  const devLogin = config.env !== 'production' && env.DEV_LOGIN === 'true';
  const sponsorsDeps = { token: env.GITHUB_SPONSORS_TOKEN, fetch: ctx.fetch, logger: ctx.logger };
  const sponsorLogin = config.membership.sponsorable?.login;
  const sponsorUrl = config.membership.verification === 'github_sponsors' && sponsorLogin ? `https://github.com/sponsors/${encodeURIComponent(sponsorLogin)}` : null;

  function session(req) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const payload = readSessionToken(ctx.sessionSecret, token, ctx.now().getTime());
    const user = payload && getUser(db, payload.uid);
    return user ? { user, token, csrf: csrfToken(ctx.sessionSecret, token) } : null;
  }

  function page(res, status, title, body, s) {
    sendHtml(res, status, layout({ config, title, body, user: s?.user, csrf: s?.csrf }));
  }

  async function requireForm(req, s) {
    if (!s) throw new HttpError(401, 'Please log in first.');
    const form = await readForm(req);
    if (!verifyCsrf(ctx.sessionSecret, s.token, form.csrf)) throw new HttpError(403, 'Invalid form token. Reload the page and try again.');
    return form;
  }

  function login(res, profile) {
    const user = upsertUser(db, profile, ctx.now());
    setCookie(res, SESSION_COOKIE, createSessionToken(ctx.sessionSecret, { uid: user.id }, SESSION_TTL, ctx.now().getTime()), { maxAge: SESSION_TTL, secure });
    return user;
  }

  function dashboard(res, s, { newKey, flash } = {}) {
    const now = ctx.now();
    const allocation = getPoolAllocation(db, config, now);
    const membership = membershipStatus(db, config, { githubId: s.user.github_id, login: s.user.login }, now);
    page(res, 200, 'Your API', dashboardPage({
      config, user: s.user, membership, key: getActiveKey(db, s.user.id), newKey, allocation, csrf: s.csrf, sponsorUrl, flash,
      used: { user: userCredits(db, s.user.id, allocation.period), pool: poolCreditsUsed(db, allocation.period) },
    }), s);
  }

  const routes = {
    'GET /': (req, res) => {
      const s = session(req);
      if (s) return dashboard(res, s);
      page(res, 200, null, landingPage({ config }));
    },

    'GET /auth/github': (req, res) => {
      if (devLogin && !env.GITHUB_CLIENT_ID) return redirect(res, '/auth/dev');
      if (!env.GITHUB_CLIENT_ID) throw new HttpError(503, 'GitHub OAuth is not configured (GITHUB_CLIENT_ID).');
      const state = randomToken();
      setCookie(res, STATE_COOKIE, state, { maxAge: 600, secure });
      redirect(res, authorizeUrl({ clientId: env.GITHUB_CLIENT_ID, redirectUri, state }), 302);
    },

    'GET /auth/github/callback': async (req, res, url) => {
      const expected = parseCookies(req.headers.cookie)[STATE_COOKIE];
      setCookie(res, STATE_COOKIE, '', { maxAge: 0, secure });
      const code = url.searchParams.get('code');
      if (!code || !expected || url.searchParams.get('state') !== expected) throw new HttpError(400, 'Login expired or invalid. Please try again.');
      const token = await exchangeCode({ clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET, code, redirectUri, fetch: ctx.fetch });
      const profile = await fetchGithubUser({ token, fetch: ctx.fetch });
      login(res, profile);
      await syncSponsorsIfStale(db, config, sponsorsDeps, ctx.now());
      redirect(res, '/');
    },

    // Local development only (POOL_ENV != production and DEV_LOGIN=true).
    'GET /auth/dev': (req, res, url) => {
      if (!devLogin) throw new HttpError(404, 'Not found');
      const loginName = url.searchParams.get('login') ?? 'dev';
      if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(loginName)) throw new HttpError(400, 'Invalid login');
      const githubId = 900_000_000 + [...loginName].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 99_999_999, 7);
      login(res, { githubId, login: loginName, name: loginName });
      redirect(res, '/');
    },

    'POST /auth/logout': async (req, res) => {
      await requireForm(req, session(req));
      setCookie(res, SESSION_COOKIE, '', { maxAge: 0, secure });
      redirect(res, '/');
    },

    'POST /keys/regenerate': async (req, res) => {
      const s = session(req);
      await requireForm(req, s);
      const membership = membershipStatus(db, config, { githubId: s.user.github_id, login: s.user.login }, ctx.now());
      if (!membership.active) throw new HttpError(403, 'An active membership is required to create an API key.');
      const { key } = regenerateKey(db, s.user.id, ctx.now());
      dashboard(res, s, { newKey: key, flash: 'New key created. Any previous key has been revoked.' });
    },

    'POST /keys/revoke': async (req, res) => {
      const s = session(req);
      await requireForm(req, s);
      revokeKey(db, s.user.id, ctx.now());
      dashboard(res, s, { flash: 'Key revoked. It no longer works.' });
    },

    'POST /membership/refresh': async (req, res) => {
      const s = session(req);
      await requireForm(req, s);
      const last = getMeta(db, 'sponsors_synced_at');
      let flash = 'Membership status is up to date.';
      if (config.membership.verification === 'github_sponsors' && (!last || ctx.now() - new Date(last) > FORCED_SYNC_MIN_INTERVAL_MS)) {
        try {
          await syncSponsors(db, config, sponsorsDeps, ctx.now());
        } catch (err) {
          ctx.logger.error?.(`[web] sponsor sync failed: ${err.message}`);
          flash = 'Could not reach GitHub right now. Please try again in a few minutes.';
        }
      }
      dashboard(res, s, { flash });
    },

    'POST /webhooks/github': async (req, res) => {
      const raw = await readBody(req, 1_000_000);
      if (!verifyWebhookSignature(env.GITHUB_WEBHOOK_SECRET, raw, req.headers['x-hub-signature-256'])) throw new HttpError(401, 'Invalid signature');
      const event = req.headers['x-github-event'];
      if (event === 'ping') return sendJson(res, 200, { ok: true });
      if (event !== 'sponsorship') return sendJson(res, 202, { ignored: event });
      const result = handleSponsorshipEvent(db, config, JSON.parse(raw.toString('utf8')), ctx.now());
      sendJson(res, 200, result);
    },

    'GET /transparency': (req, res) => {
      const report = buildReport(db, config, getPoolAllocation(db, config, ctx.now()).period, ctx.now());
      page(res, 200, 'Transparency', transparencyPage({ config, report, periods: listReportPeriods(db) }), session(req));
    },

    'GET /transparency/current.json': (req, res) => {
      sendJson(res, 200, buildReport(db, config, getPoolAllocation(db, config, ctx.now()).period, ctx.now()), { 'access-control-allow-origin': '*' });
    },

    'GET /healthz': (req, res) => sendJson(res, 200, { ok: true }),
  };

  return async function web(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const s = () => { try { return session(req); } catch { return null; } };
    try {
      const route = routes[`${req.method} ${url.pathname}`];
      if (route) return await route(req, res, url);

      const month = url.pathname.match(/^\/transparency\/(\d{4})\/(\d{2})(\.json)?$/);
      if (req.method === 'GET' && month && isPeriod(`${month[1]}-${month[2]}`)) {
        const report = getReport(db, config, `${month[1]}-${month[2]}`, { now: ctx.now() });
        if (!report) throw new HttpError(404, 'No report for this month.');
        if (month[3]) return sendJson(res, 200, report, { 'access-control-allow-origin': '*' });
        return page(res, 200, report.period, reportPage({ report }), s());
      }
      throw new HttpError(404, 'Page not found.');
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) ctx.logger.error?.('[web]', err);
      if (res.headersSent) return res.destroy();
      if (url.pathname.startsWith('/webhooks/') || url.pathname.endsWith('.json')) return sendJson(res, status, { error: err.message });
      const message = err instanceof HttpError ? err.message : 'Something went wrong.';
      if (status === 401 && !url.pathname.startsWith('/webhooks/')) return page(res, 401, 'Log in', landingPage({ config, error: message }));
      page(res, status, 'Error', errorPage({ status, message }), s());
    }
  };
}
