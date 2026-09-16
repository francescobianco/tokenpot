// GitHub OAuth (web application flow). Identity is the only thing we take:
// the user access token is used once to read the profile and then discarded.

export function authorizeUrl({ clientId, redirectUri, state }) {
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, state, scope: 'read:user', allow_signup: 'true' });
  return `https://github.com/login/oauth/authorize?${params}`;
}

export async function exchangeCode({ clientId, clientSecret, code, redirectUri, fetch = globalThis.fetch }) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`GitHub OAuth exchange failed: ${body.error_description ?? body.error ?? res.status}`);
  return body.access_token;
}

export async function fetchGithubUser({ token, fetch = globalThis.fetch }) {
  const res = await fetch('https://api.github.com/user', {
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'user-agent': 'tokenpot', 'x-github-api-version': '2022-11-28' },
  });
  if (!res.ok) throw new Error(`GitHub user request failed: ${res.status}`);
  const user = await res.json();
  return { githubId: user.id, login: user.login, name: user.name, avatarUrl: user.avatar_url };
}
