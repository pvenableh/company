<!--
  CardDeskSourcePanel — slide-over body for an Earnest contact that was
  sourced via Card Desk. Shows the original deck card (rating, met-at,
  notes) + 5 most recent cd_activities.

  Mounted by `<AppSlideOverStack>` when stack contains a
  `carddesk-source:<contactId>` entry. The `id` prop is the Earnest
  contacts.id — the panel reverse-looks-up the user's cd_contact via
  /api/carddesk/by-contact/<id>.
-->
<script setup lang="ts">
import { Icon } from '#components';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string }>();
defineEmits<{ (e: 'close'): void }>();

interface CdCard {
	id: string;
	name: string | null;
	first_name: string | null;
	last_name: string | null;
	email: string | null;
	phone: string | null;
	company: string | null;
	title: string | null;
	rating: string | null;
	industry: string | null;
	met_at: string | null;
	notes: string | null;
	is_client: boolean;
	is_partner?: boolean;
	earnest_lead_id?: string | number | null;
	client_at?: string | null;
	partner_at?: string | null;
	conversion_reason?: string | null;
	estimated_value?: number | null;
	date_created: string | null;
}

interface CdActivity {
	id: string;
	type: string;
	label: string | null;
	note: string | null;
	date: string;
	is_response?: boolean;
}

interface CdPlanRow {
	id: string;
	title: string | null;
	status: string | null;
}

interface CdTaskRow {
	id: string;
	title: string | null;
	channel: string | null;
	note: string | null;
	due_at: string | null;
	status: string | null;
	completed_at: string | null;
	plan: string | null;
}

interface LinkedLead {
	id: string | number;
	name: string | null;
	stage: string | null;
}

const card = ref<CdCard | null>(null);
const lead = ref<LinkedLead | null>(null);
const activities = ref<CdActivity[]>([]);
const plans = ref<CdPlanRow[]>([]);
const tasks = ref<CdTaskRow[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const slideOverStack = useAppSlideOverStack();
const leadStageLabel = computed(() => (lead.value?.stage || '').replace(/_/g, ' ') || '—');
function openLead() {
	if (lead.value?.id) slideOverStack.push('lead', String(lead.value.id));
}

// Group tasks under their plan (with a trailing "Other follow-ups" bucket for
// tasks not tied to a plan). Pending tasks lead each group; done/skipped sink.
const taskGroups = computed(() => {
	const byPlan = new Map<string, CdTaskRow[]>();
	const ungrouped: CdTaskRow[] = [];
	for (const t of tasks.value) {
		if (t.plan) {
			if (!byPlan.has(t.plan)) byPlan.set(t.plan, []);
			byPlan.get(t.plan)!.push(t);
		} else {
			ungrouped.push(t);
		}
	}
	const groups: Array<{ id: string; title: string; tasks: CdTaskRow[] }> = [];
	for (const p of plans.value) {
		const list = byPlan.get(p.id);
		if (list && list.length) {
			groups.push({ id: p.id, title: p.title || 'Untitled plan', tasks: list });
			byPlan.delete(p.id);
		}
	}
	// Any tasks whose plan row wasn't returned (e.g. archived plan) still show.
	for (const [planId, list] of byPlan) {
		groups.push({ id: planId, title: 'Plan', tasks: list });
	}
	if (ungrouped.length) groups.push({ id: '__none', title: 'Other follow-ups', tasks: ungrouped });
	return groups;
});

const pendingTaskCount = computed(() => tasks.value.filter((t) => t.status === 'pending').length);

const channelIcons: Record<string, string> = {
	email: 'lucide:mail',
	linkedin: 'lucide:linkedin',
	call: 'lucide:phone',
	meet: 'lucide:users',
	other: 'lucide:circle-dot',
};

function formatDue(due: string | null): { label: string; overdue: boolean } | null {
	if (!due) return null;
	const d = new Date(due);
	if (Number.isNaN(d.getTime())) return null;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const overdue = d.getTime() < today.getTime();
	return { label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), overdue };
}

const displayName = computed(() => {
	if (!card.value) return 'Sourced via Card Desk';
	const c = card.value;
	return c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Card Desk card';
});

const ratingClass = (r: string | null) => {
	if (r === 'hot') return 'bg-destructive/10 text-destructive';
	if (r === 'warm') return 'bg-warning/10 text-warning';
	if (r === 'nurture') return 'bg-success/10 text-success';
	if (r === 'cold') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
	return 'bg-muted text-muted-foreground';
};

// Graduation badge — surfaces whether this card was converted into a CRM
// client/partner from CardDesk's pipeline.
const graduation = computed(() => {
	const c = card.value;
	if (!c) return null;
	if (c.is_partner) return { label: 'Partner', icon: 'lucide:handshake', cls: 'bg-primary/10 text-primary' };
	if (c.is_client) return { label: 'Client', icon: 'lucide:briefcase', cls: 'bg-success/10 text-success' };
	return null;
});

const estimatedValueLabel = computed(() => {
	const v = card.value?.estimated_value;
	if (v == null) return null;
	try {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
	} catch {
		return `$${v}`;
	}
});

const activityIcons: Record<string, string> = {
	email: 'lucide:mail',
	text: 'lucide:message-square',
	call: 'lucide:phone',
	meeting: 'lucide:users',
	linkedin: 'lucide:link',
	card_scanned: 'lucide:scan-line',
	contact_added: 'lucide:user-plus',
	stage_change: 'lucide:arrow-left-right',
	converted_lead: 'lucide:trending-up',
	converted_client: 'lucide:briefcase',
	converted_partner: 'lucide:handshake',
	promoted_to_earnest: 'lucide:arrow-up-right-from-square',
	other: 'lucide:circle',
};

watch(
	() => props.id,
	async (id) => {
		if (!id) return;
		loading.value = true;
		error.value = null;
		card.value = null;
		activities.value = [];
		try {
			const res = await $fetch<{ cd_contact: CdCard | null; lead?: LinkedLead | null; activities: CdActivity[]; plans?: CdPlanRow[]; tasks?: CdTaskRow[] }>(
				`/api/carddesk/by-contact/${id}`,
			);
			card.value = res.cd_contact;
			lead.value = res.lead || null;
			activities.value = res.activities;
			plans.value = res.plans || [];
			tasks.value = res.tasks || [];
		} catch (err: any) {
			error.value = err?.data?.message || err?.message || 'Failed to load Card Desk source';
		} finally {
			loading.value = false;
		}
	},
	{ immediate: true },
);
</script>

<template>
	<AppSlideOverShell :title="displayName" subtitle="Sourced via Card Desk" @close="$emit('close')">
		<div v-if="loading" class="flex flex-col items-center justify-center py-12 gap-3">
			<span class="spinner-ios spinner-ios--lg" role="status" aria-label="Loading" />
			<p class="text-xs text-muted-foreground">Loading card…</p>
		</div>

		<div v-else-if="error" class="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
			{{ error }}
		</div>

		<div v-else-if="!card" class="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
			No Card Desk source linked to this contact.
		</div>

		<div v-else class="space-y-5">
			<!-- Card preview -->
			<div class="rounded-xl border border-border bg-card p-4">
				<div class="flex items-center gap-3">
					<div class="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
						{{ (card.first_name || '?').charAt(0) }}{{ (card.last_name || '').charAt(0) }}
					</div>
					<div class="min-w-0 flex-1">
						<p class="text-sm font-semibold truncate">{{ displayName }}</p>
						<p v-if="card.title || card.company" class="text-xs text-muted-foreground truncate">
							{{ [card.title, card.company].filter(Boolean).join(' · ') }}
						</p>
					</div>
					<div class="flex flex-col items-end gap-1 shrink-0">
						<span
							v-if="graduation"
							class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
							:class="graduation.cls"
						>
							<Icon :name="graduation.icon" class="w-3 h-3" />
							{{ graduation.label }}
						</span>
						<span
							v-if="card.rating"
							class="text-[10px] px-2 py-0.5 rounded-full font-medium capitalize"
							:class="ratingClass(card.rating)"
						>
							{{ card.rating }}
						</span>
					</div>
				</div>

				<div class="mt-4 grid grid-cols-1 gap-2 text-xs text-muted-foreground">
					<div v-if="card.industry" class="flex items-center gap-2">
						<Icon name="lucide:tag" class="w-3.5 h-3.5 shrink-0" />
						<span>{{ card.industry }}</span>
					</div>
					<div v-if="card.met_at" class="flex items-center gap-2">
						<Icon name="lucide:map-pin" class="w-3.5 h-3.5 shrink-0" />
						<span>Met at: {{ card.met_at }}</span>
					</div>
					<div v-if="card.date_created" class="flex items-center gap-2">
						<Icon name="lucide:calendar" class="w-3.5 h-3.5 shrink-0" />
						<span>Scanned {{ new Date(card.date_created).toLocaleDateString() }}</span>
					</div>
					<div v-if="card.conversion_reason" class="flex items-center gap-2">
						<Icon name="lucide:award" class="w-3.5 h-3.5 shrink-0" />
						<span>Converted: {{ card.conversion_reason }}</span>
					</div>
					<div v-if="estimatedValueLabel" class="flex items-center gap-2">
						<Icon name="lucide:dollar-sign" class="w-3.5 h-3.5 shrink-0" />
						<span>Est. value: {{ estimatedValueLabel }}</span>
					</div>
				</div>

				<p v-if="card.notes" class="mt-3 text-xs italic text-muted-foreground border-t border-border pt-3">
					{{ card.notes }}
				</p>
			</div>

			<!-- Linked Earnest lead — the SINGLE pipeline. The card reflects its
			     lead's stage (leads.stage) instead of a parallel CardDesk stage. -->
			<div v-if="lead" class="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3">
				<div class="min-w-0">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Lead stage</p>
					<span class="mt-1 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary capitalize">
						<Icon name="lucide:target" class="w-3 h-3" />
						{{ leadStageLabel }}
					</span>
				</div>
				<button
					type="button"
					class="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
					@click="openLead"
				>
					Open lead
					<Icon name="lucide:arrow-up-right" class="w-3 h-3" />
				</button>
			</div>

			<!-- Plans & Tasks — CardDesk follow-up plan, grouped by plan. -->
			<div v-if="taskGroups.length">
				<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3 flex items-center gap-2">
					<Icon name="lucide:list-checks" class="w-3.5 h-3.5" />
					Plans &amp; Tasks
					<span
						v-if="pendingTaskCount"
						class="ml-auto inline-flex items-center justify-center text-[10px] font-bold px-1.5 h-4 rounded-full bg-primary/10 text-primary"
					>{{ pendingTaskCount }} pending</span>
				</h3>
				<div class="space-y-4">
					<div v-for="group in taskGroups" :key="group.id">
						<p class="text-[11px] font-semibold text-foreground/80 mb-1.5">{{ group.title }}</p>
						<ul class="space-y-1.5">
							<li
								v-for="t in group.tasks"
								:key="t.id"
								class="flex items-start gap-2 text-xs rounded-lg border border-border/60 bg-card px-2.5 py-2"
								:class="{ 'opacity-55': t.status !== 'pending' }"
							>
								<Icon
									:name="t.status === 'done' ? 'lucide:check-circle-2' : t.status === 'skipped' ? 'lucide:circle-slash' : (channelIcons[t.channel || 'other'] || channelIcons.other)"
									class="w-3.5 h-3.5 shrink-0 mt-0.5"
									:class="t.status === 'done' ? 'text-success' : 'text-muted-foreground'"
								/>
								<div class="flex-1 min-w-0">
									<p class="font-medium text-foreground" :class="{ 'line-through': t.status !== 'pending' }">
										{{ t.title || 'Untitled task' }}
									</p>
									<p v-if="t.note" class="text-muted-foreground/80 mt-0.5 line-clamp-2">{{ t.note }}</p>
								</div>
								<span
									v-if="formatDue(t.due_at)"
									class="shrink-0 whitespace-nowrap text-[10px] font-medium px-1.5 py-0.5 rounded-full"
									:class="formatDue(t.due_at)!.overdue && t.status === 'pending' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'"
								>
									{{ formatDue(t.due_at)!.label }}
								</span>
							</li>
						</ul>
					</div>
				</div>
			</div>

			<!-- Activity timeline -->
			<div>
				<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
					Recent Card Desk activity
				</h3>
				<div v-if="activities.length === 0" class="text-xs text-muted-foreground italic">
					No activities recorded.
				</div>
				<ul v-else class="space-y-3">
					<li v-for="act in activities" :key="act.id" class="flex gap-2.5 text-xs">
						<div class="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
							<Icon
								:name="activityIcons[act.type] || activityIcons.other"
								class="w-3.5 h-3.5 text-muted-foreground"
							/>
						</div>
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2">
								<span class="font-medium capitalize">{{ act.type.replace(/_/g, ' ') }}</span>
								<span class="text-muted-foreground ml-auto whitespace-nowrap">
									{{ new Date(act.date).toLocaleDateString() }}
								</span>
							</div>
							<p v-if="act.label" class="text-muted-foreground mt-0.5">{{ act.label }}</p>
							<p v-if="act.note" class="text-muted-foreground/80 mt-0.5 italic">{{ act.note }}</p>
						</div>
					</li>
				</ul>
			</div>

			<!-- Footer link to Card Desk — deep-links to this specific card so
			     the dashboard auto-opens its detail panel after the list loads. -->
			<UiViewLink
				:to="`/apps/clients?view=carddesk&selected=${card.id}`"
				size="sm"
				class="block text-center pt-2"
				@click="$emit('close')"
			>Open Card Desk</UiViewLink>
		</div>
	</AppSlideOverShell>
</template>
