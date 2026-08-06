<script setup lang="ts">
/**
 * signature_block renderer — ruled signature lines with the signer's name,
 * title/company beneath, plus an optional dated line. Laid out in 1 or 2
 * columns. The signature rule and date rule are empty for wet/e-signing.
 */
import type { SignatureBlockPayload, Signatory } from '~~/shared/blocks/types';

const props = defineProps<{
	payload: SignatureBlockPayload;
}>();

const signatories = computed<Signatory[]>(() =>
	Array.isArray(props.payload?.signatories) ? props.payload.signatories : [],
);
const columns = computed(() => props.payload?.columns || 2);
</script>

<template>
	<div class="sig-block">
		<p v-if="payload?.intro" class="sig-block__intro">{{ payload.intro }}</p>
		<div class="sig-block__grid" :style="{ '--cols': columns }">
			<div v-for="sig in signatories" :key="sig.id" class="sig-block__entry">
				<p v-if="sig.role_label" class="sig-block__role">{{ sig.role_label }}</p>
				<div class="sig-block__line" />
				<p class="sig-block__name">
					<span v-if="sig.name">{{ sig.name }}</span>
					<span v-else class="sig-block__placeholder">Signature</span>
				</p>
				<p v-if="sig.title || sig.company" class="sig-block__meta">
					<span v-if="sig.title">{{ sig.title }}</span>
					<span v-if="sig.title && sig.company">, </span>
					<span v-if="sig.company">{{ sig.company }}</span>
				</p>
				<div v-if="sig.show_date !== false" class="sig-block__date">
					<div class="sig-block__line sig-block__line--date" />
					<p class="sig-block__meta">{{ sig.date_label || 'Date' }}</p>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.sig-block__intro {
	margin-bottom: 1.5rem;
	font-size: 0.9rem;
	line-height: 1.6;
}
.sig-block__grid {
	display: grid;
	grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr));
	gap: 2.5rem 3rem;
}
.sig-block__entry {
	break-inside: avoid;
}
.sig-block__role {
	text-transform: uppercase;
	letter-spacing: 0.08em;
	font-size: 0.7rem;
	font-weight: 700;
	color: var(--doc-accent, hsl(var(--primary)));
	margin-bottom: 2rem;
}
.sig-block__line {
	border-bottom: 1px solid rgba(0, 0, 0, 0.45);
	height: 0;
	margin-bottom: 0.35rem;
}
.sig-block__line--date {
	margin-top: 1.5rem;
	max-width: 12rem;
}
.sig-block__name {
	font-weight: 600;
	font-size: 0.95rem;
	margin: 0;
}
.sig-block__placeholder {
	opacity: 0.35;
	font-weight: 400;
	font-style: italic;
}
.sig-block__meta {
	font-size: 0.8rem;
	opacity: 0.65;
	margin: 0.1rem 0 0;
}

:global(.dark .sig-block__line) { border-bottom-color: rgba(255, 255, 255, 0.5); }
</style>
