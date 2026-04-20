<script setup>
import { useRealtimeSubscription } from '~/composables/useRealtimeSubscription';

const messageItems = useDirectusItems('messages');
const { params } = useRoute();
const { user: sessionUser, loggedIn } = useUserSession();
const user = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});

const { selectedOrg } = useOrganization();
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();

definePageMeta({
	middleware: ['auth'],
	layout: 'default',
});
useHead({ title: `#${params.channel} | Earnest` });

// Setup state
const newMessage = ref('');
const channelId = ref(null);
const messagesContainer = ref(null);
const sending = ref(false);

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

// Filter to top-level messages: no parent_id, OR parent not in this channel's messages (orphaned replies show at top)
const topLevelMessages = computed(() => {
	if (!messages.value) return [];
	const messageIds = new Set(messages.value.map(m => m.id));
	return messages.value.filter(m => !m.parent_id || !messageIds.has(m.parent_id));
});

// Watch for channel data to set channelId
watch(
	channels,
	(newChannels) => {
		if (newChannels?.length) {
			channelId.value = newChannels[0].id;
			setEntity('channel', String(newChannels[0].id), `#${params.channel}`);
		}
	},
	{ immediate: true },
);
onUnmounted(() => clearEntity());

// Send message function
const sendMessage = async () => {
	const messageText = newMessage.value?.trim();
	if (!messageText || !channelId.value || sending.value) return;

	sending.value = true;
	try {
		await messageItems.create({
			text: newMessage.value,
			channel: channelId.value,
			status: 'published',
			user_created: user.value.id,
		});
		newMessage.value = '';
	} catch (error) {
		console.error('Error sending message:', error);
		useToast().add({ title: 'Failed to send message', color: 'red' });
	} finally {
		sending.value = false;
	}
};

// Delete message function
const deleteMessage = async (id) => {
	try {
		await messageItems.remove(id);
	} catch (error) {
		console.error('Error deleting message:', error);
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

watch(topLevelMessages, (newMessages, oldMessages) => {
	if (newMessages?.length > (oldMessages?.length || 0)) {
		scrollToBottom();
	}
});

onMounted(() => {
	scrollToBottom();
});
</script>

<template>
	<div class="flex flex-col h-[calc(100vh-64px)]">
		<!-- Header -->
		<div class="flex items-center justify-between px-5 py-3 border-b border-border/50 shrink-0">
			<div class="flex items-center gap-3">
				<NuxtLink to="/channels" class="text-muted-foreground hover:text-foreground transition-colors">
					<Icon name="lucide:arrow-left" class="w-4 h-4" />
				</NuxtLink>
				<div class="flex items-center gap-2">
					<h1 class="text-base font-semibold">#{{ params.channel }}</h1>
					<span
						class="w-2 h-2 rounded-full shrink-0"
						:class="isConnected ? 'bg-emerald-500' : 'bg-red-400'"
						:title="isConnected ? 'Connected' : 'Disconnected'"
					/>
				</div>
			</div>
			<div class="flex items-center gap-1.5">
				<button
					class="inline-flex items-center gap-1 h-7 px-2.5 rounded-lg border border-border text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
					@click="sidebarOpen = true"
				>
					<Icon name="lucide:sparkles" class="w-3.5 h-3.5" />
					<span class="hidden sm:inline">Ask Earnest</span>
				</button>
				<LayoutShareButton :title="`#${params.channel} | Earnest`" />
			</div>
		</div>

		<!-- Connection Error -->
		<div v-if="messagesError || channelsError" class="px-5 py-3 bg-red-500/10 border-b border-red-500/20">
			<div class="flex items-center justify-between">
				<p class="text-sm text-red-400">Connection error. Messages may not be up to date.</p>
				<button class="text-xs text-red-400 hover:text-red-300 font-medium" @click="refreshMessages">Retry</button>
			</div>
		</div>

		<!-- Messages -->
		<div ref="messagesContainer" class="flex-1 overflow-y-auto px-5 py-4 messages-scroll">
			<!-- Loading State -->
			<div v-if="messagesLoading || channelsLoading" class="space-y-4">
				<div v-for="n in 5" :key="n" class="flex items-start gap-3">
					<div class="w-8 h-8 rounded-full bg-muted/60 animate-pulse shrink-0" />
					<div class="flex-1 space-y-1.5">
						<div class="h-3 bg-muted/40 rounded w-24 animate-pulse" />
						<div class="h-4 bg-muted/40 rounded w-3/4 animate-pulse" />
					</div>
				</div>
			</div>

			<!-- Messages List (top-level only — replies show threaded under their parent) -->
			<div v-else-if="topLevelMessages.length" class="space-y-3">
				<ChannelsMessage
					v-for="message in topLevelMessages"
					:key="message.id"
					:message="message"
				/>
			</div>

			<!-- Empty State -->
			<div v-else class="flex flex-col items-center justify-center h-full">
				<div class="w-12 h-12 rounded-2xl bg-muted/40 flex items-center justify-center mb-3">
					<Icon name="lucide:hash" class="w-6 h-6 text-muted-foreground/40" />
				</div>
				<p class="text-sm font-medium text-muted-foreground">This is the start of #{{ params.channel }}</p>
				<p class="text-xs text-muted-foreground/60 mt-1">Send a message to get the conversation going.</p>
			</div>
		</div>

		<!-- Message Input -->
		<div class="px-5 pb-4 pt-2 shrink-0">
			<div class="channel-input flex items-end gap-2 rounded-2xl border border-border/60 bg-muted/20 px-2 py-1 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 transition-all max-w-3xl">
				<LazyFormTiptap
					v-model="newMessage"
					:show-toolbar="true"
					:disabled="!channelId"
					:organization-id="selectedOrg"
					:enter-to-send="true"
					height="min-h-[36px]"
					custom-classes="px-2 py-1.5"
					:character-limit="0"
					:show-char-count="false"
					:allow-uploads="true"
					:context="{ collection: 'messages', itemId: channelId }"
					class="flex-1 channel-tiptap"
					@submit="sendMessage"
				/>
				<button
					v-if="newMessage?.trim()"
					class="shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors mb-1"
					:disabled="sending || !channelId"
					@click="sendMessage"
				>
					<Icon name="lucide:arrow-up" class="w-4 h-4 text-primary-foreground" />
				</button>
			</div>
			<p class="text-[10px] text-muted-foreground/40 mt-1.5 px-1">
				<kbd class="px-1 py-0.5 rounded bg-muted/40 text-[9px] font-mono">Enter</kbd> to send,
				<kbd class="px-1 py-0.5 rounded bg-muted/40 text-[9px] font-mono">Shift + Enter</kbd> for new line.
				Type <kbd class="px-1 py-0.5 rounded bg-muted/40 text-[9px] font-mono">@</kbd> to mention someone.
			</p>
		</div>

		<!-- Contextual AI Sidebar -->
		<ClientOnly>
			<AIContextualSidebar
				v-if="sidebarOpen && channelId"
				entity-type="channel"
				:entity-id="String(channelId)"
				:entity-label="`#${params.channel}`"
				@close="closeSidebar"
			/>
			<Transition name="overlay">
				<div v-if="sidebarOpen" class="fixed inset-0 bg-black/20 z-40" @click="closeSidebar" />
			</Transition>
		</ClientOnly>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.messages-scroll {
	scrollbar-width: thin;
	scrollbar-color: transparent transparent;
	scroll-behavior: smooth;
}

.messages-scroll:hover {
	scrollbar-color: var(--border) transparent;
}

.messages-scroll::-webkit-scrollbar {
	width: 6px;
}

.messages-scroll::-webkit-scrollbar-track {
	background: transparent;
}

.messages-scroll::-webkit-scrollbar-thumb {
	@apply bg-transparent rounded-full;
}

.messages-scroll:hover::-webkit-scrollbar-thumb {
	@apply bg-border;
}

/* Strip Tiptap default borders/chrome so it looks like the original textarea */
.channel-tiptap :deep(.tiptap-wrapper) {
	border: none !important;
}

.channel-tiptap :deep(.tiptap-container) {
	border: none !important;
	border-radius: 0 !important;
	background: transparent !important;
	max-height: 160px;
}

.channel-tiptap :deep(.toolbar) {
	border: none !important;
	border-top: 1px solid hsl(var(--border) / 0.2) !important;
	border-radius: 0 !important;
}

.channel-tiptap :deep(.tiptap-container .ProseMirror) {
	font-size: 0.875rem;
	line-height: 1.625;
	min-height: 24px;
}

.channel-tiptap :deep(.tiptap-container .ProseMirror p.is-editor-empty:first-child::before) {
	color: var(--muted-foreground);
	opacity: 0.5;
}
</style>
