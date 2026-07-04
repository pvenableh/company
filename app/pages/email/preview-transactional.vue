<template>
	<div class="tx-preview">
		<header class="tx-preview__head">
			<div>
				<h1 class="tx-preview__title">Transactional email preview</h1>
				<p class="tx-preview__subtitle">Live-rendered from the MJML templates in <code>server/emails/</code>. Edit a <code>.mjml</code> file and refresh.</p>
			</div>
			<div class="tx-preview__brand">
				<button
					type="button"
					class="tx-preview__toggle"
					:class="{ 'tx-preview__toggle--active': brand === 'earnest' }"
					@click="brand = 'earnest'"
				>Earnest</button>
				<button
					type="button"
					class="tx-preview__toggle"
					:class="{ 'tx-preview__toggle--active': brand === 'org' }"
					@click="brand = 'org'"
				>Org-branded</button>
			</div>
		</header>

		<div class="tx-preview__body">
			<nav class="tx-preview__nav">
				<button
					v-for="t in templates"
					:key="t"
					type="button"
					class="tx-preview__nav-item"
					:class="{ 'tx-preview__nav-item--active': template === t }"
					@click="template = t"
				>{{ t }}</button>
			</nav>

			<div class="tx-preview__stage">
				<div class="tx-preview__frame-bar">
					<span class="tx-preview__frame-name">{{ template }} · {{ brand }}</span>
					<a :href="src" target="_blank" rel="noopener" class="tx-preview__open">Open raw ↗</a>
				</div>
				<iframe :key="src" :src="src" class="tx-preview__frame" title="Email preview" />
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Email preview | Earnest' });

const templates = [
	'welcome',
	'invite',
	'notification',
	'password-reset',
	'video-invite',
	'generic',
	'meeting-invited',
	'meeting-time-changed',
	'meeting-removed',
	'meeting-cancelled',
	'meeting-reminder',
] as const;

const template = ref<(typeof templates)[number]>('welcome');
const brand = ref<'earnest' | 'org'>('earnest');

const src = computed(() => `/api/email/preview-mjml?template=${template.value}&brand=${brand.value}`);
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.tx-preview { @apply flex flex-col gap-5 p-4 md:p-6 max-w-6xl mx-auto w-full; }

.tx-preview__head { @apply flex flex-wrap items-start justify-between gap-4; }
.tx-preview__title { @apply text-xl font-semibold tracking-tight; }
.tx-preview__subtitle { @apply text-sm text-muted-foreground mt-1; }
.tx-preview__subtitle code { @apply text-xs bg-muted px-1 py-0.5 rounded; }

.tx-preview__brand { @apply inline-flex items-center gap-1 rounded-full bg-muted p-1; }
.tx-preview__toggle { @apply px-3 py-1.5 text-xs font-medium rounded-full text-muted-foreground transition-colors; }
.tx-preview__toggle--active { @apply bg-background text-foreground shadow-sm; }

.tx-preview__body { @apply flex flex-col md:flex-row gap-4; }

.tx-preview__nav { @apply flex md:flex-col gap-1 flex-wrap md:w-52 shrink-0; }
.tx-preview__nav-item {
	@apply text-left text-sm px-3 py-2 rounded-lg text-muted-foreground transition-colors hover:bg-muted/60;
}
.tx-preview__nav-item--active { @apply bg-primary/10 text-primary font-medium; }

.tx-preview__stage { @apply flex-1 min-w-0 rounded-xl border border-border overflow-hidden bg-[#faf7f4]; }
.tx-preview__frame-bar { @apply flex items-center justify-between px-3 py-2 bg-card border-b border-border; }
.tx-preview__frame-name { @apply text-xs font-mono text-muted-foreground; }
.tx-preview__open { @apply text-xs text-primary hover:underline; }
.tx-preview__frame { @apply w-full h-[70vh] border-0 bg-[#faf7f4]; }
</style>
