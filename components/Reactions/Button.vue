<script setup>
import { gsap } from 'gsap';

const props = defineProps({
	itemId: {
		type: String,
		required: true,
	},
	collection: {
		type: String,
		required: true,
	},
	reaction: {
		type: String,
		required: true,
	},
	users: {
		type: Array,
		default: () => [],
	},
	active: {
		type: Boolean,
		default: false,
	},
});

const { createItem, deleteItems, readItems } = useDirectusItems();
const { user } = useDirectusAuth();
const emits = defineEmits(['reaction-added', 'reaction-removed']);
const toast = useToast();

const isActive = ref(props.active);
const reactionCount = ref(props.count);

const toggleReaction = async () => {
	if (!user.value) return;

	try {
		// Check if user has already reacted
		const existingReaction = await readItems('reactions', {
			filter: {
				item: { _eq: props.itemId },
				user: { _eq: user.value.id },
				reaction: { _eq: props.reaction },
			},
		});

		if (existingReaction && existingReaction.length > 0) {
			// User has already reacted - remove the reaction
			await deleteItems('reactions', {
				filter: {
					item: { _eq: props.itemId },
					user: { _eq: user.value.id },
					reaction: { _eq: props.reaction },
				},
			});
			reactionCount.value--;
			isActive.value = false;
			emits('reaction-removed', props.reaction);
		} else {
			// User hasn't reacted - add the reaction
			await createItem('reactions', {
				item: props.itemId,
				table: props.collection,
				user: user.value.id,
				reaction: props.reaction,
			});
			reactionCount.value++;
			isActive.value = true;
			emits('reaction-added', props.reaction);
		}
	} catch (error) {
		console.error('Error toggling reaction:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to toggle reaction',
			color: 'red',
		});
	}
};

const getReactionIcon = (type) => {
	const icons = {
		love: {
			outline: 'i-heroicons-heart',
			solid: 'i-heroicons-heart-solid',
		},
		like: {
			outline: 'i-heroicons-hand-thumb-up',
			solid: 'i-heroicons-hand-thumb-up-solid',
		},
		idea: {
			outline: 'i-heroicons-light-bulb',
			solid: 'i-heroicons-light-bulb-solid',
		},
		dislike: {
			outline: 'i-heroicons-hand-thumb-down',
			solid: 'i-heroicons-hand-thumb-down-solid',
		},
		question: {
			outline: 'i-heroicons-question-mark-circle',
			solid: 'i-heroicons-question-mark-circle-solid',
		},
	};
	return isActive.value ? icons[type].solid : icons[type].outline;
};

const userList = computed(() => {
	if (!props.users.length) return '';
	console.log(props.users);
	return props.users
		.map((reactUser) => {
			if (reactUser?.id === user.value?.id) {
				return 'You';
			}
			return `${reactUser?.first_name} ${reactUser?.last_name}`;
		})
		.join('\n');
});

const count = ref(props.users.length);

// Animate count changes
watch(
	() => props.users.length,
	(newCount, oldCount) => {
		if (newCount === oldCount) return;

		const direction = newCount > oldCount ? 1 : -1;
		const element = countRef.value;

		gsap.fromTo(
			element,
			{ y: -10 * direction, opacity: 0 },
			{
				y: 0,
				opacity: 1,
				duration: 0.3,
				ease: 'back.out(1.7)',
				onStart: () => {
					count.value = newCount;
				},
			},
		);
	},
);

const countRef = ref(null);

const checkUserReaction = async () => {
	if (!user.value) return;

	try {
		const existingReaction = await readItems('reactions', {
			filter: {
				item: { _eq: props.itemId },
				user: { _eq: user.value.id },
				reaction: { _eq: props.reaction },
			},
		});

		isActive.value = existingReaction && existingReaction.length > 0;
	} catch (error) {
		console.error('Error checking reaction status:', error);
	}
};

onMounted(() => {
	checkUserReaction();
});

watch(
	() => user.value?.id,
	(newUserId) => {
		if (newUserId) {
			checkUserReaction();
		} else {
			isActive.value = false;
		}
	},
);
</script>

<template>
	<UPopover mode="hover" :disabled="!userList || userList.length === 0">
		<UButton
			:icon="getReactionIcon(reaction)"
			:color="isActive ? 'primary' : 'gray'"
			variant="soft"
			size="xs"
			:class="isActive ? 'text-[var(--cyan)] fill-[var(--cyan)]' : ''"
			:ui="{
				icon: {
					base: isActive ? 'w-4 h-4 flex-shrink-0 text-[var(--cyan)]' : 'w-4 h-4 flex-shrink-0',
					transform: isActive ? 'scale-150' : 'scale-100',
					transition: 'transform duration-200',
					color: isActive ? 'ghost' : 'gray',
				},
			}"
			@click="toggleReaction"
		>
			<span ref="countRef" class="inline-block">{{ count }}</span>
		</UButton>

		<template #panel>
			<div class="p-2 max-w-xs text-xs whitespace-pre-line">
				{{ userList }}
			</div>
		</template>
	</UPopover>
</template>
<style>
.bounce-enter-active {
	animation: bounce-in 0.3s;
}
.bounce-leave-active {
	animation: bounce-in 0.3s reverse;
}
@keyframes bounce-in {
	0% {
		transform: scale(0);
	}
	50% {
		transform: scale(1.2);
	}
	100% {
		transform: scale(1);
	}
}
</style>
