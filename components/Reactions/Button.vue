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
const { createItem, deleteItems } = useDirectusItems();
const { user } = useDirectusAuth();
const emits = defineEmits(['reaction-added', 'reaction-removed']);

const isActive = ref(props.active);
const reactionCount = ref(props.count);

const toggleReaction = async () => {
	console.log({
		item_id: props.itemId,
		collection: props.collection,
		user_id: user.value.id,
		reaction_type: props.reaction,
	});
	try {
		if (isActive.value) {
			await deleteItems('reactions', {
				filter: {
					item: { _eq: props.itemId },
					user: { _eq: user.value.id },
					reaction: { _eq: props.reaction },
				},
			});
			reactionCount.value--;
			emits('reaction-removed', props.reaction);
		} else {
			await createItem('reactions', {
				item: props.itemId,
				table: props.collection,
				user: user.value.id,
				reaction: props.reaction,
			});

			reactionCount.value++;
			emits('reaction-added', props.reaction);
		}
		isActive.value = !isActive.value;
	} catch (error) {
		console.error('Error toggling reaction:', error);
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
