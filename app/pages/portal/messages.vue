<script setup lang="ts">
import { toast } from 'vue-sonner';

definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Portal Messages | Earnest' });

const { selectedOrg, getOrganizationFilter } = useOrganization();
const { clientScope } = useOrgRole();
const { user } = useDirectusAuth();
const config = useRuntimeConfig();

const channelItems = useDirectusItems('channels');
const messageItems = useDirectusItems('messages');

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

		// Client users see channels associated with their client
		if (clientScope.value) {
			filter.push({
				_or: [
					{ client: { _eq: clientScope.value } },
					{ is_public: { _eq: true } },
				],
			});
		}

		filter.push({ status: { _eq: 'published' } });

		channels.value = await channelItems.list({
			filter: filter.length ? { _and: filter } : undefined,
			fields: ['id', 'name', 'description', 'icon', 'status', 'date_updated'],
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
				'content',
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

async function sendMessage() {
	if (!newMessage.value.trim() || !selectedChannel.value) return;
	sending.value = true;

	try {
		await messageItems.create({
			content: newMessage.value.trim(),
			channel: selectedChannel.value.id,
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
	<div class="flex h-[calc(100vh-80px)] max-h-[calc(100vh-80px)]">
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
					<Icon :name="channel.icon || 'lucide:hash'" class="w-4 h-4 shrink-0" />
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
							<Icon :name="channel.icon || 'lucide:hash'" class="w-5 h-5 text-muted-foreground" />
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
					<Icon name="lucide:arrow-left" class="w-5 h-5" />
				</button>
				<Icon :name="selectedChannel.icon || 'lucide:hash'" class="w-4 h-4 text-muted-foreground" />
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
								{{ message.content }}
							</div>
						</div>
					</div>
				</template>
			</div>

			<!-- Message Input -->
			<div class="p-3 border-t border-border/40 shrink-0">
				<form class="flex gap-2" @submit.prevent="sendMessage">
					<input
						v-model="newMessage"
						type="text"
						placeholder="Type a message..."
						class="flex-1 rounded-xl border border-input bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
						:disabled="sending"
					/>
					<button
						type="submit"
						class="p-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
						:disabled="sending || !newMessage.trim()"
					>
						<Icon v-if="sending" name="lucide:loader-2" class="w-5 h-5 animate-spin" />
						<Icon v-else name="lucide:send" class="w-5 h-5" />
					</button>
				</form>
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
</template>
