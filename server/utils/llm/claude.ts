// server/utils/llm/claude.ts
/**
 * Claude (Anthropic) LLM provider adapter.
 *
 * Uses the @anthropic-ai/sdk package for API calls.
 * Supports both synchronous and streaming chat completions.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, ChatMessage, LLMOptions, LLMResponse, ToolCall } from './types';

// Fallback model when neither a per-call `options.model` nor a configured
// default (runtimeConfig.llm.model / LLM_MODEL / NUXT_LLM_MODEL) is set. Keep
// this a CURRENT, valid model id — a decommissioned id here 404s every AI call.
const DEFAULT_MODEL = 'claude-sonnet-5';
const DEFAULT_MAX_TOKENS = 4096;

export class ClaudeProvider implements LLMProvider {
  readonly name = 'claude';
  private client: Anthropic;
  /** Instance default (from runtime config), used when a call omits `model`. */
  private defaultModel: string;

  constructor(apiKey: string, defaultModel?: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 3 });
    this.defaultModel = defaultModel || DEFAULT_MODEL;
  }

  async chat(messages: ChatMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const systemPrompt = options?.systemPrompt || this.extractSystemPrompt(messages);
    const userMessages = this.toAnthropicMessages(messages);

    const response = await this.client.messages.create({
      // NOTE: `temperature` is intentionally omitted — current Claude models
      // (sonnet-5+) deprecated it and reject the request when it's present.
      model: options?.model || this.defaultModel,
      max_tokens: options?.maxTokens || DEFAULT_MAX_TOKENS,
      system: systemPrompt || undefined,
      messages: userMessages,
    });

    const content = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as any).text)
      .join('');

    return {
      content,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      stopReason: response.stop_reason || undefined,
    };
  }

  async *chatStream(
    messages: ChatMessage[],
    options?: LLMOptions,
  ): AsyncGenerator<string, LLMResponse | undefined, unknown> {
    const systemPrompt = options?.systemPrompt || this.extractSystemPrompt(messages);
    const userMessages = this.toAnthropicMessages(messages);

    const stream = this.client.messages.stream({
      // `temperature` omitted — deprecated/rejected by current Claude models.
      model: options?.model || this.defaultModel,
      max_tokens: options?.maxTokens || DEFAULT_MAX_TOKENS,
      system: systemPrompt || undefined,
      messages: userMessages,
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        (event.delta as any).type === 'text_delta'
      ) {
        yield (event.delta as any).text;
      }
    }

    // After stream completes, return usage from the final message
    try {
      const finalMessage = await stream.finalMessage();
      return {
        content: '',
        model: finalMessage.model,
        usage: {
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
        },
        stopReason: finalMessage.stop_reason || undefined,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Non-streaming call with tool support.
   * Accepts pre-built Anthropic MessageParam[] so callers can construct
   * multi-turn tool_use / tool_result sequences correctly.
   */
  async chatWithTools(
    anthropicMessages: Anthropic.MessageParam[],
    options?: LLMOptions,
  ): Promise<{
    text: string;
    toolCalls: ToolCall[];
    stopReason: string;
    rawContent: Anthropic.ContentBlock[];
    usage?: { inputTokens: number; outputTokens: number };
  }> {
    const anthropicTools: Anthropic.Tool[] = (options?.tools || []).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool.InputSchema,
    }));

    const response = await this.client.messages.create({
      model: options?.model || this.defaultModel,
      max_tokens: options?.maxTokens || DEFAULT_MAX_TOKENS,
      system: options?.systemPrompt || undefined,
      messages: anthropicMessages,
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as Anthropic.TextBlock).text)
      .join('');

    const toolCalls: ToolCall[] = response.content
      .filter((b) => b.type === 'tool_use')
      .map((b) => {
        const tb = b as Anthropic.ToolUseBlock;
        return { id: tb.id, name: tb.name, input: tb.input as Record<string, any> };
      });

    return {
      text,
      toolCalls,
      stopReason: response.stop_reason || 'end_turn',
      rawContent: response.content,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    };
  }

  /** Convert ChatMessage[] to Anthropic.MessageParam[] for use with chatWithTools. */
  toAnthropicMessageParams(messages: ChatMessage[]): Anthropic.MessageParam[] {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
  }

  models(): string[] {
    return [
      'claude-sonnet-5',
      'claude-opus-4-8',
      'claude-haiku-4-5-20251001',
    ];
  }

  /**
   * Extract system prompt from messages array (if first message is system role).
   */
  private extractSystemPrompt(messages: ChatMessage[]): string | null {
    const first = messages[0];
    if (first && first.role === 'system') {
      return first.content;
    }
    return null;
  }

  /**
   * Convert ChatMessage[] to Anthropic's message format.
   * Filters out system messages (handled separately by Claude API).
   */
  private toAnthropicMessages(messages: ChatMessage[]) {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
  }
}
