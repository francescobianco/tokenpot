import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

// Stateless signed session cookies: base64url(payload).base64url(hmac).

function sign(secret, data) {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createSessionToken(secret, payload, ttlSeconds, now = Date.now()) {
  const data = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(now / 1000) + ttlSeconds })).toString('base64url');
  return `${data}.${sign(secret, data)}`;
}

export function readSessionToken(secret, token, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const [data, mac] = token.split('.');
  if (!data || !mac || !safeEqual(mac, sign(secret, data))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    return payload.exp * 1000 > now ? payload : null;
  } catch {
    return null;
  }
}

export function csrfToken(secret, sessionToken) {
  return sign(secret, `csrf:${sessionToken}`);
}

export function verifyCsrf(secret, sessionToken, token) {
  return typeof token === 'string' && !!sessionToken && safeEqual(token, csrfToken(secret, sessionToken));
}

export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}
