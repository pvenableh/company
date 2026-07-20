<script setup lang="ts">
import { toast } from 'vue-sonner';

definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Messages | Client Portal' });

const { selectedOrg, getOrganizationFilter } = useOrganization();
const { clientScope } = useOrgRole();
const { user } = useDirectusAuth();
const config = useRuntimeConfig();

const channelItems = usePortalItems('channels');
const messageItems = usePortalItems('messages');

const loadingChannels = ref(true);
const channels = ref<any[]>([]);
const selectedChannel = ref<any | null>(null);
const messages = ref<any[]>([]);
const loadingMessages = ref(false);
const newMessage = ref('');
const sending = ref(false);

async function loadChannels() {
	if (!selectedOrg.value) return;
	loadingChannels.value = true;

	try {
		const filter: any[] = [];
		const orgFilter = getOrganizationFilter();
		if (orgFilter?.organization) {
			filter.push({ organization: orgFilter.organization });
		}

		// Client users see channels associated with their client.
		// Visibility is enforced server-side by /api/portal/items — the page-side
		// filter is redundant but harmless.
		if (clientScope.value) {
			filter.push({ client: { _eq: clientScope.value } });
		}

		filter.push({ status: { _eq: 'published' } });

		channels.value = await channelItems.list({
			filter: filter.length ? { _and: filter } : undefined,
			fields: ['id', 'name', 'description', 'status', 'date_updated'],
			sort: ['-date_updated'],
			limit: 50,
		});

		// Auto-select first channel
		if (channels.value.length && !selectedChannel.value) {
			selectChannel(channels.value[0]);
		}
	} catch (err) {
		console.error('Failed to load channels:', err);
	} finally {
		loadingChannels.value = false;
	}
}

async function selectChannel(channel: any) {
	selectedChannel.value = channel;
	await loadMessages();
}

async function loadMessages() {
	if (!selectedChannel.value) return;
	loadingMessages.value = true;

	try {
		messages.value = await messageItems.list({
			filter: {
				channel: { _eq: selectedChannel.value.id },
			},
			fields: [
				'id',
				'text',
				'date_created',
				'user_created.id',
				'user_created.first_name',
				'user_created.last_name',
				'user_created.avatar',
			],
			sort: ['date_created'],
			limit: 100,
		});
	} catch (err) {
		console.error('Failed to load messages:', err);
	} finally {
		loadingMessages.value = false;
	}
}

// Mentionable users = the agency account team (assigned to this client's
// projects). Scoped server-side so clients never see the full org roster.
// Cached after first fetch; the TipTap composer calls this on each '@'.
const accountTeam = ref<any[] | null>(null);
async function fetchAccountTeam() {
	if (accountTeam.value) return accountTeam.value;
	try {
		accountTeam.value = await $fetch<any[]>('/api/portal/account-team');
	} catch {
		accountTeam.value = [];
	}
	return accountTeam.value;
}

// Strip HTML to detect an "empty" TipTap doc (e.g. "<p></p>").
function isBlankHtml(html: string): boolean {
	return !html || !html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim();
}

async function sendMessage() {
	if (isBlankHtml(newMessage.value) || !selectedChannel.value || sending.value) return;
	sending.value = true;

	try {
		await $fetch('/api/portal/message', {
			method: 'POST',
			body: {
				text: newMessage.value,
				channel: selectedChannel.value.id,
			},
		});
		newMessage.value = '';
		await loadMessages();

		// Scroll to bottom after new message
		nextTick(() => {
			const container = document.getElementById('messages-container');
			if (container) {
				container.scrollTop = container.scrollHeight;
			}
		});
	} catch (err: any) {
		toast.error(err?.message || 'Failed to send message');
	} finally {
		sending.value = false;
	}
}

function isOwnMessage(message: any): boolean {
	const userId = typeof message.user_created === 'object'
		? message.user_created?.id
		: message.user_created;
	return userId === user.value?.id;
}

function formatTime(dateStr: string): string {
	if (!dateStr) return '';
	const date = new Date(dateStr);
	const now = new Date();
	const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

	if (diffDays === 0) {
		return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	} else if (diffDays === 1) {
		return 'Yesterday ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	} else if (diffDays < 7) {
		return date.toLocaleDateString(undefined, { weekday: 'short' }) + ' ' +
			date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	}
	return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
		date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

onMounted(() => loadChannels());
watch(() => selectedOrg.value, () => {
	selectedChannel.value = null;
	loadChannels();
});
</script>

<template>
	<div class="portal-page portal-messages-page">
		<AppHeader title="Messages" />

		<div class="portal-messages-body">
		<!-- Channel List Sidebar -->
		<div class="w-full max-w-[240px] border-r border-border/40 flex flex-col shrink-0 hidden sm:flex">
			<div class="p-3 border-b border-border/40">
				<h2 class="text-sm font-medium text-muted-foreground">Channels</h2>
			</div>

			<div v-if="loadingChannels" class="flex items-center justify-center py-8">
				<Icon name="lucide:loader-2" class="w-5 h-5 text-muted-foreground animate-spin" />
			</div>

			<div v-else-if="!channels.length" class="p-4 text-center">
				<p class="text-xs text-muted-foreground">No channels available.</p>
			</div>

			<nav v-else class="flex-1 overflow-y-auto p-2 space-y-0.5">
				<button
					v-for="channel in channels"
					:key="channel.id"
					class="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-left transition-colors"
					:class="selectedChannel?.id === channel.id
						? 'bg-muted/80 text-foreground font-medium'
						: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
					@click="selectChannel(channel)"
				>
					<Icon :name="'lucide:hash'" class="w-4 h-4 shrink-0" />
					<span class="truncate">{{ channel.name }}</span>
				</button>
			</nav>
		</div>

		<!-- Channel selector for mobile -->
		<div class="sm:hidden w-full" v-if="!selectedChannel">
			<div class="p-4">
				<h2 class="text-lg font-semibold mb-4">Channels</h2>
				<div v-if="loadingChannels" class="flex items-center justify-center py-8">
					<Icon name="lucide:loader-2" class="w-5 h-5 text-muted-foreground animate-spin" />
				</div>
				<div v-else class="space-y-2">
					<button
						v-for="channel in channels"
						:key="channel.id"
						class="w-full ios-card p-4 text-left"
						@click="selectChannel(channel)"
					>
						<div class="flex items-center gap-3">
							<Icon :name="'lucide:hash'" class="w-5 h-5 text-muted-foreground" />
							<div>
								<p class="font-medium text-sm">{{ channel.name }}</p>
								<p v-if="channel.description" class="text-xs text-muted-foreground line-clamp-1">{{ channel.description }}</p>
							</div>
						</div>
					</button>
				</div>
			</div>
		</div>

		<!-- Message Area -->
		<div
			v-if="selectedChannel"
			class="flex-1 flex flex-col min-w-0"
		>
			<!-- Channel Header -->
			<div class="p-3 border-b border-border/40 flex items-center gap-2 shrink-0">
				<button class="sm:hidden p-1 rounded-lg hover:bg-muted/60" @click="selectedChannel = null">
					<Icon name="lucide:chevron-left" class="w-5 h-5" />
				</button>
				<Icon :name="'lucide:hash'" class="w-4 h-4 text-muted-foreground" />
				<h3 class="font-medium text-sm">{{ selectedChannel.name }}</h3>
			</div>

			<!-- Messages -->
			<div
				id="messages-container"
				class="flex-1 overflow-y-auto p-4 space-y-3"
			>
				<div v-if="loadingMessages" class="flex items-center justify-center py-8">
					<Icon name="lucide:loader-2" class="w-5 h-5 text-muted-foreground animate-spin" />
				</div>

				<div v-else-if="!messages.length" class="flex flex-col items-center justify-center py-12 gap-2">
					<Icon name="lucide:message-square" class="w-8 h-8 text-muted-foreground/30" />
					<p class="text-sm text-muted-foreground">No messages yet. Start the conversation!</p>
				</div>

				<template v-else>
					<div
						v-for="message in messages"
						:key="message.id"
						class="flex gap-2.5"
						:class="isOwnMessage(message) ? 'flex-row-reverse' : ''"
					>
						<!-- Avatar -->
						<div class="w-7 h-7 rounded-full bg-muted overflow-hidden flex items-center justify-center shrink-0">
							<img
								v-if="message.user_created?.avatar"
								:src="`${config.public.assetsUrl}${message.user_created.avatar}?key=avatar`"
								class="w-full h-full object-cover"
							/>
							<span v-else class="text-[10px] font-medium text-muted-foreground">
								{{ (message.user_created?.first_name?.[0] || '') + (message.user_created?.last_name?.[0] || '') }}
							</span>
						</div>

						<!-- Message bubble -->
						<div class="max-w-[75%]">
							<div class="flex items-baseline gap-2 mb-0.5" :class="isOwnMessage(message) ? 'flex-row-reverse' : ''">
								<span class="text-xs font-medium">
									{{ message.user_created?.first_name }} {{ message.user_created?.last_name }}
								</span>
								<span class="text-[10px] text-muted-foreground">
									{{ formatTime(message.date_created) }}
								</span>
							</div>
							<div
								class="px-3 py-2 rounded-2xl text-sm"
								:class="isOwnMessage(message)
									? 'bg-primary text-primary-foreground rounded-tr-sm'
									: 'bg-muted/60 rounded-tl-sm'"
							>
								<div class="msg-text" v-html="message.text" />
							</div>
						</div>
					</div>
				</template>
			</div>

			<!-- Message Input — TipTap composer (HTML formatting + @mentions),
			     matching the Earnest channels surface. Mentions are scoped to the
			     account team via :mention-fetch. -->
			<div class="p-3 border-t border-border/40 shrink-0">
				<div class="channel-input flex items-end gap-2 rounded-2xl border border-border/60 bg-muted/20 px-2 py-1 focus-within:border-primary/50 transition-all">
					<LazyFormTiptap
						v-model="newMessage"
						:show-toolbar="true"
						:disabled="sending || !selectedChannel"
						:organization-id="selectedOrg"
						:mention-fetch="fetchAccountTeam"
						:enter-to-send="true"
						height="min-h-[36px]"
						custom-classes="px-2 py-1.5"
						:character-limit="0"
						:show-char-count="false"
						:allow-uploads="true"
						:context="{ collection: 'messages', itemId: selectedChannel?.id }"
						class="flex-1 channel-tiptap"
						@submit="sendMessage"
					/>
					<button
						v-if="!isBlankHtml(newMessage)"
						class="shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors mb-1 disabled:opacity-50"
						:disabled="sending || !selectedChannel"
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

		<!-- No channel selected (desktop) -->
		<div v-else class="flex-1 hidden sm:flex items-center justify-center">
			<div class="text-center">
				<Icon name="lucide:message-square" class="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
				<p class="text-sm text-muted-foreground">Select a channel to start messaging.</p>
			</div>
		</div>
		</div>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

/* The Messages page is a special-case full-height layout: header on top,
 * channel list + message pane fill the remaining viewport. We use the
 * page wrapper's flex column so the body claims whatever's left after
 * AppHeader. */
.portal-messages-page {
	@apply flex flex-col h-full min-h-0;
}

.portal-messages-body {
	@apply flex flex-1 min-h-0;
}

/* Rendered message HTML (formatting + @mentions), mirroring the Earnest
 * channels surface. `color: inherit` keeps text readable inside the coloured
 * own-message bubble. */
.msg-text { font-size: 14px; line-height: 1.6; color: inherit; }
.msg-text :deep(p) { margin: 0; }
.msg-text :deep(a) { text-decoration: underline; }
.msg-text :deep(ul), .msg-text :deep(ol) { margin: 0.3em 0; padding-left: 1.1em; }
.msg-text :deep(.mention) {
	background: hsl(var(--primary) / 0.12);
	color: hsl(var(--primary));
	border-radius: 4px;
	padding: 1px 6px;
	font-weight: 600;
	font-size: 0.9em;
}
/* On the primary-coloured own-message bubble, tint mentions for contrast. */
.bg-primary .msg-text :deep(.mention) {
	background: hsl(var(--primary-foreground) / 0.18);
	color: hsl(var(--primary-foreground));
}

/* Neutralise the inner Tiptap chrome so the outer .channel-input owns the
 * focus ring — identical to the Earnest ChannelThread composer. */
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
.channel-tiptap :deep(.tiptap-container .ProseMirror) { font-size: 0.875rem; line-height: 1.625; min-height: 24px; }
</style>
