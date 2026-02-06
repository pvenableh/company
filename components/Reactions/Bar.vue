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

const { user } = useDirectusAuth();

// Subscribe to reactions with user details in real-time
const { data: reactions, refresh } = useRealtimeSubscription(
	'reactions',
	['id', 'reaction', 'user.id', 'user.first_name', 'user.last_name'],
	{
		item: { _eq: props.itemId },
	},
);

// Group reactions by type with user details
const reactionGroups = computed(() => {
	const groups = {};

	// Initialize with empty groups for all reaction types
	['love', 'like', 'idea', 'dislike'].forEach((type) => {
		groups[type] = {
			users: [],
			active: false,
			id: null,
		};
	});

	// Fill with actual data if we have reactions
	if (reactions.value && Array.isArray(reactions.value)) {
		reactions.value.forEach((reaction) => {
			if (!reaction || !reaction.reaction) return;

			// Ensure the reaction type exists in our groups
			if (!groups[reaction.reaction]) {
				groups[reaction.reaction] = {
					users: [],
					active: false,
					id: null,
				};
			}

			// Add user to the users array for this reaction type
			if (reaction.user) {
				groups[reaction.reaction].users.push(reaction.user);
			}

			// Check if current user has this reaction
			if (reaction.user?.id === user.value?.id) {
				groups[reaction.reaction].active = true;
				groups[reaction.reaction].id = reaction.id;
			}
		});
	}

	// console.log(
	// 	'Updated reaction groups:',
	// 	Object.entries(groups).map(([type, group]) => `${type}: ${group.users.length} users, active: ${group.active}`),
	// );

	return groups;
});

// Force refresh when reactions are added/removed
const handleReactionChange = () => {
	console.log('Refreshing reactions data');
	refresh && refresh();
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
			@reaction-added="handleReactionChange"
			@reaction-removed="handleReactionChange"
			:class="{ 'border-gray-100 border-l': index !== 0 }"
		/>
	</div>
</template>
