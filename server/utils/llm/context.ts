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

interface OrgContext {
  orgName?: string;
  userName?: string;
  userRole?: string;
  features?: string[];
}

/**
 * Build a system prompt for the AI assistant.
 * Incorporates organization context when available.
 */
export function buildSystemPrompt(context?: OrgContext): string {
  const parts: string[] = [];

  // Base personality
  parts.push(
    'You are a helpful AI assistant integrated into a business management platform. ' +
    'You help users with their work by answering questions, providing insights, and offering suggestions.'
  );

  // Org context
  if (context?.orgName) {
    parts.push(`You are assisting a user from the organization "${context.orgName}".`);
  }

  if (context?.userName) {
    parts.push(`The user's name is ${context.userName}.`);
  }

  if (context?.userRole) {
    parts.push(`Their role is: ${context.userRole}.`);
  }

  // Platform awareness
  parts.push(
    'The platform includes these modules: ' +
    'Projects, Tickets, Tasks, Invoices, Contacts, Clients, Channels (messaging), ' +
    'Email Campaigns, Social Media, Scheduling/Appointments, Phone/Call Logs, and Deals/Leads.'
  );

  // Behavior guidelines
  parts.push(
    'Guidelines:',
    '- Be concise and professional',
    '- When discussing data, remind users you can only see what they share in the conversation',
    '- Offer actionable suggestions when appropriate',
    '- If asked about specific platform features, explain how they work',
    '- Do not make up data or statistics',
    '- Format responses with markdown when helpful (headers, lists, code blocks)',
  );

  return parts.join('\n\n');
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
