<script setup>
import { useRealtimeSubscription } from './composables/useRealtimeSubscription';

const props = defineProps({
	parentId: {
		type: String,
		required: true,
	},
	collection: {
		type: String,
		required: true,
	},
});

const { user } = useDirectusAuth();
const { updateItem, deleteItems } = useDirectusItems();
const showComments = ref(true);
const editingCommentId = ref(null);

// Use the realtime subscription
const { data: comments } = useRealtimeSubscription(
	`${props.collection}_comments`,
	['id', 'comments_id.*', 'comments_id.user.*'],
	{
		[`${props.collection}_id`]: {
			_eq: props.parentId,
		},
	},
	'-comments_id.date_created',
);

const commentsTotal = computed(() => comments.value.length);

const deleteComment = async (commentId) => {
	try {
		// Delete the junction first
		await deleteItems(`${props.collection}_comments`, commentId);
		// Then delete the actual comment
		await deleteItems('comments', commentId);
	} catch (error) {
		console.error('Error deleting comment:', error);
	}
};

const startEditing = (commentId) => {
	editingCommentId.value = commentId;
};

const cancelEditing = () => {
	editingCommentId.value = null;
};

const updateComment = async (commentId, newContent) => {
	try {
		await updateItem('comments', commentId, {
			comment: newContent,
		});
		editingCommentId.value = null;
	} catch (error) {
		console.error('Error updating comment:', error);
	}
};
</script>

<template>
	<div class="comments-system w-full">
		<div class="comments-header flex justify-between items-center mb-4">
			<h3 class="text-lg font-semibold">Comments ({{ commentsTotal }})</h3>
			<UToggle
				v-model="showComments"
				color="gray"
				:on-icon="{ icon: 'i-heroicons-chat-bubble-left-right-solid' }"
				:off-icon="{ icon: 'i-heroicons-x-mark-20-solid' }"
			/>
		</div>

		<TransitionGroup v-if="showComments" name="comment" tag="div" class="comments-list space-y-4">
			<CommentCreate :key="'create'" :parent-id="parentId" :collection="collection" class="mb-6" />

			<CommentsComment
				v-for="comment in comments"
				:key="comment.id"
				:comment="comment"
				:is-editing="editingCommentId === comment.comments_id.id"
				:current-user="user"
				@edit="startEditing"
				@cancel-edit="cancelEditing"
				@update="updateComment"
				@delete="deleteComment"
			/>
		</TransitionGroup>
	</div>
</template>

<style scoped>
.comment-enter-active,
.comment-leave-active {
	transition: all 0.3s ease;
}

.comment-enter-from,
.comment-leave-to {
	opacity: 0;
	transform: translateY(30px);
}
</style>
