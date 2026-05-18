/**
 * Document block-type registry.
 *
 * Proposals + contracts (and future document types) are composed from an
 * ordered array of typed blocks. Each block declares a `type` that maps
 * here to its metadata, default payload, and (on the client) its Editor
 * and Renderer Vue components.
 *
 * This module is pure TypeScript — no Vue imports — so it can be loaded
 * from server, scripts, and shared utilities. The actual component refs
 * are registered from `app/components/Documents/blocks/builtins.ts`,
 * which runs once on client-side module load.
 *
 * Adding a new block type:
 *   1. Add its literal to `BlockType` below.
 *   2. Define its payload interface in `./types.ts`.
 *   3. Call `registerBlockType({ ... })` from builtins.ts with Editor +
 *      Renderer component loaders.
 */

export type BlockType =
	| 'rich_text'
	| 'cover'
	| 'signed_letter'
	| 'figure'
	| 'repeater'
	| 'grouped_list'
	| 'pull_quote'
	| 'scope_tree'
	| 'pricing_tiers'
	| 'line_items'
	| 'footnotes'
	| 'numbered_clauses'
	| 'definitions'
	| 'signature_block';

export type BlockAppliesTo = 'proposals' | 'contracts';

/**
 * Anything `Component`-shaped from Vue. Typed as `unknown` here to keep
 * this file Vue-free. The composer + renderer cast on use.
 */
export type BlockComponentLoader = () => Promise<unknown>;

export interface BlockTypeDescriptor<P extends Record<string, any> = Record<string, any>> {
	type: BlockType;
	/** Human-readable label for the picker. */
	name: string;
	/** lucide:* icon name for the picker chip + toolbar. */
	icon: string;
	/** Which document types this block can be used in. */
	appliesTo: BlockAppliesTo[];
	/** One-line description for the picker. */
	description?: string;
	/** Fresh default payload when a new block of this type is inserted. */
	defaultPayload: () => P;
	/** Lazy loader for the inline Editor Vue component. */
	Editor?: BlockComponentLoader;
	/** Lazy loader for the static Renderer Vue component. */
	Renderer?: BlockComponentLoader;
}

const REGISTRY: Partial<Record<BlockType, BlockTypeDescriptor>> = {};

export function registerBlockType<P extends Record<string, any>>(d: BlockTypeDescriptor<P>): void {
	REGISTRY[d.type] = d as BlockTypeDescriptor;
}

export function getBlockType(t: BlockType | string | undefined | null): BlockTypeDescriptor | null {
	if (!t) return null;
	return REGISTRY[t as BlockType] || null;
}

export function listBlockTypes(filter?: BlockAppliesTo): BlockTypeDescriptor[] {
	const all = Object.values(REGISTRY).filter(Boolean) as BlockTypeDescriptor[];
	return filter ? all.filter((d) => d.appliesTo.includes(filter)) : all;
}

export function isRegistered(t: string | undefined | null): t is BlockType {
	return !!t && t in REGISTRY;
}
