<script setup lang="ts">
const { stats, isLoading, fetchStats } = useCardDesk();
const config = useRuntimeConfig();

const ratingColors: Record<string, string> = {
	hot: 'text-red-500',
	warm: 'text-amber-500',
	nurture: 'text-green-500',
	cold: 'text-blue-400',
};

const ratingBgColors: Record<string, string> = {
	hot: 'bg-red-50 dark:bg-red-900/20',
	warm: 'bg-amber-50 dark:bg-amber-900/20',
	nurture: 'bg-green-50 dark:bg-green-900/20',
	cold: 'bg-blue-50 dark:bg-blue-900/20',
};

const activityIcons: Record<string, string> = {
	email: 'i-heroicons-envelope',
	text: 'i-heroicons-chat-bubble-left',
	call: 'i-heroicons-phone',
	meeting: 'i-heroicons-users',
	linkedin: 'i-heroicons-link',
	other: 'i-heroicons-ellipsis-horizontal',
};

// Uses formatRelativeDay from utils/dates.ts
const formatDate = (dateStr: string) => formatRelativeDay(dateStr);

const { user: authUser } = useDirectusAuth();

watch(
	() => authUser.value?.id,
	(newId) => {
		if (newId && stats.totalContacts === 0 && !isLoading) {
			fetchStats();
		}
	},
	{ immediate: true },
);

onMounted(() => {
	if (authUser.value?.id) {
		fetchStats();
	}
});
</script>

<template>
	<div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
		<!-- Header -->
		<div class="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
			<div class="flex items-center gap-2">
				<div class="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
					<UIcon name="i-heroicons-identification" class="w-5 h-5 text-white" />
				</div>
				<div>
					<h3 class="text-sm font-semibold uppercase tracking-wide">CardDesk</h3>
					<p class="text-[10px] text-gray-400">Networking Pipeline</p>
				</div>
			</div>
			<nuxt-link to="/carddesk" class="text-xs text-primary hover:underline">
				View All &rarr;
			</nuxt-link>
		</div>

		<div v-if="isLoading" class="p-4 space-y-3">
			<div v-for="n in 3" :key="n" class="h-8 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
		</div>

		<div v-else class="p-4 space-y-4">
			<!-- XP Bar -->
			<div v-if="stats.xp.totalXp > 0" class="flex items-center gap-3">
				<div class="flex items-center gap-1.5">
					<span class="text-lg">⚡</span>
					<span class="text-xs font-bold text-gray-700 dark:text-gray-200">Lvl {{ stats.xp.level }}</span>
					<span class="text-[10px] text-gray-400">{{ stats.xp.levelTitle }}</span>
				</div>
				<div class="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
					<div
						class="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-500"
						:style="{ width: `${stats.xp.progress}%` }"
					/>
				</div>
				<span class="text-[10px] text-gray-400 whitespace-nowrap">
					{{ stats.xp.totalXp.toLocaleString() }} / {{ stats.xp.nextLevelXp.toLocaleString() }} XP
				</span>
			</div>

			<!-- Streak -->
			<div v-if="stats.xp.streak > 0" class="flex items-center gap-2 text-xs text-gray-500">
				<span class="text-amber-500">🔥</span>
				<span class="font-medium">{{ stats.xp.streak }}-day streak</span>
			</div>

			<!-- Pipeline Counts -->
			<div class="grid grid-cols-4 gap-2">
				<div
					v-for="rating in ['hot', 'warm', 'nurture', 'cold']"
					:key="rating"
					:class="ratingBgColors[rating]"
					class="rounded-lg p-2 text-center"
				>
					<div :class="ratingColors[rating]" class="text-lg font-bold">
						{{ rating === 'hot' ? stats.hotContacts : rating === 'warm' ? stats.warmContacts : rating === 'nurture' ? stats.nurtureContacts : stats.coldContacts }}
					</div>
					<div class="text-[9px] uppercase font-medium text-gray-500 dark:text-gray-400">{{ rating }}</div>
				</div>
			</div>

			<!-- Converted Contacts -->
			<div v-if="stats.convertedClients > 0" class="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
				<UIcon name="i-heroicons-check-badge" class="w-4 h-4 text-emerald-500" />
				<span class="text-xs font-medium text-emerald-700 dark:text-emerald-300">
					{{ stats.convertedClients }} converted to contact{{ stats.convertedClients !== 1 ? 's' : '' }}
				</span>
			</div>

			<!-- Needs Follow-up -->
			<div v-if="stats.needsFollowUp.length > 0">
				<h4 class="text-[10px] uppercase font-semibold text-gray-400 mb-2 tracking-wider">Needs Follow-up</h4>
				<div class="space-y-1.5">
					<div
						v-for="contact in stats.needsFollowUp.slice(0, 4)"
						:key="contact.id"
						class="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
					>
						<div class="flex items-center gap-2 min-w-0">
							<span
								class="w-2 h-2 rounded-full flex-shrink-0"
								:class="contact.rating === 'hot' ? 'bg-red-500' : 'bg-amber-500'"
							/>
							<span class="text-xs font-medium truncate">{{ contact.name }}</span>
							<span v-if="contact.company" class="text-[10px] text-gray-400 truncate hidden sm:inline">
								{{ contact.company }}
							</span>
						</div>
						<span class="text-[10px] text-gray-400 whitespace-nowrap ml-2">
							{{ contact.daysSinceContact }}d ago
						</span>
					</div>
				</div>
				<nuxt-link
					v-if="stats.needsFollowUp.length > 4"
					to="/carddesk"
					class="block text-[10px] text-primary hover:underline mt-1.5 text-center"
				>
					+{{ stats.needsFollowUp.length - 4 }} more
				</nuxt-link>
			</div>

			<!-- Recent Activity -->
			<div v-if="stats.recentActivity.length > 0">
				<h4 class="text-[10px] uppercase font-semibold text-gray-400 mb-2 tracking-wider">Recent Activity</h4>
				<div class="space-y-1">
					<div
						v-for="act in stats.recentActivity.slice(0, 3)"
						:key="act.id"
						class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400"
					>
						<UIcon :name="activityIcons[act.type] || activityIcons.other" class="w-3.5 h-3.5 flex-shrink-0" />
						<span class="truncate">
							{{ act.type }} {{ act.contactName ? `with ${act.contactName}` : '' }}
						</span>
						<span v-if="act.isResponse" class="text-[9px] bg-green-100 text-green-700 px-1 rounded">replied</span>
						<span class="text-[10px] text-gray-400 ml-auto whitespace-nowrap">{{ formatDate(act.date) }}</span>
					</div>
				</div>
			</div>

			<!-- Empty State -->
			<div v-if="stats.totalContacts === 0 && !isLoading" class="text-center py-4">
				<UIcon name="i-heroicons-identification" class="w-8 h-8 mx-auto text-gray-300 mb-2" />
				<p class="text-xs text-gray-400">No CardDesk contacts yet</p>
				<p class="text-[10px] text-gray-400 mt-1">Scan business cards to build your networking pipeline.</p>
				<NuxtLink
					to="/carddesk"
					class="inline-flex items-center gap-1 mt-3 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-medium hover:bg-primary/90 transition-colors"
				>
					<UIcon name="i-heroicons-camera" class="w-3 h-3" />
					Start scanning cards
				</NuxtLink>
			</div>
		</div>
	</div>
</template>
