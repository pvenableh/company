<script setup>
const { selectedOrg, organizationOptions } = useOrganization();
const { user } = useDirectusAuth();
const { hasAdminAccess } = useTeams();

const isAdmin = computed(() => hasAdminAccess(user.value));
const showCreateChannel = ref(false);
const newChannelName = ref('');
const creatingChannel = ref(false);
const channelItems = useDirectusItems('channels');
const toast = useToast();

const createChannel = async () => {
	if (!newChannelName.value || newChannelName.value.length < 3) return;
	creatingChannel.value = true;
	try {
		await channelItems.create({
			name: slugify(newChannelName.value),
			organization: selectedOrg.value || undefined,
			status: 'published',
		});
		toast.add({ title: 'Channel created', color: 'green' });
		newChannelName.value = '';
		showCreateChannel.value = false;
		refreshChannels();
	} catch (err) {
		console.error('Error creating channel:', err);
		toast.add({ title: 'Failed to create channel', color: 'red' });
	} finally {
		creatingChannel.value = false;
	}
};

definePageMeta({
	middleware: ['auth'],
});

// Reactive filter

const currentFilter = computed(() => {
	if (!organizationOptions.value?.length) return {};

	const orgFilter = selectedOrg.value
		? { _eq: selectedOrg.value }
		: {
				_in: organizationOptions.value.filter((org) => org.id !== null).map((org) => org.id),
			};

	return {
		_and: [{ status: { _in: ['published', 'draft'] } }, { organization: orgFilter }],
	};
});
// Real-time subscription
const {
	data: channels,
	isLoading: channelsLoading,
	error: channelsError,
	isConnected,
	refresh: refreshChannels,
	updateFilter,
} = useRealtimeSubscription(
	'channels',
	[
		'id',
		'name',
		'organization.id',
		'organization.name',
		'project.id',
		'project.title',
		'messages.id',
		'messages.status',
		'messages.date_created',
	],
	currentFilter.value,
	'name',
);

// Keep subscription filter in sync with reactive filter
watch(currentFilter, (newFilter) => {
	updateFilter(newFilter);
});

const localChannels = ref([]);

watch(
	[() => channels.value, selectedOrg],
	([newChannels]) => {
		if (!newChannels) return;

		localChannels.value = newChannels.filter(
			(channel) => !selectedOrg.value || channel.organization?.id === selectedOrg.value,
		);
	},
	{ immediate: true },
);

const sortedChannels = computed(() => {
	if (!localChannels.value) return [];
	return localChannels.value
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((channel) => ({
			...channel,
			messageCount: channel.messages?.filter((msg) => msg.status === 'published').length || 0,
		}));
});
</script>

<template>
	<div class="max-w-7xl md:px-6 mx-auto flex items-start justify-start flex-col relative px-4 pt-20 min-h-svh">
		<div class="flex items-center justify-between w-full mb-8">
			<div>
				<h1 class="text-2xl font-bold text-gray-900 dark:text-white">Messages</h1>
				<p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Team channels and conversations</p>
			</div>
			<UButton v-if="isAdmin" icon="i-heroicons-plus" size="sm" @click="showCreateChannel = true">
				New Channel
			</UButton>
		</div>

		<!-- Create Channel Modal -->
		<UModal v-model="showCreateChannel">
			<div class="p-6 space-y-4">
				<h3 class="text-lg font-semibold">Create New Channel</h3>
				<UFormGroup label="Channel Name" required>
					<UInput v-model="newChannelName" placeholder="e.g. general, design, marketing" :disabled="creatingChannel" />
				</UFormGroup>
				<p v-if="newChannelName && newChannelName.length < 3" class="text-xs text-red-500">
					Channel name must be at least 3 characters.
				</p>
				<div class="flex justify-end gap-2">
					<UButton color="gray" variant="soft" @click="showCreateChannel = false">Cancel</UButton>
					<UButton :loading="creatingChannel" :disabled="!newChannelName || newChannelName.length < 3" @click="createChannel">
						Create Channel
					</UButton>
				</div>
			</div>
		</UModal>

		<!-- Coming Soon for non-admin users -->
		<div v-if="!isAdmin" class="flex flex-col items-center justify-center z-10 min-h-[60vh] w-full page__inner">
			<h2 class="text-2xl font-proxima-light uppercase tracking-widest text-gray-400">Coming Soon</h2>
			<p class="text-sm text-gray-400 mt-2">This feature is currently under development.</p>
		</div>

		<!-- Admin content -->
		<template v-else>
			<div v-if="channelsLoading" class="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				<USkeleton v-for="n in 6" :key="n" class="h-32" />
			</div>

			<!-- Channels Grid -->
			<div v-else class="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				<template v-if="sortedChannels.length">
					<NuxtLink
						v-for="channel in sortedChannels"
						:key="channel.id"
						:to="'/channels/' + channel.name"
						class="group relative bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700/50 hover:border-primary/30 hover:shadow-sm transition-all duration-200"
					>
						<div class="flex items-center gap-3">
							<div class="w-10 h-10 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 flex items-center justify-center flex-shrink-0">
								<UIcon name="i-heroicons-chat-bubble-left-right" class="w-5 h-5 text-cyan-500" />
							</div>
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2">
									<h3 class="font-semibold text-gray-900 dark:text-white truncate">#{{ channel.name }}</h3>
									<UBadge v-if="channel.messageCount" color="primary" variant="subtle" size="xs" class="font-mono">
										{{ channel.messageCount }}
									</UBadge>
								</div>
								<p v-if="channel.project?.title" class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
									{{ channel.project.title }}
								</p>
								<p v-else class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
									{{ channel.organization?.name || 'General' }}
								</p>
							</div>
							<UIcon
								name="i-heroicons-chevron-right"
								class="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-primary transition-colors flex-shrink-0"
							/>
						</div>
					</NuxtLink>
				</template>

				<!-- Empty State -->
				<div
					v-else
					class="col-span-full flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl"
				>
					<div class="w-14 h-14 rounded-2xl bg-cyan-50 dark:bg-cyan-900/20 flex items-center justify-center mb-4">
						<UIcon name="i-heroicons-chat-bubble-left-right" class="w-7 h-7 text-cyan-400" />
					</div>
					<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-1">No channels yet</h3>
					<p class="text-sm text-gray-500 dark:text-gray-400 text-center">Create a channel to start team conversations.</p>
				</div>
			</div>
		</template>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";
.page__title {
	@apply text-2xl font-bold mb-8;
}

.channel-card {
	@apply transform transition-all duration-200;
}

.channel-card:hover {
	@apply -translate-y-1;
}
</style>
