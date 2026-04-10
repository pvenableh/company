/**
 * AI Email Content Generator.
 *
 * Takes a brief description + preferences and uses Claude to generate
 * a complete email template with sections, content, and image suggestions.
 * Returns structured JSON that maps to existing newsletter blocks.
 */
import { readItems } from '@directus/sdk';
import { getLLMProvider } from '~~/server/utils/llm/factory';
import { logAIUsage } from '~~/server/utils/ai-usage';
import { enforceTokenLimits } from '~~/server/utils/ai-token-enforcement';
import { getBrandContext } from '~~/server/utils/brand-context';
import type { ChatMessage } from '~~/server/utils/llm/types';

interface GenerateRequest {
  emailType: string;
  topic: string;
  keyPoints?: string;
  audience?: string;
  tone?: string;
  brandColor?: string;
  colorScheme?: string;
  colorCount?: number;
  customColors?: {
    text: string;
    accent: string;
    background: string;
  };
  organizationId?: string;
  clientId?: string;
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

  // Enforce AI token limits
  const tokenCheck = await enforceTokenLimits(event, body.organizationId);
  if (!tokenCheck.allowed) {
    throw createError({ statusCode: tokenCheck.statusCode || 402, message: tokenCheck.reason || 'AI token limit reached' });
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
        vars = schema.map((v: any) => `${v.key} [TYPE=${v.type.toUpperCase()}]`);
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
- CRITICAL: Each variable has a TYPE label in brackets like [TYPE=COLOR] or [TYPE=TEXT]. You MUST respect the type:
  * [TYPE=COLOR] → ONLY a valid hex color code like "#333333" or "#6366f1". NEVER put text/sentences here.
  * [TYPE=TEXT] or [TYPE=RICHTEXT] → ONLY text content (headings, paragraphs, etc.). NEVER put hex color codes here.
  * [TYPE=IMAGE] → Set to empty string "" and provide an imageSuggestion instead.
  * [TYPE=BOOLEAN] → "true" or "false" only.
- Double-check every variable: if its type is COLOR, the value must start with "#" and be a valid hex. If its type is TEXT, the value must be readable words, not a color code.
- For color variables, use the brand color and color scheme guidelines if provided, otherwise use professional defaults.
- COLOR SCHEME GUIDELINES (apply to all color variables):
  * "classic": Deep navy, burgundy, gold accents. Text: #1a1a2e, Backgrounds: #f5f5f5/#ffffff, Accent: #e94560
  * "modern": Clean contrast with purple/teal pops. Text: #2d3436, Backgrounds: #f8f9fa/#ffffff, Accent: #6c5ce7
  * "casual": Playful pinks, yellows, soft tones. Text: #2d3436, Backgrounds: #ffeaa7/#ffffff, Accent: #fd79a8
  * "clean": Minimal, mostly grayscale with one blue accent. Text: #333333, Backgrounds: #ffffff, Accent: #0984e3
  * "bright": Bold, saturated complementary colors. Text: #2d3436, Backgrounds: #ffffff/#ffeaa7, Accent: #e17055
  * "dark": Light text on dark backgrounds. Text: #f5f5f5, Backgrounds: #2d3436/#1e272e, Accent: #a29bfe
  * "warm": Earthy oranges, terracotta, cream. Text: #2d3436, Backgrounds: #ffeaa7/#ffffff, Accent: #e17055
  * "corporate": Professional blues, greens, light grays. Text: #2c3e50, Backgrounds: #ecf0f1/#ffffff, Accent: #2980b9
  * "custom": User-specified custom colors — use EXACTLY the colors provided in the user message below. Do not deviate.
  If a brand color is provided, use it as the primary accent color, adapting the scheme's other colors to complement it.
- COLOR COUNT: The user may specify how many distinct colors to use (2 or 3). If 2 colors, use only the primary text color and one accent color. If 3 colors, add a secondary/background accent. Default to 3 if not specified. Keep the palette cohesive and limited.
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

  // Fetch brand context: selected client if provided, otherwise organization
  const brandContext = await getBrandContext(event, {
    clientId: body.clientId,
    organizationId: body.organizationId,
  });

  const userMessage = buildUserMessage(body) + brandContext;

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

        // Sanitize color variables — the AI sometimes puts text into color fields
        const schema = match.variables_schema;
        let parsedSchema: Array<{ key: string; type: string }> = [];
        try {
          parsedSchema = typeof schema === 'string' ? JSON.parse(schema) : (schema || []);
        } catch { /* ignore */ }

        if (Array.isArray(parsedSchema) && section.variables) {
          const colorRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
          for (const def of parsedSchema) {
            const val = section.variables[def.key];
            if (!val) continue;

            if (def.type === 'color') {
              // Color field with non-color value — replace with brand color or default
              if (!colorRegex.test(val) && !['transparent', 'inherit', 'currentColor'].includes(val)) {
                section.variables[def.key] = body.brandColor || '#333333';
              }
            } else if ((def.type === 'text' || def.type === 'richtext') && colorRegex.test(val)) {
              // Text/richtext field with a hex color value — clear it
              section.variables[def.key] = '';
            }
          }
        }

        return {
          ...section,
          blockName: match.name,
          blockCategory: match.category,
        };
      })
      .filter(Boolean);

    // Log AI usage
    if (response.usage) {
      logAIUsage({
        event,
        endpoint: 'email/ai-generate',
        model: response.model,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        metadata: { emailType: body.emailType },
      }).catch(() => {});
    }

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

  if (body.colorScheme) {
    parts.push(`Color scheme: ${body.colorScheme}`);
  }

  if (body.colorCount) {
    parts.push(`Number of colors: ${body.colorCount} (limit the palette to exactly ${body.colorCount} distinct colors)`);
  }

  if (body.brandColor) {
    parts.push(`Brand/accent color: ${body.brandColor} (use this as the primary accent, adapt other colors from the color scheme to complement it)`);
  }

  if (body.customColors) {
    parts.push(`CUSTOM COLORS (use these EXACT hex values for all color variables):
- Text color: ${body.customColors.text}
- Accent/highlight color: ${body.customColors.accent}
- Background color: ${body.customColors.background}
Do NOT use any other colors. All [TYPE=COLOR] variables must use one of these three hex values.`);
  }

  return parts.join('\n\n');
}
