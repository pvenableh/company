<script setup>
const organizationItems = useDirectusItems('organizations');
const { user: sessionUser, loggedIn } = useUserSession();
const user = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});
const { selectedOrg } = useOrganization();
const { filteredUsers, fetchFilteredUsers } = useFilteredUsers();
const { fetchTeams, visibleTeams, loading: teamsLoading, setupStorageListener } = useTeams();
const config = useRuntimeConfig();

const org = ref(null);
const isLoading = ref(true);

const activeTab = ref(0);

// Define tab items once:
const tabItems = [
	{ slot: 'overview', label: 'Overview', icon: 'i-heroicons-home' },
	{ slot: 'members', label: 'Members', icon: 'i-heroicons-users' },
	{ slot: 'teams', label: 'Teams', icon: 'i-heroicons-user-group' },
];

// Optional: Get the current tab slot name when needed
const currentTabSlot = computed(() => tabItems[activeTab.value]?.slot || 'overview');

definePageMeta({
	middleware: ['auth'],
});

// Set up cross-tab synchronization for teams
const cleanup = setupStorageListener();
onUnmounted(() => {
	if (typeof cleanup === 'function') {
		cleanup();
	}
});

// Function to fetch organization data with correct fields
const fetchOrganizationData = async () => {
	if (!selectedOrg.value) return;

	try {
		isLoading.value = true;

		// Use readItems with the correct fields
		const orgs = await organizationItems.list({
			filter: { id: { _eq: selectedOrg.value } },
			fields: [
				'id',
				'name',
				'logo',
				'category',
				'notes',
				'website',
				'phone',
				'address',
				'industry.name',
				'industry.class',
				'brand_color',
				'emails',
				'date_created',
				'origin_date',
				'icon',
			],
			limit: 1,
		});

		org.value = orgs?.[0] || null;

		// Run these in parallel for better performance
		await Promise.all([
			// Fetch organization users
			fetchFilteredUsers(selectedOrg.value),
			// Fetch teams for the organization
			fetchTeams(selectedOrg.value),
		]);
	} catch (error) {
		console.error('Error fetching organization data:', error);
		org.value = null;
	} finally {
		isLoading.value = false;
	}
};

// Watch for changes in selectedOrg and fetch data
watch(
	() => selectedOrg.value,
	(newVal) => {
		if (newVal) {
			fetchOrganizationData();
		} else {
			org.value = null;
		}
	},
	{ immediate: true },
);

// Format date helper
const formatDate = (dateString) => {
	if (!dateString) return 'N/A';
	return new Date(dateString).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
};

// Get organization logo URL
const getIconUrl = computed(() => {
	if (!org.value?.icon) return null;
	return `${config.public.directusUrl}/assets/${org.value.icon}?key=avatar`;
});
</script>

<template>
	<div class="w-full relative">
		<h1 class="page__title">Company</h1>
		<div class="flex items-center justify-start flex-col z-10 w-full page__inner">
			<!-- Loading state -->
			<div v-if="isLoading" class="flex justify-center items-center min-h-[300px]">
				<UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-500" />
			</div>

			<!-- No organization selected -->
			<UAlert
				v-else-if="!selectedOrg || !org"
				title="No Organization Selected"
				description="Please select an organization from the dropdown in the navigation bar."
				color="blue"
				class="max-w-2xl mx-auto mt-12"
			/>

			<!-- Organization Data -->
			<div v-else class="max-w-7xl mx-auto w-full">
				<!-- Organization Header -->
				<div class="flex flex-col md:flex-row gap-6 items-start mb-8">
					<!-- Logo -->
					<div class="flex-shrink-0">
						<UAvatar
							v-if="getIconUrl"
							:src="getIconUrl"
							:alt="org.name"
							size="2xl"
							class="!rounded-full shadow-md border border-gray-200 dark:border-gray-700"
						/>
						<div
							v-else
							class="w-24 h-24 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700"
						>
							<UIcon name="i-heroicons-building-office" class="w-12 h-12 text-gray-400" />
						</div>
					</div>

					<!-- Organization Info -->
					<div class="flex-grow">
						<div class="flex items-center justify-between">
							<h1 class="text-2xl md:text-3xl font-bold mb-2">{{ org.name }}</h1>
						</div>

						<div class="flex flex-wrap gap-x-6 gap-y-1 mb-4 text-sm text-gray-600 dark:text-gray-300">
							<div v-if="org.industry?.name" class="flex items-center">
								<UIcon name="i-heroicons-building-office-2" class="w-4 h-4 mr-1" />
								<span>{{ org.industry.name }}</span>
							</div>
							<div v-if="org.origin_date" class="flex items-center">
								<UIcon name="i-heroicons-calendar" class="w-4 h-4 mr-1" />
								<span>Member since {{ formatDate(org.origin_date) }}</span>
							</div>
						</div>

						<p v-if="org.notes" class="text-gray-700 dark:text-gray-300 mb-4">
							{{ org.notes }}
						</p>

						<div class="flex flex-wrap gap-x-4 gap-y-2 text-sm text-gray-600 dark:text-gray-300">
							<a
								v-if="org.website"
								:href="org.website.startsWith('http') ? org.website : 'https://' + org.website"
								target="_blank"
								rel="noopener noreferrer"
								class="flex items-center text-primary"
							>
								<UIcon name="i-heroicons-globe-alt" class="w-4 h-4 mr-1" />
								<span>{{ org.website.startsWith('http') ? org.website : 'https://' + org.website }}</span>
							</a>
							<div v-if="org.emails && org.emails.length" class="flex items-center">
								<UIcon name="i-heroicons-envelope" class="w-4 h-4 mr-1 flex-shrink-0" />
								<div class="flex flex-wrap gap-2">
									<UBadge
										v-for="(email, index) in Array.isArray(org.emails) ? org.emails : [org.emails]"
										:key="index"
										color="primary"
										variant="soft"
										class="cursor-pointer"
										@click="window.location.href = `mailto:${email}`"
									>
										<span class="truncate max-w-48">{{ email }}</span>
									</UBadge>
								</div>
							</div>
							<a
								v-if="org.phone"
								:href="'tel:' + org.phone"
								class="flex items-center text-primary"
							>
								<UIcon name="i-heroicons-phone" class="w-4 h-4 mr-1" />
								<span>{{ org.phone }}</span>
							</a>
						</div>
					</div>
				</div>

				<!-- Tabs -->
				<UTabs v-model="activeTab" :items="tabItems">
					<template #overview>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
							<!-- Contact Information Card -->
							<UCard>
								<template #header>
									<div class="flex items-center">
										<UIcon name="i-heroicons-information-circle" class="w-5 h-5 mr-2" />
										<h3 class="text-lg font-medium">Contact Information</h3>
									</div>
								</template>

								<div class="space-y-4">
									<div v-if="org.address">
										<h4 class="text-sm font-medium text-gray-500 mb-1">Address</h4>
										<p class="text-gray-700 dark:text-gray-300">{{ org.address }}</p>
									</div>

									<div v-if="org.phone">
										<h4 class="text-sm font-medium text-gray-500 mb-1">Phone</h4>
										<p class="text-gray-700 dark:text-gray-300">{{ org.phone }}</p>
									</div>

									<div v-if="org.emails && org.emails.length">
										<h4 class="text-sm font-medium text-gray-500 mb-1">Email Addresses</h4>
										<div class="flex flex-wrap gap-2">
											<UBadge
												v-for="(email, index) in Array.isArray(org.emails) ? org.emails : [org.emails]"
												:key="index"
												color="primary"
												variant="soft"
												class="cursor-pointer"
												@click="window.location.href = `mailto:${email}`"
											>
												{{ email }}
											</UBadge>
										</div>
									</div>

									<div v-if="org.website">
										<h4 class="text-sm font-medium text-gray-500 mb-1">Website</h4>
										<p class="text-gray-700 dark:text-gray-300">
											<a
												:href="org.website.startsWith('http') ? org.website : 'https://' + org.website"
												target="_blank"
												rel="noopener noreferrer"
												class="text-primary"
											>
												{{ org.website }}
											</a>
										</p>
									</div>

									<div v-if="org.brand_color">
										<h4 class="text-sm font-medium text-gray-500 mb-1">Brand Color</h4>
										<div class="flex items-center">
											<div
												class="w-6 h-6 rounded mr-2 border border-gray-200"
												:style="{ backgroundColor: org.brand_color }"
											></div>
											<span class="text-gray-700 dark:text-gray-300">{{ org.brand_color }}</span>
										</div>
									</div>
								</div>
							</UCard>

							<!-- Industry Information -->
							<UCard v-if="org.industry">
								<template #header>
									<div class="flex items-center">
										<UIcon name="i-heroicons-building-office-2" class="w-5 h-5 mr-2" />
										<h3 class="text-lg font-medium">Industry Information</h3>
									</div>
								</template>

								<div class="space-y-4">
									<div v-if="org.industry.name">
										<h4 class="text-sm font-medium text-gray-500 mb-1">Industry</h4>
										<p class="text-gray-700 dark:text-gray-300">{{ org.industry.name }}</p>
									</div>

									<div v-if="org.industry.class">
										<h4 class="text-sm font-medium text-gray-500 mb-1">Classification</h4>
										<p class="text-gray-700 dark:text-gray-300">{{ org.industry.class }}</p>
									</div>
								</div>
							</UCard>
						</div>
					</template>

					<template #members>
						<div class="mt-6">
							<div class="flex justify-between items-center mb-4">
								<h3 class="text-lg font-medium">Organization Members</h3>
							</div>

							<div v-if="filteredUsers.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
								<UCard v-for="user in filteredUsers" :key="user.id" class="flex items-center">
									<div class="flex items-center space-x-4">
										<UAvatar
											:src="user.avatar ? `${config.public.directusUrl}/assets/${user.avatar}?key=small` : null"
											:alt="`${user.first_name} ${user.last_name}`"
										/>
										<div>
											<h4 class="font-medium">{{ user.first_name }} {{ user.last_name }}</h4>
											<p class="text-sm text-gray-500">{{ user.email }}</p>
										</div>
									</div>
								</UCard>
							</div>

							<p v-else class="text-center text-gray-500 py-8">No members found for this organization.</p>
						</div>
					</template>

					<template #teams>
						<div class="mt-6">
							<!-- Add loading indicator for teams -->
							<div v-if="teamsLoading" class="flex justify-center py-8">
								<UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-500" />
							</div>

							<TeamsManageTeams
								v-else
								:embedded="true"
								:organization-id="selectedOrg"
								:initial-teams="visibleTeams"
								:external-loading="teamsLoading"
							/>
						</div>
					</template>
				</UTabs>
			</div>
		</div>
	</div>
</template>
