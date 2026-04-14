<template>
	<div class="grid grid-cols-4 sm:grid-cols-5 gap-2">
		<div
			v-for="badge in badges"
			:key="badge.id"
			class="flex flex-col items-center gap-1 p-2 rounded-lg transition-all"
			:class="badge.unlocked ? 'bg-primary/5' : 'opacity-30 grayscale'"
			:title="badge.description"
		>
			<div
				class="w-8 h-8 rounded-full flex items-center justify-center"
				:class="badge.unlocked ? 'bg-primary/10' : 'bg-muted/50'"
			>
				<UIcon
					:name="badge.icon"
					class="w-4 h-4"
					:class="badge.unlocked ? 'text-primary' : 'text-muted-foreground'"
				/>
			</div>
			<span class="text-[9px] font-medium text-center leading-tight text-foreground">{{ badge.name }}</span>
		</div>
	</div>
</template>

<script setup lang="ts">
defineProps<{
	badges: {
		id: string;
		name: string;
		icon: string;
		description: string;
		unlocked: boolean;
	}[];
}>();
</script>
