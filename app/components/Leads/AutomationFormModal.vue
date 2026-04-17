<template>
	<UModal v-model="isOpen" class="sm:max-w-lg">
		<template #header>
			<div class="flex items-center justify-between">
				<h3 class="text-sm font-bold uppercase tracking-wide">{{ isEditing ? 'Edit Rule' : 'New Rule' }}</h3>
				<Button variant="ghost" size="icon-sm" @click="isOpen = false">
					<UIcon name="i-heroicons-x-mark" class="h-4 w-4" />
				</Button>
			</div>
		</template>

		<form @submit.prevent="handleSubmit" class="space-y-4 p-4 max-h-[70vh] overflow-y-auto">
			<!-- Stages -->
			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">From Stage</label>
					<select
						v-model="form.from_stage"
						class="w-full rounded-full border bg-background px-3 py-2 text-sm"
					>
						<option :value="null">Any stage</option>
						<option v-for="(label, id) in stageOptions" :key="id" :value="id">
							{{ label }}
						</option>
					</select>
				</div>
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">To Stage <span class="text-destructive">*</span></label>
					<select
						v-model="form.to_stage"
						class="w-full rounded-full border bg-background px-3 py-2 text-sm"
					>
						<option v-for="(label, id) in stageOptions" :key="id" :value="id">
							{{ label }}
						</option>
					</select>
				</div>
			</div>

			<!-- Lists -->
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Add to list</label>
				<select
					v-model="form.add_to_list"
					class="w-full rounded-full border bg-background px-3 py-2 text-sm"
				>
					<option :value="null">— None —</option>
					<option v-for="list in mailingLists" :key="list.id" :value="list.id">
						{{ list.name || list.slug }}
					</option>
				</select>
			</div>
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Remove from list</label>
				<select
					v-model="form.remove_from_list"
					class="w-full rounded-full border bg-background px-3 py-2 text-sm"
				>
					<option :value="null">— None —</option>
					<option v-for="list in mailingLists" :key="list.id" :value="list.id">
						{{ list.name || list.slug }}
					</option>
				</select>
			</div>

			<!-- Description -->
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Description</label>
				<UInput v-model="form.description" placeholder="e.g. Lost → add to nurture" />
			</div>

			<!-- Enabled -->
			<div class="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
				<div>
					<p class="text-sm font-medium">Enabled</p>
					<p class="text-[11px] text-muted-foreground">Turn off to pause this rule without deleting it.</p>
				</div>
				<UToggle v-model="form.enabled" />
			</div>

			<!-- Validation hint -->
			<p v-if="validationError" class="text-xs text-destructive">{{ validationError }}</p>
		</form>

		<template #footer>
			<div class="flex items-center justify-between w-full">
				<div class="flex items-center gap-1">
					<UTooltip v-if="isEditing" text="Delete">
						<Button
							variant="ghost"
							size="icon-sm"
							class="text-destructive hover:text-destructive hover:bg-destructive/10"
							:disabled="saving"
							@click="handleDelete"
						>
							<Icon name="lucide:trash-2" class="h-3.5 w-3.5" />
						</Button>
					</UTooltip>
					<Button size="sm" :disabled="saving || !canSubmit" @click="handleSubmit">
						<Icon v-if="saving" name="lucide:loader-2" class="h-3.5 w-3.5 mr-1 animate-spin" />
						<Icon v-else name="lucide:save" class="h-3.5 w-3.5 mr-1" />
						{{ isEditing ? 'Save' : 'Create' }}
					</Button>
				</div>
			</div>
		</template>
	</UModal>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button';
import { LEAD_STAGE_LABELS, type LeadStage } from '~~/shared/leads';
import type { LeadStageListRule } from '~~/shared/directus';
import type { MailingList } from '~~/shared/email/contacts';

const props = defineProps<{
	rule?: LeadStageListRule | null;
	mailingLists?: MailingList[];
}>();

const emit = defineEmits<{
	(e: 'created', rule: LeadStageListRule): void;
	(e: 'updated', rule: LeadStageListRule): void;
	(e: 'deleted', id: number): void;
}>();

const isOpen = defineModel<boolean>({ default: false });
const isEditing = computed(() => !!props.rule?.id);
const saving = ref(false);

const { selectedOrg } = useOrganization();
const toast = useToast();
const rulesItems = useDirectusItems<LeadStageListRule>('lead_stage_list_rules');

const stageOptions = LEAD_STAGE_LABELS as Record<LeadStage, string>;
const mailingLists = computed(() => props.mailingLists || []);

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

function populateForm() {
	const r = props.rule;
	if (r) {
		form.from_stage = (r.from_stage ?? null) as LeadStage | null;
		form.to_stage = r.to_stage as LeadStage;
		form.add_to_list = typeof r.add_to_list === 'object' ? (r.add_to_list?.id ?? null) : (r.add_to_list ?? null);
		form.remove_from_list = typeof r.remove_from_list === 'object' ? (r.remove_from_list?.id ?? null) : (r.remove_from_list ?? null);
		form.description = r.description || '';
		form.enabled = r.enabled ?? true;
	} else {
		Object.assign(form, {
			from_stage: null,
			to_stage: 'new',
			add_to_list: null,
			remove_from_list: null,
			description: '',
			enabled: true,
		});
	}
}

watch(isOpen, (val) => {
	if (val) populateForm();
});

async function handleSubmit() {
	if (!canSubmit.value) return;
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

	let result: LeadStageListRule | null = null;
	let mode: 'created' | 'updated' = 'updated';
	try {
		if (isEditing.value && props.rule?.id) {
			result = (await rulesItems.update(props.rule.id, payload as any)) as LeadStageListRule;
			mode = 'updated';
			toast.add({ title: 'Rule updated', color: 'green' });
		} else {
			result = (await rulesItems.create({
				...payload,
				organization: selectedOrg.value,
			} as any)) as LeadStageListRule;
			mode = 'created';
			toast.add({ title: 'Rule created', color: 'green' });
		}
	} catch (err: any) {
		console.error('Error saving rule:', err);
		toast.add({ title: 'Failed to save rule', description: err?.message, color: 'red' });
	} finally {
		saving.value = false;
	}

	if (result) {
		isOpen.value = false;
		await nextTick();
		if (mode === 'created') emit('created', result);
		else emit('updated', result);
	}
}

async function handleDelete() {
	if (!isEditing.value || !props.rule?.id) return;
	if (!confirm('Delete this automation rule? This cannot be undone.')) return;

	saving.value = true;
	let deletedId: number | null = null;
	try {
		await rulesItems.remove(props.rule.id);
		deletedId = props.rule.id;
		toast.add({ title: 'Rule deleted', color: 'green' });
	} catch (err: any) {
		console.error('Error deleting rule:', err);
		toast.add({ title: 'Failed to delete rule', description: err?.message, color: 'red' });
	} finally {
		saving.value = false;
	}

	if (deletedId !== null) {
		isOpen.value = false;
		await nextTick();
		emit('deleted', deletedId);
	}
}
</script>
