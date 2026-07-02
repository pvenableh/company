<script setup lang="ts">
/**
 * CsatBadge — read-only client-satisfaction display for staff surfaces.
 * Renders the 1–5 stars the client left on a delivered ticket / project,
 * plus their optional note. Renders nothing when there's no rating yet.
 */
const props = defineProps<{
	rating?: number | null;
	comment?: string | null;
	submittedAt?: string | null;
}>();

const when = computed(() => {
	if (!props.submittedAt) return '';
	const d = new Date(props.submittedAt);
	return Number.isNaN(d.getTime())
		? ''
		: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
});
</script>

<template>
	<div v-if="rating" class="csat-badge">
		<div class="csat-badge__row">
			<span class="csat-badge__label">Client rating</span>
			<span class="csat-badge__stars" aria-hidden="true">
				<UIcon
					v-for="n in 5"
					:key="n"
					:name="n <= (rating || 0) ? 'i-heroicons-star-solid' : 'i-heroicons-star'"
					class="w-3.5 h-3.5"
					:class="n <= (rating || 0) ? 'text-amber-500' : 'text-muted-foreground/30'"
				/>
			</span>
			<span class="csat-badge__value tabular-nums">{{ rating }}/5</span>
			<span v-if="when" class="csat-badge__when">· {{ when }}</span>
		</div>
		<p v-if="comment" class="csat-badge__comment">“{{ comment }}”</p>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.csat-badge {
	@apply rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2;
}
.csat-badge__row {
	@apply flex items-center gap-2 flex-wrap;
}
.csat-badge__label {
	@apply text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-400;
}
.csat-badge__stars {
	@apply inline-flex items-center gap-0.5;
}
.csat-badge__value {
	@apply text-xs font-semibold text-foreground;
}
.csat-badge__when {
	@apply text-[11px] text-muted-foreground;
}
.csat-badge__comment {
	@apply text-xs text-muted-foreground italic mt-1;
}
</style>
