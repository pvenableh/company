/**
 * useDocumentTheme — resolves the theme classes + accent CSS var for an
 * organization. Used by DocumentShell to wrap invoice/proposal/contract
 * renderings so they all pick up the org's chosen theme.
 *
 * A base theme (classic/editorial/mono) provides the foundation; an optional
 * `document_theme_config` object layers arbitrary `--doc-*` overrides on top,
 * which powers the visual Document Theme Studio (live-preview customization).
 */

export type DocumentTheme = 'classic' | 'editorial' | 'mono';

/**
 * Curated set of fonts the theme studio offers. Keys are stable ids stored in
 * the config; values are the actual CSS font-family stacks.
 */
export const DOC_FONT_STACKS: Record<string, { label: string; stack: string }> = {
	proxima: {
		label: 'Proxima Nova (Sans)',
		stack: `'Proxima Nova W01 Regular', 'Avenir Next', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`,
	},
	inter: {
		label: 'Inter (Sans)',
		stack: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`,
	},
	sourceSerif: {
		label: 'Source Serif (Serif)',
		stack: `'Source Serif 4', 'Source Serif Pro', Georgia, 'Times New Roman', serif`,
	},
	georgia: {
		label: 'Georgia (Serif)',
		stack: `Georgia, 'Times New Roman', serif`,
	},
	mono: {
		label: 'Monospace',
		stack: `'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace`,
	},
};

/**
 * Shape of the optional per-org customization layer. All fields optional; only
 * the ones set produce a CSS-var override.
 */
export interface DocumentThemeConfig {
	/** Background of the document surface (--doc-bg). */
	bg?: string;
	/** Primary text color (--doc-fg). */
	fg?: string;
	/** Hairline / rule color (--doc-rule). */
	rule?: string;
	/** Heading font — a key of DOC_FONT_STACKS. */
	headingFont?: string;
	/** Body font — a key of DOC_FONT_STACKS. */
	bodyFont?: string;
	/** Meta/eyebrow casing. */
	metaTransform?: 'uppercase' | 'none';
	/** Meta letter-spacing in em, e.g. 0.08. */
	metaTracking?: number;
	/** Card corner radius in px. */
	cardRadius?: number;
}

export interface DocumentThemeSource {
	document_theme?: string | null;
	document_accent?: string | null;
	document_theme_config?: DocumentThemeConfig | Record<string, any> | null;
}

const VALID_THEMES: DocumentTheme[] = ['classic', 'editorial', 'mono'];

export function resolveDocumentTheme(source: DocumentThemeSource | null | undefined): DocumentTheme {
	const t = source?.document_theme;
	if (t && (VALID_THEMES as string[]).includes(t)) return t as DocumentTheme;
	return 'classic';
}

/**
 * Turn a config object into a map of CSS custom properties. Safe with a
 * partial / null config — returns an empty object when nothing is set.
 */
export function resolveThemeConfigVars(
	config: DocumentThemeConfig | Record<string, any> | null | undefined,
): Record<string, string> {
	const out: Record<string, string> = {};
	if (!config || typeof config !== 'object') return out;
	const c = config as DocumentThemeConfig;
	if (c.bg) out['--doc-bg'] = String(c.bg);
	if (c.fg) out['--doc-fg'] = String(c.fg);
	if (c.rule) out['--doc-rule'] = String(c.rule);
	const hf = c.headingFont ? DOC_FONT_STACKS[c.headingFont] : undefined;
	if (hf) out['--doc-heading-font'] = hf.stack;
	const bf = c.bodyFont ? DOC_FONT_STACKS[c.bodyFont] : undefined;
	if (bf) out['--doc-body-font'] = bf.stack;
	if (c.metaTransform) out['--doc-meta-transform'] = c.metaTransform;
	if (typeof c.metaTracking === 'number') out['--doc-meta-tracking'] = `${c.metaTracking}em`;
	if (typeof c.cardRadius === 'number') out['--doc-card-radius'] = `${c.cardRadius}px`;
	return out;
}

export function useDocumentTheme(source: MaybeRefOrGetter<DocumentThemeSource | null | undefined>) {
	const theme = computed<DocumentTheme>(() => resolveDocumentTheme(toValue(source)));
	const accent = computed<string | null>(() => toValue(source)?.document_accent || null);

	const shellClass = computed(() => ['doc-shell', `doc-theme--${theme.value}`]);

	const shellStyle = computed<Record<string, string>>(() => {
		const out: Record<string, string> = { ...resolveThemeConfigVars(toValue(source)?.document_theme_config) };
		if (accent.value) out['--doc-accent-color'] = accent.value;
		return out;
	});

	return { theme, accent, shellClass, shellStyle };
}
