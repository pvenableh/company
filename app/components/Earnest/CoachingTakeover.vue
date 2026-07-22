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
// One awareness source for every size: 'full' reads the SAME route/entity
// context the docked panel does, so the bucket key matches and the live thread
// carries across dock ⇄ full without a reload.
const aware = useEarnestAwareness();
const {
	messages,
	isStreaming,
	isSending,
	streamingContent,
	setEntity,
	setRoute,
	sendMessage,
	cancelStream,
	sessionId,
	hasHistory,
	clearChat,
	listSessions,
	loadSession,
	deleteSession,
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

// ── Awareness → chat context ─────────────────────────────────────────────────
// Prefer live page awareness (so dock and full share one bucket); fall back to
// the scope the opener passed only when awareness has no entity registered.
function syncScope() {
	const s = scope.value;
	if (aware.hasEntity.value && aware.entityType.value && aware.entityId.value) {
		setEntity(aware.entityType.value, aware.entityId.value);
	} else if (s?.mode === 'entity' && s.entityType && s.entityId) {
		setEntity(s.entityType, s.entityId);
	} else {
		setRoute(aware.scope.value, aware.scope.value);
	}
}
watch([scope, aware.contextKey], () => { if (isOpen.value) { syncScope(); loadTasks(); } });

const headerLabel = computed(() => {
	if (aware.hasEntity.value && aware.focus.value) return aware.focus.value;
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
// Prefer LIVE page awareness (the entity you're actually looking at) over the
// opener's `scope`, which is stale when Focus is entered via the dock's maximize
// button (that path only resizes and never sets scope). This is what makes the
// full-screen focus announce the specific project/client/ticket you're on.
const focusEntityLabel = computed(() => {
	if (aware.hasEntity.value && aware.focus.value) return aware.focus.value;
	const s = scope.value;
	if (s?.mode === 'entity' && s.label) return s.label;
	return null;
});
const greeting = computed(() => {
	if (focusEntityLabel.value) {
		return `Let's give ${focusEntityLabel.value} the care it deserves.\nWhat's the honest state of it right now?`;
	}
	return `I'm here. No rush.\nWhat's the honest version of how things are right now?`;
});
const suggestions = computed(() => {
	if (canWork.value) {
		return ['Break this into honest steps', 'What should I do first?', "What am I avoiding?", 'Draft my next move'];
	}
	if (focusEntityLabel.value) {
		return ['What matters most here?', 'Help me find the next true step', "What's weighing on this?", 'Draft my next move'];
	}
	return [EARNEST_LIFT_OPENER, "I'm stretched thin — where do I start?", 'Help me plan my next hour', 'What did I do well today?'];
});

// ── Past-conversation history + new conversation ─────────────────────────────
// Ported from EarnestPanel so Focus has the same "sidebar" affordances. Focus
// and the dock share the active bucket, so a session opened / started here is
// the same thread the dock shows.
const showHistory = ref(false);
const historyLoading = ref(false);
const historySessions = ref<import('~/composables/useContextualChat').ChatSessionSummary[]>([]);
const deletingId = ref<string | null>(null);

// Always land on the conversation (not a stale history list) when Focus reopens.
watch(isOpen, (open) => { if (open) showHistory.value = false; });

async function openHistory() {
	showHistory.value = true;
	historyLoading.value = true;
	try {
		historySessions.value = await listSessions({ limit: 50 });
	} finally {
		historyLoading.value = false;
	}
}
function closeHistory() { showHistory.value = false; }
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
function newConversation() {
	clearChat();
	showHistory.value = false;
}
const sessionDateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
function formatSessionTime(iso?: string): string {
	if (!iso) return '';
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return '';
	const mins = Math.round((Date.now() - then) / 60000);
	if (mins < 1) return 'just now';
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.round(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.round(hrs / 24);
	if (days < 7) return `${days}d ago`;
	return sessionDateFmt.format(then);
}

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
	// A lift request earns an immediate warm bloom — Earnest leans in with
	// reassurance the instant she reaches for encouragement, before a word is
	// written (the aura normally only warms once a reply lands).
	if (content === EARNEST_LIFT_OPENER) {
		presence.bump(0.9);
		warmFlash.value = true;
		if (warmTimer) clearTimeout(warmTimer);
		warmTimer = setTimeout(() => { warmFlash.value = false; }, 2800);
	}
	// Speaking from the Mirror returns you to the conversation.
	if (mode.value === 'mirror') setMode('companion');
	// Talk turned to doing → re-form into the Working Table (if we can).
	if (canWork.value && mode.value === 'companion' && WORK_INTENT.test(content)) setMode('working');
	const s = scope.value;
	const label = (aware.hasEntity.value && aware.focus.value) ? aware.focus.value : (s?.mode === 'entity' ? s.label : '');
	const routeFocus = label
		? `${label} — in Focus mode, one honest thing at a time`
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
						<!-- Scoped-entity chip: shows the project / client / ticket the
						     conversation is about, so full-screen focus makes the scope
						     explicit (not just the docked panel). -->
						<span
							v-if="focusEntityLabel"
							class="coach__entity"
							:title="`Focused on ${focusEntityLabel}`"
						>
							<Icon name="lucide:target" class="coach__entity-icon" />
							{{ focusEntityLabel }}
						</span>
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
						<!-- New conversation + history — same thread store as the dock. -->
						<button v-if="hasHistory" type="button" class="coach__close" aria-label="New conversation" title="New conversation" @click="newConversation">
							<Icon name="lucide:plus" class="w-5 h-5" />
						</button>
						<button
							type="button"
							class="coach__close"
							:class="{ 'coach__close--on': showHistory }"
							aria-label="Past conversations"
							title="Past conversations"
							@click="showHistory ? closeHistory() : openHistory()"
						>
							<Icon name="lucide:history" class="w-5 h-5" />
						</button>
						<button type="button" class="coach__close" aria-label="Shrink to docked panel" title="Dock" @click="setEarnestSize('dock')">
							<Icon name="lucide:minimize-2" class="w-5 h-5" />
						</button>
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

					<!-- Past conversations overlay (list / open / delete). -->
					<div v-if="showHistory && mode !== 'mirror'" class="coach__history">
						<div class="coach__history-head">
							<span class="coach__history-title">Past conversations</span>
							<button type="button" class="coach__history-back" @click="closeHistory">
								<Icon name="lucide:arrow-left" class="w-3.5 h-3.5" /> Back
							</button>
						</div>
						<div v-if="historyLoading" class="coach__history-empty">
							<Icon name="lucide:loader-2" class="w-4 h-4 animate-spin" /> Loading…
						</div>
						<div v-else-if="!historySessions.length" class="coach__history-empty">
							<Icon name="lucide:message-square-dashed" class="w-6 h-6 opacity-50" />
							<p>No past conversations yet.</p>
						</div>
						<ul v-else class="coach__history-list">
							<li
								v-for="s in historySessions"
								:key="s.id"
								class="coach__history-item"
								:class="{ 'coach__history-item--on': s.id === sessionId }"
								@click="pickSession(s.id)"
							>
								<Icon name="lucide:message-circle" class="w-3.5 h-3.5 shrink-0 opacity-70" />
								<div class="coach__history-meta">
									<p class="coach__history-name">{{ s.title || 'Untitled conversation' }}</p>
									<p class="coach__history-time">{{ formatSessionTime(s.date_updated || s.date_created) }}</p>
								</div>
								<button type="button" class="coach__history-del" title="Delete conversation" @click.stop="removeSession(s.id)">
									<Icon v-if="deletingId === s.id" name="lucide:loader-2" class="w-3 h-3 animate-spin" />
									<Icon v-else name="lucide:trash-2" class="w-3 h-3" />
								</button>
							</li>
						</ul>
					</div>

					<div v-show="mode !== 'mirror' && !showHistory" ref="scroller" class="coach__convo">
						<div class="coach__convo-wrap">
							<!-- Opening / empty -->
							<div v-if="!hasConversation" class="coach__opener">
								<p class="coach__greeting">{{ greeting }}</p>
								<div class="coach__chips">
									<button
									v-for="s in suggestions"
									:key="s"
									type="button"
									class="coach__chip"
									:class="{ 'coach__chip--lift': s === EARNEST_LIFT_OPENER }"
									@click="send(s)"
								>
									<Icon v-if="s === EARNEST_LIFT_OPENER" name="lucide:sparkles" class="coach__chip-spark" />
									{{ s }}
								</button>
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
	color: hsl(var(--aura-foreground));
	/* Ground is the palette's aura ground (blue-black under Default, neutral
	   near-black under Mono) with a radial vignette darkening toward the
	   bottom — so Focus shares ONE material with the app chrome instead of
	   a hardcoded blue-black that ignored the active palette. */
	background:
		radial-gradient(140% 120% at 50% 8%, transparent 0%, hsl(0 0% 0% / 0.4) 52%, hsl(0 0% 0% / 0.72) 100%),
		hsl(var(--aura-ground));
	--accent1: #2f8a84; --accent2: #356299;
	transition: --accent1 1.2s ease, --accent2 1.2s ease;
}

/* Foreground */
.coach__inner { position: relative; z-index: 3; display: flex; flex-direction: column; height: 100%; min-height: 0; }

.coach__top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 18px clamp(16px, 4vw, 40px) 6px; }
.coach__brand { display: flex; align-items: center; gap: 12px; min-width: 0; color: hsl(var(--aura-foreground)); }
.coach__focus-tag { font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: rgba(238,242,248,.5); padding: 3px 8px; border-radius: 999px; border: 1px solid hsl(var(--aura-rim)); }
.coach__entity { display: inline-flex; align-items: center; gap: 5px; max-width: 240px; font-size: 11px; font-weight: 500; letter-spacing: .01em; color: rgba(238,242,248,.82); padding: 3px 9px 3px 7px; border-radius: 999px; border: 1px solid hsl(var(--aura-rim)); background: hsl(var(--aura-foreground) / 0.06); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.coach__entity-icon { width: 11px; height: 11px; flex-shrink: 0; opacity: .7; }
.coach__mantra { margin: 0; height: 1.25em; overflow: hidden; font-family: var(--body-font, inherit); font-style: italic; font-size: 12.5px; color: rgba(238,242,248,.4); min-width: 0; }
.mantra-enter-active, .mantra-leave-active { transition: opacity .5s ease, transform .5s ease; }
.mantra-enter-from { opacity: 0; transform: translateY(6px); }
.mantra-leave-to { opacity: 0; transform: translateY(-6px); }

.coach__controls { display: flex; align-items: center; gap: 10px; }
.coach__modeswitch { display: flex; gap: 3px; padding: 4px; border-radius: 999px; border: 1px solid hsl(var(--aura-rim)); background: hsl(var(--aura-glass-1)); backdrop-filter: blur(12px); }
.coach__modeswitch button { border: 0; background: transparent; color: rgba(238,242,248,.5); cursor: pointer; font: inherit; font-size: 12px; letter-spacing: .04em; padding: 5px 13px; border-radius: 999px; transition: color .25s, background .25s; display: inline-flex; align-items: center; gap: 6px; }
.coach__modeswitch button[data-on="true"] { color: hsl(var(--aura-foreground)); background: hsl(var(--aura-glass-2)); }
.coach__badge { display: inline-flex; align-items: center; justify-content: center; min-width: 16px; height: 16px; padding: 0 4px; font-size: 10px; line-height: 1; border-radius: 999px; background: #f3c465; color: #06121f; font-weight: 600; }
.coach__close { width: 38px; height: 38px; border-radius: 50%; border: 0; background: transparent; color: rgba(238,242,248,.7); cursor: pointer; display: grid; place-items: center; transition: background .2s, color .2s; }
.coach__close:hover { background: hsl(var(--aura-glass-2)); color: hsl(var(--aura-foreground)); }
.coach__close--on { background: hsl(var(--aura-glass-2)); color: hsl(var(--aura-foreground)); }

/* Past-conversations overlay */
.coach__history { flex: 1; min-height: 0; display: flex; flex-direction: column; width: min(560px, 100%); margin: 0 auto; padding: 8px 4px 24px; overflow-y: auto; }
.coach__history-head { display: flex; align-items: center; justify-content: space-between; padding: 4px 6px 12px; }
.coach__history-title { font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: rgba(238,242,248,.5); }
.coach__history-back { display: inline-flex; align-items: center; gap: 3px; border: 0; background: transparent; color: rgba(238,242,248,.55); font: inherit; font-size: 11px; cursor: pointer; transition: color .2s; }
.coach__history-back:hover { color: hsl(var(--aura-foreground)); }
.coach__history-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: rgba(238,242,248,.5); font-size: 12px; }
.coach__history-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.coach__history-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; border: 1px solid hsl(var(--aura-rim)); background: hsl(var(--aura-glass-1)); color: hsl(var(--aura-foreground)); cursor: pointer; transition: background .2s, border-color .2s; }
.coach__history-item:hover { background: hsl(var(--aura-glass-2)); }
.coach__history-item--on { border-color: hsl(var(--aura-foreground) / .35); background: hsl(var(--aura-glass-2)); }
.coach__history-meta { min-width: 0; flex: 1; }
.coach__history-name { margin: 0; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.coach__history-time { margin: 1px 0 0; font-size: 10px; color: rgba(238,242,248,.45); }
.coach__history-del { opacity: 0; border: 0; background: transparent; color: rgba(238,242,248,.5); cursor: pointer; padding: 4px; border-radius: 999px; transition: opacity .15s, color .2s, background .2s; }
.coach__history-item:hover .coach__history-del { opacity: 1; }
.coach__history-del:hover { color: hsl(var(--destructive)); background: hsl(var(--destructive) / .12); }

.coach__body { flex: 1; min-height: 0; display: flex; }
.coach__body--working { gap: clamp(12px, 2vw, 28px); }

.coach__convo { flex: 1; min-width: 0; overflow-y: auto; overflow-x: hidden; padding: 6px clamp(16px, 4vw, 40px); scrollbar-width: none; }
.coach__convo::-webkit-scrollbar { display: none; }
.coach__convo-wrap { max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; padding: 12px 0 20px; min-height: 100%; }
.coach__body--working .coach__convo-wrap { margin: 0 auto 0 max(0px, 2vw); }

.coach__opener { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 26px; }
.coach__greeting { margin: 0; font-family: var(--title-font, inherit); font-size: clamp(20px, 3.2vw, 29px); line-height: 1.42; white-space: pre-line; color: rgba(238,242,248,.94); max-width: 22ch; text-wrap: balance; }
.coach__chips { display: flex; flex-wrap: wrap; gap: 9px; justify-content: center; max-width: 540px; }
.coach__chip { padding: 9px 16px; border-radius: 999px; border: 1px solid hsl(var(--aura-rim)); background: hsl(var(--aura-glass-1)); color: hsl(var(--aura-foreground-muted)); font: inherit; font-size: 13.5px; cursor: pointer; backdrop-filter: blur(10px); transition: background .25s, border-color .25s, transform .2s; }
.coach__chip:hover { background: hsl(var(--aura-glass-2)); border-color: rgba(238,242,248,.24); transform: translateY(-1px); }
/* The encouragement chip reads warm — a soft gold rim + spark, distinct from the
   neutral glass prompts. Same "this is the warm one" signal as the home + panel. */
.coach__chip--lift { display: inline-flex; align-items: center; gap: 7px; background: hsl(var(--aura-glass-2)); border-color: rgba(245,205,140,.38); color: hsl(var(--aura-foreground)); }
.coach__chip--lift:hover { border-color: rgba(245,205,140,.6); }
.coach__chip-spark { width: 14px; height: 14px; color: rgb(245,205,140); }

.coach__msg { max-width: 88%; animation: coach-liquify .55s cubic-bezier(.2,.7,.2,1) both; }
.coach__msg--me { align-self: flex-end; }
.coach__msg--me .coach__bubble { background: rgba(238,242,248,.94); color: hsl(var(--aura-ground)); border-radius: 22px 22px 7px 22px; padding: 11px 16px; font-size: 15px; line-height: 1.5; box-shadow: 0 12px 34px -14px rgba(0,0,0,.6); white-space: pre-wrap; }
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
.coach__tasks { width: min(340px, 88vw); flex: none; display: flex; flex-direction: column; gap: 10px; padding: 14px 14px 16px; margin: 6px clamp(16px, 4vw, 40px) 6px 0; border-radius: 20px; border: 1px solid hsl(var(--aura-rim)); background: hsl(var(--aura-glass-1)); backdrop-filter: blur(18px); animation: coach-liquify .6s cubic-bezier(.2,.7,.2,1) both; }
.coach__tasks-head { display: flex; align-items: center; justify-content: space-between; font-size: 10.5px; letter-spacing: .16em; text-transform: uppercase; color: rgba(238,242,248,.5); }
.coach__tasks-count { color: #f3c465; }
.coach__tasks-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 7px; scrollbar-width: none; }
.coach__tasks-list::-webkit-scrollbar { display: none; }
.coach__tasks-empty { font-size: 13px; color: rgba(238,242,248,.5); padding: 14px 4px; text-align: center; }
.coach__task { display: flex; align-items: center; gap: 11px; padding: 10px 12px; border-radius: 13px; border: 1px solid hsl(var(--aura-rim)); background: hsl(var(--aura-glass-1)); cursor: pointer; text-align: left; color: inherit; transition: background .2s, border-color .2s; animation: coach-liquify .5s cubic-bezier(.2,.7,.2,1) both; }
.coach__task:hover { background: hsl(var(--aura-glass-2)); }
.coach__task-check { width: 20px; height: 20px; border-radius: 7px; flex: none; display: grid; place-items: center; border: 1.5px solid rgba(238,242,248,.34); color: transparent; transition: background .25s, border-color .25s, color .25s; }
.coach__task[data-done="true"] .coach__task-check { background: #f3c465; border-color: #f3c465; color: #06121f; }
.coach__task-label { font-size: 14px; }
.coach__task[data-done="true"] .coach__task-label { color: rgba(238,242,248,.42); text-decoration: line-through; }
.coach__addstep { display: flex; gap: 6px; }
.coach__addstep input { flex: 1; height: 36px; border-radius: 999px; border: 1px solid hsl(var(--aura-rim)); background: hsl(var(--aura-glass-1)); color: hsl(var(--aura-foreground)); font: inherit; font-size: 13px; padding: 0 14px; outline: none; }
.coach__addstep input::placeholder { color: rgba(238,242,248,.4); }
.coach__addstep input:focus { border-color: rgba(238,242,248,.28); }
.coach__addstep button { width: 36px; height: 36px; flex: none; border-radius: 50%; border: 0; background: hsl(var(--aura-glass-2)); color: hsl(var(--aura-foreground)); cursor: pointer; display: grid; place-items: center; transition: background .2s; }
.coach__addstep button:hover:not(:disabled) { background: hsl(var(--aura-glass-3)); }
.coach__addstep button:disabled { opacity: .4; cursor: default; }

/* On narrow screens the task rail stacks under the conversation */
@media (max-width: 820px) {
	.coach__body--working { flex-direction: column; }
	.coach__tasks { width: auto; margin: 0 clamp(16px,4vw,40px); max-height: 34vh; }
}

/* Composer — liquifies in */
.coach__composer-wrap { padding: 4px clamp(16px, 4vw, 40px) 20px; }
.coach__composer { max-width: 720px; margin: 0 auto; display: flex; align-items: flex-end; gap: 8px; padding: 8px; border-radius: 999px; background: hsl(var(--aura-glass-2)); border: 1px solid hsl(var(--aura-rim)); backdrop-filter: blur(20px); box-shadow: 0 18px 60px -22px rgba(0,0,0,.7); animation: coach-composer-in .7s cubic-bezier(.2,.7,.2,1) both; }
@keyframes coach-composer-in { 0% { opacity: 0; transform: translateY(16px) scaleX(.86); filter: blur(8px); border-radius: 40px; } 100% { opacity: 1; transform: none; filter: blur(0); } }
.coach__composer textarea { flex: 1; resize: none; border: 0; background: transparent; color: hsl(var(--aura-foreground)); font: inherit; font-size: 15px; line-height: 1.5; padding: 9px 10px; max-height: 140px; outline: none; }
.coach__composer textarea::placeholder { color: rgba(238,242,248,.4); }
.coach__send { width: 44px; height: 44px; border-radius: 50%; border: 0; flex: none; cursor: pointer; display: grid; place-items: center; color: #06121f; background: linear-gradient(150deg, color-mix(in oklab, var(--accent1), white 14%), var(--accent2)); box-shadow: 0 8px 26px -8px var(--accent2); transition: transform .18s, opacity .2s; }
.coach__send:hover { transform: scale(1.06); }
.coach__send:active { transform: scale(.94); }
.coach__send:disabled { opacity: .45; cursor: default; }
.coach__send[data-streaming="true"] { background: hsl(var(--aura-glass-3)); color: hsl(var(--aura-foreground)); }
.coach__hint { text-align: center; font-size: 11px; color: rgba(238,242,248,.36); margin: 8px 0 0; }
kbd { font: inherit; background: hsl(var(--aura-glass-2)); border-radius: 4px; padding: 1px 5px; font-size: 10px; }

@media (prefers-reduced-motion: reduce) {
	.coach__msg, .coach__task, .coach__tasks, .coach__composer, .coach__typing span { animation: none !important; }
	.coach { transition: none; }
}
</style>
