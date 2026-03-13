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

let _cachedProvider: LLMProvider | null = null;
let _cachedProviderName: string | null = null;

/**
 * Get the configured LLM provider.
 *
 * Uses runtime config to determine which provider to instantiate.
 * Caches the provider instance for reuse.
 *
 * @param providerOverride - Override the configured provider (for testing)
 */
export function getLLMProvider(providerOverride?: string): LLMProvider {
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
      provider = new ClaudeProvider(apiKey);
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
