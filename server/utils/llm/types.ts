// server/utils/llm/types.ts
/**
 * Provider-agnostic LLM types.
 *
 * These interfaces define the contract for any LLM provider adapter.
 * Adding a new provider (OpenAI, Gemini, etc.) requires only implementing
 * the LLMProvider interface in a new file.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMOptions {
  /** Model identifier (provider-specific, e.g. 'claude-sonnet-4-20250514') */
  model?: string;
  /** Maximum tokens in the response */
  maxTokens?: number;
  /** Temperature (0-1, lower = more deterministic) */
  temperature?: number;
  /** System prompt to set the assistant's behavior */
  systemPrompt?: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  stopReason?: string;
}

/**
 * LLM Provider interface — implement this for each provider.
 */
export interface LLMProvider {
  /** Provider name (e.g. 'claude', 'openai', 'gemini') */
  readonly name: string;

  /**
   * Send a chat completion request and return the full response.
   */
  chat(messages: ChatMessage[], options?: LLMOptions): Promise<LLMResponse>;

  /**
   * Send a chat completion request with streaming.
   * Yields partial text chunks as they arrive.
   */
  chatStream(
    messages: ChatMessage[],
    options?: LLMOptions,
  ): AsyncGenerator<string, void, unknown>;

  /**
   * List available models for this provider.
   */
  models(): string[];
}
