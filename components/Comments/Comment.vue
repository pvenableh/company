<template>
	<div class="relative flex flex-col gap-2" :class="`depth-${depth}`">
		<!-- Reply Context -->
		<div v-if="replyingTo" class="flex items-center gap-2 text-[10px] p-1 bg-gray-50 dark:bg-gray-900 rounded-lg">
			<span class="text-gray-500">Replying to {{ replyingTo.comments_id.user?.first_name }}'s comment:</span>
			<p class="font-medium truncate flex-1 italic">"{{ sanitizedComment }}"</p>
			<UButton size="xs" variant="ghost" icon="i-heroicons-x-mark" @click="$emit('cancel')" />
		</div>

		<!-- Comment Input -->
		<div class="flex gap-2">
			<div class="flex-grow">
				<FormTiptap v-model="editorContent" :disabled="loading" @mention="handleMention" @keydown="handleKeydown" />
				<UButton
					v-if="comment?.user?.id === user?.id"
					size="xs"
					color="red"
					variant="ghost"
					icon="i-heroicons-trash"
					class="absolute top-2 right-2"
					:loading="deleteLoading"
					@click="handleDelete"
				/>
			</div>

			<!-- Submit Button -->
			<UButton
				v-if="depth < 4"
				color="primary"
				:loading="loading"
				@click="handleSubmit"
				:disabled="!editorContent.trim()"
			>
				{{ replyingTo ? 'Reply' : 'Post' }}
			</UButton>
		</div>

		<p class="text-[10px] text-gray-500 mt-1">Press @ to mention someone • Ctrl/Cmd + Enter to submit</p>
	</div>
</template>

<script setup>
import { useNotifications } from '~/composables/useNotifications';

const props = defineProps({
	replyingTo: {
		type: Object,
		default: null,
	},
	loading: {
		type: Boolean,
		default: false,
	},
	depth: {
		type: Number,
		default: 0,
	},
	comment: {
		type: Object,
		default: null,
	},
	refreshFn: {
		type: Function,
		required: true,
	},
});

console.log(props.comment);

const { deleteItem } = useDirectusItems();
const emit = defineEmits(['submit', 'cancel', 'deleted']);
const editorContent = ref('');
const deleteLoading = ref(false);
const { user } = useDirectusAuth();
const { notify } = useNotifications();
const mentionedUsers = ref(new Set());

const sanitizedComment = computed(() => {
	if (!props.replyingTo?.comments_id?.comment) return '';
	const div = document.createElement('div');
	div.innerHTML = props.replyingTo.comments_id.comment;
	const text = div.textContent || div.innerText;
	return text.length > 50 ? text.substring(0, 50) + '...' : text;
});

async function handleDelete() {
	try {
		deleteLoading.value = true;
		await deleteItem('comments', props.comment.id);
		emit('deleted', props.comment.id);
		if (props.refreshFn) {
			await props.refreshFn();
		}
	} catch (error) {
		console.error('Error deleting comment:', error);
	} finally {
		deleteLoading.value = false;
	}
}

const handleMention = (mentionData) => {
	mentionedUsers.value.add(mentionData.id);
};

async function notifyMentionedUsers(commentText, collection, itemId) {
	for (const userId of mentionedUsers.value) {
		await notify({
			recipient: userId,
			subject: 'You were mentioned in a comment',
			message: `${user.value.first_name} ${user.value.last_name} mentioned you in a comment: ${commentText}`,
			collection,
			item: itemId,
		});
	}
}

async function notifyReply(parentUserId, commentText, collection, itemId) {
	if (parentUserId !== user.value.id) {
		await notify({
			recipient: parentUserId,
			subject: 'New reply to your comment',
			message: `${user.value.first_name} ${user.value.last_name} replied to your comment: ${commentText}`,
			collection,
			item: itemId,
		});
	}
}

async function handleSubmit() {
	if (!editorContent.value.trim()) return;

	// Send notifications for mentions
	if (mentionedUsers.value.size > 0) {
		await notifyMentionedUsers(
			editorContent.value,
			props.replyingTo?.collection || 'comments',
			props.replyingTo?.item || props.replyingTo?.comments_id?.id,
		);
	}

	// Send notification for reply
	if (props.replyingTo) {
		const parentUserId = props.replyingTo.comments_id.user?.id;
		await notifyReply(parentUserId, editorContent.value, props.replyingTo.collection, props.replyingTo.item);
	}

	emit('submit', editorContent.value);
	editorContent.value = '';
	mentionedUsers.value.clear();
}

function handleKeydown(event) {
	if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
		event.preventDefault();
		handleSubmit();
	} else if (event.key === 'Escape') {
		event.preventDefault();
		emit('cancel');
	}
}
</script>

<style>
/* Depth-based Indentation */
.depth-0 {
	margin-left: 0;
}
.depth-1 {
	margin-left: 2rem;
}
.depth-2 {
	margin-left: 4rem;
}
.depth-3 {
	margin-left: 6rem;
}
.depth-4 {
	margin-left: 8rem;
}

/* Responsive Indentation */
@media (max-width: 768px) {
	.depth-1 {
		margin-left: 1rem;
	}
	.depth-2 {
		margin-left: 2rem;
	}
	.depth-3 {
		margin-left: 3rem;
	}
	.depth-4 {
		margin-left: 4rem;
	}
}
</style>
