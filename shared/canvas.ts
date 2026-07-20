// shared/canvas.ts
/**
 * The Generative Canvas contract — a builder-agnostic block/operation language
 * shared by the AI endpoint (server) and every builder surface (client).
 *
 * The three builders (email, document, social) each have their OWN concrete
 * block model — newsletter `template_blocks`, `DocumentBlockEntry`, social
 * `social_posts`. The kernel does not try to unify those. Instead it speaks a
 * thin generic language of `CanvasBlock { id, kind, data }` + `CanvasOp`, and
 * each builder registers a small adapter that maps its real model to/from this
 * shape. That keeps the AI-drafting + GSAP-choreography machinery in one place
 * while the builders stay the source of truth for their own schemas.
 *
 * `kind` is a builder-defined string (e.g. 'hero', 'scope_tree', 'caption').
 * `data` is that kind's freeform payload — validated by the builder's own
 * editor/renderer, never here (mirrors how `DocumentBlockEntry.payload` works).
 *
 * `applyCanvasOps` is a PURE reducer: the server uses it to validate a model's
 * proposed ops, the client uses it to apply them. Keeping it pure (no DOM, no
 * Directus) is what lets the same ops drive a live GSAP reflow on the client
 * and a headless dry-run on the server.
 */

export type CanvasKind = 'email' | 'document' | 'social';

/** One block on a canvas. `kind` + `data` are interpreted by the builder. */
export interface CanvasBlock {
	id: string;
	kind: string;
	data: Record<string, any>;
}

/** Loose theme bag (accent, base theme, fonts…). Builder-interpreted. */
export type CanvasTheme = Record<string, any>;

/** The whole artifact the canvas is drafting. */
export interface CanvasArtifact {
	title?: string;
	blocks: CanvasBlock[];
	theme?: CanvasTheme;
}

/**
 * A single edit to the artifact. Emitted by the AI (via the apply_canvas_ops
 * tool) and applied by `applyCanvasOps`. Kept deliberately small — these are
 * the primitives every builder needs; richer edits compose from them.
 */
export type CanvasOp =
	/**
	 * Insert a block. The block is given by flat `id` + `kind` + `data` (models
	 * naturally emit this, matching the `update` shape); a nested `block` object
	 * is also accepted for back-compat. `after` positions it: omit / null →
	 * append to the end, 'start' → prepend, or a block id → insert after it.
	 */
	| { op: 'add'; id: string; kind: string; data: Record<string, any>; after?: string | null; block?: CanvasBlock }
	/**
	 * Patch a block's data. `merge` (default true) shallow-merges into the
	 * existing data; `merge: false` replaces the data object outright.
	 */
	| { op: 'update'; id: string; data: Record<string, any>; merge?: boolean }
	/** Remove a block by id (no-op if it's already gone). */
	| { op: 'remove'; id: string }
	/**
	 * Reorder blocks to match `order` (a list of block ids). Ids omitted from
	 * `order` keep their relative position appended after the ordered ones, so
	 * a partial order is safe.
	 */
	| { op: 'reorder'; order: string[] }
	/** Patch (merge, default) or replace the theme bag. */
	| { op: 'set_theme'; theme: CanvasTheme; merge?: boolean }
	/** Set the artifact title. */
	| { op: 'set_title'; title: string };

/** What changed after applying a batch — so the view can choreograph precisely. */
export interface CanvasApplyResult {
	artifact: CanvasArtifact;
	/** Ids of blocks newly added (for entrance animations). */
	added: string[];
	/** Ids of blocks removed (for exit animations). */
	removed: string[];
	/** Ids of blocks whose data changed in place (for a soft flash). */
	updated: string[];
	/** True if block order changed (for a Flip reflow). */
	reordered: boolean;
	/** True if the theme changed. */
	themed: boolean;
}

/** The set of op names — used for validation on the server. */
export const CANVAS_OP_NAMES = ['add', 'update', 'remove', 'reorder', 'set_theme', 'set_title'] as const;

function clone<T>(v: T): T {
	// structuredClone is available in Node 18+ and every target browser here,
	// but it throws on values it can't clone (e.g. some Vue reactive proxies
	// when a builder seeds the canvas from a live record). Fall back to a
	// JSON round-trip so a reactive/exotic payload never crashes an edit.
	try {
		if (typeof structuredClone === 'function') return structuredClone(v);
	} catch { /* fall through to JSON */ }
	return JSON.parse(JSON.stringify(v));
}

/**
 * Apply an ordered batch of ops to an artifact, returning a NEW artifact plus
 * a precise change-set. Never mutates the input. Unknown / malformed ops are
 * skipped rather than thrown — a half-valid batch still makes progress, which
 * matches how the streaming UI wants to behave.
 */
export function applyCanvasOps(input: CanvasArtifact, ops: CanvasOp[]): CanvasApplyResult {
	const artifact: CanvasArtifact = {
		title: input.title,
		theme: input.theme ? clone(input.theme) : undefined,
		blocks: input.blocks.map((b) => clone(b)),
	};

	const added: string[] = [];
	const removed: string[] = [];
	const updated = new Set<string>();
	let reordered = false;
	let themed = false;

	for (const raw of ops || []) {
		if (!raw || typeof (raw as any).op !== 'string') continue;
		const op = raw as CanvasOp;
		switch (op.op) {
			case 'add': {
				// Accept flat ({op,id,kind,data}) — what models emit — OR nested
				// ({op, block:{id,kind,data}}) for back-compat.
				const src: any = op.block && typeof op.block === 'object' ? op.block : op;
				const block: CanvasBlock = { id: src.id, kind: src.kind, data: src.data ?? {} };
				if (typeof block.id !== 'string' || typeof block.kind !== 'string') break;
				// Ignore a duplicate id (idempotent under stream retries).
				if (artifact.blocks.some((b) => b.id === block.id)) break;
				const entry: CanvasBlock = { id: block.id, kind: block.kind, data: block.data ?? {} };
				if (op.after == null) {
					artifact.blocks.push(entry);
				} else if (op.after === 'start') {
					artifact.blocks.unshift(entry);
				} else {
					const idx = artifact.blocks.findIndex((b) => b.id === op.after);
					if (idx === -1) artifact.blocks.push(entry);
					else artifact.blocks.splice(idx + 1, 0, entry);
				}
				added.push(entry.id);
				break;
			}
			case 'update': {
				const target = artifact.blocks.find((b) => b.id === op.id);
				if (!target || !op.data || typeof op.data !== 'object') break;
				target.data = op.merge === false ? clone(op.data) : { ...target.data, ...clone(op.data) };
				updated.add(op.id);
				break;
			}
			case 'remove': {
				const idx = artifact.blocks.findIndex((b) => b.id === op.id);
				if (idx === -1) break;
				artifact.blocks.splice(idx, 1);
				removed.push(op.id);
				break;
			}
			case 'reorder': {
				if (!Array.isArray(op.order)) break;
				const byId = new Map(artifact.blocks.map((b) => [b.id, b]));
				const next: CanvasBlock[] = [];
				const taken = new Set<string>();
				for (const id of op.order) {
					const b = byId.get(id);
					if (b && !taken.has(id)) { next.push(b); taken.add(id); }
				}
				// Preserve any blocks the model didn't mention, in place.
				for (const b of artifact.blocks) if (!taken.has(b.id)) next.push(b);
				const changed = next.some((b, i) => artifact.blocks[i]?.id !== b.id);
				artifact.blocks = next;
				if (changed) reordered = true;
				break;
			}
			case 'set_theme': {
				if (!op.theme || typeof op.theme !== 'object') break;
				artifact.theme = op.merge === false ? clone(op.theme) : { ...(artifact.theme || {}), ...clone(op.theme) };
				themed = true;
				break;
			}
			case 'set_title': {
				if (typeof op.title !== 'string') break;
				artifact.title = op.title;
				break;
			}
			default:
				break;
		}
	}

	return { artifact, added, removed, updated: [...updated], reordered, themed };
}

/** A compact description of a block kind the AI is allowed to emit for a builder. */
export interface BlockKindSpec {
	/** The `kind` string the AI must use. */
	kind: string;
	/** Human label (for the AI's understanding). */
	label: string;
	/** One line: what this block is for and when to use it. */
	description: string;
	/** Optional shape hint, e.g. `{ heading: string, body_markdown: string }`. */
	shape?: string;
}
