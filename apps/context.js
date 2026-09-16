import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, ROOT_DIR } from '../packages/config/index.js';
import { openDatabase } from '../packages/db/index.js';
import { createRouter } from '../packages/router/index.js';
import { RateLimiter } from '../packages/ratelimit/index.js';

export function loadDotEnv() {
  const file = join(ROOT_DIR, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

/** Everything the apps need, injectable for tests. */
export function createContext({ env = process.env, config, db, fetch = globalThis.fetch, logger = console, now = () => new Date() } = {}) {
  config ??= loadConfig({ env });
  db ??= openDatabase(env.DATABASE_PATH);
  if (config.env === 'production' && (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32)) {
    throw new Error('SESSION_SECRET must be set (>= 32 chars) in production');
  }
  return {
    env,
    config,
    db,
    fetch,
    logger,
    now,
    sessionSecret: env.SESSION_SECRET || 'development-only-insecure-session-secret',
    router: createRouter(config, { env, fetch, logger }),
    limiter: new RateLimiter(config.limits, () => now().getTime()),
  };
}
