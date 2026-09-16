import { createProvider, isTermsVerified } from '../providers/index.js';

const COOLDOWN_MS = 30_000;

export function createRouter(config, { env = process.env, fetch = globalThis.fetch, logger = console, now = () => Date.now() } = {}) {
  const production = config.env === 'production';
  const providers = new Map();
  for (const def of config.providers) {
    if (!def.enabled) continue;
    if (production && !isTermsVerified(def)) {
      logger.warn?.(`[router] provider ${def.id} disabled: redistribution terms not verified`);
      continue;
    }
    const provider = createProvider(def, { env, fetch });
    if (!provider.isConfigured()) {
      logger.warn?.(`[router] provider ${def.id} disabled: missing credentials`);
      continue;
    }
    if (!isTermsVerified(def)) logger.warn?.(`[router] provider ${def.id}: terms not verified (allowed outside production only)`);
    providers.set(def.id, provider);
  }

  const models = new Map(config.models.map((m) => [m.id, m]));
  const cooldownUntil = new Map();

  function usableRoutes(model) {
    return model.routes.filter((r) => providers.has(r.provider)).map((route) => ({ route, provider: providers.get(route.provider) }));
  }

  return {
    providers,

    /** Resolves a client-facing model name (alias or id) to { name, model, routes } or null. */
    resolve(name) {
      const model = models.get(config.aliases[name] ?? name);
      if (!model) return null;
      const routes = usableRoutes(model);
      if (!routes.length) return null;
      // Healthy providers first, keeping configured order; cooled-down ones as last resort.
      const t = now();
      routes.sort((a, b) => ((cooldownUntil.get(a.provider.id) ?? 0) > t) - ((cooldownUntil.get(b.provider.id) ?? 0) > t));
      return { name, model, routes };
    },

    listModels() {
      const ids = config.models.filter((m) => usableRoutes(m).length).map((m) => m.id);
      const available = new Set(ids);
      const aliases = Object.entries(config.aliases).filter(([, target]) => available.has(target)).map(([alias]) => alias);
      return [...aliases, ...ids];
    },

    reportFailure(providerId) {
      cooldownUntil.set(providerId, now() + COOLDOWN_MS);
    },
  };
}
