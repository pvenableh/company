<script setup lang="ts">
/**
 * figure renderer — an image with an optional caption. Width controls how
 * much of the content column it fills; align positions it within that column.
 */
import type { FigurePayload } from '~~/shared/blocks/types';

const props = defineProps<{
	payload: FigurePayload;
}>();

const width = computed(() => props.payload?.width || 'full');
const align = computed(() => props.payload?.align || 'center');
</script>

<template>
	<figure v-if="payload?.image_url" class="figure" :class="[`figure--${width}`, `figure--${align}`]">
		<img :src="payload.image_url" :alt="payload?.alt || ''" class="figure__img" />
		<figcaption v-if="payload?.caption" class="figure__caption">{{ payload.caption }}</figcaption>
	</figure>
</template>

<style scoped>
.figure {
	margin: 1rem 0;
}
.figure--full { width: 100%; }
.figure--wide { width: 100%; }
.figure--inline { width: 60%; max-width: 24rem; }

.figure--center { margin-left: auto; margin-right: auto; text-align: center; }
.figure--left { margin-right: auto; text-align: left; }
.figure--right { margin-left: auto; text-align: right; }

.figure__img {
	width: 100%;
	height: auto;
	border-radius: 0.5rem;
	display: block;
}
.figure--center .figure__img { margin-left: auto; margin-right: auto; }
.figure--right .figure__img { margin-left: auto; }

.figure__caption {
	margin-top: 0.5rem;
	font-size: 0.8rem;
	opacity: 0.6;
	font-style: italic;
}
</style>
