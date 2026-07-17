<!--
  ProjectTouchpoints — a project's communication log (CardDesk-style).

  Log a quick touch ("Sent email", "Phone call") with an optional note, tag the
  people involved (team members and/or client contacts), and flag whether you're
  awaiting a reply. Each touch can later be marked as responded, so a team can
  track outreach and follow-up at a glance. Mirrors CardDesk's activity feed.
-->
<script setup lang="ts">
import {
	PROJECT_TOUCHPOINT_TYPES,
	PROJECT_TOUCHPOINT_ICON,
	PROJECT_TOUCHPOINT_LABEL,
	PROJECT_TOUCHPOINT_FALLBACK_ICON,
	type TouchpointParticipant,
} from '~/utils/project-touchpoints';
import type { ProjectTouchpoint } from '~~/shared/directus';

const props = defineProps<{
	projectId: string;
	organizationId?: string | null;
	clientId?: string | null;
}>();

const { listForProject, logTouchpoint, markResponded, deleteTouchpoint } = useProjectTouchpoints();
const { fetchFilteredUsers, filteredUsers } = useFilteredUsers();
const contactItems = useDirectusItems('contacts');
const toast = useToast();

const touchpoints = ref<ProjectTouchpoint[]>([]);
const loading = ref(true);

// ── Taggable people ────────────────────────────────────────────────────────
const members = ref<TouchpointParticipant[]>([]);
const contacts = ref<TouchpointParticipant[]>([]);

async function loadPeople() {
	// Team / org members
	try {
		if (props.organizationId) await fetchFilteredUsers(props.organizationId);
		members.value = (filteredUsers.value || []).map((u: any) => ({
			kind: 'member' as const,
			id: String(u.id),
			name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Member',
		}));
	} catch { members.value = []; }
	// Client contacts (client + portal members)
	try {
		if (props.clientId) {
			const rows = (await contactItems.list({
				fields: ['id', 'first_name', 'last_name', 'email'],
				filter: { client: { _eq: props.clientId } },
				sort: ['first_name'],
				limit: 100,
			})) as any[];
			contacts.value = rows.map((c) => ({
				kind: 'contact' as const,
				id: String(c.id),
				name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Contact',
			}));
		}
	} catch { contacts.value = []; }
}

async function load() {
	loading.value = true;
	try {
		touchpoints.value = await listForProject(props.projectId);
	} catch {
		touchpoints.value = [];
	} finally {
		loading.value = false;
	}
}

onMounted(() => { load(); loadPeople(); });
watch(() => props.projectId, () => { load(); });

// ── Log form ─────────────────────────────────────────────────────────────
const formOpen = ref(false);
const saving = ref(false);
const form = reactive<{ type: string; summary: string; note: string; occurred_at: string; awaiting_response: boolean; participants: TouchpointParticipant[] }>({
	type: 'email',
	summary: '',
	note: '',
	occurred_at: '',
	awaiting_response: false,
	participants: [],
});

function resetForm() {
	form.type = 'email';
	form.summary = '';
	form.note = '';
	form.occurred_at = '';
	form.awaiting_response = false;
	form.participants = [];
}

function openForm() { resetForm(); formOpen.value = true; }
function cancelForm() { formOpen.value = false; }

function isTagged(p: TouchpointParticipant) {
	return form.participants.some((x) => x.kind === p.kind && x.id === p.id);
}
function toggleTag(p: TouchpointParticipant) {
	if (isTagged(p)) form.participants = form.participants.filter((x) => !(x.kind === p.kind && x.id === p.id));
	else form.participants = [...form.participants, p];
}

const tagPickerOpen = ref(false);

async function save() {
	if (!props.organizationId) {
		toast.add({ title: 'Missing organization', description: 'Cannot log a touchpoint without an org.', color: 'red' });
		return;
	}
	saving.value = true;
	try {
		await logTouchpoint({
			project: props.projectId,
			organization: props.organizationId,
			type: form.type,
			summary: form.summary.trim() || undefined,
			note: form.note.trim() || undefined,
			occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : undefined,
			awaiting_response: form.awaiting_response,
			participants: form.participants,
		});
		formOpen.value = false;
		await load();
		toast.add({ title: 'Touchpoint logged', color: 'green' });
	} catch (err: any) {
		toast.add({ title: 'Could not log touchpoint', description: err?.data?.message || err?.message, color: 'red' });
	} finally {
		saving.value = false;
	}
}

// ── Response handling ──────────────────────────────────────────────────────
const respondingId = ref<number | null>(null);
const responseNote = ref('');
function openRespond(tp: ProjectTouchpoint) { respondingId.value = tp.id; responseNote.value = ''; }
async function confirmRespond() {
	if (respondingId.value == null) return;
	try {
		await markResponded(respondingId.value, responseNote.value.trim() || undefined);
		respondingId.value = null;
		await load();
	} catch (err: any) {
		toast.add({ title: 'Could not mark responded', description: err?.data?.message || err?.message, color: 'red' });
	}
}

async function removeTouchpoint(tp: ProjectTouchpoint) {
	try {
		await deleteTouchpoint(tp.id);
		touchpoints.value = touchpoints.value.filter((t) => t.id !== tp.id);
	} catch (err: any) {
		toast.add({ title: 'Could not delete', description: err?.data?.message || err?.message, color: 'red' });
	}
}

function iconFor(type?: string | null) { return (type && PROJECT_TOUCHPOINT_ICON[type]) || PROJECT_TOUCHPOINT_FALLBACK_ICON; }
function labelFor(type?: string | null) { return (type && PROJECT_TOUCHPOINT_LABEL[type]) || 'Touch'; }

function fmtDate(iso?: string | null) {
	if (!iso) return '';
	try {
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	} catch { return ''; }
}

const anyPeople = computed(() => members.value.length + contacts.value.length > 0);
</script>

<template>
	<div>
		<!-- Header -->
		<div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
			<p class="text-xs text-muted-foreground">Track outreach and follow-up on this project.</p>
			<button
				v-if="!formOpen"
				type="button"
				class="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-medium bg-foreground text-background ios-press"
				@click="openForm"
			>
				<Icon name="lucide:plus" class="w-3.5 h-3.5" />
				Log touchpoint
			</button>
		</div>

		<!-- Log form -->
		<div v-if="formOpen" class="ios-card p-3 mb-4 space-y-2.5">
			<!-- Type picker -->
			<div class="flex flex-nowrap gap-1 overflow-x-auto pb-1 -mx-0.5 px-0.5">
				<button
					v-for="opt in PROJECT_TOUCHPOINT_TYPES"
					:key="opt.key"
					type="button"
					class="shrink-0 whitespace-nowrap inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors"
					:class="form.type === opt.key ? 'bg-foreground text-background' : 'bg-muted/50 text-muted-foreground hover:text-foreground border border-border'"
					@click="form.type = opt.key"
				>
					<Icon :name="opt.icon" class="w-3 h-3 shrink-0" />
					{{ opt.label }}
				</button>
			</div>

			<input
				v-model="form.summary"
				type="text"
				placeholder="Short label (e.g. Sent kickoff recap)"
				class="w-full h-9 px-3 text-sm rounded-full border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
			/>
			<textarea
				v-model="form.note"
				rows="2"
				placeholder="Optional note…"
				class="w-full px-3 py-2 text-sm rounded-2xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
			/>

			<!-- Meta row: date + awaiting toggle + tag people -->
			<div class="flex items-center gap-2 flex-wrap">
				<input
					v-model="form.occurred_at"
					type="datetime-local"
					class="h-8 px-2.5 text-xs rounded-full border border-border bg-background text-muted-foreground"
					title="When it happened (defaults to now)"
				/>
				<button
					type="button"
					class="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-medium border transition-colors"
					:class="form.awaiting_response ? 'border-amber-400/60 text-amber-600 dark:text-amber-400 bg-amber-500/10' : 'border-border text-muted-foreground hover:text-foreground'"
					@click="form.awaiting_response = !form.awaiting_response"
				>
					<Icon name="lucide:hourglass" class="w-3 h-3" />
					{{ form.awaiting_response ? 'Awaiting reply' : 'No reply needed' }}
				</button>

				<!-- Tag people -->
				<div class="relative">
					<button
						type="button"
						:disabled="!anyPeople"
						class="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-medium border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
						@click="tagPickerOpen = !tagPickerOpen"
					>
						<Icon name="lucide:users" class="w-3 h-3" />
						{{ form.participants.length ? `${form.participants.length} tagged` : 'Tag people' }}
					</button>
					<template v-if="tagPickerOpen">
						<div class="fixed inset-0 z-40" @click="tagPickerOpen = false" />
						<div class="absolute z-50 top-full left-0 mt-1.5 w-64 max-h-72 overflow-auto rounded-2xl border border-border bg-card shadow-xl p-1.5" @click.stop>
							<p v-if="members.length" class="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Team</p>
							<button
								v-for="p in members"
								:key="`m-${p.id}`"
								type="button"
								class="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-sm text-left hover:bg-primary/5"
								@click="toggleTag(p)"
							>
								<Icon :name="isTagged(p) ? 'lucide:check-square' : 'lucide:square'" class="w-3.5 h-3.5 shrink-0" :class="isTagged(p) ? 'text-primary' : 'text-muted-foreground/50'" />
								<span class="truncate">{{ p.name }}</span>
							</button>
							<p v-if="contacts.length" class="px-2 py-1 mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Client contacts</p>
							<button
								v-for="p in contacts"
								:key="`c-${p.id}`"
								type="button"
								class="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-sm text-left hover:bg-primary/5"
								@click="toggleTag(p)"
							>
								<Icon :name="isTagged(p) ? 'lucide:check-square' : 'lucide:square'" class="w-3.5 h-3.5 shrink-0" :class="isTagged(p) ? 'text-primary' : 'text-muted-foreground/50'" />
								<span class="truncate">{{ p.name }}</span>
							</button>
						</div>
					</template>
				</div>
			</div>

			<!-- Selected participant chips -->
			<div v-if="form.participants.length" class="flex flex-wrap gap-1">
				<span
					v-for="p in form.participants"
					:key="`sel-${p.kind}-${p.id}`"
					class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-foreground"
				>
					<Icon :name="p.kind === 'member' ? 'lucide:user' : 'lucide:contact'" class="w-2.5 h-2.5" />
					{{ p.name }}
					<button type="button" class="hover:text-destructive" @click="toggleTag(p)"><Icon name="lucide:x" class="w-2.5 h-2.5" /></button>
				</span>
			</div>

			<div class="flex items-center justify-end gap-2 pt-1">
				<button type="button" class="text-[12px] text-muted-foreground hover:text-foreground" @click="cancelForm">Cancel</button>
				<button
					type="button"
					:disabled="saving"
					class="text-[12px] font-medium px-3.5 py-1.5 rounded-full bg-foreground text-background disabled:opacity-40"
					@click="save"
				>
					{{ saving ? 'Saving…' : 'Save' }}
				</button>
			</div>
		</div>

		<!-- Timeline -->
		<div v-if="loading" class="space-y-2">
			<div v-for="n in 3" :key="n" class="h-10 rounded-lg bg-muted animate-pulse" />
		</div>
		<div v-else-if="!touchpoints.length" class="text-center py-10 text-sm text-muted-foreground">
			No touchpoints yet. Log the first one to start tracking outreach.
		</div>
		<div v-else class="space-y-3">
			<div v-for="tp in touchpoints" :key="tp.id" class="flex gap-3 text-sm group">
				<div class="flex flex-col items-center">
					<div class="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
						<Icon :name="iconFor(tp.type)" class="w-4 h-4 text-muted-foreground" />
					</div>
					<div class="w-px flex-1 bg-border mt-1" />
				</div>
				<div class="pb-3 flex-1 min-w-0">
					<div class="flex items-center gap-2 flex-wrap">
						<span class="font-medium">{{ labelFor(tp.type) }}</span>
						<span v-if="tp.is_response" class="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 uppercase tracking-wider">Replied</span>
						<span v-else-if="tp.awaiting_response" class="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 uppercase tracking-wider">Awaiting</span>
						<span class="text-muted-foreground/70 text-xs ml-auto whitespace-nowrap">{{ fmtDate(tp.occurred_at || tp.date_created) }}</span>
					</div>
					<p v-if="tp.summary" class="text-foreground/90 mt-0.5">{{ tp.summary }}</p>
					<p v-if="tp.note" class="text-muted-foreground text-xs mt-0.5 italic">{{ tp.note }}</p>
					<p v-if="tp.is_response && tp.response_note" class="text-green-600 dark:text-green-400 text-xs mt-1">↩ {{ tp.response_note }}</p>

					<!-- Participants -->
					<div v-if="tp.participants && tp.participants.length" class="flex flex-wrap gap-1 mt-1.5">
						<span
							v-for="(p, i) in tp.participants"
							:key="`tp-${tp.id}-p-${i}`"
							class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted/70 text-muted-foreground"
						>
							<Icon :name="p.kind === 'member' ? 'lucide:user' : 'lucide:contact'" class="w-2.5 h-2.5" />
							{{ p.name }}
						</span>
					</div>

					<!-- Actions -->
					<div class="flex items-center gap-3 mt-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
						<button
							v-if="!tp.is_response"
							type="button"
							class="text-[11px] text-primary hover:underline"
							@click="openRespond(tp)"
						>
							Mark responded
						</button>
						<button type="button" class="text-[11px] text-muted-foreground hover:text-destructive" @click="removeTouchpoint(tp)">Delete</button>
					</div>

					<!-- Inline respond box -->
					<div v-if="respondingId === tp.id" class="mt-2 flex items-center gap-2">
						<input
							v-model="responseNote"
							type="text"
							placeholder="What came back? (optional)"
							class="flex-1 h-8 px-3 text-xs rounded-full border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/40"
							@keydown.enter="confirmRespond"
						/>
						<button type="button" class="text-[11px] font-medium px-3 py-1.5 rounded-full bg-foreground text-background" @click="confirmRespond">Save</button>
						<button type="button" class="text-[11px] text-muted-foreground" @click="respondingId = null">Cancel</button>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
