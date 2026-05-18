<script setup lang="ts">
/**
 * rich_text — renders heading + marked-parsed markdown body. Matches the
 * exact DOM output the universal BlockRenderer used before the typed
 * refactor (`<h2 class="doc__block-heading">` + `.prose` div).
 */
import { marked } from 'marked';
import type { RichTextPayload } from '~~/shared/blocks/types';

const props = defineProps<{
	payload: RichTextPayload;
}>();

marked.setOptions({ gfm: true, breaks: true });

const html = computed(() => marked.parse(props.payload?.body_markdown || '') as string);
</script>

<template>
	<div>
		<h2 v-if="payload?.heading" class="doc__block-heading">{{ payload.heading }}</h2>
		<div class="prose prose-sm dark:prose-invert max-w-none" v-html="html" />
	</div>
</template>
