<template>
	<div class="relative comments-system">
		<transition name="fade">
			<div
				v-if="isLoading"
				class="absolute inset-0 bg-white/70 dark:bg-gray-800/70 z-50 flex items-center justify-center"
			>
				<LayoutLoader text="Loading Comments" />
			</div>
		</transition>

		<transition name="fade">
			<div v-if="!isConnected && !isLoading" class="mb-4 absolute right-0 top-0 comments-system__connection">
				<UAlert title="Connection Lost" description="Attempting to reconnect..." color="yellow">
					<template #footer>
						<UButton size="sm" color="yellow" @click="refreshData">Retry Connection</UButton>
					</template>
				</UAlert>
			</div>
		</transition>

		<div class="w-full flex items-center justify-between gap-2 text-xs relative">
			<h4 class="cursor-pointer uppercase block font-medium text-gray-700 dark:text-gray-200 tracking-wide">
				<transition name="fade" mode="out-in">
					<span v-if="isLoading">Loading</span>
					<span v-else>{{ commentsCount }}</span>
				</transition>
				{{ commentsCount === 1 ? 'Comment' : 'Comments' }}
			</h4>
			<h5
				class="cursor-pointer uppercase tracking-wide text-[9px] inline-block"
				@click="toggleComment = !toggleComment"
			>
				{{ !toggleComment ? 'Add Comment' : 'Hide' }}
			</h5>
		</div>

		<div class="mt-2 space-y-4">
			<CommentsComment
				v-if="user && toggleComment"
				:loading="isSubmitting"
				:refresh="refreshData"
				@submit="(content) => handleCommentSubmit(content)"
				:organization-id="organizationId"
			/>
			<div class="w-full flex items-start justify-start">
				<USelect
					v-model="sortOrder"
					:options="[
						{ label: 'NEWEST FIRST', value: 'newest' },
						{ label: 'OLDEST FIRST', value: 'oldest' },
					]"
					color="white"
					size="xs"
					class="w-22 relative"
					:ui="{
						rounded: 'rounded-sm',
						variant: {
							outline: ' ring-0',
						},
						color: {
							white: {
								outline: 'py-0.5 ring-0 border border-gray-300  text-[9px]',
							},
						},
					}"
				/>
			</div>
			<TransitionGroup name="comments" tag="div" class="space-y-4">
				<CommentsThread
					v-for="comment in sortedComments"
					:key="comment.id"
					:depth="0"
					:comment="comment"
					:loading="isLoading"
					:is-active="activeCommentId === comment.id"
					:refresh="refreshData"
					@reply="handleReply"
					@submit="handleCommentSubmit"
					@cancel="cancelReply"
					@delete="handleDelete"
					:organization-id="organizationId"
				/>
			</TransitionGroup>
		</div>
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

const isLoading = ref(true);
const isSubmitting = ref(false);
const isConnected = ref(true);
const error = ref(null);

const toggleComment = ref(false);

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
	isLoading: wsLoading,
	isConnected: wsConnected,
	error: wsError,
	refresh: wsRefresh,
	connect,
	disconnect,
} = useRealtimeSubscription('comments', fields, filter.value, '-date_created');

watch(wsLoading, (val) => (isLoading.value = val));
watch(wsConnected, (val) => (isConnected.value = val));
watch(wsError, (val) => (error.value = val));

watch(
	rawComments,
	(newComments) => {
		if (!newComments) {
			localComments.value = [];
			return;
		}
		localComments.value = [...newComments];
		isInitialized.value = true;
		isLoading.value = false;
	},
	{ deep: true, immediate: true },
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
	const sortByDate = (comments, order) => {
		return comments
			.sort((a, b) => {
				const dateA = new Date(a.date_created);
				const dateB = new Date(b.date_created);
				return order === 'newest' ? dateB - dateA : dateA - dateB;
			})
			.map((comment) => {
				if (comment.replies?.length) {
					comment.replies = sortByDate(comment.replies, order);
				}
				return comment;
			});
	};
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
	isSubmitting.value = true;
	try {
		const effectiveParentId = parentId || replyingTo.value?.id || null;
		const comment = await createItem('comments', {
			status: 'published',
			comment: commentHtml,
			user: user.value.id,
			parent_id: effectiveParentId ? effectiveParentId.toString() : null,
			collection: props.collection,
			item: props.itemId.toString(),
			[collectionIdField]: props.itemId.toString(),
		});

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
		refreshData();
	} catch (error) {
		console.error('Error posting comment:', error);
		refreshData();
	} finally {
		isSubmitting.value = false;
	}
}

function handleReply(comment) {
	replyingTo.value = comment;
	activeCommentId.value = comment.id;
}

async function handleDelete(commentId) {
	try {
		await deleteItem('comments', commentId);
		refreshData();
	} catch (error) {
		console.error('Error deleting comment:', error);
	}
}

function cancelReply() {
	replyingTo.value = null;
	activeCommentId.value = null;
}

const refreshData = async () => {
	isLoading.value = true;
	try {
		await wsRefresh();
	} catch (err) {
		console.error('Error refreshing comments:', err);
	} finally {
		isLoading.value = false;
	}
};

onMounted(() => {
	connect();
});

onUnmounted(() => {
	disconnect();
});
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
