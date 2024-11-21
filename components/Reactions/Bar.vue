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
const { data } = useRealtimeSubscription(
	'reactions',
	['id', 'reaction', 'user.id', 'user.first_name', 'user.last_name'],
	{
		item: { _eq: props.itemId },
	},
);

// Group reactions by type with user details
const reactionGroups = computed(() => {
	const groups = {};

	data.value?.forEach((reaction) => {
		groups[reaction.reaction] = groups[reaction.reaction] || {
			users: [],
			active: false,
		};
		groups[reaction.reaction].users.push(reaction.user);
		if (reaction.user.id === user.value?.id) {
			groups[reaction.reaction].active = true;
		}
	});

	return groups;
});
</script>

<template>
	<div class="flex gap-2">
		<ReactionsButton
			v-for="type in ['love', 'like', 'idea', 'dislike']"
			:key="type"
			:item-id="itemId"
			:collection="collection"
			:reaction="type"
			:users="reactionGroups[type]?.users || []"
			:active="reactionGroups[type]?.active || false"
		/>
	</div>
</template>
