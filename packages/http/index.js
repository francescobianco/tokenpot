export class HttpError extends Error {
  constructor(status, message, { code, type, headers } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.type = type;
    this.headers = headers;
  }
}

export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'Request body too large', { code: 'request_too_large' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function readJson(req, limit) {
  const raw = await readBody(req, limit);
  try {
    return JSON.parse(raw.toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON', { code: 'invalid_json' });
  }
}

export async function readForm(req, limit = 64_000) {
  return Object.fromEntries(new URLSearchParams((await readBody(req, limit)).toString('utf8')));
}

export function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(payload), ...headers });
  res.end(payload);
}

export function sendHtml(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

export function redirect(res, location, status = 303) {
  res.writeHead(status, { location });
  res.end();
}

export const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src https://avatars.githubusercontent.com; form-action 'self'; frame-ancestors 'none'",
};

export function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    if (name) cookies[name] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return cookies;
}

export function setCookie(res, name, value, { maxAge, secure = false, httpOnly = true, path = '/', sameSite = 'Lax' } = {}) {
  let cookie = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (maxAge !== undefined) cookie += `; Max-Age=${maxAge}`;
  if (httpOnly) cookie += '; HttpOnly';
  if (secure) cookie += '; Secure';
  res.appendHeader('set-cookie', cookie);
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
