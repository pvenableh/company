<script setup lang="ts">
/**
 * pull_quote — an oversized quotation callout with optional attribution.
 * Mirrors the Hue HUE-605 "know thyself." — plato moment.
 */
import type { PullQuotePayload } from '~~/shared/blocks/types';

const props = defineProps<{
	modelValue: PullQuotePayload;
}>();

const emit = defineEmits<{
	'update:modelValue': [v: PullQuotePayload];
}>();

function patch(p: Partial<PullQuotePayload>) {
	emit('update:modelValue', { ...props.modelValue, ...p });
}

const ALIGN_OPTIONS = [
	{ value: 'left', label: 'Left' },
	{ value: 'center', label: 'Center' },
];
</script>

<template>
	<div class="space-y-2">
		<textarea
			:value="modelValue?.quote_markdown || ''"
			placeholder="Quote (markdown supported)"
			rows="3"
			class="w-full bg-transparent border-0 focus:ring-0 outline-none resize-y text-base font-semibold leading-snug"
			@input="patch({ quote_markdown: ($event.target as HTMLTextAreaElement).value })"
		/>
		<input
			:value="modelValue?.attribution || ''"
			placeholder="Attribution (optional) — e.g. Plato"
			class="w-full bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-0 py-1 text-sm"
			@input="patch({ attribution: ($event.target as HTMLInputElement).value })"
		/>
		<div class="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
			<span>Align</span>
			<div class="flex gap-1">
				<button
					v-for="opt in ALIGN_OPTIONS"
					:key="opt.value"
					class="px-2 py-0.5 rounded border"
					:class="(modelValue?.align || 'left') === opt.value ? 'border-primary text-primary bg-primary/5' : 'border-border'"
					@click="patch({ align: opt.value as PullQuotePayload['align'] })"
				>
					{{ opt.label }}
				</button>
			</div>
		</div>
	</div>
</template>
