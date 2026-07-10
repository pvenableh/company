<script setup>
/**
 * Channels comms hub — the apps-layout home for realtime chat.
 *
 * One page, optional `channel` param: /apps/channels shows the roster; adding a
 * channel name (/apps/channels/general) selects it. Desktop renders both panes
 * side by side; mobile shows one at a time (list → tap → conversation → back),
 * so the URL is the single source of truth for which pane is visible.
 *
 * Reuses the modern, token-based <ChannelsMessage> + Tiptap composer from the
 * classic pages; only the shell was rebuilt to live inside the apps content
 * region (no more h-[calc(100vh-64px)]). Read-state/unread + search land in
 * later phases (project_channels_apps_home).
 */
import { Button } from '~/components/ui/button';
import { useRealtimeSubscription } from '~/composables/useRealtimeSubscription';

definePageMeta({ middleware: ['auth'], layout: 'apps' });

const route = useRoute();
const { selectedOrg, organizationOptions } = useOrganization();
const { selectedClient } = useClients();
const { canAccess } = useOrgRole();
const { setEntity, clearEntity, sidebarOpen } = useEntityPageContext();
const toast = useToast();

const isAdmin = computed(() => canAccess('channels'));
const activeName = computed(() => (route.params.channel ? String(route.params.channel) : null));

// Channel names are slugs, but seeded data can carry a stray leading '#'.
// Strip it for display (we render our own '#') and encode for the URL so
// special characters never leak into the path as a fragment.
const cleanName = (name) => (name ? String(name).replace(/^#+/, '') : '');
const channelHref = (name) => `/apps/channels/${encodeURIComponent(name)}`;
const displayName = computed(() => cleanName(activeName.value));

useHead({ title: computed(() => (activeName.value ? `#${displayName.value} | Channels` : 'Channels | Earnest')) });

/* ---------------------------------------------------------------- Left pane */
const listFilter = computed(() => {
	const filters = [{ status: { _in: ['published', 'draft'] } }];
	if (selectedOrg.value) {
		filters.push({ organization: { _eq: selectedOrg.value } });
	} else if (organizationOptions.value?.length) {
		filters.push({ organization: { _in: organizationOptions.value.filter((o) => o.id).map((o) => o.id) } });
	}
	if (selectedClient.value && selectedClient.value !== 'org') {
		filters.push({ client: { _eq: selectedClient.value } });
	} else if (selectedClient.value === 'org') {
		filters.push({ client: { _null: true } });
	}
	return { _and: filters };
});

const {
	data: channels,
	isLoading: channelsLoading,
	updateFilter: updateChannelsFilter,
} = useRealtimeSubscription(
	'channels',
	['id', 'name', 'organization.id', 'project.id', 'project.title', 'ticket.id', 'ticket.title', 'client', 'messages.id', 'messages.status'],
	listFilter.value,
	'name',
);
watch(listFilter, (f) => updateChannelsFilter(f));

const channelQuery = ref('');
const sortedChannels = computed(() => {
	const list = (channels.value || []).slice().sort((a, b) => a.name.localeCompare(b.name));
	const q = channelQuery.value.trim().toLowerCase();
	const filtered = q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list;
	return filtered.map((c) => ({ ...c, messageCount: c.messages?.filter((m) => m.status === 'published').length || 0 }));
});

/* ------------------------------------------------ Active channel + messages */
const activeChannelFilter = computed(() => (activeName.value ? { name: { _eq: activeName.value } } : { id: { _null: true } }));
const { data: activeChannelRows, updateFilter: updateActiveChannelFilter } = useRealtimeSubscription(
	'channels',
	['id', 'name', 'organization', 'project'],
	activeChannelFilter.value,
);
watch(activeChannelFilter, (f) => updateActiveChannelFilter(f));

const activeChannel = computed(() => activeChannelRows.value?.[0] || null);
const activeChannelId = computed(() => activeChannel.value?.id || null);

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
	activeName.value ? { channel: { name: { _eq: activeName.value } }, status: { _eq: 'published' } } : { id: { _null: true } },
);
const {
	data: messages,
	isLoading: messagesLoading,
	isConnected,
	error: messagesError,
	refresh: refreshMessages,
	updateFilter: updateMessagesFilter,
} = useRealtimeSubscription('messages', messageFields, messageFilter.value, '-date_created');
watch(messageFilter, (f) => updateMessagesFilter(f));

const topLevelMessages = computed(() => {
	if (!messages.value) return [];
	const ids = new Set(messages.value.map((m) => m.id));
	return messages.value.filter((m) => !m.parent_id || !ids.has(m.parent_id));
});

// Keep the Ask-Earnest sidebar anchored to the open channel.
watch(
	[activeChannelId, activeName],
	([id, name]) => {
		if (id && name) setEntity('channel', String(id), `#${name}`);
	},
	{ immediate: true },
);
onUnmounted(() => clearEntity());

/* ------------------------------------------------------------------ Compose */
const newMessage = ref('');
const sending = ref(false);
const messagesContainer = ref(null);

const sendMessage = async () => {
	const text = newMessage.value?.trim();
	if (!text || !activeChannelId.value || sending.value) return;
	sending.value = true;
	try {
		await $fetch('/api/messages', {
			method: 'POST',
			body: { text: newMessage.value, channel: activeChannelId.value, status: 'published' },
		});
		newMessage.value = '';
	} catch (error) {
		console.error('Error sending message:', error);
		toast.add({ title: 'Failed to send message', color: 'red' });
	} finally {
		sending.value = false;
	}
};

const scrollToBottom = () => {
	nextTick(() => {
		if (messagesContainer.value) messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
	});
};
watch(topLevelMessages, (next, prev) => {
	if ((next?.length || 0) > (prev?.length || 0)) scrollToBottom();
});
watch(activeName, () => scrollToBottom());

/* ------------------------------------------------------------ Create channel */
const showCreate = ref(false);
const newChannelName = ref('');
const creating = ref(false);
const channelItems = useDirectusItems('channels');

const createChannel = async () => {
	if (!newChannelName.value || newChannelName.value.length < 3) return;
	creating.value = true;
	try {
		const data = { name: slugify(newChannelName.value), organization: selectedOrg.value || undefined, status: 'published' };
		if (selectedClient.value && selectedClient.value !== 'org') data.client = selectedClient.value;
		const created = await channelItems.create(data);
		toast.add({ title: 'Channel created', color: 'green' });
		showCreate.value = false;
		newChannelName.value = '';
		if (created?.name) navigateTo(channelHref(created.name));
	} catch (err) {
		console.error('Error creating channel:', err);
		toast.add({ title: 'Failed to create channel', color: 'red' });
	} finally {
		creating.value = false;
	}
};
</script>

<template>
	<div class="channels-hub flex h-full min-h-0">
		<!-- ------------------------------------------------------ Left: roster -->
		<aside
			class="flex-col w-full md:w-[280px] md:shrink-0 md:border-r border-border/50 min-h-0"
			:class="activeName ? 'hidden md:flex' : 'flex'"
		>
			<div class="px-4 pt-4 pb-2 shrink-0">
				<div class="flex items-center justify-between mb-3">
					<h1 class="text-lg font-semibold text-foreground">Channels</h1>
					<Button v-if="isAdmin" size="sm" class="h-8 gap-1.5" @click="showCreate = true">
						<Icon name="lucide:plus" class="w-3.5 h-3.5" />
						New
					</Button>
				</div>
				<div class="relative">
					<Icon name="lucide:search" class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
					<input
						v-model="channelQuery"
						type="text"
						placeholder="Filter channels"
						class="w-full h-9 pl-9 pr-3 rounded-full bg-muted/30 border border-border/50 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all"
					>
				</div>
			</div>

			<div class="flex-1 overflow-y-auto px-2 pb-4 messages-scroll min-h-0">
				<div v-if="channelsLoading" class="space-y-1 px-2 pt-1">
					<div v-for="n in 6" :key="n" class="h-9 rounded-lg animate-pulse bg-muted/20" />
				</div>
				<template v-else-if="sortedChannels.length">
					<NuxtLink
						v-for="channel in sortedChannels"
						:key="channel.id"
						:to="channelHref(channel.name)"
						class="group flex items-center gap-2 px-3 py-2 rounded-lg transition-colors"
						:class="channel.name === activeName ? 'bg-primary/10 text-primary' : 'hover:bg-muted/30 text-foreground'"
					>
						<span class="text-muted-foreground/40 text-sm shrink-0">#</span>
						<span class="flex-1 min-w-0 text-sm font-medium truncate">{{ cleanName(channel.name) }}</span>
						<span
							v-if="channel.messageCount"
							class="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
							:class="channel.name === activeName ? 'bg-primary/20 text-primary' : 'bg-muted/60 text-muted-foreground'"
						>{{ channel.messageCount }}</span>
					</NuxtLink>
				</template>
				<div v-else class="flex flex-col items-center justify-center text-center py-12 px-4">
					<Icon name="lucide:hash" class="w-8 h-8 text-muted-foreground/30 mb-2" />
					<p class="text-sm text-muted-foreground">No channels yet</p>
					<Button v-if="isAdmin" size="sm" variant="outline" class="mt-3 gap-1.5" @click="showCreate = true">
						<Icon name="lucide:plus" class="w-3.5 h-3.5" />
						New Channel
					</Button>
				</div>
			</div>
		</aside>

		<!-- ------------------------------------------------ Right: conversation -->
		<section
			class="flex-1 flex-col min-w-0 min-h-0"
			:class="activeName ? 'flex' : 'hidden md:flex'"
		>
			<template v-if="activeName">
				<!-- Header -->
				<div class="flex items-center justify-between px-5 py-3 border-b border-border/50 shrink-0">
					<div class="flex items-center gap-3 min-w-0">
						<NuxtLink to="/apps/channels" class="md:hidden text-muted-foreground hover:text-foreground transition-colors">
							<Icon name="lucide:chevron-left" class="w-5 h-5" />
						</NuxtLink>
						<div class="flex items-center gap-2 min-w-0">
							<h2 class="text-base font-semibold truncate">#{{ displayName }}</h2>
							<span
								class="w-2 h-2 rounded-full shrink-0"
								:class="isConnected ? 'bg-success' : 'bg-destructive'"
								:title="isConnected ? 'Connected' : 'Disconnected'"
							/>
						</div>
					</div>
					<div class="flex items-center gap-1.5 shrink-0">
						<Button variant="outline" size="sm" class="h-8 gap-1 text-primary" @click="sidebarOpen = true">
							<EarnestIcon class="w-3.5 h-3.5" />
							<span class="hidden sm:inline">Ask Earnest</span>
						</Button>
						<LayoutShareButton :title="`#${displayName} | Earnest`" />
					</div>
				</div>

				<!-- Connection error -->
				<div v-if="messagesError" class="px-5 py-2 bg-destructive/10 border-b border-destructive/20 flex items-center justify-between shrink-0">
					<p class="text-sm text-destructive">Connection error. Messages may not be up to date.</p>
					<button class="text-xs text-destructive font-medium" @click="refreshMessages">Retry</button>
				</div>

				<!-- Messages -->
				<div ref="messagesContainer" class="flex-1 overflow-y-auto px-5 py-4 messages-scroll min-h-0">
					<div v-if="messagesLoading" class="space-y-4">
						<div v-for="n in 5" :key="n" class="flex items-start gap-3">
							<div class="w-8 h-8 rounded-full bg-muted/60 animate-pulse shrink-0" />
							<div class="flex-1 space-y-1.5">
								<div class="h-3 bg-muted/40 rounded w-24 animate-pulse" />
								<div class="h-4 bg-muted/40 rounded w-3/4 animate-pulse" />
							</div>
						</div>
					</div>
					<div v-else-if="topLevelMessages.length" class="space-y-3">
						<ChannelsMessage v-for="message in topLevelMessages" :key="message.id" :message="message" />
					</div>
					<div v-else class="flex flex-col items-center justify-center h-full text-center">
						<div class="w-12 h-12 rounded-2xl bg-muted/40 flex items-center justify-center mb-3">
							<Icon name="lucide:hash" class="w-6 h-6 text-muted-foreground/40" />
						</div>
						<p class="text-sm font-medium text-muted-foreground">This is the start of #{{ displayName }}</p>
						<p class="text-xs text-muted-foreground/60 mt-1">Send a message to get the conversation going.</p>
					</div>
				</div>

				<!-- Composer -->
				<div class="px-5 pb-4 pt-2 shrink-0">
					<div class="channel-input flex items-end gap-2 rounded-2xl border border-border/60 bg-muted/20 px-2 py-1 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
						<LazyFormTiptap
							v-model="newMessage"
							:show-toolbar="true"
							:disabled="!activeChannelId"
							:organization-id="selectedOrg"
							:enter-to-send="true"
							height="min-h-[36px]"
							custom-classes="px-2 py-1.5"
							:character-limit="0"
							:show-char-count="false"
							:allow-uploads="true"
							:context="{ collection: 'messages', itemId: activeChannelId }"
							class="flex-1 channel-tiptap"
							@submit="sendMessage"
						/>
						<button
							v-if="newMessage?.trim()"
							class="shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors mb-1 disabled:opacity-50"
							:disabled="sending || !activeChannelId"
							@click="sendMessage"
						>
							<Icon name="lucide:arrow-up" class="w-4 h-4 text-primary-foreground" />
						</button>
					</div>
					<p class="text-[10px] text-muted-foreground/40 mt-1.5 px-1">
						<kbd class="px-1 py-0.5 rounded bg-muted/40 text-[9px] font-mono">Enter</kbd> to send,
						<kbd class="px-1 py-0.5 rounded bg-muted/40 text-[9px] font-mono">Shift + Enter</kbd> for new line.
						Type <kbd class="px-1 py-0.5 rounded bg-muted/40 text-[9px] font-mono">@</kbd> to mention.
					</p>
				</div>
			</template>

			<!-- Desktop: nothing selected -->
			<div v-else class="flex-1 flex flex-col items-center justify-center text-center px-6">
				<div class="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mb-3">
					<Icon name="lucide:messages-square" class="w-7 h-7 text-muted-foreground/40" />
				</div>
				<p class="text-sm font-medium text-muted-foreground">Select a channel</p>
				<p class="text-xs text-muted-foreground/60 mt-1">Pick a conversation from the list to start chatting.</p>
			</div>
		</section>

		<!-- Create channel -->
		<ClientOnly>
			<UModal v-model="showCreate">
				<div class="p-6 space-y-4">
					<h3 class="text-lg font-semibold text-foreground">Create channel</h3>
					<div class="space-y-1.5">
						<label class="text-[10px] uppercase tracking-wider text-muted-foreground">Channel name</label>
						<input
							v-model="newChannelName"
							type="text"
							placeholder="e.g. general, design, launch"
							class="w-full h-10 px-4 rounded-full bg-muted/30 border border-border/50 text-sm focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all"
							@keydown.enter="createChannel"
						>
						<p v-if="newChannelName && newChannelName.length < 3" class="text-xs text-destructive">Must be at least 3 characters.</p>
					</div>
					<div class="flex justify-end">
						<Button :disabled="creating || !newChannelName || newChannelName.length < 3" @click="createChannel">
							{{ creating ? 'Creating…' : 'Create channel' }}
						</Button>
					</div>
				</div>
			</UModal>
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
.messages-scroll:hover { scrollbar-color: var(--border) transparent; }
.messages-scroll::-webkit-scrollbar { width: 6px; }
.messages-scroll::-webkit-scrollbar-track { background: transparent; }
.messages-scroll::-webkit-scrollbar-thumb { @apply bg-transparent rounded-full; }
.messages-scroll:hover::-webkit-scrollbar-thumb { @apply bg-border; }

/* Strip Tiptap default chrome so the composer reads as a single pill bar. */
.channel-tiptap :deep(.tiptap-wrapper) { border: none !important; }
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
