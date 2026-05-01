<script setup lang="ts">
import { nextTick } from 'vue';

const props = defineProps<{
	channelId?: string;
	compact?: boolean;
}>();

const { user } = useDirectusAuth();
const config = useRuntimeConfig();
const messageItems = useDirectusItems('messages');
const channelItems = useDirectusItems('channels');
const { selectedOrg } = useOrganization();
const { selectedTeam } = useTeams();

const messages = ref<any[]>([]);
const newMessage = ref('');
const isLoading = ref(true);
const isSending = ref(false);
const messagesContainer = ref<HTMLElement | null>(null);
const selectedChannel = ref(props.channelId || '');
const channels = ref<any[]>([]);

// Load available channels
const loadChannels = async () => {
	try {
		const filter: any = { _and: [{ status: { _eq: 'published' } }] };
		if (selectedOrg.value) {
			filter._and.push({ organization: { _eq: selectedOrg.value } });
		}
		const result = await channelItems.list({
			fields: ['id', 'name', 'organization.name'],
			filter,
			sort: ['name'],
			limit: 50,
		});
		channels.value = result;
		if (!selectedChannel.value && result.length > 0) {
			selectedChannel.value = result[0].id;
		}
	} catch (e) {
		console.warn('[Chat] Could not load channels:', e);
	}
};

// Load messages for selected channel
const loadMessages = async () => {
	if (!selectedChannel.value) return;
	isLoading.value = true;
	try {
		const result = await messageItems.list({
			fields: [
				'id',
				'text',
				'date_created',
				'user_created.id',
				'user_created.first_name',
				'user_created.last_name',
				'user_created.avatar',
			],
			filter: {
				_and: [
					{ channel: { _eq: selectedChannel.value } },
					{ status: { _eq: 'published' } },
				],
			},
			sort: ['date_created'],
			limit: 100,
		});
		messages.value = result;
		await nextTick();
		scrollToBottom();
	} catch (e) {
		console.warn('[Chat] Could not load messages:', e);
	} finally {
		isLoading.value = false;
	}
};

// WebSocket for real-time updates
const { subscribe } = useWebSocketManager();
let unsubscribe: (() => void) | null = null;

const setupRealtimeSubscription = () => {
	if (unsubscribe) unsubscribe();
	if (!selectedChannel.value) return;

	const result = subscribe(
		'messages',
		{
			fields: [
				'id',
				'text',
				'date_created',
				'user_created.id',
				'user_created.first_name',
				'user_created.last_name',
				'user_created.avatar',
			],
			filter: {
				_and: [
					{ channel: { _eq: selectedChannel.value } },
					{ status: { _eq: 'published' } },
				],
			},
			sort: 'date_created',
		},
		(event, data) => {
			if (event === 'init') {
				messages.value = data;
			} else if (event === 'create') {
				messages.value.push(...data);
			} else if (event === 'update') {
				for (const updated of data) {
					const idx = messages.value.findIndex((m) => m.id === updated.id);
					if (idx !== -1) messages.value[idx] = updated;
				}
			} else if (event === 'delete') {
				const ids = data.map((d: any) => d.id || d);
				messages.value = messages.value.filter((m) => !ids.includes(m.id));
			}
			nextTick(() => scrollToBottom());
		},
	);
	unsubscribe = result.unsubscribe;
};

// Send a message
const sendMessage = async () => {
	const content = newMessage.value.trim();
	if (!content || !selectedChannel.value) return;

	isSending.value = true;
	const savedContent = newMessage.value;
	newMessage.value = '';

	try {
		await $fetch('/api/messages', {
			method: 'POST',
			body: {
				text: savedContent,
				channel: selectedChannel.value,
				status: 'published',
			},
		});
		await nextTick();
		scrollToBottom();
	} catch (e) {
		console.error('[Chat] Failed to send message:', e);
		newMessage.value = savedContent; // restore on failure
	} finally {
		isSending.value = false;
	}
};

// Handle submit from Tiptap enter key
const handleTiptapSubmit = () => {
	sendMessage();
};

const scrollToBottom = () => {
	if (messagesContainer.value) {
		messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
	}
};

const isOwnMessage = (msg: any) => {
	return msg.user_created?.id === user.value?.id;
};

const getAvatar = (msg: any) => {
	const u = msg.user_created;
	if (!u) return '';
	if (u.avatar) return `${config.public.assetsUrl}${u.avatar}?key=avatar`;
	return `https://ui-avatars.com/api/?name=${u.first_name}+${u.last_name}&background=6366f1&color=fff&size=32`;
};

// formatChatTimestamp and formatRelativeDay are auto-imported from utils/dates.ts
const formatDate = (dateStr: string) => formatRelativeDay(dateStr);


// Watch channel changes
watch(selectedChannel, () => {
	loadMessages();
	setupRealtimeSubscription();
});

// Reload channels when org changes
watch(selectedOrg, async () => {
	selectedChannel.value = null;
	messages.value = [];
	await loadChannels();
	if (selectedChannel.value) {
		await loadMessages();
		setupRealtimeSubscription();
	}
});

onMounted(async () => {
	await loadChannels();
	if (selectedChannel.value) {
		await loadMessages();
		setupRealtimeSubscription();
	}
});

onUnmounted(() => {
	if (unsubscribe) unsubscribe();
});
</script>

<template>
	<div class="ios-card flex flex-col h-full overflow-hidden">
		<!-- Header -->
		<div class="flex items-center justify-between p-3 border-b border-border/30">
			<NuxtLink to="/channels" class="flex items-center gap-2 hover:opacity-80 transition-opacity">
				<UIcon name="i-heroicons-chat-bubble-bottom-center-text" class="w-5 h-5 text-violet-500" />
				<h3 class="text-sm font-semibold uppercase tracking-wide">Channels</h3>
			</NuxtLink>
			<select
				v-model="selectedChannel"
				class="text-xs rounded-full border bg-background px-3 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
			>
				<option value="" disabled>Select channel</option>
				<option v-for="ch in channels" :key="ch.id" :value="ch.id">
					#{{ ch.name }}
				</option>
			</select>
		</div>

		<!-- Messages -->
		<div
			ref="messagesContainer"
			class="flex-1 overflow-y-auto p-3 space-y-3"
			:class="compact ? 'max-h-72' : 'max-h-96'"
		>
			<div v-if="isLoading" class="flex items-center justify-center h-full">
				<UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-gray-400" />
			</div>

			<div v-else-if="!selectedChannel && channels.length === 0" class="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
				<UIcon name="i-heroicons-chat-bubble-left-right" class="w-8 h-8 mb-2" />
				<p>No channels yet</p>
				<p class="text-xs mt-1">Create a channel to start collaborating.</p>
				<NuxtLink
					to="/channels?new=1"
					class="inline-flex items-center gap-1 mt-3 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-medium hover:bg-primary/90 transition-colors"
				>
					<UIcon name="i-heroicons-plus" class="w-3 h-3" />
					Create a channel
				</NuxtLink>
			</div>

			<div v-else-if="!selectedChannel" class="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
				<UIcon name="i-heroicons-chat-bubble-left-right" class="w-8 h-8 mb-2" />
				<p>Select a channel to start chatting</p>
			</div>

			<div v-else-if="messages.length === 0" class="flex flex-col items-center justify-center h-full text-gray-400 text-sm">
				<UIcon name="i-heroicons-chat-bubble-left" class="w-8 h-8 mb-2" />
				<p>No messages yet. Start the conversation!</p>
			</div>

			<template v-else>
				<div
					v-for="msg in messages"
					:key="msg.id"
					class="flex gap-2"
					:class="isOwnMessage(msg) ? 'flex-row-reverse' : ''"
				>
					<img
						:src="getAvatar(msg)"
						:alt="msg.user_created?.first_name"
						class="w-7 h-7 rounded-full flex-shrink-0 mt-0.5"
					/>
					<div
						class="max-w-[75%] rounded-lg px-3 py-2 text-sm overflow-visible"
						:class="
							isOwnMessage(msg)
								? 'bg-primary/10 text-foreground'
								: 'bg-muted text-foreground'
						"
					>
						<p v-if="!isOwnMessage(msg)" class="text-[10px] font-semibold text-muted-foreground mb-0.5">
							{{ msg.user_created?.first_name }}
						</p>
						<p class="whitespace-pre-wrap break-words overflow-wrap-anywhere" v-html="msg.text"></p>
						<p class="text-[10px] text-muted-foreground/70 mt-1 text-right">{{ formatChatTimestamp(msg.date_created) }}</p>
					</div>
				</div>
			</template>
		</div>

		<!-- Input with @mentions support -->
		<div class="border-t border-border/30 p-3">
			<div class="flex items-end gap-2">
				<div class="flex-1 chat-tiptap-wrapper">
					<LazyFormTiptap
						v-model="newMessage"
						:show-toolbar="false"
						:show-char-count="false"
						:allow-uploads="false"
						:enter-to-send="true"
						:disabled="!selectedChannel || isSending"
						:character-limit="2000"
						:organization-id="selectedOrg ?? undefined"
						:team-id="selectedTeam ?? undefined"
						height="min-h-9 max-h-24"
						custom-classes="px-3 py-1.5 text-sm"
						:context="{ collection: 'messages', itemId: selectedChannel }"
						@submit="handleTiptapSubmit"
					/>
				</div>
				<button
					@click="sendMessage"
					:disabled="!newMessage.trim() || !selectedChannel || isSending"
					class="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-primary text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
				>
					<UIcon v-if="isSending" name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
					<UIcon v-else name="i-heroicons-paper-airplane" class="w-4 h-4" />
				</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
/* Ensure @mention tags in messages are visible and not clipped */
:deep(.mention) {
	color: var(--color-primary, #6366f1);
	font-weight: 600;
	white-space: nowrap;
}

/* Keep Tiptap compact inside the chat input */
.chat-tiptap-wrapper :deep(.tiptap-wrapper) {
	position: relative;
}
.chat-tiptap-wrapper :deep(.tiptap-container) {
	border-radius: 0.5rem;
	border-color: var(--color-gray-200);
	font-size: 0.875rem;
	overflow-y: auto;
}
.chat-tiptap-wrapper :deep(.tiptap-container .ProseMirror) {
	min-height: 2.25rem;
	max-height: 6rem;
	padding: 0.375rem 0;
}
.chat-tiptap-wrapper :deep(.tiptap-container .ProseMirror p.is-editor-empty:first-child::before) {
	content: 'Type a message... (@ to mention)';
	color: var(--color-gray-400);
	pointer-events: none;
	float: left;
	height: 0;
}
</style>
