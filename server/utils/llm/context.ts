// server/utils/llm/context.ts
/**
 * Builds system prompts with org context for AI chat sessions.
 *
 * Provides the AI assistant with awareness of:
 * - Organization name and context
 * - User role within the organization
 * - Available platform features
 * - Appropriate behavior guidelines
 */

export interface OrgContext {
  orgName?: string;
  userName?: string;
  userRole?: string;
  features?: string[];
  /** Pre-built context summaries from the context broker */
  clientsSummary?: string;
  projectsSummary?: string;
  invoicesSummary?: string;
  dealsSummary?: string;
  ticketsSummary?: string;
}

/**
 * Build a system prompt for the AI assistant.
 * Incorporates organization context when available.
 */
export function buildSystemPrompt(context?: OrgContext): string {
  const parts: string[] = [];

  // Core identity — business operations partner, not generic chatbot
  parts.push(
    'You are Earnest, the user\'s business operations partner. ' +
    'You have real-time visibility into their clients, projects, revenue, tasks, and team. ' +
    'Lead with what you notice — surface risks, opportunities, and connections the user might miss. ' +
    'When referencing data, cite specifics (client names, amounts, dates) and include [Source: X] tags inline to attribute where the data came from (e.g. [Source: Invoices], [Source: Client Profile], [Source: Tasks]). ' +
    'Be proactive: if you see overdue invoices, stale clients, or blocked projects, mention them.',
  );

  // Org + user context
  if (context?.orgName) {
    parts.push(`You are the operations partner for "${context.orgName}".`);
  }

  if (context?.userName) {
    parts.push(`The user's name is ${context.userName}.`);
  }

  if (context?.userRole) {
    parts.push(`Their role is: ${context.userRole}.`);
  }

  // Live operational context (from context broker queries)
  if (context?.clientsSummary) {
    parts.push(`CLIENTS:\n${context.clientsSummary}`);
  }
  if (context?.projectsSummary) {
    parts.push(`PROJECTS:\n${context.projectsSummary}`);
  }
  if (context?.invoicesSummary) {
    parts.push(`REVENUE:\n${context.invoicesSummary}`);
  }
  if (context?.dealsSummary) {
    parts.push(`PIPELINE:\n${context.dealsSummary}`);
  }
  if (context?.ticketsSummary) {
    parts.push(`TICKETS:\n${context.ticketsSummary}`);
  }

  // Platform awareness
  parts.push(
    'The platform includes these modules: ' +
    'Projects, Tickets, Tasks, Invoices, Contacts, Clients, Channels (messaging), ' +
    'Email Campaigns, Social Media, Scheduling/Appointments, Phone/Call Logs, and Deals/Leads.',
  );

  // Behavior guidelines
  parts.push(
    'Guidelines:',
    '- Be concise and professional',
    '- Reference the operational data above to give contextually grounded answers',
    '- Distinguish between known facts (from data), observed patterns, and recommendations',
    '- When you spot a risk or opportunity in the data, surface it proactively',
    '- Offer actionable next steps — draft an email, create a task, flag an overdue invoice',
    '- Do not fabricate data — if you don\'t have context on something, say so',
    '- Format responses with markdown when helpful (headers, lists, bold for key points)',
  );

  return parts.join('\n\n');
}

/**
 * Format saved AI notes into a context block for the system prompt.
 * Pinned notes and entity-tagged notes are surfaced to the AI so it can
 * reference prior user-curated knowledge.
 */
export function formatNotesContext(notes: Array<{
  title?: string | null;
  content: string;
  is_pinned?: boolean | null;
  tags?: any[];
}>): string {
  if (!notes || notes.length === 0) return '';

  const lines = notes.map((n) => {
    const tagNames = (n.tags || [])
      .map((t: any) => t.ai_tags_id?.name)
      .filter(Boolean)
      .join(', ');
    const title = n.title || 'Untitled';
    // Truncate content to ~300 chars to stay within token budget
    const content = n.content.length > 300
      ? n.content.substring(0, 300) + '...'
      : n.content;
    return `### ${title}${tagNames ? ` [${tagNames}]` : ''}${n.is_pinned ? ' 📌' : ''}\n${content}`;
  });

  return `\n\nYOUR SAVED NOTES (${notes.length} relevant — the user pinned or tagged these for you to reference):\n${lines.join('\n\n---\n\n')}`;
}

/**
 * Build a system prompt for the chat support PWA.
 * This is for admin/staff responding to client chats with AI assistance.
 */
export function buildSupportPrompt(context?: OrgContext): string {
  const parts: string[] = [];

  parts.push(
    'You are an AI assistant helping a support team member respond to customer messages. ' +
    'Your role is to suggest helpful replies and summarize conversations.'
  );

  if (context?.orgName) {
    parts.push(`The support team is from "${context.orgName}".`);
  }

  parts.push(
    'Guidelines:',
    '- Suggest professional, friendly responses',
    '- Keep responses concise and helpful',
    '- When summarizing, focus on the key issue and any action items',
    '- Match the tone of the conversation',
    '- Flag any urgent issues that need immediate attention',
  );

  return parts.join('\n\n');
}
