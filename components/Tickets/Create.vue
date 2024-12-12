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
					class="fixed inset-0 z-[9999] overflow-auto flex flex-col items-center justify-center backdrop-blur-lg bg-white dark:bg-gray-800 bg-opacity-75"
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
									<UInput v-model="form.title" placeholder="Enter ticket title" />
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
											:options="orgOptions"
											option-attribute="name"
											value-attribute="id"
											placeholder="Select Organization"
											class="relative"
											@update:modelValue="handleOrgChange"
										/>
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

const { filteredUsers, fetchFilteredUsers, loading: loadingUsers } = useFilteredUsers();

const { createItem, readItems } = useDirectusItems();
// const { readUsers } = useDirectusUsers();
const { user: currentUser } = useDirectusAuth();

const emit = defineEmits(['ticketCreated']);
const isExpanded = ref(false);
const isLoading = ref(false);
const userOptions = ref([]);
const selectedUser = ref(null);
const { notify } = useNotifications();

const toast = useToast();

const selectedDate = ref(new Date());
const selectedTime = ref('17:00');

const mentionedUsers = ref(new Set());

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
		// Get the user's timezone
		const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

		// Parse hours and minutes
		const [hours, minutes] = selectedTime.value.split(':');

		// Create date in local timezone
		const dateTime = new Date(selectedDate.value);

		// Set hours and minutes in local timezone
		dateTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

		// Convert to ISO string while preserving timezone offset
		const offset = dateTime.getTimezoneOffset();
		const localISOTime = new Date(dateTime.getTime() - offset * 60 * 1000).toISOString();

		form.value.due_date = localISOTime;

		console.log({
			localDateTime: dateTime.toString(),
			timezone: userTimezone,
			isoString: form.value.due_date,
			offset: offset,
		});
	}
};

const projectOptions = ref([]);
const loadingProjects = ref(false);

const orgOptions = computed(
	() =>
		currentUser.value?.organizations?.map((org) => ({
			id: org.organizations_id.id,
			name: org.organizations_id.name,
		})) || [],
);

const hasMultipleOrgs = computed(() => orgOptions.value.length > 1);
const defaultOrg = computed(() => orgOptions.value[0]?.id || null);

const form = ref({
	title: '',
	description: '',
	status: 'Pending',
	priority: 'medium',
	due_date: new Date().toISOString(),
	assigned_to: [],
	organization: defaultOrg.value,
	project: null,
});

const priorities = [
	{ value: 'low', label: 'Low' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'high', label: 'High' },
	{ value: 'urgent', label: 'Urgent' },
];

const calendarAttrs = [
	{
		key: 'today',
		dot: true,
		dates: new Date(),
	},
];

// Fetch users
// const fetchUsers = async () => {
// 	try {
// 		const users = await readUsers({
// 			fields: ['id', 'first_name', 'last_name', 'email', 'avatar'],
// 		});

// 		userOptions.value = users.map((user) => ({
// 			id: user.id,
// 			label: `${user.first_name} ${user.last_name}`,
// 			email: user.email,
// 			avatar: user.avatar,
// 			first_name: user.first_name,
// 			last_name: user.last_name,
// 		}));

// 		console.log('Fetched users:', userOptions.value);
// 	} catch (error) {
// 		console.error('Error fetching users:', error);
// 		userOptions.value = [];
// 		toast.add({
// 			title: 'Error',
// 			description: 'Failed to load users. Please refresh the page.',
// 			color: 'red',
// 		});
// 	}
// };

// Computed for available users
const availableUsers = computed(() => {
	return filteredUsers.value.filter((user) => !form.value.assigned_to.includes(user.id));
});

// User selection handler
const handleUserSelect = (user) => {
	console.log('handleUserSelect called with:', user);

	if (user && user.id) {
		console.log('Adding user:', user);
		if (!form.value.assigned_to.includes(user.id)) {
			form.value.assigned_to.push(user.id);
			console.log('Updated assigned_to:', form.value.assigned_to);
		}
		// Reset selection after adding
		selectedUser.value = null;
	}
};

// Helper functions
const getUserById = (userId) => {
	const user = filteredUsers.value.find((u) => u.id === userId);
	return user;
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

// Updated isCurrentUser function
const isCurrentUserBadge = (userId) => {
	return currentUser.value && userId === currentUser.value.id;
};

const removeUser = (userId) => {
	form.value.assigned_to = form.value.assigned_to.filter((id) => id !== userId);
};

watch(
	() => form.value.assigned_to,
	(newVal) => {
		console.log('assigned_to changed:', newVal);
		console.log(
			'Current users:',
			newVal.map((id) => getUserById(id)),
		);
	},
	{ deep: true },
);

const handleMention = (mentionData) => {
	mentionedUsers.value.add(mentionData.id);
};

async function notifyMentionedUsers(commentText, collection, itemId) {
	for (const userId of mentionedUsers.value) {
		await notify({
			recipient: userId,
			subject: 'You were mentioned in a ticket',
			message: `${currentUser.value.first_name} ${currentUser.value.last_name} mentioned you in a ticket: ${commentText}`,
			collection,
			item: itemId,
			sender: currentUser.value.id,
		});
	}
}

const createTicket = async () => {
	try {
		isLoading.value = true;

		if (mentionedUsers.value.size > 0) {
			const result = await notifyMentionedUsers(form.value.title, 'tickets', props.element?.id);
			console.log(result);
		}

		// Extract assigned_to from form data
		const { assigned_to, ...ticketData } = form.value;

		console.log(ticketData);

		// Create ticket first
		const ticket = await createItem('tickets', {
			...ticketData,
			date_created: new Date(),
			date_updated: new Date(),
		});

		// Then create user assignments if any exist
		if (assigned_to?.length) {
			await Promise.all(
				assigned_to.map((userId) =>
					createItem('tickets_directus_users', {
						tickets_id: ticket.id,
						directus_users_id: userId,
					}),
				),
			);
		}

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
	// Fetch users when form opens
	// await fetchUsers();
	await fetchFilteredUsers();
};

const closeForm = () => {
	isExpanded.value = false;
	document.body.style.overflow = '';
	form.value = {
		title: '',
		description: '',
		status: 'Pending',
		priority: 'medium',
		category: '',
		due_date: '',
		assigned_to: [],
		organization: defaultOrg.value,
		project: null,
	};
	projectOptions.value = [];
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
		console.log(projects);
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

const handleOrgChange = async (orgId) => {
	form.value.project = null;
	await fetchProjects(orgId);
};

onMounted(() => {
	form.value.organization = defaultOrg.value;
	if (defaultOrg.value) {
		fetchProjects(defaultOrg.value);
	}
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && isExpanded.value) {
			closeForm();
		}
	});
});

onUnmounted(() => {
	document.body.style.overflow = '';
});
</script>
