<script setup lang="ts">
/*
  MoneyPipeline — the unifying "value → paid → to-hunt" visual. One segmented
  bar splits a contract's value into four states so a project, a client, or the
  whole org all read the same way:

    Paid              collected, in the bank            (success / green)
    Outstanding       invoiced, awaiting payment        (warning / amber)
    Overdue           invoiced, past due — THE HUNT      (destructive / red)
    Not yet billed    contract value not yet invoiced   (hollow / neutral)

  Presentational only: the parent supplies already-computed dollar figures.
  `contractValue` may be null (e.g. hourly retainers with no fixed value); the
  bar then scales to the invoiced total and drops the "not yet billed" tail.
*/
const props = defineProps<{
	/** Fixed contract value. Null → scale to invoiced, hide not-yet-billed. */
	contractValue: number | null;
	/** Collected (payments received, refunds netted). */
	paid: number;
	/** Invoiced, not yet paid, not yet past due. */
	currentOutstanding: number;
	/** Invoiced, unpaid, past the due date — the money to hunt down. */
	overdue: number;
	/** Compact = tighter paddings for slide-overs / dense placements. */
	compact?: boolean;
}>();

// Whole-dollar formatting — cents are noise at the pipeline altitude.
const fmt = (n: number) => formatCurrency(n || 0, { hideZeros: true });

const invoiced = computed(() => props.paid + props.currentOutstanding + props.overdue);
const notYetBilled = computed(() =>
	props.contractValue != null ? Math.max(0, props.contractValue - invoiced.value) : 0,
);
const overBilled = computed(() =>
	props.contractValue != null && invoiced.value > props.contractValue,
);
// The bar spans whichever is larger — contract or invoiced — so over-billing
// (invoiced beyond contract) still renders as a full, honest bar.
const base = computed(() => Math.max(props.contractValue ?? 0, invoiced.value) || 1);

const toHunt = computed(() => props.currentOutstanding + props.overdue);
const collectionRate = computed(() =>
	invoiced.value > 0 ? Math.round((props.paid / invoiced.value) * 100) : 0,
);

interface Seg { key: string; label: string; amount: number; cls: string; hollow?: boolean }
const segments = computed<Seg[]>(() => {
	const segs: Seg[] = [
		{ key: 'paid', label: 'Paid', amount: props.paid, cls: 'bg-success' },
		{ key: 'overdue', label: 'Overdue', amount: props.overdue, cls: 'bg-destructive' },
		{ key: 'current', label: 'Outstanding', amount: props.currentOutstanding, cls: 'bg-warning' },
	];
	if (props.contractValue != null) {
		segs.push({ key: 'unbilled', label: 'Not yet billed', amount: notYetBilled.value, cls: 'bg-foreground/10', hollow: true });
	}
	return segs;
});
const pct = (n: number) => `${Math.max(0, (n / base.value) * 100)}%`;

// Collection gauge (SVG ring). Circumference-based fill, success-tinted.
const RADIUS = 34;
const CIRC = 2 * Math.PI * RADIUS;
const gaugeOffset = computed(() => CIRC * (1 - collectionRate.value / 100));
</script>

<template>
	<div class="ios-card glass-edge rounded-2xl" :class="compact ? 'p-4' : 'p-5'">
		<div class="flex items-start justify-between gap-4 mb-4">
			<div>
				<h3 class="text-sm font-semibold text-foreground/80">Money pipeline</h3>
				<p class="text-[11px] text-muted-foreground mt-0.5">
					<template v-if="contractValue != null">
						{{ fmt(contractValue) }} contract value
						<span v-if="overBilled" class="text-destructive font-medium"> · over-billed</span>
					</template>
					<template v-else>Scaled to {{ fmt(invoiced) }} invoiced</template>
				</p>
			</div>
			<!-- The one number that motivates: money still to hunt down. -->
			<div class="text-right shrink-0">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground">To hunt down</p>
				<p class="text-xl font-bold tabular-nums leading-none mt-0.5"
					:class="overdue > 0 ? 'text-destructive' : toHunt > 0 ? 'text-warning' : 'text-success'">
					{{ fmt(toHunt) }}
				</p>
			</div>
		</div>

		<div class="flex items-center gap-5">
			<!-- Segmented pipeline bar -->
			<div class="flex-1 min-w-0">
				<div class="flex h-3.5 w-full overflow-hidden rounded-full bg-muted/40">
					<div
						v-for="s in segments"
						:key="s.key"
						class="h-full transition-[width] duration-500 ease-out first:rounded-l-full last:rounded-r-full"
						:class="[s.cls, s.amount > 0 ? 'min-w-[3px]' : '']"
						:style="{ width: pct(s.amount) }"
						:title="`${s.label}: ${fmt(s.amount)}`"
					/>
				</div>

				<!-- Legend -->
				<div class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
					<div v-for="s in segments" :key="`lg-${s.key}`" class="flex items-center gap-2 min-w-0">
						<span
							class="w-2.5 h-2.5 rounded-sm shrink-0"
							:class="s.hollow ? 'border border-dashed border-foreground/30' : s.cls"
						/>
						<span class="text-[11px] text-muted-foreground truncate">{{ s.label }}</span>
						<span class="text-[11px] font-semibold tabular-nums ml-auto">{{ fmt(s.amount) }}</span>
					</div>
				</div>
			</div>

			<!-- Collection gauge -->
			<div class="shrink-0 flex flex-col items-center" :class="compact ? 'hidden sm:flex' : ''">
				<!-- Relative box is exactly the SVG's 84×84 bounds, so the overlaid
				     percentage centers on the ring itself — not on the taller column
				     that also holds the "Collected" caption below. -->
				<div class="relative h-[84px] w-[84px]">
					<svg width="84" height="84" viewBox="0 0 84 84" class="-rotate-90">
						<circle cx="42" cy="42" :r="RADIUS" fill="none" stroke="hsl(var(--muted))" stroke-width="7" />
						<circle
							cx="42" cy="42" :r="RADIUS" fill="none"
							stroke="hsl(var(--success))" stroke-width="7" stroke-linecap="round"
							:stroke-dasharray="CIRC" :stroke-dashoffset="gaugeOffset"
							class="transition-[stroke-dashoffset] duration-700 ease-out"
						/>
					</svg>
					<div class="absolute inset-0 flex items-center justify-center">
						<span class="text-lg font-bold leading-none tabular-nums">{{ collectionRate }}%</span>
					</div>
				</div>
				<span class="text-[9px] uppercase tracking-wider text-muted-foreground mt-1">Collected</span>
			</div>
		</div>
	</div>
</template>
