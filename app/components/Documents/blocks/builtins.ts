/**
 * Register the built-in document block types with the shared registry.
 *
 * Imported once (side-effect) from BlockComposer + BlockRenderer so any
 * client surface that mounts either component has the registry ready.
 *
 * As more primitives ship, add a registerBlockType call here.
 */
import { registerBlockType } from '~~/shared/blocks/registry';
import type {
	RichTextPayload,
	ScopeTreePayload,
	CoverPayload,
	SignedLetterPayload,
	FigurePayload,
	RepeaterPayload,
	GroupedListPayload,
	PullQuotePayload,
	PricingTiersPayload,
	LineItemsPayload,
	FootnotesPayload,
	NumberedClausesPayload,
	DefinitionsPayload,
	SignatureBlockPayload,
} from '~~/shared/blocks/types';

let registered = false;

export function ensureBuiltinsRegistered() {
	if (registered) return;
	registered = true;

	registerBlockType<RichTextPayload>({
		type: 'rich_text',
		name: 'Rich text',
		icon: 'lucide:text',
		appliesTo: ['proposals', 'contracts'],
		description: 'Heading + markdown body. The default block.',
		defaultPayload: () => ({ heading: '', body_markdown: '' }),
		Editor: () => import('./RichTextEditor.vue').then((m) => m.default),
		Renderer: () => import('./RichTextRenderer.vue').then((m) => m.default),
	});

	registerBlockType<ScopeTreePayload>({
		type: 'scope_tree',
		name: 'Scope tree',
		icon: 'lucide:list-tree',
		appliesTo: ['proposals', 'contracts'],
		description: 'Phased deliverables — intro, items, optional sub-phases (2 levels max).',
		defaultPayload: () => ({ numbering_style: 'phase_word', phases: [] }),
		Editor: () => import('./ScopeTreeEditor.vue').then((m) => m.default),
		Renderer: () => import('./ScopeTreeRenderer.vue').then((m) => m.default),
	});

	registerBlockType<CoverPayload>({
		type: 'cover',
		name: 'Cover',
		icon: 'lucide:book-open',
		appliesTo: ['proposals', 'contracts'],
		description: 'Full-bleed accent title page — logo, title, recipient, date.',
		defaultPayload: () => ({ eyebrow: '', title: '', subtitle: '', prepared_for: '', date: '', tagline_markdown: '', show_logo: true }),
		Editor: () => import('./CoverEditor.vue').then((m) => m.default),
		Renderer: () => import('./CoverRenderer.vue').then((m) => m.default),
	});

	registerBlockType<SignedLetterPayload>({
		type: 'signed_letter',
		name: 'Signed letter',
		icon: 'lucide:pen-line',
		appliesTo: ['proposals', 'contracts'],
		description: 'Cover-letter body with a sign-off, name + signature.',
		defaultPayload: () => ({ greeting: '', body_markdown: '', signoff: 'Sincerely,', signer_name: '', signer_title: '', signature_image_url: '' }),
		Editor: () => import('./SignedLetterEditor.vue').then((m) => m.default),
		Renderer: () => import('./SignedLetterRenderer.vue').then((m) => m.default),
	});

	registerBlockType<PricingTiersPayload>({
		type: 'pricing_tiers',
		name: 'Pricing tiers',
		icon: 'lucide:columns-3',
		appliesTo: ['proposals'],
		description: 'Side-by-side option cards (packages / Good-Better-Best).',
		defaultPayload: () => ({ heading: '', tiers: [] }),
		Editor: () => import('./PricingTiersEditor.vue').then((m) => m.default),
		Renderer: () => import('./PricingTiersRenderer.vue').then((m) => m.default),
	});

	registerBlockType<LineItemsPayload>({
		type: 'line_items',
		name: 'Line items',
		icon: 'lucide:table',
		appliesTo: ['proposals', 'contracts'],
		description: 'Itemized table — qty × rate = amount, with totals.',
		defaultPayload: () => ({ heading: '', currency: 'USD', items: [], show_totals: true, tax_rate: null, discount: null, note: '' }),
		Editor: () => import('./LineItemsEditor.vue').then((m) => m.default),
		Renderer: () => import('./LineItemsRenderer.vue').then((m) => m.default),
	});

	registerBlockType<NumberedClausesPayload>({
		type: 'numbered_clauses',
		name: 'Numbered clauses',
		icon: 'lucide:list-ordered',
		appliesTo: ['contracts'],
		description: 'Auto-numbered legal clauses with 1-level nesting.',
		defaultPayload: () => ({ heading: '', numbering_style: 'decimal', clauses: [] }),
		Editor: () => import('./NumberedClausesEditor.vue').then((m) => m.default),
		Renderer: () => import('./NumberedClausesRenderer.vue').then((m) => m.default),
	});

	registerBlockType<SignatureBlockPayload>({
		type: 'signature_block',
		name: 'Signature block',
		icon: 'lucide:signature',
		appliesTo: ['proposals', 'contracts'],
		description: 'Sign-off lines — name, title, company, date.',
		defaultPayload: () => ({ intro: '', columns: 2, signatories: [] }),
		Editor: () => import('./SignatureBlockEditor.vue').then((m) => m.default),
		Renderer: () => import('./SignatureBlockRenderer.vue').then((m) => m.default),
	});

	registerBlockType<GroupedListPayload>({
		type: 'grouped_list',
		name: 'Grouped list',
		icon: 'lucide:list-tree',
		appliesTo: ['proposals', 'contracts'],
		description: 'Labelled groups of bullet items (e.g. client experience).',
		defaultPayload: () => ({ heading: '', columns: 1, groups: [] }),
		Editor: () => import('./GroupedListEditor.vue').then((m) => m.default),
		Renderer: () => import('./GroupedListRenderer.vue').then((m) => m.default),
	});

	registerBlockType<RepeaterPayload>({
		type: 'repeater',
		name: 'Repeater',
		icon: 'lucide:rows-3',
		appliesTo: ['proposals', 'contracts'],
		description: 'Repeating items — title, subtitle, body (team, references).',
		defaultPayload: () => ({ heading: '', layout: 'row', items: [] }),
		Editor: () => import('./RepeaterEditor.vue').then((m) => m.default),
		Renderer: () => import('./RepeaterRenderer.vue').then((m) => m.default),
	});

	registerBlockType<PullQuotePayload>({
		type: 'pull_quote',
		name: 'Pull quote',
		icon: 'lucide:quote',
		appliesTo: ['proposals', 'contracts'],
		description: 'An oversized accent quotation callout.',
		defaultPayload: () => ({ quote_markdown: '', attribution: '', align: 'left' }),
		Editor: () => import('./PullQuoteEditor.vue').then((m) => m.default),
		Renderer: () => import('./PullQuoteRenderer.vue').then((m) => m.default),
	});

	registerBlockType<FigurePayload>({
		type: 'figure',
		name: 'Figure',
		icon: 'lucide:image',
		appliesTo: ['proposals', 'contracts'],
		description: 'An image with an optional caption.',
		defaultPayload: () => ({ image_url: '', alt: '', caption: '', width: 'full', align: 'center' }),
		Editor: () => import('./FigureEditor.vue').then((m) => m.default),
		Renderer: () => import('./FigureRenderer.vue').then((m) => m.default),
	});

	registerBlockType<FootnotesPayload>({
		type: 'footnotes',
		name: 'Footnotes',
		icon: 'lucide:asterisk',
		appliesTo: ['proposals', 'contracts'],
		description: 'A small numbered/labelled list of notes.',
		defaultPayload: () => ({ heading: '', notes: [] }),
		Editor: () => import('./FootnotesEditor.vue').then((m) => m.default),
		Renderer: () => import('./FootnotesRenderer.vue').then((m) => m.default),
	});

	registerBlockType<DefinitionsPayload>({
		type: 'definitions',
		name: 'Definitions',
		icon: 'lucide:book-a',
		appliesTo: ['proposals', 'contracts'],
		description: 'A term / definition list.',
		defaultPayload: () => ({ heading: '', terms: [] }),
		Editor: () => import('./DefinitionsEditor.vue').then((m) => m.default),
		Renderer: () => import('./DefinitionsRenderer.vue').then((m) => m.default),
	});
}

// Auto-register on module import — the consumer just needs to import this file.
ensureBuiltinsRegistered();
