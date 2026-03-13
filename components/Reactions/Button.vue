<script setup>
import { gsap } from 'gsap';
import { getReactionIcon } from '~/types/reactions';

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

const reactionItems = useDirectusItems('reactions');
const { user } = useDirectusAuth();
const emits = defineEmits(['reaction-added', 'reaction-removed']);
const toast = useToast();

const isActive = ref(props.active);
const countRef = ref(null);
const localCount = ref(props.users.length);
const isToggling = ref(false);

const animateCountChange = (newCount) => {
	const direction = newCount > localCount.value ? 1 : -1;
	const element = countRef.value;

	if (element) {
		gsap.fromTo(
			element,
			{ y: -10 * direction, opacity: 0 },
			{
				y: 0,
				opacity: 1,
				duration: 0.3,
				ease: 'back.out(1.7)',
				// onComplete: () => {
				// 	localCount.value = newCount;
				// },
				onStart: () => {
					localCount.value = newCount;
				},
			},
		);
	} else {
		localCount.value = newCount;
	}
};

// Also watch the active prop
watch(
	() => props.active,
	(newActive) => {
		isActive.value = newActive;
	},
);

watch(
	() => props.users.length,
	(newLength, oldLength) => {
		if (newLength !== oldLength) {
			animateCountChange(newLength);
		}
	},
);

const toggleReaction = async () => {
	if (!user.value || isToggling.value) return;
	isToggling.value = true;

	try {
		// First check if user already has a reaction of this type
		const existingReaction = await reactionItems.list({
			filter: {
				item: { _eq: props.itemId },
				user: { _eq: user.value.id },
				reaction: { _eq: props.reaction },
			},
		});

		const hasThisReaction = existingReaction && existingReaction.length > 0;

		// If they have this reaction, remove it (toggle off)
		if (hasThisReaction) {
			await reactionItems.remove(existingReaction[0].id);

			isActive.value = false;
			emits('reaction-removed', props.reaction);
		}
		// Otherwise, remove any other reactions from this user first, then add new one
		else {
			const userReactions = await reactionItems.list({
				filter: {
					item: { _eq: props.itemId },
					user: { _eq: user.value.id },
				},
			});

			// Remove each existing reaction by ID
			for (const r of userReactions) {
				await reactionItems.remove(r.id);
			}

			// Then add the new reaction
			await reactionItems.create({
				item: props.itemId,
				table: props.collection,
				user: user.value.id,
				reaction: props.reaction,
			});

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
	} finally {
		isToggling.value = false;
	}
};

const reactionIconName = computed(() => getReactionIcon(props.reaction, isActive.value));

const userList = computed(() => {
	if (!props.users.length) return '';
	return props.users
		.map((reactUser) => {
			if (reactUser?.id === user.value?.id) {
				return 'You';
			}
			return `${reactUser?.first_name} ${reactUser?.last_name}`;
		})
		.join('\n');
});

</script>

<template>
	<div class="group/reaction relative inline-flex">
		<div
			class="flex items-center justify-center gap-1 h-full px-1 min-w-[35px] text-center text-xs"
			@click="!isToggling && toggleReaction()"
			:class="[
				isActive ? 'text-[var(--cyan)] fill-[var(--cyan)]' : 'text-muted-foreground',
				isToggling ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50 rounded transition-colors',
			]"
		>
			<UIcon :name="reactionIconName" />
			<span ref="countRef" class="inline-block">{{ localCount }}</span>
		</div>

		<!-- Pure CSS hover tooltip — works universally -->
		<div
			v-if="userList"
			class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/reaction:block z-50 bg-popover text-popover-foreground text-xs rounded-md shadow-lg border border-border px-2.5 py-1.5 whitespace-pre-line min-w-max max-w-[200px] pointer-events-none"
		>
			{{ userList }}
			<div class="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-border" />
		</div>
	</div>
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
