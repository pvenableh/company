<script setup lang="ts">
/**
 * GettingStartedChecklist — the dashboard activation card for new org admins.
 *
 * Bridges "org created" → "first real work." Steps and their done-state come
 * from useOnboardingProgress (live, org-scoped record counts), so the card is
 * adaptive by construction:
 *   • Founder on an empty org → every step open; reads as an activation path.
 *   • Invited admin on a populated org → steps already checked; reads as a
 *     quick orientation, then they dismiss it.
 *
 * Each CTA deep-links to the relevant app with a query param that auto-opens
 * the existing create modal (`?new=1` on clients/projects/invoices, `?invite=1`
 * on the org members floor) — we reuse those flows rather than rebuild them.
 */
const {
	steps,
	completedCount,
	totalCount,
	allComplete,
	nextStep,
	orgName,
	firstName,
	shouldShow,
	dismiss,
} = useOnboardingProgress();

const progressPct = computed(() =>
	totalCount.value === 0 ? 0 : Math.round((completedCount.value / totalCount.value) * 100),
);

const heading = computed(() => {
	if (allComplete.value) return `You’re all set up${firstName.value ? `, ${firstName.value}` : ''} 🎉`;
	return `Finish setting up ${orgName.value}`;
});

const subheading = computed(() => {
	if (allComplete.value) return 'The essentials are in place. Explore the apps whenever you’re ready.';
	if (nextStep.value) return `Next: ${nextStep.value.title.toLowerCase()}. A few steps and your workspace is live.`;
	return 'A few steps and your workspace is live.';
});
</script>

<template>
	<div v-if="shouldShow" class="ios-card p-5 sm:p-6 relative overflow-hidden">
		<!-- Accent wash so the card reads as a first-run surface, not another widget. -->
		<div class="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/8 to-transparent" aria-hidden="true" />

		<!-- Dismiss -->
		<button
			type="button"
			class="absolute top-3 right-3 z-10 flex items-center justify-center size-7 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 transition-colors"
			aria-label="Dismiss getting started"
			@click="dismiss"
		>
			<EIcon name="lucide:x" class="w-4 h-4" />
		</button>

		<div class="relative">
			<!-- Header -->
			<div class="flex items-start gap-3 pr-8">
				<div class="flex items-center justify-center size-9 rounded-xl bg-primary/12 text-primary shrink-0">
					<EIcon name="lucide:rocket" class="w-5 h-5" />
				</div>
				<div class="min-w-0">
					<h3 class="text-base font-semibold text-foreground leading-tight">{{ heading }}</h3>
					<p class="text-[13px] text-muted-foreground mt-0.5">{{ subheading }}</p>
				</div>
			</div>

			<!-- Progress -->
			<div class="mt-4 flex items-center gap-3">
				<div class="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
					<div
						class="h-full rounded-full bg-primary transition-all duration-500"
						:style="{ width: `${Math.max(progressPct, 3)}%` }"
					/>
				</div>
				<span class="text-[11px] font-semibold text-muted-foreground tabular-nums shrink-0">
					{{ completedCount }}/{{ totalCount }}
				</span>
			</div>

			<!-- Steps -->
			<ul class="mt-4 space-y-1.5">
				<li
					v-for="step in steps"
					:key="step.id"
					class="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors"
					:class="step.done ? 'opacity-70' : 'hover:bg-muted/40'"
				>
					<!-- Status marker -->
					<div
						class="flex items-center justify-center size-8 rounded-lg shrink-0"
						:class="step.done ? 'bg-success/12 text-success' : 'bg-muted/60 text-muted-foreground'"
					>
						<EIcon :name="step.done ? 'lucide:check' : step.icon" class="w-4 h-4" />
					</div>

					<!-- Copy -->
					<div class="flex-1 min-w-0">
						<p
							class="text-sm font-medium truncate"
							:class="step.done ? 'text-muted-foreground line-through decoration-1' : 'text-foreground'"
						>
							{{ step.title }}
						</p>
						<p v-if="!step.done" class="text-xs text-muted-foreground mt-0.5 line-clamp-1">{{ step.description }}</p>
					</div>

					<!-- CTA / done -->
					<span v-if="step.done" class="text-[11px] font-medium text-success shrink-0">Done</span>
					<NuxtLink
						v-else
						:to="step.to"
						class="inline-flex items-center gap-1 h-8 px-3 rounded-full text-[12px] font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity shrink-0 ios-press"
					>
						{{ step.cta }}
						<EIcon name="lucide:arrow-right" class="w-3.5 h-3.5" />
					</NuxtLink>
				</li>
			</ul>

			<!-- All-done footer -->
			<div v-if="allComplete" class="mt-4 flex justify-end">
				<button
					type="button"
					class="text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
					@click="dismiss"
				>
					Dismiss
				</button>
			</div>
		</div>
	</div>
</template>
