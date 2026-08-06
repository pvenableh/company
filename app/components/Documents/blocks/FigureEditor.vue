<script setup lang="ts">
/**
 * figure — a single image with an optional caption, width and alignment.
 */
import type { FigurePayload } from '~~/shared/blocks/types';

const props = defineProps<{
	modelValue: FigurePayload;
}>();

const emit = defineEmits<{
	'update:modelValue': [v: FigurePayload];
}>();

function patch(p: Partial<FigurePayload>) {
	emit('update:modelValue', { ...props.modelValue, ...p });
}

const WIDTH_OPTIONS = [
	{ value: 'full', label: 'Full' },
	{ value: 'wide', label: 'Wide' },
	{ value: 'inline', label: 'Inline' },
];
const ALIGN_OPTIONS = [
	{ value: 'left', label: 'Left' },
	{ value: 'center', label: 'Center' },
	{ value: 'right', label: 'Right' },
];
</script>

<template>
	<div class="space-y-2">
		<input
			:value="modelValue?.image_url || ''"
			placeholder="Image URL"
			class="w-full bg-transparent border-b border-border outline-none px-0 py-1 text-sm"
			@input="patch({ image_url: ($event.target as HTMLInputElement).value })"
		/>
		<img
			v-if="modelValue?.image_url"
			:src="modelValue.image_url"
			:alt="modelValue?.alt || ''"
			class="max-h-40 rounded border border-border object-contain"
		/>
		<input
			:value="modelValue?.caption || ''"
			placeholder="Caption (optional)"
			class="w-full bg-transparent border-0 outline-none px-0 py-1 text-sm text-muted-foreground"
			@input="patch({ caption: ($event.target as HTMLInputElement).value })"
		/>
		<input
			:value="modelValue?.alt || ''"
			placeholder="Alt text (optional, for accessibility)"
			class="w-full bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-0 py-0.5 text-xs text-muted-foreground"
			@input="patch({ alt: ($event.target as HTMLInputElement).value })"
		/>
		<div class="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
			<div class="flex items-center gap-1.5">
				<span>Width</span>
				<button
					v-for="opt in WIDTH_OPTIONS"
					:key="opt.value"
					class="px-2 py-0.5 rounded border"
					:class="(modelValue?.width || 'full') === opt.value ? 'border-primary text-primary bg-primary/5' : 'border-border'"
					@click="patch({ width: opt.value as FigurePayload['width'] })"
				>
					{{ opt.label }}
				</button>
			</div>
			<div class="flex items-center gap-1.5">
				<span>Align</span>
				<button
					v-for="opt in ALIGN_OPTIONS"
					:key="opt.value"
					class="px-2 py-0.5 rounded border"
					:class="(modelValue?.align || 'center') === opt.value ? 'border-primary text-primary bg-primary/5' : 'border-border'"
					@click="patch({ align: opt.value as FigurePayload['align'] })"
				>
					{{ opt.label }}
				</button>
			</div>
		</div>
	</div>
</template>
