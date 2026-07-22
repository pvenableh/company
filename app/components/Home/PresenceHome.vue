<script setup lang="ts">
/**
 * <HomePresenceHome> — the calm, conversational landing (default home surface).
 *
 * Calm first, density on demand: login lands here — Earnest's soft presence, one
 * honest read of the day, the single next move, and a conversation you start and
 * hold RIGHT HERE (no panel hop). The full command center lives one gesture below
 * (the host renders it, revealed on scroll or the "Everything" affordance).
 *
 * Two states, one surface:
 *   idle       → calm hero: greeting, read, the one thing, composer, openers
 *   conversing → the hero collapses to a slim header and the thread appears
 *                in place; the composer stays; "Everything" is still one tap down
 *
 * The conversation reuses the same engine as the Whisper panel
 * (useContextualChat, scoped route:home) so a thread started here can be picked
 * up in the panel and vice-versa. The deterministic read shows instantly; a
 * richer LLM "deeper read" (cached daily server-side) fades in when it lands.
 *
 * App-native typography: greeting/eyebrow follow the user's Appearance style
 * (--title-font); prose follows --body-font — same as the rest of the app.
 *
 * Motion: the idle↔conversing swap and each new message are GSAP-driven (the
 * same engine the presence layer uses) for fluid, native-feeling movement —
 * expo easing on the way in, a quick settle on the way out. Reduced-motion is
 * honoured (the hooks resolve instantly).
 */
import { gsap } from 'gsap';

const props = defineProps<{
	greeting: string;
	subtitle?: string;
	/** The honest one-line read of the day (feedSynthesis, deterministic). */
	read?: string;
	/** The single most important thing right now. */
	topAction?: {
		title: string;
		description?: string;
		actionLabel?: string;
	} | null;
	/** True while the productivity engine is still resolving (drives skeletons). */
	analyzing?: boolean;
	/** Which greeting is on screen — 'ai' means the personalized one landed. */
	greetingSource?: 'none' | 'local' | 'ai';
}>();

const emit = defineEmits<{
	openTop: [];
	reveal: [];
}>();

// ── Conversation (shared engine with the Whisper panel) ──────────────────────
const {
	messages,
	isStreaming,
	isSending,
	streamingContent,
	sendMessage,
	setRoute,
	clearChat,
	loadSession,
} = useContextualChat();
const { openEarnestPanel } = useEarnestPanel();
const { track } = useProductEvent();

// Calm first, fresh each visit. The home ALWAYS opens on the calm greeting on a
// CLEAN 'route:dashboard' thread — a pill/opener starts a NEW conversation, and
// Expand shows exactly that thread (the dock + full-screen focus read the SAME
// bucket). Yesterday's transcript is never dumped over today's greeting; instead
// we peek for a recent one and offer "Continue where you left off", which loads
// it on demand. `conversing` is simply "the fresh bucket holds something" — no
// baseline/slice bookkeeping, so a pill that streams a reply just works.
const { windowMs, recordResumed, recordIgnored } = useHomeContinueWindow();
function isRecent(iso?: string): boolean {
	if (!iso) return false;
	const t = new Date(iso).getTime();
	return Number.isFinite(t) && Date.now() - t < windowMs.value;
}

// Start (or re-activate) the dashboard thread. `fresh` = don't auto-load the
// prior session; the idempotency guard in setRoute preserves an in-progress
// thread when the home re-mounts, so this only lands empty on a new bucket.
function startDashboardThread() {
	setRoute('dashboard', 'dashboard', { fresh: true });
}
onMounted(startDashboardThread);
onActivated(startDashboardThread);

// A recent prior dashboard thread we can offer to resume. Peeked only — NOT
// loaded into the live bucket (that happens when the user taps Continue).
const priorSessionId = ref<string | null>(null);
const priorRecent = ref(false);
async function peekPriorThread() {
	try {
		const data = await $fetch('/api/ai/sessions/by-route', {
			params: { scope: 'dashboard', routeKey: 'dashboard' },
		}) as any;
		const s = data?.session;
		const last = data?.messages?.[data.messages.length - 1]?.date_created;
		if (s?.id) {
			priorSessionId.value = s.id;
			priorRecent.value = isRecent(s.date_updated || s.date_created || last);
		} else {
			priorSessionId.value = null;
			priorRecent.value = false;
		}
	} catch {
		priorSessionId.value = null;
		priorRecent.value = false;
	}
}
onMounted(peekPriorThread);

// In conversation the moment the fresh bucket holds anything (a send, or a
// resumed thread). The bucket IS this session's line — render it directly.
const conversing = computed(() => messages.value.length > 0);
const visibleMessages = computed(() => messages.value);

// Offer to bring back the prior thread only while calm and only if it's recent.
const canResume = computed(() => !conversing.value && priorRecent.value && !!priorSessionId.value);
async function resumeThread() {
	if (!priorSessionId.value) return;
	recordResumed(); // they picked the thread back up — worth offering for longer
	track('home.continue_resumed', { source: 'presence-home' });
	await loadSession(priorSessionId.value);
	scrollThread();
}

// Leave the conversation and return to the calm hero. Clears the live bucket
// (the server session persists — reachable again via Continue) and re-checks
// whether a resumable thread should be offered.
function exitConversation() {
	clearChat();
	peekPriorThread();
}

// ── Adoption instrumentation (fire-and-forget; see useProductEvent) ──────────
// One signal per session: did the Continue chip get offered, and did the user
// hold a conversation here? Together with home.mode_flipped these answer "is the
// calm home landing, and is the Continue chip earning its place?"
let shownTracked = false;
watch(canResume, (can) => {
	if (can && !shownTracked) { shownTracked = true; track('home.continue_shown', { source: 'presence-home' }); }
});
let convoTracked = false;

const input = ref('');
const openers = [
	'What should I start with?',
	'What needs me today?',
	'Draft my morning',
	// One-tap encouragement — Earnest answers grounded in real momentum, warmly.
	EARNEST_LIFT_OPENER,
];

const inputEl = ref<HTMLTextAreaElement | null>(null);
function autogrow() {
	const el = inputEl.value;
	if (!el) return;
	el.style.height = 'auto';
	el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
}
function send(text?: string) {
	const t = (text ?? input.value).trim();
	if (!t || isSending.value) return;
	// The Continue chip was offered and they started a fresh line instead — a
	// vote that a thread this old wasn't worth resuming, so narrow the window.
	if (canResume.value) recordIgnored();
	if (!convoTracked) { convoTracked = true; track('home.conversation_started', { source: 'presence-home' }); }
	input.value = '';
	nextTick(autogrow); // collapse the textarea back to one line
	sendMessage(t, { scope: 'dashboard', routeFocus: 'the home dashboard — the top of their day' });
}
function onKeydown(e: KeyboardEvent) {
	if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
}

// Keep the thread pinned to the newest message as it streams.
const threadEl = ref<HTMLElement | null>(null);
function scrollThread() {
	nextTick(() => { const el = threadEl.value; if (el) el.scrollTop = el.scrollHeight; });
}
watch(() => [messages.value.length, isStreaming.value], scrollThread);

// ── GSAP state motion ────────────────────────────────────────────────────────
// The idle hero and the conversation are swapped via <Transition :css="false">;
// these hooks drive the movement so it feels native — the outgoing state settles
// out quickly, the incoming one rises in on an expo curve with its children
// staggered. Reduced-motion resolves instantly (no tween).
const reducedMotion = () =>
	import.meta.client && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function onStageEnter(el: Element, done: () => void) {
	if (reducedMotion()) { done(); return; }
	const kids = el.querySelectorAll(':scope > *');
	const tl = gsap.timeline({ onComplete: done });
	tl.from(el, { autoAlpha: 0, duration: 0.3, ease: 'power1.out' }, 0);
	tl.from(
		kids,
		{ autoAlpha: 0, y: 18, scale: 0.985, duration: 0.6, ease: 'expo.out', stagger: 0.055, clearProps: 'transform' },
		0.02,
	);
}

function onStageLeave(el: Element, done: () => void) {
	if (reducedMotion()) { done(); return; }
	gsap.to(el, { autoAlpha: 0, y: -10, scale: 0.99, duration: 0.24, ease: 'power2.in', onComplete: done });
}

// Pop each newly appended message bubble in (user turn + the streaming reply).
watch(
	() => messages.value.length,
	(n, prev) => {
		if (reducedMotion() || n <= (prev || 0)) return;
		nextTick(() => {
			const el = threadEl.value?.querySelector('.ph__msg:last-child');
			if (el) gsap.from(el, { autoAlpha: 0, y: 14, scale: 0.96, duration: 0.5, ease: 'expo.out', clearProps: 'transform' });
		});
	},
);

// ── Deeper read — richer LLM sentence, cached daily; progressive enhancement ──
// The read is a "morning read," so it's cached per user+org+day in localStorage:
// the LLM call fires about once a day, not on every visit to the home.
const { selectedOrg } = useOrganization();
const deeperRead = ref('');
onMounted(async () => {
	const orgId = (selectedOrg.value as any)?.id;
	if (!orgId) return;
	const day = new Date().toISOString().slice(0, 10);
	const cacheKey = `earnest.home.read.${orgId}.${day}`;
	try {
		const cached = localStorage.getItem(cacheKey);
		if (cached !== null) { deeperRead.value = cached; return; }
	} catch { /* private mode — just fetch */ }
	try {
		const r = await $fetch<{ read?: string }>('/api/home/read', { query: { orgId } });
		const read = (r?.read || '').trim();
		// Only cache a real read — an empty result (token gate / transient error)
		// must not blank the deeper read for the rest of the day; retry next visit.
		if (read) {
			deeperRead.value = read;
			try { localStorage.setItem(cacheKey, read); } catch { /* quota */ }
		}
	} catch { /* deterministic read stands on its own */ }
});
// ── Settled text — say one thing, once ───────────────────────────────────────
// The greeting and the read each have TWO sources: an instant deterministic
// value and a slower LLM upgrade (the greeting endpoint, the deeper read). When
// the upgrade landed a minute later it visibly rewrote the sentence under the
// user — the page reading as if it changed its mind. So each line settles:
// during a short grace window the better value may still win (a warm cache
// usually lands inside it); once that window closes the sentence on screen is
// latched for the session and never swaps again.
function useSettledText(source: () => string, graceMs: number) {
	const shown = ref('');
	let locked = false;
	let graceOver = false;

	const commit = (raw: string) => {
		const next = (raw || '').trim();
		if (locked || !next) return;
		shown.value = next;
		// After the grace window the first real sentence sticks.
		if (graceOver) locked = true;
	};

	watch(source, (v) => commit(v), { immediate: true });

	if (import.meta.client) {
		onMounted(() => {
			setTimeout(() => {
				graceOver = true;
				if (shown.value) locked = true; // keep what's on screen
				else commit(source()); // nothing yet — next real value wins and locks
			}, graceMs);
		});
	}

	return shown;
}

// ── Greeting: greet instantly, upgrade silently ──────────────────────────────
// Earnest greets — it doesn't stall. The instant deterministic greeting (time +
// name) paints on arrival; the warmer AI greeting fades in only if it lands
// inside the grace window, then the line latches for the session — the same
// "settle" pattern as the read. The first thing the user sees is a hello, never
// a "Thinking…" spinner narrating the machine's state back at them.
const shownGreeting = useSettledText(() => (props.greeting || '').trim(), 3000);

// Read priority: deeper LLM read → deterministic synthesis → the soft subtitle.
const readSource = computed(() => deeperRead.value || props.read || props.subtitle || '');
const shownRead = useSettledText(() => readSource.value, 2200);
// Style the line softly only when what settled is the subtitle placeholder.
const readIsSoft = computed(() => !!props.subtitle && shownRead.value === props.subtitle.trim());

// ── "The one thing" slot ─────────────────────────────────────────────────────
// The slot must hold its height from FIRST PAINT, not just once `analyzing`
// flips true — the engine's analysis is itself gated behind other fetches, so
// there's a window where nothing is loading yet and the card would otherwise
// pop in later and shove the page down. So: reserve until we actually know the
// answer, and only collapse if the analysis settled with no action to show.
const analysisSettled = ref(false);
watch(() => props.analyzing, (now, before) => {
	if (before && !now) analysisSettled.value = true; // true → false = a finished pass
});
if (import.meta.client) {
	// Safety: never reserve the space forever if the engine never reports.
	onMounted(() => { setTimeout(() => { analysisSettled.value = true; }, 20000); });
}
const showTopSlot = computed(() => !!props.topAction || !analysisSettled.value);

// ── Markdown (mirror of the panel's lightweight renderer) ────────────────────
function renderMarkdown(text: string): string {
	if (!text) return '';
	let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
	html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
	html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
	html = html.replace(/\[Source:\s*([^\]]+)\]/g, '<span class="ph__src">$1</span>');
	html = html.replace(/\n\n/g, '</p><p>');
	html = html.replace(/\n/g, '<br>');
	return `<p>${html}</p>`;
}
</script>

<template>
	<section class="ph" :class="{ 'ph--conversing': conversing }">
		<!-- soft living presence behind everything -->
		<div class="ph__glow" aria-hidden="true" />

		<div class="ph__inner">
			<!-- ── IDLE: the calm hero ──────────────────────────────────────── -->
				<Transition :css="false" mode="out-in" @enter="onStageEnter" @leave="onStageLeave">
				<div v-if="!conversing" key="idle" class="ph__stage">
				<div class="ph__mark">
					<EarnestPresenceMark :height="26" class="text-foreground/85" />
				</div>

				<!-- Greeting + read hold their own height from first paint, so the
				     hero never re-centres when the words arrive. -->
				<h1 class="ph__greeting">
					<Transition name="ph-fade">
						<span v-if="shownGreeting" :key="shownGreeting">{{ shownGreeting }}</span>
						<!-- Calm height-holder for the sub-second gap before the instant
						     greeting paints — no machine word, no spinner. -->
						<span v-else key="hold" class="ph__greeting-hold" aria-hidden="true">&nbsp;</span>
					</Transition>
				</h1>

				<p class="ph__read" :class="{ 'ph__read--soft': readIsSoft }">
					<Transition name="ph-fade">
						<span v-if="shownRead" :key="shownRead">{{ shownRead }}</span>
						<span v-else class="ph__sk ph__sk--read" aria-hidden="true" />
					</Transition>
				</p>

				<!-- the single next move — the slot keeps its height while the
				     engine decides, so the card doesn't shove the page down. -->
				<div v-if="showTopSlot" class="ph__top-slot">
					<Transition name="ph-rise">
						<button v-if="topAction" key="card" type="button" class="ph__top" @click="emit('openTop')">
							<span class="ph__top-eyebrow">The one thing</span>
							<span class="ph__top-title">{{ topAction.title }}</span>
							<span v-if="topAction.description" class="ph__top-desc">{{ topAction.description }}</span>
							<Icon name="lucide:arrow-right" class="ph__top-arrow w-4 h-4" />
						</button>
						<div v-else key="sk" class="ph__top ph__top--loading" aria-hidden="true">
							<span class="ph__sk ph__sk--eyebrow" />
							<span class="ph__sk ph__sk--title" />
							<span class="ph__sk ph__sk--desc" />
						</div>
					</Transition>
				</div>
				</div>

			<!-- ── CONVERSING: slim header + in-place thread ─────────────────── -->
				<div v-else key="conv" class="ph__stage">
				<div class="ph__conv-head">
					<div class="ph__conv-id">
						<EarnestPresenceMark :height="18" class="text-foreground/80" />
						<span class="ph__conv-name">Earnest</span>
					</div>
					<div class="ph__conv-actions">
						<button type="button" class="ph__conv-expand" title="Open in the panel" @click="openEarnestPanel()">
							Expand <Icon name="lucide:arrow-up-right" class="w-3.5 h-3.5" />
						</button>
						<button type="button" class="ph__conv-expand ph__conv-exit" title="Back to the calm home" @click="exitConversation">
							Close <Icon name="lucide:x" class="w-3.5 h-3.5" />
						</button>
					</div>
				</div>

				<div ref="threadEl" class="ph__thread" role="log" aria-live="polite" aria-relevant="additions text" aria-label="Conversation with Earnest">
					<div
						v-for="m in visibleMessages"
						:key="m.key || m.id"
						class="ph__msg"
						:class="m.role === 'user' ? 'ph__msg--user' : 'ph__msg--earnest'"
					>
						<div v-if="m.role === 'user'" class="ph__bubble ph__bubble--user">{{ m.content }}</div>
						<div v-else class="ph__bubble ph__bubble--earnest" :class="{ 'is-streaming': m.streaming }">
							<!-- While streaming, read the reactive `streamingContent` ref so the
							     bubble re-renders per chunk — the message objects are mutated in
							     place (raw) and don't trigger reactivity on their own, exactly as
							     the dock panel does. On done, streamingContent clears and the
							     settled `m.content` shows. -->
							<span v-if="m.streaming && !streamingContent" class="ph__typing" aria-label="Thinking"><span></span><span></span><span></span></span>
							<span v-else v-html="renderMarkdown(m.streaming ? streamingContent : m.content)" />
						</div>
					</div>
				</div>
				</div>
				</Transition>

			<!-- ── The composer (shared by both states) ─────────────────────── -->
			<div class="ph__composer">
				<textarea
					ref="inputEl"
					v-model="input"
					rows="1"
					class="ph__input"
					:placeholder="conversing ? 'Reply to Earnest…' : 'Tell Earnest what\'s on your mind, or just start…'"
					@input="autogrow"
					@keydown="onKeydown"
				/>
				<button
					type="button"
					class="ph__send"
					:disabled="!input.trim() || isSending"
					aria-label="Ask Earnest"
					@click="send()"
				>
					<Icon name="lucide:arrow-up" class="w-4 h-4" />
				</button>
			</div>

			<!-- A recent thread is waiting — offer to pick it back up rather than
			     dumping yesterday's transcript over today's calm greeting. -->
			<button v-if="canResume" type="button" class="ph__resume" @click="resumeThread">
				Continue where you left off
				<Icon name="lucide:arrow-right" class="w-3.5 h-3.5" />
			</button>

			<div v-if="!conversing" class="ph__openers">
				<button
					v-for="o in openers"
					:key="o"
					type="button"
					class="ph__opener"
					:class="{ 'ph__opener--lift': o === EARNEST_LIFT_OPENER }"
					@click="send(o)"
				>
					<Icon v-if="o === EARNEST_LIFT_OPENER" name="lucide:sparkles" class="ph__opener-spark" />
					{{ o }}
				</button>
			</div>

			<!-- reach for everything -->
			<button type="button" class="ph__reveal" @click="emit('reveal')">
				Everything
				<Icon name="lucide:chevron-down" class="w-3.5 h-3.5" />
			</button>
		</div>
	</section>
</template>

<style scoped>
.ph {
	position: relative;
	display: flex; justify-content: center;
	padding: clamp(28px, 7vh, 84px) 20px clamp(20px, 4vh, 40px);
	overflow: hidden;
}
/* idle hero ⇄ conversation: motion is GSAP-driven (see onStageEnter/Leave in
   the script); the stage just carries the shared column rhythm so children lay
   out identically in both states. */
.ph__stage {
	display: flex; flex-direction: column; align-items: center; text-align: center;
	gap: 14px; width: 100%;
}
.ph__conv-actions { display: flex; align-items: center; gap: 8px; }
.ph__conv-exit { opacity: 0.65; }
.ph__conv-exit:hover { opacity: 1; }
/* The living presence wash. Centered on the hero and sized so its radial fades
   fully to transparent BEFORE the section edges — that way `.ph { overflow:
   hidden }` (kept to stop the wide glow from causing horizontal scroll on
   mobile) clips only already-transparent pixels, so there's no hard edge. The
   old top:-10% / 520px box pushed the still-opaque top of the glow past the
   clip and showed a flat cut line above the mark. */
.ph__glow {
	position: absolute; left: 50%; top: 50%;
	width: min(880px, 132%); height: 118%;
	transform: translate(-50%, -50%);
	background: radial-gradient(closest-side circle at 50% 46%, hsl(var(--primary) / 0.2), transparent 74%);
	filter: blur(34px);
	animation: ph-breathe 7s ease-in-out infinite;
	pointer-events: none;
}
/* Calm settles as the conversation takes focus. */
.ph--conversing .ph__glow { opacity: 0.5; }
@keyframes ph-breathe {
	0%, 100% { opacity: 0.72; transform: translate(-50%, -50%) scale(1); }
	50% { opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
}

.ph__inner {
	position: relative; z-index: 1;
	width: 100%; max-width: 620px;
	display: flex; flex-direction: column; align-items: center; text-align: center;
	gap: 14px;
}
.ph__mark { opacity: 0.9; margin-bottom: 2px; }

.ph__greeting {
	margin: 0;
	/* App-native: follows the user's Appearance style — family, weight AND
	   tracking come from the title tokens (--title-font/-weight/-tracking) so the
	   hero greeting matches the rest of the app's titles instead of hardcoding a
	   heavier, tighter treatment of its own. */
	font-family: var(--title-font, inherit);
	font-size: clamp(26px, 4.4vw, 40px); line-height: 1.1;
	font-weight: var(--title-weight, 400);
	letter-spacing: var(--title-tracking, 0.1em);
	color: hsl(var(--foreground)); text-wrap: balance;
	/* Hold TWO lines from first paint. The generated greeting is usually a
	   two-line sentence ("Morning, Peter — hope you slept well"), so reserving
	   a single line still let it push the hero down when it landed. */
	min-height: calc(clamp(26px, 4.4vw, 40px) * 1.1 * 2);
	display: grid; place-items: center;
}
.ph__read {
	margin: 0; max-width: 34ch;
	font-family: var(--body-font, inherit);
	font-size: clamp(15px, 2.2vw, 18px); line-height: 1.5;
	color: hsl(var(--muted-foreground)); text-wrap: balance;
	/* Two lines reserved — the read is 1–2 lines, so it never reflows the page
	   when the longer sentence settles. */
	min-height: calc(clamp(15px, 2.2vw, 18px) * 1.5 * 2);
	display: grid; place-items: center;
}
.ph__read--soft { font-style: italic; }

/* Cross-fade in place: both nodes share the same grid cell, so the leaving
   line never collapses the block's height (the old `mode="out-in"` guaranteed
   a 0.5s zero-height gap that shoved everything below it up and back down). */
.ph__greeting > *, .ph__read > * { grid-area: 1 / 1; }
.ph-fade-enter-active, .ph-fade-leave-active { transition: opacity 0.45s ease; }
.ph-fade-enter-from, .ph-fade-leave-to { opacity: 0; }

/* ── Loading placeholders ─────────────────────────────────────────────────── */
.ph__sk {
	display: block; border-radius: 999px;
	background: hsl(var(--foreground) / 0.07);
	animation: ph-sk-pulse 1.6s ease-in-out infinite;
}
.ph__sk--greeting { width: min(320px, 62vw); height: calc(clamp(26px, 4.4vw, 40px) * 0.62); }

/* "Thinking…" — held in the greeting's own type while the personalized
   greeting is being written, so the good line arrives once instead of
   replacing a basic one. */
.ph__thinking {
	display: inline-flex; align-items: baseline; gap: 0.3em;
	color: hsl(var(--muted-foreground) / 0.75);
}
.ph__thinking-word { animation: ph-sk-pulse 2s ease-in-out infinite; }
.ph__dots { display: inline-flex; align-items: baseline; gap: 0.18em; }
.ph__dots i {
	width: 0.14em; height: 0.14em; min-width: 3px; min-height: 3px;
	border-radius: 50%; background: currentColor; display: inline-block;
	animation: ph-dot 1.4s ease-in-out infinite;
}
.ph__dots i:nth-child(2) { animation-delay: 0.18s; }
.ph__dots i:nth-child(3) { animation-delay: 0.36s; }
@keyframes ph-dot {
	0%, 100% { opacity: 0.25; transform: translateY(0); }
	50% { opacity: 1; transform: translateY(-0.12em); }
}
@media (prefers-reduced-motion: reduce) {
	.ph__thinking-word, .ph__dots i { animation: none; }
}
.ph__sk--read { width: min(280px, 56vw); height: 12px; }
.ph__sk--eyebrow { width: 76px; height: 8px; }
.ph__sk--title { width: 62%; height: 13px; }
.ph__sk--desc { width: 84%; height: 11px; }
@keyframes ph-sk-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }

/* The "one thing" slot reserves the card's height while the engine decides. */
.ph__top-slot {
	/* 96px = the real card's height. The skeleton and the card must measure the
	   same, or the swap nudges the page by the difference. */
	width: 100%; max-width: 460px; margin-top: 6px; min-height: 96px;
	/* Stack the card and its placeholder in one cell so the swap cross-fades
	   in place instead of collapsing the slot. */
	display: grid;
}
.ph__top-slot > * { grid-area: 1 / 1; }
/* The card settles in rather than snapping — it's the one thing, it should
   arrive with a little intent. */
.ph-rise-enter-active { transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.36, 0.66, 0.04, 1); }
.ph-rise-leave-active { transition: opacity 0.25s ease; }
.ph-rise-enter-from { opacity: 0; transform: translateY(6px); }
.ph-rise-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
	.ph-rise-enter-active, .ph-rise-leave-active { transition: opacity 0.2s ease; }
	.ph-rise-enter-from { transform: none; }
}
/* The slot owns the offset now — drop the card's own margin so it isn't doubled. */
.ph__top-slot .ph__top { margin-top: 0; }
.ph__top--loading { cursor: default; pointer-events: none; align-content: center; }
.ph__top--loading:hover { transform: none; box-shadow: none; }

.ph__top {
	position: relative; width: 100%; max-width: 460px; margin-top: 6px;
	display: grid; gap: 3px; text-align: left;
	padding: 15px 44px 15px 18px; border-radius: 18px;
	border: 1px solid hsl(var(--border)); background: hsl(var(--card));
	box-shadow: 0 8px 30px -18px hsl(var(--foreground) / 0.25);
	cursor: pointer; transition: transform 0.15s ease, box-shadow 0.2s ease;
}
.ph__top:hover { transform: translateY(-1px); box-shadow: 0 12px 34px -16px hsl(var(--foreground) / 0.3); }
.ph__top-eyebrow { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: hsl(var(--primary)); }
/* Single-line clamps keep the card a FIXED height whatever the action is, so
   the reserved slot always matches and a long title can't reflow the hero. */
.ph__top-title {
	font-size: 15px; font-weight: 600; color: hsl(var(--foreground));
	overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ph__top-desc {
	font-size: 13px; color: hsl(var(--muted-foreground));
	overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ph__top-arrow { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); color: hsl(var(--muted-foreground)); }

/* ── Conversation ─────────────────────────────────────────────────────────── */
.ph__conv-head {
	width: 100%; max-width: 560px;
	display: flex; align-items: center; justify-content: space-between;
}
.ph__conv-id { display: inline-flex; align-items: center; gap: 8px; }
.ph__conv-name { font-family: var(--title-font, inherit); font-size: 14px; font-weight: 600; color: hsl(var(--foreground)); }
.ph__conv-expand {
	display: inline-flex; align-items: center; gap: 3px;
	font-size: 12px; color: hsl(var(--muted-foreground)); background: none; border: 0; cursor: pointer;
	transition: color 0.2s ease;
}
.ph__conv-expand:hover { color: hsl(var(--foreground)); }

.ph__thread {
	width: 100%; max-width: 560px; text-align: left;
	max-height: min(52vh, 460px); overflow-y: auto;
	display: flex; flex-direction: column; gap: 10px;
	padding: 4px 2px;
	scroll-behavior: smooth;
}
.ph__msg { display: flex; }
.ph__msg--user { justify-content: flex-end; }
.ph__msg--earnest { justify-content: flex-start; }
.ph__bubble {
	max-width: 86%; padding: 9px 13px; border-radius: 16px;
	font-family: var(--body-font, inherit); font-size: 14px; line-height: 1.55;
	white-space: pre-wrap; word-break: break-word;
}
.ph__bubble--user {
	background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
	border-bottom-right-radius: 6px;
}
.ph__bubble--earnest {
	background: hsl(var(--muted)); color: hsl(var(--foreground));
	border-bottom-left-radius: 6px;
}
.ph__bubble--earnest :deep(p) { margin: 0 0 6px; }
.ph__bubble--earnest :deep(p:last-child) { margin-bottom: 0; }
.ph__bubble--earnest :deep(li) { margin-left: 16px; list-style: disc; }
.ph__bubble--earnest :deep(code) { background: hsl(var(--background)); padding: 1px 5px; border-radius: 5px; font-size: 12.5px; }
.ph__bubble--earnest :deep(.ph__src) {
	display: inline-flex; align-items: center; padding: 0 7px; margin: 0 2px;
	border-radius: 999px; background: hsl(var(--primary) / 0.12); color: hsl(var(--primary));
	font-size: 11px; font-weight: 500; white-space: nowrap;
}
.ph__typing { display: inline-flex; gap: 3px; align-items: center; height: 1.2em; }
.ph__typing span {
	width: 5px; height: 5px; border-radius: 50%; background: hsl(var(--muted-foreground) / 0.6);
	animation: ph-typing 1.2s ease-in-out infinite;
}
.ph__typing span:nth-child(2) { animation-delay: 0.15s; }
.ph__typing span:nth-child(3) { animation-delay: 0.3s; }
@keyframes ph-typing { 0%, 60%, 100% { opacity: 0.3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }

.ph__composer {
	width: 100%; max-width: 520px; margin-top: 10px;
	display: flex; align-items: flex-end; gap: 8px;
	padding: 8px 8px 8px 16px; border-radius: 999px;
	border: 1px solid hsl(var(--border)); background: hsl(var(--background));
	box-shadow: 0 10px 34px -20px hsl(var(--foreground) / 0.3);
}
.ph__input {
	flex: 1; resize: none; border: 0; background: transparent; outline: none;
	font: inherit; font-size: 15px; line-height: 1.5; padding: 8px 0; max-height: 120px;
	color: hsl(var(--foreground));
}
.ph__input::placeholder { color: hsl(var(--muted-foreground) / 0.7); }
.ph__send {
	flex: none; width: 38px; height: 38px; border-radius: 50%; border: 0; cursor: pointer;
	display: grid; place-items: center; color: hsl(var(--primary-foreground)); background: hsl(var(--primary));
	transition: transform 0.15s ease, opacity 0.2s ease;
}
.ph__send:hover:not(:disabled) { transform: scale(1.06); }
.ph__send:disabled { opacity: 0.4; cursor: default; }

/* Quiet invitation to resume a recent thread — a text-link, not a loud button,
   so the calm greeting still leads. */
.ph__resume {
	display: inline-flex; align-items: center; gap: 5px;
	margin-top: 2px; padding: 4px 6px; border: 0; background: none; cursor: pointer;
	font: inherit; font-size: 13px; color: hsl(var(--primary));
	opacity: 0.85; transition: opacity 0.2s ease, gap 0.2s ease;
}
.ph__resume:hover { opacity: 1; gap: 8px; }

.ph__openers { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.ph__opener {
	padding: 7px 14px; border-radius: 999px; border: 1px solid hsl(var(--border));
	background: hsl(var(--card)); color: hsl(var(--muted-foreground));
	font: inherit; font-size: 13px; cursor: pointer;
	transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}
.ph__opener:hover { background: hsl(var(--primary) / 0.06); border-color: hsl(var(--primary) / 0.35); color: hsl(var(--foreground)); }
/* The encouragement opener reads as the warm, inviting one — filled rather than
   outline, so it's distinct from the task prompts without introducing a new
   colour (stays within --primary, mono-palette safe). */
.ph__opener--lift {
	display: inline-flex; align-items: center; gap: 6px;
	background: hsl(var(--primary) / 0.12); border-color: hsl(var(--primary) / 0.30);
	color: hsl(var(--foreground));
}
.ph__opener--lift:hover { background: hsl(var(--primary) / 0.18); border-color: hsl(var(--primary) / 0.45); }
.ph__opener-spark { width: 13px; height: 13px; color: hsl(var(--primary)); }

.ph__reveal {
	margin-top: 16px; display: inline-flex; align-items: center; gap: 4px;
	padding: 6px 14px; border-radius: 999px; border: 0; background: transparent;
	color: hsl(var(--muted-foreground)); font: inherit; font-size: 12px;
	letter-spacing: 0.05em; text-transform: uppercase; cursor: pointer;
	transition: color 0.2s ease;
}
.ph__reveal:hover { color: hsl(var(--foreground)); }

@media (prefers-reduced-motion: reduce) {
	.ph__glow { animation: none; }
	.ph__typing span { animation: none; }
}
</style>
