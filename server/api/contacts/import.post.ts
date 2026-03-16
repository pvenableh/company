/**
 * CSV import for contacts.
 * Parses CSV, upserts contacts (match on email), optionally adds to a list.
 */
import { parse } from 'csv-parse/sync';
import { readItems, createItem, updateItem } from '@directus/sdk';
import { generateUnsubscribeToken } from '~/server/utils/unsubscribe';

// Standard column name mappings (handles common variations)
const COLUMN_MAP: Record<string, string> = {
  'first name': 'first_name',
  'firstname': 'first_name',
  'given name': 'first_name',
  'last name': 'last_name',
  'lastname': 'last_name',
  'surname': 'last_name',
  'family name': 'last_name',
  'email address': 'email',
  'email_address': 'email',
  'e-mail': 'email',
  'phone number': 'phone',
  'mobile': 'phone',
  'telephone': 'phone',
  'job title': 'title',
  'title': 'title',
  'position': 'title',
  'role': 'title',
  'organization': 'company',
  'organisation': 'company',
  'company name': 'company',
};

const KNOWN_FIELDS = new Set([
  'first_name', 'last_name', 'email', 'prefix', 'phone',
  'title', 'company', 'industry', 'website',
  'mailing_address', 'timezone', 'tags', 'notes',
  'linkedin_url', 'instagram_handle', 'category',
]);

export default defineEventHandler(async (event) => {
  const formData = await readMultipartFormData(event);
  const csvFile = formData?.find((f) => f.name === 'file');
  const listIdStr = formData?.find((f) => f.name === 'list_id')?.data?.toString();
  const updateExisting =
    formData?.find((f) => f.name === 'update_existing')?.data?.toString() === 'true';

  if (!csvFile?.data) {
    return { success: false, error: 'No CSV file provided' };
  }

  const listId = listIdStr ? parseInt(listIdStr) : null;
  const directus = getServerDirectus();

  let rows: Record<string, string>[];

  try {
    rows = parse(csvFile.data.toString('utf8'), {
      columns: (header: string[]) =>
        header.map((h) => COLUMN_MAP[h.toLowerCase().trim()] || h.toLowerCase().trim()),
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err: any) {
    return { success: false, error: `CSV parse error: ${err.message}` };
  }

  const result = {
    total: rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [] as Array<{ row: number; email: string; reason: string }>,
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (!row.email) {
      result.errors.push({ row: i + 2, email: '', reason: 'Missing email' });
      result.skipped++;
      continue;
    }

    const email = row.email.toLowerCase().trim();
    if (!email.includes('@')) {
      result.errors.push({ row: i + 2, email, reason: 'Invalid email format' });
      result.skipped++;
      continue;
    }

    // Separate known fields from custom_fields
    const contactData: Record<string, any> = {
      email,
      source: 'csv_import',
    };
    const customFields: Record<string, any> = {};

    for (const [key, value] of Object.entries(row)) {
      if (key === 'email' || !value) continue;

      if (KNOWN_FIELDS.has(key)) {
        if (key === 'tags') {
          contactData.tags = value
            .split(',')
            .map((t: string) => t.trim().toLowerCase())
            .filter(Boolean);
        } else {
          contactData[key] = value;
        }
      } else {
        customFields[key] = value;
      }
    }

    if (Object.keys(customFields).length > 0) {
      contactData.custom_fields = JSON.stringify(customFields);
    }

    try {
      // Check if contact exists
      const existing = (await directus.request(
        readItems('contacts', {
          filter: { email: { _eq: email } },
          fields: ['id'],
          limit: 1,
        })
      )) as any[];

      let contactId: string;

      if (existing?.length > 0) {
        contactId = existing[0].id;
        if (updateExisting) {
          await directus.request(updateItem('contacts', contactId, contactData));
          result.updated++;
        } else {
          result.skipped++;
        }
      } else {
        const created = (await directus.request(
          createItem('contacts', {
            ...contactData,
            status: 'published',
            email_subscribed: true,
            unsubscribe_token: generateUnsubscribeToken(),
          })
        )) as any;
        contactId = created.id;
        result.created++;
      }

      // Add to mailing list if specified
      if (listId && contactId) {
        const existingMembership = (await directus.request(
          readItems('mailing_list_contacts', {
            filter: {
              _and: [
                { contact_id: { _eq: contactId } },
                { list_id: { _eq: listId } },
              ],
            },
            fields: ['id'],
            limit: 1,
          })
        )) as any[];

        if (!existingMembership?.length) {
          await directus.request(
            createItem('mailing_list_contacts', {
              contact_id: contactId,
              list_id: listId,
              subscribed: true,
              date_subscribed: new Date().toISOString(),
              source: 'csv_import',
            })
          );
        }
      }
    } catch (err: any) {
      result.errors.push({ row: i + 2, email, reason: err.message });
    }
  }

  return { success: true, ...result };
});
