<script setup lang="ts">
/*
  AppsAtAGlance — a compact "read-first" band for detail Overviews and
  dashboards. It leads with an optional attention line (what needs the user
  right now) followed by a calm row of at-a-glance metrics, so a view answers
  "what should I notice / do here?" before dropping the user into raw fields.

  Presentational only: the parent supplies already-computed values. Use the
  `#lead` slot for a custom first cell (e.g. a rating badge).
*/
interface Metric {
	label: string;
	value: string | number;
	tone?: 'default' | 'good' | 'warn' | 'danger';
}
interface Attention {
	label: string;
	tone?: 'warn' | 'danger';
}

defineProps<{
	metrics: Metric[];
	attention?: Attention[];
}>();

const toneClass: Record<string, string> = {
	default: 'text-foreground',
	good: 'text-success',
	warn: 'text-warning',
	danger: 'text-destructive',
};
</script>

<template>
	<div class="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 mb-5">
		<!-- What needs attention (only rendered when there's something) -->
		<div v-if="attention && attention.length" class="flex flex-wrap items-center gap-1.5 mb-3">
			<span
				v-for="(a, i) in attention"
				:key="`att-${i}`"
				class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
				:class="a.tone === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'"
			>
				<Icon name="lucide:alert-circle" class="w-3 h-3" />
				{{ a.label }}
			</span>
		</div>

		<!-- At-a-glance metrics -->
		<div class="flex flex-wrap items-start gap-x-8 gap-y-3">
			<slot name="lead" />
			<div v-for="(m, i) in metrics" :key="`m-${i}`" class="min-w-0">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{{ m.label }}</p>
				<div class="text-lg font-semibold leading-none tabular-nums" :class="toneClass[m.tone || 'default']">
					{{ m.value }}
				</div>
			</div>
		</div>
	</div>
</template>
