export function upsertUser(db, { githubId, login, name, avatarUrl }, now = new Date()) {
  const ts = now.toISOString();
  db.prepare(`
    INSERT INTO users (github_id, login, name, avatar_url, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(github_id) DO UPDATE SET login = excluded.login, name = excluded.name, avatar_url = excluded.avatar_url, last_login_at = excluded.last_login_at
  `).run(githubId, login, name ?? null, avatarUrl ?? null, ts, ts);
  return db.prepare('SELECT * FROM users WHERE github_id = ?').get(githubId);
}

export function getUser(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) ?? null;
}
