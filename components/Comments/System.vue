<script setup>
import { useRealtimeSubscription } from '~/composables/useRealtimeSubscription';

const props = defineProps({
	itemId: {
		type: [String, Number],
		required: true,
	},
	collection: {
		type: String,
		required: true,
	},
});

const { user } = useDirectusAuth();
const newComment = ref('');
const showComments = ref(false);
const isLoading = ref(false);
const replyingTo = ref(null);

const junctionTable = `${props.collection}_comments`;
const collectionIdField = `${props.collection}_id`;

const fields = [
	'id',
	'comments_id.id',
	'comments_id.comment',
	'comments_id.date_created',
	'comments_id.parent_id',
	'comments_id.user.id',
	'comments_id.user.first_name',
	'comments_id.user.last_name',
	'comments_id.user.avatar',
	'comments_id.reactions.id',
	'comments_id.reactions.users_id.id',
];

const { data: rawComments } = useRealtimeSubscription(
	junctionTable,
	fields,
	{
		[collectionIdField]: {
			_eq: props.itemId,
		},
	},
	'-comments_id.date_created',
);

const comments = computed(() => {
	if (!rawComments.value) return [];

	const commentMap = new Map();
	rawComments.value.forEach((comment) => {
		commentMap.set(String(comment.comments_id.id), {
			...comment,
			replies: [],
		});
	});

	const rootComments = [];
	rawComments.value.forEach((comment) => {
		const currentComment = commentMap.get(String(comment.comments_id.id));
		const parentId = comment.comments_id.parent_id;

		if (parentId) {
			const parentComment = commentMap.get(String(parentId));
			if (parentComment) {
				parentComment.replies.push(currentComment);
			} else {
				rootComments.push(currentComment);
			}
		} else {
			rootComments.push(currentComment);
		}
	});

	// Sort root comments newest first
	rootComments.sort((a, b) => {
		return new Date(b.comments_id.date_created) - new Date(a.comments_id.date_created);
	});

	// Sort replies oldest first
	const sortReplies = (comment) => {
		if (comment.replies && comment.replies.length > 0) {
			comment.replies.sort((a, b) => {
				return new Date(a.comments_id.date_created) - new Date(b.comments_id.date_created);
			});
			comment.replies.forEach(sortReplies);
		}
	};

	rootComments.forEach(sortReplies);
	return rootComments;
});

const commentsCount = computed(() => {
	let total = 0;
	const countReplies = (comment) => {
		total += 1;
		comment.replies?.forEach(countReplies);
	};
	comments.value.forEach(countReplies);
	return total;
});

function handleReply(comment) {
	replyingTo.value = comment;
	// Automatically show comments when replying
	showComments.value = true;
}

function cancelReply() {
	replyingTo.value = null;
	newComment.value = '';
}

async function postComment() {
	if (!newComment.value.trim()) return;
	isLoading.value = true;

	try {
		const comment = await useDirectus(
			createItem('comments', {
				comment: newComment.value,
				user: user.value.id,
				parent_id: replyingTo.value?.comments_id?.id?.toString() || null,
			}),
		);

		await useDirectus(
			createItem(junctionTable, {
				[collectionIdField]: props.itemId.toString(),
				comments_id: comment.id,
			}),
		);

		newComment.value = '';
		replyingTo.value = null;
	} catch (error) {
		console.error('Error posting comment:', error);
	} finally {
		isLoading.value = false;
	}
}
</script>

<template>
	<div class="comments-system">
		<div class="flex items-center gap-2 text-sm">
			<UButton
				variant="ghost"
				:icon="showComments ? 'i-heroicons-chat-bubble-left-right' : 'i-heroicons-chat-bubble-left'"
				@click="showComments = !showComments"
				class="relative"
			>
				{{ commentsCount }} {{ commentsCount === 1 ? 'Comment' : 'Comments' }}
				<UBadge v-if="replyingTo && !showComments" color="primary" class="absolute -top-1 -right-1" size="xs">1</UBadge>
			</UButton>
		</div>

		<Transition
			enter-active-class="transition duration-200 ease-out"
			enter-from-class="transform scale-95 opacity-0"
			enter-to-class="transform scale-100 opacity-100"
			leave-active-class="transition duration-200 ease-in"
			leave-from-class="transform scale-100 opacity-100"
			leave-to-class="transform scale-95 opacity-0"
		>
			<div v-if="showComments" class="mt-4 space-y-4">
				<div v-if="user" class="flex flex-col gap-2">
					<div v-if="replyingTo" class="flex items-center gap-2 text-sm p-2 bg-gray-50 dark:bg-gray-900 rounded-lg">
						<span class="text-gray-500">Replying to {{ replyingTo.comments_id.user?.first_name }}'s comment:</span>
						<p class="text-sm font-medium truncate flex-1">"{{ replyingTo.comments_id.comment }}"</p>
						<UButton size="xs" variant="ghost" icon="i-heroicons-x-mark" @click="cancelReply" />
					</div>

					<div class="flex gap-2">
						<UTextarea
							v-model="newComment"
							:placeholder="replyingTo ? 'Write a reply...' : 'Write a comment...'"
							:rows="1"
							class="flex-grow"
							@keydown.enter.exact.prevent="postComment"
							@keydown.esc="cancelReply"
						/>
						<UButton color="primary" :loading="isLoading" @click="postComment" :disabled="!newComment.trim()">
							{{ replyingTo ? 'Reply' : 'Post' }}
						</UButton>
					</div>
				</div>

				<TransitionGroup name="comments" tag="div" class="space-y-4">
					<CommentsComment
						v-for="comment in comments"
						:key="comment.id"
						:comment="comment"
						:depth="0"
						@reply="handleReply"
					/>
				</TransitionGroup>

				<div v-if="!comments.length" class="text-center text-sm text-gray-500 py-4">
					No comments yet. Be the first to comment!
				</div>
			</div>
		</Transition>
	</div>
</template>

<style scoped>
.comments-enter-active,
.comments-leave-active {
	transition: all 0.3s ease;
}
.comments-enter-from,
.comments-leave-to {
	opacity: 0;
	transform: translateX(-20px);
}
</style>
