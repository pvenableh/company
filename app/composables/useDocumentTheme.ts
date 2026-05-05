/**
 * useDocumentTheme — resolves the theme classes + accent CSS var for an
 * organization. Used by DocumentShell to wrap invoice/proposal/contract
 * renderings so they all pick up the org's chosen theme.
 */

export type DocumentTheme = 'classic' | 'editorial' | 'mono';

export interface DocumentThemeSource {
	document_theme?: string | null;
	document_accent?: string | null;
}

const VALID_THEMES: DocumentTheme[] = ['classic', 'editorial', 'mono'];

export function resolveDocumentTheme(source: DocumentThemeSource | null | undefined): DocumentTheme {
	const t = source?.document_theme;
	if (t && (VALID_THEMES as string[]).includes(t)) return t as DocumentTheme;
	return 'classic';
}

export function useDocumentTheme(source: MaybeRefOrGetter<DocumentThemeSource | null | undefined>) {
	const theme = computed<DocumentTheme>(() => resolveDocumentTheme(toValue(source)));
	const accent = computed<string | null>(() => toValue(source)?.document_accent || null);

	const shellClass = computed(() => ['doc-shell', `doc-theme--${theme.value}`]);

	const shellStyle = computed<Record<string, string>>(() => {
		const out: Record<string, string> = {};
		if (accent.value) out['--doc-accent-color'] = accent.value;
		return out;
	});

	return { theme, accent, shellClass, shellStyle };
}
