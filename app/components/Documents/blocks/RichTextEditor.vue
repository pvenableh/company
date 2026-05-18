<script setup lang="ts">
/**
 * rich_text — heading + markdown body editor. Visually + behaviorally
 * identical to the inline editor that used to live in BlockComposer.vue.
 */
import type { RichTextPayload } from '~~/shared/blocks/types';

const props = defineProps<{
	modelValue: RichTextPayload;
}>();

const emit = defineEmits<{
	'update:modelValue': [v: RichTextPayload];
}>();

function patch(p: Partial<RichTextPayload>) {
	emit('update:modelValue', { ...props.modelValue, ...p });
}
</script>

<template>
	<div class="space-y-2">
		<input
			:value="modelValue?.heading || ''"
			placeholder="Section heading (optional)"
			class="w-full bg-transparent border-0 border-b border-transparent focus:border-border outline-none px-0 py-1 text-sm font-semibold"
			@input="patch({ heading: ($event.target as HTMLInputElement).value })"
		/>
		<textarea
			:value="modelValue?.body_markdown || ''"
			placeholder="Block content (markdown supported)"
			rows="6"
			class="w-full bg-transparent border-0 focus:ring-0 outline-none resize-y text-sm leading-relaxed"
			@input="patch({ body_markdown: ($event.target as HTMLTextAreaElement).value })"
		/>
	</div>
</template>
