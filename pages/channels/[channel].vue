<script setup>
import { useRealtimeSubscription } from '~/composables/useRealtimeSubscription';

const messageItems = useDirectusItems('messages');
const { params } = useRoute();
const { user: sessionUser, loggedIn } = useUserSession();
const user = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});

const { selectedOrg, hasMultipleOrgs, organizationOptions, setOrganization, clearOrganization, getOrganizationFilter } =
	useOrganization();

definePageMeta({
	middleware: ['auth'],
	layout: 'default',
});

// Setup state
const newMessage = ref('');
const channelId = ref(null);
const messagesContainer = ref(null);
const enterToSend = ref(false);

// Persist enterToSend in localStorage
if (import.meta.client) {
	const saved = localStorage.getItem('earnest_enter_to_send');
	if (saved !== null) {
		enterToSend.value = saved === 'true';
	}
}
watch(enterToSend, (val) => {
	if (import.meta.client) {
		localStorage.setItem('earnest_enter_to_send', String(val));
	}
});
const channelFilter = computed(() => {
	const filter = {
		_and: [{ name: { _eq: params.channel } }, selectedOrg.value ? { organization: { _eq: selectedOrg.value } } : {}],
	};
	return filter;
});

// Define fields for messages
const messageFields = [
	'id',
	'status',
	'text',
	'date_created',
	'user_created.id',
	'user_created.first_name',
	'user_created.last_name',
	'user_created.avatar',
	'channel.id',
	'channel.name',
	'parent_id',
];

// Setup realtime subscription for messages
const {
	data: messages,
	isLoading: messagesLoading,
	isConnected,
	error: messagesError,
	refresh: refreshMessages,
} = useRealtimeSubscription(
	'messages',
	messageFields,
	{
		channel: { name: { _eq: params.channel } },
		status: { _eq: 'published' },
	},
	'-date_created',
);

// Setup realtime subscription for channel
const {
	data: channels,
	isLoading: channelsLoading,
	error: channelsError,
} = useRealtimeSubscription('channels', ['id', 'name', 'organization', 'project'], {
	name: { _eq: params.channel },
});

// Watch for channel data to set channelId
watch(
	channels,
	(newChannels) => {
		if (newChannels?.length) {
			channelId.value = newChannels[0].id;
			console.log('Channel ID set:', channelId.value);
		}
	},
	{ immediate: true },
);

// Send message function
const sendMessage = async () => {
	const messageText = newMessage.value?.replace(/<[^>]*>/g, '').trim();

	if (!messageText || !channelId.value || messagesLoading.value) {
		return;
	}

	try {
		const messageData = {
			text: newMessage.value,
			channel: channelId.value,
			status: 'published',
			user_created: user.value.id,
		};

		await messageItems.create(messageData);
		newMessage.value = '';
	} catch (error) {
		console.error('Error sending message:', error);
		useToast().add({
			title: 'Error',
			description: 'Failed to send message',
			color: 'red',
		});
	}
};

// Delete message function
const deleteMessage = async (id) => {
	try {
		await messageItems.remove(id);
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

// Scroll management
const scrollToBottom = () => {
	if (messagesContainer.value) {
		nextTick(() => {
			messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
		});
	}
};

// Watch messages for changes and scroll
watch(messages, (newMessages, oldMessages) => {
	if (newMessages?.length > (oldMessages?.length || 0)) {
		scrollToBottom();
	}
});

// Initial scroll on mount
onMounted(() => {
	scrollToBottom();
});

// Handle keyboard shortcuts
const handleKeyboard = (event) => {
	// Ctrl/Cmd + Enter to send (always works)
	if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
		event.preventDefault();
		sendMessage();
	}
};
</script>

<template>
	<div class="flex flex-col h-svh bg-card">
		<!-- Header -->
		<div
			class="flex items-center justify-between p-4 border-b border-border bg-card sticky top-0 z-10"
		>
			<div class="flex items-center space-x-4">
				<NuxtLink to="/channels" class="text-muted-foreground hover:text-foreground">
					<UIcon name="i-heroicons-chevron-left" class="w-5 h-5" />
				</NuxtLink>
				<div>
					<h1 class="text-xl font-bold">#{{ params.channel }}</h1>
					<p class="text-sm text-muted-foreground">
						{{ channelsLoading ? 'Loading...' : channels?.[0]?.name || 'Channel not found' }}
					</p>
				</div>
			</div>
			<div class="flex items-center space-x-2">
				<UBadge :color="isConnected ? 'green' : 'red'" variant="subtle" class="hidden sm:inline-flex">
					{{ isConnected ? 'Connected' : 'Disconnected' }}
				</UBadge>
				<UDropdown :items="[{ label: 'Channel Settings', icon: 'i-heroicons-cog-6-tooth' }]">
					<UButton color="gray" variant="ghost" icon="i-heroicons-ellipsis-horizontal" />
				</UDropdown>
			</div>
		</div>

		<!-- Connection Error -->
		<UAlert
			v-if="messagesError || channelsError"
			color="red"
			title="Connection Error"
			:description="messagesError || channelsError"
			class="m-4"
		>
			<template #footer>
				<UButton
					color="red"
					variant="ghost"
					icon="i-heroicons-arrow-path"
					:loading="messagesLoading"
					@click="refreshMessages"
				>
					Retry
				</UButton>
			</template>
		</UAlert>

		<!-- Messages -->
		<div ref="messagesContainer" class="flex-1 overflow-y-auto space-y-3 px-4 py-2">
			<!-- Loading State -->
			<div v-if="messagesLoading || channelsLoading" class="space-y-4">
				<USkeleton v-for="n in 5" :key="n" class="h-16" />
			</div>

			<!-- Messages List -->
			<template v-else-if="messages?.length">
				<div
					v-for="message in messages"
					:key="message.id"
					class="group flex items-start space-x-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
				>
					<ChannelsMessage :channel="message.channel" :message="message" />

					<!-- 			
					<UAvatar
						:src="message.user_created?.avatar ? `/assets/${message.user_created.avatar}` : undefined"
						:alt="message.user_created?.first_name"
						size="sm"
					/>

					<div class="flex-1 min-w-0">
						<div class="flex items-center space-x-2">
							<span class="font-medium">
								{{ message.user_created?.first_name }} {{ message.user_created?.last_name }}
							</span>
							<span class="text-xs text-gray-500">
								{{ getRelativeTime(message.date_created) }}
							</span>
						</div>
						<div class="prose prose-sm dark:prose-invert max-w-none mt-1" v-html="message.text" />
					</div>

					<div
						v-if="message.user_created?.id === user?.id"
						class="opacity-0 group-hover:opacity-100 transition-opacity"
					>
						<UButton
							color="gray"
							variant="ghost"
							icon="i-heroicons-trash"
							size="xs"
							@click="deleteMessage(message.id)"
						/>
					</div> -->
				</div>
			</template>

			<!-- Empty State -->
			<div v-else class="flex flex-col items-center justify-center h-full text-muted-foreground">
				<UIcon name="i-heroicons-chat-bubble-left-right" class="w-12 h-12 mb-4" />
				<p>No messages yet</p>
				<p class="text-sm">Be the first to send a message!</p>
			</div>
		</div>

		<!-- Message Input -->
		<div
			class="w-screen fixed bottom-[60px] border-t shadow-lg border-border bg-card p-4 z-100"
		>
			<div class="max-w-5xl mx-auto">
				<div class="flex space-x-2">
					<LazyFormTiptap
						v-model="newMessage"
						class="flex-1"
						:disabled="!channelId"
						:organization-id="selectedOrg"
						:context="{ collection: 'messages', itemId: channelId }"
						:enter-to-send="enterToSend"
						@keydown="handleKeyboard"
						@submit="sendMessage"
					/>
					<UButton
						color="primary"
						:loading="messagesLoading"
						:disabled="!newMessage?.trim() || !channelId"
						@click="sendMessage"
					>
						<Icon name="lucide:send" class="w-4 h-4" />
						Send
					</UButton>
				</div>
				<div class="flex items-center justify-between mt-1.5">
					<p v-if="!channelId" class="text-xs text-red-500">Channel not found or still loading...</p>
					<p v-else class="text-xs text-muted-foreground">
						{{ enterToSend ? 'Press Enter to send' : 'Press Ctrl + Enter to send' }}
					</p>
					<div class="flex items-center gap-1.5 text-xs text-muted-foreground">
						<Switch v-model:checked="enterToSend" class="scale-75" />
						<span>Enter to send</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";
.prose :deep(p) {
	margin: 0;
}

.prose :deep(ul) {
	margin: 0.5em 0;
}

.prose :deep(.mention) {
	@apply bg-muted rounded px-2 py-0.5 font-medium;
}

/* Hide scrollbar but maintain functionality */
.messages-container {
	scrollbar-width: thin;
	scrollbar-color: transparent transparent;
}

.messages-container::-webkit-scrollbar {
	width: 6px;
}

.messages-container::-webkit-scrollbar-track {
	background: transparent;
}

.messages-container::-webkit-scrollbar-thumb {
	@apply bg-border rounded;
}

/* Smooth scrolling */
.messages-container {
	scroll-behavior: smooth;
}
</style>
