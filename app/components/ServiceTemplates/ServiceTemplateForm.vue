<template>
	<form @submit.prevent="handleSubmit" class="space-y-4">
		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Name *</label>
			<UInput v-model="form.name" placeholder="e.g. Brand Identity Package" required />
		</div>

		<div class="grid grid-cols-2 gap-4">
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Category</label>
				<select
					v-model="form.category"
					class="w-full rounded-full border bg-background px-3 py-2 text-sm"
				>
					<option value="branding">Branding</option>
					<option value="web">Web</option>
					<option value="marketing">Marketing</option>
					<option value="retainer">Retainer</option>
					<option value="other">Other</option>
				</select>
			</div>
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Status</label>
				<select
					v-model="form.status"
					class="w-full rounded-full border bg-background px-3 py-2 text-sm"
				>
					<option value="published">Published</option>
					<option value="draft">Draft</option>
					<option value="archived">Archived</option>
				</select>
			</div>
		</div>

		<div class="space-y-1">
			<label class="t-label text-muted-foreground">One-line description</label>
			<UInput v-model="form.description" placeholder="Shown in the picker" />
		</div>

		<div class="grid grid-cols-2 gap-4">
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Default total</label>
				<UInput v-model="form.default_total" type="number" step="0.01" placeholder="0.00" icon="i-heroicons-currency-dollar" />
			</div>
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Duration (days)</label>
				<UInput v-model="form.default_duration_days" type="number" placeholder="30" />
			</div>
		</div>

		<div class="space-y-3">
			<!-- Icon picker — curated grid of common-for-agency emojis.
			     Inline rather than popovered because UPopover doesn't open
			     reliably inside a modal (focus-trap conflict). One tap to
			     pick; Clear resets. -->
			<div class="space-y-1">
				<div class="flex items-center justify-between">
					<label class="t-label text-muted-foreground">Icon</label>
					<button
						v-if="form.icon"
						type="button"
						class="text-xs text-muted-foreground hover:text-foreground underline"
						@click="form.icon = ''"
					>Clear</button>
				</div>
				<div class="flex flex-wrap gap-1.5">
					<button
						v-for="e in EMOJI_OPTIONS"
						:key="e"
						type="button"
						class="w-8 h-8 rounded-md text-base flex items-center justify-center hover:bg-muted/60 transition-colors"
						:class="form.icon === e ? 'bg-muted/70 ring-1 ring-primary/40' : 'bg-muted/20'"
						@click="form.icon = e"
					>{{ e }}</button>
				</div>
			</div>

			<!-- Color picker -->
			<div class="space-y-1">
				<label class="t-label text-muted-foreground">Color</label>
				<div class="flex items-center gap-3">
					<label class="relative inline-flex items-center justify-center w-9 h-9 rounded-full border cursor-pointer overflow-hidden shrink-0" :style="swatchStyle">
						<input type="color" :value="colorOrFallback" @input="onColorInput" class="absolute inset-0 opacity-0 cursor-pointer" />
					</label>
					<UInput v-model="form.color" placeholder="#56cfe1" class="flex-1 max-w-[180px]" />
					<button
						v-if="form.color"
						type="button"
						class="text-xs text-muted-foreground hover:text-foreground underline"
						@click="form.color = ''"
					>Reset</button>
				</div>
			</div>
		</div>

		<!-- Live preview chip — shows the service name + chosen emoji on
		     the picked colour with a contrast-adapted foreground. Whatever
		     the user picks, the chip below proves the text stays legible. -->
		<div>
			<div class="text-[10px] uppercase tracking-wider t-text-muted mb-1.5">Preview</div>
			<span
				class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
				:style="previewChipStyle"
			>
				<span v-if="form.icon" class="text-base leading-none">{{ form.icon }}</span>
				<span v-else class="w-1.5 h-1.5 rounded-full" :style="{ backgroundColor: previewChipStyle.color }" />
				{{ form.name || 'Service name' }}
			</span>
			<p class="text-xs t-text-muted mt-1.5">Used as the swatch wherever this service is surfaced. Leave empty to fall through to the Work-app accent.</p>
		</div>

		<div class="space-y-1">
			<label class="t-label text-muted-foreground">Default scope</label>
			<DocumentsBlocksScopeTreeEditor
				v-model="form.scope_payload"
				:enable-service-import="false"
			/>
			<p class="text-xs t-text-muted">Phased deliverables. Same primitive used in proposals — when this offering is dropped into a proposal, these phases are appended directly to the scope tree.</p>
			<details v-if="legacyScopeText" class="text-xs t-text-muted mt-2">
				<summary class="cursor-pointer">Legacy free-text scope (read-only)</summary>
				<pre class="whitespace-pre-wrap p-2 rounded bg-muted/40 mt-1 max-h-40 overflow-auto">{{ legacyScopeText }}</pre>
			</details>
		</div>
	</form>
</template>

<script setup lang="ts">
import type { ServiceTemplate } from '~/composables/useServiceTemplates';
import type { ScopeTreePayload } from '~~/shared/blocks/types';
import { legibleTextOn, legibleTextOnHsl } from '~/utils/color-contrast';

const props = defineProps<{
	template?: Partial<ServiceTemplate> | null;
	saving?: boolean;
}>();

// Live Work-accent HSL for the no-color fallback. Reading it here means
// the preview chip's text contrast tracks the palette switch — Aurora's
// Electric Sapphire wants white text, Sea Mist's Strong Cyan wants dark.
const { accents } = useAppAccent();
const workAccent = computed(() => accents.value.work);

const emit = defineEmits<{
	submit: [data: any];
}>();

const form = reactive<{
	name: string;
	category: string;
	status: string;
	description: string;
	scope_payload: ScopeTreePayload;
	default_total: number | string;
	default_duration_days: number | string;
	color: string;
	icon: string;
}>({
	name: props.template?.name || '',
	category: props.template?.category || 'other',
	status: props.template?.status || 'published',
	description: props.template?.description || '',
	scope_payload: normalizeScopePayload(props.template?.scope_payload),
	default_total: props.template?.default_total ?? '',
	default_duration_days: props.template?.default_duration_days ?? '',
	color: props.template?.color || '',
	icon: props.template?.icon || '',
});

const legacyScopeText = computed(() => {
	const t = props.template?.scope_template;
	if (!t || typeof t !== 'string') return '';
	return t.trim();
});

function normalizeScopePayload(p: ScopeTreePayload | null | undefined): ScopeTreePayload {
	if (p && Array.isArray(p.phases)) return p;
	return { numbering_style: 'phase_word', phases: [] };
}

// Curated grid covering the kinds of work an agency runs. Six columns by
// four rows = 24 picks — enough to feel personal, few enough to make
// picking feel like recognition, not a decision.
const EMOJI_OPTIONS = [
	'🎨', '✏️', '🖼️', '🎬', '📷', '🎵',
	'🌐', '📱', '💻', '⚙️', '🤖', '🔧',
	'📣', '📢', '✉️', '📰', '📊', '📈',
	'💼', '📦', '🛍️', '🏷️', '🎯', '✨',
] as const;

const colorOrFallback = computed(() => form.color || '#56cfe1');
const swatchStyle = computed(() => ({ backgroundColor: form.color || 'hsl(var(--app-work))' }));

// Preview chip: if the user hasn't picked a colour, fall through to the
// live Work-app accent so the preview tracks the active palette. Text
// contrast is computed off the same source — hex via legibleTextOn,
// HSL via legibleTextOnHsl — so legibility is guaranteed at every value
// the user can dial in and on every palette they can switch to.
const previewChipStyle = computed(() => {
	if (form.color) {
		return { backgroundColor: form.color, color: legibleTextOn(form.color) };
	}
	const a = workAccent.value;
	return {
		backgroundColor: `hsl(${a.h} ${a.s}% ${a.l}%)`,
		color: legibleTextOnHsl(a.h, a.s, a.l),
	};
});

function onColorInput(e: Event) {
	form.color = (e.target as HTMLInputElement).value;
}

function handleSubmit() {
	emit('submit', {
		name: form.name,
		category: form.category,
		status: form.status,
		description: form.description,
		scope_payload: form.scope_payload,
		color: form.color?.trim() || null,
		icon: form.icon?.trim() || null,
		default_total: form.default_total === '' || form.default_total == null ? null : Number(form.default_total),
		default_duration_days: form.default_duration_days === '' || form.default_duration_days == null ? null : Number(form.default_duration_days),
	});
}

defineExpose({
	triggerSubmit: handleSubmit,
	hasName: computed(() => !!form.name?.trim()),
});
</script>
