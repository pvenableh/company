/**
 * AI Email Content Generator.
 *
 * Takes a brief description + preferences and uses Claude to generate
 * a complete email template with sections, content, and image suggestions.
 * Returns structured JSON that maps to existing newsletter blocks.
 */
import { readItems } from '@directus/sdk';
import { getLLMProvider } from '~/server/utils/llm/factory';
import type { ChatMessage } from '~/server/utils/llm/types';

interface GenerateRequest {
  emailType: string;
  topic: string;
  keyPoints?: string;
  audience?: string;
  tone?: string;
  brandColor?: string;
}

export interface AIGeneratedSection {
  blockCategory: string;
  blockName: string;
  variables: Record<string, string>;
  imageSuggestion?: {
    description: string;
    searchTerms: string[];
  };
}

export interface AIGeneratedEmail {
  subject: string;
  previewText: string;
  sections: AIGeneratedSection[];
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const userId = (session as any).user?.id;
  if (!userId) {
    throw createError({ statusCode: 401, message: 'Authentication required' });
  }

  const body = await readBody<GenerateRequest>(event);
  if (!body.topic?.trim()) {
    throw createError({ statusCode: 400, message: 'Topic is required' });
  }

  const directus = await getUserDirectus(event);

  // 1. Fetch available blocks to give the AI real block names
  const blocks = await directus.request(
    readItems('newsletter_blocks', {
      filter: { status: { _eq: 'published' } },
      fields: ['name', 'category', 'description', 'variables_schema'],
      sort: ['category', 'sort', 'name'],
    }),
  ) as Array<{ name: string; category: string; description: string; variables_schema: any }>;

  // Build block catalog for the prompt
  const blockCatalog = blocks.map((b) => {
    let vars: string[] = [];
    try {
      const schema = typeof b.variables_schema === 'string'
        ? JSON.parse(b.variables_schema)
        : b.variables_schema;
      if (Array.isArray(schema)) {
        vars = schema.map((v: any) => `${v.key} (${v.type})`);
      }
    } catch { /* ignore */ }
    return `- [${b.category}] "${b.name}"${b.description ? ` — ${b.description}` : ''}${vars.length ? `\n  Variables: ${vars.join(', ')}` : ''}`;
  }).join('\n');

  // 2. Build the prompt
  const systemPrompt = `You are an expert email marketing copywriter and designer. You create compelling, professional email content.

AVAILABLE EMAIL BLOCKS (you MUST use these exact block names):
${blockCatalog}

RULES:
- Return ONLY valid JSON, no markdown fences, no extra text
- Use only block names from the list above (exact match)
- Fill in ALL variables for each block with compelling, relevant content
- For image variables, set to empty string "" and provide an imageSuggestion instead
- For color variables, use the brand color if provided, otherwise use professional defaults
- For URL variables, use "#" as placeholder
- For boolean variables, use "true" or "false"
- Create 4-7 sections for a complete email
- Always start with a hero block and end with a CTA block
- Write content that is engaging, concise, and action-oriented
- Match the requested tone and audience

Return this exact JSON structure:
{
  "subject": "Email subject line",
  "previewText": "Short preview text for email clients (50-90 chars)",
  "sections": [
    {
      "blockCategory": "category from the list",
      "blockName": "exact block name from the list",
      "variables": { "variable_key": "generated content value" },
      "imageSuggestion": {
        "description": "Description of ideal image",
        "searchTerms": ["term1", "term2", "term3"]
      }
    }
  ]
}`;

  const userMessage = buildUserMessage(body);

  const messages: ChatMessage[] = [
    { role: 'user', content: userMessage },
  ];

  // 3. Call the LLM
  const provider = getLLMProvider();
  try {
    const response = await provider.chat(messages, {
      systemPrompt,
      maxTokens: 4096,
      temperature: 0.7,
    });

    // 4. Parse the JSON response
    let generated: AIGeneratedEmail;
    try {
      // Strip markdown fences if present
      let content = response.content.trim();
      if (content.startsWith('```')) {
        content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      generated = JSON.parse(content);
    } catch (parseError) {
      console.error('[ai-generate] Failed to parse LLM response:', response.content);
      throw createError({
        statusCode: 502,
        message: 'AI returned invalid response. Please try again.',
      });
    }

    // 5. Validate and enrich — match block names to actual block IDs
    const enrichedSections = generated.sections
      .map((section) => {
        const match = blocks.find(
          (b) => b.name?.toLowerCase() === section.blockName?.toLowerCase()
            && b.category === section.blockCategory,
        ) || blocks.find(
          (b) => b.name?.toLowerCase() === section.blockName?.toLowerCase(),
        ) || blocks.find(
          (b) => b.category === section.blockCategory,
        );

        if (!match) return null;

        return {
          ...section,
          blockName: match.name,
          blockCategory: match.category,
        };
      })
      .filter(Boolean);

    return {
      subject: generated.subject,
      previewText: generated.previewText,
      sections: enrichedSections,
    };
  } catch (error: any) {
    if (error.statusCode) throw error;
    console.error('[ai-generate] LLM error:', error);
    throw createError({
      statusCode: 500,
      message: 'Failed to generate email content. Please try again.',
    });
  }
});

function buildUserMessage(body: GenerateRequest): string {
  const parts: string[] = [];

  parts.push(`Create an email for: ${body.topic.trim()}`);

  if (body.emailType) {
    parts.push(`Email type: ${body.emailType}`);
  }

  if (body.keyPoints?.trim()) {
    parts.push(`Key points to include:\n${body.keyPoints.trim()}`);
  }

  if (body.audience) {
    parts.push(`Target audience: ${body.audience}`);
  }

  if (body.tone) {
    parts.push(`Tone: ${body.tone}`);
  }

  if (body.brandColor) {
    parts.push(`Brand color: ${body.brandColor}`);
  }

  return parts.join('\n\n');
}
