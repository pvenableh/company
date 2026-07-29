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

// Canned Director's Office / Boardroom plans, keyed by agenda subject. Each is a
// short, on-voice briefing (the "TL;DR:" line drives the deck's takeaways slide;
// the "Label:" lines split into per-slide thoughts) plus a couple of concrete,
// reversible `add_task` proposals so the demo Slides deck renders a real plan.
// Deliberately qualitative — no invented dollar figures — so the prose never
// contradicts the real financial snapshot the money deck renders alongside it.
interface MockDirectorPlan {
  text: string;
  tasks: Array<{ title: string; priority: 'low' | 'medium' | 'high' | 'urgent' }>;
}

const DIRECTOR_PLANS: Record<string, MockDirectorPlan> = {
  money: {
    text: [
      'Income: Revenue is steady, carried by retainer work and a couple of one-off builds — a healthy base, but concentrated in a handful of accounts.',
      'Expenses: Spend is tracking in line with income; software and contractor costs are the two levers worth watching.',
      'Prediction: On the current run-rate the next quarter stays net-positive, though unbilled work and overdue receivables are the real swing factor.',
      'Verdict: Solid footing. Collect what is owed, keep the pipeline warm, and the trajectory holds.',
      'TL;DR: Healthy base, concentrated in a few accounts | Watch software + contractor spend | Chase overdue AR to lock the quarter',
    ].join('\n'),
    tasks: [
      { title: 'Chase the overdue invoices flagged this week', priority: 'high' },
      { title: 'Review the two largest expense lines for savings', priority: 'medium' },
    ],
  },
  leads: {
    text: [
      'Pipeline: A few active leads have real momentum, but the highest-scoring one is still unclaimed — that is money left waiting on the table.',
      'Risk: Without a clear owner the hottest lead goes cold; speed of first response is the single biggest lever on close rate.',
      'TL;DR: Hottest lead is unassigned | Assign an owner today | Follow up before momentum fades',
    ].join('\n'),
    tasks: [
      { title: 'Assign the unclaimed high-score lead an owner', priority: 'high' },
      { title: 'Send a follow-up to the top open lead', priority: 'medium' },
    ],
  },
  proposals: {
    text: [
      'Outlook: One sizeable proposal has been out for three weeks with no reply — the interest was real, so silence is a nudge problem, not a fit problem.',
      'Move: A light, specific check-in beats another full resend; give the client an easy decision point and a deadline.',
      'TL;DR: Atlas proposal has gone quiet | Send a warm check-in | Set a clear decision date',
    ].join('\n'),
    tasks: [
      { title: 'Follow up on the proposal with no reply in 3 weeks', priority: 'high' },
      { title: 'Set a decision deadline with the client', priority: 'medium' },
    ],
  },
  projects: {
    text: [
      'Delivery: The active launch is on schedule but its deadline is close — the next few days decide whether it stays green.',
      'Focus: Clear the blocking work first; everything else can wait until go-live is locked.',
      'TL;DR: Launch deadline is near | Confirm it is on track | Clear the blockers before go-live',
    ].join('\n'),
    tasks: [
      { title: 'Confirm the launch is on track for its deadline', priority: 'high' },
      { title: 'Clear the blocking tasks before go-live', priority: 'medium' },
    ],
  },
  clients: {
    text: [
      'Relationships: The active accounts are healthy, but one has gone quiet and another is missing its brand profile — both are cheap to fix and easy to lose.',
      'Play: A short check-in and a completed profile keep the account warm and make every future touch sharper.',
      'TL;DR: One account has gone quiet | Book a check-in | Complete the missing brand profile',
    ].join('\n'),
    tasks: [
      { title: 'Book a check-in with the quietest active account', priority: 'medium' },
      { title: 'Complete the missing brand profile on the client', priority: 'low' },
    ],
  },
  tickets: {
    text: [
      'Support: The queue is under control, but one high-priority ticket has no owner — an unowned urgent item is how things slip.',
      'Fix: Put a name on it now and triage the oldest open items so nothing ages out silently.',
      'TL;DR: A high-priority ticket is unassigned | Assign an owner | Triage the aging tickets',
    ].join('\n'),
    tasks: [
      { title: 'Assign an owner to the unassigned high-priority ticket', priority: 'high' },
      { title: 'Triage the oldest open tickets', priority: 'medium' },
    ],
  },
  default: {
    text: [
      'Read: The business is in good shape overall — this is about sequencing the next few moves, not scrambling.',
      'Play: Close the loop on what is already in flight before opening anything new; momentum compounds.',
      'TL;DR: Solid footing | Finish what is in flight | Line up the next clear move',
    ].join('\n'),
    tasks: [
      { title: 'Close out the highest-leverage item already in flight', priority: 'high' },
      { title: 'Line up the next concrete step for the week', priority: 'medium' },
    ],
  },
};

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
   *
   * For ordinary chat mutations the mock never requests a tool call — it just
   * returns on-voice text — so demo sessions never trigger real mutations.
   *
   * The ONE exception is the Director's Office / Boardroom planner
   * (server/api/ai/director/plan.post.ts): that surface is *propose-only* — every
   * tool call becomes a `pending` ai_actions row a human still has to approve, so
   * nothing executes on its own. Without at least one tool call the planner
   * returns stepCount 0 and the Slides deck renders empty, which also blocks the
   * marketing `director-slides` screenshot. So when we recognise a Director plan
   * prompt we emit a small, safe set of `add_task` proposals (reversible; a task
   * only needs a title) plus an on-voice briefing, letting the demo deck render a
   * genuine plan. Shape matches ClaudeProvider.chatWithTools throughout.
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

    const director = this.directorPlan(promptText, options);
    if (director) {
      const rawContent: Anthropic.ContentBlock[] = [
        { type: 'text', text: director.text, citations: [] } as unknown as Anthropic.ContentBlock,
        ...director.toolCalls.map(
          (tc) => ({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input } as unknown as Anthropic.ContentBlock),
        ),
      ];
      return {
        text: director.text,
        toolCalls: director.toolCalls,
        stopReason: 'tool_use',
        rawContent,
        usage: this.usage(promptText, director.text),
      };
    }

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

  /**
   * Recognise a Director's Office / Boardroom plan request and synthesise a
   * small, on-voice briefing + a couple of `add_task` proposals grounded to the
   * meeting's subject. Returns null for every other tool-aware call (ordinary
   * chat mutations) so those keep the "prose, never a tool call" behaviour.
   *
   * Detection keys off the planner's system-prompt signature (stable literal
   * strings from plan.post.ts) AND the presence of the `add_task` tool, so a
   * stray chat prompt can't trip it.
   */
  private directorPlan(
    promptText: string,
    options?: LLMOptions,
  ): { text: string; toolCalls: ToolCall[] } | null {
    const hasAddTask = (options?.tools || []).some((t) => t.name === 'add_task');
    const isDirector =
      /Director reporting to the user/i.test(promptText) &&
      /(as tool calls|Emit each step as a tool call|Draft the plan now)/i.test(promptText);
    if (!hasAddTask || !isDirector) return null;

    // Subject from the scope line: `the "money" area of the business`.
    const subject = (promptText.match(/the\s+"(\w+)"\s+area of the business/i)?.[1] || '').toLowerCase();

    const plan = DIRECTOR_PLANS[subject] || DIRECTOR_PLANS.default!;
    // Deterministic ids (no Math.random — this may run in a workflow context).
    const seed = promptText.length;
    const toolCalls: ToolCall[] = plan.tasks.map((task, i) => ({
      id: `mock_dir_${seed}_${i}`,
      name: 'add_task',
      input: { title: task.title, priority: task.priority },
    }));
    return { text: plan.text, toolCalls };
  }

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

    // Pursuit strategist — cold-proposal re-approach.
    if (/"strategic_read"|"next_touchpoint"/.test(p)) {
      return JSON.stringify({
        strategic_read: 'The proposal was viewed but then went quiet — the full scope likely felt like a big first commitment. Change the medium (a quick call beats another email) and offer a smaller, lower-risk entry point.',
        next_touchpoint: {
          type: 'call',
          summary: 'Quick 10-min call — a phased option',
          note: 'Hi — no pressure on the full build. Could I grab 10 minutes to walk you through a smaller Phase 1 so you can see how we work before committing to the whole thing?',
        },
        proposal_angle: 'Offer a trimmed Phase 1 (identity + one landing page) as a low-risk first step, with the full scope as an optional Phase 2.',
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
