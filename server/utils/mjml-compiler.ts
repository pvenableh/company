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
 *
 * `href` and `src` are special-cased: emptying them silently breaks
 * buttons + images for recipients, so they fall back to a safe '#'
 * sentinel instead of being stripped. The recipient sees a benign
 * non-functional button rather than untargeted plain text wrapped in
 * an <a> tag with no anchor (which most clients render as bare text).
 */
export function stripEmptyMjmlAttributes(mjml: string): string {
  let result = mjml;
  // Replace empty / whitespace / unreplaced href and src with '#' so the
  // anchor or image still has a valid attribute and renders predictably.
  result = result.replace(/(\s+)(href|src)=""/g, '$1$2="#"');
  result = result.replace(/(\s+)(href|src)="\s+"/g, '$1$2="#"');
  result = result.replace(/(\s+)(href|src)="\{\{\{[^}]*\}\}\}"/g, '$1$2="#"');
  // Strip remaining attributes with empty values: attr=""
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
    // Strip any remaining design-time triple-brace variables {{{...}}} that weren't
    // resolved by the template builder. These would otherwise be treated as unescaped
    // Handlebars expressions and resolve to empty strings, causing blank content.
    // *_url and *_href tokens get a '#' fallback so anchor href attributes
    // remain valid (the stripEmptyMjmlAttributes safety net also catches this,
    // but pre-replacing keeps the assembled MJML inspectable in the builder).
    const source = mjmlSource.replace(/\{\{\{(?!#|\/|>)([^}]+)\}\}\}/g, (_match, key) => {
      const trimmedKey = key.trim();
      // If this variable exists in the provided context, convert to double-brace
      if (trimmedKey in variables) return `{{${trimmedKey}}}`;
      // Hrefs and srcs need a non-empty value to render the wrapping element
      if (/_url$|_href$|^url$|^href$|_src$|^src$/i.test(trimmedKey)) return '#';
      // Otherwise remove it entirely (it's a leftover design-time variable)
      return '';
    });

    // Compile Handlebars runtime variables
    const template = Handlebars.compile(source, { noEscape: true });
    const renderedMjml = template(variables);

    // Strip any remaining empty/invalid MJML attributes as a safety net
    const cleanedMjml = stripEmptyMjmlAttributes(renderedMjml);

    // Then compile MJML to HTML
    const result = mjml2html(cleanedMjml, {
      validationLevel: 'soft',
      minify: false,
      // Strip authored HTML comments from the output so dev/doc comments in
      // template source (e.g. server/emails/_*.mjml) never ship in the email.
      // MJML's own Outlook (MSO) conditional comments are still emitted.
      keepComments: false,
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
