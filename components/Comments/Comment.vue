<script setup>
const props = defineProps({
	comment: {
		type: Object,
		required: true,
	},
	depth: {
		type: Number,
		default: 0,
	},
});

const emit = defineEmits(['reply']);
const maxDepth = 4;
const config = useRuntimeConfig();
const showReplies = ref(true);

function handleReply() {
	emit('reply', props.comment);
}

const hasReplies = computed(() => {
	return props.comment.replies && props.comment.replies.length > 0;
});

const repliesCount = computed(() => {
	let count = 0;
	const countReplies = (comment) => {
		count += 1;
		comment.replies?.forEach(countReplies);
	};
	props.comment.replies.forEach(countReplies);
	return count;
});

const formattedDate = computed(() => {
	return new Date(props.comment.comments_id.date_created).toLocaleString();
});

function toggleReplies() {
	showReplies.value = !showReplies.value;
}
</script>

<template>
	<div class="comment-group">
		<!-- Main comment -->
		<div class="comment-thread" :class="{ [`depth-${depth}`]: true }">
			<div class="flex gap-3">
				<UAvatar
					:src="
						comment.comments_id.user?.avatar
							? `${config.public.directusUrl}/assets/${comment.comments_id.user.avatar}`
							: null
					"
					:alt="comment.comments_id.user?.first_name"
					size="sm"
				/>

				<div class="flex-grow">
					<div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
						<div class="flex items-center gap-2 mb-1">
							<span class="font-medium text-sm">
								{{ comment.comments_id.user?.first_name }} {{ comment.comments_id.user?.last_name }}
							</span>
							<span class="text-xs text-gray-500">
								{{ formattedDate }}
							</span>
						</div>
						<p class="text-sm">{{ comment.comments_id.comment }}</p>
					</div>

					<div class="flex gap-2 mt-1 items-center">
						<ReactionsBar :item-id="String(comment.comments_id.id)" collection="comments" />
						<UButton v-if="depth < maxDepth" variant="ghost" size="xs" @click="handleReply">Reply</UButton>
						<UButton v-if="hasReplies" variant="ghost" size="xs" class="ml-auto" @click="toggleReplies">
							<span class="flex items-center gap-1">
								<UIcon :name="showReplies ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'" class="w-4 h-4" />
								{{ repliesCount }} {{ repliesCount === 1 ? 'reply' : 'replies' }}
							</span>
						</UButton>
					</div>
				</div>
			</div>
		</div>

		<!-- Replies -->
		<Transition
			enter-active-class="transition-all duration-300 ease-out"
			enter-from-class="opacity-0 max-h-0"
			enter-to-class="opacity-100 max-h-[1000px]"
			leave-active-class="transition-all duration-200 ease-in"
			leave-from-class="opacity-100 max-h-[1000px]"
			leave-to-class="opacity-0 max-h-0"
		>
			<div
				v-if="hasReplies && showReplies"
				class="replies-wrapper ml-4 pl-4 mt-3 border-l-2 border-gray-200 dark:border-gray-700 overflow-hidden"
			>
				<CommentsComment
					v-for="reply in comment.replies"
					:key="reply.id"
					:comment="reply"
					:depth="depth + 1"
					@reply="$emit('reply', $event)"
				/>
			</div>
		</Transition>

		<!-- Collapsed replies indicator -->
		<!-- <div
			v-if="hasReplies && !showReplies"
			class="mt-2 ml-4 text-sm text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300"
			@click="toggleReplies"
		>
			<span class="flex items-center gap-1">
				<UIcon name="i-heroicons-chat-bubble-left-ellipsis" class="w-4 h-4" />
				Show {{ repliesCount }} {{ repliesCount === 1 ? 'reply' : 'replies' }}
			</span>
		</div> -->
	</div>
</template>

<style scoped>
.comment-group {
	margin-bottom: 1rem;
}

.comment-thread {
	margin-bottom: 0.5rem;
}

.depth-0 {
	margin-left: 0;
}
.depth-1 {
	margin-left: 0.5rem;
}
.depth-2 {
	margin-left: 1rem;
}
.depth-3 {
	margin-left: 1.5rem;
}
.depth-4 {
	margin-left: 2rem;
}

.replies-wrapper {
	position: relative;
	transition: border-color 0.2s ease;
}

.replies-wrapper:hover {
	border-color: var(--color-primary-500);
}

@media (max-width: 768px) {
	.replies-wrapper {
		margin-left: 0.5rem;
		padding-left: 0.5rem;
	}

	.depth-1,
	.depth-2,
	.depth-3,
	.depth-4 {
		margin-left: 0;
	}
}
</style>
