<script setup lang="ts">
/**
 * AIEarnestPanel — the single, unified Earnest assistant panel. Replaces the
 * old per-entity ContextualSidebar AND the global CommandCenter AITray with one
 * route + user + org + entity-aware surface:
 *
 *   - Route-aware: useEarnestAwareness maps the current page → scope + a "right
 *     now you're looking at …" focus sentence + the deselectable knowledge list
 *     ("What Earnest can see"), mirroring the CardDesk pattern.
 *   - Saved + scoped: conversations persist per entity OR per route-scope
 *     (useContextualChat → ai_chat_sessions), restored on open.
 *   - Deselectable knowledge: the awareness chip toggles which context blocks
 *     are sent; the server gates on `includedContext`.
 *
 * Motion is compositor-driven (mounted/visible refs + inline transform + CSS
 * transition on the iOS spring) per the Motion stack policy — no Vue
 * <Transition> class-swap that can stall under throttled RAF.
 */
import { nextTick } from 'vue';
import type { EarnestMood } from '~/composables/useEarnestPresence';

const { panelOpen, panelInitialPrompt, closeEarnestPanel } = useEarnestPanel();
const aware = useEarnestAwareness();
const {
	messages,
	sessionId,
	hasHistory,
	isSending,
	isStreaming,
	isLoadingHistory,
	streamingContent,
	activeToolCall,
	savedMessageIds,
	markMessageSaved,
	unmarkMessageSaved,
	error,
	setEntity,
	setRoute,
	sendMessage,
	cancelStream,
	clearChat,
	listSessions,
	loadSession,
	deleteSession,
} = useContextualChat();
const { saveNoteFromMessage } = useAINotes();
const { usageSummary, refresh: refreshTokenUsage } = useAITokens();
const { canAccess } = useOrgRole();
const { pendingCount: aiPendingCount, refresh: refreshPendingActions } = useAiPendingActions();

// Earnest's own face reacts: the "…" typing state while he streams a reply.
const mascot = useEarnestMascot();
watch(isStreaming, (streaming) => mascot.react(streaming ? 'think' : 'idle'));

// ── Living presence — the "Whisper" altitude: a small living mood-dot ────────
// The header shows a <EarnestPresenceDot> (the same floating, breathing presence
// as the global Focus entry) whose COLOUR follows the conversation — 'present'
// at rest, 'listen' while you type, 'think' while Earnest streams, blooming
// 'warm' for a beat when an action lands. The dot interpolates between these.
const MOOD_DOT_COLORS: Record<EarnestMood, readonly [string, string, string]> = {
	reflect: ['#7c83e8', '#8f6fe0', '#6a72d6'],
	present: ['#38bdf8', '#22d3ee', '#6a8cff'],
	listen: ['#2fd0c0', '#3ad0e0', '#57e0a0'],
	think: ['#f0b64a', '#f2c465', '#e6a850'],
	warm: ['#4fd89a', '#3fbe82', '#e0c070'],
};
// mood wiring lives just below, once `newMessage` (the composer) is declared.

// Expand to the calm full-screen focus size. This is a pure resize — the docked
// panel has already synced the chat context (entity or route) via syncContext,
// and 'full' reads the SAME awareness bucket, so the live thread carries over
// unbroken (setEntity/setRoute are idempotent on an unchanged key).
function enterFocusMode() {
	setEarnestSize('full');
}

// ── Compositor-driven enter/leave (no Vue <Transition>) ──────────────────────
const SPRING = 'cubic-bezier(0.36, 0.66, 0.04, 1)';
const ANIM_MS = 360;
const mounted = ref(false);
const visible = ref(false);
let leaveTimer: ReturnType<typeof setTimeout> | null = null;

watch(panelOpen, (open) => {
	if (open) {
		if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
		mounted.value = true;
		// Render closed pose for one frame, then flip to open so the compositor
		// runs the CSS transition (setTimeout, not RAF — survives throttling).
		setTimeout(() => { visible.value = true; }, 16);
		refreshTokenUsage();
		refreshPendingActions();
	} else {
		visible.value = false;
		leaveTimer = setTimeout(() => { mounted.value = false; }, ANIM_MS);
	}
}, { immediate: true });

const panelStyle = computed(() => ({
	transform: visible.value ? 'translateX(0)' : 'translateX(100%)',
	transition: `transform ${ANIM_MS}ms ${SPRING}`,
}));
const backdropStyle = computed(() => ({
	opacity: visible.value ? '1' : '0',
	transition: `opacity ${ANIM_MS}ms ${SPRING}`,
}));

// ── Context sync: tell the chat engine what we're scoped to ──────────────────
function syncContext() {
	if (aware.hasEntity.value && aware.entityType.value && aware.entityId.value) {
		setEntity(aware.entityType.value, aware.entityId.value);
	} else {
		setRoute(aware.scope.value, aware.scope.value);
	}
}

// Re-sync whenever the panel opens or the page context changes while open.
watch(
	[panelOpen, aware.contextKey],
	async () => {
		if (!panelOpen.value) return;
		syncContext();
		// Deep-linked past conversation (from a saved note): load it into the
		// now-synced bucket, then stop -- do not also fire an initial prompt.
		if (earnestPendingSession.value) {
			const sid = earnestPendingSession.value;
			earnestPendingSession.value = null;
			await nextTick();
			await loadSession(sid);
			return;
		}
		// Fire a queued initial prompt (e.g. from a dashboard suggestion card).
		if (panelInitialPrompt.value) {
			const p = panelInitialPrompt.value;
			panelInitialPrompt.value = '';
			await nextTick();
			await send(p);
		}
	},
	{ immediate: true },
);

// ── Send ─────────────────────────────────────────────────────────────────────
const newMessage = ref('');
const messagesContainer = ref<HTMLElement | null>(null);

// Presence mood follows the conversation. Placed here so the 'listen'-while-
// typing rule can read the composer's `newMessage`.
const panelMood = computed<EarnestMood>(() => {
	if (isSending.value || isStreaming.value) return 'think';
	if (newMessage.value.trim()) return 'listen';
	return 'present';
});
// An earned 'warm' bloom for a beat when a tool action succeeds.
const warmFlash = ref(false);
let warmTimer: ReturnType<typeof setTimeout> | null = null;
watch(() => activeToolCall.value?.success, (s) => {
	if (s !== true) return;
	warmFlash.value = true;
	if (warmTimer) clearTimeout(warmTimer);
	warmTimer = setTimeout(() => { warmFlash.value = false; }, 2600);
});
onBeforeUnmount(() => { if (warmTimer) clearTimeout(warmTimer); });
// The dot's three colours, interpolated by <EarnestPresenceDot> on change.
const whisperColors = computed(() => MOOD_DOT_COLORS[warmFlash.value ? 'warm' : panelMood.value]);

const scrollToBottom = (smooth = false) => {
	const el = messagesContainer.value;
	if (!el) return;
	el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
};

async function send(content: string) {
	const text = content.trim();
	if (!text) return;
	await sendMessage(text, {
		scope: aware.scope.value,
		routeFocus: aware.focus.value,
		includedContext: aware.includedKeys.value as string[],
	});
	await nextTick();
	scrollToBottom();
}

const handleSend = async () => {
	const content = newMessage.value.trim();
	if (!content) return;
	newMessage.value = '';
	await send(content);
};

const handlePromptClick = (prompt: string) => send(prompt);

// Actions Earnest can actually perform on the focused entity — surfaced so the
// user knows these are on the table (each seeds a chat message that triggers the
// approval-gated tool). Keyed by the setEntity type.
// The action chips come from the ONE shared catalog (useEarnestActions), the
// same set the inline "Create with Earnest" sheet offers.
const entityActions = computed(() =>
	aware.hasEntity.value ? earnestActionsFor(aware.entityType.value) : [],
);
// Surface the "things Earnest can do here" chips by DEFAULT — they were the
// highest-value affordance in the panel yet sat collapsed below the prompts.
// The toggle stays so a user can still fold them away; this only opens on mount.
const showActions = ref(true);

const handleKeydown = (e: KeyboardEvent) => {
	if (e.key === 'Enter' && !e.shiftKey) {
		e.preventDefault();
		handleSend();
	}
};

// ── Save as note + feedback (parity with the old sidebar) ────────────────────
const handleSaveAsNote = async (msg: { id: string; content: string; serverId?: string }) => {
	const targetId = msg.serverId || msg.id;
	if (!sessionId.value || savedMessageIds.value.has(targetId)) return;
	markMessageSaved(targetId);
	try {
		const note = await saveNoteFromMessage(sessionId.value, msg.content, targetId);
		if (!note) throw new Error('Save failed');
		const { toast } = await import('vue-sonner');
		toast.success('Saved to your notes');
	} catch {
		unmarkMessageSaved(targetId);
		const { toast } = await import('vue-sonner');
		toast.error('Could not save note');
	}
};

const correctionTarget = ref<any>(null);
const correctionText = ref('');
const submitFeedback = async (msg: any, rating: 'positive' | 'negative', correction?: string) => {
	try {
		await $fetch(`/api/ai/messages/${msg.id}/feedback`, { method: 'POST', body: { rating, correction } });
		msg.feedback = { rating, correction };
	} catch (err: any) {
		console.warn('[EarnestPanel] Feedback failed:', err.message);
	}
};
const openCorrection = (msg: any) => {
	if (correctionTarget.value?.id === msg.id) { correctionTarget.value = null; correctionText.value = ''; return; }
	correctionTarget.value = msg;
	correctionText.value = '';
};
const submitCorrection = async () => {
	if (!correctionTarget.value) return;
	await submitFeedback(correctionTarget.value, 'negative', correctionText.value || undefined);
	correctionTarget.value = null;
	correctionText.value = '';
};

// ── Token meter ──────────────────────────────────────────────────────────────
const canManageTokens = computed(() => canAccess('org_settings'));
const tokensUnlimited = computed(() => {
	const s = usageSummary.value;
	return !s || s.orgLimit === null || s.orgLimit === undefined;
});
const tokensUsedPct = computed(() => {
	const s = usageSummary.value;
	if (!s || !s.orgLimit) return 0;
	return Math.min(100, Math.round(((s.orgTokensUsed ?? 0) / s.orgLimit) * 100));
});
const tokensBarClass = computed(() => {
	if (tokensUsedPct.value >= 90) return 'bg-destructive';
	if (tokensUsedPct.value >= 70) return 'bg-warning';
	return 'bg-primary/60';
});

// ── Auto-scroll on stream / new message ──────────────────────────────────────
let scrollRaf = 0;
const isNearBottom = () => {
	const el = messagesContainer.value;
	if (!el) return true;
	return el.scrollHeight - (el.scrollTop + el.clientHeight) < 80;
};
watch(streamingContent, () => {
	if (scrollRaf) return;
	scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; if (isNearBottom()) scrollToBottom(false); });
});
watch(() => messages.value.length, () => { nextTick(() => scrollToBottom(true)); });

// ── Markdown (same renderer as the old surfaces) ─────────────────────────────
const renderMarkdown = (text: string): string => {
	if (!text) return '';
	let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
		`<pre class="bg-gray-900 text-gray-100 rounded-lg p-2 my-1 overflow-x-auto text-[11px] leading-relaxed"><code>${code.trim()}</code></pre>`);
	html = html.replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-[11px] font-mono">$1</code>');
	html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
	html = html.replace(/^### (.+)$/gm, '<h4 class="text-xs font-semibold mt-2 mb-0.5">$1</h4>');
	html = html.replace(/^## (.+)$/gm, '<h3 class="text-sm font-semibold mt-2 mb-0.5">$1</h3>');
	html = html.replace(/^- (.+)$/gm, '<li class="ml-3 list-disc text-xs">$1</li>');
	html = html.replace(/^\d+\.\s(.+)$/gm, '<li class="ml-3 list-decimal text-xs">$1</li>');
	html = html.replace(/\[Source:\s*([^\]]+)\]/g,
		'<span class="inline-flex items-center px-1.5 py-0 rounded-full bg-primary/10 text-primary text-[9px] font-medium whitespace-nowrap align-baseline mx-0.5">$1</span>');
	html = html.replace(/\n\n/g, '</p><p class="my-1">');
	html = html.replace(/\n/g, '<br>');
	return `<p class="my-0.5">${html}</p>`;
};

const titleLine = computed(() => (aware.hasEntity.value
	? `Ask about this ${aware.entityReadable.value}`
	: 'Earnest assistant'));

// ── Chat ↔ Activity switch ────────────────────────────────────────────────────
// The Activity tab surfaces the org-wide ai_actions audit log (<AiActivityList>).
// A lightweight pill switcher (not <UTabs>) is used here because the chat body
// has a pinned footer input; UTabs' <TabsContent> wrapping would break that
// flex-col layout. The visual matches the pill design system.
const activeTab = ref<'chat' | 'activity'>('chat');

// ── Past-conversation history browser ────────────────────────────────────────
// The unified panel restores only the latest thread for the current focus; this
// overlay brings back the list/open/delete of past sessions.
const showHistory = ref(false);
const historyLoading = ref(false);
const historySessions = ref<import('~/composables/useContextualChat').ChatSessionSummary[]>([]);
const deletingId = ref<string | null>(null);

// Always land on the chat (not a stale history list) when the panel reopens.
watch(panelOpen, (open) => { if (open) showHistory.value = false; });

async function openHistory() {
	showHistory.value = true;
	historyLoading.value = true;
	try {
		historySessions.value = await listSessions({ limit: 50 });
	} finally {
		historyLoading.value = false;
	}
}
function closeHistory() {
	showHistory.value = false;
}
async function pickSession(id: string) {
	await loadSession(id);
	showHistory.value = false;
	await nextTick();
	scrollToBottom();
}
async function removeSession(id: string) {
	deletingId.value = id;
	const ok = await deleteSession(id);
	deletingId.value = null;
	if (ok) historySessions.value = historySessions.value.filter((s) => s.id !== id);
}

// "New conversation" should also drop out of the history view.
function newConversation() {
	clearChat();
	showHistory.value = false;
}

const sessionDateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
function formatSessionTime(iso?: string): string {
	if (!iso) return '';
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return '';
	const diffMs = Date.now() - then;
	const mins = Math.round(diffMs / 60000);
	if (mins < 1) return 'just now';
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.round(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.round(hrs / 24);
	if (days < 7) return `${days}d ago`;
	return sessionDateFmt.format(then);
}
</script>

<template>
	<Teleport to="body">
		<div v-if="mounted">
			<!-- Backdrop -->
			<div
				class="fixed inset-0 bg-black/35 backdrop-blur-sm z-[60]"
				:style="backdropStyle"
				@click="closeEarnestPanel"
			/>
			<!-- Panel -->
			<div
				class="fixed right-0 top-0 h-full w-full max-w-md bg-background shadow-2xl z-[61] flex flex-col overflow-hidden border-l border-border"
				:style="panelStyle"
				role="dialog"
				aria-label="Earnest assistant"
			>
				<!-- Header -->
				<div class="border-b border-border/30 shrink-0">
					<div class="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary/5 to-violet-500/5">
						<div class="flex items-center gap-2.5 min-w-0">
							<!-- the living presence: a floating, breathing mood-dot that
							     recolours with the conversation (Whisper). -->
							<div class="relative w-9 h-9 shrink-0">
								<EarnestPresenceDot :colors="whisperColors" />
							</div>
							<div class="min-w-0">
								<h2 class="text-sm font-bold text-foreground truncate">{{ titleLine }}</h2>
								<p class="text-[10px] text-muted-foreground truncate">Looking at {{ aware.focus.value }}</p>
							</div>
						</div>
						<div class="flex items-center gap-1 shrink-0">
							<button
								@click="enterFocusMode"
								class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
								title="Focus mode — a calmer, full-screen walkthrough"
							>
								<Icon name="lucide:maximize" class="w-3.5 h-3.5 text-muted-foreground" />
							</button>
							<button
								v-if="activeTab === 'chat'"
								@click="showHistory ? closeHistory() : openHistory()"
								class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
								:class="showHistory ? 'bg-muted text-foreground' : ''"
								title="Past conversations"
							>
								<Icon name="lucide:history" class="w-3.5 h-3.5" :class="showHistory ? 'text-foreground' : 'text-muted-foreground'" />
							</button>
							<button
								v-if="hasHistory"
								@click="newConversation"
								class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
								title="New conversation"
							>
								<Icon name="lucide:plus" class="w-3.5 h-3.5 text-muted-foreground" />
							</button>
							<button
								@click="closeEarnestPanel"
								class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
							>
								<Icon name="lucide:x" class="w-4 h-4 text-muted-foreground" />
							</button>
						</div>
					</div>

					<!-- Chat ↔ Activity switch -->
					<div class="flex gap-0.5 px-3 py-2 bg-muted/10 border-t border-border/20">
						<button
							v-for="t in ([{ key: 'chat', label: 'Chat', icon: 'lucide:message-circle' }, { key: 'activity', label: 'Proposals', icon: 'lucide:sparkles' }] as const)"
							:key="t.key"
							@click="activeTab = t.key"
							class="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-all flex-1 justify-center"
							:class="activeTab === t.key ? 'bg-card shadow-sm border border-border/50 text-foreground' : 'text-muted-foreground hover:bg-muted/40'"
						>
							<Icon :name="t.icon" class="w-3 h-3" />
							{{ t.label }}
							<span
								v-if="t.key === 'activity' && aiPendingCount > 0"
								class="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-warning text-[9px] font-semibold text-warning-foreground tabular-nums"
							>
								{{ aiPendingCount > 99 ? '99+' : aiPendingCount }}
							</span>
						</button>
					</div>

					<!-- Token strip -->
					<div v-if="activeTab === 'chat' && !tokensUnlimited && usageSummary" class="flex items-center gap-2 px-4 py-1.5 border-t border-border/20">
						<UIcon name="i-heroicons-bolt" class="w-3 h-3 text-muted-foreground shrink-0" />
						<div class="flex-1 h-1 rounded-full bg-muted/40 overflow-hidden">
							<div class="h-full rounded-full transition-all duration-500" :class="tokensBarClass" :style="{ width: `${tokensUsedPct}%` }" />
						</div>
						<span class="text-[10px] tabular-nums text-muted-foreground shrink-0">{{ tokensUsedPct }}%</span>
						<button v-if="canManageTokens" class="text-[10px] text-primary hover:underline shrink-0" @click="openTokenModal()">Manage</button>
					</div>
				</div>

				<!-- Proposals tab: the trust dial (how much bypasses this queue) + the
				     org-wide ai_actions queue/audit log — the same "Earnest's
				     proposals" the Director's Office reviews as a session. -->
				<div v-if="activeTab === 'activity'" class="flex-1 overflow-y-auto px-4 py-3">
					<section class="mb-4 rounded-2xl border border-border/60 bg-muted/20 px-4 py-4">
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground text-center mb-3">How much Earnest handles on its own</p>
						<EarnestTrustDial />
					</section>
					<AiActivityList show-filters />
				</div>

				<!-- History: past conversations (list / open / delete) -->
				<div v-if="activeTab === 'chat' && showHistory" class="flex-1 overflow-y-auto px-3 py-3 flex flex-col">
					<div class="flex items-center justify-between px-1 pb-2">
						<span class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Past conversations</span>
						<button @click="closeHistory" class="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5">
							<Icon name="lucide:arrow-left" class="w-3 h-3" /> Back
						</button>
					</div>

					<div v-if="historyLoading" class="flex items-center justify-center py-8 text-xs text-muted-foreground/70 gap-2">
						<Icon name="lucide:loader-2" class="w-4 h-4 animate-spin" /> Loading…
					</div>

					<div v-else-if="!historySessions.length" class="flex-1 flex flex-col items-center justify-center text-center px-4 py-8">
						<Icon name="lucide:message-square-dashed" class="w-6 h-6 text-muted-foreground/50 mb-2" />
						<p class="text-xs text-muted-foreground">No past conversations yet.</p>
					</div>

					<ul v-else class="space-y-1">
						<li
							v-for="s in historySessions"
							:key="s.id"
							class="group flex items-center gap-2 px-2.5 py-2 rounded-xl border border-border/60 hover:bg-primary/5 hover:border-primary/30 transition-colors cursor-pointer"
							:class="{ 'bg-primary/5 border-primary/40': s.id === sessionId }"
							@click="pickSession(s.id)"
						>
							<Icon name="lucide:message-circle" class="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
							<div class="min-w-0 flex-1">
								<p class="text-xs text-foreground truncate">{{ s.title || 'Untitled conversation' }}</p>
								<p class="text-[10px] text-muted-foreground">{{ formatSessionTime(s.date_updated || s.date_created) }}</p>
							</div>
							<button
								class="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-destructive/10 text-muted-foreground/70 hover:text-destructive shrink-0"
								title="Delete conversation"
								@click.stop="removeSession(s.id)"
							>
								<Icon v-if="deletingId === s.id" name="lucide:loader-2" class="w-3 h-3 animate-spin" />
								<Icon v-else name="lucide:trash-2" class="w-3 h-3" />
							</button>
						</li>
					</ul>
				</div>

				<!-- Messages -->
				<div v-show="activeTab === 'chat' && !showHistory" ref="messagesContainer" class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
					<div v-if="isLoadingHistory" class="flex items-center justify-center h-full text-xs text-muted-foreground/70 gap-2">
						<Icon name="lucide:loader-2" class="w-4 h-4 animate-spin" /> Loading conversation…
					</div>

					<!-- Empty state: awareness chip + prompts -->
					<div v-else-if="!messages.length && !isStreaming" class="flex flex-col h-full">
						<AIAwarenessChip :items="aware.knowledge.value" @toggle="aware.toggle" />
						<div class="flex-1 flex flex-col items-center justify-center text-center px-2 py-6">
							<!-- voice: the brand mark greets — the iconic "E." with its live blue
							     dot (tap it to unfurl to the full wordmark). -->
							<EarnestPresenceMark :height="30" class="text-foreground mb-3.5" />
							<p class="text-sm font-medium text-foreground mb-1">Earnest</p>
							<p class="text-xs text-muted-foreground mb-4 max-w-[260px]">Your warm, encouraging ops partner — projects, leads, tickets, revenue.</p>
						</div>
						<div class="w-full space-y-2 pb-1">
							<!-- One-tap encouragement — the warm, inviting lead. Routes through
							     the same contextually-aware engine, so Earnest grounds the lift
							     in real momentum (never unearned hype). -->
							<button
								type="button"
								class="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-primary/12 border border-primary/25 text-xs font-medium text-foreground hover:bg-primary/[0.18] hover:border-primary/40 transition-colors"
								@click="handlePromptClick(EARNEST_LIFT_OPENER)"
							>
								<Icon name="lucide:sparkles" class="w-3.5 h-3.5 text-primary" />
								{{ EARNEST_LIFT_OPENER }}
							</button>
							<button
								v-for="prompt in aware.suggestedPrompts.value"
								:key="prompt"
								@click="handlePromptClick(prompt)"
								class="w-full text-left px-3 py-2 rounded-xl border border-border text-xs text-foreground hover:bg-primary/5 hover:border-primary/30 transition-colors"
							>
								<EarnestIcon class="w-3 h-3 text-primary/60 inline-block mr-1.5" />
								{{ prompt }}
							</button>

							<!-- Actions Earnest can take on this entity (approval-gated). Tells
							     the user these are possible, and one tap sets them up. -->
							<div v-if="entityActions.length" class="pt-1">
								<button
									type="button"
									class="w-full flex items-center gap-1.5 px-1 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
									@click="showActions = !showActions"
								>
									<Icon name="lucide:wand-2" class="w-3 h-3" />
									Things Earnest can do here
									<Icon :name="showActions ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="w-3 h-3 ml-auto" />
								</button>
								<div v-if="showActions" class="flex flex-wrap gap-1.5 pt-1.5">
									<button
										v-for="a in entityActions"
										:key="a.label"
										type="button"
										class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
										:title="a.prompt"
										@click="handlePromptClick(a.prompt)"
									>
										<Icon name="lucide:sparkles" class="w-3 h-3" />
										{{ a.label }}
									</button>
								</div>
							</div>
						</div>
					</div>

					<!-- Message list -->
					<template v-else>
						<template v-for="msg in messages" :key="msg.key || msg.id">
							<div v-if="msg.role === 'user'" class="flex justify-end">
								<div class="max-w-[85%] px-3 py-2 rounded-2xl rounded-br-md bg-primary text-primary-foreground text-xs leading-relaxed whitespace-pre-wrap break-words">
									{{ msg.content }}
								</div>
							</div>
							<div v-else class="group flex justify-start">
								<div class="max-w-[90%]">
									<div class="px-3 py-2 rounded-2xl rounded-bl-md bg-muted text-xs leading-relaxed text-foreground" :class="{ 'is-streaming': msg.streaming }">
										<span v-if="!msg.content && msg.streaming" class="typing-dots" aria-label="Thinking"><span></span><span></span><span></span></span>
										<template v-else>
											<span v-html="renderMarkdown(msg.content)"></span>
											<span v-if="msg.streaming" class="caret" aria-hidden="true"></span>
										</template>
									</div>
									<div v-if="!msg.streaming" class="flex items-center gap-1 mt-0.5 ml-1 h-5">
										<button
											v-if="sessionId && !savedMessageIds.has(msg.serverId || msg.id)"
											@click="handleSaveAsNote(msg)"
											class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/70 hover:text-primary p-0.5 rounded"
											title="Save as note"
										>
											<Icon name="lucide:bookmark" class="w-3 h-3" />
										</button>
										<span v-else-if="savedMessageIds.has(msg.serverId || msg.id)" class="text-[10px] text-primary/70 flex items-center gap-0.5">
											<Icon name="lucide:bookmark-check" class="w-3 h-3" /> Saved
										</span>
										<button
											@click="submitFeedback(msg, 'positive')"
											class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
											:class="msg.feedback?.rating === 'positive' ? 'text-success' : 'text-muted-foreground/70 hover:text-success'"
											title="Helpful"
										>
											<Icon name="lucide:thumbs-up" class="w-3 h-3" />
										</button>
										<button
											@click="openCorrection(msg)"
											class="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
											:class="msg.feedback?.rating === 'negative' ? 'text-destructive' : 'text-muted-foreground/70 hover:text-destructive'"
											title="Not helpful"
										>
											<Icon name="lucide:thumbs-down" class="w-3 h-3" />
										</button>
									</div>
									<div v-if="correctionTarget?.id === msg.id" class="mt-1 ml-1 flex gap-1 items-end">
										<textarea
											v-model="correctionText"
											placeholder="What was wrong? (optional)"
											class="flex-1 text-[11px] rounded-2xl glass-field px-2 py-1 resize-none focus:outline-none"
											rows="2"
											@keydown.enter.ctrl="submitCorrection"
										/>
										<button @click="submitCorrection" class="px-2 py-1 rounded text-[9px] font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors shrink-0">Submit</button>
									</div>
								</div>
							</div>
						</template>

						<!-- Tool call indicator -->
						<div v-if="activeToolCall" class="flex justify-start">
							<div
								class="max-w-[90%] px-3 py-2 rounded-2xl rounded-bl-md border text-xs flex items-center gap-1.5"
								:class="activeToolCall.success === false
									? 'bg-destructive/10 border-destructive/30 text-destructive'
									: activeToolCall.success === true
										? 'bg-success/10 border-success/30 text-success'
										: 'bg-info/10 border-info/30 text-info'"
							>
								<Icon v-if="activeToolCall.success === true" name="lucide:check-circle-2" class="w-3 h-3 shrink-0" />
								<Icon v-else-if="activeToolCall.success === false" name="lucide:x-circle" class="w-3 h-3 shrink-0" />
								<span v-else class="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin shrink-0" />
								<span class="font-medium">{{ activeToolCall.summary || activeToolCall.label }}</span>
							</div>
						</div>

						<div v-if="error" class="px-3 py-2 rounded-xl bg-destructive/10 text-xs text-destructive">{{ error }}</div>
					</template>
				</div>

				<!-- Input -->
				<div v-if="activeTab === 'chat' && !showHistory" class="border-t border-border/30 p-3 shrink-0">
					<div class="flex items-end gap-2">
						<textarea
							v-model="newMessage"
							@keydown="handleKeydown"
							placeholder="Ask Earnest…"
							:disabled="isSending"
							rows="1"
							class="flex-1 resize-none rounded-2xl glass-field px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none transition-colors"
							style="max-height: 96px"
						/>
						<button
							@click="isStreaming ? cancelStream() : handleSend()"
							:disabled="!isStreaming && (!newMessage.trim() || isSending)"
							class="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
							:class="isStreaming ? 'bg-destructive text-white' : newMessage.trim() ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : 'bg-muted text-muted-foreground/70'"
						>
							<Icon :name="isStreaming ? 'lucide:square' : 'lucide:arrow-up'" class="w-3.5 h-3.5" />
						</button>
					</div>
					<p class="text-[10px] text-muted-foreground mt-1.5">Earnest may make mistakes.</p>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<style scoped>
.is-streaming {
	box-shadow: inset 0 0 0 1px hsl(var(--primary) / 0.12);
}
.caret {
	display: inline-block;
	width: 2px;
	height: 0.95em;
	margin-left: 2px;
	vertical-align: -2px;
	background: hsl(var(--primary) / 0.7);
	border-radius: 1px;
	animation: caret-blink 0.9s steps(1) infinite;
}
@keyframes caret-blink {
	0%, 50% { opacity: 1; }
	50.01%, 100% { opacity: 0; }
}
.typing-dots {
	display: inline-flex;
	gap: 4px;
	padding: 2px 0;
}
.typing-dots span {
	width: 5px;
	height: 5px;
	border-radius: 9999px;
	background: hsl(var(--muted-foreground) / 0.55);
	animation: typing-bounce 1.1s ease-in-out infinite;
}
.typing-dots span:nth-child(2) { animation-delay: 0.15s; }
.typing-dots span:nth-child(3) { animation-delay: 0.3s; }
@keyframes typing-bounce {
	0%, 80%, 100% { transform: translateY(0); opacity: 0.55; }
	40% { transform: translateY(-3px); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
	.typing-dots span, .caret { animation: none !important; }
}
</style>
