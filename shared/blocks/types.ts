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

/** Catch-all for not-yet-implemented payloads. */
export type BlockPayload = RichTextPayload | ScopeTreePayload | Record<string, any>;

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
