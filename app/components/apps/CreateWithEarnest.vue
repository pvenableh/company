<!--
  CreateWithEarnest — the inline summon, in the presence language.

  Not a room, a spot action: tap the living Earnest mark → its aura blooms and a
  small dark "liquid sheet" of intents rises → pick one → Earnest pulses to a
  THINK mood and drafts it. Same power as before — every intent still funnels
  through openEarnestPanel(prompt), which auto-sends scoped to the currently
  focused entity so the approval-gated tool fires for THIS client/project/lead.
  Nothing is created until you approve; this only changes the feel of the ask.

    <AppsCreateWithEarnest entity-type="client" />

  Reuses the shared foundation ([[project_earnest_presence_strategy]]):
  useEarnestPresence() as the local brain, <EarnestAura> as the living backdrop,
  <EarnestPresenceMark> as the morphing E. Dependency-free popover (no teleport)
  so it behaves inside the transformed slide-over container.
-->
<script setup lang="ts">
import { gsap } from 'gsap';
import { useEarnestPresence, EARNEST_GROUND } from '~/composables/useEarnestPresence';

const props = defineProps<{
	entityType: string;
	label?: string;
}>();

const { openEarnestPanel } = useEarnestPanel();

interface CreateAction { label: string; icon: string; prompt: string }

const ACTIONS: Record<string, CreateAction[]> = {
	client: [
		{ label: 'New project', icon: 'lucide:folder-plus', prompt: 'Create a new project for this client with a short timeline of phases and a few tasks under each.' },
		{ label: 'Proposal & contract', icon: 'lucide:file-text', prompt: 'Draft a proposal and a contract for this client based on what you know about them.' },
		{ label: 'Invoice', icon: 'lucide:receipt', prompt: 'Create an invoice for this client for recent work.' },
		{ label: 'Ticket', icon: 'lucide:ticket', prompt: 'Create a ticket for this client for a specific request, with a couple of tasks.' },
		{ label: 'Task', icon: 'lucide:check-square', prompt: 'Add a follow-up task for this client.' },
		{ label: 'Email', icon: 'lucide:mail', prompt: 'Draft a follow-up email to this client.' },
	],
	project: [
		{ label: 'Add a phase / event', icon: 'lucide:flag', prompt: 'Add a phase to this project with a couple of tasks under it.' },
		{ label: 'Add tasks', icon: 'lucide:check-square', prompt: 'Add a few tasks to this project.' },
		{ label: 'Ticket', icon: 'lucide:ticket', prompt: 'Create a ticket on this project for a specific request, with a couple of tasks.' },
		{ label: 'Invoice', icon: 'lucide:receipt', prompt: 'Create an invoice for this project\'s client for recent work.' },
		{ label: 'Reschedule', icon: 'lucide:calendar-clock', prompt: 'Reschedule this project — push the dates out by two weeks and cascade to events and tasks.' },
	],
	lead: [
		{ label: 'Proposal & contract', icon: 'lucide:file-text', prompt: 'Draft a proposal and contract for this lead.' },
		{ label: 'Task', icon: 'lucide:check-square', prompt: 'Add a follow-up task for this lead.' },
		{ label: 'Email', icon: 'lucide:mail', prompt: 'Draft an outreach email to this lead.' },
	],
	proposal: [
		{ label: 'Turn into contract', icon: 'lucide:file-signature', prompt: 'Turn this proposal into a contract — draft a contract (targets: contract) based on this proposal\'s scope and pricing, linked to the same lead.' },
	],
	contract: [
		{ label: 'Create invoice', icon: 'lucide:receipt', prompt: 'Create an invoice from this contract — bill its client for the contract amount.' },
	],
	project_event: [
		{ label: 'Bill this milestone', icon: 'lucide:receipt', prompt: 'Create an invoice to bill this payment milestone for the project client.' },
	],
};

const actions = computed(() => ACTIONS[props.entityType] || []);
const ground = EARNEST_GROUND;

// A small presence brain, local to this summon, shared into the sheet's aura so
// picking an intent can pulse it to 'think'. Opens calm ('present').
const presence = useEarnestPresence({ initial: 'present' });

// `open` is the logical state; `rendered` keeps the sheet in the DOM long enough
// to play its liquid dismissal before it unmounts.
const open = ref(false);
const rendered = ref(false);
const sheetEl = ref<HTMLElement | null>(null);
let introTl: gsap.core.Timeline | null = null;

function toggle() {
	// A single action needs no menu — run it straight away (with a think beat).
	if (actions.value.length === 1) { run(actions.value[0]!); return; }
	open.value ? close() : reveal();
}

async function reveal() {
	if (open.value) return;
	open.value = true;
	rendered.value = true;
	presence.setMood('listen'); // lean in as the sheet rises
	presence.bump(0.4);
	await nextTick();
	playIntro();
}

function playIntro() {
	const sheet = sheetEl.value;
	if (!sheet) return;
	introTl?.kill();
	if (presence.reduceMotion.value) {
		gsap.set(sheet, { autoAlpha: 1, y: 0, scale: 1 });
		gsap.set(sheet.querySelectorAll('.cwe-row'), { autoAlpha: 1, y: 0 });
		return;
	}
	const rows = sheet.querySelectorAll('.cwe-row');
	introTl = gsap.timeline({ defaults: { ease: 'power3.out' } });
	// the sheet itself surfaces — a soft liquid pop from the trigger corner
	introTl.fromTo(
		sheet,
		{ autoAlpha: 0, y: -8, scale: 0.94, transformOrigin: 'top right' },
		{ autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.5)' },
	);
	// intents rise through it on a stagger
	introTl.fromTo(
		rows,
		{ autoAlpha: 0, y: 12 },
		{ autoAlpha: 1, y: 0, duration: 0.42, stagger: 0.05 },
		0.14,
	);
}

function close() {
	if (!open.value) return;
	open.value = false;
	presence.setMood('present'); // settle back
	const sheet = sheetEl.value;
	if (!sheet || presence.reduceMotion.value) { rendered.value = false; return; }
	introTl?.kill();
	gsap.to(sheet, {
		autoAlpha: 0, y: -6, scale: 0.96, duration: 0.26, ease: 'power2.in',
		onComplete: () => { rendered.value = false; },
	});
}

function run(a: CreateAction) {
	// A visible beat of "thinking" as Earnest takes the intent, then hand off to
	// the panel where the scoped, approval-gated draft actually happens. The
	// handoff fires IMMEDIATELY — never gated on the dismissal tween, so a user
	// who tabs away mid-animation still gets the panel; the fade is cosmetic.
	presence.setMood('think');
	presence.bump(0.7);
	openEarnestPanel(a.prompt);
	open.value = false;
	const sheet = sheetEl.value;
	if (!sheet || presence.reduceMotion.value) { rendered.value = false; return; }
	introTl?.kill();
	gsap.to(sheet, { autoAlpha: 0, scale: 0.97, duration: 0.24, ease: 'power2.in', onComplete: () => { rendered.value = false; } });
}

function onKeydown(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown); introTl?.kill(); });
</script>

<template>
	<div v-if="actions.length" class="relative inline-flex">
		<button
			type="button"
			class="cwe-trigger group inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-medium bg-primary/10 text-primary hover:bg-primary/15 active:scale-95 transition-all"
			:class="{ 'cwe-trigger--open': open }"
			@click="toggle"
		>
			<!-- the living mark: a soft aura blooms behind the E on open -->
			<span class="cwe-mark relative inline-flex items-center justify-center w-3.5 h-3.5">
				<span class="cwe-bloom" aria-hidden="true" />
				<EarnestIcon class="relative w-3.5 h-3.5" />
			</span>
			<span class="hidden sm:inline">{{ label || 'Create' }}</span>
			<Icon
				v-if="actions.length > 1"
				name="lucide:chevron-down"
				class="w-3 h-3 transition-transform duration-300"
				:class="{ 'rotate-180': open }"
			/>
		</button>

		<template v-if="rendered">
			<!-- click-catcher; no teleport so it lives inside the transformed panel -->
			<div class="fixed inset-0 z-40" @click="close" />
			<div
				ref="sheetEl"
				class="cwe-sheet absolute z-50 top-full right-0 mt-2 w-64 max-w-[82vw] rounded-2xl overflow-hidden shadow-2xl"
				:style="{ backgroundColor: ground, opacity: 0 }"
				@click.stop
			>
				<!-- living backdrop: the shared aura, quiet, moody, behind the intents -->
				<EarnestAura :presence="presence" class="cwe-aura" />

				<div class="relative z-10 p-1.5">
					<p class="flex items-center gap-1.5 px-2 py-1.5 text-[10px] uppercase tracking-wider text-white/45">
						<EarnestPresenceMark :height="11" still class="text-white/70" />
						<span>Ask Earnest to…</span>
					</p>
					<button
						v-for="a in actions"
						:key="a.label"
						type="button"
						class="cwe-row w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-sm text-white/90 hover:bg-white/[0.07] transition-colors text-left"
						@click="run(a)"
					>
						<span class="cwe-row-icon flex items-center justify-center w-6 h-6 rounded-lg bg-white/[0.06]">
							<Icon :name="a.icon" class="w-3.5 h-3.5 text-sky-300/80 shrink-0" />
						</span>
						<span class="flex-1">{{ a.label }}</span>
					</button>
					<p class="px-2 pt-1.5 pb-1 text-[10px] leading-snug text-white/35">
						Earnest drafts it — you approve before anything is created.
					</p>
				</div>
			</div>
		</template>
	</div>
</template>

<style scoped>
/* The mark's bloom — a soft radial glow that swells behind the E when the sheet
   opens, then recedes. GSAP owns the sheet's liquid rise; this quiet accent
   rides a cheap CSS transition off the trigger's open state. */
.cwe-bloom {
	position: absolute;
	inset: -140%;
	border-radius: 50%;
	background: radial-gradient(circle, rgba(56, 189, 248, 0.55), transparent 68%);
	opacity: 0;
	transform: scale(0.5);
	transition: opacity 400ms ease, transform 500ms cubic-bezier(0.36, 0.66, 0.04, 1);
	pointer-events: none;
}
.cwe-trigger:hover .cwe-bloom { opacity: 0.35; transform: scale(0.85); }
.cwe-trigger--open .cwe-bloom { opacity: 0.8; transform: scale(1.1); }

/* The aura fills the sheet as a contained wash; dim + clipped so the intents
   stay legible over Earnest's living colour. */
.cwe-sheet :deep(.cwe-aura) { opacity: 0.6; }
/* trim the aura's darkening veil inside this small pocket — the sheet ground
   already supplies the dark; the veil would only muddy it. */
.cwe-sheet :deep(.cwe-aura .aura__veil) { display: none; }

@media (prefers-reduced-motion: reduce) {
	.cwe-bloom { transition: none; }
}
</style>
