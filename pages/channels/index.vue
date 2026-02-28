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
	<div class="md:px-6 mx-auto flex items-start justify-start flex-col relative px-4 pt-20 min-h-svh">
		<div class="flex items-center justify-between w-full mb-8">
			<h1 class="text-2xl font-bold">Channels</h1>
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
			<div v-else class="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
				<template v-if="sortedChannels.length">
					<NuxtLink
						v-for="channel in sortedChannels"
						:key="channel.id"
						:to="'/channels/' + channel.name"
						class="group relative bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm hover:shadow-md transition-all duration-200"
					>
						<div class="flex items-start justify-between">
							<div class="space-y-2">
								<div class="flex items-center space-x-2">
									<h3 class="text-lg font-medium">#{{ channel.name }}</h3>
									<UBadge v-if="channel.messageCount" color="primary" variant="subtle" size="sm" class="font-mono">
										{{ channel.messageCount }}
									</UBadge>
								</div>

								<div v-if="channel.project?.title" class="flex items-center text-sm text-gray-500">
									<UIcon name="i-heroicons-folder" class="w-4 h-4 mr-1" />
									{{ channel.project.title }}
								</div>
							</div>

							<UIcon
								name="i-heroicons-arrow-right"
								class="w-5 h-5 text-gray-400 group-hover:text-primary transform group-hover:translate-x-1 transition-all"
							/>
						</div>
					</NuxtLink>
				</template>

				<!-- Empty State -->
				<div
					v-else
					class="col-span-full flex flex-col items-center justify-center py-12 px-4 border-2 border-dashed rounded-lg"
				>
					<UIcon name="i-heroicons-chat-bubble-left-right" class="w-12 h-12 text-gray-400 mb-4" />
					<h3 class="text-lg font-medium">No Channels Found</h3>
					<p class="text-gray-500 text-center mt-2">No channels exist for the current organization.</p>
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
