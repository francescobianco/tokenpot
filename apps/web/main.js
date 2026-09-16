import { createServer } from 'node:http';
import { loadDotEnv, createContext } from '../context.js';
import { createWebHandler } from './handler.js';

loadDotEnv();
const ctx = createContext();
const port = Number(process.env.WEB_PORT ?? process.env.PORT ?? 3000);
createServer(createWebHandler(ctx)).listen(port, () => ctx.logger.info(`[web] listening on :${port}`));
