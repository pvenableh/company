export type BlockCategory =
  | 'header'
  | 'hero'
  | 'content'
  | 'two-column'
  | 'three-column'
  | 'cta'
  | 'image'
  | 'stats'
  | 'quote'
  | 'list'
  | 'divider'
  | 'social'
  | 'footer';

export interface BlockVariableDefinition {
  key: string;
  label: string;
  required?: boolean;
  type: 'text' | 'html' | 'url' | 'color' | 'image' | 'boolean';
  default?: string;
  description?: string;
}

/**
 * Parse a variables_schema field which may be a JSON string or already-parsed array.
 * Directus stores JSON fields as strings; this normalizes them.
 *
 * If the schema is empty but `mjmlSource` is provided, auto-detects variables
 * from `{{{variable_name}}}` patterns in the MJML and generates definitions
 * with smart type inference based on the variable name.
 */
export function parseVariablesSchema(
  raw: BlockVariableDefinition[] | string | Record<string, any> | null | undefined,
  mjmlSource?: string | null,
): BlockVariableDefinition[] {
  let schema: BlockVariableDefinition[] = [];

  if (raw) {
    if (Array.isArray(raw)) {
      schema = raw;
    } else if (typeof raw === 'string') {
      try { schema = JSON.parse(raw); } catch { /* ignore parse errors */ }
    }
  }

  // If we have a valid schema, return it
  if (schema.length > 0) return schema;

  // Fallback: auto-detect variables from MJML source
  if (mjmlSource) {
    return inferVariablesFromMjml(mjmlSource);
  }

  return [];
}

/**
 * Scan MJML source for `{{{variable_name}}}` patterns and generate
 * BlockVariableDefinition entries with smart type inference.
 */
export function inferVariablesFromMjml(mjml: string): BlockVariableDefinition[] {
  const matches = mjml.match(/\{\{\{([^}]+)\}\}\}/g);
  if (!matches) return [];

  const uniqueKeys = [...new Set(matches.map((m) => m.replace(/\{\{\{|\}\}\}/g, '')))];

  return uniqueKeys.map((key) => {
    const lower = key.toLowerCase();
    let type: BlockVariableDefinition['type'] = 'text';
    let defaultVal: string | undefined;

    // Infer type from variable name. Leave `defaultVal` undefined so the caller
    // can apply a key-aware default (backgrounds → transparent, text colors →
    // visible dark). Hardcoding 'transparent' here made all text colors render
    // invisible in the preview.
    if (lower.includes('color') || lower.includes('bg') || lower.includes('background')) {
      type = 'color';
    } else if (lower.includes('url') || lower.includes('link') || lower.includes('href')) {
      type = 'url';
    } else if (lower.includes('image') || lower.includes('img') || lower.includes('src') || lower.includes('logo') || lower.includes('photo') || lower.includes('avatar')) {
      type = 'image';
    } else if (lower.includes('html') || lower.includes('body') || lower.includes('content') || lower.includes('description')) {
      type = 'html';
    }

    return {
      key,
      label: key.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      type,
      default: defaultVal,
    };
  });
}

export interface NewsletterBlock {
  id: number;
  status?: 'published' | 'draft' | 'archived';
  sort?: number | null;
  user_created?: string | null;
  user_updated?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
  name?: string | null;
  slug: string;
  category?: BlockCategory | string | null;
  description?: string | null;
  mjml_source?: string | null;
  // Stored as JSON string in Directus, parsed at runtime via parseVariablesSchema()
  variables_schema: BlockVariableDefinition[] | string | null;
  thumbnail?: string | null;
  is_system?: boolean | null;
}

export interface TemplateBlock {
  id: number;
  template_id: number | EmailTemplate | string;
  block_id: number | NewsletterBlock | string;
  sort?: number | null;
  date_created?: string | null;
  instance_variables?: Record<string, any> | null;
}

export interface TemplateBlockWithBlock extends Omit<TemplateBlock, 'block_id'> {
  block_id: NewsletterBlock;
}

export interface CanvasBlock {
  instanceId: string;
  blockId: number;
  block: NewsletterBlock;
  variables: Record<string, any>;
  sort: number;
}

export interface EmailTemplate {
  id: number;
  status?: 'published' | 'draft' | 'archived';
  sort?: number | null;
  user_created?: string | null;
  user_updated?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
  name?: string | null;
  slug: string;
  type?: 'newsletter' | 'transactional' | null;
  subject_template?: string | null;
  mjml_source?: string | null;
  html_compiled?: string | null;
  mjml_assembled_at?: string | null;
  block_count?: number | null;
  blocks?: TemplateBlock[] | string[];

  // Partial toggles (all default to true)
  include_header?: boolean | null;
  include_footer?: boolean | null;
  include_web_version_bar?: boolean | null;
  header_partial_id?: number | EmailPartial | string | null;
  footer_partial_id?: number | EmailPartial | string | null;

  // System-provided starter templates that users can clone as a jump-start.
  is_starter?: boolean | null;
}

export interface MjmlCompileResult {
  html: string;
  errors: string[];
}

// ── Email Partials (header / footer / web-version bar) ──────────────────────

export type EmailPartialType = 'header' | 'footer' | 'web_version_bar';

export interface EmailPartial {
  id: number;
  status?: 'published' | 'draft' | 'archived';
  sort?: number | null;
  user_created?: string | null;
  user_updated?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
  name?: string | null;
  slug?: string | null;
  type?: EmailPartialType | null;
  description?: string | null;
  mjml_source?: string | null;
  // Stored as JSON in Directus, parsed at runtime
  variables_schema?: BlockVariableDefinition[] | Record<string, any> | null;
  instance_variables?: Record<string, any> | null;
  is_default?: boolean | null;
  /** Organization that owns this partial. Null = system default partial. */
  organization?: string | null;
}

// ── Emails (sent campaigns / newsletters) ──────────────────────────────────

// Directus uses standard published/draft/archived status.
// We write custom statuses (sending/sent/failed) as string values.
export type EmailStatus = 'published' | 'draft' | 'archived' | 'sending' | 'sent' | 'failed' | 'scheduled';

export interface Email {
  id: number;
  status?: EmailStatus | string;
  sort?: number | null;
  user_created?: string | null;
  user_updated?: string | null;
  date_created?: string | null;
  date_updated?: string | null;

  // Content
  name: string;
  subject?: string | null;
  template_id?: number | EmailTemplate | string | null;

  // Targeting — stored as JSON strings in Directus
  target_lists?: string | null;
  cc_list?: string | null;
  bcc_list?: string | null;
  custom_variables?: string | null;

  // Send tracking
  scheduled_at?: string | null;
  sent_at?: string | null;
  total_recipients?: number | null;
  total_sent?: number | null;
  total_failed?: number | null;
  send_errors?: Record<string, any> | null;

  // Preview (cached at send time)
  preview_html?: string | null;
}
