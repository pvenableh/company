<script setup lang="ts">
/**
 * cover — title-page editor. A small form; the drama lives in the Renderer
 * (full-bleed accent panel). Logo, recipient + dates fall back to the
 * document's cover context when left blank, so most covers need only a title.
 */
import type { CoverPayload } from '~~/shared/blocks/types';

const props = defineProps<{
	modelValue: CoverPayload;
}>();

const emit = defineEmits<{
	'update:modelValue': [v: CoverPayload];
}>();

function patch(p: Partial<CoverPayload>) {
	emit('update:modelValue', { ...props.modelValue, ...p });
}
</script>

<template>
	<div class="space-y-2">
		<input
			:value="modelValue?.eyebrow || ''"
			placeholder="Eyebrow (optional) — e.g. PROPOSAL"
			class="w-full bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-0 py-1 text-[10px] uppercase tracking-wider text-muted-foreground"
			@input="patch({ eyebrow: ($event.target as HTMLInputElement).value })"
		/>
		<input
			:value="modelValue?.title || ''"
			placeholder="Title — e.g. 605 Lincoln Road"
			class="w-full bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-0 py-1 text-lg font-bold"
			@input="patch({ title: ($event.target as HTMLInputElement).value })"
		/>
		<input
			:value="modelValue?.subtitle || ''"
			placeholder="Subtitle — e.g. identity and management portal proposal"
			class="w-full bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-0 py-1 text-sm"
			@input="patch({ subtitle: ($event.target as HTMLInputElement).value })"
		/>
		<div class="grid grid-cols-2 gap-2">
			<input
				:value="modelValue?.prepared_for || ''"
				placeholder="Prepared for (optional)"
				class="w-full bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-0 py-1 text-sm"
				@input="patch({ prepared_for: ($event.target as HTMLInputElement).value })"
			/>
			<input
				:value="modelValue?.date || ''"
				placeholder="Date — e.g. September 17, 2024"
				class="w-full bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-0 py-1 text-sm"
				@input="patch({ date: ($event.target as HTMLInputElement).value })"
			/>
		</div>
		<textarea
			:value="modelValue?.tagline_markdown || ''"
			placeholder="Tagline / intro line (optional, markdown)"
			rows="2"
			class="w-full bg-transparent border-0 focus:ring-0 outline-none resize-y text-sm leading-relaxed"
			@input="patch({ tagline_markdown: ($event.target as HTMLTextAreaElement).value })"
		/>
		<label class="text-[11px] inline-flex items-center gap-1.5 text-muted-foreground">
			<input
				type="checkbox"
				:checked="modelValue?.show_logo !== false"
				@change="patch({ show_logo: ($event.target as HTMLInputElement).checked })"
			/>
			Show organization logo
		</label>
	</div>
</template>
