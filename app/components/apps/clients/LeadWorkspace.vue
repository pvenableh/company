<!--
	LeadWorkspace — shared body for the lead detail surface.

	Mounted by BOTH `/leads/[id]` (full-page deep-link receiver) and
	`panels/LeadPanel.vue` (slide-over) so the two surfaces can't drift.

	`:compact` hides the chrome the slide-over shell already provides
	(the outer back-link, the inline h1 + contact subtitle, the AI sidebar
	overlay which would render inside the transformed container instead of
	at viewport level — see [AppSlideOverShell.vue]). It also skips
	setEntity/clearEntity so the panel doesn't hijack the page-level AI
	entity context. In compact mode, the Contact "View" pivot pushes the
	ContactPanel instead of route-navigating.
-->
<script setup lang="ts">
import { LEAD_STAGE_LABELS } from '~~/shared/leads';
import type { LeadStage } from '~~/shared/leads';
import { Button } from '~/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';

const props = defineProps<{
	leadId: string;
	compact?: boolean;
}>();

const emit = defineEmits<{
	loaded: [lead: any];
	back: [];
}>();

const toast = useToast();
const { push: pushPanel } = useAppSlideOverStack();
const proposalSlide = useAppSlideOver('proposal');

// Tab state — `?view=documents` swaps the body between overview (sidebar +
// activity) and Documents (proposals + contracts scoped to this lead).
type LeadView = 'overview' | 'documents';
const VIEW_KEYS: LeadView[] = ['overview', 'documents'];
const route = useRoute();
const router = useRouter();
const view = ref<LeadView>(
	!props.compact && typeof route.query.view === 'string' && VIEW_KEYS.includes(route.query.view as LeadView)
		? (route.query.view as LeadView)
		: 'overview',
);
watch(view, (next) => {
	if (props.compact) return; // panel mode: don't pollute the parent URL
	router.replace({ query: { ...route.query, view: next === 'overview' ? undefined : next } });
});

const docsProposalCount = ref(0);
const docsContractCount = ref(0);
// Tab strip items for the universal <ETabs> control (matches Client/Project).
const viewTabs = computed(() => [
	{ key: 'overview', label: 'Overview', icon: 'lucide:layout-dashboard' },
	{ key: 'documents', label: 'Documents', icon: 'lucide:files', count: docsProposalCount.value + docsContractCount.value || null },
]);
const docsProposalsRef = ref<any>(null);
const docsContractsRef = ref<any>(null);
const showCreateProposalModal = ref(false);
const showCreateContractModal = ref(false);
function onDocCreated() {
	showCreateProposalModal.value = false;
	showCreateContractModal.value = false;
	docsProposalsRef.value?.refresh?.();
	docsContractsRef.value?.refresh?.();
}

const { getLead, updateLeadStageWithAutomation, addLeadToList } = useLeads();
// Lead pursuit history now lives in the unified `touchpoints` collection (via a
// `lead` FK) instead of the legacy lead_activities. We keep this UI and adapt
// touchpoint rows back to the activity shape the timeline expects.
const { listForScope, logTouchpoint } = useTouchpoints();
const { getPriorityBadgeClass } = useStatusStyle();
const { getLists } = useMailingLists();
const { removeFromList } = useContacts();
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();

const lead = ref<any>(null);
const activities = ref<any[]>([]);
const loading = ref(true);
const stageUpdating = ref(false);

// Modals
const showFormModal = ref(false);
const showConversionModal = ref(false);
const showLostReasonModal = ref(false);
const drafting = ref(false);
const { createProposal } = useProposals();

async function generateDraft() {
	if (!lead.value?.id || drafting.value) return;
	drafting.value = true;
	try {
		const draft = await $fetch<any>(`/api/ai/draft-proposal/${lead.value.id}`, { method: 'POST' });
		const created = await createProposal({
			title: draft.title,
			total_value: draft.total_value,
			valid_until: draft.valid_until,
			blocks: draft.blocks,
			lead: lead.value.id,
			organization: lead.value.organization?.id || lead.value.organization,
			contact: lead.value.related_contact?.id || lead.value.related_contact || null,
			proposal_status: 'draft',
		});
		toast.add({
			title: 'Draft ready',
			description: draft.suggested_template_name
				? `Starting from template: ${draft.suggested_template_name}`
				: 'Opening the new proposal.',
			color: 'green',
		});
		if (created?.id) {
			view.value = 'documents';
			docsProposalsRef.value?.refresh?.();
			await proposalSlide.open(String(created.id));
		}
	} catch (err: any) {
		console.error('[draft-proposal]', err);
		toast.add({
			title: 'Draft failed',
			description: err?.data?.statusMessage || err?.message || 'Try again in a moment.',
			color: 'red',
		});
	} finally {
		drafting.value = false;
	}
}

// Earnest pursuit strategist — reads the full pursuit history and drafts a fresh
// re-approach for a stalled/cold deal. One-shot structured suggestion; the user
// can turn the suggested touch into a real one with a tap.
const reApproach = ref<{ strategic_read: string; next_touchpoint: { type: string; summary: string; note: string }; proposal_angle: string | null } | null>(null);
const reApproaching = ref(false);
const addingReApproach = ref(false);
async function draftReApproach() {
	if (!lead.value?.id || reApproaching.value) return;
	reApproaching.value = true;
	reApproach.value = null;
	try {
		reApproach.value = await $fetch<any>(`/api/ai/pursuit-strategy/${lead.value.id}`, { method: 'POST' });
	} catch (err: any) {
		toast.add({ title: 'Could not draft a re-approach', description: err?.data?.message || err?.message || 'Try again.', color: 'red' });
	} finally {
		reApproaching.value = false;
	}
}
async function addReApproachTouch() {
	const t = reApproach.value?.next_touchpoint;
	if (!t || addingReApproach.value) return;
	addingReApproach.value = true;
	try {
		await logTouchpoint({
			organization: lead.value?.organization?.id || lead.value?.organization,
			lead: Number(props.leadId),
			type: t.type,
			summary: t.summary,
			note: t.note || undefined,
			awaiting_response: true,
			...(reApproach.value?.proposal_angle ? { next_action: reApproach.value.proposal_angle } : {}),
			contactIds: lead.value?.related_contact?.id ? [String(lead.value.related_contact.id)] : [],
		});
		reApproach.value = null;
		await loadLeadActivities();
		pursuitRef.value?.refresh?.();
		toast.add({ title: 'Added as a touchpoint', color: 'green' });
	} catch (err: any) {
		toast.add({ title: 'Could not add touchpoint', description: err?.message, color: 'red' });
	} finally {
		addingReApproach.value = false;
	}
}

// One "New" menu for the Documents tab — collapses the three per-section
// create buttons (AI-draft proposal / blank proposal / blank contract) into a
// single entry point.
const leadDocActions = computed(() => [
	{ label: 'AI-draft a proposal', icon: 'lucide:sparkles', click: () => { void generateDraft(); } },
	{ label: 'New proposal', icon: 'lucide:file-plus', click: () => { showCreateProposalModal.value = true; } },
	{ label: 'New contract', icon: 'lucide:file-signature', click: () => { showCreateContractModal.value = true; } },
]);

// Activity form
const showActivityForm = ref(false);
const newActivity = reactive({
	activity_type: 'note',
	subject: '',
	description: '',
	outcome: '',
	next_action: '',
});
const activitySaving = ref(false);
const pursuitRef = ref<any>(null);

// touchpoint row → the activity shape <LeadsActivityTimeline> renders.
function tpToActivity(tp: any) {
	const c = tp?.contacts?.[0]?.contacts_id;
	return {
		id: tp.id,
		activity_type: tp.type,
		subject: tp.summary,
		description: tp.note,
		outcome: tp.outcome,
		next_action: tp.next_action,
		activity_date: tp.occurred_at || tp.date_created,
		date_created: tp.date_created,
		contact: c ? { id: c.id, first_name: c.first_name, last_name: c.last_name } : null,
	};
}
async function loadLeadActivities() {
	const rows = await listForScope({ leadId: props.leadId }).catch((err) => {
		console.warn('[LeadWorkspace] touchpoints fetch failed (degrading to empty):', err);
		return [];
	});
	activities.value = (rows as any[]).map(tpToActivity);
}

// Stage statuses for FormStatusTimeline
const stageStatuses = Object.entries(LEAD_STAGE_LABELS).map(([id, name]) => ({ id, name }));

async function fetchData() {
	loading.value = true;
	try {
		lead.value = await getLead(props.leadId);
		if (!props.compact) {
			useHead({ title: `${lead.value?.related_contact?.first_name || 'Lead'} | Earnest` });
		}
		if (lead.value) emit('loaded', lead.value);
		await loadLeadActivities();
	} catch (e) {
		console.error('Failed to load lead:', e);
	} finally {
		loading.value = false;
	}
}

watch(() => props.leadId, fetchData, { immediate: true });

async function handleStageChange(e: { oldStatus: string; newStatus: string }) {
	const newStage = e.newStatus as LeadStage;

	if (newStage === 'won') {
		showConversionModal.value = true;
		return;
	}
	if (newStage === 'lost') {
		showLostReasonModal.value = true;
		return;
	}

	stageUpdating.value = true;
	try {
		await updateLeadStageWithAutomation(props.leadId, newStage, lead.value?.stage);
		lead.value.stage = newStage;
		await loadLeadActivities();
	} finally {
		stageUpdating.value = false;
	}
}

async function handleAddActivity() {
	if (!newActivity.subject.trim()) return;
	activitySaving.value = true;
	try {
		await logTouchpoint({
			organization: lead.value?.organization?.id || lead.value?.organization,
			lead: Number(props.leadId),
			type: newActivity.activity_type,
			summary: newActivity.subject,
			note: newActivity.description || undefined,
			outcome: newActivity.outcome || undefined,
			next_action: newActivity.next_action || undefined,
			contactIds: lead.value?.related_contact?.id ? [String(lead.value.related_contact.id)] : [],
		});
		showActivityForm.value = false;
		Object.assign(newActivity, { activity_type: 'note', subject: '', description: '', outcome: '', next_action: '' });
		await loadLeadActivities();
	} finally {
		activitySaving.value = false;
	}
}

function handleModalUpdated() {
	fetchData();
	showFormModal.value = false;
}

function handleConverted() {
	fetchData();
	showConversionModal.value = false;
}

function handleLost() {
	fetchData();
	showLostReasonModal.value = false;
}

const isOverdueFollowUp = computed(() => {
	if (!lead.value?.next_follow_up) return false;
	return new Date(lead.value.next_follow_up) < new Date();
});

// ── Inline-editable details (autosaves to the `leads` collection) ──
const LEAD_DETAIL_FIELDS = [
	{ key: 'priority', label: 'Priority', type: 'select', options: [
		{ value: 'low', label: 'Low' },
		{ value: 'medium', label: 'Medium' },
		{ value: 'high', label: 'High' },
		{ value: 'urgent', label: 'Urgent' },
	] },
	{ key: 'source', label: 'Source', type: 'select', options: [
		{ value: 'business card', label: 'Business card' },
		{ value: 'call', label: 'Call' },
		{ value: 'website', label: 'Website' },
		{ value: 'referral', label: 'Referral' },
		{ value: 'event', label: 'Event' },
	] },
	{ key: 'estimated_value', label: 'Estimated Value', type: 'number', prefix: '$', placeholder: '0' },
	{ key: 'timeline', label: 'Timeline', type: 'select', options: [
		{ value: 'urgent', label: 'Urgent' },
		{ value: '1-3 months', label: '1–3 months' },
		{ value: '3-6 months', label: '3–6 months' },
		{ value: 'flexible', label: 'Flexible' },
	] },
	{ key: 'next_follow_up', label: 'Next Follow-up', type: 'date' },
	{ key: 'project_type', label: 'Project Type', type: 'text', placeholder: 'e.g. Website redesign' },
	{ key: 'notes', label: 'Notes', type: 'textarea', rows: 4, placeholder: 'Internal notes…' },
] as const;

const leadDetailValues = computed(() => ({
	priority: lead.value?.priority ?? '',
	source: lead.value?.source ?? '',
	estimated_value: lead.value?.estimated_value ?? '',
	timeline: lead.value?.timeline ?? '',
	next_follow_up: lead.value?.next_follow_up ? String(lead.value.next_follow_up).slice(0, 10) : '',
	project_type: lead.value?.project_type ?? '',
	notes: lead.value?.notes ?? '',
}));

// ── Mailing list membership ──
const availableLists = ref<any[]>([]);
const showListPicker = ref(false);
const selectedListId = ref<number | null>(null);
const listBusy = ref(false);

const leadLists = computed(() => {
	const memberships = lead.value?.related_contact?.lists || [];
	return memberships.filter((m: any) => m?.subscribed);
});
const leadListIds = computed(() =>
	leadLists.value.map((m: any) => (typeof m.list_id === 'object' ? m.list_id?.id : m.list_id)).filter(Boolean),
);
const listsToShow = computed(() =>
	availableLists.value.filter((l: any) => !leadListIds.value.includes(l.id)),
);

async function loadAvailableLists() {
	try {
		availableLists.value = (await getLists()) as any[];
	} catch {
		availableLists.value = [];
	}
}

async function handleAddToList() {
	if (!selectedListId.value || !lead.value?.id) return;
	listBusy.value = true;
	try {
		const { created } = await addLeadToList(lead.value.id, selectedListId.value, 'lead_detail');
		toast.add({
			title: created ? 'Lead promoted to contact + added to list' : 'Added to list',
			color: 'green',
		});
		showListPicker.value = false;
		selectedListId.value = null;
		await fetchData();
	} catch (err: any) {
		toast.add({ title: 'Failed to add to list', description: err?.message, color: 'red' });
	} finally {
		listBusy.value = false;
	}
}

async function handleRemoveFromList(listId: number) {
	const contactId = typeof lead.value?.related_contact === 'object'
		? lead.value?.related_contact?.id
		: lead.value?.related_contact;
	if (!contactId || !listId) return;
	listBusy.value = true;
	try {
		await removeFromList(contactId, listId);
		toast.add({ title: 'Removed from list', color: 'green' });
		await fetchData();
	} catch (err: any) {
		toast.add({ title: 'Failed to remove from list', description: err?.message, color: 'red' });
	} finally {
		listBusy.value = false;
	}
}

// ── Meeting integration ──
const showMeetingModal = ref(false);
const upcomingMeetings = ref<any[]>([]);
const upcomingMeetingsLoading = ref(false);
const videoMeetingItems = useDirectusItems('video_meetings');

async function fetchUpcomingMeetings() {
	upcomingMeetingsLoading.value = true;
	try {
		const results = await videoMeetingItems.list({
			fields: ['id', 'title', 'scheduled_start', 'meeting_url', 'status', 'room_name'],
			filter: {
				related_lead: { _eq: props.leadId },
				status: { _eq: 'scheduled' },
				scheduled_start: { _gte: new Date().toISOString() },
			},
			sort: ['scheduled_start'],
			limit: 10,
		});
		upcomingMeetings.value = results || [];
	} catch { upcomingMeetings.value = []; }
	finally { upcomingMeetingsLoading.value = false; }
}

const handleMeetingCreated = () => {
	showMeetingModal.value = false;
	fetchUpcomingMeetings();
	loadLeadActivities();
};

onMounted(() => {
	fetchUpcomingMeetings();
	loadAvailableLists();
});

// AI sidebar context — only set when running as a full page (panel parent
// already owns the page-level entity context).
watch(lead, (l) => {
	if (props.compact || !l) return;
	const contact = l.related_contact;
	const name = contact && typeof contact === 'object'
		? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.company
		: '';
	setEntity('lead', l.id, name || 'Lead');
}, { immediate: true });

onBeforeUnmount(() => {
	if (!props.compact) clearEntity();
});

function openContactPivot() {
	const c = lead.value?.related_contact;
	if (!c?.id) return;
	if (props.compact) pushPanel('contact', String(c.id));
	else router.push(`/apps/clients?view=contacts&slide=contact:${c.id}`);
}
</script>

<template>
	<div :class="compact ? '' : 'max-w-[2600px] mx-auto'">
		<!-- Loading -->
		<div v-if="loading" class="flex items-center justify-center py-20">
			<EIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-muted-foreground/40" />
		</div>

		<template v-else-if="lead">
			<!-- Slide-over only: the page header already has "Ask Earnest". The
			     entity-scoped prompts (old Create menu) live in the panel. -->
			<div v-if="compact" class="flex justify-end mb-3">
				<UiActionButton icon="earnest" variant="primary" hide-label="sm" @click="sidebarOpen = true">
					Ask Earnest
				</UiActionButton>
			</div>

			<!-- Page-mode header -->
			<div v-if="!compact" class="mb-6">
				<BackButton to="/apps/clients?view=leads" label="Back to leads" class="mb-3" />
				<div class="flex items-start justify-between">
					<div>
						<h1 class="text-xl font-bold text-foreground">
							{{ lead.related_contact?.first_name }} {{ lead.related_contact?.last_name }}
						</h1>
						<p class="text-sm text-muted-foreground">
							{{ lead.related_contact?.company }}
							<span v-if="lead.related_contact?.email"> · {{ lead.related_contact.email }}</span>
						</p>
						<div v-if="Array.isArray(lead.tags) && lead.tags.length" class="flex flex-wrap gap-1.5 mt-2">
							<ContactsContactTagBadge v-for="tag in lead.tags" :key="tag" :tag="tag" />
						</div>
					</div>
					<TooltipProvider :delay-duration="200">
						<div class="flex items-center gap-1.5">
							<UiActionButton icon="earnest" variant="primary" hide-label="sm" @click="sidebarOpen = true">
								Ask Earnest
							</UiActionButton>
							<UiActionButton icon="lucide:pencil" @click="showFormModal = true" hide-label="sm">
								Edit
							</UiActionButton>
							<UiActionButton icon="lucide:video" variant="primary" @click="showMeetingModal = true" hide-label="sm">
								Meeting
							</UiActionButton>
							<Tooltip>
								<TooltipTrigger as-child>
									<UiActionButton
										icon="earnest"
										variant="primary"
										:loading="drafting"
										hide-label="sm"
										spend
										@click="generateDraft"
									>
										AI Draft
									</UiActionButton>
								</TooltipTrigger>
								<TooltipContent side="bottom" :side-offset="8" class="max-w-xs text-xs leading-snug">
									Generates a tailored proposal draft from this lead's context — contact, company, scope notes, past won-lead patterns. Drops the result straight into a new proposal you can edit.
								</TooltipContent>
							</Tooltip>
							<UiActionButton icon="lucide:file-plus" @click="showCreateProposalModal = true">
								Proposal
							</UiActionButton>
						</div>
					</TooltipProvider>
				</div>
			</div>

			<!-- Compact header strip: tags + key actions -->
			<div v-else class="px-4 pt-3 pb-2 space-y-2">
				<div v-if="Array.isArray(lead.tags) && lead.tags.length" class="flex flex-wrap gap-1.5">
					<ContactsContactTagBadge v-for="tag in lead.tags" :key="tag" :tag="tag" />
				</div>
				<TooltipProvider :delay-duration="200">
					<div class="flex items-center gap-1.5 flex-wrap">
						<UiActionButton icon="lucide:pencil" @click="showFormModal = true">
							Edit
						</UiActionButton>
						<UiActionButton icon="lucide:video" variant="primary" @click="showMeetingModal = true">
							Meeting
						</UiActionButton>
						<Tooltip>
							<TooltipTrigger as-child>
								<UiActionButton
									icon="earnest"
									variant="primary"
									:loading="drafting"
									spend
									@click="generateDraft"
								>
									AI Draft
								</UiActionButton>
							</TooltipTrigger>
							<TooltipContent side="bottom" :side-offset="8" class="max-w-xs text-xs leading-snug">
								Generates a tailored proposal draft from this lead's context.
							</TooltipContent>
						</Tooltip>
						<UiActionButton icon="lucide:file-plus" @click="showCreateProposalModal = true">
							Proposal
						</UiActionButton>
					</div>
				</TooltipProvider>
			</div>

			<div :class="compact ? 'px-4 pb-4 space-y-4' : ''">
				<!-- AI Notices (page mode only — entity context not set in compact) -->
				<ClientOnly v-if="!compact">
					<AIProactiveNotices v-if="lead?.id" entity-type="lead" :entity-id="String(lead.id)" />
				</ClientOnly>

				<!-- Pipeline Stage Timeline -->
				<div class="ios-card p-4" :class="!compact && 'mb-6'">
					<p class="text-[10px] uppercase font-semibold text-muted-foreground/40 tracking-wider mb-3">Pipeline Stage</p>
					<FormStatusTimeline
						:currentStatus="lead.stage"
						:statuses="stageStatuses"
						collection="leads"
						:itemId="String(lead.id)"
						:loading="stageUpdating"
						@status-change="handleStageChange"
					/>
				</div>

				<!-- View tab strip — the app-wide universal <ETabs> (matches Client/Project). -->
				<ETabs v-model="view" :items="viewTabs" :class="!compact && 'mb-5'" />

				<!-- Documents tab body -->
				<div v-if="view === 'documents'" class="ios-card p-4 sm:p-6 space-y-6">
					<!-- Single entry point for all lead documents — collapses the three
					     per-section create buttons (AI-draft proposal / blank proposal /
					     contract) into one "New" menu. -->
					<div class="flex items-center justify-between">
						<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							Documents
						</h4>
						<EDropdown :items="leadDocActions">
							<button
								type="button"
								class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
								:disabled="drafting"
							>
								<Icon :name="drafting ? 'lucide:loader-2' : 'lucide:plus'" class="w-3 h-3" :class="drafting ? 'animate-spin' : ''" />
								New
								<Icon name="lucide:chevron-down" class="w-3 h-3 opacity-70" />
							</button>
						</EDropdown>
					</div>
					<section>
						<div class="flex items-center justify-between mb-3">
							<div class="flex items-center gap-2">
								<Icon name="lucide:file-text" class="w-4 h-4 text-muted-foreground" />
								<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									Proposals
								</h4>
								<span class="text-[10px] text-muted-foreground/70">{{ docsProposalCount }}</span>
							</div>
						</div>
						<MoneyProposalsList
							ref="docsProposalsRef"
							:lead-id="lead.id"
							@count="docsProposalCount = $event"
						/>
					</section>

					<section>
						<div class="flex items-center justify-between mb-3">
							<div class="flex items-center gap-2">
								<Icon name="lucide:file-signature" class="w-4 h-4 text-muted-foreground" />
								<h4 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									Contracts
								</h4>
								<span class="text-[10px] text-muted-foreground/70">{{ docsContractCount }}</span>
							</div>
						</div>
						<MoneyContractsList
							ref="docsContractsRef"
							:lead-id="lead.id"
							@count="docsContractCount = $event"
						/>
					</section>
				</div>

				<!-- Overview body -->
				<div v-else :class="compact ? 'space-y-4' : 'grid grid-cols-1 lg:grid-cols-3 gap-6'">
					<!-- Pursuit money — what's still out there on this deal. -->
					<AppsPursuitMoney :lead-id="Number(leadId)" class="lg:col-span-3" />
					<!-- Left: Lead info -->
					<div :class="compact ? 'space-y-4' : 'lg:col-span-1 space-y-4'">
						<!-- Editable Details -->
						<div class="ios-card p-4 space-y-3">
							<p class="text-[10px] uppercase font-semibold text-muted-foreground/40 tracking-wider">Details</p>
							<AppsInlineDetailsEditor
								collection="leads"
								:item-id="String(lead.id)"
								:model-value="leadDetailValues"
								:fields="LEAD_DETAIL_FIELDS as any"
								@updated="patch => Object.assign(lead, patch)"
							/>
						</div>

						<!-- At-a-glance -->
						<div class="ios-card p-4 space-y-3">
							<p class="text-[10px] uppercase font-semibold text-muted-foreground/40 tracking-wider">At a Glance</p>
							<div class="grid grid-cols-2 gap-2 text-xs">
								<div>
									<p class="text-muted-foreground/40">Score</p>
									<p class="font-medium text-foreground">{{ lead.lead_score || 0 }}/100</p>
								</div>
								<div>
									<p class="text-muted-foreground/40">Priority</p>
									<span
										class="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded text-white"
										:class="getPriorityBadgeClass(lead.priority)"
									>
										{{ lead.priority || 'none' }}
									</span>
								</div>
								<div>
									<p class="text-muted-foreground/40">Source</p>
									<p class="font-medium text-foreground">{{ lead.source || '—' }}</p>
								</div>
								<div>
									<p class="text-muted-foreground/40">Value</p>
									<p class="font-medium text-foreground">{{ lead.estimated_value ? `$${Number(lead.estimated_value).toLocaleString()}` : '—' }}</p>
								</div>
								<div>
									<p class="text-muted-foreground/40">Timeline</p>
									<p class="font-medium text-foreground capitalize">{{ lead.timeline || '—' }}</p>
								</div>
								<div>
									<p class="text-muted-foreground/40">Next Follow-up</p>
									<p class="font-medium" :class="isOverdueFollowUp ? 'text-destructive' : 'text-foreground'">
										{{ lead.next_follow_up ? new Date(lead.next_follow_up).toLocaleDateString() : '—' }}
										<span v-if="isOverdueFollowUp" class="text-[9px] font-semibold ml-1">OVERDUE</span>
									</p>
								</div>
							</div>
						</div>

						<!-- Contact -->
						<div v-if="lead.related_contact" class="ios-card p-4 space-y-2">
							<div class="flex items-center justify-between">
								<p class="text-[10px] uppercase font-semibold text-muted-foreground/40 tracking-wider">Contact</p>
								<button
									type="button"
									class="text-[10px] text-primary hover:underline"
									@click="openContactPivot"
								>
									View
								</button>
							</div>
							<p class="text-sm font-medium text-foreground">{{ lead.related_contact.first_name }} {{ lead.related_contact.last_name }}</p>
							<p v-if="lead.related_contact.email" class="text-xs text-muted-foreground">{{ lead.related_contact.email }}</p>
							<p v-if="lead.related_contact.phone" class="text-xs text-muted-foreground">{{ lead.related_contact.phone }}</p>
							<p v-if="lead.related_contact.company" class="text-xs text-muted-foreground">{{ lead.related_contact.company }}</p>
						</div>

						<!-- Email Engagement -->
						<div v-if="lead.related_contact" class="ios-card p-4 space-y-2">
							<p class="text-[10px] uppercase font-semibold text-muted-foreground/40 tracking-wider">Email Engagement</p>
							<div v-if="lead.related_contact.email_bounced" class="flex items-center gap-1.5 text-[11px] text-destructive dark:text-destructive">
								<EIcon name="i-heroicons-exclamation-triangle" class="w-3.5 h-3.5" />
								Bounced{{ lead.related_contact.email_bounce_type ? ` (${lead.related_contact.email_bounce_type})` : '' }}
							</div>
							<div v-if="lead.related_contact.email_subscribed === false" class="text-[11px] text-warning dark:text-warning">
								Unsubscribed
							</div>
							<div class="grid grid-cols-3 gap-2 text-xs">
								<div>
									<p class="text-muted-foreground/40">Sent</p>
									<p class="font-medium text-foreground">{{ lead.related_contact.total_emails_sent || 0 }}</p>
								</div>
								<div>
									<p class="text-muted-foreground/40">Opens</p>
									<p class="font-medium text-foreground">{{ lead.related_contact.total_opens || 0 }}</p>
								</div>
								<div>
									<p class="text-muted-foreground/40">Clicks</p>
									<p class="font-medium text-foreground">{{ lead.related_contact.total_clicks || 0 }}</p>
								</div>
							</div>
							<div v-if="lead.related_contact.last_opened_at || lead.related_contact.last_clicked_at" class="pt-1 border-t border-border/60 space-y-0.5">
								<p v-if="lead.related_contact.last_opened_at" class="text-[11px] text-muted-foreground">
									Last opened {{ new Date(lead.related_contact.last_opened_at).toLocaleDateString() }}
								</p>
								<p v-if="lead.related_contact.last_clicked_at" class="text-[11px] text-muted-foreground">
									Last clicked {{ new Date(lead.related_contact.last_clicked_at).toLocaleDateString() }}
								</p>
							</div>
						</div>

						<!-- Mailing Lists -->
						<div class="ios-card p-4 space-y-2">
							<div class="flex items-center justify-between">
								<p class="text-[10px] uppercase font-semibold text-muted-foreground/40 tracking-wider">Mailing Lists</p>
								<button
									v-if="!showListPicker && listsToShow.length"
									class="text-[10px] text-primary hover:underline"
									@click="showListPicker = true"
								>
									+ Add to list
								</button>
							</div>

							<div v-if="leadLists.length" class="space-y-1.5">
								<div
									v-for="m in leadLists"
									:key="(m as any).id"
									class="flex items-center justify-between p-2 rounded-lg bg-muted/40 text-xs"
								>
									<span class="truncate">{{ ((m as any).list_id as any)?.name || 'Unknown list' }}</span>
									<button
										class="text-[10px] text-muted-foreground hover:text-destructive"
										:disabled="listBusy"
										@click="handleRemoveFromList(((m as any).list_id as any)?.id)"
									>
										Remove
									</button>
								</div>
							</div>
							<p v-else-if="!showListPicker" class="text-[11px] text-muted-foreground">
								Not on any list. Adding one will {{ lead.related_contact ? 'subscribe this contact' : 'create a contact from the lead and subscribe them' }}.
							</p>

							<div v-if="showListPicker" class="space-y-2 pt-1">
								<select
									v-model="selectedListId"
									class="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs"
									:disabled="listBusy"
								>
									<option :value="null">Select a list&hellip;</option>
									<option v-for="l in listsToShow" :key="l.id" :value="l.id">{{ l.name }}</option>
								</select>
								<div class="flex items-center gap-2">
									<Button size="sm" :disabled="!selectedListId || listBusy" @click="handleAddToList">
										Add
									</Button>
									<button
										class="text-[10px] text-muted-foreground hover:text-foreground"
										@click="showListPicker = false; selectedListId = null"
									>
										Cancel
									</button>
								</div>
							</div>
						</div>

						<!-- Notes -->
						<div v-if="lead.notes" class="ios-card p-4">
							<p class="text-[10px] uppercase font-semibold text-muted-foreground/40 tracking-wider mb-2">Notes</p>
							<p class="text-sm text-muted-foreground whitespace-pre-wrap">{{ lead.notes }}</p>
						</div>

						<!-- Upcoming Meetings -->
						<div class="ios-card p-4">
							<div class="flex items-center justify-between mb-3">
								<p class="text-[10px] uppercase font-semibold text-muted-foreground/40 tracking-wider">Upcoming Meetings</p>
								<button
									@click="showMeetingModal = true"
									class="text-[10px] text-primary hover:underline"
								>
									+ Schedule
								</button>
							</div>

							<div v-if="upcomingMeetingsLoading" class="space-y-2">
								<div v-for="n in 2" :key="n" class="h-10 bg-muted/30 rounded-lg animate-pulse" />
							</div>
							<div v-else-if="upcomingMeetings.length === 0" class="text-center py-3">
								<p class="text-[11px] text-muted-foreground">No upcoming meetings</p>
							</div>
							<div v-else class="space-y-1.5">
								<div
									v-for="meeting in upcomingMeetings"
									:key="meeting.id"
									class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg bg-success/10 dark:bg-success/10 border-l-[3px] border-l-emerald-500"
								>
									<EIcon name="i-heroicons-video-camera" class="w-3.5 h-3.5 text-success flex-shrink-0" />
									<div class="flex-1 min-w-0">
										<p class="text-[12px] font-medium text-foreground truncate">{{ meeting.title }}</p>
										<p class="text-[10px] text-muted-foreground">
											{{ new Date(meeting.scheduled_start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) }}
											{{ new Date(meeting.scheduled_start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }}
										</p>
									</div>
									<!-- allow-legacy-link — PERMANENT: opens Daily's external prebuilt video UI (meeting_url, new tab). No in-shell equivalent exists; the call room is not a slide-over panel. -->
									<NuxtLink
										v-if="meeting.meeting_url"
										:to="meeting.meeting_url"
										target="_blank"
										class="p-1 rounded-md bg-success/10 text-success hover:bg-success/20 transition-colors"
									>
										<EIcon name="i-heroicons-arrow-top-right-on-square" class="w-3 h-3" />
									</NuxtLink>
								</div>
							</div>
						</div>
					</div>

					<!-- Right: Activity Timeline -->
					<div :class="compact ? '' : 'lg:col-span-2'">
						<div class="flex items-center justify-between mb-4 gap-2">
							<h2 class="text-sm font-semibold text-foreground">Pursuit Timeline</h2>
							<div class="flex items-center gap-1.5">
								<EButton size="xs" variant="ghost" :icon="reApproaching ? 'i-lucide-loader-2' : 'i-lucide-sparkles'" :class="{ 'animate-pulse': reApproaching }" :disabled="reApproaching" @click="draftReApproach">
									{{ reApproaching ? 'Thinking…' : 'Re-approach' }}
								</EButton>
								<EButton size="xs" variant="outline" icon="i-heroicons-plus" @click="showActivityForm = !showActivityForm">
									Log
								</EButton>
							</div>
						</div>

						<!-- Earnest's re-approach for a stalled/cold deal. -->
						<div v-if="reApproach" class="ios-card p-4 mb-4 space-y-3 border-primary/30">
							<div class="flex items-start gap-2">
								<span class="inline-grid place-items-center w-6 h-6 rounded-lg bg-primary text-primary-foreground text-[13px] font-serif shrink-0" style="font-family: Georgia, serif;">E</span>
								<div class="min-w-0">
									<p class="text-[11px] uppercase tracking-wider text-primary font-semibold">Earnest · re-approach</p>
									<p class="text-[13px] text-foreground/90 mt-1">{{ reApproach.strategic_read }}</p>
								</div>
							</div>
							<div class="rounded-lg bg-muted/30 p-3 space-y-1">
								<div class="flex items-center gap-2">
									<span class="text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{{ reApproach.next_touchpoint.type }}</span>
									<span class="text-[12.5px] font-medium">{{ reApproach.next_touchpoint.summary }}</span>
								</div>
								<p class="text-[12.5px] text-muted-foreground whitespace-pre-wrap">{{ reApproach.next_touchpoint.note }}</p>
							</div>
							<p v-if="reApproach.proposal_angle" class="text-[12px] text-foreground/80">
								<span class="text-[10px] uppercase tracking-wide text-muted-foreground">Proposal angle · </span>{{ reApproach.proposal_angle }}
							</p>
							<div class="flex items-center gap-2">
								<EButton size="xs" :loading="addingReApproach" icon="i-lucide-check" @click="addReApproachTouch">Add as touchpoint</EButton>
								<EButton size="xs" variant="ghost" @click="reApproach = null">Dismiss</EButton>
							</div>
						</div>

						<div v-if="showActivityForm" class="ios-card p-4 mb-4 space-y-3">
							<div class="grid grid-cols-2 gap-3">
								<ESelectMenu
									v-model="newActivity.activity_type"
									:options="[
										{ value: 'call', label: 'Call' },
										{ value: 'email', label: 'Email' },
										{ value: 'meeting', label: 'Meeting' },
										{ value: 'note', label: 'Note' },
										{ value: 'follow_up', label: 'Follow Up' },
										{ value: 'demo', label: 'Demo' },
										{ value: 'proposal', label: 'Proposal' },
									]"
									value-attribute="value"
									option-attribute="label"
									size="sm"
								/>
								<ESelectMenu
									v-model="newActivity.outcome"
									:options="[
										{ value: '', label: 'No outcome' },
										{ value: 'positive', label: 'Positive' },
										{ value: 'neutral', label: 'Neutral' },
										{ value: 'negative', label: 'Negative' },
										{ value: 'no response', label: 'No Response' },
									]"
									value-attribute="value"
									option-attribute="label"
									size="sm"
								/>
							</div>
							<EInput v-model="newActivity.subject" placeholder="Subject *" size="sm" />
							<ETextarea v-model="newActivity.description" placeholder="Details..." :rows="2" size="sm" />
							<EInput v-model="newActivity.next_action" placeholder="Next action..." size="sm" />
							<div class="flex justify-end gap-2">
								<EButton variant="ghost" size="xs" @click="showActivityForm = false">Cancel</EButton>
								<EButton size="xs" :loading="activitySaving" :disabled="!newActivity.subject.trim()" @click="handleAddActivity">
									Save
								</EButton>
							</div>
						</div>

						<AppsPursuitTimeline ref="pursuitRef" :lead-id="Number(leadId)" :activities="activities" />
					</div>
				</div>
			</div>

			<!-- Quick Edit Modal -->
			<LeadsFormModal
				v-model="showFormModal"
				:lead="lead"
				:organization-id="lead?.organization?.id || lead?.organization"
				@updated="handleModalUpdated"
				@convert="showConversionModal = true; showFormModal = false"
				@lost="showLostReasonModal = true; showFormModal = false"
			/>

			<!-- Conversion Modal -->
			<LeadsConversionModal
				v-model="showConversionModal"
				:lead="lead"
				@converted="handleConverted"
			/>

			<!-- Lost Reason Modal -->
			<LeadsLostReasonModal
				v-model="showLostReasonModal"
				:lead="lead"
				@lost="handleLost"
			/>

			<!-- Schedule Meeting Modal -->
			<SchedulerUnifiedEventModal
				v-model="showMeetingModal"
				:lead-id="lead?.id"
				:lead-data="lead"
				:default-video="true"
				@created="handleMeetingCreated"
				@saved="handleMeetingCreated"
			/>

			<ProposalsFormModal
				v-model="showCreateProposalModal"
				:lead-id="lead?.id"
				@created="onDocCreated"
			/>
			<ContractsFormModal
				v-model="showCreateContractModal"
				:lead-id="lead?.id"
				@created="onDocCreated"
			/>
		</template>

		<!-- AI sidebar overlay — page mode only (panel container is transformed) -->
	</div>
</template>
