<template>
	<div class="comment-thread" :class="{ 'opacity-40': isHidden }">
		<div class="flex gap-3">
			<UAvatar
				:src="comment.user?.avatar ? `${useRuntimeConfig().public.directusUrl}/assets/${comment.user.avatar}` : null"
				:alt="comment.user?.first_name"
				size="sm"
			/>

			<div class="w-auto">
				<div class="flex flex-row ml-2 items-center gap-1">
					<span class="text-[9px] uppercase font-bold">
						<UTooltip :text="new Date(comment.date_created).toLocaleString()">
							<span class="lowercase">
								{{ getFriendlyDate(comment.date_created) }}
							</span>
						</UTooltip>
					</span>
					<span v-if="isHidden" class="text-[9px] text-red-400 font-medium flex items-center gap-0.5">
						<Icon name="i-heroicons-eye-slash" class="w-3 h-3" /> Hidden
					</span>
				</div>
				<div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3">
					<div class="w-full flex items-center gap-2 mb-1 relative text-[10px] font-bold">
						<span class="font-medium uppercase">
							{{ comment.user?.first_name }}
							{{ comment.user?.last_name }}
						</span>
						<div class="absolute -right-2 flex items-center gap-0.5">
							<!-- Delete (own comment) -->
							<UButton
								v-if="isOwnComment && !confirmingDelete"
								size="xs"
								color="primary"
								variant="ghost"
								icon="i-heroicons-x-circle-solid"
								@click="confirmingDelete = true"
							/>
							<!-- Delete confirmation -->
							<template v-if="confirmingDelete">
								<span class="text-[9px] text-red-500 mr-1">Delete?</span>
								<UButton size="xs" color="red" variant="ghost" icon="i-heroicons-check" :loading="deleteLoading" @click="handleDelete" />
								<UButton size="xs" variant="ghost" icon="i-heroicons-x-mark" @click="confirmingDelete = false" />
							</template>
						</div>
					</div>
					<div class="text-sm comment" v-html="comment.comment" />
					<CommentsImageModal />
				</div>

				<div class="w-full flex gap-2 mt-1">
					<div class="flex-grow flex flex-row justify-between items-center">
						<ReactionsBar :item-id="String(comment.id)" collection="comments" />
						<div class="flex items-center gap-1">
							<!-- Report -->
							<UButton
								v-if="!isOwnComment"
								variant="ghost"
								size="xs"
								class="text-[10px]"
								icon="i-heroicons-flag"
								color="gray"
								@click="showReportDialog = true"
							/>
							<!-- Admin: hide/unhide -->
							<UButton
								v-if="isAdmin"
								variant="ghost"
								size="xs"
								class="text-[10px]"
								:icon="isHidden ? 'i-heroicons-eye' : 'i-heroicons-eye-slash'"
								color="gray"
								:loading="hideLoading"
								@click="handleToggleHide"
							/>
							<!-- Reply -->
							<UButton v-if="depth < 4" variant="ghost" size="xs" class="text-[10px]" @click="handleReplyClick">
								Reply
							</UButton>
						</div>
					</div>
				</div>

				<!-- Report Dialog -->
				<CommentsReportDialog
					v-model="showReportDialog"
					:comment-id="comment.id"
					@reported="handleReported"
				/>

				<div v-if="showReplyForm" class="mt-2">
					<CommentsComment
						:replying-to="comment"
						:loading="loading"
						:depth="depth"
						:refresh="refresh"
						:toolbar="false"
						@submit="handleReplySubmit"
						@cancel="handleReplyCancel"
						:comment="comment"
						:organization-id="organizationId"
						:client-id="clientId"
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
						:is-active="isActive && activeReplyId === reply.id"
						@delete="$emit('delete', $event)"
						@submit="handleNestedReplySubmit"
						@reply="handleNestedReply"
						@cancel="handleReplyCancel"
						:organization-id="organizationId"
						:client-id="clientId"
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
	organizationId: {
		type: [String, Number],
		default: null,
	},
	clientId: {
		type: String,
		default: null,
	},
});

const emit = defineEmits(['reply', 'submit', 'cancel', 'delete']);
const { user: sessionUser, loggedIn } = useUserSession();
const currentUser = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});
const commentItems = useDirectusItems('comments');
const { hideComment, unhideComment, isCommentHidden } = useComments();
const { isOrgAdminOrAbove } = useOrgRole();
const deleteLoading = ref(false);
const hideLoading = ref(false);
const confirmingDelete = ref(false);
const showReplyForm = ref(false);
const showReportDialog = ref(false);
const activeReplyId = ref(null);

const isOwnComment = computed(() => currentUser.value?.id === props.comment.user?.id);
const isAdmin = computed(() => isOrgAdminOrAbove.value);
const isHidden = computed(() => isCommentHidden(props.comment));

function handleReplyClick() {
	showReplyForm.value = true;
	emit('reply', props.comment);
}

function handleReplySubmit(content) {
	emit('submit', content, props.comment.id);
	showReplyForm.value = false;
}

function handleNestedReply(reply) {
	activeReplyId.value = reply.id;
	emit('reply', reply);
}

function handleNestedReplySubmit(content) {
	emit('submit', content, activeReplyId.value);
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
		await commentItems.remove(props.comment.id);
		confirmingDelete.value = false;
		emit('delete', props.comment.id);
		props.refresh();
	} catch (error) {
		console.error('Error deleting comment:', error);
	} finally {
		deleteLoading.value = false;
	}
}

async function handleToggleHide() {
	try {
		hideLoading.value = true;
		if (isHidden.value) {
			await unhideComment(props.comment.id);
		} else {
			await hideComment(props.comment.id);
		}
		props.refresh();
	} catch (error) {
		console.error('Error toggling comment visibility:', error);
	} finally {
		hideLoading.value = false;
	}
}

function handleReported() {
	showReportDialog.value = false;
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
<style>
.comment img {
	cursor: pointer;
	transition: opacity 0.2s ease;
}

.comment img:hover {
	opacity: 0.9;
}
</style>
