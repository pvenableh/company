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
		love: 'i-heroicons-heart',
		like: 'i-heroicons-hand-thumb-up',
		idea: 'i-heroicons-light-bulb',
		dislike: 'i-heroicons-hand-thumb-down',
		question: 'i-heroicons-question-mark-circle',
	};
	return icons[type];
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
</script>

<template>
	<UPopover :popper="{ placement: 'top' }" mode="hover" :disabled="!userList || userList.length === 0">
		<UButton
			:icon="getReactionIcon(reaction)"
			:color="isActive ? 'primary' : 'gray'"
			variant="soft"
			size="xs"
			:class="isActive ? 'text-cyan-500 fill-cyan-500' : ''"
			:ui="{
				icon: {
					base: isActive ? 'w-4 h-4 flex-shrink-0 text-turqoise-500' : 'w-4 h-4 flex-shrink-0',
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
