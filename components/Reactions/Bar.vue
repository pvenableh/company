<script setup>
const props = defineProps({
	itemId: {
		type: String,
		required: true,
	},
	collection: {
		type: String,
		required: true,
	},
});

const { data, status } = useAuth();
const user = computed(() => {
	return status.value === 'authenticated' ? data?.value?.user ?? null : null;
});
const { createItem, deleteItems } = useDirectusItems();

// Subscribe to reactions with user details in real-time
const { data: reactions } = useRealtimeSubscription(
	'reactions',
	['id', 'reaction', 'user.id', 'user.first_name', 'user.last_name'],
	{
		item: { _eq: props.itemId },
	},
);

// Group reactions by type with user details
const reactionGroups = computed(() => {
	const groups = {};

	reactions.value?.forEach((reaction) => {
		groups[reaction.reaction] = groups[reaction.reaction] || {
			users: [],
			active: false,
			id: reaction.id, // Store reaction ID for deletion
		};
		groups[reaction.reaction].users.push(reaction.user);
		if (reaction.user.id === user.value?.id) {
			groups[reaction.reaction].active = true;
		}
	});

	return groups;
});

// Handle reaction selection
const handleReactionChange = async (type, added) => {
	if (added) {
		// Remove any existing reaction from the user
		for (const [reactionType, group] of Object.entries(reactionGroups.value)) {
			if (group.active && reactionType !== type) {
				await deleteItems('reactions', {
					filter: {
						item: { _eq: props.itemId },
						user: { _eq: user.value.id },
						reaction: { _eq: reactionType },
					},
				});
			}
		}
	}
};
</script>

<template>
	<div class="flex gap-2">
		<ReactionsButton
			v-for="(type, index) in ['love', 'like', 'idea', 'dislike']"
			:key="type"
			:item-id="itemId"
			:collection="collection"
			:reaction="type"
			:users="reactionGroups[type]?.users || []"
			:active="reactionGroups[type]?.active || false"
			@reaction-added="handleReactionChange(type, true)"
			@reaction-removed="handleReactionChange(type, false)"
			:class="{ 'border-gray-100 border-l': index !== 0 }"
		/>
	</div>
</template>
