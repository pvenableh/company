<script setup lang="ts">
/**
 * pull_quote renderer — oversized accent quotation. The quote itself takes
 * the document accent (like Hue's "know thyself.") with a muted attribution
 * underneath.
 */
import { marked } from 'marked';
import type { PullQuotePayload } from '~~/shared/blocks/types';

const props = defineProps<{
	payload: PullQuotePayload;
}>();

marked.setOptions({ gfm: true, breaks: true });

const quoteHtml = computed(() =>
	props.payload?.quote_markdown ? (marked.parseInline(props.payload.quote_markdown) as string) : '',
);
const align = computed(() => props.payload?.align || 'left');
</script>

<template>
	<figure class="pull-quote" :class="`pull-quote--${align}`">
		<blockquote class="pull-quote__text" v-html="`&ldquo;${quoteHtml}&rdquo;`" />
		<figcaption v-if="payload?.attribution" class="pull-quote__attr">
			— {{ payload.attribution }}
		</figcaption>
	</figure>
</template>

<style scoped>
.pull-quote {
	margin: 1.5rem 0;
}
.pull-quote--center { text-align: center; }
.pull-quote--right { text-align: right; }

.pull-quote__text {
	font-size: clamp(1.75rem, 4vw, 2.75rem);
	font-weight: 700;
	line-height: 1.1;
	letter-spacing: -0.015em;
	color: var(--doc-accent, hsl(var(--primary)));
	margin: 0;
	border: 0;
	padding: 0;
}
.pull-quote__attr {
	margin-top: 0.75rem;
	font-size: 1rem;
	font-weight: 500;
	color: var(--doc-accent, hsl(var(--primary)));
	opacity: 0.8;
}
</style>
