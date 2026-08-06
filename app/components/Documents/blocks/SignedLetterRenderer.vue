<script setup lang="ts">
/**
 * signed_letter renderer — greeting, markdown body, then a sign-off with an
 * optional signature image and the signer's name (accent) + title. Matches
 * the Hue HUE-605 "introduction." page: "Sincerely," / signature / name.
 */
import { marked } from 'marked';
import type { SignedLetterPayload } from '~~/shared/blocks/types';

const props = defineProps<{
	payload: SignedLetterPayload;
}>();

marked.setOptions({ gfm: true, breaks: true });

const bodyHtml = computed(() => marked.parse(props.payload?.body_markdown || '') as string);
</script>

<template>
	<div class="signed-letter">
		<p v-if="payload?.greeting" class="signed-letter__greeting">{{ payload.greeting }}</p>
		<div class="signed-letter__body prose prose-sm max-w-none" v-html="bodyHtml" />

		<div class="signed-letter__signoff">
			<p v-if="payload?.signoff" class="signed-letter__signoff-line">{{ payload.signoff }}</p>
			<img
				v-if="payload?.signature_image_url"
				:src="payload.signature_image_url"
				alt="Signature"
				class="signed-letter__signature"
			/>
			<p v-if="payload?.signer_name" class="signed-letter__signer">{{ payload.signer_name }}</p>
			<p v-if="payload?.signer_title" class="signed-letter__signer-title">{{ payload.signer_title }}</p>
			<p v-if="payload?.date" class="signed-letter__date">{{ payload.date }}</p>
		</div>
	</div>
</template>

<style scoped>
.signed-letter__greeting {
	margin-bottom: 1rem;
	font-size: 0.95rem;
}
.signed-letter__body {
	line-height: 1.7;
}
.signed-letter__signoff {
	margin-top: 2rem;
}
.signed-letter__signoff-line {
	margin-bottom: 0.5rem;
	font-size: 0.95rem;
}
.signed-letter__signature {
	height: 3rem;
	width: auto;
	object-fit: contain;
	margin: 0.25rem 0;
}
.signed-letter__signer {
	font-weight: 700;
	color: var(--doc-accent, hsl(var(--primary)));
	margin: 0;
}
.signed-letter__signer-title {
	font-size: 0.85rem;
	opacity: 0.7;
	margin: 0;
}
.signed-letter__date {
	font-size: 0.8rem;
	opacity: 0.6;
	margin-top: 0.35rem;
}
</style>
