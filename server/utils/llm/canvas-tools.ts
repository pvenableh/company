// server/utils/llm/canvas-tools.ts
/**
 * The Generative Canvas AI surface — one tool + a system-prompt layer.
 *
 * Unlike the entity MUTATION_TOOLS (which propose destructive/outbound actions
 * into the HITL queue), the canvas tool only edits an in-progress DRAFT that is
 * open on the user's screen. It creates/sends/publishes NOTHING, so it applies
 * live and is safe by construction — the honesty floor holds because a caption,
 * an email body, or a proposal block is just a draft until the user takes a
 * separate, approval-gated action (send_email / publish / sign).
 *
 * The tool is intentionally builder-agnostic: it emits generic `CanvasOp`s
 * (see shared/canvas.ts). Each builder tells the model its own block vocabulary
 * through `buildCanvasSystemPrompt`, so the same tool drafts a newsletter, a
 * proposal, or a week of social posts.
 */

import type { ToolDefinition } from './types';
import type { BlockKindSpec, CanvasArtifact, CanvasKind } from '~~/shared/canvas';

/**
 * The single tool the model calls to draft/refine the canvas. It returns a
 * batch of ops rather than one-at-a-time so a first draft ("make me a win-back
 * email") lands as a coherent set the UI can stagger in together.
 */
export const APPLY_CANVAS_OPS_TOOL: ToolDefinition = {
	name: 'apply_canvas_ops',
	description:
		'Applies a batch of edits to the DRAFT the user is composing on their canvas (an email, a document, or social posts). This edits the on-screen draft ONLY — it never sends, publishes, schedules, or saves anything permanent, so use it freely to build and refine. Call it whenever the user asks you to create, add, change, rewrite, reorder, remove, or restyle content. Emit the SMALLEST set of ops that achieves the request: to refine one block, update just that block; to build a first draft, add each block in reading order. Always use the block "kind" values and payload shapes described in the CANVAS section of the system prompt — never invent a kind. Write real, on-voice, publish-ready copy in every block; never use placeholder/lorem text. Generate a fresh unique id (a short slug + number, e.g. "hero-1") for every block you add.',
	input_schema: {
		type: 'object',
		properties: {
			ops: {
				type: 'array',
				description: 'The ordered edits to apply to the draft. Applied top-to-bottom.',
				items: {
					type: 'object',
					properties: {
						op: {
							type: 'string',
							enum: ['add', 'update', 'remove', 'reorder', 'set_theme', 'set_title'],
							description: 'Which edit to perform.',
						},
						id: {
							type: 'string',
							description: 'The block id. For op="add": a FRESH unique id you generate (e.g. "hero-1", "phase-2"). For op="update"/"remove": the id of the existing target block.',
						},
						kind: {
							type: 'string',
							description: 'For op="add": one of the allowed block kinds for this canvas (see the CANVAS section). Omit for other ops.',
						},
						data: {
							type: 'object',
							description: 'The block payload object. For op="add": the full, finished content matching the kind\'s shape (no placeholders). For op="update": just the fields to change (shallow-merged unless merge=false).',
						},
						after: {
							type: 'string',
							description: 'For op="add" only: where to place it. Omit to append to the end; "start" to prepend; or an existing block id to insert right after it.',
						},
						merge: { type: 'boolean', description: 'For op="update" / "set_theme": false replaces the object outright; default true merges.' },
						order: {
							type: 'array',
							items: { type: 'string' },
							description: 'For op="reorder": the block ids in their new order. Ids you omit keep their place after the listed ones.',
						},
						theme: { type: 'object', description: 'For op="set_theme": theme fields to change (e.g. accent, base, fonts).' },
						title: { type: 'string', description: 'For op="set_title": the new artifact title.' },
					},
					required: ['op'],
				},
			},
			note: {
				type: 'string',
				description: 'Optional one-line, on-voice summary of what you just changed, e.g. "Drafted a warm 3-block win-back email." Shown to the user; keep it short and honest.',
			},
		},
		required: ['ops'],
	},
};

const KIND_LABELS: Record<CanvasKind, string> = {
	email: 'marketing email',
	document: 'proposal / document',
	social: 'set of social media posts',
};

/**
 * The Generative Canvas system-prompt layer. Appended AFTER `buildSystemPrompt`
 * (which already carries Earnest's identity + the voice charter), so all the
 * accuracy/no-hype rules still apply to the copy the model writes here.
 *
 * It teaches the model three things: what it's drafting, the block vocabulary
 * it may use, and the exact current state of the artifact so refinements target
 * the right blocks.
 */
export function buildCanvasSystemPrompt(params: {
	kind: CanvasKind;
	blockKinds: BlockKindSpec[];
	artifact: CanvasArtifact;
	/** Optional short brief the builder wants to ground the whole session in. */
	brief?: string;
}): string {
	const { kind, blockKinds, artifact, brief } = params;

	const vocab = blockKinds
		.map((b) => `- "${b.kind}" — ${b.label}: ${b.description}${b.shape ? ` Shape: ${b.shape}` : ''}`)
		.join('\n');

	// A compact, id-labelled snapshot so the model can target existing blocks by
	// id on refinement turns. Kept short — full payloads would blow the budget on
	// long drafts; the ids + kinds + a heading hint are enough to aim edits.
	const snapshot = artifact.blocks.length
		? artifact.blocks
				.map((b, i) => {
					const hint = b.data?.heading || b.data?.title || b.data?.caption || b.data?.subject || '';
					const trimmed = typeof hint === 'string' && hint ? ` — "${String(hint).slice(0, 60)}"` : '';
					return `  ${i + 1}. id="${b.id}" kind="${b.kind}"${trimmed}`;
				})
				.join('\n')
		: '  (empty — this is a fresh draft)';

	return [
		'',
		'',
		'════════ CANVAS ════════',
		`You are drafting a ${KIND_LABELS[kind]} live on the user's canvas. This is a real-time authoring surface, not a chat: your job is to build and refine the draft by calling the apply_canvas_ops tool, then say ONE short, warm line about what you did.`,
		'',
		'HOW TO WORK HERE:',
		'- To BUILD a first draft, add blocks in reading order with real, finished, on-voice copy.',
		'- To REFINE, change only the block(s) the user pointed at — update their data, do not rebuild everything.',
		'- Prefer the smallest set of ops. Never restate the whole draft in chat — the canvas shows it.',
		'- Your spoken reply is 1–2 sentences, honest and unhurried ("Done — I made the CTA warmer."). Never claim anything was sent, scheduled, published, or signed; this is a draft the user reviews.',
		'- If the user asks to actually send / publish / sign, tell them that\'s a separate step they take from the builder — you only draft here.',
		'',
		'BLOCK KINDS you may use (use these exact kind strings, and match the shape):',
		vocab || '  (none provided)',
		'',
		brief ? `BRIEF: ${brief}\n` : '',
		`CURRENT DRAFT${artifact.title ? ` — titled "${artifact.title}"` : ''}:`,
		snapshot,
		'═════════════════════════',
	].join('\n');
}
