// server/utils/llm/mock-claude.ts
/**
 * Mock Claude provider — used ONLY for the shared public demo logins so that
 * demo visitors can't burn real Anthropic tokens on our key. Selected in
 * getLLMProvider() (server/utils/llm/factory.ts) when
 * `event.context.demoAiMock` is set by server/middleware/demo-ai-mock.ts.
 *
 * It mirrors the public surface of ClaudeProvider (chat / chatStream /
 * chatWithTools / toAnthropicMessageParams / models / name) so it is a drop-in
 * for every getLLMProvider() caller. It never calls the network:
 *   - Prose paths (chat panel, greeting text, drafts) → a warm, on-voice
 *     Earnest response, streamed in chunks for chatStream.
 *   - Structured paths (endpoints that JSON.parse the reply — marketing
 *     analysis, event/task/goal generation, social/email copy) → a small,
 *     shape-appropriate canned stub so those endpoints don't 500, falling back
 *     to {} / [] when the shape is unknown.
 *
 * It always reports plausible token usage so the existing logAIUsage() call in
 * each endpoint records a row → the AI & Tokens dashboard keeps growing for
 * demo visitors. Deduction is skipped upstream (a mocked call spends nothing).
 *
 * Fully reversible: NUXT_PUBLIC_DEMO_AI_MOCK=false stops the middleware from
 * flagging demo requests, so getLLMProvider() returns the real ClaudeProvider.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, ChatMessage, LLMOptions, LLMResponse, ToolCall } from './types';

const CHAT_REPLIES = [
  "Happy to help! Here's how I'd think about it: start with what's already moving — you've got active work with strong momentum, so protect that first. Then pick the one thing that unblocks the most downstream steps and do it today. Want me to break that into a short checklist?",
  "Good question. Looking at where things stand, the highest-leverage move is to close the loop on what's already in flight before opening anything new — momentum compounds. I'd tackle the nearest deadline first, then batch the smaller follow-ups so they don't scatter your focus. Happy to draft the next steps if that's useful.",
  "Let's get you a clear path. Two things stand out: there's a deliverable that's close to done (worth a final push), and a client touchpoint that's overdue for a nudge. I'd knock out the quick win first for the morale bump, then send that follow-up while it's top of mind. Want a draft of the message?",
  "Here's my take: you're in a solid spot, so this is about sequencing, not scrambling. Group the reactive items (replies, approvals) into one block, then guard a longer stretch for the deep work that actually moves a project forward. Small structure, big payoff. I can sketch the day if you'd like.",
];

export class MockClaudeProvider implements LLMProvider {
  readonly name = 'mock';

  async chat(messages: ChatMessage[], options?: LLMOptions): Promise<LLMResponse> {
    const promptText = this.promptText(messages, options);
    const content = this.render(promptText);
    return {
      content,
      model: options?.model || 'claude-sonnet-5',
      usage: this.usage(promptText, content),
      stopReason: 'end_turn',
    };
  }

  async *chatStream(
    messages: ChatMessage[],
    options?: LLMOptions,
  ): AsyncGenerator<string, LLMResponse | undefined, unknown> {
    const promptText = this.promptText(messages, options);
    const content = this.render(promptText);

    // Stream word-by-word so the chat panel animates like a real response.
    const words = content.split(/(\s+)/);
    for (const w of words) {
      yield w;
    }

    return {
      content: '',
      model: options?.model || 'claude-sonnet-5',
      usage: this.usage(promptText, content),
      stopReason: 'end_turn',
    };
  }

  /**
   * Tool-aware path (used by the chat mutation flow + director endpoints).
   * The mock never requests a tool call — it just returns on-voice text — so
   * demo sessions never trigger real mutations. Shape matches
   * ClaudeProvider.chatWithTools so chat.post.ts can treat it identically.
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
    const promptText = [
      options?.systemPrompt || '',
      ...anthropicMessages.map((m) => (typeof m.content === 'string' ? m.content : '')),
    ].join('\n');
    const text = this.render(promptText);
    return {
      text,
      toolCalls: [],
      stopReason: 'end_turn',
      rawContent: [{ type: 'text', text, citations: [] } as unknown as Anthropic.ContentBlock],
      usage: this.usage(promptText, text),
    };
  }

  /** Mirror of ClaudeProvider.toAnthropicMessageParams for the tool path. */
  toAnthropicMessageParams(messages: ChatMessage[]): Anthropic.MessageParam[] {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  }

  models(): string[] {
    return ['claude-sonnet-5', 'claude-opus-4-8', 'claude-haiku-4-5-20251001'];
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private promptText(messages: ChatMessage[], options?: LLMOptions): string {
    return [options?.systemPrompt || '', ...messages.map((m) => m.content)].join('\n');
  }

  /**
   * Pick prose vs. a structured stub based on what the prompt asked for.
   * Endpoints that parse JSON all say so in their system prompt ("Return ONLY
   * a JSON array", "respond with JSON", etc.).
   */
  private render(promptText: string): string {
    const p = promptText.toLowerCase();
    const wantsJson = /\bjson\b/.test(p) || /respond with (?:a |an )?(?:json|array|object)/.test(p);
    if (!wantsJson) {
      return this.prose(promptText);
    }

    // Detection keys off the QUOTED field names / explicit shape instructions
    // the endpoints request ("Return ONLY a JSON object with \"greeting\" ...").
    // That's far more robust than bare keywords: the prompts also embed the
    // voice charter + org context, which mention words like "email"/"social" in
    // passing and would otherwise trip the wrong branch. Most specific first.

    // Array-shaped: task / goal suggestions ("Return ONLY a JSON array of strings").
    if (/json array of strings|array of strings/.test(p)) {
      // Distinguish the goal-suggestions endpoint (whose prompt says "goal
      // suggestions") from task-suggestions (which only mentions "goals" in
      // passing while tailoring tasks).
      if (/goal suggestion|suggest\w*\b.{0,12}goals?|goal ideas/.test(p)) {
        return JSON.stringify([
          'Grow monthly retainer revenue by 15% this quarter',
          'Publish two client case studies',
          'Lift email newsletter open rate above 35%',
        ]);
      }
      return JSON.stringify([
        'Review the active launch checklist',
        'Send the overdue client follow-up',
        'Draft next week’s social posts',
      ]);
    }

    // Object-shaped stubs, matched on the requested quoted field names first.
    if (/"greeting"/.test(p) || /"subtitle"/.test(p)) {
      return JSON.stringify({
        greeting: 'Welcome back 👋',
        subtitle: 'Here’s where things stand today — you’re in a good spot.',
      });
    }
    if (/"events"/.test(p) || /\bmilestones?\b|project timeline/.test(p)) {
      return JSON.stringify({ events: [], summary: '', totalDays: 0 });
    }
    // Social posts are filtered by requested platform downstream, so a canned
    // post would be dropped anyway — return an empty (valid) container.
    if (/"posts"/.test(p) || /"caption"/.test(p) || /"hashtags"/.test(p)) {
      return JSON.stringify({ posts: [] });
    }
    if (/"sections"/.test(p) || /"subject"/.test(p) || /"previewtext"/.test(p)) {
      return JSON.stringify({ subject: 'A quick update from the studio', previewText: '', sections: [] });
    }
    if (/"healthscore"|"insights"|"recommendations"|"topactions"/.test(p)) {
      return JSON.stringify({
        healthScore: 78,
        healthBreakdown: {},
        insights: [],
        recommendations: [],
        topActions: [],
        growthOpportunities: [],
      });
    }

    // Looser fallbacks for prompts that describe the shape without quoting fields.
    if (/\bevents?\b|timeline/.test(p)) return JSON.stringify({ events: [], summary: '', totalDays: 0 });
    if (/\bposts?\b|caption|hashtag/.test(p)) return JSON.stringify({ posts: [] });
    if (/health\s?score|insights|recommendations|analy/.test(p)) {
      return JSON.stringify({ healthScore: 78, healthBreakdown: {}, insights: [], recommendations: [] });
    }

    // Unknown JSON shape — return an empty container that won't crash a parser.
    return /array/.test(p) ? '[]' : '{}';
  }

  private prose(promptText: string): string {
    // Deterministic pick (no Math.random in a possibly-workflow context) so the
    // reply varies with the prompt but is stable for the same input.
    const idx = promptText.length % CHAT_REPLIES.length;
    return CHAT_REPLIES[idx];
  }

  private usage(promptText: string, content: string): { inputTokens: number; outputTokens: number } {
    const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
    // ~4 chars/token, biased up a little to look like a real system prompt +
    // context payload rather than just the raw message.
    const inputTokens = clamp(Math.round(promptText.length / 4) + 700, 800, 2500);
    const outputTokens = clamp(Math.round(content.length / 4), 120, 1200);
    return { inputTokens, outputTokens };
  }
}
