<script setup lang="ts">
import { LEAD_STAGE_LABELS, LEAD_STAGE_COLORS } from '~/types/leads';
import type { LeadStage } from '~/types/leads';

definePageMeta({ middleware: ['auth'] });

const route = useRoute();
const leadId = computed(() => route.params.id as string);

const { getLead, updateLeadStage } = useLeads();
const { getActivitiesForLead, createActivity } = useLeadActivities();

const lead = ref<any>(null);
const activities = ref<any[]>([]);
const loading = ref(true);
const stageUpdating = ref(false);

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

async function handleStageChange(stage: LeadStage) {
	stageUpdating.value = true;
	try {
		await updateLeadStage(leadId.value, stage);
		lead.value.stage = stage;
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
		// Refresh activities
		activities.value = await getActivitiesForLead(leadId.value) as any[];
	} finally {
		activitySaving.value = false;
	}
}

const stageOptions = Object.entries(LEAD_STAGE_LABELS).map(([value, label]) => ({ value, label }));

onMounted(fetchData);
</script>

<template>
	<div class="page__inner px-6 max-w-5xl mx-auto">
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
					</div>
					<div class="flex items-center gap-2">
						<NuxtLink
							:to="`/proposals/new?lead=${lead.id}`"
							class="text-xs"
						>
							<UButton size="sm" variant="outline" icon="i-heroicons-document-plus">
								Create Proposal
							</UButton>
						</NuxtLink>
					</div>
				</div>
			</div>

			<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<!-- Left: Lead info -->
				<div class="lg:col-span-1 space-y-4">
					<!-- Stage -->
					<div class="ios-card p-4">
						<p class="text-[10px] uppercase font-semibold t-text-muted tracking-wider mb-2">Pipeline Stage</p>
						<USelectMenu
							:model-value="lead.stage"
							:options="stageOptions"
							value-attribute="value"
							option-attribute="label"
							size="sm"
							:loading="stageUpdating"
							@update:model-value="handleStageChange"
						/>
					</div>

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
								<p class="font-medium t-text capitalize">{{ lead.priority || 'none' }}</p>
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
								<p class="font-medium t-text">{{ lead.next_follow_up ? new Date(lead.next_follow_up).toLocaleDateString() : '—' }}</p>
							</div>
						</div>
					</div>

					<!-- Contact -->
					<div v-if="lead.related_contact" class="ios-card p-4 space-y-2">
						<p class="text-[10px] uppercase font-semibold t-text-muted tracking-wider">Contact</p>
						<p class="text-sm font-medium t-text">{{ lead.related_contact.first_name }} {{ lead.related_contact.last_name }}</p>
						<p v-if="lead.related_contact.email" class="text-xs t-text-secondary">{{ lead.related_contact.email }}</p>
						<p v-if="lead.related_contact.phone" class="text-xs t-text-secondary">{{ lead.related_contact.phone }}</p>
						<p v-if="lead.related_contact.company" class="text-xs t-text-secondary">{{ lead.related_contact.company }}</p>
					</div>

					<!-- Notes -->
					<div v-if="lead.notes" class="ios-card p-4">
						<p class="text-[10px] uppercase font-semibold t-text-muted tracking-wider mb-2">Notes</p>
						<p class="text-sm t-text-secondary whitespace-pre-wrap">{{ lead.notes }}</p>
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
		</template>
	</div>
</template>
