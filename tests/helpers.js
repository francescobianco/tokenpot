import { loadConfig } from '../packages/config/index.js';
import { openDatabase } from '../packages/db/index.js';
import { createContext } from '../apps/context.js';

export function testConfig(overrides = {}) {
  const config = loadConfig({ env: { MOCK_PROVIDER_ENABLED: 'true', MEMBERSHIP_VERIFICATION: 'open', ...overrides.env } });
  return { ...config, ...overrides.config };
}

export function testContext({ env = {}, now, fetch, config } = {}) {
  const fullEnv = { MOCK_PROVIDER_ENABLED: 'true', MEMBERSHIP_VERIFICATION: 'open', SESSION_SECRET: 'test-secret', ...env };
  const clock = { t: now ?? new Date('2026-09-15T12:00:00Z') };
  const ctx = createContext({
    env: fullEnv,
    config: config ?? loadConfig({ env: fullEnv }),
    db: openDatabase(':memory:'),
    fetch,
    logger: { info() {}, warn() {}, error() {} },
    now: () => new Date(clock.t),
  });
  return { ctx, clock };
}
