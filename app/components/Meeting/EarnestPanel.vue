<script setup lang="ts">
/**
 * MeetingEarnestPanel — Earnest, INLINE, beside a live call.
 *
 * When the docked panel was retired, "Ask Earnest" everywhere became the
 * full-screen Focus takeover — which would cover the video. A meeting needs
 * Earnest side-by-side, so this is a bespoke NON-MODAL side rail: the same real
 * chat engine (useContextualChat), scoped to this video_meeting, sliding in over
 * the right edge and leaving the call visible on the left.
 *
 * Streaming note (the documented gotcha): message objects are mutated in place
 * (raw) and don't trigger reactivity on their own, so while a bubble streams we
 * read the reactive `streamingContent` ref — exactly as PresenceHome / the old
 * dock do. On done it clears and the settled `m.content` shows.
 */
const props = withDefaults(defineProps<{
	open: boolean;
	meetingId: string;
	title?: string;
}>(), { title: '' });
const emit = defineEmits<{ (e: 'close'): void }>();

const {
	messages,
	isStreaming,
	isSending,
	streamingContent,
	sendMessage,
	setEntity,
} = useContextualChat();

const input = ref('');
const threadEl = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLTextAreaElement | null>(null);

const suggestions = [
	"Summarize what we've covered",
	'Draft action items',
	'What should we decide next?',
	'Capture a follow-up',
];

const hasConversation = computed(() => messages.value.length > 0 || isStreaming.value);

// Scope the shared chat bucket to this meeting so it's the same Earnest as
// everywhere else, focused on this call.
function scopeToMeeting() {
	if (props.meetingId) setEntity('video_meeting', String(props.meetingId));
}
onMounted(scopeToMeeting);
watch(() => props.meetingId, scopeToMeeting);

// Focus the composer when the rail opens.
watch(() => props.open, (open) => {
	if (open) nextTick(() => inputEl.value?.focus());
});

function autogrow() {
	const el = inputEl.value;
	if (!el) return;
	el.style.height = 'auto';
	el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
}
function send(text?: string) {
	const t = (text ?? input.value).trim();
	if (!t || isSending.value) return;
	input.value = '';
	nextTick(autogrow);
	const focus = props.title ? `this live meeting — ${props.title}` : 'this live meeting';
	sendMessage(t, { routeFocus: focus });
}
function onKeydown(e: KeyboardEvent) {
	if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
}

function scrollThread() {
	nextTick(() => { const el = threadEl.value; if (el) el.scrollTop = el.scrollHeight; });
}
watch(() => [messages.value.length, isStreaming.value], scrollThread);

// Lightweight markdown — mirrors the other Earnest renderers.
function renderMarkdown(text: string): string {
	if (!text) return '';
	let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
	html = html.replace(/^[-*]\s(.+)$/gm, '<li class="mep-li">$1</li>');
	html = html.replace(/\n\n/g, '</p><p>');
	html = html.replace(/\n/g, '<br>');
	return `<p>${html}</p>`;
}
</script>

<template>
	<div class="mep" :class="{ 'mep--open': open }" role="dialog" aria-label="Earnest — meeting assistant" :aria-hidden="!open">
		<header class="mep__head">
			<div class="mep__brand">
				<EarnestIcon class="mep__mark" />
				<div class="mep__brandtext">
					<p class="mep__name">Earnest</p>
					<p class="mep__sub">In this meeting</p>
				</div>
			</div>
			<button type="button" class="mep__close" aria-label="Close Earnest" @click="emit('close')">
				<Icon name="lucide:x" class="w-4 h-4" />
			</button>
		</header>

		<div ref="threadEl" class="mep__thread" role="log" aria-live="polite" aria-relevant="additions text">
			<div v-if="!hasConversation" class="mep__empty">
				<p class="mep__empty-line">I'm following along. Ask me to catch the thread up, draft the follow-ups, or think through the next call.</p>
				<div class="mep__chips">
					<button v-for="s in suggestions" :key="s" type="button" class="mep__chip" @click="send(s)">{{ s }}</button>
				</div>
			</div>
			<template v-else>
				<div
					v-for="m in messages"
					:key="m.key || m.id"
					class="mep__msg"
					:class="m.role === 'user' ? 'mep__msg--me' : 'mep__msg--earnest'"
				>
					<div v-if="m.role === 'user'" class="mep__bubble mep__bubble--me">{{ m.content }}</div>
					<div v-else class="mep__bubble mep__bubble--earnest">
						<span v-if="m.streaming && !streamingContent" class="mep__typing" aria-label="Thinking"><span /><span /><span /></span>
						<span v-else v-html="renderMarkdown(m.streaming ? streamingContent : m.content)" />
					</div>
				</div>
			</template>
		</div>

		<div class="mep__composer">
			<textarea
				ref="inputEl"
				v-model="input"
				rows="1"
				class="mep__input"
				placeholder="Ask Earnest about this meeting…"
				@input="autogrow"
				@keydown="onKeydown"
			/>
			<button
				type="button"
				class="mep__send"
				:disabled="!input.trim() || isSending"
				aria-label="Send"
				@click="send()"
			>
				<Icon name="lucide:arrow-up" class="w-4 h-4" />
			</button>
		</div>
	</div>
</template>

<style scoped>
/* A dark glass rail that belongs to the call's chrome (matches the meeting's
   black/60 backdrop-blur pills). Sits BELOW the top-right toolbar (z-30) so the
   Record / Transcribe / Ask / End pills stay clickable on top, with internal
   top padding to clear them. */
.mep {
	position: fixed; top: 0; right: 0; bottom: 0; z-index: 25;
	width: min(360px, 100vw);
	display: flex; flex-direction: column;
	padding-top: 84px;
	background: rgba(10, 14, 20, 0.82);
	backdrop-filter: blur(22px);
	border-left: 1px solid rgba(255, 255, 255, 0.1);
	color: #eef2f8;
	box-shadow: -24px 0 60px -30px rgba(0, 0, 0, 0.8);
	transform: translateX(100%);
	transition: transform 0.42s cubic-bezier(0.36, 0.66, 0.04, 1);
	pointer-events: auto;
}
.mep--open { transform: translateX(0); }
.mep:not(.mep--open) { pointer-events: none; }

.mep__head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 14px 12px; }
.mep__brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.mep__mark { width: 22px; height: 22px; color: #eef2f8; flex-shrink: 0; }
.mep__brandtext { min-width: 0; }
.mep__name { margin: 0; font-size: 14px; font-weight: 600; line-height: 1.1; }
.mep__sub { margin: 1px 0 0; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: rgba(238, 242, 248, .5); }
.mep__close { width: 30px; height: 30px; border-radius: 50%; border: 0; background: transparent; color: rgba(238, 242, 248, .7); cursor: pointer; display: grid; place-items: center; transition: background .2s, color .2s; }
.mep__close:hover { background: rgba(255, 255, 255, .1); color: #eef2f8; }

.mep__thread { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 6px 14px; display: flex; flex-direction: column; gap: 12px; scrollbar-width: none; }
.mep__thread::-webkit-scrollbar { display: none; }

.mep__empty { margin: auto 0; padding: 8px 2px; }
.mep__empty-line { margin: 0 0 16px; font-size: 14px; line-height: 1.55; color: rgba(238, 242, 248, .82); text-wrap: balance; }
.mep__chips { display: flex; flex-direction: column; gap: 8px; }
.mep__chip { text-align: left; padding: 9px 13px; border-radius: 13px; border: 1px solid rgba(255, 255, 255, .12); background: rgba(255, 255, 255, .05); color: rgba(238, 242, 248, .9); font: inherit; font-size: 13px; cursor: pointer; transition: background .2s, border-color .2s; }
.mep__chip:hover { background: rgba(255, 255, 255, .1); border-color: rgba(255, 255, 255, .22); }

.mep__msg { max-width: 92%; }
.mep__msg--me { align-self: flex-end; }
.mep__msg--earnest { align-self: flex-start; }
.mep__bubble { font-size: 14px; line-height: 1.55; }
.mep__bubble--me { background: rgba(238, 242, 248, .94); color: #0a0e14; border-radius: 16px 16px 5px 16px; padding: 9px 13px; white-space: pre-wrap; }
.mep__bubble--earnest { color: rgba(238, 242, 248, .92); }
.mep__bubble--earnest :deep(p) { margin: .25rem 0; }
.mep__bubble--earnest :deep(strong) { color: #fff; font-weight: 600; }
.mep__bubble--earnest :deep(.mep-li) { margin: .15rem 0 .15rem 1rem; list-style: disc; }

.mep__typing { display: inline-flex; gap: 4px; align-items: center; height: 1.4rem; }
.mep__typing span { width: 6px; height: 6px; border-radius: 50%; background: rgba(238, 242, 248, .65); animation: mep-bounce 1.2s ease-in-out infinite; }
.mep__typing span:nth-child(2) { animation-delay: .15s; }
.mep__typing span:nth-child(3) { animation-delay: .3s; }
@keyframes mep-bounce { 0%,80%,100% { transform: translateY(0); opacity: .5; } 40% { transform: translateY(-4px); opacity: 1; } }

.mep__composer { display: flex; align-items: flex-end; gap: 8px; padding: 10px 14px calc(14px + env(safe-area-inset-bottom)); border-top: 1px solid rgba(255, 255, 255, .08); }
.mep__input { flex: 1; resize: none; border: 0; border-radius: 14px; background: rgba(255, 255, 255, .07); color: #eef2f8; font: inherit; font-size: 14px; line-height: 1.45; padding: 9px 12px; max-height: 120px; outline: none; }
.mep__input::placeholder { color: rgba(238, 242, 248, .42); }
.mep__input:focus { background: rgba(255, 255, 255, .1); }
.mep__send { width: 38px; height: 38px; flex: none; border-radius: 50%; border: 0; cursor: pointer; display: grid; place-items: center; color: #0a0e14; background: #eef2f8; transition: transform .15s, opacity .2s; }
.mep__send:hover:not(:disabled) { transform: scale(1.05); }
.mep__send:disabled { opacity: .4; cursor: default; }

@media (prefers-reduced-motion: reduce) {
	.mep { transition: none; }
	.mep__typing span { animation: none; }
}
</style>
