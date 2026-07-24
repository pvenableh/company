<!--
  LeadAutomationRulePanel — stacked child panel for creating/editing one
  lead-stage automation rule. Pushed on top of the `lead-automations` panel
  (or opened at depth 1 on the /leads/automations page) so the rule editor
  slides in with a back chevron instead of the old bottom sheet teleported
  over the surface.

  Self-contained per the registry contract: it loads its own mailing lists +
  (when editing) the rule by id, writes directly, and notifies the entity bus
  (`lead_stage_list_rules`) on save/delete so the automations list behind it
  repaints. `id === 'new'` (or `mode === 'new'`) is the create form.
-->
<script setup lang="ts">
import { Button } from '~/components/ui/button';
import { notifyEntityChange } from '~/composables/useEntityStore';
import { LEAD_STAGE_LABELS, type LeadStage } from '~~/shared/leads';
import type { LeadStageListRule } from '~~/shared/directus';
import type { MailingList } from '~~/shared/email/contacts';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string; mode?: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const isEditing = computed(() => props.id !== 'new' && props.mode !== 'new');

const { selectedOrg } = useOrganization();
const toast = useToast();
const { getLists } = useMailingLists();
const rulesItems = useDirectusItems<LeadStageListRule>('lead_stage_list_rules');

const stageOptions = LEAD_STAGE_LABELS as Record<LeadStage, string>;
const mailingLists = ref<MailingList[]>([]);
const loading = ref(true);
const saving = ref(false);

const form = reactive({
	from_stage: null as LeadStage | null,
	to_stage: 'new' as LeadStage,
	add_to_list: null as number | null,
	remove_from_list: null as number | null,
	description: '',
	enabled: true,
});

const validationError = computed(() => {
	if (!form.to_stage) return 'To Stage is required.';
	if (!form.add_to_list && !form.remove_from_list) {
		return 'Pick at least one list to add to or remove from.';
	}
	return '';
});
const canSubmit = computed(() => !validationError.value);

async function load() {
	loading.value = true;
	try {
		mailingLists.value = await getLists().catch(() => []);
		if (isEditing.value) {
			const r = await rulesItems.get(props.id, {
				fields: [
					'id', 'from_stage', 'to_stage', 'description', 'enabled',
					'add_to_list.id', 'remove_from_list.id',
				],
			});
			if (r) {
				form.from_stage = (r.from_stage ?? null) as LeadStage | null;
				form.to_stage = r.to_stage as LeadStage;
				form.add_to_list = typeof r.add_to_list === 'object' ? (r.add_to_list?.id ?? null) : (r.add_to_list ?? null);
				form.remove_from_list = typeof r.remove_from_list === 'object' ? (r.remove_from_list?.id ?? null) : (r.remove_from_list ?? null);
				form.description = r.description || '';
				form.enabled = r.enabled ?? true;
			}
		}
	} finally {
		loading.value = false;
	}
}

watch(() => props.id, load, { immediate: true });

async function handleSubmit() {
	if (!canSubmit.value || saving.value) return;
	saving.value = true;
	const payload: Record<string, any> = {
		from_stage: form.from_stage || null,
		to_stage: form.to_stage,
		add_to_list: form.add_to_list || null,
		remove_from_list: form.remove_from_list || null,
		description: form.description?.trim() || null,
		enabled: form.enabled,
		status: 'published',
	};
	try {
		let result: LeadStageListRule | null = null;
		if (isEditing.value) {
			result = (await rulesItems.update(props.id, payload as any)) as LeadStageListRule;
			toast.add({ title: 'Rule updated', color: 'green' });
		} else {
			result = (await rulesItems.create({ ...payload, organization: selectedOrg.value } as any)) as LeadStageListRule;
			toast.add({ title: 'Rule created', color: 'green' });
		}
		if (result) {
			notifyEntityChange('lead_stage_list_rules', { id: String(result.id ?? props.id), op: isEditing.value ? 'update' : 'create' });
			emit('close');
		}
	} catch (err: any) {
		toast.add({ title: 'Failed to save rule', description: err?.message, color: 'red' });
	} finally {
		saving.value = false;
	}
}

async function handleDelete() {
	if (!isEditing.value || saving.value) return;
	if (!confirm('Delete this automation rule? This cannot be undone.')) return;
	saving.value = true;
	try {
		await rulesItems.remove(props.id);
		notifyEntityChange('lead_stage_list_rules', { id: String(props.id), op: 'remove' });
		toast.add({ title: 'Rule deleted', color: 'green' });
		emit('close');
	} catch (err: any) {
		toast.add({ title: 'Failed to delete rule', description: err?.message, color: 'red' });
	} finally {
		saving.value = false;
	}
}
</script>

<template>
	<AppSlideOverShell :title="isEditing ? 'Edit Rule' : 'New Rule'" @close="emit('close')">
		<div v-if="loading" class="flex items-center justify-center py-16">
			<span class="spinner-ios spinner-ios--lg" role="status" aria-label="Loading" />
		</div>

		<form v-else id="automation-rule-form" class="space-y-4" @submit.prevent="handleSubmit">
			<!-- Stages -->
			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-1">
					<label class="text-[10px] uppercase tracking-wider text-muted-foreground">From Stage</label>
					<select v-model="form.from_stage" class="w-full rounded-full glass-field px-3 py-2 text-sm">
						<option :value="null">Any stage</option>
						<option v-for="(label, id) in stageOptions" :key="id" :value="id">{{ label }}</option>
					</select>
				</div>
				<div class="space-y-1">
					<label class="text-[10px] uppercase tracking-wider text-muted-foreground">To Stage <span class="text-destructive">*</span></label>
					<select v-model="form.to_stage" class="w-full rounded-full glass-field px-3 py-2 text-sm">
						<option v-for="(label, id) in stageOptions" :key="id" :value="id">{{ label }}</option>
					</select>
				</div>
			</div>

			<!-- Lists -->
			<div class="space-y-1">
				<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Add to list</label>
				<select v-model="form.add_to_list" class="w-full rounded-full glass-field px-3 py-2 text-sm">
					<option :value="null">— None —</option>
					<option v-for="list in mailingLists" :key="list.id" :value="list.id">{{ list.name || list.slug }}</option>
				</select>
			</div>
			<div class="space-y-1">
				<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Remove from list</label>
				<select v-model="form.remove_from_list" class="w-full rounded-full glass-field px-3 py-2 text-sm">
					<option :value="null">— None —</option>
					<option v-for="list in mailingLists" :key="list.id" :value="list.id">{{ list.name || list.slug }}</option>
				</select>
			</div>

			<!-- Description -->
			<div class="space-y-1">
				<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Description</label>
				<EInput v-model="form.description" placeholder="e.g. Lost → add to nurture" />
			</div>

			<!-- Enabled -->
			<div class="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
				<div>
					<p class="text-sm font-medium">Enabled</p>
					<p class="text-[11px] text-muted-foreground">Turn off to pause this rule without deleting it.</p>
				</div>
				<EToggle v-model="form.enabled" />
			</div>

			<p v-if="validationError" class="text-xs text-destructive">{{ validationError }}</p>
		</form>

		<template #footer>
			<div class="flex items-center justify-between w-full">
				<ETooltip v-if="isEditing" text="Delete">
					<Button
						variant="ghost"
						size="icon-sm"
						class="text-destructive hover:text-destructive hover:bg-destructive/10"
						:disabled="saving"
						@click="handleDelete"
					>
						<Icon name="lucide:trash-2" class="h-3.5 w-3.5" />
					</Button>
				</ETooltip>
				<span v-else />
				<Button type="submit" form="automation-rule-form" size="sm" :disabled="saving || !canSubmit">
					<Icon v-if="saving" name="lucide:loader-2" class="h-3.5 w-3.5 mr-1 animate-spin" />
					<Icon v-else name="lucide:save" class="h-3.5 w-3.5 mr-1" />
					{{ isEditing ? 'Save' : 'Create' }}
				</Button>
			</div>
		</template>
	</AppSlideOverShell>
</template>
