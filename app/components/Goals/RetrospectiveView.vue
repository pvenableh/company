<script setup lang="ts">
import { Button } from '~/components/ui/button';

// Retrospective body extracted from the standalone /goals/retrospective page
// so it can render inside the Goals workspace (a floor of the "Me" app) as a
// view tab. The page-level chrome (container, back-link, h1) is dropped — the
// workspace supplies it.
const { goals, refresh } = useGoals();
const { selectedOrg } = useOrganization();

type Timeframe = 'month' | 'quarter';
const timeframe = ref<Timeframe>('quarter');

function periodWindow(tf: Timeframe): { start: Date; end: Date; label: string } {
	const now = new Date();
	if (tf === 'month') {
		const start = new Date(now.getFullYear(), now.getMonth(), 1);
		const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
		return {
			start,
			end,
			label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
		};
	}
	const q = Math.floor(now.getMonth() / 3);
	const start = new Date(now.getFullYear(), q * 3, 1);
	const end = new Date(now.getFullYear(), q * 3 + 3, 0);
	return { start, end, label: `Q${q + 1} ${now.getFullYear()}` };
}

const period = computed(() => periodWindow(timeframe.value));

const inWindowGoals = computed(() => {
	const startTs = period.value.start.getTime();
	const endTs = period.value.end.getTime();
	return (goals.value as any[]).filter((g: any) => {
		if (g.status !== 'active' && g.status !== 'completed') return false;
		const sd = g.start_date ? new Date(g.start_date).getTime() : null;
		const ed = g.end_date ? new Date(g.end_date).getTime() : null;
		if (sd && sd > endTs) return false;
		if (ed && ed < startTs) return false;
		return true;
	});
});

const completedCount = computed(() => inWindowGoals.value.filter((g: any) => g.status === 'completed').length);
const activeCount = computed(() => inWindowGoals.value.filter((g: any) => g.status === 'active').length);

const snapshotsInWindow = computed(() => {
	const startTs = period.value.start.getTime();
	const endTs = period.value.end.getTime();
	let count = 0;
	for (const g of inWindowGoals.value as any[]) {
		for (const s of (g.snapshots || []) as any[]) {
			if (!s?.date_created) continue;
			const ts = new Date(s.date_created).getTime();
			if (ts >= startTs && ts <= endTs) count++;
		}
	}
	return count;
});

type Retrospective = {
	summary: string;
	patterns: string[];
	wins: string[];
	blockers: string[];
	suggested_focus: string[];
};
const retro = ref<Retrospective | null>(null);
const retroLoading = ref(false);
const retroError = ref<string | null>(null);

async function generateRetrospective() {
	if (!inWindowGoals.value.length) {
		retroError.value = 'No goals in the selected window.';
		return;
	}
	retroLoading.value = true;
	retroError.value = null;
	retro.value = null;
	try {
		const goalsPayload = (inWindowGoals.value as any[]).map((g: any) => ({
			id: g.id,
			title: g.title,
			description: g.description,
			category: g.category,
			scope: g.scope,
			target_value: g.target_value,
			target_unit: g.target_unit,
			current_value: g.current_value,
			end_date: g.end_date,
			start_date: g.start_date,
			status: g.status,
			template_id: g.metadata?.template_id || null,
			snapshots: ((g.snapshots || []) as any[])
				.filter((s: any) => s?.date_created)
				.map((s: any) => ({ value: s.value, notes: s.notes, date_created: s.date_created })),
		}));
		const res = await $fetch<Retrospective>('/api/ai/goal-retrospective', {
			method: 'POST',
			body: {
				timeframe: timeframe.value,
				periodStart: period.value.start.toISOString().slice(0, 10),
				periodEnd: period.value.end.toISOString().slice(0, 10),
				goals: goalsPayload,
				organizationId: selectedOrg.value || undefined,
			},
		});
		retro.value = res;
	} catch (err: any) {
		retroError.value = err?.data?.message || err?.message || 'Failed to generate retrospective';
	} finally {
		retroLoading.value = false;
	}
}

onMounted(() => {
	if (!goals.value.length) refresh();
});

watch(timeframe, () => {
	retro.value = null;
	retroError.value = null;
});

function goalProgressPct(g: any): number {
	if (!g.target_value) return 0;
	return Math.max(0, Math.min(100, Math.round(((g.current_value || 0) / g.target_value) * 100)));
}

function progressColor(p: number): string {
	if (p >= 75) return 'bg-success/70';
	if (p >= 50) return 'bg-primary/70';
	if (p >= 25) return 'bg-warning/70';
	return 'bg-destructive/70';
}
</script>

<template>
	<div>
		<div class="flex items-center justify-between mb-4 flex-wrap gap-2">
			<p class="text-sm text-muted-foreground">A deeper, AI-grounded look across your goals.</p>
			<div class="flex items-center gap-2">
				<UTabs
					:model-value="timeframe"
					:items="[
						{ key: 'month', label: 'This month' },
						{ key: 'quarter', label: 'This quarter' },
					]"
					class="w-fit"
					@update:model-value="(v) => (timeframe = v as Timeframe)"
				/>
				<Button
					size="sm"
					:disabled="retroLoading || !inWindowGoals.length"
					@click="generateRetrospective"
				>
					<UIcon v-if="retroLoading" name="i-heroicons-arrow-path" class="w-3.5 h-3.5 mr-1 animate-spin" />
					<EarnestIcon v-else class="w-3.5 h-3.5 mr-1" />
					{{ retroLoading ? 'Reflecting…' : 'Generate retrospective' }}
				</Button>
			</div>
		</div>

		<!-- Window summary -->
		<div class="ios-card p-5 mb-4">
			<div class="flex items-center justify-between mb-3 flex-wrap gap-3">
				<div>
					<h3 class="text-sm font-semibold">{{ period.label }}</h3>
					<p class="text-xs text-muted-foreground">
						{{ period.start.toLocaleDateString() }} – {{ period.end.toLocaleDateString() }}
					</p>
				</div>
				<div class="flex items-center gap-4 text-xs">
					<div class="text-right">
						<p class="text-lg font-bold">{{ inWindowGoals.length }}</p>
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground">in window</p>
					</div>
					<div class="text-right">
						<p class="text-lg font-bold text-success">{{ completedCount }}</p>
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground">completed</p>
					</div>
					<div class="text-right">
						<p class="text-lg font-bold">{{ activeCount }}</p>
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground">active</p>
					</div>
					<div class="text-right">
						<p class="text-lg font-bold">{{ snapshotsInWindow }}</p>
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground">check-ins</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Goal cards in window -->
		<div v-if="inWindowGoals.length" class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
			<div
				v-for="g in inWindowGoals"
				:key="g.id"
				class="ios-card p-4"
			>
				<div class="flex items-start justify-between gap-2 mb-2">
					<div class="min-w-0">
						<p class="text-sm font-medium truncate">{{ g.title }}</p>
						<div class="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
							<span class="capitalize">{{ g.category || 'custom' }}</span>
							<span>·</span>
							<span class="capitalize">{{ g.scope || 'user' }}</span>
							<span v-if="g.metadata?.template_id">·</span>
							<span v-if="g.metadata?.template_id" class="capitalize">{{ g.metadata.template_id }}</span>
						</div>
					</div>
					<span
						class="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 capitalize"
						:class="g.status === 'completed' ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'"
					>
						{{ g.status }}
					</span>
				</div>
				<div class="flex items-center gap-2">
					<div class="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
						<div class="h-full rounded-full transition-all" :class="progressColor(goalProgressPct(g))" :style="{ width: goalProgressPct(g) + '%' }"></div>
					</div>
					<span class="text-[11px] tabular-nums">{{ goalProgressPct(g) }}%</span>
				</div>
			</div>
		</div>

		<div v-else class="ios-card p-8 text-center mb-4">
			<UIcon name="i-heroicons-calendar" class="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
			<p class="text-sm font-medium text-muted-foreground">No goals in this window</p>
			<p class="text-xs text-muted-foreground/70 mt-1">Pick a different timeframe or create a goal.</p>
		</div>

		<!-- Error -->
		<div v-if="retroError" class="ios-card border-l-4 border-l-destructive bg-destructive/5 p-4 mb-4 text-sm text-destructive">
			{{ retroError }}
		</div>

		<!-- Loading -->
		<div v-if="retroLoading && !retro" class="ios-card p-6 text-center mb-4">
			<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 text-warning animate-spin mx-auto mb-2" />
			<p class="text-sm text-muted-foreground">Reading the last {{ timeframe }} across your goals…</p>
		</div>

		<!-- Retrospective output -->
		<div v-if="retro" class="space-y-3">
			<div class="ios-card p-5 border border-warning/20">
				<div class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-warning dark:text-warning font-semibold mb-2">
					<EarnestIcon class="w-3 h-3" />
					Summary
				</div>
				<p class="text-sm leading-relaxed">{{ retro.summary }}</p>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
				<div v-if="retro.patterns.length" class="ios-card p-5">
					<h4 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Patterns</h4>
					<ul class="space-y-1.5">
						<li v-for="(p, i) in retro.patterns" :key="i" class="text-sm flex gap-2">
							<span class="text-violet-500 shrink-0">·</span>
							<span>{{ p }}</span>
						</li>
					</ul>
				</div>

				<div v-if="retro.wins.length" class="ios-card p-5">
					<h4 class="text-[10px] uppercase tracking-wider text-success font-semibold mb-2">Wins</h4>
					<ul class="space-y-1.5">
						<li v-for="(w, i) in retro.wins" :key="i" class="text-sm flex gap-2">
							<UIcon name="i-heroicons-check-circle" class="w-3.5 h-3.5 mt-0.5 text-success shrink-0" />
							<span>{{ w }}</span>
						</li>
					</ul>
				</div>

				<div v-if="retro.blockers.length" class="ios-card p-5">
					<h4 class="text-[10px] uppercase tracking-wider text-warning font-semibold mb-2">Blockers</h4>
					<ul class="space-y-1.5">
						<li v-for="(b, i) in retro.blockers" :key="i" class="text-sm flex gap-2">
							<UIcon name="i-heroicons-exclamation-triangle" class="w-3.5 h-3.5 mt-0.5 text-warning shrink-0" />
							<span>{{ b }}</span>
						</li>
					</ul>
				</div>

				<div v-if="retro.suggested_focus.length" class="ios-card p-5">
					<h4 class="text-[10px] uppercase tracking-wider text-primary font-semibold mb-2">Suggested focus</h4>
					<ul class="space-y-1.5">
						<li v-for="(s, i) in retro.suggested_focus" :key="i" class="text-sm flex gap-2">
							<UIcon name="i-heroicons-arrow-right-circle" class="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" />
							<span>{{ s }}</span>
						</li>
					</ul>
				</div>
			</div>
		</div>
	</div>
</template>
