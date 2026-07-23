<!--
  Touchpoints — a general communication log (CardDesk-style), scoped to a
  client, project, and/or contact.

  Log a quick touch ("Sent email", "Phone call"), tag the client contacts
  involved (a real m2m relation) plus optional team members, and flag whether
  you're awaiting a reply. Logging on a project also stamps the project's client
  so the touch shows on both. Replaces the project-only ProjectTouchpoints.
-->
<script setup lang="ts">
import {
	TOUCHPOINT_TYPES,
	TOUCHPOINT_ICON,
	TOUCHPOINT_LABEL,
	TOUCHPOINT_FALLBACK_ICON,
	type TouchpointParticipant,
} from '~/utils/touchpoints';

const props = defineProps<{
	organizationId?: string | null;
	clientId?: string | null;
	projectId?: string | null;
	contactId?: string | null;
}>();

const { listForScope, logTouchpoint, markResponded, deleteTouchpoint } = useTouchpoints();
const { fetchFilteredUsers, filteredUsers } = useFilteredUsers();
const contactItems = useDirectusItems('contacts');
const toast = useToast();

// ── Per-org matrix gating (mirrors tickets/tasks: client-side affordance on top
// of the Directus org-scoped row perms). Owner/Admin bypass inside useOrgRole. ──
const { canView, canCreate, canEdit, canDelete } = useOrgRole();
const canViewTp = computed(() => canView('touchpoints'));
const canCreateTp = computed(() => canCreate('touchpoints'));
const canEditTp = computed(() => canEdit('touchpoints'));
const canDeleteTp = computed(() => canDelete('touchpoints'));

const touchpoints = ref<any[]>([]);
const loading = ref(true);

// ── Taggable people ────────────────────────────────────────────────────────
interface ContactOption { id: string; name: string; }
const members = ref<TouchpointParticipant[]>([]);
const clientContacts = ref<ContactOption[]>([]);

async function loadPeople() {
	// Team / org members → participants JSON (no contacts row).
	try {
		if (props.organizationId) await fetchFilteredUsers(props.organizationId);
		members.value = (filteredUsers.value || []).map((u: any) => ({
			kind: 'member' as const,
			id: String(u.id),
			name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Member',
		}));
	} catch { members.value = []; }
	// Client contacts → real m2m relation.
	try {
		if (props.clientId) {
			const rows = (await contactItems.list({
				fields: ['id', 'first_name', 'last_name', 'email'],
				filter: { client: { _eq: props.clientId } },
				sort: ['first_name'],
				limit: 100,
			})) as any[];
			clientContacts.value = rows.map((c) => ({
				id: String(c.id),
				name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Contact',
			}));
		} else if (props.contactId) {
			const c = (await contactItems.get(props.contactId, { fields: ['id', 'first_name', 'last_name', 'email'] })) as any;
			if (c) clientContacts.value = [{ id: String(c.id), name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Contact' }];
		}
	} catch { clientContacts.value = []; }
}

async function load() {
	loading.value = true;
	try {
		touchpoints.value = await listForScope({ clientId: props.clientId, projectId: props.projectId, contactId: props.contactId });
	} catch {
		touchpoints.value = [];
	} finally {
		loading.value = false;
	}
}

onMounted(() => { load(); loadPeople(); });
watch(() => [props.clientId, props.projectId, props.contactId], () => { load(); loadPeople(); });

// ── Log form ─────────────────────────────────────────────────────────────
const formOpen = ref(false);
const saving = ref(false);
const form = reactive<{ type: string; summary: string; note: string; occurred_at: string; awaiting_response: boolean; contactIds: string[]; participants: TouchpointParticipant[] }>({
	type: 'email', summary: '', note: '', occurred_at: '', awaiting_response: false, contactIds: [], participants: [],
});

function resetForm() {
	form.type = 'email';
	form.summary = '';
	form.note = '';
	form.occurred_at = '';
	form.awaiting_response = false;
	// On a contact surface, pre-tag that contact.
	form.contactIds = props.contactId ? [String(props.contactId)] : [];
	form.participants = [];
}

function openForm() { if (!canCreateTp.value) return; resetForm(); formOpen.value = true; }
function cancelForm() { formOpen.value = false; }

function toggleContact(id: string) {
	form.contactIds = form.contactIds.includes(id) ? form.contactIds.filter((x) => x !== id) : [...form.contactIds, id];
}
function isMemberTagged(p: TouchpointParticipant) { return form.participants.some((x) => x.kind === p.kind && x.id === p.id); }
function toggleMember(p: TouchpointParticipant) {
	if (isMemberTagged(p)) form.participants = form.participants.filter((x) => !(x.kind === p.kind && x.id === p.id));
	else form.participants = [...form.participants, p];
}

const tagPickerOpen = ref(false);
const taggedCount = computed(() => form.contactIds.length + form.participants.length);
const anyPeople = computed(() => members.value.length + clientContacts.value.length > 0);

async function save() {
	if (!props.organizationId) {
		toast.add({ title: 'Missing organization', description: 'Cannot log a touchpoint without an org.', color: 'red' });
		return;
	}
	saving.value = true;
	try {
		await logTouchpoint({
			organization: props.organizationId,
			client: props.clientId || null,
			project: props.projectId || null,
			contactIds: form.contactIds,
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
function openRespond(tp: any) { respondingId.value = tp.id; responseNote.value = ''; }
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

async function removeTouchpoint(tp: any) {
	try {
		await deleteTouchpoint(tp.id);
		touchpoints.value = touchpoints.value.filter((t) => t.id !== tp.id);
	} catch (err: any) {
		toast.add({ title: 'Could not delete', description: err?.data?.message || err?.message, color: 'red' });
	}
}

function iconFor(type?: string | null) { return (type && TOUCHPOINT_ICON[type]) || TOUCHPOINT_FALLBACK_ICON; }
function labelFor(type?: string | null) { return (type && TOUCHPOINT_LABEL[type]) || 'Touch'; }

function fmtDate(iso?: string | null) {
	if (!iso) return '';
	try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; }
}

/** Names of the tagged m2m contacts on a touchpoint row. */
function contactNames(tp: any): string[] {
	return (tp.contacts || [])
		.map((j: any) => {
			const c = j?.contacts_id;
			if (!c || typeof c !== 'object') return null;
			return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Contact';
		})
		.filter(Boolean);
}
</script>

<template>
	<div>
		<!-- No access -->
		<div v-if="!canViewTp" class="text-center py-8 text-sm text-muted-foreground">
			You don't have access to touchpoints in this organization.
		</div>

		<template v-else>
		<!-- Header -->
		<div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
			<p class="text-xs text-muted-foreground">Track outreach and follow-up.</p>
			<button
				v-if="!formOpen && canCreateTp"
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
			<div class="flex flex-nowrap gap-1 overflow-x-auto pb-1 -mx-0.5 px-0.5 scrollbar-hide">
				<button
					v-for="opt in TOUCHPOINT_TYPES"
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
				class="w-full h-9 px-3 text-sm rounded-full glass-field focus:outline-none"
			/>
			<textarea
				v-model="form.note"
				rows="2"
				placeholder="Optional note…"
				class="w-full px-3 py-2 text-sm rounded-2xl glass-field focus:outline-none resize-none"
			/>

			<!-- Meta row: date + awaiting toggle + tag people -->
			<div class="flex items-center gap-2 flex-wrap">
				<input
					v-model="form.occurred_at"
					type="datetime-local"
					class="h-8 px-2.5 text-xs rounded-full glass-field text-muted-foreground"
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
						{{ taggedCount ? `${taggedCount} tagged` : 'Tag people' }}
					</button>
					<template v-if="tagPickerOpen">
						<div class="fixed inset-0 z-40" @click="tagPickerOpen = false" />
						<div class="absolute z-50 top-full left-0 mt-1.5 w-64 max-h-72 overflow-auto rounded-2xl border border-border bg-card shadow-xl p-1.5" @click.stop>
							<p v-if="clientContacts.length" class="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Client contacts</p>
							<button
								v-for="c in clientContacts"
								:key="`c-${c.id}`"
								type="button"
								class="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-sm text-left hover:bg-primary/5"
								@click="toggleContact(c.id)"
							>
								<Icon :name="form.contactIds.includes(c.id) ? 'lucide:check-square' : 'lucide:square'" class="w-3.5 h-3.5 shrink-0" :class="form.contactIds.includes(c.id) ? 'text-primary' : 'text-muted-foreground/50'" />
								<span class="truncate">{{ c.name }}</span>
							</button>
							<p v-if="members.length" class="px-2 py-1 mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Team</p>
							<button
								v-for="p in members"
								:key="`m-${p.id}`"
								type="button"
								class="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-sm text-left hover:bg-primary/5"
								@click="toggleMember(p)"
							>
								<Icon :name="isMemberTagged(p) ? 'lucide:check-square' : 'lucide:square'" class="w-3.5 h-3.5 shrink-0" :class="isMemberTagged(p) ? 'text-primary' : 'text-muted-foreground/50'" />
								<span class="truncate">{{ p.name }}</span>
							</button>
						</div>
					</template>
				</div>
			</div>

			<!-- Selected chips -->
			<div v-if="taggedCount" class="flex flex-wrap gap-1">
				<span
					v-for="c in clientContacts.filter((x) => form.contactIds.includes(x.id))"
					:key="`sel-c-${c.id}`"
					class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary"
				>
					<Icon name="lucide:contact" class="w-2.5 h-2.5" />
					{{ c.name }}
					<button type="button" class="hover:text-destructive" @click="toggleContact(c.id)"><Icon name="lucide:x" class="w-2.5 h-2.5" /></button>
				</span>
				<span
					v-for="p in form.participants"
					:key="`sel-m-${p.id}`"
					class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-foreground"
				>
					<Icon name="lucide:user" class="w-2.5 h-2.5" />
					{{ p.name }}
					<button type="button" class="hover:text-destructive" @click="toggleMember(p)"><Icon name="lucide:x" class="w-2.5 h-2.5" /></button>
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

					<!-- Tagged people: m2m contacts + participant tags -->
					<div v-if="contactNames(tp).length || (tp.participants && tp.participants.length)" class="flex flex-wrap gap-1 mt-1.5">
						<span
							v-for="(name, i) in contactNames(tp)"
							:key="`tp-${tp.id}-c-${i}`"
							class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary"
						>
							<Icon name="lucide:contact" class="w-2.5 h-2.5" />
							{{ name }}
						</span>
						<span
							v-for="(p, i) in (tp.participants || [])"
							:key="`tp-${tp.id}-p-${i}`"
							class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted/70 text-muted-foreground"
						>
							<Icon name="lucide:user" class="w-2.5 h-2.5" />
							{{ p.name }}
						</span>
					</div>

					<!-- Actions -->
					<div v-if="canEditTp || canDeleteTp" class="flex items-center gap-3 mt-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
						<button
							v-if="!tp.is_response && canEditTp"
							type="button"
							class="text-[11px] text-primary hover:underline"
							@click="openRespond(tp)"
						>
							Mark responded
						</button>
						<button v-if="canDeleteTp" type="button" class="text-[11px] text-muted-foreground hover:text-destructive" @click="removeTouchpoint(tp)">Delete</button>
					</div>

					<!-- Inline respond box -->
					<div v-if="respondingId === tp.id" class="mt-2 flex items-center gap-2">
						<input
							v-model="responseNote"
							type="text"
							placeholder="What came back? (optional)"
							class="flex-1 h-8 px-3 text-xs rounded-full glass-field focus:outline-none"
							@keydown.enter="confirmRespond"
						/>
						<button type="button" class="text-[11px] font-medium px-3 py-1.5 rounded-full bg-foreground text-background" @click="confirmRespond">Save</button>
						<button type="button" class="text-[11px] text-muted-foreground" @click="respondingId = null">Cancel</button>
					</div>
				</div>
			</div>
		</div>
		</template>
	</div>
</template>
