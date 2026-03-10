import { buildUnsubscribeUrl } from './unsubscribe';

/**
 * Build the full Handlebars variable map for a single contact.
 * All contact fields + flattened custom_fields + system globals.
 */
export function buildContactVariableMap(
  contact: any,
  globals: {
    appName: string;
    appUrl: string;
    year: number;
    announcementCustomVars?: Record<string, any>;
  }
): Record<string, any> {
  const unsubscribeUrl = contact.unsubscribe_token
    ? buildUnsubscribeUrl(contact.unsubscribe_token, globals.appUrl)
    : `${globals.appUrl}/unsubscribe`;

  return {
    // Announcement-level custom variables (lowest priority)
    ...(globals.announcementCustomVars || {}),

    // All contact fields (spread directly as merge tags)
    ...contact,

    // Computed / convenience fields
    full_name: [contact.prefix, contact.first_name, contact.last_name]
      .filter(Boolean)
      .join(' '),
    formal_name: contact.prefix
      ? `${contact.prefix} ${contact.last_name}`
      : contact.first_name,

    // Flatten custom_fields so {{ account_tier }} works directly
    ...(contact.custom_fields || {}),

    // Ensure null fields become empty strings
    phone: contact.phone || '',
    job_title: contact.job_title || '',
    company: contact.company || '',
    industry: contact.industry || '',
    website: contact.website || '',
    city: contact.city || '',
    state: contact.state || '',
    country: contact.country || '',
    prefix: contact.prefix || '',

    // System globals (highest priority — cannot be overridden by contact data)
    year: globals.year,
    app_name: globals.appName,
    app_url: globals.appUrl,
    unsubscribe_url: unsubscribeUrl,
  };
}
