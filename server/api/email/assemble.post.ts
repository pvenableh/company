/**
 * Assembles template blocks into compiled MJML and validates.
 * Called by the builder UI on save for server-side validation.
 */
import { compileMjml } from '~/server/utils/mjml-compiler';

export default defineEventHandler(async (event) => {
  const { canvas_blocks } = await readBody(event);

  if (!canvas_blocks || !Array.isArray(canvas_blocks)) {
    throw createError({ statusCode: 400, message: 'canvas_blocks array is required' });
  }

  const blockSources = canvas_blocks.map(
    ({ block_mjml, instance_variables = {} }: { block_mjml: string; instance_variables?: Record<string, any> }) => {
      let source = block_mjml;
      for (const [key, value] of Object.entries(instance_variables)) {
        source = source.replaceAll(`{{{${key}}}}`, String(value ?? ''));
      }
      return source;
    }
  );

  const assembled = `<mjml>
  <mj-head>
    <mj-attributes>
      <mj-all font-family="Arial, Helvetica, sans-serif" />
      <mj-text font-size="15px" color="#333333" line-height="1.7" />
      <mj-section padding="0" />
    </mj-attributes>
    <mj-style>
      .link-nostyle { color: inherit; text-decoration: none; }
      a { color: #000000; }
    </mj-style>
  </mj-head>
  <mj-body background-color="#f4f4f4">
${blockSources.join('\n')}
  </mj-body>
</mjml>`;

  const { html, errors } = compileMjml(assembled, { first_name: 'Test' });

  return {
    mjml_source: assembled,
    is_valid: !!html,
    errors,
  };
});
