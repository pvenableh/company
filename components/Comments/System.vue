<template>
	<div class="comments-system">
		<!-- Comments Toggle Button -->
		<div class="w-full flex items-center justify-between gap-2 text-sm relative">
			<h4
				@click="showComments = !showComments"
				class="cursor-pointer uppercase block font-medium text-gray-700 dark:text-gray-200 tracking-wider"
			>
				<transition name="fade" mode="out-in">
					<span v-if="isLoading">Loading</span>
					<span v-else>{{ commentsCount }}</span>
				</transition>
				{{ commentsCount === 1 ? 'Comment' : 'Comments' }}
				<UIcon :name="showComments ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" />
			</h4>
			<USelect
				v-if="showComments"
				v-model="sortOrder"
				:options="[
					{ label: 'NEWEST FIRST', value: 'newest' },
					{ label: 'OLDEST FIRST', value: 'oldest' },
				]"
				size="xs"
				color="white"
				class="w-22 text-xs border-none"
				variant="outline"
				:ui="{
					rounded: 'rounded-sm',
					variant: {
						outline: 'border-none ring-0',
					},
					color: {
						white: {
							outline: 'border-none ring-0 border-b border-b-gray-300 ring-b-gray-300 text-[10px]',
						},
					},
				}"
			/>
		</div>

		<!-- Comments Section -->
		<Transition
			enter-active-class="transition duration-200 ease-out"
			enter-from-class="transform scale-95 opacity-0"
			enter-to-class="transform scale-100 opacity-100"
			leave-active-class="transition duration-200 ease-in"
			leave-from-class="transform scale-100 opacity-100"
			leave-to-class="transform scale-95 opacity-0"
		>
			<div v-if="showComments" class="mt-4 space-y-4">
				<!-- Main Comment Input -->
				<CommentsComment
					v-if="user"
					:loading="isLoading"
					:refresh="refresh"
					@submit="(content) => handleCommentSubmit(content)"
					:organization-id="organizationId"
				/>

				<!-- Comments List -->
				<TransitionGroup name="comments" tag="div" class="space-y-4" mo>
					<CommentsThread
						v-for="comment in sortedComments"
						:key="comment.id"
						:depth="0"
						:comment="comment"
						:loading="isLoading"
						:is-active="activeCommentId === comment.comments_id.id"
						:refresh="refresh"
						@reply="handleReply"
						@submit="handleCommentSubmit"
						@cancel="cancelReply"
						@delete="handleDelete"
						:organization-id="organizationId"
					/>
				</TransitionGroup>
			</div>
		</Transition>
	</div>
</template>

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
	showComments: {
		type: Boolean,
		default: false,
	},
	organizationId: {
		type: [String, Number],
		default: null,
	},
});

console.log(props.organizationId);

const emit = defineEmits(['update:commentCount']);

const { user } = useDirectusAuth();
const { createItem, deleteItem } = useDirectusItems();
const replyingTo = ref(null);
const activeCommentId = ref(null);
const localComments = ref([]);
const isInitialized = ref(false);
const sortOrder = ref('newest');

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

const {
	data: rawComments,
	isLoading,
	error,
	refresh,
} = useRealtimeSubscription(
	junctionTable,
	fields,
	{
		[collectionIdField]: {
			_eq: props.itemId,
		},
	},
	'-comments_id.date_created',
);

watch(
	rawComments,
	(newComments) => {
		if (!newComments) {
			localComments.value = [];
			return;
		}

		if (!isInitialized.value) {
			localComments.value = [...newComments];
			isInitialized.value = true;
		} else {
			// Always sync with remote state
			localComments.value = [...newComments];
		}
	},
	{ deep: true },
);

const comments = computed(() => {
	if (!rawComments.value) return [];

	const commentMap = new Map();
	rawComments.value.forEach((comment) => {
		if (comment?.comments_id) {
			commentMap.set(String(comment.comments_id.id), {
				...comment,
				replies: [],
			});
		}
	});

	const rootComments = [];
	rawComments.value.forEach((comment) => {
		if (!comment?.comments_id) return;

		const currentComment = commentMap.get(String(comment.comments_id.id));
		const parentId = comment.comments_id.parent_id;

		if (parentId) {
			const parentComment = commentMap.get(String(parentId));
			if (parentComment) {
				parentComment.replies = parentComment.replies || [];
				parentComment.replies.push(currentComment);
			} else {
				rootComments.push(currentComment);
			}
		} else {
			rootComments.push(currentComment);
		}
	});

	rootComments.sort((a, b) => new Date(b.comments_id.date_created) - new Date(a.comments_id.date_created));

	const sortReplies = (comment) => {
		if (comment?.replies?.length > 0) {
			comment.replies.sort((a, b) => new Date(a.comments_id.date_created) - new Date(b.comments_id.date_created));
			comment.replies.forEach(sortReplies);
		}
	};

	rootComments.forEach(sortReplies);
	return rootComments;
});

const sortedComments = computed(() => {
	const sorted = [...comments.value];

	// Helper function to recursively sort comments and their replies
	const sortByDate = (comments, order) => {
		return comments
			.sort((a, b) => {
				const dateA = new Date(a.comments_id.date_created);
				const dateB = new Date(b.comments_id.date_created);
				// Apply the same sort order to replies as parent comments
				return order === 'newest' ? dateB - dateA : dateA - dateB;
			})
			.map((comment) => {
				if (comment.replies?.length) {
					comment.replies = sortByDate(comment.replies, order);
				}
				return comment;
			});
	};

	// Sort all comments and replies using the same order
	return sortByDate(sorted, sortOrder.value);
});

const commentsCount = computed(() => {
	let total = 0;
	const countReplies = (comment) => {
		total++;
		comment.replies?.forEach(countReplies);
	};
	comments.value.forEach(countReplies);
	emit('update:commentCount', total);
	return total;
});

async function handleCommentSubmit(commentHtml, parentId = null) {
	isLoading.value = true;
	try {
		const effectiveParentId = parentId || replyingTo.value?.comments_id?.id || null;

		// Create the comment (WITHOUT item_id, item, table, or collection)
		const comment = await createItem('comments', {
			status: 'published',
			comment: commentHtml,
			user: user.value.id,
			parent_id: effectiveParentId ? effectiveParentId.toString() : null,
		});

		// Create the junction table entry (linking the comment to the item)
		const junctionRecord = await createItem(junctionTable, {
			[collectionIdField]: props.itemId.toString(), // e.g., tickets_id: '123'
			comments_id: comment.id,
		});

		// Add new comment to local state
		localComments.value = [
			...localComments.value,
			{
				id: junctionRecord.id,
				comments_id: {
					id: comment.id,
					comment: commentHtml,
					date_created: new Date().toISOString(),
					parent_id: effectiveParentId,
					user: {
						id: user.value.id,
						first_name: user.value.first_name,
						last_name: user.value.last_name,
						avatar: user.value.avatar,
					},
				},
			},
		];

		cancelReply();
		// Refresh to ensure proper order and nesting
		await refresh();
	} catch (error) {
		console.error('Error posting comment:', error);
		refresh();
	} finally {
		isLoading.value = false;
	}
}

// Update the Thread component submission handler
function handleReply(comment) {
	replyingTo.value = comment;
	activeCommentId.value = comment.comments_id.id;
}
async function handleDelete(commentId) {
	try {
		await deleteItem('comments', commentId);
		await refresh();
	} catch (error) {
		console.error('Error deleting comment:', error);
	}
}

function cancelReply() {
	replyingTo.value = null;
	activeCommentId.value = null;
}

defineExpose({ refresh });
</script>

<style>
.comment {
	a:link,
	a:visited {
		color: #0ea5e9;
		text-decoration: underline;
	}
}

.comments-enter-active,
.comments-leave-active {
	transition: all 0.15s ease;
}

.comments-enter-from,
.comments-leave-to {
	opacity: 0;
	transform: translateY(-20px);
}

.mention {
	color: #0ea5e9;
	font-weight: 500;
	text-decoration: none;
	cursor: pointer;
	padding: 0 2px;
	border-radius: 2px;
	background: rgba(14, 165, 233, 0.1);
}

.dark .mention {
	color: #7dd3fc;
	background: rgba(125, 211, 252, 0.1);
}
</style>
