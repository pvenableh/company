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
					<div class="w-full flex items-center gap-2 mb-1 relative text-[10px] font-bold">
						<span class="font-medium uppercase">
							{{ comment.comments_id.user?.first_name }}
							{{ comment.comments_id.user?.last_name }}
						</span>

						<UButton
							v-if="comment.comments_id.user?.id === currentUser?.id"
							size="xs"
							color="primary"
							variant="ghost"
							icon="i-heroicons-x-circle-solid"
							class="absolute right-2"
							:loading="deleteLoading"
							@click="handleDelete"
						/>
					</div>
					<div class="text-sm comment" v-html="comment.comments_id.comment" />
					<!-- UModal to display the image -->
					<UModal v-model:show="showModal">
						<template #title>Image Preview</template>
						<img :src="modalImageSrc" alt="Preview" class="max-w-full max-h-screen mx-auto" />
					</UModal>
				</div>

				<div class="w-full flex gap-2 mt-1">
					<div class="flex-grow flex flex-row">
						<ReactionsBar :item-id="String(comment.comments_id.id)" collection="comments" />
						<UButton v-if="depth < 4" variant="ghost" size="xs" class="text-[10px]" @click="handleReplyClick">
							Reply
						</UButton>
					</div>
					<span class="text-[9px] uppercase font-bold">
						<UTooltip :text="new Date(comment.comments_id.date_created).toLocaleString()">
							{{ getTimeAgo(new Date(comment.comments_id.date_created).toLocaleString()) }}
						</UTooltip>
					</span>
				</div>

				<div v-if="showReplyForm" class="mt-2">
					<CommentsComment
						:replying-to="comment"
						:loading="loading"
						:depth="depth"
						:refresh="refresh"
						:toolbar="false"
						@submit="handleReplySubmit"
						@cancel="handleReplyCancel"
						:comment="comment.comments_id"
					/>
				</div>

				<!-- Nested replies -->
				<div
					v-if="comment.replies?.length"
					class="mt-3 space-y-3"
					:class="{
						'border-l-2 border-gray-200 dark:border-gray-700 pl-4 ml-4': depth < 4,
					}"
				>
					<CommentsThread
						v-for="reply in comment.replies"
						:depth="depth + 1"
						:key="reply.id"
						:comment="reply"
						:loading="loading"
						:is-reply="true"
						:refresh="refresh"
						:is-active="isActive && activeReplyId === reply.comments_id.id"
						@delete="$emit('delete', $event)"
						@submit="handleNestedReplySubmit"
						@reply="handleNestedReply"
						@cancel="handleReplyCancel"
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
	refresh: {
		type: Function,
		required: true,
	},
	depth: {
		type: Number,
		default: 0,
	},
});

const emit = defineEmits(['reply', 'submit', 'cancel', 'delete']);
const { user: currentUser } = useDirectusAuth();
const { deleteItem } = useDirectusItems();
const deleteLoading = ref(false);
const showReplyForm = ref(false);
const activeReplyId = ref(null);

function handleReplyClick() {
	showReplyForm.value = true;
	emit('reply', props.comment);
}

function handleReplySubmit(content) {
	emit('submit', content);
	showReplyForm.value = false;
}

function handleNestedReply(reply) {
	activeReplyId.value = reply.comments_id.id;
	emit('reply', reply);
}

function handleNestedReplySubmit(content) {
	emit('submit', content);
	activeReplyId.value = null;
}

function handleReplyCancel() {
	showReplyForm.value = false;
	activeReplyId.value = null;
	emit('cancel');
}

async function handleDelete() {
	try {
		deleteLoading.value = true;
		await deleteItem('comments', props.comment.comments_id.id);
		emit('delete', props.comment.comments_id.id);
		props.refresh();
	} catch (error) {
		console.error('Error deleting comment:', error);
	} finally {
		deleteLoading.value = false;
	}
}

// Reset state when isActive changes
watch(
	() => props.isActive,
	(newValue) => {
		if (!newValue) {
			showReplyForm.value = false;
			activeReplyId.value = null;
		}
	},
);
</script>
