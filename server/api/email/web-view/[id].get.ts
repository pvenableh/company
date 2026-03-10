/**
 * Public endpoint to view a sent email in the browser.
 * Returns the cached preview_html from the emails collection.
 * No authentication required — this is the "View in browser" link.
 */
import { readItem } from '@directus/sdk';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  if (!id || isNaN(Number(id))) {
    throw createError({ statusCode: 400, message: 'Invalid email ID' });
  }

  const directus = getTypedDirectus();

  try {
    const email = (await directus.request(
      readItem('emails', Number(id), {
        fields: ['id', 'status', 'preview_html', 'name', 'subject'],
      })
    )) as any;

    if (!email) {
      throw createError({ statusCode: 404, message: 'Email not found' });
    }

    if (!email.preview_html) {
      throw createError({ statusCode: 404, message: 'No web version available for this email' });
    }

    // Only allow viewing sent or archived emails
    if (!['sent', 'archived'].includes(email.status)) {
      throw createError({ statusCode: 404, message: 'Email not available for web viewing' });
    }

    // Return raw HTML with proper content type
    setHeader(event, 'Content-Type', 'text/html; charset=utf-8');
    setHeader(event, 'Cache-Control', 'public, max-age=3600');
    return email.preview_html;
  } catch (err: any) {
    if (err.statusCode) throw err;
    throw createError({ statusCode: 500, message: 'Failed to load email' });
  }
});
