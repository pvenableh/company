<script setup>
/**
 * ChannelThread — a self-contained, embeddable view of a single channel's
 * conversation: live message list + Tiptap composer + read-state, driven by
 * PROPS (channelId / channelName) rather than the route. Reuses the same
 * primitives as the full channels page (<ChannelsMessage>, the Tiptap composer,
 * useRealtimeSubscription, useChannelUnread, POST /api/messages) so it stays in
 * sync with it, but is intentionally simpler — no folder rail, search, or
 * moderation panel. Drop it into any surface (e.g. the client detail Messages
 * tab) to chat without leaving the page. See project_channels_apps_home.
 */
import { useRealtimeSubscription } from '~/composables/useRealtimeSubscription';

const props = defineProps({
	/** Channel UUID — used to send messages and advance the read cursor. */
	channelId: { type: String, required: true },
	/** Channel name/slug — the realtime message filter keys on name. */
	channelName: { type: String, required: true },
	/** Org id for the composer's mention/user filtering. */
	organizationId: { type: [String, Number], default: null },
	/** Allow hide/remove actions on messages (org managers / moderators). */
	canModerate: { type: Boolean, default: false },
	/** Tailwind height/max-height for the scroll pane. */
	paneClass: { type: String, default: 'max-h-[26rem] min-h-[16rem]' },
});

const toast = useToast();

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

const messageFilter = computed(() =>
	props.channelName
		? { channel: { name: { _eq: props.channelName } }, status: { _eq: 'published' } }
		: { id: { _null: true } },
);

const {
	data: messages,
	isLoading: messagesLoading,
	updateFilter: updateMessagesFilter,
} = useRealtimeSubscription('messages', messageFields, messageFilter.value, '-date_created');
watch(messageFilter, (f) => updateMessagesFilter(f));

// Top-level, published, oldest → newest (subscription is -date_created).
const orderedMessages = computed(() => {
	const list = messages.value || [];
	const ids = new Set(list.map((m) => m.id));
	return list
		.filter((m) => m.status === 'published' && (!m.parent_id || !ids.has(m.parent_id)))
		.sort((a, b) => new Date(a.date_created) - new Date(b.date_created));
});
const newestMessageId = computed(() => orderedMessages.value[orderedMessages.value.length - 1]?.id || null);

/* ------------------------------------------------------- Unread / read-state */
const unread = useChannelUnread();
const dividerAt = ref(null);
const firstUnreadId = computed(() => {
	if (!dividerAt.value) return null;
	const cut = +new Date(dividerAt.value);
	return orderedMessages.value.find((m) => +new Date(m.date_created) > cut)?.id || null;
});

async function openChannel(id) {
	if (!id) {
		dividerAt.value = null;
		return;
	}
	await unread.refresh(); // capture the true pre-read cursor
	dividerAt.value = unread.lastReadAtFor(id);
	unread.markRead(id, newestMessageId.value);
}
watch(() => props.channelId, (id) => openChannel(id), { immediate: true });
// Keep the open thread read as new messages arrive.
watch(newestMessageId, (id) => {
	if (id && props.channelId) unread.markRead(props.channelId, id);
});

/* --------------------------------------------------------------- Composer */
const newMessage = ref('');
const sending = ref(false);
const pane = ref(null);

const scrollToBottom = () => {
	nextTick(() => {
		if (pane.value) pane.value.scrollTop = pane.value.scrollHeight;
	});
};
watch(orderedMessages, (next, prev) => {
	if ((next?.length || 0) > (prev?.length || 0)) scrollToBottom();
});
watch(() => props.channelId, () => scrollToBottom());
onMounted(() => scrollToBottom());

const sendMessage = async () => {
	const text = newMessage.value?.trim();
	if (!text || !props.channelId || sending.value) return;
	sending.value = true;
	try {
		await $fetch('/api/messages', {
			method: 'POST',
			body: { text: newMessage.value, channel: props.channelId, status: 'published' },
		});
		newMessage.value = '';
	} catch (error) {
		console.error('Error sending message:', error);
		toast.add({ title: 'Failed to send message', color: 'red' });
	} finally {
		sending.value = false;
	}
};
</script>

<template>
	<div class="channel-thread flex flex-col">
		<!-- Messages -->
		<div ref="pane" class="flex-1 overflow-y-auto px-1 py-2 min-h-0" :class="paneClass">
			<div v-if="messagesLoading" class="space-y-4">
				<div v-for="n in 4" :key="n" class="flex items-start gap-3">
					<div class="w-8 h-8 rounded-full bg-muted/60 animate-pulse shrink-0" />
					<div class="flex-1 space-y-1.5">
						<div class="h-3 bg-muted/40 rounded w-24 animate-pulse" />
						<div class="h-4 bg-muted/40 rounded w-3/4 animate-pulse" />
					</div>
				</div>
			</div>
			<div v-else-if="orderedMessages.length" class="space-y-3">
				<template v-for="message in orderedMessages" :key="message.id">
					<div v-if="message.id === firstUnreadId" class="flex items-center gap-2 py-1">
						<div class="flex-1 h-px bg-destructive/40" />
						<span class="text-[10px] font-semibold uppercase tracking-wider text-destructive shrink-0">New</span>
						<div class="flex-1 h-px bg-destructive/40" />
					</div>
					<ChannelsMessage
						:message="message"
						:can-moderate="canModerate"
					/>
				</template>
			</div>
			<div v-else class="flex flex-col items-center justify-center h-full text-center py-8">
				<div class="w-12 h-12 rounded-2xl bg-muted/40 flex items-center justify-center mb-3">
					<Icon name="lucide:hash" class="w-6 h-6 text-muted-foreground/40" />
				</div>
				<p class="text-sm font-medium text-muted-foreground">This is the start of #{{ channelName }}</p>
				<p class="text-xs text-muted-foreground/60 mt-1">Send a message to get the conversation going.</p>
			</div>
		</div>

		<!-- Composer -->
		<div class="pt-2 shrink-0">
			<div class="channel-input flex items-end gap-2 rounded-2xl border border-border/60 bg-muted/20 px-2 py-1 focus-within:border-primary/50 transition-all">
				<LazyFormTiptap
					v-model="newMessage"
					:show-toolbar="true"
					:disabled="!channelId"
					:organization-id="organizationId"
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
					class="shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors mb-1 disabled:opacity-50"
					:disabled="sending || !channelId"
					@click="sendMessage"
				>
					<Icon name="lucide:arrow-up" class="w-4 h-4 text-primary-foreground" />
				</button>
			</div>
			<p class="text-[10px] text-muted-foreground/40 mt-1.5 px-1">
				<kbd class="px-1 py-0.5 rounded bg-muted/40 text-[9px] font-mono">Enter</kbd> to send,
				<kbd class="px-1 py-0.5 rounded bg-muted/40 text-[9px] font-mono">Shift + Enter</kbd> for new line.
			</p>
		</div>
	</div>
</template>

<style scoped>
/* Match the channels-page composer: neutralise the inner Tiptap borders and
 * keep only a subtle toolbar divider; the outer .channel-input owns focus. */
.channel-tiptap :deep(.tiptap-wrapper) { border: none !important; box-shadow: none !important; }
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
</style>
