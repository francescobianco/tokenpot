import { createOpenAICompatibleProvider } from './openai-compatible.js';
import { createMockProvider } from './mock.js';

const FACTORIES = {
  'openai-compatible': createOpenAICompatibleProvider,
  mock: createMockProvider,
};

export function createProvider(def, deps) {
  const factory = FACTORIES[def.type];
  if (!factory) throw new Error(`Provider ${def.id}: unknown type ${def.type}`);
  return factory(def, deps);
}

/**
 * A provider may serve production traffic only when its terms have been
 * verified for multi-user gateway usage (see docs/providers.md).
 */
export function isTermsVerified(def) {
  return def.redistribution?.allowed === true;
}
