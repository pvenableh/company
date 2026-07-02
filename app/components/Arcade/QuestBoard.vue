<template>
	<div class="space-y-5">
		<div v-for="group in groups" :key="group.period" class="space-y-3">
			<div class="flex items-center justify-between">
				<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{{ group.title }}
				</h3>
				<span class="text-[10px] uppercase tracking-wider text-muted-foreground">
					{{ group.doneCount }}/{{ group.quests.length }} done
				</span>
			</div>

			<div class="space-y-2">
				<div
					v-for="q in group.quests"
					:key="q.id"
					class="ios-card rounded-2xl border border-border bg-card p-4 flex items-center gap-3 transition-colors"
					:class="q.done && !claimedIds.has(q.id) ? 'border-primary/40 bg-primary/5' : ''"
				>
					<!-- Icon -->
					<div
						class="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
						:class="q.done ? 'bg-primary/15 text-primary' : 'bg-muted/60 text-muted-foreground'"
					>
						<UIcon :name="q.icon" class="w-4.5 h-4.5" />
					</div>

					<!-- Body -->
					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<p class="text-sm font-semibold text-foreground truncate">{{ q.label }}</p>
							<span class="text-[10px] font-semibold text-primary tabular-nums shrink-0">+{{ q.bonus }} EP</span>
						</div>
						<p class="text-[11px] text-muted-foreground truncate">{{ q.blurb }}</p>
						<div class="mt-1.5 flex items-center gap-2">
							<div class="h-1.5 flex-1 rounded-full bg-muted/50 overflow-hidden">
								<div
									class="h-full rounded-full transition-all duration-700 ease-out"
									:class="q.done ? 'bg-primary' : 'bg-primary/60'"
									:style="{ width: `${Math.round(q.progress * 100)}%` }"
								/>
							</div>
							<span class="text-[10px] text-muted-foreground tabular-nums shrink-0">
								{{ q.current }}/{{ q.target }}
							</span>
						</div>
					</div>

					<!-- Claim / state -->
					<div class="shrink-0">
						<Button
							v-if="q.done && !claimedIds.has(q.id)"
							size="sm"
							class="rounded-full h-8 px-3 text-xs"
							:disabled="claiming === q.id"
							@click="onClaim(q)"
						>
							{{ claiming === q.id ? '…' : 'Claim' }}
						</Button>
						<span
							v-else-if="claimedIds.has(q.id)"
							class="inline-flex items-center gap-1 text-[11px] font-medium text-primary"
						>
							<UIcon name="i-heroicons-check-circle-solid" class="w-4 h-4" />
							Claimed
						</span>
						<UIcon
							v-else
							name="i-heroicons-lock-closed"
							class="w-4 h-4 text-muted-foreground/50"
						/>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button';
import type { Quest, QuestSnapshot } from '~/composables/useArcadeQuests';

const { state: earnest, fetchState, fetchHistory } = useEarnestScore();
const { buildQuests, isClaimed, claim } = useArcadeQuests();

const claiming = ref<string | null>(null);
// Reactive mirror of localStorage claim state (localStorage isn't reactive).
const claimedIds = reactive(new Set<string>());

// ── Snapshot from EP history + streak (cheap; no productivity-engine run) ──
const snapshot = computed<QuestSnapshot>(() => {
	const history = earnest.value.history || [];
	const today = new Date().toISOString().split('T')[0];
	const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().split('T')[0]!;

	let todayEP = 0;
	let weekEP = 0;
	let daysActiveThisWeek = 0;
	for (const h of history) {
		if (h.date === today) todayEP += h.ep || 0;
		if (h.date >= weekAgo) {
			weekEP += h.ep || 0;
			if ((h.ep || 0) > 0) daysActiveThisWeek += 1;
		}
	}
	return { todayEP, weekEP, daysActiveThisWeek, streak: earnest.value.streak || 0 };
});

const quests = computed<Quest[]>(() => buildQuests(snapshot.value));

const groups = computed(() => {
	const daily = quests.value.filter((q) => q.period === 'daily');
	const weekly = quests.value.filter((q) => q.period === 'weekly');
	return [
		{ period: 'daily' as const, title: 'Daily quests', quests: daily, doneCount: daily.filter((q) => q.done).length },
		{ period: 'weekly' as const, title: 'Weekly quests', quests: weekly, doneCount: weekly.filter((q) => q.done).length },
	];
});

const syncClaimed = () => {
	for (const q of quests.value) {
		if (isClaimed(q)) claimedIds.add(q.id);
	}
};

const onClaim = async (q: Quest) => {
	if (claiming.value) return;
	claiming.value = q.id;
	try {
		const ok = await claim(q);
		if (ok) claimedIds.add(q.id);
	} finally {
		claiming.value = null;
	}
};

onMounted(async () => {
	await fetchState();
	await fetchHistory(30);
	syncClaimed();
});
</script>
