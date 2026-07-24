<!--
  TouchpointLogForm — the "log a touchpoint" composer, extracted from
  <AppsTouchpoints> so it can render either inline (in the list) or hosted
  inside a slide-over stack panel (TouchpointPanel, create mode).

  Owns its own people-loading (team members + client contacts), form state,
  tag picker, and save. Scope comes in via props; on success it emits `saved`
  (with the created row) so the host can refresh + pop. `cancel` is emitted
  from the inline Cancel button (hidden when embedded — the shell closes).
-->
<script setup lang="ts">
import {
	TOUCHPOINT_TYPES,
	type TouchpointParticipant,
} from '~/utils/touchpoints';

const props = defineProps<{
	organizationId?: string | null;
	clientId?: string | null;
	projectId?: string | null;
	contactId?: string | null;
	leadId?: string | number | null;
	/** Hosted inside a stack panel — hide the inline Cancel (shell closes). */
	embedded?: boolean;
}>();

const emit = defineEmits<{ (e: 'saved', row: any): void; (e: 'cancel'): void }>();

const { logTouchpoint } = useTouchpoints();
const { fetchFilteredUsers, filteredUsers } = useFilteredUsers();
const contactItems = useDirectusItems('contacts');
const toast = useToast();

// ── Taggable people ────────────────────────────────────────────────────────
interface ContactOption { id: string; name: string; }
const members = ref<TouchpointParticipant[]>([]);
const clientContacts = ref<ContactOption[]>([]);
const defaultClientContactId = ref<string | null>(null);

async function loadPeople() {
	try {
		if (props.organizationId) await fetchFilteredUsers(props.organizationId);
		members.value = (filteredUsers.value || []).map((u: any) => ({
			kind: 'member' as const,
			id: String(u.id),
			name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Member',
		}));
	} catch { members.value = []; }
	try {
		if (props.clientId) {
			const rows = (await contactItems.list({
				fields: ['id', 'first_name', 'last_name', 'email', 'is_billing_contact'],
				filter: { client: { _eq: props.clientId } },
				sort: ['first_name'],
				limit: 100,
			})) as any[];
			clientContacts.value = rows.map((c) => ({
				id: String(c.id),
				name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Contact',
			}));
			const billing = rows.find((c) => c.is_billing_contact);
			defaultClientContactId.value = billing ? String(billing.id) : (rows[0] ? String(rows[0].id) : null);
		} else if (props.contactId) {
			const c = (await contactItems.get(props.contactId, { fields: ['id', 'first_name', 'last_name', 'email'] })) as any;
			if (c) clientContacts.value = [{ id: String(c.id), name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Contact' }];
		}
	} catch { clientContacts.value = []; }
	// Seed the default tag now that people are known.
	if (!form.contactIds.length) {
		form.contactIds = props.contactId
			? [String(props.contactId)]
			: (defaultClientContactId.value ? [defaultClientContactId.value] : []);
	}
}

// ── Form ─────────────────────────────────────────────────────────────────
const saving = ref(false);
const form = reactive<{ type: string; summary: string; note: string; occurred_at: string; awaiting_response: boolean; contactIds: string[]; participants: TouchpointParticipant[] }>({
	type: 'email', summary: '', note: '', occurred_at: '', awaiting_response: false, contactIds: [], participants: [],
});

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
		const row = await logTouchpoint({
			organization: props.organizationId,
			client: props.clientId || null,
			project: props.projectId || null,
			lead: props.leadId || null,
			contactIds: form.contactIds,
			type: form.type,
			summary: form.summary.trim() || undefined,
			note: form.note.trim() || undefined,
			occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : undefined,
			awaiting_response: form.awaiting_response,
			participants: form.participants,
		});
		toast.add({ title: 'Touchpoint logged', color: 'green' });
		emit('saved', row);
	} catch (err: any) {
		toast.add({ title: 'Could not log touchpoint', description: err?.data?.message || err?.message, color: 'red' });
	} finally {
		saving.value = false;
	}
}

onMounted(loadPeople);
watch(() => [props.clientId, props.projectId, props.contactId, props.leadId, props.organizationId], loadPeople);
</script>

<template>
	<div class="space-y-2.5" :class="{ 'ios-card p-3': !embedded }">
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
			<button v-if="!embedded" type="button" class="text-[12px] text-muted-foreground hover:text-foreground" @click="emit('cancel')">Cancel</button>
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
</template>
