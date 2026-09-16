import { createHash, randomBytes } from 'node:crypto';
import { transaction } from '../db/index.js';

// One member -> one active key. Keys are shown once and stored hashed.

export const KEY_PREFIX = 'sk_live_';

export function hashKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

export function generateKey() {
  const key = KEY_PREFIX + randomBytes(24).toString('base64url');
  return { key, hash: hashKey(key), display: `${KEY_PREFIX}${'*'.repeat(24)}${key.slice(-4)}` };
}

export function getActiveKey(db, userId) {
  return db.prepare('SELECT id, display, created_at, last_used_at FROM api_keys WHERE user_id = ? AND revoked_at IS NULL').get(userId) ?? null;
}

/** Revokes any active key and creates a new one. Returns the plaintext key (only time it exists). */
export function regenerateKey(db, userId, now = new Date()) {
  const { key, hash, display } = generateKey();
  transaction(db, () => {
    db.prepare('UPDATE api_keys SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now.toISOString(), userId);
    db.prepare('INSERT INTO api_keys (user_id, hash, display, created_at) VALUES (?, ?, ?, ?)').run(userId, hash, display, now.toISOString());
  });
  return { key, display };
}

export function revokeKey(db, userId, now = new Date()) {
  return db.prepare('UPDATE api_keys SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now.toISOString(), userId).changes > 0;
}

export function findKey(db, plaintext) {
  if (typeof plaintext !== 'string' || !plaintext.startsWith(KEY_PREFIX)) return null;
  return db.prepare(`
    SELECT k.id AS key_id, u.id AS user_id, u.github_id, u.login
    FROM api_keys k JOIN users u ON u.id = k.user_id
    WHERE k.hash = ? AND k.revoked_at IS NULL
  `).get(hashKey(plaintext)) ?? null;
}

export function touchKey(db, keyId, now = new Date()) {
  db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(now.toISOString(), keyId);
}
