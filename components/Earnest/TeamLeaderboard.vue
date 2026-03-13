<template>
	<div class="space-y-4">
		<div class="flex items-center justify-between">
			<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Earnest Leaderboard</h3>
			<button
				@click="refresh"
				class="text-xs text-primary hover:underline"
				:class="{ 'opacity-50': loading }"
			>
				Refresh
			</button>
		</div>

		<div v-if="loading" class="text-center py-8">
			<UIcon name="i-heroicons-arrow-path" class="w-5 h-5 text-muted-foreground animate-spin" />
		</div>

		<div v-else-if="scores.length === 0" class="text-center py-8 text-sm text-muted-foreground">
			No earnest scores yet. Scores are calculated when team members visit their dashboard.
		</div>

		<div v-else class="space-y-2">
			<div
				v-for="(member, index) in scores"
				:key="member.userId"
				class="flex items-center gap-3 p-3 rounded-xl border transition-colors"
				:class="index < 3 ? 'border-primary/20 bg-primary/5' : 'border-border'"
			>
				<!-- Rank -->
				<div class="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
					:class="index === 0 ? 'bg-amber-500/20 text-amber-600' : index === 1 ? 'bg-gray-400/20 text-gray-500' : index === 2 ? 'bg-orange-400/20 text-orange-500' : 'bg-muted/50 text-muted-foreground'"
				>
					<span class="text-xs font-bold">{{ index + 1 }}</span>
				</div>

				<!-- Avatar + Name -->
				<div class="flex items-center gap-2 flex-1 min-w-0">
					<div v-if="member.avatar" class="w-8 h-8 rounded-full overflow-hidden shrink-0">
						<img :src="getAvatarUrl(member.avatar)" :alt="member.firstName" class="w-full h-full object-cover" />
					</div>
					<div v-else class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
						<span class="text-xs font-semibold text-primary">{{ (member.firstName || '?').charAt(0).toUpperCase() }}</span>
					</div>
					<div class="min-w-0">
						<p class="text-sm font-medium text-foreground truncate">{{ member.firstName }} {{ member.lastName }}</p>
						<p class="text-[10px] text-muted-foreground">{{ member.levelTitle }}</p>
					</div>
				</div>

				<!-- Score -->
				<div class="text-right shrink-0">
					<p class="text-lg font-bold tabular-nums" :class="getScoreColor(member.currentScore)">{{ member.currentScore }}</p>
					<p class="text-[10px] text-muted-foreground tabular-nums">{{ member.totalEP.toLocaleString() }} EP</p>
				</div>

				<!-- Streak -->
				<div class="text-center shrink-0 w-12">
					<p class="text-sm font-semibold tabular-nums text-foreground">{{ member.streak }}</p>
					<p class="text-[10px] text-muted-foreground">streak</p>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
const { teamScores: scores, fetchAllMemberScores, getScoreTier } = useEarnestScore();
const config = useRuntimeConfig();

const loading = ref(false);

const getAvatarUrl = (avatarId: string) => {
	const id = typeof avatarId === 'object' ? (avatarId as any).id : avatarId;
	return `${config.public.directusUrl || config.public.assetsUrl?.replace('/assets/', '')}/assets/${id}?key=small`;
};

const getScoreColor = (score: number) => {
	const tier = getScoreTier(score);
	return tier.color;
};

const refresh = async () => {
	loading.value = true;
	await fetchAllMemberScores();
	loading.value = false;
};

onMounted(async () => {
	loading.value = true;
	await fetchAllMemberScores();
	loading.value = false;
});
</script>
