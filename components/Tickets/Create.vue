<template>
	<div>
		<!-- Create Button -->
		<UButton icon="i-heroicons-document-plus" color="primary" class="tracking-wide" @click="openForm">
			Create Ticket
		</UButton>

		<!-- Teleported Fullscreen Form -->
		<Teleport to="body">
			<Transition
				enter-active-class="transition duration-300 ease-out"
				enter-from-class="opacity-0 scale-95 "
				enter-to-class="opacity-100 scale-100 "
				leave-active-class="transition duration-200 ease-in"
				leave-from-class="opacity-100 scale-100"
				leave-to-class="opacity-0 scale-95"
			>
				<div
					v-if="isExpanded"
					class="fixed inset-0 z-[50] overflow-auto flex flex-col items-center justify-center backdrop-blur-lg bg-white dark:bg-gray-800 bg-opacity-75"
				>
					<div class="w-full p-4 lg:p-12">
						<!-- Header -->
						<div class="w-full max-w-2xl mx-auto py-3">
							<div class="flex items-center justify-between">
								<h3 class="text-2xl leading-5 font-thin uppercase tracking-wide">
									Create
									<br />
									New Ticket
								</h3>
								<UButton color="gray" variant="ghost" icon="i-heroicons-x-mark-20-solid" @click="closeForm" />
							</div>
						</div>

						<!-- Form -->
						<div class="w-full mt-4 max-w-2xl mx-auto">
							<form @submit.prevent="createTicket" class="space-y-6">
								<UFormGroup label="Title" required>
									<UInput
										v-model="form.title"
										placeholder="Enter ticket title"
										required
										:ui="{ error: showTitleError }"
									/>
									<template v-if="showTitleError" #error>Title is required</template>
								</UFormGroup>

								<div class="grid grid-cols-2 gap-4">
									<UFormGroup label="Status">
										<USelect v-model="form.status" :options="columns" option-attribute="name" value-attribute="id" />
									</UFormGroup>

									<UFormGroup label="Priority">
										<USelect v-model="form.priority" :options="priorities" />
									</UFormGroup>
									<UFormGroup v-if="hasMultipleOrgs" label="Organization">
										<USelectMenu
											searchable
											v-model="form.organization"
											:options="organizationOptions"
											option-attribute="name"
											value-attribute="id"
											placeholder="Select Organization"
											class="relative"
											@update:modelValue="handleOrgChange"
										/>
									</UFormGroup>
									<UFormGroup label="Team" required>
										<USelect
											v-model="form.team"
											:options="teamsList"
											option-attribute="name"
											value-attribute="id"
											placeholder="Select team"
											:loading="teamsLoading"
											@update:modelValue="handleTeamChange"
										>
											<template #option="{ option }">
												<div class="flex flex-col">
													<span class="font-medium">{{ option.name }}</span>
													<span v-if="option.id === null" class="text-xs text-gray-500">
														Admin/Manager only - Shows all users in the organization
													</span>
													<span v-else-if="option.is_default" class="text-xs text-green-500">Default team</span>
												</div>
											</template>
										</USelect>
									</UFormGroup>

									<UFormGroup v-if="form.organization" label="Project">
										<USelectMenu
											searchable
											v-model="form.project"
											:options="projectOptions"
											option-attribute="title"
											value-attribute="id"
											placeholder="Select project"
											:loading="loadingProjects"
											class="relative"
										/>
									</UFormGroup>
								</div>
								<div class="grid grid-cols-2 gap-4">
									<UFormGroup label="Due Date">
										<UPopover>
											<UInput
												class="w-full"
												:model-value="formatDisplayDate(form.due_date)"
												:readonly="true"
												:placeholder="formatDisplayDate(new Date())"
												icon="i-heroicons-calendar"
											/>
											<template #panel>
												<VCalendar
													:attributes="calendarAttrs"
													is-expanded
													v-model="selectedDate"
													@dayclick="updateDueDate"
												/>
											</template>
										</UPopover>
									</UFormGroup>
									<UFormGroup label="Due Time">
										<USelect
											v-model="selectedTime"
											:options="timeOptions"
											placeholder="Select time"
											@update:model-value="updateDateTime"
										/>
									</UFormGroup>
								</div>

								<!-- User Assignment -->
								<div class="grid grid-cols-2 gap-4">
									<UFormGroup label="Assign To">
										<USelectMenu
											v-model="selectedUser"
											:options="availableUsers"
											placeholder="Select users..."
											searchable
											:loading="loadingUsers"
											:disabled="filteredUsers.length === 0"
											@update:modelValue="handleUserSelect"
										>
											<template #label>
												<div class="flex items-center gap-2">
													<UIcon name="i-heroicons-user-plus" class="w-4 h-4 text-gray-500" />
													<span class="text-gray-500">{{ selectedUser ? selectedUser.label : 'Add user...' }}</span>
												</div>
											</template>

											<template #option="{ option: user }">
												<div class="flex items-center gap-2 py-1">
													<UAvatar :src="getAvatarUrl(user)" :alt="user.label" size="sm" />
													<div class="flex flex-col">
														<span class="font-medium">{{ user.label }}</span>
														<span class="text-xs text-gray-500">{{ user.email }}</span>
													</div>
												</div>
											</template>
										</USelectMenu>
									</UFormGroup>

									<div v-if="form.assigned_to.length" class="flex flex-wrap flex-row gap-2 mt-6">
										<UBadge
											v-for="userId in form.assigned_to"
											:key="userId"
											:color="isCurrentUserBadge(userId) ? 'primary' : 'gray'"
											class="flex items-center gap-2"
										>
											<UAvatar
												:src="getAvatarUrl(getUserById(userId))"
												:alt="getUserFullName(getUserById(userId))"
												size="2xs"
											/>
											{{ getUserFullName(getUserById(userId)) }}
											<UButton
												color="white"
												variant="ghost"
												icon="i-heroicons-x-mark-20-solid"
												size="2xs"
												class="-mr-1"
												:ui="{ rounded: 'rounded-full' }"
												@click="removeUser(userId)"
											/>
										</UBadge>
									</div>
								</div>

								<UFormGroup label="Description" required>
									<FormTiptap
										v-model="form.description"
										placeholder="Enter ticket description"
										:editor-props="{
											content: form.description,
										}"
										@mention="handleMention"
									/>
								</UFormGroup>

								<div class="flex justify-end space-x-2">
									<UButton color="gray" variant="soft" @click="closeForm">Cancel</UButton>
									<UButton type="submit" color="primary" :loading="isLoading">Create Ticket</UButton>
								</div>
							</form>
						</div>
					</div>
				</div>
			</Transition>
		</Teleport>
	</div>
</template>

<script setup>
defineProps({
	columns: {
		type: Array,
		required: true,
	},
});

const { selectedOrg, organizations, hasMultipleOrgs, organizationOptions } = useOrganization();
const { teams, loading: teamsLoading, fetchTeams, selectedTeam, setTeam } = useTeams();
const { filteredUsers, fetchFilteredUsers, loading: loadingUsers, DEFAULT_TEAM_ID } = useFilteredUsers();
const { createItem, readItems } = useDirectusItems();
const { user: currentUser } = useDirectusAuth();

// Admin and Client Manager role IDs (using the ones from your code)
const ADMIN_ROLE_ID = '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01';
const CLIENT_MANAGER_ROLE_ID = '7b62b285-e3a8-46ff-9e8c-d1445a3c13bb';

// Check if user has admin access (admin or client manager)
const hasAdminAccess = computed(() => {
	return currentUser.value?.role?.id === ADMIN_ROLE_ID || currentUser.value?.role?.id === CLIENT_MANAGER_ROLE_ID;
});

const emit = defineEmits(['ticketCreated']);
const isExpanded = ref(false);
const isLoading = ref(false);
const selectedUser = ref(null);
const { notify } = useNotifications();
const toast = useToast();

const selectedDate = ref(new Date());
const selectedTime = ref('17:00');
const mentionedUsers = ref(new Set());

// Format teams for the dropdown, ensuring the default team is first and add "No Team" option for admins
const teamsList = computed(() => {
	if (!teams.value || teams.value.length === 0) {
		// If no teams and user is admin/manager, show "No Team" option
		if (hasAdminAccess.value) {
			return [
				{
					id: null,
					name: 'No Team (All Organization Users)',
					is_default: false,
				},
			];
		}
		return []; // Otherwise return empty list
	}

	// Create teams list with "No Team" option if user is admin/manager
	let teamsArray = [...teams.value];

	if (hasAdminAccess.value) {
		teamsArray.unshift({
			id: null,
			name: 'No Team (All Organization Users)',
			is_default: false,
		});
	}

	// Sort teams with default team first, then alphabetically
	// Keep "No Team" at the very top if it exists
	return teamsArray.sort((a, b) => {
		// Always keep "No Team" option at the top
		if (a.id === null) return -1;
		if (b.id === null) return 1;

		// Then sort by default status
		if (a.is_default && !b.is_default) return -1;
		if (!a.is_default && b.is_default) return 1;

		// Then sort alphabetically
		return a.name.localeCompare(b.name);
	});
});

const timeOptions = Array.from({ length: 48 }, (_, i) => {
	const hour = Math.floor(i / 2);
	const minute = (i % 2) * 30;
	const time = new Date();
	time.setHours(hour, minute);
	return {
		label: time.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: true,
		}),
		value: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
	};
});

const formatDisplayDate = (date) => {
	if (!date) return '';
	// Create date in local timezone
	const localDate = new Date(date);
	return localDate.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, // Use user's local timezone
	});
};

const updateDueDate = (day) => {
	selectedDate.value = day.date;
	updateDateTime();
};

const updateDateTime = () => {
	if (selectedDate.value && selectedTime.value) {
		const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

		const [hours, minutes] = selectedTime.value.split(':');

		const dateTime = new Date(selectedDate.value);

		dateTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

		const offset = dateTime.getTimezoneOffset();
		const localISOTime = new Date(dateTime.getTime() - offset * 60 * 1000).toISOString();

		form.value.due_date = localISOTime;

		// console.log({
		// 	localDateTime: dateTime.toString(),
		// 	timezone: userTimezone,
		// 	isoString: form.value.due_date,
		// 	offset: offset,
		// });
	}
};

const projectOptions = ref([]);
const loadingProjects = ref(false);

const form = ref({
	title: '',
	description: '',
	status: 'Pending',
	priority: 'medium',
	due_date: new Date().toISOString(),
	assigned_to: [],
	organization: selectedOrg.value,
	project: null,
	team: null, // Initially null, will be set after teams are loaded
});

const priorities = [
	{ value: 'low', label: 'Low' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'high', label: 'High' },
];

const calendarAttrs = [
	{
		key: 'today',
		dot: true,
		dates: new Date(),
	},
];

// Filter the available users by removing those already assigned
const availableUsers = computed(() => {
	return filteredUsers.value
		.filter((user) => !form.value.assigned_to.includes(user.id))
		.map((user) => ({
			id: user.id,
			label: `${user.first_name} ${user.last_name}`.trim(),
			email: user.email,
			avatar: user.avatar,
			first_name: user.first_name,
			last_name: user.last_name,
		}));
});

// User selection handler
const handleUserSelect = (user) => {
	if (user && user.id) {
		if (!form.value.assigned_to.includes(user.id)) {
			form.value.assigned_to.push(user.id);
		}
		// Reset selection after adding
		selectedUser.value = null;
	}
};

// Helper functions
const getUserById = (userId) => {
	return filteredUsers.value.find((u) => u.id === userId);
};

const getUserFullName = (user) => {
	if (!user) return 'Unknown';
	if (user.id === currentUser.value.id) return 'You';
	return `${user.first_name} ${user.last_name}`.trim() || user.label || 'Unknown';
};

const getAvatarUrl = (user) => {
	if (!user?.avatar) return null;
	return `${useRuntimeConfig().public.directusUrl}/assets/${user.avatar}?key=small`;
};

const isCurrentUserBadge = (userId) => {
	return currentUser.value && userId === currentUser.value.id;
};

const removeUser = (userId) => {
	form.value.assigned_to = form.value.assigned_to.filter((id) => id !== userId);
};

const handleMention = (mentionData) => {
	mentionedUsers.value.add(mentionData.id);
};

const showTitleError = ref(false);

const sendTicketNotification = async (userId, type, message, ticketId) => {
	// Skip notification if it's the current user
	if (userId === currentUser.value?.id) return;

	try {
		await notify({
			recipient: userId,
			subject: `New Ticket ${type}`,
			message: `${message}<br/><a href='https://huestudios.company/tickets/${ticketId}'>View ticket</a>`,
			collection: 'tickets',
			item: ticketId,
			sender: currentUser.value.id,
		});
	} catch (error) {
		console.error(`Error sending ${type} notification:`, error);
	}
};

const createTicket = async () => {
	try {
		isLoading.value = true;

		if (!form.value.title.trim()) {
			showTitleError.value = true;
			toast.add({
				title: 'Error',
				description: 'Please enter a valid title',
				color: 'red',
			});
			return;
		}

		// For non-admin users, ensure a team is selected
		if (!hasAdminAccess.value && form.value.team === null) {
			toast.add({
				title: 'Error',
				description: 'Please select a team for this ticket',
				color: 'red',
			});
			return;
		}

		// Extract assigned_to from form data
		const { assigned_to, ...ticketData } = form.value;

		// Create ticket first
		const ticket = await createItem('tickets', {
			...ticketData,
			date_created: new Date(),
			date_updated: new Date(),
		});

		// Process assignments and mentions in parallel
		const notificationPromises = [];

		// Handle user assignments
		if (assigned_to?.length) {
			await Promise.all(
				assigned_to.map((userId) =>
					createItem('tickets_directus_users', {
						tickets_id: ticket.id,
						directus_users_id: userId,
					}),
				),
			);

			// Queue assignment notifications
			assigned_to.forEach((userId) => {
				notificationPromises.push(
					sendTicketNotification(
						userId,
						'Assignment',
						`You have been assigned to a new ticket: ${form.value.title}`,
						ticket.id,
					),
				);
			});
		}

		// Handle mentions if any
		if (mentionedUsers.value.size > 0) {
			mentionedUsers.value.forEach((userId) => {
				notificationPromises.push(
					sendTicketNotification(
						userId,
						'Mention',
						`${currentUser.value.first_name} ${currentUser.value.last_name} mentioned you in a new ticket: ${form.value.title}`,
						ticket.id,
					),
				);
			});
		}

		// Send all notifications in parallel
		await Promise.all(notificationPromises);

		toast.add({
			title: 'Success',
			description: 'Ticket created successfully',
			color: 'green',
		});
		emit('ticketCreated');
		closeForm();
	} catch (error) {
		console.error('Error creating ticket:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to create ticket. Please try again.',
			color: 'red',
		});
	} finally {
		isLoading.value = false;
	}
};

const openForm = async () => {
	isExpanded.value = true;
	document.body.style.overflow = 'hidden';

	// Initialize form with current org and default values
	form.value = {
		title: '',
		description: '',
		status: 'Pending',
		priority: 'medium',
		due_date: new Date().toISOString(),
		assigned_to: [],
		organization: selectedOrg.value,
		project: null,
		team: null,
	};

	// Set up initial data
	try {
		// Fetch teams for the current organization
		if (selectedOrg.value) {
			await fetchTeams(selectedOrg.value);

			// Load projects for the organization
			await fetchProjects(selectedOrg.value);

			if (hasAdminAccess.value) {
				// Default to "No Team" option for admins/managers
				form.value.team = null;
				// Fetch all users in the organization
				await fetchAllOrganizationUsers(selectedOrg.value);
			} else {
				// For regular users, select default team
				const defaultTeam = teams.value.find((t) => t.is_default) || teams.value[0];
				if (defaultTeam) {
					form.value.team = defaultTeam.id;
					await fetchFilteredUsers(selectedOrg.value, defaultTeam.id);
				}
			}
		}
	} catch (error) {
		console.error('Error initializing form:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to load initial data',
			color: 'red',
		});
	}
};

const closeForm = () => {
	isExpanded.value = false;
	document.body.style.overflow = '';
	form.value = {
		title: '',
		description: '',
		status: 'Pending',
		priority: 'medium',
		due_date: '',
		assigned_to: [],
		organization: selectedOrg.value,
		project: null,
		team: null,
	};
	projectOptions.value = [];
	mentionedUsers.value.clear();
};

const fetchProjects = async (orgId) => {
	if (!orgId) {
		projectOptions.value = [];
		form.value.project = null;
		return;
	}

	loadingProjects.value = true;
	try {
		const projects = await readItems('projects', {
			fields: ['id', 'title'],
			filter: {
				organization: { _eq: orgId },
			},
		});
		projectOptions.value = projects;
	} catch (error) {
		console.error('Error fetching projects:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to load projects',
			color: 'red',
		});
		projectOptions.value = [];
	} finally {
		loadingProjects.value = false;
	}
};

// Handler for organization change
const handleOrgChange = async (orgId) => {
	form.value.project = null;
	form.value.assigned_to = []; // Clear assigned users when org changes

	// Fetch teams for the new organization
	await fetchTeams(orgId);

	// Fetch projects for the new organization
	await fetchProjects(orgId);

	if (hasAdminAccess.value) {
		// Admin/managers can default to "No Team"
		form.value.team = null;
		await fetchAllOrganizationUsers(orgId);
	} else {
		// Regular users must select a team (preferably default)
		const defaultTeam = teams.value.find((t) => t.is_default) || teams.value[0];
		if (defaultTeam) {
			form.value.team = defaultTeam.id;
			await fetchFilteredUsers(orgId, defaultTeam.id);
		} else {
			form.value.team = null;
		}
	}
};

// Handler for team change
const handleTeamChange = async (teamId) => {
	// console.log('Team changed to:', teamId);

	// Clear assigned users when team changes
	form.value.assigned_to = [];

	if (teamId === null) {
		// Only admin/client manager can use "No Team" option
		if (!hasAdminAccess.value) {
			// Reset to default team if not admin
			const defaultTeam = teams.value.find((t) => t.is_default) || teams.value[0];
			if (defaultTeam) {
				form.value.team = defaultTeam.id;
				await fetchFilteredUsers(form.value.organization, defaultTeam.id);
				setTeam(defaultTeam.id);
				toast.add({
					title: 'Team required',
					description: 'You must select a team when creating a ticket',
					color: 'yellow',
				});
				return;
			}
		}

		// If "No Team" is selected and user has permission, fetch all users in the organization
		await fetchAllOrganizationUsers(form.value.organization);
	} else {
		// Fetch users filtered by the selected team
		await fetchFilteredUsers(form.value.organization, teamId);
	}

	// Update the global team selection
	setTeam(teamId);
};

// Function to fetch all users in an organization
const fetchAllOrganizationUsers = async (orgId) => {
	if (!orgId) return;

	try {
		loadingUsers.value = true;
		const { readUsers } = useDirectusUsers();

		const users = await readUsers({
			filter: {
				organizations: {
					organizations_id: { _eq: orgId },
				},
			},
			fields: ['id', 'first_name', 'last_name', 'email', 'avatar'],
		});

		filteredUsers.value = users;
	} catch (error) {
		console.error('Error fetching organization users:', error);
		toast.add({
			title: 'Error',
			description: 'Failed to load organization users',
			color: 'red',
		});
		filteredUsers.value = [];
	} finally {
		loadingUsers.value = false;
	}
};

onMounted(async () => {
	try {
		// Set initial date/time
		updateDateTime();

		// Set up escape key handler
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' && isExpanded.value) {
				closeForm();
			}
		});
	} catch (error) {
		console.error('Error in onMounted:', error);
	}
});

onUnmounted(() => {
	document.body.style.overflow = '';
	document.removeEventListener('keydown', (e) => {
		if (e.key === 'Escape' && isExpanded.value) {
			closeForm();
		}
	});
});
</script>
