<script setup lang="ts">
import { LEAD_STAGE_LABELS, LEAD_STAGE_COLORS } from '~~/shared/leads';
import type { LeadStage } from '~~/shared/leads';
import { Button } from '~/components/ui/button';

definePageMeta({ middleware: ['auth'] });

const route = useRoute();
const leadId = computed(() => route.params.id as string);

const { getLead, updateLeadStageWithAutomation, addLeadToList } = useLeads();
const { getActivitiesForLead, createActivity } = useLeadActivities();
const { getPriorityBadgeClass } = useStatusStyle();
const { getLists } = useMailingLists();
const { removeFromList } = useContacts();
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();
const toast = useToast();

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
				: 'Review and edit on the proposal page.',
			color: 'green',
		});
		if (created?.id) navigateTo(`/proposals/${created.id}`);
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

// Stage statuses for FormStatusTimeline
const stageStatuses = Object.entries(LEAD_STAGE_LABELS).map(([id, name]) => ({ id, name }));

async function fetchData() {
	loading.value = true;
	try {
		const [leadResult, activitiesResult] = await Promise.all([
			getLead(leadId.value),
			getActivitiesForLead(leadId.value),
		]);
		lead.value = leadResult;
		activities.value = activitiesResult as any[];
		useHead({ title: `${lead.value?.related_contact?.first_name || 'Lead'} | Earnest` });
	} catch (e) {
		console.error('Failed to load lead:', e);
	} finally {
		loading.value = false;
	}
}

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
		await updateLeadStageWithAutomation(leadId.value, newStage, lead.value?.stage);
		lead.value.stage = newStage;
		// Refresh activities to show the auto-logged stage change
		activities.value = await getActivitiesForLead(leadId.value) as any[];
	} finally {
		stageUpdating.value = false;
	}
}

async function handleAddActivity() {
	if (!newActivity.subject.trim()) return;
	activitySaving.value = true;
	try {
		await createActivity({
			lead: Number(leadId.value),
			activity_type: newActivity.activity_type,
			subject: newActivity.subject,
			description: newActivity.description || undefined,
			outcome: newActivity.outcome || undefined,
			next_action: newActivity.next_action || undefined,
		});
		showActivityForm.value = false;
		Object.assign(newActivity, { activity_type: 'note', subject: '', description: '', outcome: '', next_action: '' });
		activities.value = await getActivitiesForLead(leadId.value) as any[];
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
				related_lead: { _eq: leadId.value },
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
	getActivitiesForLead(leadId.value).then((r) => { activities.value = r as any[]; });
};

onMounted(() => {
	fetchData();
	fetchUpcomingMeetings();
	loadAvailableLists();
});

watch(lead, (l) => {
	if (!l) return;
	const contact = l.related_contact;
	const name = contact && typeof contact === 'object'
		? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.company
		: '';
	setEntity('lead', l.id, name || 'Lead');
}, { immediate: true });

onUnmounted(() => clearEntity());
</script>

<template>
	<LayoutPageContainer>
		<!-- Loading -->
		<div v-if="loading" class="flex items-center justify-center py-20">
			<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin t-text-muted" />
		</div>

		<template v-else-if="lead">
			<!-- Back + Header -->
			<div class="mb-6">
				<NuxtLink to="/leads" class="text-xs t-text-muted hover:t-text-secondary flex items-center gap-1 mb-3">
					<UIcon name="i-heroicons-arrow-left" class="w-3 h-3" /> Back to leads
				</NuxtLink>
				<div class="flex items-start justify-between">
					<div>
						<h1 class="text-xl font-bold t-text">
							{{ lead.related_contact?.first_name }} {{ lead.related_contact?.last_name }}
						</h1>
						<p class="text-sm t-text-secondary">
							{{ lead.related_contact?.company }}
							<span v-if="lead.related_contact?.email"> · {{ lead.related_contact.email }}</span>
						</p>
						<div v-if="Array.isArray(lead.tags) && lead.tags.length" class="flex flex-wrap gap-1.5 mt-2">
							<ContactsContactTagBadge v-for="tag in lead.tags" :key="tag" :tag="tag" />
						</div>
					</div>
					<div class="flex items-center gap-1.5">
						<button
							class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
							@click="sidebarOpen = true"
						>
							<UIcon name="lucide:sparkles" class="w-3.5 h-3.5" />
							<span class="hidden sm:inline">Ask Earnest</span>
						</button>
						<UiActionButton icon="lucide:pencil" @click="showFormModal = true" hide-label="sm">
							Edit
						</UiActionButton>
						<UiActionButton icon="lucide:video" variant="primary" @click="showMeetingModal = true" hide-label="sm">
							Meeting
						</UiActionButton>
						<UiActionButton
							icon="lucide:sparkles"
							variant="primary"
							:loading="drafting"
							hide-label="sm"
							@click="generateDraft"
						>
							AI Draft
						</UiActionButton>
						<NuxtLink :to="`/proposals?new=1&lead=${lead.id}`">
							<UiActionButton icon="lucide:file-plus">
								Proposal
							</UiActionButton>
						</NuxtLink>
					</div>
				</div>
			</div>

			<!-- AI Notices -->
			<ClientOnly>
				<AIProactiveNotices v-if="lead?.id" entity-type="lead" :entity-id="String(lead.id)" />
			</ClientOnly>

			<!-- Pipeline Stage Timeline -->
			<div class="ios-card p-4 mb-6">
				<p class="text-[10px] uppercase font-semibold t-text-muted tracking-wider mb-4">Pipeline Stage</p>
				<FormStatusTimeline
					:currentStatus="lead.stage"
					:statuses="stageStatuses"
					collection="leads"
					:itemId="String(lead.id)"
					:loading="stageUpdating"
					@status-change="handleStageChange"
				/>
			</div>

			<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<!-- Left: Lead info -->
				<div class="lg:col-span-1 space-y-4">
					<!-- Details -->
					<div class="ios-card p-4 space-y-3">
						<p class="text-[10px] uppercase font-semibold t-text-muted tracking-wider">Details</p>
						<div class="grid grid-cols-2 gap-2 text-xs">
							<div>
								<p class="t-text-muted">Score</p>
								<p class="font-medium t-text">{{ lead.lead_score || 0 }}/100</p>
							</div>
							<div>
								<p class="t-text-muted">Priority</p>
								<span
									class="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded text-white"
									:class="getPriorityBadgeClass(lead.priority)"
								>
									{{ lead.priority || 'none' }}
								</span>
							</div>
							<div>
								<p class="t-text-muted">Source</p>
								<p class="font-medium t-text">{{ lead.source || '—' }}</p>
							</div>
							<div>
								<p class="t-text-muted">Value</p>
								<p class="font-medium t-text">{{ lead.estimated_value ? `$${Number(lead.estimated_value).toLocaleString()}` : '—' }}</p>
							</div>
							<div>
								<p class="t-text-muted">Timeline</p>
								<p class="font-medium t-text capitalize">{{ lead.timeline || '—' }}</p>
							</div>
							<div>
								<p class="t-text-muted">Next Follow-up</p>
								<p class="font-medium" :class="isOverdueFollowUp ? 'text-red-500' : 't-text'">
									{{ lead.next_follow_up ? new Date(lead.next_follow_up).toLocaleDateString() : '—' }}
									<span v-if="isOverdueFollowUp" class="text-[9px] font-semibold ml-1">OVERDUE</span>
								</p>
							</div>
						</div>
					</div>

					<!-- Contact -->
					<div v-if="lead.related_contact" class="ios-card p-4 space-y-2">
						<div class="flex items-center justify-between">
							<p class="text-[10px] uppercase font-semibold t-text-muted tracking-wider">Contact</p>
							<NuxtLink
								:to="`/contacts/${lead.related_contact.id}`"
								class="text-[10px] text-primary hover:underline"
							>
								View
							</NuxtLink>
						</div>
						<p class="text-sm font-medium t-text">{{ lead.related_contact.first_name }} {{ lead.related_contact.last_name }}</p>
						<p v-if="lead.related_contact.email" class="text-xs t-text-secondary">{{ lead.related_contact.email }}</p>
						<p v-if="lead.related_contact.phone" class="text-xs t-text-secondary">{{ lead.related_contact.phone }}</p>
						<p v-if="lead.related_contact.company" class="text-xs t-text-secondary">{{ lead.related_contact.company }}</p>
					</div>

					<!-- Email Engagement (pulled from related_contact) -->
					<div v-if="lead.related_contact" class="ios-card p-4 space-y-2">
						<p class="text-[10px] uppercase font-semibold t-text-muted tracking-wider">Email Engagement</p>
						<div v-if="lead.related_contact.email_bounced" class="flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400">
							<UIcon name="i-heroicons-exclamation-triangle" class="w-3.5 h-3.5" />
							Bounced{{ lead.related_contact.email_bounce_type ? ` (${lead.related_contact.email_bounce_type})` : '' }}
						</div>
						<div v-if="lead.related_contact.email_subscribed === false" class="text-[11px] text-amber-600 dark:text-amber-400">
							Unsubscribed
						</div>
						<div class="grid grid-cols-3 gap-2 text-xs">
							<div>
								<p class="t-text-muted">Sent</p>
								<p class="font-medium t-text">{{ lead.related_contact.total_emails_sent || 0 }}</p>
							</div>
							<div>
								<p class="t-text-muted">Opens</p>
								<p class="font-medium t-text">{{ lead.related_contact.total_opens || 0 }}</p>
							</div>
							<div>
								<p class="t-text-muted">Clicks</p>
								<p class="font-medium t-text">{{ lead.related_contact.total_clicks || 0 }}</p>
							</div>
						</div>
						<div v-if="lead.related_contact.last_opened_at || lead.related_contact.last_clicked_at" class="pt-1 border-t border-border/60 space-y-0.5">
							<p v-if="lead.related_contact.last_opened_at" class="text-[11px] t-text-secondary">
								Last opened {{ new Date(lead.related_contact.last_opened_at).toLocaleDateString() }}
							</p>
							<p v-if="lead.related_contact.last_clicked_at" class="text-[11px] t-text-secondary">
								Last clicked {{ new Date(lead.related_contact.last_clicked_at).toLocaleDateString() }}
							</p>
						</div>
					</div>

					<!-- Mailing Lists (auto-promotes lead to contact on add) -->
					<div class="ios-card p-4 space-y-2">
						<div class="flex items-center justify-between">
							<p class="text-[10px] uppercase font-semibold t-text-muted tracking-wider">Mailing Lists</p>
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
						<p class="text-[10px] uppercase font-semibold t-text-muted tracking-wider mb-2">Notes</p>
						<p class="text-sm t-text-secondary whitespace-pre-wrap">{{ lead.notes }}</p>
					</div>

					<!-- Upcoming Meetings -->
					<div class="ios-card p-4">
						<div class="flex items-center justify-between mb-3">
							<p class="text-[10px] uppercase font-semibold t-text-muted tracking-wider">Upcoming Meetings</p>
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
								class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/10 border-l-[3px] border-l-emerald-500"
							>
								<UIcon name="i-heroicons-video-camera" class="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
								<div class="flex-1 min-w-0">
									<p class="text-[12px] font-medium text-foreground truncate">{{ meeting.title }}</p>
									<p class="text-[10px] text-muted-foreground">
										{{ new Date(meeting.scheduled_start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) }}
										{{ new Date(meeting.scheduled_start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }}
									</p>
								</div>
								<NuxtLink
									v-if="meeting.meeting_url"
									:to="meeting.meeting_url"
									target="_blank"
									class="p-1 rounded-md bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors"
								>
									<UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3 h-3" />
								</NuxtLink>
							</div>
						</div>
					</div>
				</div>

				<!-- Right: Activity Timeline -->
				<div class="lg:col-span-2">
					<div class="flex items-center justify-between mb-4">
						<h2 class="text-sm font-semibold t-text">Activity Timeline</h2>
						<UButton size="xs" variant="outline" icon="i-heroicons-plus" @click="showActivityForm = !showActivityForm">
							Log Activity
						</UButton>
					</div>

					<!-- Add Activity Form -->
					<div v-if="showActivityForm" class="ios-card p-4 mb-4 space-y-3">
						<div class="grid grid-cols-2 gap-3">
							<USelectMenu
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
							<USelectMenu
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
						<UInput v-model="newActivity.subject" placeholder="Subject *" size="sm" />
						<UTextarea v-model="newActivity.description" placeholder="Details..." :rows="2" size="sm" />
						<UInput v-model="newActivity.next_action" placeholder="Next action..." size="sm" />
						<div class="flex justify-end gap-2">
							<UButton variant="ghost" size="xs" @click="showActivityForm = false">Cancel</UButton>
							<UButton size="xs" :loading="activitySaving" :disabled="!newActivity.subject.trim()" @click="handleAddActivity">
								Save
							</UButton>
						</div>
					</div>

					<LeadsActivityTimeline :activities="activities" />
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
			<SchedulerNewMeetingModal
				v-model="showMeetingModal"
				:lead-id="lead?.id"
				:lead-data="lead"
				@created="handleMeetingCreated"
			/>

		</template>

		<!-- Contextual AI Sidebar -->
		<ClientOnly>
			<AIContextualSidebar
				v-if="sidebarOpen && lead?.id"
				entity-type="lead"
				:entity-id="String(lead.id)"
				:entity-label="[lead.related_contact?.first_name, lead.related_contact?.last_name].filter(Boolean).join(' ') || lead.related_contact?.company || 'Lead'"
				@close="closeSidebar"
			/>
			<Transition name="overlay">
				<div v-if="sidebarOpen" class="fixed inset-0 bg-black/20 z-40" @click="closeSidebar" />
			</Transition>
		</ClientOnly>
	</LayoutPageContainer>
</template>
