<script setup>
useHead({ title: 'Organization | Earnest' });

import { ROLE_METADATA } from '~~/shared/permissions';

const organizationItems = useDirectusItems('organizations');
const orgUserJunction = useDirectusItems('organizations_directus_users');
const roleItems = useDirectusItems('org_roles');
const membershipItems = useDirectusItems('org_memberships');
const { user: sessionUser, loggedIn } = useUserSession();
const user = computed(() => {
	return loggedIn.value ? sessionUser.value ?? null : null;
});
const { selectedOrg, fetchOrganizationDetails, isInitialized: orgIsInitialized, isLoading: orgInitLoading } = useOrganization();
const { filteredUsers, fetchFilteredUsers } = useFilteredUsers();
const { fetchTeams, visibleTeams, loading: teamsLoading, setupStorageListener } = useTeams();
const config = useRuntimeConfig();
const toast = useToast();

const org = ref(null);
const isLoading = ref(true);
const orgRoles = ref([]);
const orgMemberships = ref([]);

// --- Logo Upload ---
const { processUpload, uploadFilesWithProgress, startUpload, resetUploadState, isUploading: logoUploading } = useFileUpload();
const { getOrgFolderId } = useOrgFolders();
const logoInput = ref(null);

const onLogoFileSelected = async (event) => {
	const file = event.target.files?.[0];
	if (!file || !org.value?.id) return;

	startUpload();
	try {
		const result = await processUpload([file]);
		if (!result.success) {
			toast.add({ title: 'Error', description: result.errors[0], color: 'red' });
			return;
		}
		const orgFolder = getOrgFolderId();
		if (orgFolder) result.formData.append('folder', orgFolder);
		const uploaded = await uploadFilesWithProgress(result.formData);
		const fileId = uploaded?.id || uploaded?.[0]?.id;
		if (fileId) {
			await organizationItems.update(org.value.id, { logo: fileId });
			toast.add({ title: 'Success', description: 'Logo updated', color: 'green' });
			await fetchOrganizationData();
			await fetchOrganizationDetails();
		}
	} catch (error) {
		console.error('Logo upload failed:', error);
		toast.add({ title: 'Error', description: 'Failed to upload logo', color: 'red' });
	} finally {
		resetUploadState();
		if (logoInput.value) logoInput.value.value = '';
	}
};

// --- Industries ---
const industryItems = useDirectusItems('industries');
const industries = ref([]);
const fetchIndustries = async () => {
	try {
		industries.value = await industryItems.list({
			fields: ['id', 'name'],
			filter: { status: { _eq: 'published' } },
			sort: ['name'],
			limit: -1,
		});
	} catch { /* industries may not be accessible */ }
};
fetchIndustries();

const activeTab = ref(0);

// Define tab items once:
const tabItems = [
	{ slot: 'overview', label: 'Overview', icon: 'i-heroicons-home' },
	{ slot: 'members', label: 'Members', icon: 'i-heroicons-users' },
	{ slot: 'teams', label: 'Teams', icon: 'i-heroicons-user-group' },
	{ slot: 'ai-usage', label: 'Usage', icon: 'i-heroicons-sparkles' },
];

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

const { canAccess, isOrgOwner } = useOrgRole();
const canManageOrg = computed(() => {
	return canAccess('org_settings');
});

// --- Inline Info Editing ---
const editingInfo = ref(false);
const savingInfo = ref(false);
const infoForm = ref({
	name: '',
	website: '',
	notes: '',
	brand_color: '',
	industry: '',
	active: true,
});

const startEditInfo = () => {
	infoForm.value = {
		name: org.value?.name || '',
		website: org.value?.website || '',
		notes: org.value?.notes || '',
		brand_color: org.value?.brand_color || '',
		industry: (typeof org.value?.industry === 'object' ? org.value?.industry?.id : org.value?.industry) || '',
		active: org.value?.active !== false,
	};
	editingInfo.value = true;
};

const saveInfo = async () => {
	if (!org.value?.id) return;
	savingInfo.value = true;
	try {
		await organizationItems.update(org.value.id, {
			name: infoForm.value.name,
			website: infoForm.value.website || null,
			notes: infoForm.value.notes || null,
			brand_color: infoForm.value.brand_color || null,
			industry: infoForm.value.industry || null,
			active: infoForm.value.active,
		});
		toast.add({ title: 'Success', description: 'Organization info updated', color: 'green' });
		editingInfo.value = false;
		await fetchOrganizationData();
		await fetchOrganizationDetails();
	} catch (error) {
		console.error('Error updating info:', error);
		const msg = error?.data?.message || error?.message || 'Failed to update organization info';
		toast.add({ title: 'Error', description: msg, color: 'red' });
	} finally {
		savingInfo.value = false;
	}
};

// --- Inline Billing Editing ---
const editingBilling = ref(false);
const savingBilling = ref(false);
const billingForm = ref({
	email: '',
	phone: '',
	address: '',
	default_hourly_rate: null,
});

const startEditBilling = () => {
	billingForm.value = {
		email: org.value?.email || '',
		phone: org.value?.phone || '',
		address: org.value?.address || '',
		default_hourly_rate: org.value?.default_hourly_rate || null,
	};
	editingBilling.value = true;
};

const saveBilling = async () => {
	if (!org.value?.id) return;
	savingBilling.value = true;
	try {
		await organizationItems.update(org.value.id, {
			email: billingForm.value.email || null,
			phone: billingForm.value.phone || null,
			address: billingForm.value.address || null,
			default_hourly_rate: billingForm.value.default_hourly_rate || null,
		});
		toast.add({ title: 'Success', description: 'Billing info updated', color: 'green' });
		editingBilling.value = false;
		await fetchOrganizationData();
		await fetchOrganizationDetails();
	} catch (error) {
		console.error('Error updating billing:', error);
		const msg = error?.data?.message || error?.message || 'Failed to update billing info';
		toast.add({ title: 'Error', description: msg, color: 'red' });
	} finally {
		savingBilling.value = false;
	}
};

// --- Inline Brand Editing ---
const editingBrand = ref(false);
const savingBrand = ref(false);
const brandForm = ref({
	brand_direction: '',
	goals: '',
	target_audience: '',
	location: '',
});

const startEditBrand = () => {
	brandForm.value = {
		brand_direction: org.value?.brand_direction || '',
		goals: org.value?.goals || '',
		target_audience: org.value?.target_audience || '',
		location: org.value?.location || '',
	};
	editingBrand.value = true;
};

const saveBrand = async () => {
	if (!org.value?.id) return;
	savingBrand.value = true;
	try {
		await organizationItems.update(org.value.id, {
			brand_direction: brandForm.value.brand_direction || null,
			goals: brandForm.value.goals || null,
			target_audience: brandForm.value.target_audience || null,
			location: brandForm.value.location || null,
		});
		toast.add({ title: 'Success', description: 'Brand & strategy updated', color: 'green' });
		editingBrand.value = false;
		await fetchOrganizationData();
		await fetchOrganizationDetails();
	} catch (error) {
		console.error('Error updating brand:', error);
		const msg = error?.data?.message || error?.message || 'Failed to update brand & strategy';
		toast.add({ title: 'Error', description: msg, color: 'red' });
	} finally {
		savingBrand.value = false;
	}
};


// --- Archive / Restore Organization ---
const showArchiveModal = ref(false);
const archiving = ref(false);
const restoring = ref(false);

const isArchived = computed(() => !!org.value?.archived_at);
const archivedDate = computed(() => {
	return org.value?.archived_at ? formatDateLong(org.value.archived_at) : null;
});

const confirmArchive = async () => {
	if (!org.value?.id || archiving.value) return;
	archiving.value = true;
	try {
		const res = await $fetch(`/api/org/${org.value.id}/archive`, { method: 'POST' });
		const msg = res?.alreadyArchived
			? 'Organization was already archived.'
			: res?.stripe
				? `Organization archived. Subscription set to cancel at period end (${new Date((res.stripe.current_period_end || 0) * 1000).toLocaleDateString()}).`
				: 'Organization archived.';
		toast.add({ title: 'Archived', description: msg, color: 'amber' });
		showArchiveModal.value = false;
		await fetchOrganizationData();
		await fetchOrganizationDetails();
	} catch (error) {
		console.error('Archive failed:', error);
		const msg = error?.data?.message || error?.message || 'Failed to archive organization';
		toast.add({ title: 'Error', description: msg, color: 'red' });
	} finally {
		archiving.value = false;
	}
};

const confirmRestore = async () => {
	if (!org.value?.id || restoring.value) return;
	restoring.value = true;
	try {
		const res = await $fetch(`/api/org/${org.value.id}/restore`, { method: 'POST' });
		const msg = res?.resubscribeRequired
			? 'Organization restored. Your previous subscription has ended — visit Subscription to re-subscribe.'
			: res?.stripe?.cancel_at_period_end === false
				? 'Organization restored. Subscription reactivated.'
				: 'Organization restored.';
		toast.add({ title: 'Restored', description: msg, color: 'green' });
		await fetchOrganizationData();
		await fetchOrganizationDetails();
	} catch (error) {
		console.error('Restore failed:', error);
		const msg = error?.data?.message || error?.message || 'Failed to restore organization';
		toast.add({ title: 'Error', description: msg, color: 'red' });
	} finally {
		restoring.value = false;
	}
};

// --- Invite Member (new system) ---
const showInviteModal = ref(false);

const openInviteModal = () => {
	showInviteModal.value = true;
};

const onMemberInvited = async () => {
	// Refresh both legacy users and new memberships
	await Promise.all([
		fetchFilteredUsers(selectedOrg.value),
		fetchOrgMemberships(),
	]);
};

// --- Add Existing User to Organization ---
const showAddMemberModal = ref(false);
const searchEmail = ref('');
const searchResults = ref([]);
const searching = ref(false);
const addingUser = ref(false);

const { readUsers } = useDirectusUsers();

const openAddMemberModal = () => {
	searchEmail.value = '';
	searchResults.value = [];
	showAddMemberModal.value = true;
};

const searchUsers = async () => {
	if (!searchEmail.value || searchEmail.value.length < 2) {
		searchResults.value = [];
		return;
	}
	searching.value = true;
	try {
		const users = await readUsers({
			filter: {
				_or: [
					{ email: { _contains: searchEmail.value } },
					{ first_name: { _contains: searchEmail.value } },
					{ last_name: { _contains: searchEmail.value } },
				],
			},
			fields: ['id', 'first_name', 'last_name', 'email', 'avatar'],
			limit: 10,
		});

		// Filter out users already in the organization
		const existingIds = new Set(filteredUsers.value.map((u) => u.id));
		searchResults.value = (users || []).filter((u) => !existingIds.has(u.id));
	} catch (error) {
		console.error('Error searching users:', error);
		searchResults.value = [];
	} finally {
		searching.value = false;
	}
};

const addUserToOrganization = async (userId) => {
	if (!selectedOrg.value || !userId) return;
	addingUser.value = true;
	try {
		await orgUserJunction.create({
			organizations_id: selectedOrg.value,
			directus_users_id: userId,
		});
		toast.add({ title: 'Success', description: 'User added to organization', color: 'green' });
		await fetchFilteredUsers(selectedOrg.value);
		searchResults.value = searchResults.value.filter((u) => u.id !== userId);
	} catch (error) {
		console.error('Error adding user to organization:', error);
		toast.add({ title: 'Error', description: 'Failed to add user to organization', color: 'red' });
	} finally {
		addingUser.value = false;
	}
};

// --- Remove Member ---
const showRemoveMemberModal = ref(false);
const memberToRemove = ref(null);
const removingMember = ref(false);

const confirmRemoveMember = (member) => {
	memberToRemove.value = member;
	showRemoveMemberModal.value = true;
};

const removeMember = async () => {
	if (!memberToRemove.value || !selectedOrg.value) return;
	removingMember.value = true;
	try {
		// Remove from legacy junction
		const junctions = await orgUserJunction.list({
			filter: {
				organizations_id: { _eq: selectedOrg.value },
				directus_users_id: { _eq: memberToRemove.value.id },
			},
			fields: ['id'],
		});
		if (junctions.length > 0) {
			await orgUserJunction.remove(junctions.map((j) => j.id));
		}

		// Also suspend org_membership if exists
		const memberships = await membershipItems.list({
			filter: {
				organization: { _eq: selectedOrg.value },
				user: { _eq: memberToRemove.value.id },
			},
			fields: ['id'],
		});
		for (const m of memberships) {
			await membershipItems.update(m.id, { status: 'suspended' });
		}

		toast.add({ title: 'Success', description: 'Member removed from organization', color: 'green' });
		showRemoveMemberModal.value = false;
		memberToRemove.value = null;
		await Promise.all([
			fetchFilteredUsers(selectedOrg.value),
			fetchOrgMemberships(),
		]);
	} catch (error) {
		console.error('Error removing member:', error);
		toast.add({ title: 'Error', description: 'Failed to remove member', color: 'red' });
	} finally {
		removingMember.value = false;
	}
};

// --- Fetch Org Roles ---
const fetchOrgRoles = async () => {
	if (!selectedOrg.value) return;
	try {
		const data = await roleItems.list({
			filter: { organization: { _eq: selectedOrg.value } },
			fields: ['id', 'name', 'slug', 'is_system'],
			sort: ['sort', 'name'],
		});
		// Sort by hierarchy
		const order = ['owner', 'admin', 'manager', 'member', 'client'];
		orgRoles.value = data.sort((a, b) => {
			const ai = order.indexOf(a.slug);
			const bi = order.indexOf(b.slug);
			return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
		});
	} catch {
		orgRoles.value = [];
	}
};

// --- Fetch Org Memberships ---
const fetchOrgMemberships = async () => {
	if (!selectedOrg.value) return;
	try {
		orgMemberships.value = await membershipItems.list({
			filter: {
				organization: { _eq: selectedOrg.value },
			},
			fields: ['id', 'status', 'user', 'role.id', 'role.name', 'role.slug', 'client.id', 'client.name'],
			limit: -1,
		});
	} catch {
		orgMemberships.value = [];
	}
};

// --- Get member's org role ---
const getMemberRole = (memberId) => {
	const membership = orgMemberships.value.find(
		(m) => (typeof m.user === 'object' ? m.user?.id : m.user) === memberId && m.status === 'active'
	);
	return membership?.role || null;
};

const getRoleBadgeColor = (slug) => {
	const colors = {
		owner: 'purple',
		admin: 'red',
		manager: 'blue',
		member: 'green',
		client: 'orange',
	};
	return colors[slug] || 'gray';
};

// --- Change Member Role ---
const changingRole = ref(false);

const changeMemberRole = async (memberId, newRoleId) => {
	if (!selectedOrg.value || changingRole.value) return;

	// Find the membership for this user
	const membership = orgMemberships.value.find(
		(m) => (typeof m.user === 'object' ? m.user?.id : m.user) === memberId && m.status === 'active'
	);
	if (!membership) {
		toast.add({ title: 'Error', description: 'Could not find membership for this user', color: 'red' });
		return;
	}

	// Prevent changing owner role
	const currentRole = membership.role;
	if (currentRole && typeof currentRole === 'object' && currentRole.slug === 'owner') {
		toast.add({ title: 'Error', description: 'Cannot change the owner role', color: 'red' });
		return;
	}

	changingRole.value = true;
	try {
		await membershipItems.update(membership.id, { role: newRoleId });
		toast.add({ title: 'Success', description: 'Member role updated', color: 'green' });
		await fetchOrgMemberships();
	} catch (error) {
		console.error('Error changing member role:', error);
		toast.add({ title: 'Error', description: 'Failed to update member role', color: 'red' });
	} finally {
		changingRole.value = false;
	}
};

// Available roles for dropdown (excludes owner)
const assignableRoles = computed(() => {
	return orgRoles.value.filter((r) => r.slug !== 'owner');
});

// --- Pending invites ---
const pendingInvites = computed(() => {
	return orgMemberships.value.filter((m) => m.status === 'pending');
});

// Function to fetch organization data with correct fields
const ORG_DETAIL_FIELDS = [
	'id', 'name', 'logo', 'category', 'notes', 'website', 'phone', 'address',
	'industry.name', 'industry.class', 'brand_color', 'email', 'emails',
	'date_created', 'origin_date', 'icon', 'active', 'brand_direction',
	'goals', 'target_audience', 'location', 'default_hourly_rate',
	'archived_at',
];
const ORG_BASIC_FIELDS = ['id', 'name', 'logo', 'icon', 'active', 'date_created', 'website', 'phone', 'brand_color', 'brand_direction', 'goals', 'target_audience', 'location', 'notes', 'archived_at'];

const fetchOrganizationData = async () => {
	if (!selectedOrg.value) return;

	try {
		isLoading.value = true;

		// Try full fields first, fall back to basic fields if permission denied
		let orgs;
		try {
			orgs = await organizationItems.list({
				filter: { id: { _eq: selectedOrg.value } },
				fields: ORG_DETAIL_FIELDS,
				limit: 1,
			});
		} catch (fieldErr) {
			console.warn('Org detail fields failed, retrying with basic fields:', fieldErr.message);
			orgs = await organizationItems.list({
				filter: { id: { _eq: selectedOrg.value } },
				fields: ORG_BASIC_FIELDS,
				limit: 1,
			});
		}

		org.value = orgs?.[0] || null;

		// Run these in parallel, each with its own error handling
		await Promise.allSettled([
			fetchFilteredUsers(selectedOrg.value),
			fetchTeams(selectedOrg.value),
			fetchOrgRoles(),
			fetchOrgMemberships(),
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

// Also watch for org initialization completing (handles case where selectedOrg is set after init)
watch(
	() => orgIsInitialized.value,
	(initialized) => {
		if (initialized && selectedOrg.value && !org.value && !isLoading.value) {
			fetchOrganizationData();
		}
	},
);

// Format date helper
// Uses formatDateLong from utils/dates.ts
const formatDate = (dateString) => formatDateLong(dateString) || 'N/A';

// Get organization logo URL — try logo first, fall back to icon
const getIconUrl = computed(() => {
	const logoId = org.value?.logo
		? (typeof org.value.logo === 'object' ? org.value.logo?.id : org.value.logo)
		: org.value?.icon
			? (typeof org.value.icon === 'object' ? org.value.icon?.id : org.value.icon)
			: null;
	if (!logoId) return null;
	return `${config.public.directusUrl}/assets/${logoId}?key=medium-contain`;
});

// Debounced search
let searchTimeout = null;
watch(searchEmail, (val) => {
	clearTimeout(searchTimeout);
	if (val && val.length >= 2) {
		searchTimeout = setTimeout(() => searchUsers(), 300);
	} else {
		searchResults.value = [];
	}
});
</script>

<template>
	<div class="max-w-screen-xl mx-auto px-4 py-6">
		<h1 class="text-2xl font-semibold mb-6">Company</h1>
		<div class="w-full">
			<!-- Loading state (wait for both org initialization and page data) -->
			<div v-if="isLoading || (!orgIsInitialized && orgInitLoading)" class="flex justify-center items-center min-h-[300px]">
				<UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-gray-500" />
			</div>

			<!-- No organization selected (only show after init completes) -->
			<UAlert
				v-else-if="orgIsInitialized && (!selectedOrg || !org)"
				title="No Organization Selected"
				description="Please select an organization from the dropdown in the navigation bar."
				color="blue"
				class="max-w-2xl mx-auto mt-12"
			/>

			<!-- Organization Data -->
			<div v-else class="max-w-7xl mx-auto w-full">
				<!-- Archived banner -->
				<div
					v-if="isArchived"
					class="mb-6 flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-900/20"
				>
					<div class="flex items-start gap-2 flex-grow">
						<UIcon name="i-heroicons-archive-box" class="w-5 h-5 mt-0.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
						<div class="text-sm">
							<div class="font-medium text-amber-900 dark:text-amber-200">This organization is archived.</div>
							<div class="text-amber-800/80 dark:text-amber-300/80">
								Archived {{ archivedDate }}. Data is retained for 90 days and is still visible here until Session 5 ships. Restore any time before the retention window closes.
							</div>
						</div>
					</div>
					<UButton
						v-if="isOrgOwner"
						color="amber"
						variant="solid"
						size="sm"
						icon="i-heroicons-arrow-uturn-left"
						:loading="restoring"
						@click="confirmRestore"
					>
						Restore
					</UButton>
				</div>

				<!-- Organization Header -->
				<div class="flex flex-col md:flex-row gap-6 items-start mb-8">
					<!-- Logo -->
					<div class="flex-shrink-0 relative group">
						<div
							v-if="getIconUrl"
							class="w-24 h-24 rounded-full shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden flex items-center justify-center bg-white dark:bg-gray-800"
						>
							<img
								:src="getIconUrl"
								:alt="org.name"
								class="max-w-full max-h-full object-contain"
							/>
						</div>
						<div
							v-else
							class="w-24 h-24 flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-full shadow-md border border-gray-200 dark:border-gray-700"
						>
							<UIcon name="i-heroicons-building-office" class="w-12 h-12 text-gray-400" />
						</div>
						<button
							v-if="canManageOrg"
							class="absolute inset-0 w-24 h-24 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors cursor-pointer"
							:disabled="logoUploading"
							@click="logoInput?.click()"
						>
							<UIcon
								:name="logoUploading ? 'i-heroicons-arrow-path' : 'i-heroicons-camera'"
								:class="['w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity', logoUploading && 'animate-spin opacity-100']"
							/>
						</button>
						<input
							ref="logoInput"
							type="file"
							accept="image/*"
							class="hidden"
							@change="onLogoFileSelected"
						/>
					</div>

					<!-- Organization Info -->
					<div class="flex-grow">
						<h1 class="text-2xl md:text-3xl font-bold mb-2">{{ org.name }}</h1>

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
						<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
							<!-- Main content — 2 columns -->
							<div class="lg:col-span-2 space-y-6">
								<!-- Brand & Strategy — editable inline like client details -->
								<UCard>
									<template #header>
										<div class="flex items-center justify-between">
											<h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Brand & Strategy</h3>
											<UButton
												v-if="canManageOrg && !editingBrand"
												color="gray"
												variant="ghost"
												icon="i-heroicons-pencil-square"
												size="xs"
												@click="startEditBrand"
											/>
										</div>
									</template>

									<!-- View mode -->
									<div v-if="!editingBrand" class="space-y-4">
										<div>
											<h4 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Brand Direction</h4>
											<p v-if="org.brand_direction" class="text-sm whitespace-pre-line">{{ org.brand_direction }}</p>
											<p v-else class="text-sm text-muted-foreground italic">Not set — click edit to add brand direction</p>
										</div>

										<div>
											<h4 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Goals</h4>
											<p v-if="org.goals" class="text-sm whitespace-pre-line">{{ org.goals }}</p>
											<p v-else class="text-sm text-muted-foreground italic">Not set</p>
										</div>

										<div>
											<h4 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Target Audience</h4>
											<p v-if="org.target_audience" class="text-sm">{{ org.target_audience }}</p>
											<p v-else class="text-sm text-muted-foreground italic">Not set</p>
										</div>

										<div>
											<h4 class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Location</h4>
											<p v-if="org.location" class="text-sm">{{ org.location }}</p>
											<p v-else class="text-sm text-muted-foreground italic">Not set</p>
										</div>
									</div>

									<!-- Edit mode -->
									<div v-else class="space-y-4">
										<BrandAIFieldSuggest
											v-model="brandForm.brand_direction"
											label="Brand Direction"
											field="brand_direction"
											placeholder="Brand positioning, voice, visual style, and messaging strategy..."
											entity-type="organization"
											:entity-id="org?.id || ''"
											:organization-id="org?.id || ''"
										/>

										<BrandAIFieldSuggest
											v-model="brandForm.goals"
											label="Goals"
											field="goals"
											placeholder="Business goals and objectives..."
											entity-type="organization"
											:entity-id="org?.id || ''"
											:organization-id="org?.id || ''"
										/>

										<BrandAIFieldSuggest
											v-model="brandForm.target_audience"
											label="Target Audience"
											field="target_audience"
											placeholder="Ideal customer profile, demographics, psychographics..."
											entity-type="organization"
											:entity-id="org?.id || ''"
											:organization-id="org?.id || ''"
										/>

										<UFormGroup label="Location">
											<UInput v-model="brandForm.location" placeholder="City, region, or Remote/Global" />
										</UFormGroup>

										<div class="flex justify-end gap-2 pt-2">
											<UButton color="gray" variant="ghost" @click="editingBrand = false">Cancel</UButton>
											<UButton color="primary" :loading="savingBrand" @click="saveBrand">Save</UButton>
										</div>
									</div>
								</UCard>
							</div>

							<!-- Sidebar -->
							<div class="space-y-4">
								<!-- Organization Info — inline editable -->
								<UCard>
									<template #header>
										<div class="flex items-center justify-between">
											<h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Info</h3>
											<UButton
												v-if="canManageOrg && !editingInfo"
												color="gray"
												variant="ghost"
												icon="i-heroicons-pencil-square"
												size="xs"
												@click="startEditInfo"
											/>
										</div>
									</template>

									<!-- View mode -->
									<div v-if="!editingInfo" class="space-y-3 text-sm">
										<div class="flex justify-between">
											<span class="text-[10px] uppercase tracking-wider text-muted-foreground">Name</span>
											<span class="font-medium">{{ org.name }}</span>
										</div>
										<div class="flex justify-between">
											<span class="text-[10px] uppercase tracking-wider text-muted-foreground">Industry</span>
											<span>{{ org.industry?.name || '—' }}</span>
										</div>
										<div v-if="org.industry?.class" class="flex justify-between">
											<span class="text-[10px] uppercase tracking-wider text-muted-foreground">Classification</span>
											<span>{{ org.industry.class }}</span>
										</div>
										<div class="flex justify-between">
											<span class="text-[10px] uppercase tracking-wider text-muted-foreground">Website</span>
											<a
												v-if="org.website"
												:href="org.website.startsWith('http') ? org.website : 'https://' + org.website"
												target="_blank"
												class="text-primary truncate max-w-[140px]"
											>
												{{ org.website.replace(/^https?:\/\//, '') }}
											</a>
											<span v-else>—</span>
										</div>
										<div class="flex justify-between">
											<span class="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</span>
											<span class="text-right max-w-[180px]">{{ org.notes || '—' }}</span>
										</div>
										<div class="flex justify-between items-center">
											<span class="text-[10px] uppercase tracking-wider text-muted-foreground">Brand Color</span>
											<div v-if="org.brand_color" class="flex items-center gap-1.5">
												<div class="w-4 h-4 rounded border border-gray-200" :style="{ backgroundColor: org.brand_color }"></div>
												<span>{{ org.brand_color }}</span>
											</div>
											<span v-else>—</span>
										</div>
										<div class="flex justify-between">
											<span class="text-[10px] uppercase tracking-wider text-muted-foreground">Status</span>
											<UBadge :color="org.active !== false ? 'green' : 'gray'" variant="soft" size="xs">
												{{ org.active !== false ? 'Active' : 'Inactive' }}
											</UBadge>
										</div>
										<div class="flex justify-between">
											<span class="text-[10px] uppercase tracking-wider text-muted-foreground">Member Since</span>
											<span>{{ org.origin_date ? formatDate(org.origin_date) : '—' }}</span>
										</div>
										<div class="flex justify-between">
											<span class="text-[10px] uppercase tracking-wider text-muted-foreground">Created</span>
											<span>{{ org.date_created ? formatDate(org.date_created) : '—' }}</span>
										</div>
									</div>

									<!-- Edit mode -->
									<div v-else class="space-y-3">
										<UFormGroup label="Name" required>
											<UInput v-model="infoForm.name" placeholder="Organization name" />
										</UFormGroup>
										<UFormGroup label="Industry">
											<select
												v-model="infoForm.industry"
												class="w-full rounded-full border bg-background px-3 py-2 text-sm"
											>
												<option value="">Select industry...</option>
												<option v-for="ind in industries" :key="ind.id" :value="ind.id">{{ ind.name }}</option>
											</select>
										</UFormGroup>
										<UFormGroup label="Website">
											<UInput v-model="infoForm.website" placeholder="https://example.com" />
										</UFormGroup>
										<UFormGroup label="Notes">
											<UTextarea v-model="infoForm.notes" placeholder="Organization description or notes" :rows="2" autoresize />
										</UFormGroup>
										<UFormGroup label="Brand Color">
											<div class="flex items-center gap-3">
												<input
													type="color"
													v-model="infoForm.brand_color"
													class="w-8 h-8 rounded cursor-pointer border border-gray-200"
												/>
												<UInput v-model="infoForm.brand_color" placeholder="#000000" class="flex-1" />
											</div>
										</UFormGroup>
										<UFormGroup label="Active">
											<div class="flex items-center gap-3">
												<UToggle v-model="infoForm.active" />
												<span class="text-xs text-gray-500">
													{{ infoForm.active ? 'Visible in selectors' : 'Hidden from selectors' }}
												</span>
											</div>
										</UFormGroup>
										<div class="flex justify-end gap-2 pt-2">
											<UButton color="gray" variant="ghost" size="xs" @click="editingInfo = false">Cancel</UButton>
											<UButton color="primary" size="xs" :loading="savingInfo" :disabled="!infoForm.name" @click="saveInfo">Save</UButton>
										</div>
									</div>
								</UCard>

								<!-- Billing Info — inline editable -->
								<UCard>
									<template #header>
										<div class="flex items-center justify-between">
											<h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Billing</h3>
											<UButton
												v-if="canManageOrg && !editingBilling"
												color="gray"
												variant="ghost"
												icon="i-heroicons-pencil-square"
												size="xs"
												@click="startEditBilling"
											/>
										</div>
									</template>

									<!-- View mode -->
									<div v-if="!editingBilling" class="space-y-3 text-sm">
										<div class="flex justify-between">
											<span class="text-[10px] uppercase tracking-wider text-muted-foreground">Email</span>
											<a v-if="org.email" :href="'mailto:' + org.email" class="text-primary truncate max-w-[180px]">{{ org.email }}</a>
											<span v-else class="text-muted-foreground italic">Not set</span>
										</div>
										<div class="flex justify-between">
											<span class="text-[10px] uppercase tracking-wider text-muted-foreground">Phone</span>
											<a v-if="org.phone" :href="'tel:' + org.phone" class="text-primary">{{ org.phone }}</a>
											<span v-else class="text-muted-foreground italic">Not set</span>
										</div>
										<div class="flex justify-between">
											<span class="text-[10px] uppercase tracking-wider text-muted-foreground">Address</span>
											<span v-if="org.address" class="text-right max-w-[180px]">{{ org.address }}</span>
											<span v-else class="text-muted-foreground italic">Not set</span>
										</div>
										<div class="flex justify-between">
											<span class="text-[10px] uppercase tracking-wider text-muted-foreground">Hourly Rate</span>
											<span>{{ org.default_hourly_rate ? `$${org.default_hourly_rate}` : '—' }}</span>
										</div>
										<div v-if="org.emails?.length">
											<span class="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1.5">Notification Emails</span>
											<div class="flex flex-wrap gap-1.5">
												<UBadge
													v-for="(email, index) in Array.isArray(org.emails) ? org.emails : [org.emails]"
													:key="index"
													color="primary"
													variant="soft"
													size="xs"
												>
													{{ email }}
												</UBadge>
											</div>
										</div>
									</div>

									<!-- Edit mode -->
									<div v-else class="space-y-3">
										<UFormGroup label="Email">
											<UInput v-model="billingForm.email" placeholder="billing@example.com" type="email" />
										</UFormGroup>
										<UFormGroup label="Phone">
											<UInput v-model="billingForm.phone" placeholder="+1 (555) 000-0000" />
										</UFormGroup>
										<UFormGroup label="Address">
											<UTextarea v-model="billingForm.address" placeholder="Street address, city, state, ZIP" :rows="3" autoresize />
										</UFormGroup>
										<UFormGroup label="Default Hourly Rate" help="Auto-populated in time tracking when billable is enabled">
											<UInput v-model="billingForm.default_hourly_rate" type="number" placeholder="0.00" step="0.01" min="0" icon="i-heroicons-currency-dollar" />
										</UFormGroup>
										<div class="flex justify-end gap-2 pt-2">
											<UButton color="gray" variant="ghost" @click="editingBilling = false">Cancel</UButton>
											<UButton color="primary" :loading="savingBilling" @click="saveBilling">Save</UButton>
										</div>
									</div>
								</UCard>
							<!-- Subscription & Plan -->
								<UCard v-if="canManageOrg">
									<template #header>
										<h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Subscription</h3>
									</template>
									<div class="space-y-3 text-sm">
										<div class="flex justify-between">
											<span class="text-[10px] uppercase tracking-wider text-muted-foreground">Plan</span>
											<UBadge color="primary" variant="soft" size="xs">Pro</UBadge>
										</div>
										<div class="flex justify-between">
											<span class="text-[10px] uppercase tracking-wider text-muted-foreground">Status</span>
											<UBadge color="green" variant="soft" size="xs">Active</UBadge>
										</div>
										<NuxtLink
											to="/account/subscription"
											class="flex items-center justify-center gap-1.5 w-full mt-2 px-3 py-1.5 text-xs font-medium text-primary border border-primary/20 rounded-lg hover:bg-primary/5 transition-colors"
										>
											<UIcon name="i-heroicons-cog-6-tooth" class="w-3.5 h-3.5" />
											Manage Subscription
										</NuxtLink>
									</div>
								</UCard>

								<!-- Danger Zone — archive / restore (owner only) -->
								<UCard v-if="isOrgOwner" class="border border-red-200 dark:border-red-900/50">
									<template #header>
										<h3 class="text-[10px] uppercase tracking-wider font-semibold text-red-600 dark:text-red-400">Danger Zone</h3>
									</template>
									<div class="space-y-3 text-sm">
										<template v-if="!isArchived">
											<p class="text-xs text-muted-foreground">
												Archive to cancel your subscription at the end of the current billing period and soft-delete all org data. Data is retained for 90 days.
											</p>
											<UButton
												color="red"
												variant="outline"
												icon="i-heroicons-archive-box"
												size="sm"
												block
												@click="showArchiveModal = true"
											>
												Archive Organization
											</UButton>
										</template>
										<template v-else>
											<p class="text-xs text-muted-foreground">
												This organization is archived. Restore to reactivate the subscription (if within the period) and make it visible again.
											</p>
											<UButton
												color="amber"
												variant="solid"
												icon="i-heroicons-arrow-uturn-left"
												size="sm"
												block
												:loading="restoring"
												@click="confirmRestore"
											>
												Restore Organization
											</UButton>
										</template>
									</div>
								</UCard>
							</div>
						</div>
					</template>

					<template #members>
						<div class="mt-6">
							<div class="flex justify-between items-center mb-4">
								<h3 class="text-lg font-medium">Organization Members</h3>
								<div v-if="canManageOrg" class="flex gap-2">
									<UButton
										color="gray"
										variant="outline"
										icon="i-heroicons-user-plus"
										size="sm"
										@click="openAddMemberModal"
									>
										Add Existing User
									</UButton>
									<UButton
										color="primary"
										icon="i-heroicons-envelope"
										size="sm"
										@click="openInviteModal"
									>
										Invite Member
									</UButton>
								</div>
							</div>

							<!-- Pending invites banner -->
							<div v-if="pendingInvites.length > 0" class="mb-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
								<div class="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
									<UIcon name="i-heroicons-clock" class="w-4 h-4" />
									<span>{{ pendingInvites.length }} pending invitation{{ pendingInvites.length === 1 ? '' : 's' }}</span>
								</div>
							</div>

							<div v-if="filteredUsers.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
								<UCard v-for="member in filteredUsers" :key="member.id">
									<div class="flex items-center justify-between">
										<div class="flex items-center space-x-4">
											<UAvatar
												:src="member.avatar ? `${config.public.directusUrl}/assets/${member.avatar}?key=small` : null"
												:alt="`${member.first_name} ${member.last_name}`"
											/>
											<div>
												<div class="flex items-center gap-2">
													<h4 class="font-medium">{{ member.first_name }} {{ member.last_name }}</h4>
													<!-- Role: editable dropdown for owners/admins, badge otherwise -->
													<template v-if="getMemberRole(member.id)">
														<select
															v-if="canManageOrg && member.id !== user?.id && getMemberRole(member.id).slug !== 'owner'"
															class="text-xs rounded-md border border-gray-200 dark:border-gray-600 bg-transparent px-1.5 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
															:value="getMemberRole(member.id).id"
															:disabled="changingRole"
															@change="changeMemberRole(member.id, $event.target.value)"
														>
															<option
																v-for="role in assignableRoles"
																:key="role.id"
																:value="role.id"
															>
																{{ role.name }}
															</option>
														</select>
														<UBadge
															v-else
															:color="getRoleBadgeColor(getMemberRole(member.id).slug)"
															variant="soft"
															size="xs"
														>
															{{ getMemberRole(member.id).name }}
														</UBadge>
													</template>
												</div>
												<p class="text-sm text-gray-500">{{ member.email }}</p>
											</div>
										</div>
										<UButton
											v-if="canManageOrg && member.id !== user?.id"
											color="red"
											variant="ghost"
											icon="i-heroicons-user-minus"
											size="xs"
											@click="confirmRemoveMember(member)"
										/>
									</div>
								</UCard>
							</div>

							<div v-else class="text-center py-12">
								<UIcon name="i-heroicons-users" class="w-12 h-12 text-gray-300 mx-auto mb-4" />
								<p class="text-gray-500 mb-4">No members found for this organization.</p>
								<UButton
									v-if="canManageOrg"
									color="primary"
									icon="i-heroicons-envelope"
									@click="openInviteModal"
								>
									Invite a Member
								</UButton>
							</div>
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

					<template #ai-usage>
						<div class="mt-6">
							<OrganizationAIUsage :organization-id="selectedOrg" />
						</div>
					</template>
				</UTabs>
			</div>
		</div>

		<!-- Invite Member Modal (new org-aware component) -->
		<OrganizationInviteMemberModal
			v-if="selectedOrg"
			v-model="showInviteModal"
			:organization-id="selectedOrg"
			:roles="orgRoles"
			@invited="onMemberInvited"
		/>

		<!-- Add Existing User Modal -->
		<UModal v-model="showAddMemberModal" :ui="{ width: 'max-w-lg' }">
			<div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
				<h3 class="text-lg font-semibold">Add Member to Organization</h3>
				<UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="showAddMemberModal = false" />
			</div>

			<div class="space-y-4 p-4">
				<p class="text-sm text-gray-500">
					Search for existing users to add them to this organization.
				</p>

				<UFormGroup label="Search Users">
					<UInput
						v-model="searchEmail"
						placeholder="Search by name or email..."
						icon="i-heroicons-magnifying-glass"
					/>
				</UFormGroup>

				<div v-if="searching" class="flex justify-center py-4">
					<UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-gray-500" />
				</div>

				<div v-else-if="searchResults.length > 0" class="space-y-2 max-h-64 overflow-y-auto">
					<div
						v-for="result in searchResults"
						:key="result.id"
						class="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700"
					>
						<div class="flex items-center space-x-3">
							<UAvatar
								:src="result.avatar ? `${config.public.directusUrl}/assets/${result.avatar}?key=small` : null"
								:alt="`${result.first_name} ${result.last_name}`"
								size="sm"
							/>
							<div>
								<p class="font-medium text-sm">{{ result.first_name }} {{ result.last_name }}</p>
								<p class="text-xs text-gray-500">{{ result.email }}</p>
							</div>
						</div>
						<UButton
							color="primary"
							variant="outline"
							size="xs"
							icon="i-heroicons-plus"
							:loading="addingUser"
							@click="addUserToOrganization(result.id)"
						>
							Add
						</UButton>
					</div>
				</div>

				<p v-else-if="searchEmail.length >= 2 && !searching" class="text-center text-sm text-gray-500 py-4">
					No users found matching your search.
				</p>
			</div>

			<div class="flex justify-end p-4 border-t border-gray-200 dark:border-gray-700">
				<UButton color="gray" variant="ghost" @click="showAddMemberModal = false">Close</UButton>
			</div>
		</UModal>

		<!-- Archive Organization Confirmation Modal -->
		<UModal v-model="showArchiveModal">
			<div class="p-4 border-b border-gray-200 dark:border-gray-700">
				<h3 class="text-lg font-semibold text-red-600">Archive Organization</h3>
			</div>

			<div class="p-4 space-y-3 text-sm">
				<p>
					Are you sure you want to archive <strong>{{ org?.name }}</strong>?
				</p>
				<ul class="list-disc pl-5 space-y-1 text-gray-700 dark:text-gray-300">
					<li>Your Stripe subscription will be set to cancel at the end of the current billing period.</li>
					<li>The organization and its data will be hidden from daily use.</li>
					<li>Your data is retained for 90 days. Restore any time before then.</li>
				</ul>
				<p class="text-xs text-muted-foreground">
					This action only you, the owner, can perform. Demo accounts cannot archive.
				</p>
			</div>

			<div class="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
				<UButton color="gray" variant="ghost" :disabled="archiving" @click="showArchiveModal = false">Cancel</UButton>
				<UButton color="red" icon="i-heroicons-archive-box" :loading="archiving" @click="confirmArchive">
					Archive Organization
				</UButton>
			</div>
		</UModal>

		<!-- Remove Member Confirmation Modal -->
		<UModal v-model="showRemoveMemberModal">
			<div class="p-4 border-b border-gray-200 dark:border-gray-700">
				<h3 class="text-lg font-semibold text-red-600">Remove Member</h3>
			</div>

			<div class="p-4">
				<p class="mb-4">
					Are you sure you want to remove
					<strong>{{ memberToRemove?.first_name }} {{ memberToRemove?.last_name }}</strong>
					from this organization?
				</p>
				<p class="text-sm text-gray-500">
					This will remove their access to organization resources. Their user account will remain active.
				</p>
			</div>

			<div class="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
				<UButton color="gray" variant="ghost" @click="showRemoveMemberModal = false">Cancel</UButton>
				<UButton color="red" :loading="removingMember" @click="removeMember">Remove Member</UButton>
			</div>
		</UModal>
	</div>
</template>
