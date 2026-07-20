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
						class="glass-field w-full rounded-full px-3 py-2 text-sm"
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
							class="glass-field rounded-full px-3 py-2 text-xs"
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

			<!-- Payment -->
			<div class="space-y-2">
				<div class="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
					<div>
						<p class="text-xs font-medium">Require payment</p>
						<p class="text-[11px] text-muted-foreground">Collect a fee via Stripe Checkout before confirming.</p>
					</div>
					<UToggle v-model="requirePayment" />
				</div>
				<div v-if="requirePayment" class="space-y-1 pl-1">
					<label class="t-label text-muted-foreground">Price (USD) <span class="text-destructive">*</span></label>
					<UInput
						:model-value="priceDollars ?? ''"
						type="number"
						min="0"
						step="0.01"
						placeholder="0.00"
						@update:model-value="onPriceInput"
					/>
					<p v-if="!stripeActive" class="text-[11px] text-warning flex items-center gap-1">
						<Icon name="lucide:alert-triangle" class="h-3 w-3" />
						<span>
							Connect Stripe in
							<NuxtLink to="/money/settings?floor=payments" class="underline">Money → Settings</NuxtLink>
							to take payments. Paid bookings will fail until then.
						</span>
					</p>
					<p v-else class="text-[11px] text-muted-foreground">
						Invitees pay via Stripe Checkout before the booking is confirmed.
					</p>
				</div>
			</div>

			<!-- Routing + audience -->
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Scheduling</label>
					<select v-model="form.scheduling_type" class="glass-field w-full rounded-full px-3 py-2 text-sm">
						<option value="single">Just me</option>
						<option value="round_robin">Round-robin (any free teammate)</option>
						<option value="collective">Collective (all teammates attend)</option>
					</select>
				</div>
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Who can book</label>
					<select v-model="form.audience" class="glass-field w-full rounded-full px-3 py-2 text-sm">
						<option value="public">Public — anyone with the link</option>
						<option value="client_portal">Clients — portal login required</option>
						<option value="internal">Internal — org members only</option>
					</select>
				</div>
			</div>

			<!-- Host pool (round-robin / collective) -->
			<div v-if="form.scheduling_type !== 'single'" class="space-y-1.5">
				<label class="t-label text-muted-foreground">Host pool</label>
				<p class="text-[11px] text-muted-foreground">
					{{ form.scheduling_type === 'round_robin' ? 'A booking routes to whichever selected teammate is free.' : 'Every selected teammate is added to each booking.' }}
				</p>
				<div v-if="availableHosts.length === 0" class="text-xs text-muted-foreground italic px-1">
					No booking-enabled teammates found.
				</div>
				<div v-else class="flex flex-wrap gap-1.5">
					<button
						v-for="h in availableHosts"
						:key="h.id"
						type="button"
						class="px-2.5 py-1 rounded-full border text-xs transition"
						:class="hostPool.includes(h.id) ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40'"
						@click="toggleHost(h.id)"
					>
						{{ [h.first_name, h.last_name].filter(Boolean).join(' ') || h.email }}
					</button>
				</div>
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
	scheduling_type: 'single' as 'single' | 'round_robin' | 'collective',
	audience: 'public' as 'public' | 'client_portal' | 'internal',
});

// Round-robin/collective host pool (Phase 5). Only used when scheduling_type != single.
const hostPool = ref<string[]>([]);
const availableHosts = ref<any[]>([]);

async function loadAvailableHosts() {
	const orgId = typeof selectedOrg.value === 'string' ? selectedOrg.value : (selectedOrg.value as any)?.id;
	if (!orgId) return;
	try {
		const res = await $fetch('/api/scheduler/available-hosts', { params: { orgId } });
		availableHosts.value = (res as any)?.data || [];
	} catch {
		availableHosts.value = [];
	}
}

function toggleHost(id: string) {
	hostPool.value = hostPool.value.includes(id)
		? hostPool.value.filter((h) => h !== id)
		: [...hostPool.value, id];
}

// Explicit "require payment" toggle. Backed by price_cents (null = free). When
// turned off we clear the price so the booking flow stays on the free path.
const requirePayment = ref(false);
watch(requirePayment, (on) => {
	if (!on) form.price_cents = null;
	else if (form.price_cents == null) form.price_cents = 0;
});

const priceDollars = computed(() => (form.price_cents == null ? null : form.price_cents / 100));

function onPriceInput(v: string | number | null) {
	const raw = v === null || v === undefined ? '' : String(v).trim();
	if (!raw) {
		form.price_cents = null;
		return;
	}
	const parsed = parseFloat(raw);
	if (!Number.isFinite(parsed) || parsed < 0) {
		form.price_cents = null;
		return;
	}
	form.price_cents = Math.round(parsed * 100);
}

// Surface a warning when the host sets a price without Stripe Connect active.
// Defaults to true so the warning never flashes for orgs that are properly set up.
const stripeActive = ref(true);
if (import.meta.client) {
	watch(
		selectedOrg,
		async (org) => {
			const id = typeof org === 'string' ? org : (org as any)?.id;
			if (!id) return;
			try {
				const res = await $fetch<{ status?: string }>(`/api/stripe/connect/status`, {
					params: { organizationId: id },
				});
				stripeActive.value = res?.status === 'active';
			} catch {
				// 403 (no read perm) or 412 (no account) — assume not active so the
				// warning surfaces. Hosts who can't see the status almost certainly
				// can't take payments either.
				stripeActive.value = false;
			}
		},
		{ immediate: true },
	);
}

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

		if (requirePayment.value && (!form.price_cents || form.price_cents <= 0)) {
			return 'Enter a price, or turn off Require payment.';
		}

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
			requirePayment.value = (et.price_cents ?? 0) > 0;
		form.is_default = !!et.is_default;
		form.enabled = et.enabled !== false;
		form.scheduling_type = (['single', 'round_robin', 'collective'].includes((et as any).scheduling_type) ? (et as any).scheduling_type : 'single');
		form.audience = (['public', 'client_portal', 'internal'].includes((et as any).audience) ? (et as any).audience : 'public');
		hostPool.value = [];
		if (et.id) {
			$fetch(`/api/scheduler/event-types/${et.id}/hosts`).then((r: any) => { hostPool.value = r?.hostUserIds || []; }).catch(() => {});
		}
	} else {
		form.title = '';
		form.slug = '';
		form.description = '';
		form.duration = 30;
		form.color = COLOR_SWATCHES[0]!;
		form.intake_schema = [];
		form.price_cents = null;
		requirePayment.value = false;
			// First event type the host creates becomes default automatically.
		form.is_default = (props.allEventTypes || []).length === 0;
		form.enabled = true;
		form.scheduling_type = 'single';
		form.audience = 'public';
		hostPool.value = [];
	}
}

watch(isOpen, (val) => { if (val) { populateForm(); loadAvailableHosts(); } });
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
		scheduling_type: form.scheduling_type,
		audience: form.audience,
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

	// Sync the round-robin/collective host pool (server-side; junction has no
	// client perms). Only meaningful for pooled types.
	if (result?.id && form.scheduling_type !== 'single') {
		try {
			await $fetch(`/api/scheduler/event-types/${result.id}/hosts`, {
				method: 'POST',
				body: { hostUserIds: hostPool.value },
			});
		} catch (err: any) {
			toast.add({ title: 'Saved, but could not update the host pool', description: err?.message, color: 'yellow' });
		}
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
