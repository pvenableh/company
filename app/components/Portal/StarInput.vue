<script setup lang="ts">
/**
 * PortalStarInput — a 1–5 star rating input (auto-imports as <PortalStarInput>).
 * Mirrors the star affordance used by the ticket/project CSAT so the portal's
 * rating surfaces read as one system.
 */
const model = defineModel<number>({ default: 0 });
const hover = ref(0);

const labels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];
const shown = computed(() => hover.value || model.value);
</script>

<template>
	<div class="flex items-center gap-2">
		<div class="flex items-center gap-1" @mouseleave="hover = 0">
			<button
				v-for="n in 5"
				:key="n"
				type="button"
				class="p-0.5 transition-transform hover:scale-110"
				:aria-label="`${n} star${n > 1 ? 's' : ''}`"
				@mouseenter="hover = n"
				@click="model = n"
			>
				<Icon
					name="lucide:star"
					class="w-6 h-6 transition-colors"
					:class="n <= shown ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'"
				/>
			</button>
		</div>
		<span v-if="shown" class="text-xs text-muted-foreground">{{ labels[shown] }}</span>
	</div>
</template>
