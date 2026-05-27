<!--
	LeadAutomationsSurface — shared body for the lead-stage automation rules
	editor. Mounted by BOTH `/leads/automations` (full-page deep-link receiver)
	and `panels/LeadAutomationsPanel.vue` (slide-over) so the two surfaces
	can't drift.

	`:compact` hides the chrome the slide-over shell already provides (the
	outer back chevron to `/leads`, the inline h1 + description). The
	"New Rule" button stays so the user can still create from inside the
	panel; in compact mode it lives in a tight inline strip instead of the
	full-page header.
-->
<script setup lang="ts">
import type { LeadStage } from '~~/shared/leads';
import { LEAD_STAGE_LABELS } from '~~/shared/leads';
import type { LeadStageListRule } from '~~/shared/directus';
import type { MailingList } from '~~/shared/email/contacts';
import { Button } from '~/components/ui/button';

const props = defineProps<{
	compact?: boolean;
}>();

const emit = defineEmits<{
	loaded: [{ count: number }];
}>();

const { selectedOrg } = useOrganization();
const { isOrgManagerOrAbove, loading: roleLoading, roleSlug } = useOrgRole();
const roleReady = computed(() => !roleLoading.value && roleSlug.value !== null);
const { getLists } = useMailingLists();
const toast = useToast();
const rulesItems = useDirectusItems<LeadStageListRule>('lead_stage_list_rules');

const loading = ref(true);
const rules = ref<LeadStageListRule[]>([]);
const mailingLists = ref<MailingList[]>([]);
const showModal = ref(false);
const editingRule = ref<LeadStageListRule | null>(null);

async function fetchRules() {
	if (!selectedOrg.value) {
		rules.value = [];
		return;
	}
	const list = await rulesItems.list({
		fields: [
			'id',
			'status',
			'enabled',
			'from_stage',
			'to_stage',
			'description',
			'date_created',
			'add_to_list.id',
			'add_to_list.name',
			'add_to_list.slug',
			'remove_from_list.id',
			'remove_from_list.name',
			'remove_from_list.slug',
		],
		filter: {
			_and: [
				{ organization: { _eq: selectedOrg.value } },
				{ status: { _neq: 'archived' } },
			],
		},
		sort: ['to_stage', '-date_created'],
		limit: -1,
	});
	rules.value = (list || []) as LeadStageListRule[];
}

async function fetchMailingLists() {
	try {
		mailingLists.value = await getLists();
	} catch (err) {
		console.warn('Failed to load mailing lists:', err);
		mailingLists.value = [];
	}
}

async function loadAll() {
	loading.value = true;
	try {
		await Promise.all([fetchRules(), fetchMailingLists()]);
		emit('loaded', { count: rules.value.length });
	} catch (err: any) {
		console.error('Failed to load automations:', err);
		toast.add({ title: 'Failed to load rules', description: err?.message, color: 'red' });
	} finally {
		loading.value = false;
	}
}

onMounted(loadAll);
watch(() => selectedOrg.value, loadAll);

const groupedRules = computed(() => {
	const groups: Record<string, LeadStageListRule[]> = {};
	for (const rule of rules.value) {
		const stage = rule.to_stage as LeadStage;
		if (!groups[stage]) groups[stage] = [];
		groups[stage].push(rule);
	}
	return groups;
});

const stageOrder: LeadStage[] = ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiating', 'won', 'lost'];

function openNew() {
	editingRule.value = null;
	showModal.value = true;
}

function openEdit(rule: LeadStageListRule) {
	editingRule.value = rule;
	showModal.value = true;
}

async function handleToggle(rule: LeadStageListRule, nextValue: boolean) {
	const prev = rule.enabled;
	rule.enabled = nextValue;
	try {
		await rulesItems.update(rule.id, { enabled: nextValue } as any);
	} catch (err: any) {
		rule.enabled = prev ?? false;
		console.error('Failed to update enabled:', err);
		toast.add({ title: 'Failed to update rule', description: err?.message, color: 'red' });
	}
}

function handleCreated(rule: LeadStageListRule) {
	rules.value = [...rules.value, rule];
	fetchRules();
}

function handleUpdated(rule: LeadStageListRule) {
	const idx = rules.value.findIndex((r) => r.id === rule.id);
	if (idx !== -1) rules.value[idx] = rule;
	fetchRules();
}

function handleDeleted(id: number) {
	rules.value = rules.value.filter((r) => r.id !== id);
}

function stageLabel(stage: LeadStage | null | undefined): string {
	if (!stage) return 'Any stage';
	return LEAD_STAGE_LABELS[stage] || stage;
}

function listName(list: { id: number; name?: string | null; slug?: string } | number | null | undefined): string {
	if (list == null) return '';
	if (typeof list === 'object') return list.name || list.slug || `List #${list.id}`;
	const found = mailingLists.value.find((l) => l.id === list);
	return found ? (found.name || found.slug || `List #${list}`) : `List #${list}`;
}

function ruleLabel(rule: LeadStageListRule): string {
	if (rule.description) return rule.description;
	return `${stageLabel(rule.from_stage)} → ${stageLabel(rule.to_stage)}`;
}

defineExpose({ openNew });
</script>

<template>
	<div>
		<!-- Full-page header (omitted in compact / panel mode — shell shows title) -->
		<div v-if="!compact" class="flex items-center justify-between mb-6">
			<div class="flex items-center gap-3">
				<NuxtLink
					to="/leads"
					class="inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
				>
					<Icon name="lucide:chevron-left" class="w-4 h-4" />
				</NuxtLink>
				<div>
					<h1 class="text-xl font-bold t-text">Lead Automations</h1>
					<p class="text-sm t-text-secondary">
						Auto-add or remove a lead's contact from mailing lists when its pipeline stage changes.
					</p>
				</div>
			</div>
			<Button v-if="roleReady && isOrgManagerOrAbove" size="sm" @click="openNew">
				<Icon name="lucide:plus" class="w-3.5 h-3.5 mr-1" />
				New Rule
			</Button>
		</div>

		<!-- Compact header strip (panel mode only) — gives the user a New Rule
		     CTA without duplicating the shell's title row. -->
		<div v-else-if="roleReady && isOrgManagerOrAbove && rules.length" class="flex items-center justify-end mb-3">
			<Button size="sm" @click="openNew">
				<Icon name="lucide:plus" class="w-3.5 h-3.5 mr-1" />
				New Rule
			</Button>
		</div>

		<!-- Role still loading -->
		<div v-if="!roleReady || loading" class="flex items-center justify-center py-20">
			<span class="spinner-ios spinner-ios--lg" role="status" aria-label="Loading" />
		</div>

		<!-- Access gate -->
		<div v-else-if="!isOrgManagerOrAbove" class="rounded-lg border border-border bg-muted/20 px-6 py-12 text-center">
			<Icon name="lucide:lock" class="w-8 h-8 text-muted-foreground mx-auto mb-3" />
			<p class="text-sm font-medium t-text">Manager access required</p>
			<p class="text-xs t-text-secondary mt-1">
				Automation rules affect the whole org, so only owners, admins, and managers can edit them.
			</p>
		</div>

		<!-- Empty -->
		<div v-else-if="!rules.length" class="rounded-lg border border-dashed border-border px-6 py-16 text-center">
			<Icon name="lucide:zap" class="w-10 h-10 text-muted-foreground mx-auto mb-3" />
			<p class="text-sm font-medium t-text">No automation rules yet</p>
			<p class="text-xs t-text-secondary mt-1 max-w-sm mx-auto">
				Create a rule to automatically move contacts between mailing lists when a lead reaches a specific stage.
			</p>
			<Button size="sm" class="mt-4" @click="openNew">
				<Icon name="lucide:plus" class="w-3.5 h-3.5 mr-1" />
				New Rule
			</Button>
		</div>

		<!-- Rules grouped by to_stage -->
		<div v-else class="space-y-6">
			<template v-for="stage in stageOrder" :key="stage">
				<section v-if="groupedRules[stage]?.length" class="space-y-2">
					<h2 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-1">
						When stage becomes {{ stageLabel(stage) }}
					</h2>
					<div class="space-y-2">
						<div
							v-for="rule in groupedRules[stage]"
							:key="rule.id"
							class="group flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer"
							:class="{ 'opacity-60': !rule.enabled }"
							@click="openEdit(rule)"
						>
							<!-- Main content -->
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2 flex-wrap">
									<p class="text-sm font-medium t-text truncate">{{ ruleLabel(rule) }}</p>
									<span v-if="!rule.enabled" class="text-[10px] uppercase tracking-wider text-muted-foreground">
										Paused
									</span>
								</div>
								<div class="flex items-center gap-1.5 mt-1 flex-wrap">
									<span class="text-[11px] text-muted-foreground">
										From {{ stageLabel(rule.from_stage) }}
									</span>
									<template v-if="rule.add_to_list">
										<span class="text-muted-foreground">·</span>
										<span class="inline-flex items-center gap-1 rounded-full bg-success/10 text-success dark:text-success px-2 py-0.5 text-[11px] font-medium">
											<Icon name="lucide:plus" class="w-3 h-3" />
											{{ listName(rule.add_to_list) }}
										</span>
									</template>
									<template v-if="rule.remove_from_list">
										<span class="text-muted-foreground">·</span>
										<span class="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive dark:text-destructive px-2 py-0.5 text-[11px] font-medium">
											<Icon name="lucide:minus" class="w-3 h-3" />
											{{ listName(rule.remove_from_list) }}
										</span>
									</template>
								</div>
							</div>

							<!-- Toggle (stop propagation so row click doesn't fire) -->
							<div class="flex-shrink-0" @click.stop>
								<UToggle
									:model-value="!!rule.enabled"
									@update:model-value="(v: boolean) => handleToggle(rule, v)"
								/>
							</div>
						</div>
					</div>
				</section>
			</template>
		</div>

		<!-- Modal — bottom sheet, teleported to body (renders correctly even
		     when this surface lives inside a transformed slide-over panel). -->
		<LeadsAutomationFormModal
			v-model="showModal"
			:rule="editingRule"
			:mailing-lists="mailingLists"
			@created="handleCreated"
			@updated="handleUpdated"
			@deleted="handleDeleted"
		/>
	</div>
</template>
