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
 */
export function parseVariablesSchema(
  raw: BlockVariableDefinition[] | string | Record<string, any> | null | undefined
): BlockVariableDefinition[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
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
