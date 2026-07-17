<script setup lang="ts">
/**
 * CoachingTakeover — Earnest's calm "focus mode".
 *
 * A full-screen liquid takeover that strips the UI down to a single
 * conversational flow. Built for moments of fatigue when the command center or
 * a busy project page feels like too much: Earnest walks the user through what
 * matters right now — one thought, one step at a time.
 *
 * It reuses the same chat engine as the Earnest panel (useContextualChat) so the
 * conversation is scoped + persisted, but the surface is deliberately simpler:
 * no dense chrome, one big centered column, and a gel/water background that
 * breathes and brightens while Earnest is thinking.
 *
 * Opened via useCoachingMode(); mounted once in app.vue. Mirrors the
 * Director's Office overlay pattern (teleport + fixed inset-0 + Esc-to-close).
 */
import { nextTick } from 'vue';

const { isOpen, scope, close } = useCoachingMode();
const {
	messages,
	isStreaming,
	isSending,
	streamingContent,
	setEntity,
	setRoute,
	sendMessage,
	cancelStream,
} = useContextualChat();

const mascot = useEarnestMascot();
watch(isStreaming, (streaming) => mascot.react(streaming ? 'think' : 'idle'));

// ── Enter / leave (compositor-driven, per Motion stack policy) ───────────────
const mounted = ref(false);
const visible = ref(false);
let leaveTimer: ReturnType<typeof setTimeout> | null = null;
const ANIM_MS = 420;

watch(isOpen, (open) => {
	if (open) {
		if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
		mounted.value = true;
		syncScope();
		setTimeout(() => { visible.value = true; }, 16);
		nextTick(() => scrollToBottom());
	} else {
		visible.value = false;
		leaveTimer = setTimeout(() => { mounted.value = false; }, ANIM_MS);
	}
}, { immediate: true });

const overlayStyle = computed(() => ({
	opacity: visible.value ? '1' : '0',
	transform: visible.value ? 'scale(1)' : 'scale(1.04)',
	transition: `opacity ${ANIM_MS}ms cubic-bezier(0.36,0.66,0.04,1), transform ${ANIM_MS}ms cubic-bezier(0.36,0.66,0.04,1)`,
}));

// ── Scope → chat context ─────────────────────────────────────────────────────
function syncScope() {
	const s = scope.value;
	if (s?.mode === 'entity' && s.entityType && s.entityId) {
		setEntity(s.entityType, s.entityId);
	} else {
		// A distinct coaching thread (not the panel's org-scope conversation).
		setRoute('coaching', 'coaching');
	}
}
watch(scope, () => { if (isOpen.value) syncScope(); });

const headerLabel = computed(() => {
	const s = scope.value;
	if (s?.mode === 'entity' && s.label) return s.label;
	return 'Focus mode';
});

// A warm, static greeting shown before the first real exchange.
const greeting = computed(() => {
	const s = scope.value;
	if (s?.mode === 'entity' && s.label) {
		return `Let's take ${s.label} one step at a time. Where would you like to start?`;
	}
	return `Let's slow it down. I'll help you find the one next thing that matters — where's your head right now?`;
});

// Suggested opening steps (chips). Tapping one sends it.
const suggestions = computed(() => {
	const s = scope.value;
	if (s?.mode === 'entity') {
		return [
			'What should I focus on first?',
			'Break this down into a few small steps',
			"What's blocking progress?",
			'Draft my next message',
		];
	}
	return [
		'What needs me most today?',
		'Help me plan my next hour',
		"I'm overwhelmed — where do I start?",
		'What can wait until later?',
	];
});

// ── Send ─────────────────────────────────────────────────────────────────────
const input = ref('');
const scroller = ref<HTMLElement | null>(null);

function scrollToBottom() {
	const el = scroller.value;
	if (el) el.scrollTop = el.scrollHeight;
}
watch([messages, streamingContent], () => nextTick(scrollToBottom), { deep: true });

async function send(text?: string) {
	const content = (text ?? input.value).trim();
	if (!content || isStreaming.value) return;
	input.value = '';
	mascot.react('think');
	try {
		await sendMessage(content);
	} catch { /* surfaced by the engine's error state */ }
}

function onEnter(e: KeyboardEvent) {
	if (e.key === 'Enter' && !e.shiftKey) {
		e.preventDefault();
		send();
	}
}

function onEsc(e: KeyboardEvent) {
	if (e.key === 'Escape') close();
}
watch(mounted, (m) => {
	if (import.meta.client) {
		if (m) window.addEventListener('keydown', onEsc);
		else window.removeEventListener('keydown', onEsc);
	}
});
onBeforeUnmount(() => { if (import.meta.client) window.removeEventListener('keydown', onEsc); });

const hasConversation = computed(() => messages.value.length > 0 || isStreaming.value);

// Lightweight markdown (mirrors the Earnest panel's renderer).
function renderMarkdown(text: string): string {
	if (!text) return '';
	let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
	html = html.replace(/^### (.+)$/gm, '<h4 class="font-semibold mt-3 mb-1">$1</h4>');
	html = html.replace(/^## (.+)$/gm, '<h3 class="font-semibold text-lg mt-3 mb-1">$1</h3>');
	html = html.replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>');
	html = html.replace(/^\d+\.\s(.+)$/gm, '<li class="ml-4 list-decimal">$1</li>');
	html = html.replace(/\n\n/g, '</p><p class="mt-2">');
	html = html.replace(/\n/g, '<br>');
	return `<p>${html}</p>`;
}
</script>

<template>
	<Teleport to="body">
		<div
			v-if="mounted"
			class="coach fixed inset-0 z-[85] flex flex-col"
			:class="{ 'coach--active': isStreaming }"
			:style="overlayStyle"
			role="dialog"
			aria-modal="true"
			aria-label="Earnest focus mode"
		>
			<!-- Liquid gel background -->
			<div class="coach__bg" aria-hidden="true">
				<span class="coach__blob coach__blob--1" />
				<span class="coach__blob coach__blob--2" />
				<span class="coach__blob coach__blob--3" />
				<span class="coach__blob coach__blob--4" />
				<div class="coach__veil" />
			</div>

			<!-- Header -->
			<header class="relative z-10 flex items-center justify-between px-5 sm:px-8 pt-5 pb-2 shrink-0">
				<div class="flex items-center gap-3 min-w-0">
					<EarnestMascot :size="34" />
					<div class="min-w-0">
						<p class="text-[10px] uppercase tracking-[0.2em] text-white/50">Earnest · Focus mode</p>
						<p class="text-sm font-medium text-white/90 truncate">{{ headerLabel }}</p>
					</div>
				</div>
				<button
					type="button"
					class="w-9 h-9 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
					aria-label="Close focus mode"
					@click="close"
				>
					<Icon name="lucide:x" class="w-5 h-5" />
				</button>
			</header>

			<!-- Conversation -->
			<div ref="scroller" class="relative z-10 flex-1 overflow-y-auto px-5 sm:px-8">
				<div class="max-w-2xl mx-auto py-6 space-y-5">
					<!-- Greeting + suggestions (before first message) -->
					<div v-if="!hasConversation" class="min-h-[40vh] flex flex-col items-center justify-center text-center">
						<p class="text-xl sm:text-2xl font-light text-white/90 leading-relaxed max-w-lg">
							{{ greeting }}
						</p>
						<div class="mt-8 flex flex-wrap items-center justify-center gap-2">
							<button
								v-for="s in suggestions"
								:key="s"
								type="button"
								class="px-4 py-2 rounded-full text-sm text-white/80 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 transition-colors"
								@click="send(s)"
							>
								{{ s }}
							</button>
						</div>
					</div>

					<!-- Messages -->
					<template v-for="msg in messages" :key="msg.key || msg.id">
						<div v-if="msg.role === 'user'" class="flex justify-end">
							<div class="max-w-[85%] px-4 py-2.5 rounded-3xl rounded-br-lg bg-white/90 text-gray-900 text-[15px] leading-relaxed shadow-lg">
								{{ msg.content }}
							</div>
						</div>
						<div v-else class="flex justify-start">
							<div class="max-w-[92%] text-white/90 text-[15px] leading-relaxed">
								<span v-if="!msg.content && msg.streaming" class="coach__typing"><span /><span /><span /></span>
								<div v-else class="coach__prose" v-html="renderMarkdown(msg.content)" />
							</div>
						</div>
					</template>
				</div>
			</div>

			<!-- Composer -->
			<footer class="relative z-10 px-5 sm:px-8 pb-6 pt-2 shrink-0">
				<div class="max-w-2xl mx-auto">
					<div class="flex items-end gap-2 rounded-[28px] bg-white/10 backdrop-blur-xl border border-white/15 px-2 py-2 shadow-2xl">
						<textarea
							v-model="input"
							rows="1"
							placeholder="Tell Earnest what's on your mind…"
							class="flex-1 max-h-40 bg-transparent text-white placeholder:text-white/40 text-[15px] px-3 py-2 focus:outline-none resize-none"
							@keydown="onEnter"
						/>
						<button
							type="button"
							class="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-colors"
							:class="isStreaming
								? 'bg-white/20 text-white'
								: input.trim() ? 'bg-white text-gray-900 hover:bg-white/90' : 'bg-white/10 text-white/40'"
							:disabled="!isStreaming && (!input.trim() || isSending)"
							:aria-label="isStreaming ? 'Stop' : 'Send'"
							@click="isStreaming ? cancelStream() : send()"
						>
							<Icon :name="isStreaming ? 'lucide:square' : 'lucide:arrow-up'" class="w-5 h-5" />
						</button>
					</div>
					<p class="text-center text-[11px] text-white/40 mt-2">Press <kbd>Esc</kbd> to leave focus mode</p>
				</div>
			</footer>
		</div>
	</Teleport>
</template>

<style scoped>
/* Deep, calm base — a night-water gradient that Earnest's gel floats in. */
.coach {
	background:
		radial-gradient(120% 120% at 50% 0%, #0b1e33 0%, #071427 45%, #04070f 100%);
	color: #fff;
}

.coach__bg {
	position: absolute;
	inset: 0;
	overflow: hidden;
	pointer-events: none;
}

/* Blurred liquid blobs that drift + breathe. Colors read as brand water/aurora. */
.coach__blob {
	position: absolute;
	border-radius: 45% 55% 52% 48% / 52% 47% 53% 48%;
	filter: blur(60px);
	opacity: 0.55;
	mix-blend-mode: screen;
	will-change: transform, border-radius;
}
.coach__blob--1 {
	width: 46vmax; height: 46vmax;
	left: -8vmax; top: -6vmax;
	background: radial-gradient(circle at 30% 30%, #12d0a4, #0b6cff 70%);
	animation: coach-drift-1 22s ease-in-out infinite, coach-morph 14s ease-in-out infinite;
}
.coach__blob--2 {
	width: 40vmax; height: 40vmax;
	right: -10vmax; top: 8vmax;
	background: radial-gradient(circle at 60% 40%, #4da6ff, #7b3ff2 75%);
	animation: coach-drift-2 27s ease-in-out infinite, coach-morph 18s ease-in-out infinite reverse;
}
.coach__blob--3 {
	width: 38vmax; height: 38vmax;
	left: 20vmax; bottom: -12vmax;
	background: radial-gradient(circle at 50% 50%, #00ff87, #0aa0d8 72%);
	animation: coach-drift-3 24s ease-in-out infinite, coach-morph 16s ease-in-out infinite;
}
.coach__blob--4 {
	width: 30vmax; height: 30vmax;
	right: 18vmax; bottom: -6vmax;
	background: radial-gradient(circle at 40% 60%, #5468ff, #12d0a4 78%);
	animation: coach-drift-2 30s ease-in-out infinite reverse, coach-morph 20s ease-in-out infinite;
}

/* A soft veil keeps text legible over the gel. */
.coach__veil {
	position: absolute;
	inset: 0;
	background: radial-gradient(130% 100% at 50% 40%, transparent 0%, rgba(3, 8, 18, 0.35) 60%, rgba(3, 8, 18, 0.72) 100%);
	backdrop-filter: blur(2px);
}

/* When Earnest is thinking, the whole gel warms + quickens. */
.coach--active .coach__blob { opacity: 0.72; filter: blur(52px); }
.coach--active .coach__blob--1 { animation-duration: 12s, 8s; }
.coach--active .coach__blob--2 { animation-duration: 14s, 9s; }
.coach--active .coach__blob--3 { animation-duration: 13s, 8.5s; }

@keyframes coach-drift-1 {
	0%, 100% { transform: translate(0, 0) scale(1); }
	50% { transform: translate(6vmax, 4vmax) scale(1.08); }
}
@keyframes coach-drift-2 {
	0%, 100% { transform: translate(0, 0) scale(1); }
	50% { transform: translate(-5vmax, 5vmax) scale(1.1); }
}
@keyframes coach-drift-3 {
	0%, 100% { transform: translate(0, 0) scale(1); }
	50% { transform: translate(4vmax, -5vmax) scale(1.06); }
}
@keyframes coach-morph {
	0%, 100% { border-radius: 45% 55% 52% 48% / 52% 47% 53% 48%; }
	33% { border-radius: 60% 40% 42% 58% / 45% 60% 40% 55%; }
	66% { border-radius: 38% 62% 63% 37% / 60% 38% 62% 40%; }
}

.coach__prose :deep(p) { margin: 0.25rem 0; }
.coach__prose :deep(strong) { color: #fff; font-weight: 600; }
.coach__prose :deep(li) { margin: 0.15rem 0; }

/* Typing dots */
.coach__typing { display: inline-flex; gap: 4px; align-items: center; height: 1.5rem; }
.coach__typing span {
	width: 7px; height: 7px; border-radius: 9999px; background: rgba(255,255,255,0.7);
	animation: coach-bounce 1.2s ease-in-out infinite;
}
.coach__typing span:nth-child(2) { animation-delay: 0.15s; }
.coach__typing span:nth-child(3) { animation-delay: 0.3s; }
@keyframes coach-bounce {
	0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
	40% { transform: translateY(-5px); opacity: 1; }
}

kbd {
	font-family: inherit;
	background: rgba(255,255,255,0.12);
	border-radius: 4px;
	padding: 1px 5px;
	font-size: 10px;
}

@media (prefers-reduced-motion: reduce) {
	.coach__blob { animation: none !important; }
	.coach__typing span { animation: none !important; }
}
</style>
