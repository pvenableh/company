import type { User } from '../system';

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

export interface NewsletterBlock {
  id: number;
  status: 'published' | 'draft';
  sort: number | null;
  user_created: string | User | null;
  user_updated: string | User | null;
  date_created: string | null;
  date_updated: string | null;
  name: string;
  slug: string;
  category: BlockCategory;
  description: string | null;
  mjml_source: string;
  variables_schema: BlockVariableDefinition[] | null;
  thumbnail: string | null;
  is_system: boolean;
}

export interface TemplateBlock {
  id: number;
  template_id: number;
  block_id: number | NewsletterBlock;
  sort: number | null;
  date_created?: string | null;
  instance_variables: Record<string, any> | null;
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
  status: 'draft' | 'published';
  name: string;
  slug: string;
  type: 'newsletter' | 'transactional';
  subject_template: string | null;
  mjml_source: string | null;
  html_compiled: string | null;
  mjml_assembled_at: string | null;
  block_count: number | null;
  blocks?: TemplateBlock[];
  date_created: string | null;
  date_updated: string | null;
  user_created: string | User | null;
  user_updated: string | User | null;
}

export interface ContactList {
  id: number;
  status: 'published' | 'draft';
  name: string;
  description: string | null;
  member_count: number | null;
  date_created: string | null;
  user_created: string | User | null;
  members?: ContactListMember[];
}

export interface ContactListMember {
  id: number;
  list_id: number | ContactList;
  contact_id: number;
  subscribed: boolean;
  date_subscribed: string;
  date_unsubscribed: string | null;
}

export interface MjmlCompileResult {
  html: string;
  errors: string[];
}
