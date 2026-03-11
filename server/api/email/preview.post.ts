/**
 * Preview an MJML template with sample variables.
 * Used by the block builder for live preview.
 */
import { compileMjml } from '~/server/utils/mjml-compiler';

export default defineEventHandler(async (event) => {
  const { mjml_source, variables = {} } = await readBody(event);

  if (!mjml_source) {
    throw createError({ statusCode: 400, message: 'mjml_source is required' });
  }

  const defaultVars = {
    first_name: 'Jane',
    last_name: 'Smith',
    email: 'jane@example.com',
    year: new Date().getFullYear(),
    app_name: 'Your Organization',
    unsubscribe_url: '#unsubscribe',
    ...variables,
  };

  const result = compileMjml(mjml_source, defaultVars);

  return {
    html: result.html,
    errors: result.errors,
  };
});
