<script setup lang="ts">
/**
 * AIAwarenessChip — the collapsible "What Earnest can see" primer, modeled on
 * CardDesk's awareness chip. Collapsed to a small pill by default; expands to
 * the route/user/org/entity knowledge list with a toggle per item so the user
 * can deselect context before sending. Deselected items are excluded from the
 * prompt (the parent reads `item.included`).
 */
import type { AwareItem } from '~/composables/useEarnestAwareness';

defineProps<{
	items: AwareItem[];
}>();

const emit = defineEmits<{ (e: 'toggle', key: string): void }>();

const open = ref(false);
</script>

<template>
	<div v-if="items.length" class="aware" :class="{ open }">
		<button type="button" class="aware-hd" :aria-expanded="open" @click="open = !open">
			<EarnestIcon class="w-3 h-3 text-primary shrink-0" />
			<span class="aware-hd-label">What Earnest can see</span>
			<span class="aware-count">{{ items.filter((i) => i.included).length }}/{{ items.length }}</span>
			<Icon name="lucide:chevron-down" class="aware-chev w-3 h-3 shrink-0" />
		</button>

		<div v-if="open" class="aware-body">
			<button
				v-for="item in items"
				:key="item.key"
				type="button"
				class="aware-item"
				:class="{ 'is-off': !item.included }"
				:aria-pressed="item.included"
				@click="emit('toggle', item.key)"
			>
				<Icon :name="item.icon" class="w-3.5 h-3.5 shrink-0" :class="item.included ? 'text-primary' : 'text-muted-foreground/50'" />
				<span class="aware-item-label">{{ item.label }}</span>
				<span class="aware-toggle" :class="{ on: item.included }">
					<Icon :name="item.included ? 'lucide:check' : 'lucide:plus'" class="w-3 h-3" />
				</span>
			</button>
			<p class="aware-note">
				<Icon name="lucide:lock" class="w-2.5 h-2.5" />
				Grounded only in your own Earnest data. Tap an item to exclude it.
			</p>
		</div>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.aware {
	@apply rounded-xl border border-border/60 bg-muted/30 overflow-hidden;
	transition: background-color 0.2s ease;
}
.aware.open {
	@apply bg-muted/40;
}
.aware-hd {
	@apply w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-foreground/80;
}
.aware-hd-label {
	@apply flex-1 text-left truncate;
}
.aware-count {
	@apply text-[9px] tabular-nums text-muted-foreground bg-background/60 rounded-full px-1.5 py-0.5;
}
.aware-chev {
	@apply text-muted-foreground;
	transition: transform 0.2s cubic-bezier(0.36, 0.66, 0.04, 1);
}
.aware.open .aware-chev {
	transform: rotate(180deg);
}
.aware-body {
	@apply px-1.5 pb-1.5 space-y-1;
}
.aware-item {
	@apply w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-background/60;
}
.aware-item.is-off {
	@apply opacity-55;
}
.aware-item-label {
	@apply flex-1 text-[11px] leading-snug text-foreground/90 min-w-0;
}
.aware-item.is-off .aware-item-label {
	@apply line-through text-muted-foreground;
}
.aware-toggle {
	@apply flex items-center justify-center w-4 h-4 rounded-full shrink-0 border border-border text-muted-foreground/60;
	transition: all 0.15s ease;
}
.aware-toggle.on {
	@apply bg-primary border-primary text-primary-foreground;
}
.aware-note {
	@apply flex items-center gap-1 px-2 pt-1 text-[9px] text-muted-foreground/70;
}
</style>
