import mjml2html from 'mjml';
import Handlebars from 'handlebars';

// Register comparison and logic helpers for conditional content in templates
Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('ne', (a, b) => a !== b);
Handlebars.registerHelper('gt', (a, b) => a > b);
Handlebars.registerHelper('lt', (a, b) => a < b);
Handlebars.registerHelper('and', (a, b) => a && b);
Handlebars.registerHelper('or', (a, b) => a || b);
Handlebars.registerHelper('not', (a) => !a);
Handlebars.registerHelper('default', (val, fallback) => val || fallback);

export interface CompileResult {
  html: string;
  errors: string[];
}

/**
 * Strip MJML attributes that have empty, whitespace-only, or unreplaced
 * template variable values. These produce MJML validation errors
 * (invalid Color, Unit, or Enum values).
 */
export function stripEmptyMjmlAttributes(mjml: string): string {
  let result = mjml;
  // Strip attributes with empty values: attr=""
  result = result.replace(/\s+[\w-]+=""/g, '');
  // Strip attributes with whitespace-only values: attr="   "
  result = result.replace(/\s+[\w-]+="\s+"/g, '');
  // Strip attributes with unreplaced design-time variables: attr="{{{...}}}"
  result = result.replace(/\s+[\w-]+="\{\{\{[^}]*\}\}\}"/g, '');
  return result;
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

    // Strip any remaining empty/invalid MJML attributes as a safety net
    const cleanedMjml = stripEmptyMjmlAttributes(renderedMjml);

    // Then compile MJML to HTML
    const result = mjml2html(cleanedMjml, {
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
