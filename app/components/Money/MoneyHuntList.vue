<script setup lang="ts">
/*
  MoneyHuntList — the motivational centerpiece: outstanding + overdue invoices
  ranked by a priority score (dollars × age) so it literally answers "who do I
  chase first." Overdue rows float to the top; each row shows the outstanding
  amount and how stale it is. Clicking a row emits `open` so the parent can
  jump to the invoice.

  Presentational: the parent supplies rows with a pre-computed `outstanding`
  figure (total_amount minus payments received) and the invoice's due_date.
*/
interface HuntRow {
	id: string;
	code: string;
	/** Who to chase (client / bill-to name). */
	who: string;
	/** total_amount − payments received, always > 0 for rows shown here. */
	outstanding: number;
	dueDate: string | null;
}

const props = defineProps<{
	rows: HuntRow[];
	loading?: boolean;
}>();

const emit = defineEmits<{ (e: 'open', id: string): void }>();

const fmt = (n: number) => formatCurrency(n || 0, { hideZeros: true });

const MS_DAY = 86_400_000;
function daysOverdue(due: string | null): number {
	if (!due) return 0;
	const d = new Date(due); d.setHours(0, 0, 0, 0);
	const today = new Date(); today.setHours(0, 0, 0, 0);
	return Math.round((today.getTime() - d.getTime()) / MS_DAY);
}

// Priority = dollars weighted by age. A day overdue counts more than a day
// merely outstanding, so the biggest + stalest money surfaces first.
const ranked = computed(() =>
	[...props.rows]
		.map((r) => {
			const od = daysOverdue(r.dueDate);
			const ageWeight = od > 0 ? 1 + od / 30 : 0.5 + Math.max(0, 30 + od) / 60;
			return { ...r, od, score: r.outstanding * ageWeight };
		})
		.sort((a, b) => b.score - a.score),
);

const totalToHunt = computed(() => props.rows.reduce((s, r) => s + r.outstanding, 0));
const overdueCount = computed(() => ranked.value.filter((r) => r.od > 0).length);

function ageLabel(od: number, due: string | null): { text: string; tone: string } {
	if (!due) return { text: 'no due date', tone: 'text-muted-foreground' };
	if (od > 0) return { text: `${od}d overdue`, tone: 'text-destructive' };
	if (od === 0) return { text: 'due today', tone: 'text-warning' };
	return { text: `due in ${Math.abs(od)}d`, tone: 'text-muted-foreground' };
}
</script>

<template>
	<div class="ios-card glass-edge rounded-2xl p-5">
		<div class="flex items-center justify-between gap-3 mb-3">
			<div class="flex items-center gap-2">
				<Icon name="lucide:crosshair" class="w-4 h-4 text-warning" />
				<h3 class="text-sm font-semibold text-foreground/80">The hunt</h3>
			</div>
			<p v-if="rows.length" class="text-[11px] text-muted-foreground tabular-nums">
				<span class="font-semibold text-foreground">{{ fmt(totalToHunt) }}</span>
				across {{ rows.length }}
				<span v-if="overdueCount"> · <span class="text-destructive font-medium">{{ overdueCount }} overdue</span></span>
			</p>
		</div>

		<div v-if="loading" class="py-6 text-center text-[12px] text-muted-foreground">Loading…</div>

		<div v-else-if="!rows.length" class="py-6 text-center">
			<Icon name="lucide:party-popper" class="w-6 h-6 text-success mx-auto mb-1.5" />
			<p class="text-[12px] text-muted-foreground">Nothing to hunt — every invoice is paid.</p>
		</div>

		<ul v-else class="divide-y divide-border/50 -mx-1">
			<li v-for="r in ranked" :key="r.id">
				<button
					type="button"
					class="w-full flex items-center gap-3 px-1 py-2.5 text-left rounded-lg hover:bg-muted/40 transition-colors"
					@click="emit('open', r.id)"
				>
					<span
						class="w-1.5 h-8 rounded-full shrink-0"
						:class="r.od > 0 ? 'bg-destructive' : 'bg-warning'"
					/>
					<div class="min-w-0 flex-1">
						<p class="text-[13px] font-medium text-foreground truncate">{{ r.who }}</p>
						<p class="text-[11px] text-muted-foreground truncate">
							<template v-if="r.code">{{ r.code }} · </template><span :class="ageLabel(r.od, r.dueDate).tone">{{ ageLabel(r.od, r.dueDate).text }}</span>
						</p>
					</div>
					<span class="text-[14px] font-bold tabular-nums shrink-0"
						:class="r.od > 0 ? 'text-destructive' : 'text-foreground'">
						{{ fmt(r.outstanding) }}
					</span>
					<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground shrink-0" />
				</button>
			</li>
		</ul>
	</div>
</template>
