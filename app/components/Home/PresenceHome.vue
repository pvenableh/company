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
 */
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
	isLoadingHistory,
	sendMessage,
	setRoute,
} = useContextualChat();
const { openEarnestPanel } = useEarnestPanel();
const { track } = useProductEvent();

// Calm first, always. The home ALWAYS opens on the calm greeting, even when a
// prior "route:home" thread hydrates in the background (that thread is kept so
// the conversation stays continuous and Expand can still show it in full).
// `conversing` is gated on engagement THIS session — a fresh send or an explicit
// "Continue where you left off" — never on the mere presence of yesterday's
// transcript. That's what keeps the first impression calm on the next login.
//
//   baseline    — how many messages were already loaded when we landed (the
//                 prior thread); these stay folded away unless resumed.
//   resumed     — the user tapped "Continue where you left off" → show it all.
//   priorRecent — was that prior thread recent enough to bother offering?
const baseline = ref(0);
const priorRecent = ref(false);
const resumed = ref(false);
// Reactive on purpose: `startedThisSession` short-circuits on this, so if it
// weren't reactive the computed would track no deps and never re-evaluate.
const captured = ref(false);

// A prior home thread counts as "recent" (worth a Continue chip) while it's
// younger than a learned window (default 18h — a working day plus an overnight
// return — but it widens when the user resumes and narrows when they ignore it;
// see useHomeContinueWindow). Older threads stay reachable via Expand.
const { windowMs, recordResumed, recordIgnored } = useHomeContinueWindow();
function isRecent(iso?: string): boolean {
	if (!iso) return false;
	const t = new Date(iso).getTime();
	return Number.isFinite(t) && Date.now() - t < windowMs.value;
}
function captureBaseline() {
	if (captured.value) return;
	const msgs = messages.value;
	baseline.value = msgs.length;
	priorRecent.value = isRecent(msgs[msgs.length - 1]?.date_created);
	captured.value = true;
}

function hydrateHome() {
	setRoute('dashboard', 'home');
	// If nothing needs hydrating (already loaded, or a clean slate) the loading
	// flag never toggles — capture the baseline right away. Otherwise the watcher
	// below captures it the instant hydration settles.
	nextTick(() => { if (!isLoadingHistory.value) captureBaseline(); });
}
onMounted(hydrateHome);
onActivated(hydrateHome);

// Snapshot the prior thread the moment hydration settles (loading true→false).
watch(isLoadingHistory, (loading, was) => {
	if (was && !loading) captureBaseline();
});

// A fresh exchange this session = anything appended past the hydrated baseline.
// Read `len` unconditionally so the computed always tracks message growth, even
// before the baseline is captured (a bare `captured.value && …` would short-
// circuit and register no dependency on the message count).
const startedThisSession = computed(() => {
	const len = messages.value.length;
	return captured.value && len > baseline.value;
});
const conversing = computed(() => resumed.value || startedThisSession.value);

// What the inline thread renders: the whole thread once resumed, otherwise only
// this session's fresh exchange (the prior transcript stays folded away — the
// LLM still receives the full history server-side, so Earnest keeps its memory).
const visibleMessages = computed(() =>
	resumed.value ? messages.value : messages.value.slice(baseline.value),
);

// Offer to bring back the prior thread only while calm and only if it's recent.
const canResume = computed(() => !conversing.value && priorRecent.value && baseline.value > 0);
function resumeThread() {
	resumed.value = true;
	recordResumed(); // they picked the thread back up — worth offering for longer
	track('home.continue_resumed', { source: 'presence-home' });
	scrollThread();
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
// Show the deeper read once it lands, else the instant deterministic read.
const shownRead = computed(() => deeperRead.value || props.read || '');

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
			<template v-if="!conversing">
				<div class="ph__mark">
					<EarnestPresenceMark :height="26" class="text-foreground/85" />
				</div>

				<h1 class="ph__greeting">{{ greeting }}</h1>
				<Transition name="ph-fade" mode="out-in">
					<p v-if="shownRead" :key="shownRead" class="ph__read">{{ shownRead }}</p>
					<p v-else-if="subtitle" class="ph__read ph__read--soft">{{ subtitle }}</p>
				</Transition>

				<!-- the single next move -->
				<button v-if="topAction" type="button" class="ph__top" @click="emit('openTop')">
					<span class="ph__top-eyebrow">The one thing</span>
					<span class="ph__top-title">{{ topAction.title }}</span>
					<span v-if="topAction.description" class="ph__top-desc">{{ topAction.description }}</span>
					<Icon name="lucide:arrow-right" class="ph__top-arrow w-4 h-4" />
				</button>
			</template>

			<!-- ── CONVERSING: slim header + in-place thread ─────────────────── -->
			<template v-else>
				<div class="ph__conv-head">
					<div class="ph__conv-id">
						<EarnestPresenceMark :height="18" class="text-foreground/80" />
						<span class="ph__conv-name">Earnest</span>
					</div>
					<button type="button" class="ph__conv-expand" title="Open in the panel" @click="openEarnestPanel()">
						Expand <Icon name="lucide:arrow-up-right" class="w-3.5 h-3.5" />
					</button>
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
							<span v-if="!m.content && m.streaming" class="ph__typing" aria-label="Thinking"><span></span><span></span><span></span></span>
							<span v-else v-html="renderMarkdown(m.content)" />
						</div>
					</div>
				</div>
			</template>

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
				<button v-for="o in openers" :key="o" type="button" class="ph__opener" @click="send(o)">{{ o }}</button>
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
}
.ph__read {
	margin: 0; max-width: 34ch;
	font-family: var(--body-font, inherit);
	font-size: clamp(15px, 2.2vw, 18px); line-height: 1.5;
	color: hsl(var(--muted-foreground)); text-wrap: balance;
}
.ph__read--soft { font-style: italic; }

.ph-fade-enter-active, .ph-fade-leave-active { transition: opacity 0.5s ease; }
.ph-fade-enter-from, .ph-fade-leave-to { opacity: 0; }

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
.ph__top-title { font-size: 15px; font-weight: 600; color: hsl(var(--foreground)); }
.ph__top-desc { font-size: 13px; color: hsl(var(--muted-foreground)); }
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
