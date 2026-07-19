<script setup lang="ts">
/**
 * CoachingTakeover — Earnest's "Focus mode": a full-screen presence, not a panel.
 *
 * This is the first surface to mount the shared presence foundation
 * (useEarnestPresence + <EarnestAura>): a living aura whose COLOUR IS EARNEST'S
 * EMOTIONAL STATE. It reflects when you're quiet, leans down and listens when
 * you type, gathers to a warm amber spark while it thinks, and blooms mint-gold
 * on earned progress. The five moods (reflect · present · listen · think · warm)
 * and all their GSAP motion live in the shared layer now — this file only reads
 * the moment and hands the aura a mood.
 *
 * Hybrid A→B: it starts as the Companion (one calm thought at a time) and
 * re-forms into the Working Table (Earnest to one side, the project's real tasks
 * flowing beside the conversation) the moment the talk turns to doing — or the
 * user asks for it.
 *
 * Reuses the real chat engine (useContextualChat, scoped + persisted) and real
 * task data (the `tasks` collection). Opened via useCoachingMode(); mounted once
 * in app.vue. Mirrors the Director's Office overlay (teleport + Esc-to-close).
 */
import { nextTick } from 'vue';
import { useEarnestPresence, EARNEST_MOOD_TOKENS, type EarnestMood } from '~/composables/useEarnestPresence';

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

// The shared presence brain — owns the mood + the energy engine. <EarnestAura>
// (mounted below) is handed this exact instance, so bumps + mood changes here
// drive the aura directly.
const presence = useEarnestPresence({ initial: 'reflect' });
const reduceMotion = presence.reduceMotion;

// Focus has three faces: Companion (reflect together), the Working Table (do),
// and the Mirror (learn — read-only patterns). Declared up here, above the mood
// machine, because the mood reads it (mirror = a calm, inward 'reflect').
type FocusMode = 'companion' | 'working' | 'mirror';
const mode = ref<FocusMode>('companion');

// ── Enter / leave (compositor-driven, per Motion stack policy) ───────────────
const mounted = ref(false);
const visible = ref(false);
let leaveTimer: ReturnType<typeof setTimeout> | null = null;
const ANIM_MS = 460;

watch(isOpen, (open) => {
	if (open) {
		if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
		mounted.value = true;
		syncScope();
		loadTasks();
		setTimeout(() => { visible.value = true; }, 16);
		nextTick(scrollToBottom);
	} else {
		visible.value = false;
		leaveTimer = setTimeout(() => { mounted.value = false; }, ANIM_MS);
	}
});
// Note: no { immediate: true } — isOpen starts false, and running the handler
// during setup would hit not-yet-initialized refs/consts below (TDZ).

const overlayStyle = computed(() => ({
	opacity: visible.value ? '1' : '0',
	transform: visible.value ? 'scale(1)' : 'scale(1.05)',
	transition: `opacity ${ANIM_MS}ms cubic-bezier(0.36,0.66,0.04,1), transform ${ANIM_MS}ms cubic-bezier(0.36,0.66,0.04,1)`,
}));

// ── Scope → chat context ─────────────────────────────────────────────────────
function syncScope() {
	const s = scope.value;
	if (s?.mode === 'entity' && s.entityType && s.entityId) {
		setEntity(s.entityType, s.entityId);
	} else {
		setRoute('coaching', 'coaching');
	}
}
watch(scope, () => { if (isOpen.value) { syncScope(); loadTasks(); } });

const headerLabel = computed(() => {
	const s = scope.value;
	if (s?.mode === 'entity' && s.label) return s.label;
	return 'Focus mode';
});

// ── Emotional state machine ──────────────────────────────────────────────────
// mood is a reading of the moment; the shared aura turns it into light.
const typing = ref(false);
const warmFlash = ref(false);
let typingTimer: ReturnType<typeof setTimeout> | null = null;
let warmTimer: ReturnType<typeof setTimeout> | null = null;

const hasConversation = computed(() => messages.value.length > 0 || isStreaming.value);

const mood = computed<EarnestMood>(() => {
	if (mode.value === 'mirror') return 'reflect'; // the Mirror is a calm, inward look
	if (isStreaming.value) return 'think';
	if (warmFlash.value) return 'warm';
	if (typing.value) return 'listen';
	if (!hasConversation.value) return 'reflect';
	return 'present';
});
// Drive the shared brain; <EarnestAura> tweens colour + motion in response.
watch(mood, (m) => presence.setMood(m), { immediate: true });

// The composer accent echoes the mood (a quiet, CSS-eased colour, not the live
// GSAP-tweened field — just enough that the send button belongs to the moment).
const accent = computed(() => EARNEST_MOOD_TOKENS[mood.value]);

// When a reply finishes streaming, bloom warm for a beat — encouragement, earned.
watch(isStreaming, (now, was) => {
	if (was && !now) {
		warmFlash.value = true;
		if (warmTimer) clearTimeout(warmTimer);
		warmTimer = setTimeout(() => { warmFlash.value = false; }, 2600);
	}
});

// ── Mode switching (the `mode` ref lives up top, for the mood machine) ────────
function setMode(m: FocusMode) { mode.value = m; nextTick(scrollToBottom); }

// A Mirror insight's lever → step out of the Mirror and take it up in the chat.
function onMirrorLever(prompt: string) { setMode('companion'); send(prompt); }

// The conversation turning to "doing" pulls us into the Working Table.
const WORK_INTENT = /\b(plan|steps?|break (?:it |this )?down|to-?dos?|task|checklist|get (?:it |this )?done|work through|next move|prioriti[sz]e|organi[sz]e)\b/i;

// ── Real project tasks (Working mode) ────────────────────────────────────────
const taskItems = useDirectusItems('tasks');
const tasks = ref<any[]>([]);
const tasksLoading = ref(false);

const workingProjectId = computed<string | null>(() => {
	const s = scope.value;
	if (s?.mode === 'entity' && s.entityType && /project/i.test(s.entityType) && s.entityId) return String(s.entityId);
	return null;
});
const canWork = computed(() => !!workingProjectId.value);
const openTaskCount = computed(() => tasks.value.filter((t) => t.status !== 'completed').length);

async function loadTasks() {
	const pid = workingProjectId.value;
	if (!pid) { tasks.value = []; return; }
	tasksLoading.value = true;
	try {
		tasks.value = (await taskItems.list({
			fields: ['id', 'title', 'status', 'due_date', 'sort', 'date_created'],
			filter: { project_id: { _eq: pid } },
			sort: ['status', 'sort', '-date_created'],
			limit: 50,
		})) as any[];
	} catch {
		tasks.value = [];
	} finally {
		tasksLoading.value = false;
	}
}

async function toggleTask(task: any) {
	const nowDone = task.status !== 'completed';
	task.status = nowDone ? 'completed' : 'new';
	if (nowDone) { presence.bump(0.5); flashWarm(); }
	try {
		await taskItems.update(String(task.id), {
			status: task.status,
			date_completed: nowDone ? new Date().toISOString() : null,
		});
	} catch {
		task.status = nowDone ? 'new' : 'completed'; // rollback
	}
}

function flashWarm() {
	warmFlash.value = true;
	if (warmTimer) clearTimeout(warmTimer);
	warmTimer = setTimeout(() => { warmFlash.value = false; }, 2400);
}

// Add a step inline — a real task, so the stream stays honest.
const newStep = ref('');
const addingStep = ref(false);
async function addStep() {
	const title = newStep.value.trim();
	const pid = workingProjectId.value;
	if (!title || !pid || addingStep.value) return;
	addingStep.value = true;
	try {
		const created = (await taskItems.create({ title, status: 'new', project_id: pid })) as any;
		if (created?.id) tasks.value = [...tasks.value, created];
		newStep.value = '';
		presence.bump(0.35);
	} catch { /* toast handled globally */ }
	finally { addingStep.value = false; }
}

// ── Greeting + suggestions (before the first exchange) ───────────────────────
const greeting = computed(() => {
	const s = scope.value;
	if (s?.mode === 'entity' && s.label) {
		return `Let's give ${s.label} the care it deserves.\nWhat's the honest state of it right now?`;
	}
	return `I'm here. No rush.\nWhat's the honest version of how things are right now?`;
});
const suggestions = computed(() => {
	if (canWork.value) {
		return ['Break this into honest steps', 'What should I do first?', "What am I avoiding?", 'Draft my next move'];
	}
	if (scope.value?.mode === 'entity') {
		return ['What matters most here?', 'Help me find the next true step', "What's weighing on this?", 'Draft my next move'];
	}
	return ["I'm stretched thin — where do I start?", 'Help me plan my next hour', 'What can wait?', 'What did I do well today?'];
});

// ── Send ─────────────────────────────────────────────────────────────────────
const input = ref('');
const scroller = ref<HTMLElement | null>(null);
function scrollToBottom() { const el = scroller.value; if (el) el.scrollTop = el.scrollHeight; }
watch([messages, streamingContent], () => nextTick(scrollToBottom), { deep: true });

async function send(text?: string) {
	const content = (text ?? input.value).trim();
	if (!content || isStreaming.value) return;
	input.value = '';
	autoResize();
	presence.bump(0.6);
	// Speaking from the Mirror returns you to the conversation.
	if (mode.value === 'mirror') setMode('companion');
	// Talk turned to doing → re-form into the Working Table (if we can).
	if (canWork.value && mode.value === 'companion' && WORK_INTENT.test(content)) setMode('working');
	const s = scope.value;
	const routeFocus = s?.mode === 'entity' && s.label
		? `${s.label} — in Focus mode, one honest thing at a time`
		: 'their work in Focus mode — helping them find the next true step';
	try { await sendMessage(content, { coaching: true, routeFocus }); } catch { /* engine surfaces errors */ }
}

// ── Input behaviour ──────────────────────────────────────────────────────────
const inputEl = ref<HTMLTextAreaElement | null>(null);
function autoResize() {
	const el = inputEl.value;
	if (!el) return;
	el.style.height = 'auto';
	el.style.height = Math.min(140, el.scrollHeight) + 'px';
}
function onInput() {
	autoResize();
	presence.bump(0.22);
	markTyping();
}
function markTyping() {
	typing.value = true;
	if (typingTimer) clearTimeout(typingTimer);
	typingTimer = setTimeout(() => { typing.value = false; }, 1400);
}
function onEnter(e: KeyboardEvent) {
	if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
}

// ── Esc to close ─────────────────────────────────────────────────────────────
function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape' && !isStreaming.value) close(); }
watch(mounted, (m) => {
	if (!import.meta.client) return;
	if (m) window.addEventListener('keydown', onKeydown);
	else window.removeEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
	if (import.meta.client) window.removeEventListener('keydown', onKeydown);
	if (typingTimer) clearTimeout(typingTimer);
	if (warmTimer) clearTimeout(warmTimer);
});

// Lightweight markdown (mirrors the Earnest panel renderer).
function renderMarkdown(text: string): string {
	if (!text) return '';
	let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
	html = html.replace(/^###?\s(.+)$/gm, '<h4>$1</h4>');
	html = html.replace(/^[-*]\s(.+)$/gm, '<li class="mk-li">$1</li>');
	html = html.replace(/^\d+\.\s(.+)$/gm, '<li class="mk-li mk-oli">$1</li>');
	html = html.replace(/\n\n/g, '</p><p>');
	html = html.replace(/\n/g, '<br>');
	return `<p>${html}</p>`;
}

// Rotating brand mantras — the header line + the aura's drifting reflection.
const MANTRAS = ['Do good work.', 'Know thyself.', 'Honest. Hard. Creative.', 'A trusted partner.'];
const mantraIdx = ref(0);
let mantraTimer: ReturnType<typeof setInterval> | null = null;
watch(mounted, (m) => {
	if (m && !reduceMotion.value && !mantraTimer) {
		mantraTimer = setInterval(() => { mantraIdx.value = (mantraIdx.value + 1) % MANTRAS.length; }, 4800);
	} else if (!m && mantraTimer) {
		clearInterval(mantraTimer); mantraTimer = null;
	}
});

// The presence mark unfurls E → Earnest on open.
const markRef = ref<{ expand: () => void } | null>(null);
</script>

<template>
	<Teleport to="body">
		<div
			v-if="mounted"
			class="coach"
			:data-mood="mood"
			:data-mode="mode"
			:style="{ ...overlayStyle, '--accent1': accent.c1, '--accent2': accent.c2 }"
			role="dialog"
			aria-modal="true"
			aria-label="Earnest focus mode"
		>
			<!-- Shared living aura (owns the orbs, GSAP motion, the 5 moods) -->
			<EarnestAura
				:presence="presence"
				:aside="mode === 'working'"
				:mantras="MANTRAS"
				:show-mantras="hasConversation"
				draggable
			/>

			<div class="coach__inner">
				<!-- Header -->
				<header class="coach__top">
					<div class="coach__brand">
						<EarnestPresenceMark ref="markRef" :height="24" auto-reveal :still="reduceMotion" />
						<span class="coach__focus-tag">Focus</span>
						<p class="coach__mantra">
							<Transition name="mantra" mode="out-in">
								<span :key="mantraIdx">{{ MANTRAS[mantraIdx] }}</span>
							</Transition>
						</p>
					</div>

					<div class="coach__controls">
						<!-- Reflect / Work / Mirror. Work only when scoped to a project;
						     Reflect + Mirror are always there (the Mirror reflects YOU). -->
						<div class="coach__modeswitch" role="group" aria-label="Mode">
							<button type="button" :data-on="mode === 'companion'" @click="setMode('companion')">Reflect</button>
							<button v-if="canWork" type="button" :data-on="mode === 'working'" @click="setMode('working')">
								Work
								<span v-if="openTaskCount" class="coach__badge">{{ openTaskCount }}</span>
							</button>
							<button type="button" :data-on="mode === 'mirror'" @click="setMode('mirror')">Mirror</button>
						</div>
						<button type="button" class="coach__close" aria-label="Leave focus mode" @click="close">
							<Icon name="lucide:x" class="w-5 h-5" />
						</button>
					</div>
				</header>

				<!-- Body: conversation (+ task rail in Working mode), or the Mirror -->
				<div class="coach__body" :class="{ 'coach__body--working': mode === 'working' }">
					<!-- Mirror mode: a read-only reflection of how you actually work.
					     A lever on an insight drops you into the conversation with it. -->
					<EarnestMirror v-if="mode === 'mirror'" :active="mode === 'mirror'" @lever="onMirrorLever" />

					<div v-show="mode !== 'mirror'" ref="scroller" class="coach__convo">
						<div class="coach__convo-wrap">
							<!-- Opening / empty -->
							<div v-if="!hasConversation" class="coach__opener">
								<p class="coach__greeting">{{ greeting }}</p>
								<div class="coach__chips">
									<button v-for="s in suggestions" :key="s" type="button" class="coach__chip" @click="send(s)">{{ s }}</button>
								</div>
							</div>

							<!-- Messages -->
							<template v-for="msg in messages" :key="msg.key || msg.id">
								<div v-if="msg.role === 'user'" class="coach__msg coach__msg--me">
									<div class="coach__bubble">{{ msg.content }}</div>
								</div>
								<div v-else class="coach__msg coach__msg--earnest">
									<span v-if="!msg.content && msg.streaming" class="coach__typing"><span /><span /><span /></span>
									<div v-else class="coach__prose" v-html="renderMarkdown(msg.content)" />
								</div>
							</template>
						</div>
					</div>

					<!-- Task stream (Working mode) -->
					<aside v-if="mode === 'working'" class="coach__tasks">
						<div class="coach__tasks-head">
							<span>The work</span>
							<span v-if="openTaskCount" class="coach__tasks-count">{{ openTaskCount }} open</span>
						</div>
						<div class="coach__tasks-list">
							<div v-if="tasksLoading" class="coach__tasks-empty">Gathering the work…</div>
							<div v-else-if="!tasks.length" class="coach__tasks-empty">No steps yet. Name the first honest one below.</div>
							<button
								v-for="task in tasks"
								:key="task.id"
								type="button"
								class="coach__task"
								:data-done="task.status === 'completed'"
								@click="toggleTask(task)"
							>
								<span class="coach__task-check">
									<Icon name="lucide:check" class="w-3 h-3" />
								</span>
								<span class="coach__task-label">{{ task.title }}</span>
							</button>
						</div>
						<div class="coach__addstep">
							<input
								v-model="newStep"
								type="text"
								placeholder="Add a step…"
								@keydown.enter="addStep"
							/>
							<button type="button" :disabled="!newStep.trim() || addingStep" @click="addStep">
								<Icon name="lucide:plus" class="w-4 h-4" />
							</button>
						</div>
					</aside>
				</div>

				<!-- Composer -->
				<footer class="coach__composer-wrap">
					<div class="coach__composer">
						<textarea
							ref="inputEl"
							v-model="input"
							rows="1"
							placeholder="Tell Earnest what's on your mind…"
							@input="onInput"
							@focus="markTyping"
							@keydown="onEnter"
						/>
						<button
							type="button"
							class="coach__send"
							:data-streaming="isStreaming"
							:disabled="!isStreaming && (!input.trim() || isSending)"
							:aria-label="isStreaming ? 'Stop' : 'Send'"
							@click="isStreaming ? cancelStream() : send()"
						>
							<Icon :name="isStreaming ? 'lucide:square' : 'lucide:arrow-up'" class="w-5 h-5" />
						</button>
					</div>
					<p class="coach__hint">Press <kbd>Esc</kbd> to leave focus mode</p>
				</footer>
			</div>
		</div>
	</Teleport>
</template>

<style scoped>
/* The composer accent echoes the mood — a quiet CSS-eased colour. Registered
   so the gradient interpolates instead of snapping. */
@property --accent1 { syntax: '<color>'; inherits: true; initial-value: #2f8a84; }
@property --accent2 { syntax: '<color>'; inherits: true; initial-value: #356299; }

.coach {
	position: fixed; inset: 0; z-index: 85;
	display: flex; flex-direction: column;
	color: #eef2f8;
	background: radial-gradient(140% 120% at 50% 8%, #0c1424 0%, #070b14 52%, #04060c 100%);
	--accent1: #2f8a84; --accent2: #356299;
	transition: --accent1 1.2s ease, --accent2 1.2s ease;
}

/* Foreground */
.coach__inner { position: relative; z-index: 3; display: flex; flex-direction: column; height: 100%; min-height: 0; }

.coach__top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 18px clamp(16px, 4vw, 40px) 6px; }
.coach__brand { display: flex; align-items: center; gap: 12px; min-width: 0; color: #eef2f8; }
.coach__focus-tag { font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: rgba(238,242,248,.5); padding: 3px 8px; border-radius: 999px; border: 1px solid rgba(238,242,248,.14); }
.coach__mantra { margin: 0; height: 1.25em; overflow: hidden; font-family: 'Iowan Old Style', Palatino, Georgia, serif; font-style: italic; font-size: 12.5px; color: rgba(238,242,248,.4); min-width: 0; }
.mantra-enter-active, .mantra-leave-active { transition: opacity .5s ease, transform .5s ease; }
.mantra-enter-from { opacity: 0; transform: translateY(6px); }
.mantra-leave-to { opacity: 0; transform: translateY(-6px); }

.coach__controls { display: flex; align-items: center; gap: 10px; }
.coach__modeswitch { display: flex; gap: 3px; padding: 4px; border-radius: 999px; border: 1px solid rgba(238,242,248,.12); background: rgba(255,255,255,.04); backdrop-filter: blur(12px); }
.coach__modeswitch button { border: 0; background: transparent; color: rgba(238,242,248,.5); cursor: pointer; font: inherit; font-size: 12px; letter-spacing: .04em; padding: 5px 13px; border-radius: 999px; transition: color .25s, background .25s; display: inline-flex; align-items: center; gap: 6px; }
.coach__modeswitch button[data-on="true"] { color: #eef2f8; background: rgba(255,255,255,.10); }
.coach__badge { display: inline-flex; align-items: center; justify-content: center; min-width: 16px; height: 16px; padding: 0 4px; font-size: 10px; line-height: 1; border-radius: 999px; background: #f3c465; color: #06121f; font-weight: 600; }
.coach__close { width: 38px; height: 38px; border-radius: 50%; border: 0; background: transparent; color: rgba(238,242,248,.7); cursor: pointer; display: grid; place-items: center; transition: background .2s, color .2s; }
.coach__close:hover { background: rgba(255,255,255,.08); color: #eef2f8; }

.coach__body { flex: 1; min-height: 0; display: flex; }
.coach__body--working { gap: clamp(12px, 2vw, 28px); }

.coach__convo { flex: 1; min-width: 0; overflow-y: auto; overflow-x: hidden; padding: 6px clamp(16px, 4vw, 40px); scrollbar-width: none; }
.coach__convo::-webkit-scrollbar { display: none; }
.coach__convo-wrap { max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; padding: 12px 0 20px; min-height: 100%; }
.coach__body--working .coach__convo-wrap { margin: 0 auto 0 max(0px, 2vw); }

.coach__opener { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 26px; }
.coach__greeting { margin: 0; font-family: 'Iowan Old Style', Palatino, Georgia, serif; font-size: clamp(20px, 3.2vw, 29px); line-height: 1.42; white-space: pre-line; color: rgba(238,242,248,.94); max-width: 22ch; text-wrap: balance; }
.coach__chips { display: flex; flex-wrap: wrap; gap: 9px; justify-content: center; max-width: 540px; }
.coach__chip { padding: 9px 16px; border-radius: 999px; border: 1px solid rgba(238,242,248,.12); background: rgba(255,255,255,.045); color: rgba(238,242,248,.82); font: inherit; font-size: 13.5px; cursor: pointer; backdrop-filter: blur(10px); transition: background .25s, border-color .25s, transform .2s; }
.coach__chip:hover { background: rgba(255,255,255,.10); border-color: rgba(238,242,248,.24); transform: translateY(-1px); }

.coach__msg { max-width: 88%; animation: coach-liquify .55s cubic-bezier(.2,.7,.2,1) both; }
.coach__msg--me { align-self: flex-end; }
.coach__msg--me .coach__bubble { background: rgba(238,242,248,.94); color: #0a1220; border-radius: 22px 22px 7px 22px; padding: 11px 16px; font-size: 15px; line-height: 1.5; box-shadow: 0 12px 34px -14px rgba(0,0,0,.6); white-space: pre-wrap; }
.coach__msg--earnest { align-self: flex-start; color: rgba(238,242,248,.92); font-size: 15.5px; line-height: 1.62; }
.coach__prose :deep(p) { margin: .3rem 0; }
.coach__prose :deep(strong) { color: #fff; font-weight: 600; }
.coach__prose :deep(h4) { margin: .5rem 0 .25rem; font-size: 1rem; font-weight: 600; color: #fff; }
.coach__prose :deep(.mk-li) { margin: .2rem 0 .2rem 1.1rem; list-style: disc; }
.coach__prose :deep(.mk-oli) { list-style: decimal; }
@keyframes coach-liquify { 0% { opacity: 0; transform: translateY(14px) scale(.94); filter: blur(7px); border-radius: 40%; } 60% { filter: blur(0); } 100% { opacity: 1; transform: none; filter: blur(0); } }

.coach__typing { display: inline-flex; gap: 5px; align-items: center; height: 1.6rem; }
.coach__typing span { width: 7px; height: 7px; border-radius: 50%; background: rgba(238,242,248,.7); animation: coach-bounce 1.2s ease-in-out infinite; }
.coach__typing span:nth-child(2) { animation-delay: .15s; }
.coach__typing span:nth-child(3) { animation-delay: .3s; }
@keyframes coach-bounce { 0%,80%,100% { transform: translateY(0); opacity: .5; } 40% { transform: translateY(-5px); opacity: 1; } }

/* Task stream */
.coach__tasks { width: min(340px, 88vw); flex: none; display: flex; flex-direction: column; gap: 10px; padding: 14px 14px 16px; margin: 6px clamp(16px, 4vw, 40px) 6px 0; border-radius: 20px; border: 1px solid rgba(238,242,248,.12); background: rgba(255,255,255,.045); backdrop-filter: blur(18px); animation: coach-liquify .6s cubic-bezier(.2,.7,.2,1) both; }
.coach__tasks-head { display: flex; align-items: center; justify-content: space-between; font-size: 10.5px; letter-spacing: .16em; text-transform: uppercase; color: rgba(238,242,248,.5); }
.coach__tasks-count { color: #f3c465; }
.coach__tasks-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 7px; scrollbar-width: none; }
.coach__tasks-list::-webkit-scrollbar { display: none; }
.coach__tasks-empty { font-size: 13px; color: rgba(238,242,248,.5); padding: 14px 4px; text-align: center; }
.coach__task { display: flex; align-items: center; gap: 11px; padding: 10px 12px; border-radius: 13px; border: 1px solid rgba(238,242,248,.1); background: rgba(255,255,255,.04); cursor: pointer; text-align: left; color: inherit; transition: background .2s, border-color .2s; animation: coach-liquify .5s cubic-bezier(.2,.7,.2,1) both; }
.coach__task:hover { background: rgba(255,255,255,.08); }
.coach__task-check { width: 20px; height: 20px; border-radius: 7px; flex: none; display: grid; place-items: center; border: 1.5px solid rgba(238,242,248,.34); color: transparent; transition: background .25s, border-color .25s, color .25s; }
.coach__task[data-done="true"] .coach__task-check { background: #f3c465; border-color: #f3c465; color: #06121f; }
.coach__task-label { font-size: 14px; }
.coach__task[data-done="true"] .coach__task-label { color: rgba(238,242,248,.42); text-decoration: line-through; }
.coach__addstep { display: flex; gap: 6px; }
.coach__addstep input { flex: 1; height: 36px; border-radius: 999px; border: 1px solid rgba(238,242,248,.12); background: rgba(255,255,255,.04); color: #eef2f8; font: inherit; font-size: 13px; padding: 0 14px; outline: none; }
.coach__addstep input::placeholder { color: rgba(238,242,248,.4); }
.coach__addstep input:focus { border-color: rgba(238,242,248,.28); }
.coach__addstep button { width: 36px; height: 36px; flex: none; border-radius: 50%; border: 0; background: rgba(255,255,255,.1); color: #eef2f8; cursor: pointer; display: grid; place-items: center; transition: background .2s; }
.coach__addstep button:hover:not(:disabled) { background: rgba(255,255,255,.18); }
.coach__addstep button:disabled { opacity: .4; cursor: default; }

/* On narrow screens the task rail stacks under the conversation */
@media (max-width: 820px) {
	.coach__body--working { flex-direction: column; }
	.coach__tasks { width: auto; margin: 0 clamp(16px,4vw,40px); max-height: 34vh; }
}

/* Composer — liquifies in */
.coach__composer-wrap { padding: 4px clamp(16px, 4vw, 40px) 20px; }
.coach__composer { max-width: 720px; margin: 0 auto; display: flex; align-items: flex-end; gap: 8px; padding: 8px; border-radius: 999px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.14); backdrop-filter: blur(20px); box-shadow: 0 18px 60px -22px rgba(0,0,0,.7); animation: coach-composer-in .7s cubic-bezier(.2,.7,.2,1) both; }
@keyframes coach-composer-in { 0% { opacity: 0; transform: translateY(16px) scaleX(.86); filter: blur(8px); border-radius: 40px; } 100% { opacity: 1; transform: none; filter: blur(0); } }
.coach__composer textarea { flex: 1; resize: none; border: 0; background: transparent; color: #eef2f8; font: inherit; font-size: 15px; line-height: 1.5; padding: 9px 10px; max-height: 140px; outline: none; }
.coach__composer textarea::placeholder { color: rgba(238,242,248,.4); }
.coach__send { width: 44px; height: 44px; border-radius: 50%; border: 0; flex: none; cursor: pointer; display: grid; place-items: center; color: #06121f; background: linear-gradient(150deg, color-mix(in oklab, var(--accent1), white 14%), var(--accent2)); box-shadow: 0 8px 26px -8px var(--accent2); transition: transform .18s, opacity .2s; }
.coach__send:hover { transform: scale(1.06); }
.coach__send:active { transform: scale(.94); }
.coach__send:disabled { opacity: .45; cursor: default; }
.coach__send[data-streaming="true"] { background: rgba(255,255,255,.18); color: #eef2f8; }
.coach__hint { text-align: center; font-size: 11px; color: rgba(238,242,248,.36); margin: 8px 0 0; }
kbd { font: inherit; background: rgba(255,255,255,.1); border-radius: 4px; padding: 1px 5px; font-size: 10px; }

@media (prefers-reduced-motion: reduce) {
	.coach__msg, .coach__task, .coach__tasks, .coach__composer, .coach__typing span { animation: none !important; }
	.coach { transition: none; }
}
</style>
