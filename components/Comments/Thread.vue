<template>
	<div class="comment-thread">
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
						<UButton
							v-if="comment.comments_id.user?.id === currentUser?.id"
							size="xs"
							color="red"
							variant="ghost"
							icon="i-heroicons-trash"
							:loading="deleteLoading"
							@click="handleDelete"
						/>
					</div>
					<div class="text-sm comment" v-html="comment.comments_id.comment" />
				</div>

				<div class="flex gap-2 mt-1">
					<ReactionsBar :item-id="String(comment.comments_id.id)" collection="comments" />
					<UButton v-if="!isReply" variant="ghost" size="xs" @click="$emit('reply', comment)">Reply</UButton>
				</div>

				<!-- Reply input -->
				<div v-if="isActive && !isReply" class="mt-2">
					<CommentsComment
						:replying-to="comment"
						:loading="loading"
						:depth="1"
						@submit="$emit('submit', $event)"
						@cancel="$emit('cancel')"
						:comment="comment.comments_id"
					/>
				</div>

				<!-- Nested replies -->
				<div
					v-if="comment.replies?.length"
					class="mt-3 space-y-3 border-l-2 border-gray-200 dark:border-gray-700 pl-4 ml-4"
				>
					<CommentsThread
						v-for="reply in comment.replies"
						:key="reply.id"
						:comment="reply"
						:loading="loading"
						:is-reply="true"
						@delete="$emit('delete', $event)"
					/>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
const props = defineProps({
	comment: {
		type: Object,
		required: true,
	},
	loading: {
		type: Boolean,
		default: false,
	},
	isReply: {
		type: Boolean,
		default: false,
	},
	isActive: {
		type: Boolean,
		default: false,
	},
});
console.log(props.comment);
const emit = defineEmits(['reply', 'submit', 'cancel', 'delete']);
const { user: currentUser } = useDirectusAuth();
const { deleteItem } = useDirectusItems();
const deleteLoading = ref(false);

async function handleDelete() {
	try {
		deleteLoading.value = true;
		await deleteItem('comments', props.comment.comments_id.id);
		emit('delete', props.comment.comments_id.id);
	} catch (error) {
		console.error('Error deleting comment:', error);
	} finally {
		deleteLoading.value = false;
	}
}
</script>
