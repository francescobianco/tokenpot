import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

export const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const PLACEHOLDER = /\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/g;
const WHOLE_PLACEHOLDER = /^\$\{([A-Z0-9_]+)(?::-([^}]*))?\}$/;

function coerce(value) {
  if (value === '') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

/** Replace ${VAR} and ${VAR:-default} in every string of a parsed YAML tree. */
export function interpolate(node, env) {
  if (typeof node === 'string') {
    const whole = node.match(WHOLE_PLACEHOLDER);
    if (whole) return coerce(env[whole[1]] ?? whole[2] ?? '');
    return node.replace(PLACEHOLDER, (_, name, def) => env[name] ?? def ?? '');
  }
  if (Array.isArray(node)) return node.map((item) => interpolate(item, env));
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, interpolate(v, env)]));
  }
  return node;
}

function readYaml(dir, name, env) {
  const file = join(dir, name);
  if (!existsSync(file)) throw new Error(`Missing configuration file: ${file}`);
  return interpolate(YAML.parse(readFileSync(file, 'utf8')) ?? {}, env);
}

export function validateConfig(config) {
  const errors = [];
  const { budget, membership, providers, models } = config;
  const shares = budget.provider_share + budget.infrastructure_share + budget.reserve_share;
  if (Math.abs(shares - 1) > 1e-9) errors.push(`budget shares must sum to 1 (got ${shares})`);
  if (!['github_sponsors', 'allowlist', 'open'].includes(membership.verification)) {
    errors.push(`membership.verification must be github_sponsors, allowlist or open`);
  }
  if (!(membership.monthly_contribution > 0)) errors.push('membership.monthly_contribution must be > 0');
  if (!(config.credits.per_usd > 0)) errors.push('credits.per_usd must be > 0');

  const providerIds = new Set(providers.map((p) => p.id));
  const modelIds = new Set();
  for (const model of models) {
    if (modelIds.has(model.id)) errors.push(`duplicate model ${model.id}`);
    modelIds.add(model.id);
    if (!model.routes?.length) errors.push(`model ${model.id} has no routes`);
    for (const route of model.routes ?? []) {
      if (!providerIds.has(route.provider)) errors.push(`model ${model.id} uses unknown provider ${route.provider}`);
      if (!route.pricing) errors.push(`model ${model.id} route ${route.provider} has no pricing`);
    }
  }
  for (const [alias, target] of Object.entries(config.aliases)) {
    if (!modelIds.has(target)) errors.push(`alias ${alias} points to unknown model ${target}`);
  }
  if (errors.length) throw new Error(`Invalid configuration:\n - ${errors.join('\n - ')}`);
  return config;
}

export function loadConfig({ dir = process.env.POOL_CONFIG_DIR ?? join(ROOT_DIR, 'config'), env = process.env } = {}) {
  const pool = readYaml(dir, 'pool.yml', env);
  const { providers = [] } = readYaml(dir, 'providers.yml', env);
  const { models = [], aliases = {} } = readYaml(dir, 'models.yml', env);
  return validateConfig({
    ...pool,
    env: env.POOL_ENV ?? 'development',
    providers,
    models,
    aliases,
  });
}
