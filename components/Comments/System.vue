<template>
	<div class="comments-system">
		<!-- Comments Toggle Button -->
		<div class="w-full flex items-center justify-between gap-2 text-sm relative">
			<h4
				@click="isCommentsVisible = !isCommentsVisible"
				class="cursor-pointer uppercase block font-medium text-gray-700 dark:text-gray-200 tracking-wider"
			>
				<transition name="fade" mode="out-in">
					<span v-if="isLoading">Loading</span>
					<span v-else>{{ commentsCount }}</span>
				</transition>
				{{ commentsCount === 1 ? 'Comment' : 'Comments' }}
				<UIcon :name="isCommentsVisible ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" />
			</h4>
			<USelect
				v-if="isCommentsVisible"
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
			<div v-if="isCommentsVisible" class="mt-4 space-y-4">
				<!-- Main Comment Input -->
				<CommentsComment
					v-if="user"
					:loading="isLoading"
					:refresh="refresh"
					@submit="(content) => handleCommentSubmit(content)"
					:organization-id="organizationId"
				/>

				<!-- Comments List -->
				<TransitionGroup name="comments" tag="div" class="space-y-4">
					<CommentsThread
						v-for="comment in sortedComments"
						:key="comment.id"
						:depth="0"
						:comment="comment"
						:loading="isLoading"
						:is-active="activeCommentId === comment.id"
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
	organizationId: {
		type: [String, Number],
		default: null,
	},
});

const emit = defineEmits(['update:commentCount']);

const { user } = useDirectusAuth();
const { createItem, deleteItem } = useDirectusItems();
const replyingTo = ref(null);
const activeCommentId = ref(null);
const localComments = ref([]);
const isInitialized = ref(false);
const sortOrder = ref('newest');
const isCommentsVisible = ref(false);

// Generate collection-specific field name for relation
const collectionIdField = `${props.collection}_id`;

// Fields to request from the comments collection
const fields = [
	'id',
	'comment',
	'date_created',
	'parent_id',
	'collection',
	'item',
	`${collectionIdField}`,
	'user.id',
	'user.first_name',
	'user.last_name',
	'user.avatar',
	'reactions.id',
	'reactions.users_id.id',
];

// Filter for comments related to this specific item
const filter = computed(() => ({
	_and: [{ collection: { _eq: props.collection } }, { item: { _eq: props.itemId } }],
}));

// Subscribe to comments for this item
const {
	data: rawComments,
	isLoading,
	error,
	refresh,
} = useRealtimeSubscription('comments', fields, filter.value, '-date_created');

watch(
	rawComments,
	(newComments) => {
		if (!newComments) {
			localComments.value = [];
			return;
		}

		// For simplicity, just replace the entire array
		// This avoids complex logic that might introduce bugs
		localComments.value = [...newComments];
		isInitialized.value = true;
	},
	{ deep: true },
);

const comments = computed(() => {
	if (!rawComments.value) return [];

	const commentMap = new Map();
	rawComments.value.forEach((comment) => {
		if (comment) {
			commentMap.set(String(comment.id), {
				...comment,
				replies: [],
			});
		}
	});

	const rootComments = [];
	rawComments.value.forEach((comment) => {
		if (!comment) return;

		const currentComment = commentMap.get(String(comment.id));
		const parentId = comment.parent_id;

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

	rootComments.sort((a, b) => new Date(b.date_created) - new Date(a.date_created));

	const sortReplies = (comment) => {
		if (comment?.replies?.length > 0) {
			comment.replies.sort((a, b) => new Date(a.date_created) - new Date(b.date_created));
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
				const dateA = new Date(a.date_created);
				const dateB = new Date(b.date_created);
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
		const effectiveParentId = parentId || replyingTo.value?.id || null;

		// Create the comment with direct references to item and collection
		const comment = await createItem('comments', {
			status: 'published',
			comment: commentHtml,
			user: user.value.id,
			parent_id: effectiveParentId ? effectiveParentId.toString() : null,
			// Add the direct references
			collection: props.collection,
			item: props.itemId.toString(),
			// Add the dynamic field specific to this collection (e.g. tickets_id, projects_id)
			[collectionIdField]: props.itemId.toString(),
		});

		// Add new comment to local state
		localComments.value = [
			...localComments.value,
			{
				id: comment.id,
				comment: commentHtml,
				date_created: new Date().toISOString(),
				parent_id: effectiveParentId,
				collection: props.collection,
				item: props.itemId.toString(),
				[collectionIdField]: props.itemId.toString(),
				user: {
					id: user.value.id,
					first_name: user.value.first_name,
					last_name: user.value.last_name,
					avatar: user.value.avatar,
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
	activeCommentId.value = comment.id;
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
