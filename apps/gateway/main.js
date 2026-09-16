import { createServer } from 'node:http';
import { loadDotEnv, createContext } from '../context.js';
import { createGatewayHandler } from './handler.js';

loadDotEnv();
const ctx = createContext();
const port = Number(process.env.GATEWAY_PORT ?? process.env.PORT ?? 3001);
const server = createServer(createGatewayHandler(ctx));
server.requestTimeout = 0; // long streaming completions
setInterval(() => ctx.limiter.sweep(), 300_000).unref();
server.listen(port, () => ctx.logger.info(`[gateway] listening on :${port}`));
