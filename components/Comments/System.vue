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
const showComments = ref(false);
const isLoading = ref(false);
const replyingTo = ref(null);
const activeCommentId = ref(null);
const { createItem } = useDirectusItems();

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

async function handleCommentSubmit(commentHtml) {
	isLoading.value = true;

	try {
		const comment = await createItem('comments', {
			comment: commentHtml,
			user: user.value.id,
			parent_id: replyingTo.value?.comments_id?.id?.toString() || null,
		});

		await createItem(junctionTable, {
			[collectionIdField]: props.itemId.toString(),
			comments_id: comment.id,
		});

		cancelReply();
	} catch (error) {
		console.error('Error posting comment:', error);
	} finally {
		isLoading.value = false;
	}
}

function cancelReply() {
	replyingTo.value = null;
	activeCommentId.value = null;
}

const commentsCount = computed(() => {
	let total = 0;
	const countReplies = (comment) => {
		total += 1;
		comment.replies?.forEach(countReplies);
	};
	comments.value.forEach(countReplies);
	return total;
});
</script>

<template>
	<div class="comments-system">
		<div class="flex items-center gap-2 text-sm">
			<UButton
				variant="ghost"
				:icon="showComments ? 'i-heroicons-chat-bubble-left-right' : 'i-heroicons-chat-bubble-left'"
				@click="showComments = !showComments"
			>
				{{ commentsCount }} {{ commentsCount === 1 ? 'Comment' : 'Comments' }}
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
				<!-- Main comment input -->
				<div v-if="user && !replyingTo">
					<CommentsComment :loading="isLoading" :depth="0" @submit="handleCommentSubmit" />
				</div>

				<!-- Comments list -->
				<TransitionGroup name="comments" tag="div" class="space-y-4">
					<template v-for="comment in comments" :key="comment.id">
						<div class="comment-thread">
							<!-- Comment content -->
							<div class="flex gap-3">
								<UAvatar
									:src="
										comment.comments_id.user?.avatar
											? `${useRuntimeConfig().public.directusUrl}/assets/${comment.comments_id.user.avatar}`
											: null
									"
									:alt="comment.comments_id.user?.first_name"
									size="sm"
								/>

								<div class="flex-grow">
									<div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
										<div class="flex items-center gap-2 mb-1">
											<span class="font-medium text-sm">
												{{ comment.comments_id.user?.first_name }}
												{{ comment.comments_id.user?.last_name }}
											</span>
											<span class="text-xs text-gray-500">
												{{ new Date(comment.comments_id.date_created).toLocaleString() }}
											</span>
										</div>
										<div class="text-sm" v-html="comment.comments_id.comment" />
									</div>

									<div class="flex gap-2 mt-1">
										<ReactionsBar :item-id="String(comment.comments_id.id)" collection="comments" />
										<UButton
											variant="ghost"
											size="xs"
											@click="
												() => {
													replyingTo = comment;
													activeCommentId = comment.comments_id.id;
												}
											"
										>
											Reply
										</UButton>
									</div>

									<!-- Reply input -->
									<div v-if="activeCommentId === comment.comments_id.id" class="mt-2">
										<CommentsComment
											:replying-to="replyingTo"
											:loading="isLoading"
											:depth="1"
											@submit="handleCommentSubmit"
											@cancel="cancelReply"
										/>
									</div>

									<!-- Nested replies -->
									<div
										v-if="comment.replies?.length"
										class="mt-3 space-y-3 border-l-2 border-gray-200 dark:border-gray-700 pl-4 ml-4"
									>
										<div v-for="reply in comment.replies" :key="reply.id" class="comment-reply">
											<div class="flex gap-3">
												<UAvatar
													:src="
														reply.comments_id.user?.avatar
															? `${useRuntimeConfig().public.directusUrl}/assets/${reply.comments_id.user.avatar}`
															: null
													"
													:alt="reply.comments_id.user?.first_name"
													size="sm"
												/>

												<div class="flex-grow">
													<div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
														<div class="flex items-center gap-2 mb-1">
															<span class="font-medium text-sm">
																{{ reply.comments_id.user?.first_name }}
																{{ reply.comments_id.user?.last_name }}
															</span>
															<span class="text-xs text-gray-500">
																{{ new Date(reply.comments_id.date_created).toLocaleString() }}
															</span>
														</div>
														<div class="text-sm" v-html="reply.comments_id.comment" />
													</div>

													<div class="flex gap-2 mt-1">
														<ReactionsBar :item-id="String(reply.comments_id.id)" collection="comments" />
													</div>
												</div>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>
					</template>
				</TransitionGroup>

				<div v-if="!comments.length" class="text-center text-sm text-gray-500 py-4">
					No comments yet. Be the first to comment!
				</div>
			</div>
		</Transition>
	</div>
</template>

<style>
.comments-enter-active,
.comments-leave-active {
	transition: all 0.3s ease;
}

.comments-enter-from,
.comments-leave-to {
	opacity: 0;
	transform: translateX(-20px);
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
