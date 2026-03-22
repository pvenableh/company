<script setup>
const { selectedOrg, organizationOptions } = useOrganization();
const { selectedClient } = useClients();
const { visibleTeams, fetchTeams, selectedTeam: globalSelectedTeam } = useTeams();
const { user } = useDirectusAuth();
const { canAccess, canCreate: canCreateFeature } = useOrgRole();

const isAdmin = computed(() => canAccess('channels'));
const showCreateChannel = ref(false);

// Local team filter for channels page
const channelTeamFilter = ref(null);
const teamClientIds = ref([]);
const clientsTeamsItems = useDirectusItems('clients_teams');

// Fetch team's assigned clients when team filter changes
watch(channelTeamFilter, async (teamId) => {
	if (!teamId) {
		teamClientIds.value = [];
		return;
	}
	try {
		const junctions = await clientsTeamsItems.list({
			filter: { teams_id: { _eq: teamId } },
			fields: ['clients_id'],
		});
		teamClientIds.value = junctions.map(j => j.clients_id).filter(Boolean);
	} catch (e) {
		console.warn('Could not fetch team clients:', e);
		teamClientIds.value = [];
	}
});
const newChannelName = ref('');
const newChannelProject = ref(null);
const newChannelTicket = ref(null);
const creatingChannel = ref(false);
const channelItems = useDirectusItems('channels');
const projectItems = useDirectusItems('projects');
const ticketItems = useDirectusItems('tickets');
const toast = useToast();

// Fetch projects and tickets for the create modal selects
const availableProjects = ref([]);
const availableTickets = ref([]);

const fetchSelectOptions = async () => {
	try {
		const projectFilter = {
			_and: [
				{ status: { _nin: ['Archived', 'completed'] } },
				...(selectedOrg.value ? [{ organization: { _eq: selectedOrg.value } }] : []),
				...(selectedClient.value && selectedClient.value !== 'org' ? [{ client: { _eq: selectedClient.value } }] : []),
			],
		};
		const ticketFilter = {
			_and: [
				{ status: { _nin: ['completed', 'archived'] } },
				...(selectedOrg.value ? [{ organization: { _eq: selectedOrg.value } }] : []),
				...(selectedClient.value && selectedClient.value !== 'org' ? [{ client: { _eq: selectedClient.value } }] : []),
			],
		};
		const [projects, tickets] = await Promise.all([
			projectItems.list({
				fields: ['id', 'title'],
				filter: projectFilter,
				sort: ['title'],
				limit: 100,
			}),
			ticketItems.list({
				fields: ['id', 'title'],
				filter: ticketFilter,
				sort: ['-date_created'],
				limit: 100,
			}),
		]);
		availableProjects.value = projects;
		availableTickets.value = tickets;
	} catch (e) {
		console.warn('Could not fetch projects/tickets:', e);
	}
};

watch(showCreateChannel, (open) => {
	if (open) fetchSelectOptions();
});

const createChannel = async () => {
	if (!newChannelName.value || newChannelName.value.length < 3) return;
	creatingChannel.value = true;
	try {
		const data = {
			name: slugify(newChannelName.value),
			organization: selectedOrg.value || undefined,
			status: 'published',
		};
		if (newChannelProject.value) data.project = newChannelProject.value;
		if (newChannelTicket.value) data.ticket = newChannelTicket.value;
		if (selectedClient.value && selectedClient.value !== 'org') data.client = selectedClient.value;

		await channelItems.create(data);
		toast.add({ title: 'Channel created', color: 'green' });
		newChannelName.value = '';
		newChannelProject.value = null;
		newChannelTicket.value = null;
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
useHead({ title: 'Channels | Earnest' });

// Reactive filter

const currentFilter = computed(() => {
	if (!organizationOptions.value?.length) return {};

	const orgFilter = selectedOrg.value
		? { _eq: selectedOrg.value }
		: {
				_in: organizationOptions.value.filter((org) => org.id !== null).map((org) => org.id),
			};

	const filters = [{ status: { _in: ['published', 'draft'] } }, { organization: orgFilter }];

	// Filter by selected client
	if (selectedClient.value && selectedClient.value !== 'org') {
		filters.push({ client: { _eq: selectedClient.value } });
	} else if (selectedClient.value === 'org') {
		filters.push({ client: { _null: true } });
	}

	// Filter by team (through team→client relationship)
	if (channelTeamFilter.value && teamClientIds.value.length > 0) {
		filters.push({ client: { _in: teamClientIds.value } });
	}

	return { _and: filters };
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
		'ticket.id',
		'ticket.title',
		'client',
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
	[() => channels.value, selectedOrg, selectedClient, channelTeamFilter, teamClientIds],
	([newChannels]) => {
		if (!newChannels) return;

		localChannels.value = newChannels.filter((channel) => {
			if (selectedOrg.value && channel.organization?.id !== selectedOrg.value) return false;
			if (selectedClient.value && selectedClient.value !== 'org') {
				return channel.client === selectedClient.value;
			}
			if (selectedClient.value === 'org') {
				return !channel.client;
			}
			// Team filter: only show channels from team's clients
			if (channelTeamFilter.value && teamClientIds.value.length > 0) {
				return teamClientIds.value.includes(channel.client);
			}
			return true;
		});
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
	<div class="page__content">
		<div class="max-w-screen-xl mx-auto page_inner px-4 2xl:px-0">
			<!-- Header -->
			<div class="flex items-center justify-between mb-6">
				<div>
					<h1 class="text-xl font-semibold text-foreground">Channels</h1>
					<p class="text-sm text-muted-foreground mt-0.5">Team channels and conversations</p>
				</div>
				<div class="flex items-center gap-2">
					<USelectMenu
						v-if="visibleTeams.length > 0"
						v-model="channelTeamFilter"
						:options="[{ id: null, name: 'All Teams' }, ...visibleTeams]"
						value-attribute="id"
						option-attribute="name"
						placeholder="Filter by team"
						size="sm"
						class="w-40"
					/>
					<button
						v-if="isAdmin"
						class="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
						@click="showCreateChannel = true"
					>
						<UIcon name="i-heroicons-plus" class="w-4 h-4" />
						New Channel
					</button>
				</div>
			</div>

			<!-- Create Channel Modal -->
			<ClientOnly>
				<UModal v-model="showCreateChannel">
					<div class="p-6 space-y-4">
						<h3 class="text-lg font-semibold text-foreground">Create New Channel</h3>
						<UFormGroup label="Channel Name" required>
							<UInput v-model="newChannelName" placeholder="e.g. general, design, marketing" :disabled="creatingChannel" />
						</UFormGroup>
						<p v-if="newChannelName && newChannelName.length < 3" class="text-xs text-red-500">
							Channel name must be at least 3 characters.
						</p>
						<UFormGroup label="Link to Project" hint="Optional">
							<USelectMenu
								v-model="newChannelProject"
								:options="availableProjects"
								option-attribute="title"
								value-attribute="id"
								placeholder="Select a project..."
								clearable
								searchable
								searchable-placeholder="Search projects..."
								:disabled="creatingChannel"
							/>
						</UFormGroup>
						<UFormGroup label="Link to Ticket" hint="Optional">
							<USelectMenu
								v-model="newChannelTicket"
								:options="availableTickets"
								option-attribute="title"
								value-attribute="id"
								placeholder="Select a ticket..."
								clearable
								searchable
								searchable-placeholder="Search tickets..."
								:disabled="creatingChannel"
							/>
						</UFormGroup>
						<div class="flex justify-end gap-2">
							<UButton color="gray" variant="soft" @click="showCreateChannel = false">Cancel</UButton>
							<UButton :loading="creatingChannel" :disabled="!newChannelName || newChannelName.length < 3" @click="createChannel">
								Create Channel
							</UButton>
						</div>
					</div>
				</UModal>
			</ClientOnly>

			<!-- Coming Soon for non-admin users -->
			<div v-if="!isAdmin" class="flex flex-col items-center justify-center min-h-[60vh]">
				<div class="h-14 w-14 rounded-full bg-muted/60 flex items-center justify-center mb-4">
					<UIcon name="i-heroicons-chat-bubble-left-right" class="w-7 h-7 text-muted-foreground/40" />
				</div>
				<h2 class="text-lg font-semibold text-muted-foreground mb-1">Coming Soon</h2>
				<p class="text-sm text-muted-foreground/60">This feature is currently under development.</p>
			</div>

			<!-- Admin content -->
			<template v-else>
				<!-- Loading -->
				<div v-if="channelsLoading" class="space-y-3">
					<div v-for="n in 6" :key="n" class="h-[72px] bg-muted rounded-2xl animate-pulse" />
				</div>

				<!-- Channels List -->
				<div v-else-if="sortedChannels.length" class="space-y-2">
					<NuxtLink
						v-for="channel in sortedChannels"
						:key="channel.id"
						:to="'/channels/' + channel.name"
						class="ios-card p-4 flex items-center gap-3 ios-press block"
					>
						<div class="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
							<UIcon name="i-heroicons-chat-bubble-left-right" class="w-5 h-5 text-cyan-500" />
						</div>
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2">
								<h3 class="text-sm font-semibold text-foreground truncate">#{{ channel.name }}</h3>
								<span v-if="channel.messageCount" class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
									{{ channel.messageCount }}
								</span>
							</div>
							<div class="flex items-center gap-2 mt-0.5">
								<span v-if="channel.project?.title" class="text-[10px] text-muted-foreground truncate">
									<UIcon name="i-heroicons-square-3-stack-3d" class="w-3 h-3 inline -mt-0.5 mr-0.5" />
									{{ channel.project.title }}
								</span>
								<span v-if="channel.ticket?.title" class="text-[10px] text-muted-foreground truncate">
									<UIcon name="i-heroicons-ticket" class="w-3 h-3 inline -mt-0.5 mr-0.5" />
									{{ channel.ticket.title }}
								</span>
								<span v-if="!channel.project?.title && !channel.ticket?.title" class="text-[10px] text-muted-foreground/60">
									{{ channel.organization?.name || 'General' }}
								</span>
							</div>
						</div>
						<UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-muted-foreground/30 flex-shrink-0" />
					</NuxtLink>
				</div>

				<!-- Empty State -->
				<div v-else class="flex flex-col items-center justify-center py-16 text-center">
					<div class="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mb-4">
						<UIcon name="i-heroicons-chat-bubble-left-right" class="w-6 h-6 text-muted-foreground/40" />
					</div>
					<p class="text-sm text-muted-foreground">No channels yet</p>
					<p class="text-xs text-muted-foreground/60 mt-1">Create a channel to start team conversations.</p>
					<button
						v-if="isAdmin"
						class="mt-4 h-8 px-3 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors flex items-center gap-1.5"
						@click="showCreateChannel = true"
					>
						<UIcon name="i-heroicons-plus" class="w-3.5 h-3.5" />
						New Channel
					</button>
				</div>
			</template>
		</div>
	</div>
</template>
