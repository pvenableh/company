/**
 * Read-time normalization: accept either the legacy block-entry shape
 * (`{ block_id, heading, content, page_break_after }`) or the new typed
 * shape (`{ id, type, payload, library_ref, page_break_after }`) and
 * always return the typed shape.
 *
 * Used by the composer + renderer so behavior is invariant whether a
 * given row has been backfilled yet. After the migration script runs,
 * normalize() is a near-no-op (just defensive defaults).
 */

import type { BlockType } from './registry';
import type { DocumentBlockEntry, RichTextPayload } from './types';

let _idCounter = 0;
function entryId(): string {
	// crypto.randomUUID is unavailable in some legacy runtimes (Node 18-).
	if (typeof globalThis.crypto?.randomUUID === 'function') {
		return globalThis.crypto.randomUUID();
	}
	_idCounter += 1;
	return `entry_${Date.now()}_${_idCounter}`;
}

export function isTypedEntry(raw: any): boolean {
	return !!raw && typeof raw === 'object' && typeof raw.type === 'string' && 'payload' in raw;
}

export function normalizeEntry(raw: any): DocumentBlockEntry {
	if (isTypedEntry(raw)) {
		return {
			id: typeof raw.id === 'string' && raw.id ? raw.id : entryId(),
			type: raw.type as BlockType,
			payload: raw.payload || {},
			library_ref: raw.library_ref ?? null,
			page_break_after: !!raw.page_break_after,
		};
	}
	// Legacy shape → rich_text
	const payload: RichTextPayload = {
		heading: raw?.heading ?? null,
		body_markdown: typeof raw?.content === 'string' ? raw.content : '',
	};
	return {
		id: entryId(),
		type: 'rich_text',
		payload,
		library_ref: raw?.block_id ?? null,
		page_break_after: !!raw?.page_break_after,
	};
}

export function normalizeEntries(raw: any): DocumentBlockEntry[] {
	if (!Array.isArray(raw)) return [];
	return raw.map(normalizeEntry);
}

export function newEntryId(): string {
	return entryId();
}
