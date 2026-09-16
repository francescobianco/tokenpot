// Single-process deployment: /v1/* is the gateway, everything else the website.
// Run apps/web/main.js and apps/gateway/main.js separately to split them.

import { createServer } from 'node:http';
import { loadDotEnv, createContext } from './apps/context.js';
import { createWebHandler } from './apps/web/handler.js';
import { createGatewayHandler } from './apps/gateway/handler.js';

export function createApp(ctx) {
  const web = createWebHandler(ctx);
  const gateway = createGatewayHandler(ctx);
  return (req, res) => (req.url === '/v1' || req.url.startsWith('/v1/') ? gateway(req, res) : web(req, res));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadDotEnv();
  const ctx = createContext();
  const port = Number(process.env.PORT ?? 3000);
  const server = createServer(createApp(ctx));
  server.requestTimeout = 0;
  setInterval(() => ctx.limiter.sweep(), 300_000).unref();
  server.listen(port, () => ctx.logger.info(`[pool] ${ctx.config.pool.name} listening on :${port} (${ctx.config.env}, membership: ${ctx.config.membership.verification})`));
}
