<!--
  Touchpoints — a general communication log (CardDesk-style), scoped to a
  client, project, and/or contact.

  This surface renders the LIST; logging a new touch opens the extracted
  <AppsTouchpointLogForm> inside a stacked slide-over (TouchpointPanel, create
  mode) so it reads as part of the same slide-over family as every other
  create. The panel bumps a shared signal on save; we reload the list.
-->
<script setup lang="ts">
import {
	TOUCHPOINT_ICON,
	TOUCHPOINT_LABEL,
	TOUCHPOINT_FALLBACK_ICON,
} from '~/utils/touchpoints';

const props = defineProps<{
	organizationId?: string | null;
	clientId?: string | null;
	projectId?: string | null;
	contactId?: string | null;
	/** Lead scope — pursuit history before a client exists. */
	leadId?: string | number | null;
}>();

const { listForScope, markResponded, deleteTouchpoint } = useTouchpoints();
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

async function load() {
	loading.value = true;
	try {
		touchpoints.value = await listForScope({ clientId: props.clientId, projectId: props.projectId, contactId: props.contactId, leadId: props.leadId });
	} catch {
		touchpoints.value = [];
	} finally {
		loading.value = false;
	}
}

onMounted(load);
watch(() => [props.clientId, props.projectId, props.contactId, props.leadId], load);

// ── Log form → stacked slide-over (TouchpointPanel). The panel notifies via
// the shared `created:touchpoint` signal on save; we reload the list. ──
const { openCreate: openTouchpointCreate, onCreated: onTouchpointCreatedPanel } = useCreatePanel('touchpoint');
onTouchpointCreatedPanel(() => load());
function openLog() {
	if (!canCreateTp.value) return;
	openTouchpointCreate({
		organizationId: props.organizationId,
		clientId: props.clientId,
		projectId: props.projectId,
		contactId: props.contactId,
		leadId: props.leadId,
	});
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
				v-if="canCreateTp"
				type="button"
				class="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-medium bg-foreground text-background ios-press"
				@click="openLog"
			>
				<Icon name="lucide:plus" class="w-3.5 h-3.5" />
				Log touchpoint
			</button>
		</div>

		<!-- Timeline -->
		<div v-if="loading" class="space-y-2">
			<div v-for="n in 3" :key="n" class="h-10 rounded-lg bg-muted animate-pulse" />
		</div>
		<div v-else-if="!touchpoints.length" class="text-center py-10 helper-text">
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
