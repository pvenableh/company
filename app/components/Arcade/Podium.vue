<template>
	<div v-if="ordered.length" class="flex items-end justify-center gap-2 sm:gap-4 pt-4">
		<div
			v-for="slot in ordered"
			:key="slot.member.userId"
			class="flex flex-col items-center"
			:class="slot.rank === 1 ? 'w-24 sm:w-28' : 'w-20 sm:w-24'"
		>
			<!-- Crown for #1 -->
			<UIcon
				v-if="slot.rank === 1"
				name="i-heroicons-trophy-solid"
				class="w-5 h-5 text-warning mb-1 drop-shadow"
			/>

			<!-- Avatar -->
			<div
				class="rounded-full overflow-hidden ring-2 shadow-sm"
				:class="[slot.rank === 1 ? 'w-16 h-16 ring-warning' : 'w-12 h-12', slot.ring]"
			>
				<img
					v-if="slot.member.avatar"
					:src="avatarUrl(slot.member.avatar)"
					:alt="slot.member.firstName"
					loading="lazy"
					class="w-full h-full object-cover"
				/>
				<div v-else class="w-full h-full bg-primary/10 flex items-center justify-center">
					<span class="font-semibold text-primary" :class="slot.rank === 1 ? 'text-xl' : 'text-base'">
						{{ (slot.member.firstName || '?').charAt(0).toUpperCase() }}
					</span>
				</div>
			</div>

			<!-- Name + metric -->
			<p class="mt-1.5 text-xs font-medium text-foreground text-center truncate max-w-full">
				{{ slot.member.firstName }}
			</p>
			<p class="text-[11px] font-bold tabular-nums" :class="slot.accent">
				{{ metric(slot.member) }}
			</p>

			<!-- Pedestal -->
			<div
				class="mt-1.5 w-full rounded-t-lg flex items-start justify-center pt-1.5"
				:class="slot.pedestal"
				:style="{ height: `${slot.height}px` }"
			>
				<span class="text-sm font-black text-white/90 tabular-nums">{{ slot.rank }}</span>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { TeamMemberScore } from '~/composables/useEarnestScore';

const props = withDefaults(
	defineProps<{
		/** Scores sorted descending (rank 1 first). */
		scores: TeamMemberScore[];
		/** Which value to headline per member. */
		metricKey?: 'currentScore' | 'totalEP';
	}>(),
	{ metricKey: 'currentScore' },
);

const config = useRuntimeConfig();

const avatarUrl = (avatarId: any) => {
	const id = typeof avatarId === 'object' ? avatarId?.id : avatarId;
	const base = config.public.directusUrl || (config.public.assetsUrl as string)?.replace('/assets/', '');
	return `${base}/assets/${id}?key=small`;
};

const metric = (m: TeamMemberScore) =>
	props.metricKey === 'totalEP' ? `${m.totalEP.toLocaleString()} EP` : String(m.currentScore);

// Podium layout: 2nd (left), 1st (center, tallest), 3rd (right).
const STYLE = {
	1: { pedestal: 'bg-gradient-to-b from-warning to-warning/70', accent: 'text-warning', ring: 'ring-warning', height: 64 },
	2: { pedestal: 'bg-gradient-to-b from-gray-400 to-gray-400/60', accent: 'text-gray-500', ring: 'ring-gray-300', height: 48 },
	3: { pedestal: 'bg-gradient-to-b from-amber-700 to-amber-700/60', accent: 'text-amber-700', ring: 'ring-amber-600/60', height: 36 },
} as const;

const ordered = computed(() => {
	const top = props.scores.slice(0, 3);
	// Visual order: 2nd, 1st, 3rd (fill gracefully if fewer than 3).
	const order = [2, 1, 3];
	return order
		.map((rank) => {
			const member = top[rank - 1];
			if (!member) return null;
			const s = STYLE[rank as 1 | 2 | 3];
			return { rank, member, ...s };
		})
		.filter((x): x is NonNullable<typeof x> => x !== null);
});
</script>
