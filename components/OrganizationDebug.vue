<script setup>
// Import all necessary composables
const { readItem, readItems } = useDirectusItems();
const { data, status } = useAuth();
const user = computed(() => {
	return status.value === 'authenticated' ? data?.value?.user ?? null : null;
});
const { selectedOrg } = useOrganization();
const config = useRuntimeConfig();

const directResponse = ref(null);
const alternateResponse = ref(null);
const userDetails = ref(null);
const isLoading = ref(false);
const isAltLoading = ref(false);
const errorDetails = ref(null);
const altErrorDetails = ref(null);

// Detailed fetch with specific error handling
const fetchOrganizationDirectly = async () => {
	isLoading.value = true;
	errorDetails.value = null;
	directResponse.value = null;

	try {
		console.log(`Attempting direct fetch for org ID: ${selectedOrg.value}`);

		const response = await readItem('organizations', selectedOrg.value, {
			fields: ['id', 'name'],
		});

		console.log('Direct fetch response:', response);
		directResponse.value = response;
	} catch (error) {
		console.error('Direct fetch error:', error);
		errorDetails.value = {
			message: error.message,
			statusCode: error.statusCode || 'Unknown',
			data: error.data || {},
			stack: error.stack,
		};
	} finally {
		isLoading.value = false;
	}
};

// Try to fetch using readItems instead of readItem
const fetchOrgAlternatively = async () => {
	isAltLoading.value = true;
	altErrorDetails.value = null;
	alternateResponse.value = null;

	try {
		console.log(`Attempting alternate fetch for org ID: ${selectedOrg.value}`);

		const response = await readItems('organizations', {
			filter: { id: { _eq: selectedOrg.value } },
			fields: ['id', 'name'],
			limit: 1,
		});

		console.log('Alternate fetch response:', response);
		alternateResponse.value = response?.length ? response[0] : null;
	} catch (error) {
		console.error('Alternate fetch error:', error);
		altErrorDetails.value = {
			message: error.message,
			statusCode: error.statusCode || 'Unknown',
			data: error.data || {},
			stack: error.stack,
		};
	} finally {
		isAltLoading.value = false;
	}
};

// Get user permissions and details
const getUserDetails = async () => {
	try {
		// We already have basic user data
		userDetails.value = {
			id: user.value?.id,
			email: user.value?.email,
			firstName: user.value?.first_name,
			lastName: user.value?.last_name,
			role: user.value?.role,
			roleId: user.value?.role?.id,
			selectedOrg: selectedOrg.value,
			orgs: user.value?.organizations?.map((org) => ({
				id: org.organizations_id?.id,
				name: org.organizations_id?.name,
			})),
		};
	} catch (error) {
		console.error('Error fetching user details:', error);
	}
};

// Run diagnostics on mount
onMounted(async () => {
	if (selectedOrg.value) {
		await getUserDetails();
		await fetchOrganizationDirectly();
		await fetchOrgAlternatively();
	}
});

// Run again if selectedOrg changes
watch(
	selectedOrg,
	async (newVal) => {
		if (newVal) {
			await getUserDetails();
			await fetchOrganizationDirectly();
			await fetchOrgAlternatively();
		}
	},
	{ immediate: true },
);
</script>

<template>
	<div class="p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
		<h2 class="text-xl font-bold mb-4">Organization Debugging Tool</h2>

		<div class="mb-6">
			<h3 class="font-medium mb-2">Selected Organization ID</h3>
			<div class="bg-gray-100 dark:bg-gray-900 p-3 rounded">
				<code>{{ selectedOrg || 'No organization selected' }}</code>
			</div>
		</div>

		<!-- User Details -->
		<div class="mb-6">
			<h3 class="font-medium mb-2">Current User Details</h3>
			<div v-if="userDetails" class="bg-gray-100 dark:bg-gray-900 p-3 rounded">
				<pre class="whitespace-pre-wrap overflow-x-auto">{{ JSON.stringify(userDetails, null, 2) }}</pre>
			</div>
			<p v-else class="text-gray-500 italic">Loading user details...</p>
		</div>

		<!-- Direct Fetch Results -->
		<div class="mb-6">
			<div class="flex items-center justify-between mb-2">
				<h3 class="font-medium">Direct readItem() Results</h3>
				<UButton size="xs" :loading="isLoading" @click="fetchOrganizationDirectly" icon="i-heroicons-arrow-path">
					Retry
				</UButton>
			</div>

			<div v-if="isLoading" class="bg-gray-100 dark:bg-gray-900 p-3 rounded flex justify-center">
				<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin" />
			</div>

			<div v-else-if="directResponse" class="bg-gray-100 dark:bg-gray-900 p-3 rounded">
				<pre class="whitespace-pre-wrap overflow-x-auto">{{ JSON.stringify(directResponse, null, 2) }}</pre>
			</div>

			<div
				v-else-if="errorDetails"
				class="bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-200 dark:border-red-800"
			>
				<p class="font-medium text-red-600 dark:text-red-400 mb-1">Error: {{ errorDetails.message }}</p>
				<p class="text-sm mb-2">Status: {{ errorDetails.statusCode }}</p>
				<details>
					<summary class="cursor-pointer text-sm">Error Details</summary>
					<pre class="mt-2 text-xs whitespace-pre-wrap overflow-x-auto">{{
						JSON.stringify(errorDetails, null, 2)
					}}</pre>
				</details>
			</div>

			<div v-else class="bg-gray-100 dark:bg-gray-900 p-3 rounded">
				<p class="text-gray-500 italic">No response yet</p>
			</div>
		</div>

		<!-- Alternate Fetch Results -->
		<div class="mb-6">
			<div class="flex items-center justify-between mb-2">
				<h3 class="font-medium">Alternative readItems() Results</h3>
				<UButton size="xs" :loading="isAltLoading" @click="fetchOrgAlternatively" icon="i-heroicons-arrow-path">
					Retry
				</UButton>
			</div>

			<div v-if="isAltLoading" class="bg-gray-100 dark:bg-gray-900 p-3 rounded flex justify-center">
				<UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin" />
			</div>

			<div v-else-if="alternateResponse" class="bg-gray-100 dark:bg-gray-900 p-3 rounded">
				<pre class="whitespace-pre-wrap overflow-x-auto">{{ JSON.stringify(alternateResponse, null, 2) }}</pre>
			</div>

			<div
				v-else-if="altErrorDetails"
				class="bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-200 dark:border-red-800"
			>
				<p class="font-medium text-red-600 dark:text-red-400 mb-1">Error: {{ altErrorDetails.message }}</p>
				<p class="text-sm mb-2">Status: {{ altErrorDetails.statusCode }}</p>
				<details>
					<summary class="cursor-pointer text-sm">Error Details</summary>
					<pre class="mt-2 text-xs whitespace-pre-wrap overflow-x-auto">{{
						JSON.stringify(altErrorDetails, null, 2)
					}}</pre>
				</details>
			</div>

			<div v-else class="bg-gray-100 dark:bg-gray-900 p-3 rounded">
				<p class="text-gray-500 italic">No response yet</p>
			</div>
		</div>

		<!-- Debugging Tips -->
		<div class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded">
			<h3 class="font-medium mb-2 text-blue-700 dark:text-blue-300">Debugging Tips</h3>
			<ul class="list-disc pl-5 space-y-1 text-sm">
				<li>Check if the organization ID exists in your Directus database</li>
				<li>Verify that your user role has read permissions for organizations</li>
				<li>Look for CORS issues in the browser console</li>
				<li>Check if your Directus access token is valid</li>
				<li>Try a different approach - use readItems instead of readItem</li>
				<li>Check network requests in developer tools</li>
			</ul>
		</div>
	</div>
</template>
