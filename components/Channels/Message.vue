<script setup>
const props = defineProps({
	message: {
		type: Object,
		required: true,
	},
	isReply: {
		type: Boolean,
		default: false,
	},
});

const { createItem, deleteItem } = useDirectusItems();
const { data, status } = useAuth();
const user = computed(() => {
	return status.value === 'authenticated' ? data?.value?.user ?? null : null;
});
const showReplyInput = ref(false);
const replyText = ref('');
const showReplies = ref(false);

// Get message replies using realtime subscription
const {
	data: replies,
	isLoading: repliesLoading,
	error: repliesError,
} = useRealtimeSubscription(
	'messages',
	[
		'id',
		'status',
		'text',
		'date_created',
		'user_created.id',
		'user_created.first_name',
		'user_created.last_name',
		'user_created.avatar',
	],
	{
		parent_id: { _eq: props.message.id },
		status: { _eq: 'published' },
	},
	'-date_created',
);

const replyCount = computed(() => replies.value?.length || 0);

const toggleReplyInput = () => {
	showReplyInput.value = !showReplyInput.value;
	if (showReplyInput.value) {
		showReplies.value = true;
	}
};

const toggleReplies = () => {
	showReplies.value = !showReplies.value;
};

const sendReply = async () => {
	if (!replyText.value?.trim()) return;

	try {
		await createItem('messages', {
			text: replyText.value,
			channel: props.message.channel,
			parent_id: props.message.id,
			status: 'published',
			user_created: user.value.id,
		});

		replyText.value = '';
		showReplyInput.value = false;
		showReplies.value = true;
	} catch (error) {
		console.error('Error sending reply:', error);
		useToast().add({
			title: 'Error',
			description: 'Failed to send reply',
			color: 'red',
		});
	}
};

const deleteMessage = async () => {
	try {
		await deleteItem('messages', props.message.id);
		useToast().add({
			title: 'Success',
			description: 'Message deleted',
			color: 'green',
		});
	} catch (error) {
		console.error('Error deleting message:', error);
		useToast().add({
			title: 'Error',
			description: 'Failed to delete message',
			color: 'red',
		});
	}
};

const handleKeyboard = (event) => {
	if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
		event.preventDefault();
		sendReply();
	}
};
</script>

<template>
	<div
		:class="['group flex flex-col space-y-2', isReply ? 'pl-8 border-l-2 border-gray-100 dark:border-gray-800' : '']"
	>
		<!-- Message Content -->
		<div class="flex items-start space-x-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
			<UAvatar
				:src="message.user_created?.avatar ? `/assets/${message.user_created.avatar}` : undefined"
				:alt="message.user_created?.first_name"
				size="sm"
			/>

			<div class="flex-1 min-w-0">
				<div class="flex items-center space-x-2">
					<span class="font-medium">{{ message.user_created?.first_name }} {{ message.user_created?.last_name }}</span>
					<span class="text-xs text-gray-500">
						{{ getRelativeTime(message.date_created) }}
					</span>
				</div>

				<div class="prose prose-sm dark:prose-invert max-w-none mt-1" v-html="message.text" />

				<!-- Message Actions -->
				<div class="w-full flex justify-between items-center space-x-4 mt-2">
					<ReactionsBar :item-id="message.id" collection="messages" />
					<UButton
						v-if="!isReply"
						size="xs"
						variant="ghost"
						:color="showReplies ? 'primary' : 'gray'"
						@click="toggleReplies"
					>
						{{ replyCount }} {{ replyCount === 1 ? 'reply' : 'replies' }}
					</UButton>

					<UButton size="xs" variant="ghost" color="gray" @click="toggleReplyInput">Reply</UButton>

					<UButton
						v-if="message.user_created?.id === user?.id"
						size="xs"
						variant="ghost"
						color="gray"
						icon="i-heroicons-trash"
						@click="deleteMessage"
					/>
				</div>
			</div>
		</div>

		<!-- Reply Input -->
		<div v-if="showReplyInput" class="pl-8">
			<FormTiptap v-model="replyText" :show-toolbar="false" @keydown="handleKeyboard">
				<template #footer>
					<div class="flex justify-between items-center">
						<span class="text-xs text-gray-500">Press Ctrl + Enter to send</span>
						<div class="space-x-2">
							<UButton size="sm" color="gray" variant="ghost" @click="showReplyInput = false">Cancel</UButton>
							<UButton size="sm" color="primary" :disabled="!replyText?.trim()" @click="sendReply">Reply</UButton>
						</div>
					</div>
				</template>
			</FormTiptap>
		</div>

		<!-- Replies -->
		<TransitionExpand>
			<div v-if="showReplies" class="space-y-2">
				<div v-if="repliesLoading" class="pl-8">
					<USkeleton v-for="n in 2" :key="n" class="h-16" />
				</div>

				<template v-else>
					<ChannelsMessage v-for="reply in replies" :key="reply.id" :message="reply" :is-reply="true" />
				</template>
			</div>
		</TransitionExpand>
	</div>
</template>

<style scoped>
.prose :deep(p) {
	margin: 0;
}

.prose :deep(ul) {
	margin: 0.5em 0;
}

.prose :deep(.mention) {
	@apply bg-gray-100 dark:bg-gray-800 rounded px-2 py-0.5 font-medium;
}
</style>
