// server/utils/llm/claude.ts
/**
 * Claude (Anthropic) LLM provider adapter.
 *
 * Uses the @anthropic-ai/sdk package for API calls.
 * Supports both synchronous and streaming chat completions.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, ChatMessage, LLMOptions, LLMResponse, ToolCall } from './types';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;

export class ClaudeProvider implements LLMProvider {
  readonly name = 'claude';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 3 });
  }

  async chat(messages: ChatMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const systemPrompt = options?.systemPrompt || this.extractSystemPrompt(messages);
    const userMessages = this.toAnthropicMessages(messages);

    const response = await this.client.messages.create({
      model: options?.model || DEFAULT_MODEL,
      max_tokens: options?.maxTokens || DEFAULT_MAX_TOKENS,
      temperature: options?.temperature,
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
      model: options?.model || DEFAULT_MODEL,
      max_tokens: options?.maxTokens || DEFAULT_MAX_TOKENS,
      temperature: options?.temperature,
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
      model: options?.model || DEFAULT_MODEL,
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
      'claude-sonnet-4-20250514',
      'claude-haiku-4-20250414',
      'claude-opus-4-20250514',
    ];
  }

  /**
   * Extract system prompt from messages array (if first message is system role).
   */
  private extractSystemPrompt(messages: ChatMessage[]): string | null {
    if (messages.length > 0 && messages[0].role === 'system') {
      return messages[0].content;
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
