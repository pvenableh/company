export type ContactStatus = 'active' | 'unsubscribed' | 'bounced' | 'spam' | 'archived';

export type IndustryType =
  | 'Technology'
  | 'Healthcare'
  | 'Finance'
  | 'Education'
  | 'Real Estate'
  | 'Retail'
  | 'Hospitality'
  | 'Legal'
  | 'Non-Profit'
  | 'Government'
  | 'Other'
  | string;

export interface Contact {
  id: number;
  status: ContactStatus;
  sort: number | null;
  user_created: string | null;
  date_created: string | null;
  date_updated: string | null;

  // Identity
  prefix: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;

  // Professional
  job_title: string | null;
  company: string | null;
  industry: IndustryType | null;
  website: string | null;

  // Location
  city: string | null;
  state: string | null;
  country: string | null;
  timezone: string | null;

  // Email preferences
  email_subscribed: boolean;
  email_unsubscribed_at: string | null;
  unsubscribe_token: string | null;
  email_bounced: boolean;
  email_bounced_at: string | null;
  email_bounce_type: 'hard' | 'soft' | null;

  // Engagement
  last_opened_at: string | null;
  last_clicked_at: string | null;
  total_emails_sent: number;
  total_opens: number;
  total_clicks: number;

  // Flexible
  tags: string[] | null;
  custom_fields: Record<string, any> | null;
  source: string | null;
  notes: string | null;

  // Relations
  lists?: MailingListContact[];
}

export interface MailingList {
  id: number;
  status: 'active' | 'archived';
  name: string;
  slug: string;
  description: string | null;
  is_default: boolean;
  double_opt_in: boolean;
  subscriber_count: number | null;
  contacts?: MailingListContact[];
}

export interface MailingListContact {
  id: number;
  list_id: number | MailingList;
  contact_id: number | Contact;
  subscribed: boolean;
  date_subscribed: string;
  date_unsubscribed: string | null;
  source: string | null;
  custom_fields: Record<string, any> | null;
}

export interface CreateContactPayload {
  first_name: string;
  last_name: string;
  email: string;
  prefix?: string;
  phone?: string;
  job_title?: string;
  company?: string;
  industry?: string;
  website?: string;
  city?: string;
  state?: string;
  country?: string;
  tags?: string[];
  custom_fields?: Record<string, any>;
  source?: string;
}

export interface CsvContactRow {
  first_name: string;
  last_name: string;
  email: string;
  prefix?: string;
  phone?: string;
  job_title?: string;
  company?: string;
  industry?: string;
  website?: string;
  city?: string;
  state?: string;
  country?: string;
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
  job_title: string;
  company: string;
  industry: string;
  website: string;
  city: string;
  state: string;
  country: string;
  year: number;
  app_name: string;
  app_url: string;
  unsubscribe_url: string;
  [key: string]: any;
}
