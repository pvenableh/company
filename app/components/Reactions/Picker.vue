<script setup>
import { EMOJI_CATEGORIES, isLegacyReaction, getReactionIcon } from '~~/types/reactions';

const emit = defineEmits(['select']);

const searchQuery = ref('');

const filteredCategories = computed(() => {
	if (!searchQuery.value.trim()) return EMOJI_CATEGORIES;
	const q = searchQuery.value.toLowerCase();
	const filtered = {};
	for (const [category, emojis] of Object.entries(EMOJI_CATEGORIES)) {
		const matches = emojis.filter((e) => e.includes(q));
		if (matches.length) filtered[category] = matches;
	}
	return filtered;
});

function handleSelect(reaction) {
	emit('select', reaction);
}
</script>

<template>
	<div class="w-64 max-h-64 overflow-y-auto p-2">
		<UInput v-model="searchQuery" placeholder="Search emoji..." size="xs" class="mb-2" icon="i-heroicons-magnifying-glass" />
		<div v-for="(emojis, category) in filteredCategories" :key="category">
			<p class="text-[9px] uppercase tracking-wider text-gray-400 font-bold mb-1 mt-2">{{ category }}</p>
			<div class="grid grid-cols-8 gap-1">
				<button
					v-for="emoji in emojis"
					:key="emoji"
					class="h-7 w-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
					@click="handleSelect(emoji)"
				>
					<UIcon
						:name="isLegacyReaction(emoji) ? getReactionIcon(emoji, false) : `fluent-emoji-flat:${emoji}`"
						class="text-base"
					/>
				</button>
			</div>
		</div>
		<p v-if="Object.keys(filteredCategories).length === 0" class="text-xs text-gray-400 text-center py-4">
			No emoji found
		</p>
	</div>
</template>
