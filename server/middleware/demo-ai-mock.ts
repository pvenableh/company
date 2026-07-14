// server/middleware/demo-ai-mock.ts
/**
 * Demo AI mock flag.
 *
 * On API requests, when the demoAiMock kill-switch is on AND the caller is one
 * of the shared public demo logins (demo@ / demo-agency@earnest.guru), stamp
 * `event.context.demoAiMock = true`. Downstream:
 *   - getLLMProvider() (server/utils/llm/factory.ts) returns the MockClaudeProvider
 *     so no real Anthropic tokens are spent, and
 *   - the deductOrgTokens() callsites skip deduction (a mocked call spends nothing).
 *
 * The AI usage dashboard still grows because logAIUsage() runs unconditionally.
 *
 * Scoped to /api/* so page/SSR requests don't pay the session lookup — every
 * getLLMProvider() caller is an API handler. Fully reversible: flip
 * NUXT_PUBLIC_DEMO_AI_MOCK=false and this never sets the flag.
 */
export default defineEventHandler(async (event) => {
  if (!event.path?.startsWith('/api/')) return;

  const config = useRuntimeConfig(event);
  if (!config.public?.demoAiMock) return;

  // Only the AI/LLM surface needs this. Skip the session lookup for the rest of
  // the API to keep non-AI requests cheap.
  const p = event.path;
  const touchesLLM =
    p.startsWith('/api/ai/') ||
    p.startsWith('/api/marketing/') ||
    p.startsWith('/api/social/ai-') ||
    p.startsWith('/api/crm/ai-') ||
    p.startsWith('/api/email/ai-') ||
    p.startsWith('/api/projects/generate-events') ||
    p.startsWith('/api/meetings/');
  if (!touchesLLM) return;

  if (await isDemoSession(event)) {
    event.context.demoAiMock = true;
  }
});
