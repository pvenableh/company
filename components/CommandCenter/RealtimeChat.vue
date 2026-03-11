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
		const result = await channelItems.list({
			fields: ['id', 'name', 'organization.name'],
			filter: { status: { _eq: 'published' } },
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
	newMessage.value = '';

	try {
		await messageItems.create({
			text: content,
			channel: selectedChannel.value,
			status: 'published',
		});
		await nextTick();
		scrollToBottom();
	} catch (e) {
		console.error('[Chat] Failed to send message:', e);
		newMessage.value = content; // restore on failure
	} finally {
		isSending.value = false;
	}
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

const formatTime = (dateStr: string) => {
	const d = new Date(dateStr);
	return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (dateStr: string) => {
	const d = new Date(dateStr);
	const today = new Date();
	if (d.toDateString() === today.toDateString()) return 'Today';
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);
	if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
	return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const handleKeydown = (e: KeyboardEvent) => {
	if (e.key === 'Enter' && !e.shiftKey) {
		e.preventDefault();
		sendMessage();
	}
};

// Watch channel changes
watch(selectedChannel, () => {
	loadMessages();
	setupRealtimeSubscription();
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
	<div class="flex flex-col h-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
		<!-- Header -->
		<div class="flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-700">
			<div class="flex items-center gap-2">
				<UIcon name="i-heroicons-chat-bubble-bottom-center-text" class="w-5 h-5 text-violet-500" />
				<h3 class="text-sm font-semibold uppercase tracking-wide">Chat</h3>
			</div>
			<select
				v-model="selectedChannel"
				class="text-xs border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1 bg-transparent dark:text-white focus:outline-none focus:ring-1 focus:ring-primary"
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
						class="max-w-[75%] rounded-lg px-3 py-2 text-sm"
						:class="
							isOwnMessage(msg)
								? 'bg-primary/10 text-gray-900 dark:text-white'
								: 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
						"
					>
						<p v-if="!isOwnMessage(msg)" class="text-[10px] font-semibold text-gray-500 mb-0.5">
							{{ msg.user_created?.first_name }}
						</p>
						<p class="whitespace-pre-wrap break-words" v-html="msg.text"></p>
						<p class="text-[10px] text-gray-400 mt-1 text-right">{{ formatTime(msg.date_created) }}</p>
					</div>
				</div>
			</template>
		</div>

		<!-- Input -->
		<div class="border-t border-gray-100 dark:border-gray-700 p-3">
			<div class="flex items-end gap-2">
				<textarea
					v-model="newMessage"
					@keydown="handleKeydown"
					:disabled="!selectedChannel || isSending"
					placeholder="Type a message..."
					rows="1"
					class="flex-1 resize-none text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-transparent dark:text-white focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-gray-400"
				/>
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
