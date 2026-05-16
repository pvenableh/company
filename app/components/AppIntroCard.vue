<script setup lang="ts">
/**
 * AppIntroCard — opt-in "what is this app for" card for /apps/*.
 *
 * Hidden by default. The `info` icon in AppHeader opens it for the
 * current session; the close X on the card collapses it again. Session-
 * only state — see useAppIntros for the registry of tagline + intro copy.
 *
 * Visual: ios-card with an accent-tinted left border. Sized so it doesn't
 * dominate the page — single column, bullets optional, accent close X.
 */
import type { AppIntroId } from '~/composables/useAppIntros';

const props = defineProps<{ appId: AppIntroId }>();

const { isOpen, close, getContent } = useAppIntros();

const content = computed(() => getContent(props.appId));
const visible = computed(() => isOpen(props.appId));
</script>

<template>
	<section v-if="visible" class="app-intro-card ios-card" :aria-labelledby="`app-intro-${appId}-title`">
		<button
			type="button"
			class="app-intro-card__close"
			aria-label="Close intro"
			@click="close(appId)"
		>
			<Icon name="lucide:x" class="w-3.5 h-3.5" />
		</button>
		<div class="app-intro-card__inner">
			<h2 :id="`app-intro-${appId}-title`" class="app-intro-card__title">
				{{ content.intro.title }}
			</h2>
			<p class="app-intro-card__body">{{ content.intro.body }}</p>
			<ul v-if="content.intro.bullets?.length" class="app-intro-card__bullets">
				<li v-for="b in content.intro.bullets" :key="b">
					<Icon name="lucide:check" class="app-intro-card__bullet-icon" />
					<span>{{ b }}</span>
				</li>
			</ul>
		</div>
	</section>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.app-intro-card {
	@apply relative mb-5 px-3 py-3 sm:px-5 sm:py-4;
	border-left: 3px solid hsl(var(--app-accent-h, 220) var(--app-accent-s, 10%) var(--app-accent-l, 48%) / 0.6);
	background: linear-gradient(
		to right,
		hsl(var(--app-accent-h, 220) var(--app-accent-s, 10%) var(--app-accent-l, 48%) / 0.05),
		transparent 40%
	), var(--ios-card-bg, hsl(var(--background)));
}

.app-intro-card__close {
	@apply absolute top-2.5 right-2.5 inline-flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors;
}

.app-intro-card__inner {
	@apply pr-7;
}

.app-intro-card__title {
	@apply text-sm font-semibold text-foreground;
}

.app-intro-card__body {
	@apply mt-1 text-sm text-muted-foreground leading-relaxed;
}

.app-intro-card__bullets {
	@apply mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3;
}

.app-intro-card__bullets li {
	@apply flex items-start gap-1.5 text-xs text-muted-foreground;
}

.app-intro-card__bullet-icon {
	@apply w-3.5 h-3.5 mt-0.5 shrink-0;
	color: hsl(var(--app-accent-h, 220) var(--app-accent-s, 10%) var(--app-accent-l, 48%));
}

</style>
