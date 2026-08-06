/**
 * Typed payloads for each document block type.
 *
 * The full discriminated union is intentionally `Record<string, any>` at
 * the entry level — payload shape is enforced by each block's Editor +
 * Renderer, not at the JSON-storage layer. This lets us add new types
 * without breaking older clients that read the same `blocks` JSON.
 */

import type { BlockType } from './registry';

/** Block 3: rich_text (current behavior — heading + markdown body). */
export interface RichTextPayload {
	heading?: string | null;
	body_markdown: string;
}

/** Block 8: scope_tree — phased deliverables with optional 1-level nesting. */
export interface ScopeTreeNode {
	id: string;
	heading: string;
	summary?: string | null;
	bullets?: string[];
	note?: string | null;
	hours?: number | null;
	fee?: number | null;
	deliverables?: string[];
	show_hours?: boolean;
	show_fee?: boolean;
	show_deliverables?: boolean;
	children?: ScopeTreeNode[];
}

export interface ScopeTreePayload {
	numbering_style?: 'phase_word' | 'phase_number' | 'decimal' | 'none';
	phases: ScopeTreeNode[];
}

/** cover — full-page title page (logo, title, recipient, dates, tagline). */
export interface CoverPayload {
	eyebrow?: string | null;
	title?: string | null;
	subtitle?: string | null;
	/** "Prepared for" line. Falls back to the document's recipient context. */
	prepared_for?: string | null;
	/** "Prepared by" line. Falls back to the seller/org name. */
	prepared_by?: string | null;
	date?: string | null;
	/** Optional intro/tagline under the title. */
	tagline_markdown?: string | null;
	/** Show the org logo (pulled from cover context) at the top. */
	show_logo?: boolean;
}

/** signed_letter — cover-letter body with a sign-off + signature line. */
export interface SignedLetterPayload {
	greeting?: string | null;
	body_markdown: string;
	/** e.g. "Sincerely," / "Warm regards,". */
	signoff?: string | null;
	signer_name?: string | null;
	signer_title?: string | null;
	/** Optional inline signature image (data/URL). */
	signature_image_url?: string | null;
	date?: string | null;
}

/** figure — a single image with an optional caption. */
export interface FigurePayload {
	image_url: string;
	alt?: string | null;
	caption?: string | null;
	/** Render width relative to the content column. */
	width?: 'full' | 'wide' | 'inline';
	align?: 'left' | 'center' | 'right';
}

/** repeater — a heading + a repeating list of simple item cards/rows. */
export interface RepeaterItem {
	id: string;
	title?: string | null;
	subtitle?: string | null;
	body_markdown?: string | null;
	image_url?: string | null;
}
export interface RepeaterPayload {
	heading?: string | null;
	layout?: 'card' | 'row';
	items: RepeaterItem[];
}

/** grouped_list — labelled groups of bullet items. */
export interface GroupedListGroup {
	id: string;
	label?: string | null;
	items: string[];
}
export interface GroupedListPayload {
	heading?: string | null;
	/** Number of columns to flow the groups into on wide layouts. */
	columns?: 1 | 2 | 3;
	groups: GroupedListGroup[];
}

/** pull_quote — an oversized quotation callout. */
export interface PullQuotePayload {
	quote_markdown: string;
	attribution?: string | null;
	align?: 'left' | 'center';
}

/** pricing_tiers — side-by-side option cards (Good / Better / Best). */
export interface PricingTier {
	id: string;
	name: string;
	price?: string | null;
	/** e.g. "/month", "one-time". */
	price_note?: string | null;
	description?: string | null;
	features: string[];
	/** Highlight this tier as the recommended one. */
	featured?: boolean;
	cta?: string | null;
}
export interface PricingTiersPayload {
	heading?: string | null;
	tiers: PricingTier[];
}

/** line_items — an itemized table (qty × rate = amount) with totals. */
export interface LineItem {
	id: string;
	description: string;
	quantity?: number | null;
	unit?: string | null;
	rate?: number | null;
	/** Manual override; when null the renderer computes quantity × rate. */
	amount?: number | null;
}
export interface LineItemsPayload {
	heading?: string | null;
	/** ISO currency code for formatting (e.g. "USD"). */
	currency?: string | null;
	items: LineItem[];
	show_totals?: boolean;
	/** Percent (e.g. 8.5 for 8.5%). */
	tax_rate?: number | null;
	/** Flat discount subtracted from subtotal. */
	discount?: number | null;
	note?: string | null;
}

/** footnotes — a numbered/labelled list of small notes. */
export interface FootnoteItem {
	id: string;
	/** Optional custom marker; defaults to the 1-based index. */
	label?: string | null;
	text_markdown: string;
}
export interface FootnotesPayload {
	heading?: string | null;
	notes: FootnoteItem[];
}

/** numbered_clauses — auto-numbered legal clauses with 1-level nesting. */
export interface ClauseNode {
	id: string;
	title?: string | null;
	body_markdown?: string | null;
	children?: ClauseNode[];
}
export interface NumberedClausesPayload {
	heading?: string | null;
	numbering_style?: 'decimal' | 'legal' | 'article';
	clauses: ClauseNode[];
}

/** definitions — a term / definition list. */
export interface DefinitionItem {
	id: string;
	term: string;
	definition_markdown: string;
}
export interface DefinitionsPayload {
	heading?: string | null;
	terms: DefinitionItem[];
}

/** signature_block — sign-off lines with name / title / date. */
export interface Signatory {
	id: string;
	/** e.g. "Client", "Provider". */
	role_label?: string | null;
	name?: string | null;
	title?: string | null;
	company?: string | null;
	show_date?: boolean;
	date_label?: string | null;
}
export interface SignatureBlockPayload {
	intro?: string | null;
	columns?: 1 | 2;
	signatories: Signatory[];
}

/** Catch-all for not-yet-implemented payloads. */
export type BlockPayload =
	| RichTextPayload
	| ScopeTreePayload
	| CoverPayload
	| SignedLetterPayload
	| FigurePayload
	| RepeaterPayload
	| GroupedListPayload
	| PullQuotePayload
	| PricingTiersPayload
	| LineItemsPayload
	| FootnotesPayload
	| NumberedClausesPayload
	| DefinitionsPayload
	| SignatureBlockPayload
	| Record<string, any>;

/**
 * Per-document block entry stored on a proposal/contract `blocks: jsonb[]`.
 *
 * `type` dispatches per-primitive editor + renderer via the registry.
 * `payload` is the type's shape.
 * `library_ref` (when set) → FK into `document_blocks`; null = inline.
 * `page_break_after` triggers `page-break-after: always` in PDF/print.
 */
export interface DocumentBlockEntry {
	id: string;
	type: BlockType;
	payload: BlockPayload;
	library_ref?: string | null;
	page_break_after?: boolean;
}

/**
 * Legacy block-entry shape predating the typed-block refactor. Kept here
 * so the normalize helper can identify and migrate old rows on read. Do
 * NOT write this shape from new code.
 */
export interface LegacyDocumentBlockEntry {
	block_id: string | null;
	heading: string | null;
	content: string;
	page_break_after?: boolean;
}
