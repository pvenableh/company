import mjml2html from 'mjml';
import Handlebars from 'handlebars';

export interface CompileResult {
  html: string;
  errors: string[];
}

/**
 * Compile an MJML template string with Handlebars variables into HTML.
 * Runtime variables ({{double braces}}) are injected per-recipient.
 */
export function compileMjml(
  mjmlSource: string,
  variables: Record<string, any> = {}
): CompileResult {
  try {
    // First, compile Handlebars runtime variables
    const template = Handlebars.compile(mjmlSource, { noEscape: true });
    const renderedMjml = template(variables);

    // Then compile MJML to HTML
    const result = mjml2html(renderedMjml, {
      validationLevel: 'soft',
      minify: false,
    });

    return {
      html: result.html || '',
      errors: (result.errors || []).map(
        (e: any) => e.formattedMessage || e.message || String(e)
      ),
    };
  } catch (err: any) {
    return {
      html: '',
      errors: [err.message || 'MJML compilation failed'],
    };
  }
}

/**
 * Compile a subject line template with Handlebars variables.
 */
export function compileSubject(
  subjectTemplate: string,
  variables: Record<string, any> = {}
): string {
  try {
    const template = Handlebars.compile(subjectTemplate);
    return template(variables);
  } catch {
    return subjectTemplate;
  }
}
