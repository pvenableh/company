/**
 * Contact and Mailing List types — aligned with Directus schema.
 *
 * Key notes:
 * - Contact.id is a string (UUID) in Directus
 * - Contact uses standard Directus status: published/draft/archived
 * - Contact has `title` (not `job_title`), no city/state/country (use `mailing_address`)
 * - JSON fields stored as strings in Directus (custom_fields, etc.)
 */

export type ContactStatus = 'published' | 'draft' | 'archived';

export type IndustryType =
  | 'Technology'
  | 'Healthcare'
  | 'Finance'
  | 'Education'
  | 'Real Estate'
  | 'Hospitality'
  | 'Legal'
  | 'Non-Profit'
  | 'Government'
  | string;

export interface Contact {
  id: string;
  status?: ContactStatus;
  sort?: number | null;
  user_created?: string | null;
  user_updated?: string | null;
  date_created?: string | null;
  date_updated?: string | null;

  // Identity
  prefix?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;

  // Professional
  title?: string | null;
  company?: string | null;
  industry?: IndustryType | null;
  website?: string | null;

  // Social
  linkedin_url?: string | null;
  instagram_handle?: string | null;

  // Location
  mailing_address?: string | null;
  timezone?: string | null;

  // Categorization
  category?: 'client' | 'prospect' | 'architect' | 'developer' | 'hospitality' | 'partner' | 'media' | null;
  tags?: string[] | null;
  custom_fields?: string | null;
  source?: string | null;
  notes?: string | null;
  photo?: string | null;

  // Email preferences
  email_subscribed?: boolean | null;
  email_unsubscribed_at?: string | null;
  unsubscribe_token?: string | null;
  email_bounced?: boolean | null;
  email_bounced_at?: string | null;
  email_bounce_type?: string | null;

  // Engagement
  last_opened_at?: string | null;
  last_clicked_at?: string | null;
  total_emails_sent?: number | null;
  total_opens?: number | null;
  total_clicks?: number | null;

  // Relations
  user?: string | null;
  organizations?: any[];
  lists?: MailingListContact[];
}

export interface MailingList {
  id: number;
  status?: 'published' | 'draft' | 'archived';
  sort?: number | null;
  user_created?: string | null;
  user_updated?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
  name?: string | null;
  slug: string;
  description?: string | null;
  is_default?: boolean | null;
  double_opt_in?: boolean | null;
  subscriber_count?: number | null;
  contacts?: MailingListContact[];
}

export interface MailingListContact {
  id: number;
  list_id: number | MailingList | string;
  contact_id: string | Contact;
  subscribed?: boolean | null;
  date_subscribed?: string | null;
  date_unsubscribed?: string | null;
  source?: string | null;
  custom_fields?: string | null;
}

export interface CreateContactPayload {
  first_name: string;
  last_name: string;
  email: string;
  prefix?: string;
  phone?: string;
  title?: string;
  company?: string;
  industry?: string;
  website?: string;
  mailing_address?: string;
  tags?: string[];
  custom_fields?: string;
  source?: string;
}

export interface CsvContactRow {
  first_name: string;
  last_name: string;
  email: string;
  prefix?: string;
  phone?: string;
  title?: string;
  company?: string;
  industry?: string;
  website?: string;
  mailing_address?: string;
  tags?: string;
  [key: string]: string | undefined;
}

export interface CsvImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; email: string; reason: string }>;
}

export interface ContactVariableMap {
  first_name: string;
  last_name: string;
  full_name: string;
  prefix: string;
  email: string;
  phone: string;
  title: string;
  company: string;
  industry: string;
  website: string;
  mailing_address: string;
  year: number;
  app_name: string;
  app_url: string;
  unsubscribe_url: string;
  [key: string]: any;
}
