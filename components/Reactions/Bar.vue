<script setup>
import { LEGACY_REACTION_TYPES } from '~/types/reactions';

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
const reactionItems = useDirectusItems('reactions');
const pickerOpen = ref(false);

// Subscribe to reactions with user details in real-time
const { data: reactions, refresh } = useRealtimeSubscription(
	'reactions',
	['id', 'reaction', 'user.id', 'user.first_name', 'user.last_name'],
	{
		item: { _eq: props.itemId },
		table: { _eq: props.collection },
	},
);

// Group reactions by type with user details — supports any reaction string
const reactionGroups = computed(() => {
	const groups = {};

	if (reactions.value && Array.isArray(reactions.value)) {
		reactions.value.forEach((reaction) => {
			if (!reaction || !reaction.reaction) return;

			if (!groups[reaction.reaction]) {
				groups[reaction.reaction] = {
					users: [],
					active: false,
					id: null,
				};
			}

			if (reaction.user) {
				groups[reaction.reaction].users.push(reaction.user);
			}

			if (reaction.user?.id === user.value?.id) {
				groups[reaction.reaction].active = true;
				groups[reaction.reaction].id = reaction.id;
			}
		});
	}

	return groups;
});

// Visible reaction buttons: legacy types with data first, then any emoji reactions
const visibleGroups = computed(() => {
	const groups = [];
	const seen = new Set();

	// Legacy types that have reactions
	for (const type of LEGACY_REACTION_TYPES) {
		if (reactionGroups.value[type]?.users.length > 0) {
			groups.push({ reaction: type, ...reactionGroups.value[type] });
			seen.add(type);
		}
	}

	// Any additional emoji reactions from the data
	for (const [reaction, group] of Object.entries(reactionGroups.value)) {
		if (!seen.has(reaction) && group.users.length > 0) {
			groups.push({ reaction, ...group });
		}
	}

	return groups;
});

const handleReactionChange = () => {
	refresh && refresh();
};

const handlePickerSelect = async (reaction) => {
	pickerOpen.value = false;
	if (!user.value?.id) return;

	try {
		// Check if user already has this exact reaction
		const existing = reactionGroups.value[reaction];
		if (existing?.active && existing?.id) {
			await reactionItems.remove(existing.id);
		} else {
			// Remove any existing reaction from this user on this item
			if (reactions.value && Array.isArray(reactions.value)) {
				const userReaction = reactions.value.find((r) => r.user?.id === user.value.id);
				if (userReaction) {
					await reactionItems.remove(userReaction.id);
				}
			}

			// Create the new reaction
			await reactionItems.create({
				item: props.itemId,
				table: props.collection,
				user: user.value.id,
				reaction,
			});
		}

		refresh && refresh();
	} catch (error) {
		console.error('Error toggling reaction from picker:', error);
	}
};
</script>

<template>
	<div class="flex gap-1 items-center flex-wrap">
		<ReactionsButton
			v-for="(group, index) in visibleGroups"
			:key="group.reaction"
			:item-id="itemId"
			:collection="collection"
			:reaction="group.reaction"
			:users="group.users || []"
			:active="group.active || false"
			@reaction-added="handleReactionChange"
			@reaction-removed="handleReactionChange"
			:class="{ 'border-gray-100 dark:border-gray-700 border-l pl-1': index !== 0 }"
		/>

		<!-- Add reaction button with emoji picker -->
		<UPopover v-model:open="pickerOpen">
			<button
				class="h-6 w-6 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
			>
				<UIcon name="i-heroicons-face-smile" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm" />
			</button>
			<template #panel>
				<ReactionsPicker @select="handlePickerSelect" />
			</template>
		</UPopover>
	</div>
</template>
