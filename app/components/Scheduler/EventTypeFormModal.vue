<template>
	<UModal v-model="isOpen" class="sm:max-w-xl">
		<template #header>
			<h3 class="text-sm font-bold uppercase tracking-wide">{{ isEditing ? 'Edit Event Type' : 'New Event Type' }}</h3>
		</template>

		<form class="space-y-4 max-h-[70vh] overflow-y-auto" @submit.prevent="handleSubmit">
			<!-- Title + slug -->
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Title <span class="text-destructive">*</span></label>
					<UInput v-model="form.title" placeholder="Intro Call" @input="onTitleInput" />
				</div>
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">URL slug <span class="text-destructive">*</span></label>
					<UInput v-model="form.slug" placeholder="intro-call" />
				</div>
			</div>

			<!-- Description -->
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Description</label>
				<UTextarea v-model="form.description" :rows="2" placeholder="Quick chat to discuss your project" />
			</div>

			<!-- Duration + color -->
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Duration</label>
					<select
						v-model.number="form.duration"
						class="w-full rounded-full border bg-background px-3 py-2 text-sm"
					>
						<option v-for="opt in DURATION_OPTIONS" :key="opt" :value="opt">{{ opt }} min</option>
					</select>
				</div>
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Color</label>
					<div class="flex flex-wrap gap-1.5">
						<button
							v-for="c in COLOR_SWATCHES"
							:key="c"
							type="button"
							class="w-6 h-6 rounded-full border-2 transition"
							:class="form.color === c ? 'border-foreground' : 'border-transparent'"
							:style="{ background: c }"
							@click="form.color = c"
						/>
					</div>
				</div>
			</div>

			<!-- Intake schema -->
			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<label class="t-label text-muted-foreground">Intake form fields</label>
					<Button type="button" variant="ghost" size="sm" @click="addIntakeField">
						<Icon name="lucide:plus" class="h-3.5 w-3.5 mr-1" /> Add field
					</Button>
				</div>
				<p class="text-[11px] text-muted-foreground">
					Asked before time picker. Leave empty to skip the intake step.
				</p>
				<div v-if="form.intake_schema.length === 0" class="text-xs text-muted-foreground italic px-1">
					No intake fields yet.
				</div>
				<div
					v-for="(field, idx) in form.intake_schema"
					:key="idx"
					class="rounded-lg border bg-muted/30 p-3 space-y-2"
				>
					<div class="flex items-center gap-2">
						<UInput
							v-model="field.label"
							placeholder="Question label"
							class="flex-1"
						/>
						<select
							v-model="field.type"
							class="rounded-full border bg-background px-3 py-2 text-xs"
						>
							<option value="text">Text</option>
							<option value="textarea">Long text</option>
							<option value="select">Select</option>
							<option value="checkbox">Checkbox</option>
						</select>
						<Button type="button" variant="ghost" size="icon-sm" @click="removeIntakeField(idx)">
							<Icon name="lucide:trash-2" class="h-3.5 w-3.5 text-destructive" />
						</Button>
					</div>
					<div class="flex items-center gap-3">
						<UInput
							v-model="field.name"
							placeholder="machine_name"
							class="flex-1 font-mono text-xs"
							@input="onFieldNameInput(field)"
						/>
						<label class="flex items-center gap-1.5 text-xs">
							<input v-model="field.required" type="checkbox" />
							Required
						</label>
					</div>
					<div v-if="field.type === 'select'" class="space-y-1">
						<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Options (comma-separated)</label>
						<UInput
							:model-value="(field.options || []).join(', ')"
							placeholder="Under $5k, $5k-$25k, $25k+"
							@update:model-value="(v) => (field.options = String(v).split(',').map((s) => s.trim()).filter(Boolean))"
						/>
					</div>
				</div>
			</div>

			<!-- Price (Stage 5 placeholder) -->
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Price (USD, optional)</label>
				<UInput
					:model-value="priceDollars ?? ''"
					type="number"
					min="0"
					step="0.01"
					disabled
					placeholder="0.00"
				/>
				<p class="text-[11px] text-muted-foreground italic">Payment collection coming in Stage 5.</p>
			</div>

			<!-- Toggles -->
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<div class="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
					<div>
						<p class="text-xs font-medium">Default</p>
						<p class="text-[11px] text-muted-foreground">Bare booking URL lands here.</p>
					</div>
					<UToggle v-model="form.is_default" />
				</div>
				<div class="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
					<div>
						<p class="text-xs font-medium">Enabled</p>
						<p class="text-[11px] text-muted-foreground">Off = bookable URL 404s.</p>
					</div>
					<UToggle v-model="form.enabled" />
				</div>
			</div>

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
import type { EventType, EventTypeIntakeField } from '~~/shared/directus';

const props = defineProps<{
	eventType?: EventType | null;
	allEventTypes?: EventType[];
}>();

const emit = defineEmits<{
	(e: 'created', et: EventType): void;
	(e: 'updated', et: EventType): void;
	(e: 'deleted', id: number): void;
}>();

const isOpen = defineModel<boolean>({ default: false });
const isEditing = computed(() => !!props.eventType?.id);
const saving = ref(false);

const { user } = useDirectusAuth();
const { selectedOrg } = useOrganization();
const toast = useToast();
const eventTypeItems = useDirectusItems<EventType>('event_types');

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

// Swatches mirror the apps-layout palette tokens so the booking page picks
// up the same accents the in-app surfaces use.
const COLOR_SWATCHES = [
	'#6366F1', // indigo
	'#10B981', // emerald
	'#F59E0B', // amber
	'#EF4444', // red
	'#3B82F6', // blue
	'#EC4899', // pink
	'#8B5CF6', // violet
	'#14B8A6', // teal
];

interface IntakeFieldDraft extends EventTypeIntakeField {
	required: boolean;
}

const form = reactive({
	title: '',
	slug: '',
	description: '',
	duration: 30 as number,
	color: COLOR_SWATCHES[0] as string,
	intake_schema: [] as IntakeFieldDraft[],
	price_cents: null as number | null,
	is_default: false,
	enabled: true,
});

// Stage 5 will wire payments. Read-only here.
const priceDollars = computed(() => (form.price_cents == null ? null : form.price_cents / 100));

const slugify = (s: string) => s.toLowerCase().trim()
	.replace(/[^a-z0-9]+/g, '-')
	.replace(/^-+|-+$/g, '')
	.slice(0, 60);

let slugTouched = false;

function onTitleInput() {
	if (!slugTouched && !isEditing.value) {
		form.slug = slugify(form.title);
	}
}

function onFieldNameInput(field: IntakeFieldDraft) {
	field.name = (field.name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

function addIntakeField() {
	form.intake_schema.push({
		name: `field_${form.intake_schema.length + 1}`,
		label: '',
		type: 'text',
		required: false,
	});
}

function removeIntakeField(idx: number) {
	form.intake_schema.splice(idx, 1);
}

const validationError = computed(() => {
	if (!form.title.trim()) return 'Title is required.';
	if (!form.slug.trim()) return 'Slug is required.';
	if (!/^[a-z0-9-]+$/.test(form.slug)) return 'Slug may only contain lowercase letters, numbers, and dashes.';

	// Per-host slug uniqueness check
	const others = (props.allEventTypes || []).filter((e) => e.id !== props.eventType?.id);
	if (others.some((e) => e.slug === form.slug)) return 'You already have an event type with this slug.';

	for (const f of form.intake_schema) {
		if (!f.label.trim()) return 'Each intake field needs a label.';
		if (!f.name.trim()) return 'Each intake field needs a machine name.';
	}
	return '';
});

const canSubmit = computed(() => !validationError.value);

function populateForm() {
	const et = props.eventType;
	slugTouched = !!et;
	if (et) {
		form.title = et.title || '';
		form.slug = et.slug || '';
		form.description = et.description || '';
		form.duration = et.duration || 30;
		form.color = et.color || COLOR_SWATCHES[0]!;
		form.intake_schema = Array.isArray(et.intake_schema)
			? et.intake_schema.map((f) => ({ ...f, required: !!f.required })) as IntakeFieldDraft[]
			: [];
		form.price_cents = et.price_cents ?? null;
		form.is_default = !!et.is_default;
		form.enabled = et.enabled !== false;
	} else {
		form.title = '';
		form.slug = '';
		form.description = '';
		form.duration = 30;
		form.color = COLOR_SWATCHES[0]!;
		form.intake_schema = [];
		form.price_cents = null;
		// First event type the host creates becomes default automatically.
		form.is_default = (props.allEventTypes || []).length === 0;
		form.enabled = true;
	}
}

watch(isOpen, (val) => { if (val) populateForm(); });
watch(() => form.slug, () => { slugTouched = true; });

async function unsetOtherDefaults() {
	const others = (props.allEventTypes || []).filter(
		(e) => e.id !== props.eventType?.id && e.is_default,
	);
	for (const other of others) {
		try {
			await eventTypeItems.update(other.id, { is_default: false } as any);
		} catch (err: any) {
			console.warn('[event-type] failed to clear default on', other.id, err.message);
		}
	}
}

async function handleSubmit() {
	if (!canSubmit.value) return;
	saving.value = true;

	if (form.is_default) await unsetOtherDefaults();

	const payload: Record<string, any> = {
		title: form.title.trim(),
		slug: form.slug.trim(),
		description: form.description?.trim() || null,
		duration: form.duration,
		color: form.color,
		intake_schema: form.intake_schema,
		price_cents: form.price_cents,
		is_default: form.is_default,
		enabled: form.enabled,
		status: 'published',
	};

	let result: EventType | null = null;
	let mode: 'created' | 'updated' = 'updated';
	try {
		if (isEditing.value && props.eventType?.id) {
			result = (await eventTypeItems.update(props.eventType.id, payload as any)) as EventType;
			mode = 'updated';
			toast.add({ title: 'Event type updated', color: 'green' });
		} else {
			const orgId = typeof selectedOrg.value === 'string'
				? selectedOrg.value
				: (selectedOrg.value as any)?.id;
			result = (await eventTypeItems.create({
				...payload,
				organization: orgId,
				host_user: user.value?.id,
			} as any)) as EventType;
			mode = 'created';
			toast.add({ title: 'Event type created', color: 'green' });
		}
	} catch (err: any) {
		console.error('Error saving event type:', err);
		toast.add({ title: 'Failed to save event type', description: err?.message, color: 'red' });
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
	if (!isEditing.value || !props.eventType?.id) return;
	if (!confirm('Delete this event type? Existing bookings keep their record but the URL will 404.')) return;

	saving.value = true;
	let deletedId: number | null = null;
	try {
		await eventTypeItems.remove(props.eventType.id);
		deletedId = props.eventType.id;
		toast.add({ title: 'Event type deleted', color: 'green' });
	} catch (err: any) {
		console.error('Error deleting event type:', err);
		toast.add({ title: 'Failed to delete event type', description: err?.message, color: 'red' });
	} finally {
		saving.value = false;
	}

	if (deletedId) {
		isOpen.value = false;
		await nextTick();
		emit('deleted', deletedId);
	}
}
</script>
