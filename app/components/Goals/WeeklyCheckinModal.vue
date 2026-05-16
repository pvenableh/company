<script setup lang="ts">
// Stage 2.5 — weekly check-in modal.
// Lists all active scope=user goals (not just stale ones — chance to update
// everything at once) with a number input + optional notes per row. Submit
// batches via Promise.allSettled so one failed snapshot doesn't swallow the
// others. AI reflection is wired in a later chunk; for now we just persist.
import { Button } from '~/components/ui/button';
import type { Goal } from '~~/shared/directus';

const isOpen = defineModel<boolean>({ default: false });

const { activeMyGoals, isGoalStale, recordSnapshot, goalProgress } = useGoals();
const { selectedOrg } = useOrganization();
const toast = useToast();

type RowStatus = 'idle' | 'saving' | 'saved' | 'error';
interface Row {
	goalId: string;
	value: number | null;
	notes: string;
	startValue: number;
	status: RowStatus;
	errorMsg: string;
}

const rows = ref<Row[]>([]);
const submitting = ref(false);
const submitted = ref(false);
// Reflection state is owned here but populated by the chunk-c API call.
const reflection = ref<string>('');
const reflectionLoading = ref(false);
const reflectionError = ref<string>('');

function seedRows() {
	rows.value = activeMyGoals.value.map((g) => ({
		goalId: g.id!,
		value: g.current_value ?? 0,
		notes: '',
		startValue: g.current_value ?? 0,
		status: 'idle',
		errorMsg: '',
	}));
	submitted.value = false;
	reflection.value = '';
	reflectionError.value = '';
}

watch(isOpen, (open) => {
	if (open) seedRows();
});

const goalById = computed(() => {
	const map = new Map<string, Goal>();
	for (const g of activeMyGoals.value) if (g.id) map.set(g.id, g);
	return map;
});

const categoryIcon: Record<string, { icon: string; color: string }> = {
	revenue: { icon: 'i-heroicons-banknotes', color: 'text-success' },
	growth: { icon: 'i-heroicons-arrow-trending-up', color: 'text-blue-500' },
	retention: { icon: 'i-heroicons-heart', color: 'text-pink-500' },
	learning: { icon: 'i-heroicons-academic-cap', color: 'text-indigo-500' },
	wellbeing: { icon: 'i-heroicons-sun', color: 'text-warning' },
	delivery: { icon: 'i-heroicons-truck', color: 'text-purple-500' },
	custom: { icon: 'i-heroicons-flag', color: 'text-warning' },
};
function iconFor(g: Goal | undefined) {
	if (!g) return categoryIcon.custom;
	return categoryIcon[g.category as string] || categoryIcon.custom;
}

function fmtUnit(g: Goal | undefined, n: number | null | undefined) {
	if (n == null) return '?';
	const unit = g?.target_unit || '';
	if (unit === 'USD' || unit === '$') return `$${Number(n).toLocaleString()}`;
	if (unit === 'percent' || unit === '%') return `${n}%`;
	return `${Number(n).toLocaleString()}${unit ? ` ${unit}` : ''}`;
}

const hasAnyChanges = computed(() =>
	rows.value.some((r) => r.value !== r.startValue || r.notes.trim() !== ''),
);

async function saveRow(row: Row): Promise<{ ok: boolean; value: number; notes: string }> {
	if (row.value == null) {
		row.status = 'error';
		row.errorMsg = 'Value required';
		return { ok: false, value: 0, notes: '' };
	}
	row.status = 'saving';
	row.errorMsg = '';
	try {
		await recordSnapshot(row.goalId, Number(row.value), row.notes || undefined);
		row.status = 'saved';
		row.startValue = Number(row.value);
		return { ok: true, value: Number(row.value), notes: row.notes };
	} catch (e: any) {
		row.status = 'error';
		row.errorMsg = e?.message || 'Save failed';
		return { ok: false, value: 0, notes: '' };
	}
}

// Pull the saved snapshots back from useGoals state (recordSnapshot pushed
// them onto goal.snapshots already) and POST the batch to /api/ai/goal-reflection.
// Failures here never block the check-in itself — the snapshots are already saved.
async function requestReflection(savedGoalIds: string[]) {
	reflectionLoading.value = true;
	reflection.value = '';
	reflectionError.value = '';
	try {
		const payload = {
			organizationId: selectedOrg.value || undefined,
			goals: savedGoalIds.map((id) => {
				const g = goalById.value.get(id);
				if (!g) return null;
				const snapshots = ((g.snapshots as any[]) || [])
					.slice(-5)
					.map((s) => ({ value: s.value, notes: s.notes || null, date_created: s.date_created || null }));
				return {
					goal: {
						id: g.id,
						title: g.title,
						description: g.description || null,
						category: g.category || null,
						scope: g.scope || null,
						target_value: g.target_value ?? null,
						target_unit: g.target_unit || null,
						current_value: g.current_value ?? null,
						end_date: g.end_date || null,
						timeframe: g.timeframe || null,
					},
					snapshots,
				};
			}).filter(Boolean),
		};

		const res = await $fetch<{ reflection: string }>('/api/ai/goal-reflection', {
			method: 'POST',
			body: payload,
		});
		reflection.value = res?.reflection || '';
		if (!reflection.value) reflectionError.value = 'empty';
	} catch (e: any) {
		reflectionError.value = e?.statusMessage || e?.message || 'failed';
	} finally {
		reflectionLoading.value = false;
	}
}

async function handleSubmit() {
	if (submitting.value) return;
	submitting.value = true;
	submitted.value = true;
	try {
		// Only POST snapshots for rows that actually changed (value delta OR
		// notes typed). Run them in parallel; per-row status surfaces failures.
		const targets = rows.value.filter((r) => r.value !== r.startValue || r.notes.trim() !== '');
		if (targets.length === 0) {
			toast.add({ title: 'Nothing to save', description: 'Update a value or add a note.', color: 'neutral' });
			submitting.value = false;
			return;
		}
		const results = await Promise.allSettled(targets.map(saveRow));
		const okIds = targets.filter((_t, i) => results[i].status === 'fulfilled' && (results[i] as PromiseFulfilledResult<any>).value.ok).map((t) => t.goalId);
		const failed = targets.length - okIds.length;
		if (okIds.length > 0) {
			toast.add({
				title: `Checked in on ${okIds.length} goal${okIds.length === 1 ? '' : 's'}`,
				description: failed > 0 ? `${failed} failed — retry inline.` : undefined,
				color: failed > 0 ? 'warning' : 'success',
			});
			// Fire-and-forget — modal stays open while user reads reflection.
			void requestReflection(okIds);
		} else {
			toast.add({ title: 'Nothing saved', description: 'All rows failed — check connection.', color: 'error' });
		}
	} finally {
		submitting.value = false;
	}
}

async function retryRow(row: Row) {
	if (row.status !== 'error') return;
	await saveRow(row);
}

const totalActiveStaleCount = computed(() => rows.value.filter((r) => {
	const g = goalById.value.get(r.goalId);
	return g ? isGoalStale(g) : false;
}).length);
</script>

<template>
	<UModal v-model="isOpen" class="sm:max-w-2xl">
		<template #header>
			<div class="w-full">
				<h3 class="text-sm font-bold uppercase tracking-wide pr-8">Weekly check-in</h3>
				<p class="text-xs text-muted-foreground mt-1">
					<template v-if="rows.length === 0">No active personal goals.</template>
					<template v-else-if="totalActiveStaleCount > 0">
						{{ totalActiveStaleCount }} stale, {{ rows.length }} active. Update any you've moved on.
					</template>
					<template v-else>
						{{ rows.length }} active {{ rows.length === 1 ? 'goal' : 'goals' }}. Update anything that's changed.
					</template>
				</p>
			</div>
		</template>

		<!-- Body -->
		<div class="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
			<div v-if="rows.length === 0" class="py-8 text-center">
				<UIcon name="i-heroicons-flag" class="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
				<p class="text-sm text-muted-foreground">No personal goals to check in on.</p>
				<NuxtLink to="/goals?scope=user" class="text-xs text-primary hover:underline mt-2 inline-block">Set one &rarr;</NuxtLink>
			</div>

			<div
				v-for="row in rows"
				:key="row.goalId"
				class="border border-border/40 rounded-xl p-3 space-y-2"
				:class="{
					'bg-success/5 border-success/30': row.status === 'saved',
					'bg-destructive/5 border-destructive/30': row.status === 'error',
				}"
			>
				<div class="flex items-start gap-2">
					<UIcon :name="iconFor(goalById.get(row.goalId)).icon" :class="iconFor(goalById.get(row.goalId)).color" class="w-4 h-4 mt-0.5 flex-shrink-0" />
					<div class="flex-1 min-w-0">
						<p class="text-sm font-medium text-foreground truncate">{{ goalById.get(row.goalId)?.title || 'Goal' }}</p>
						<p class="text-[11px] text-muted-foreground">
							Was {{ fmtUnit(goalById.get(row.goalId), row.startValue) }}
							<template v-if="goalById.get(row.goalId)?.target_value">
								&middot; target {{ fmtUnit(goalById.get(row.goalId), goalById.get(row.goalId)?.target_value) }}
								&middot; {{ Math.round(goalProgress(goalById.get(row.goalId)!)) }}%
							</template>
						</p>
					</div>
					<span
						v-if="row.status === 'saved'"
						class="text-[10px] font-semibold text-success px-2 py-0.5 rounded-full bg-success/10"
					>Saved</span>
					<span
						v-else-if="row.status === 'saving'"
						class="text-[10px] font-semibold text-muted-foreground px-2 py-0.5"
					>Saving…</span>
					<button
						v-else-if="row.status === 'error'"
						type="button"
						class="text-[10px] font-semibold text-destructive px-2 py-0.5 rounded-full bg-destructive/10 hover:bg-destructive/20"
						@click="retryRow(row)"
					>Retry</button>
				</div>

				<div class="grid grid-cols-[1fr_auto] gap-2 items-center">
					<UInput
						v-model.number="row.value"
						type="number"
						:placeholder="String(row.startValue)"
						class="w-full"
						:disabled="row.status === 'saving' || row.status === 'saved'"
					/>
					<span class="text-[11px] text-muted-foreground whitespace-nowrap">
						{{ goalById.get(row.goalId)?.target_unit || '' }}
					</span>
				</div>

				<UTextarea
					v-model="row.notes"
					:rows="2"
					placeholder="What changed this week? (optional — adds context to the AI reflection)"
					:disabled="row.status === 'saving' || row.status === 'saved'"
					class="text-xs"
				/>

				<p v-if="row.status === 'error'" class="text-[11px] text-destructive">{{ row.errorMsg }}</p>
			</div>

			<!-- Reflection slot — populated by chunk c. Renders only after submit. -->
			<div v-if="submitted && (reflectionLoading || reflection || reflectionError)" class="border border-primary/20 bg-primary/5 rounded-xl p-3 space-y-1">
				<div class="flex items-center gap-1.5">
					<EarnestIcon class="w-3.5 h-3.5 text-primary" />
					<p class="text-[11px] font-semibold uppercase tracking-wide text-primary">Reflection</p>
				</div>
				<div v-if="reflectionLoading" class="space-y-1.5">
					<div class="h-2.5 bg-primary/10 rounded animate-pulse" />
					<div class="h-2.5 bg-primary/10 rounded animate-pulse w-3/4" />
				</div>
				<p v-else-if="reflection" class="text-xs leading-relaxed text-foreground/90">{{ reflection }}</p>
				<p v-else-if="reflectionError" class="text-[11px] text-muted-foreground">Couldn't generate a reflection — your check-in is saved.</p>
			</div>
		</div>

		<template #footer>
			<div class="flex items-center justify-between w-full">
				<p class="text-[11px] text-muted-foreground">
					<template v-if="!submitted && hasAnyChanges">Changes will be saved as snapshots dated today.</template>
					<template v-else-if="!submitted">No changes yet.</template>
					<template v-else>Snapshots saved. Close when you're ready.</template>
				</p>
				<div class="flex items-center gap-2">
					<Button variant="ghost" size="sm" @click="isOpen = false">Close</Button>
					<Button
						v-if="!submitted || rows.some(r => r.status === 'error')"
						size="sm"
						:disabled="submitting || rows.length === 0 || !hasAnyChanges"
						@click="handleSubmit"
					>
						<Icon v-if="submitting" name="lucide:loader-2" class="h-3.5 w-3.5 mr-1 animate-spin" />
						<Icon v-else name="lucide:check" class="h-3.5 w-3.5 mr-1" />
						{{ submitting ? 'Saving…' : submitted ? 'Retry failed' : 'Save check-in' }}
					</Button>
				</div>
			</div>
		</template>
	</UModal>
</template>
