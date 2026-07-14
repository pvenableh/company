// server/utils/llm/factory.ts
/**
 * LLM Provider Factory.
 *
 * Returns the configured LLM provider based on runtime config.
 * Currently supports: claude.
 *
 * To add a new provider:
 * 1. Create a new file (e.g., `openai.ts`) implementing LLMProvider
 * 2. Add a case to the switch statement below
 * 3. Add the API key to runtimeConfig
 */

import type { LLMProvider } from './types';
import { ClaudeProvider } from './claude';
import { MockClaudeProvider } from './mock-claude';

let _cachedProvider: LLMProvider | null = null;
let _cachedProviderName: string | null = null;
let _cachedMockProvider: LLMProvider | null = null;

function getMockProvider(): LLMProvider {
  if (!_cachedMockProvider) _cachedMockProvider = new MockClaudeProvider();
  return _cachedMockProvider;
}

/**
 * Get the configured LLM provider.
 *
 * Uses runtime config to determine which provider to instantiate.
 * Caches the provider instance for reuse.
 *
 * @param providerOverride - Override the configured provider (for testing)
 */
export function getLLMProvider(providerOverride?: string): LLMProvider {
  // Demo sessions get the mock provider so public visitors can't spend real
  // Anthropic tokens on our key. The flag is stamped per-request by
  // server/middleware/demo-ai-mock.ts and read here via Nitro's async context
  // (nitro.experimental.asyncContext). If the context is unavailable, we fall
  // back to the real provider — safe because the demo orgs' ~100k/day token cap
  // bounds any spend that slips through.
  try {
    const event = typeof useEvent === 'function' ? useEvent() : null;
    if (event?.context?.demoAiMock) return getMockProvider();
  } catch {
    // No request context (e.g. background init) — use the configured provider.
  }

  const config = useRuntimeConfig();
  const llmConfig = (config as any).llm || {};
  const providerName = providerOverride || llmConfig.provider || 'claude';

  // Return cached instance if provider hasn't changed
  if (_cachedProvider && _cachedProviderName === providerName) {
    return _cachedProvider;
  }

  let provider: LLMProvider;

  switch (providerName) {
    case 'claude':
    case 'anthropic': {
      const apiKey = llmConfig.apiKey;
      if (!apiKey) {
        throw new Error('LLM API key not configured. Set NUXT_LLM_API_KEY in environment.');
      }
      // Pass the configured default model (runtimeConfig.llm.model, overridable
      // via LLM_MODEL / NUXT_LLM_MODEL) so it's not pinned to a hardcoded id.
      provider = new ClaudeProvider(apiKey, llmConfig.model);
      break;
    }

    // Future providers:
    // case 'openai': {
    //   const apiKey = llmConfig.openaiApiKey;
    //   provider = new OpenAIProvider(apiKey);
    //   break;
    // }
    // case 'gemini': {
    //   const apiKey = llmConfig.geminiApiKey;
    //   provider = new GeminiProvider(apiKey);
    //   break;
    // }

    default:
      throw new Error(`Unknown LLM provider: ${providerName}. Supported: claude`);
  }

  _cachedProvider = provider;
  _cachedProviderName = providerName;
  return provider;
}
