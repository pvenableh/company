// composables/useGenerativeCanvas.ts
/**
 * useGenerativeCanvas — the orchestration brain of the Generative Canvas.
 *
 * This is the seam the three builders (email, document, social) wire into to
 * get conversational, Earnest-drafted authoring. It owns:
 *   • the DRAFT artifact model (blocks + theme) as the single source of truth,
 *   • the streaming conversation with /api/ai/canvas (SSE, mirrors
 *     useContextualChat's reader loop),
 *   • applying the model's `canvas_ops` to the artifact, and
 *   • driving the presence mood + GSAP choreography so edits *land*.
 *
 * It is deliberately builder-agnostic. A builder supplies its block vocabulary
 * (`blockKinds`) and keeps the artifact in the generic CanvasBlock shape via a
 * thin adapter of its own; this composable never touches Directus or the
 * builder's real schema — persistence stays the builder's job (its existing
 * autosave), which is what keeps the honesty floor intact (nothing is sent or
 * published here — only a draft is edited).
 *
 * Wire-up in a builder:
 *   const presence = useEarnestPresence({ initial: 'present' });
 *   const canvasEl = ref<HTMLElement | null>(null);
 *   const choreo = useCanvasChoreography(canvasEl);
 *   const canvas = useGenerativeCanvas({
 *     canvasKind: 'email',
 *     blockKinds: EMAIL_BLOCK_KINDS,
 *     presence, choreography: choreo,
 *     initial: { blocks: adaptFromTemplate(template) },
 *   });
 *   // render canvas.artifact.value.blocks (each with data-canvas-block="id")
 *   // canvas.sendIntent("win-back email, warm not desperate")
 */
import { toValue, type MaybeRefOrGetter } from 'vue';
import type { EarnestPresence } from '~/composables/useEarnestPresence';
import type { CanvasChoreography } from '~/composables/useCanvasChoreography';
import {
	applyCanvasOps,
	type BlockKindSpec,
	type CanvasArtifact,
	type CanvasKind,
	type CanvasOp,
} from '~~/shared/canvas';

export interface CanvasMessage {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	streaming?: boolean;
}

export interface GenerativeCanvasConfig {
	/** Which builder this is — sets the AI's framing. */
	canvasKind: CanvasKind;
	/**
	 * The block vocabulary the AI may emit for this builder. May be a getter or
	 * ref so builders whose vocabulary loads async (e.g. email's library-driven
	 * blocks) can populate it after setup — it's resolved at send time.
	 */
	blockKinds: MaybeRefOrGetter<BlockKindSpec[]>;
	/** Starting draft. Defaults to an empty artifact. */
	initial?: CanvasArtifact;
	/** Optional one-line brief grounding the whole session. */
	brief?: string;
	/** Optional entity to ground brand/context (e.g. the client this is for). */
	entity?: { type: string; id: string };
	/** Org id override; falls back to the selected org. */
	organizationId?: MaybeRefOrGetter<string | undefined>;
	/** Presence brain to drive mood (think/listen/warm). Optional but recommended. */
	presence?: EarnestPresence;
	/** Choreography instance to animate applied ops. Optional. */
	choreography?: CanvasChoreography;
}

export function useGenerativeCanvas(config: GenerativeCanvasConfig) {
	const { selectedOrg } = useOrganization();

	const artifact = ref<CanvasArtifact>(
		config.initial ?? { blocks: [], theme: undefined, title: undefined },
	);
	const blocks = computed(() => artifact.value.blocks);

	const messages = ref<CanvasMessage[]>([]);
	const isDrafting = ref(false);
	const isStreaming = ref(false);
	const error = ref<string | null>(null);
	const sessionId = ref<string | null>(null);
	/** Earnest's short spoken line about the most recent edit. */
	const lastNote = ref<string | null>(null);
	/** Bumped each time ops are applied — builders watch this to autosave. */
	const revision = ref(0);

	let abortController: AbortController | null = null;
	let warmTimer: ReturnType<typeof setTimeout> | null = null;

	function resolveOrgId(): string | undefined {
		const override = config.organizationId != null ? toValue(config.organizationId) : undefined;
		if (override) return override;
		const org = selectedOrg.value;
		return typeof org === 'string' ? org : (org as any)?.id || undefined;
	}

	// ── Presence mood helpers ──────────────────────────────────────────────────
	function mood(m: Parameters<NonNullable<EarnestPresence['setMood']>>[0]) {
		config.presence?.setMood(m);
	}
	function bump(v?: number) {
		config.presence?.bump(v);
	}
	/** Flash 'warm' briefly (an edit landed), then settle back to 'present'. */
	function warmThenSettle() {
		if (warmTimer) clearTimeout(warmTimer);
		mood('warm');
		warmTimer = setTimeout(() => {
			if (!isStreaming.value) mood('present');
		}, 1600);
	}

	/** Call while the user is typing in the intent field — Earnest leans in. */
	function noteTyping() {
		if (!isStreaming.value) mood('listen');
	}
	/** Call when the intent field is cleared / blurred. */
	function noteRest() {
		if (!isStreaming.value) mood('present');
	}

	// ── Applying ops (shared by AI + manual edits) ──────────────────────────────
	/**
	 * Apply a batch of ops to the draft, choreographed. Public so builders can
	 * also drive manual edits (drag reorder, delete) through the same animation.
	 */
	async function applyOps(ops: CanvasOp[], opts: { note?: string; silent?: boolean } = {}) {
		if (!ops?.length) return;
		const preview = applyCanvasOps(artifact.value, ops);

		const run = () => {
			artifact.value = preview.artifact;
			revision.value++;
		};

		// Never let a choreography/animation error break the stream loop — the
		// model's edit must always land even if GSAP hiccups.
		try {
			if (config.choreography) {
				await config.choreography.reflow(run, { enter: preview.added, exit: preview.removed });
				// A warm bloom on rewritten blocks (updates that weren't adds).
				for (const id of preview.updated) config.choreography.land(id);
			} else {
				run();
				await nextTick();
			}
		} catch (e) {
			// Ensure the model change still applies even if the animation threw.
			if (artifact.value !== preview.artifact) run();
			console.error('[GenerativeCanvas] applyOps choreography error:', (e as any)?.message);
		}

		if (opts.note) lastNote.value = opts.note;
		if (!opts.silent && (preview.added.length || preview.updated.length || preview.reordered || preview.themed)) {
			bump(0.4);
			warmThenSettle();
		}
	}

	/** Replace the whole draft (e.g. when the builder loads a different record). */
	function setArtifact(next: CanvasArtifact) {
		artifact.value = { title: next.title, theme: next.theme, blocks: [...next.blocks] };
		revision.value++;
	}

	// ── The conversational drafting loop ────────────────────────────────────────
	async function sendIntent(text: string) {
		const content = text.trim();
		if (!content || isStreaming.value) return;

		error.value = null;
		isDrafting.value = true;
		isStreaming.value = true;
		mood('think');
		bump(0.6);

		const stamp = Date.now();
		messages.value.push({ id: `u-${stamp}`, role: 'user', content });
		const assistant: CanvasMessage = { id: `a-${stamp}`, role: 'assistant', content: '', streaming: true };
		messages.value.push(assistant);

		try {
			abortController = new AbortController();
			const response = await fetch('/api/ai/canvas', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				signal: abortController.signal,
				body: JSON.stringify({
					sessionId: sessionId.value || undefined,
					message: content,
					organizationId: resolveOrgId(),
					canvasKind: config.canvasKind,
					artifact: {
						title: artifact.value.title,
						blocks: artifact.value.blocks,
						theme: artifact.value.theme,
					},
					blockKinds: toValue(config.blockKinds),
					brief: config.brief,
					entityType: config.entity?.type,
					entityId: config.entity?.id,
				}),
			});

			if (!response.ok) {
				let messageText = response.statusText || 'Request failed';
				let errData: any = null;
				try {
					const bodyJson = await response.json();
					errData = bodyJson?.data || null;
					messageText = errData?.message || bodyJson?.message || bodyJson?.statusMessage || messageText;
				} catch {}
				if (response.status === 402 || (response.status === 403 && errData?.sellSheet)) {
					const { openTokenModal } = await import('~/composables/useTokenModal');
					openTokenModal();
				} else if (response.status === 429) {
					const { toast } = await import('vue-sonner');
					toast.error(messageText);
				}
				throw new Error(messageText);
			}

			const reader = response.body?.getReader();
			if (!reader) throw new Error('No response stream');
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) continue;
					let data: any;
					try {
						data = JSON.parse(line.slice(6));
					} catch {
						continue;
					}

					if (data.type === 'chunk') {
						assistant.content += data.content;
					} else if (data.type === 'canvas_ops') {
						// Apply the model's edits to the draft, choreographed.
						await applyOps(data.ops as CanvasOp[], { note: data.note, silent: true });
						bump(0.4);
					} else if (data.type === 'done') {
						if (data.sessionId) sessionId.value = String(data.sessionId);
						if (data.content && !assistant.content) assistant.content = data.content;
						assistant.streaming = false;
					} else if (data.type === 'error') {
						error.value = data.error;
						assistant.streaming = false;
					}
				}
			}
		} catch (e: any) {
			if (e?.name !== 'AbortError') {
				error.value = e?.message || 'Failed to draft';
				// Roll back the empty assistant bubble on hard failure.
				const idx = messages.value.indexOf(assistant);
				if (idx !== -1 && !assistant.content) messages.value.splice(idx, 1);
			}
		} finally {
			assistant.streaming = false;
			isStreaming.value = false;
			isDrafting.value = false;
			abortController = null;
			// Settle mood: warm if we produced something, else back to present.
			if (lastNote.value) warmThenSettle();
			else mood('present');
		}
	}

	function cancel() {
		abortController?.abort();
	}

	function reset() {
		cancel();
		messages.value = [];
		sessionId.value = null;
		lastNote.value = null;
		error.value = null;
	}

	onScopeDispose(() => {
		if (warmTimer) clearTimeout(warmTimer);
		abortController?.abort();
	});

	return {
		// state
		artifact,
		blocks,
		messages,
		isDrafting,
		isStreaming,
		error,
		sessionId,
		lastNote,
		revision,
		// drafting
		sendIntent,
		cancel,
		reset,
		// direct model control (manual edits, loading)
		applyOps,
		setArtifact,
		// mood hooks for the intent field
		noteTyping,
		noteRest,
	};
}

export type GenerativeCanvas = ReturnType<typeof useGenerativeCanvas>;
