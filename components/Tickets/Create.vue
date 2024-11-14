<template>
	<div>
		<!-- Create Button -->
		<UButton icon="i-heroicons-document-plus" color="primary" class="mb-4 tracking-wide" @click="openForm">
			Create Ticket
		</UButton>

		<!-- Teleported Fullscreen Form -->
		<Teleport to="body">
			<Transition
				enter-active-class="transition duration-300 ease-out"
				enter-from-class="opacity-0 scale-95"
				enter-to-class="opacity-100 scale-100"
				leave-active-class="transition duration-200 ease-in"
				leave-from-class="opacity-100 scale-100"
				leave-to-class="opacity-0 scale-95"
			>
				<div v-if="isExpanded" class="fixed inset-0 bg-white dark:bg-gray-800 z-[9999] overflow-auto">
					<div class="container mx-auto p-4">
						<!-- Header -->
						<div class="sticky top-0 z-[10000] px-4 py-3 bg-white dark:bg-gray-800 border-b dark:border-gray-700">
							<div class="flex items-center justify-between">
								<h3 class="text-lg font-semibold">Create New Ticket</h3>
								<UButton color="gray" variant="ghost" icon="i-heroicons-x-mark-20-solid" @click="closeForm" />
							</div>
						</div>

						<!-- Form -->
						<div class="mt-4 max-w-2xl mx-auto">
							<form @submit.prevent="createTicket" class="space-y-6">
								<UFormGroup label="Title" required>
									<UInput v-model="form.title" placeholder="Enter ticket title" />
								</UFormGroup>

								<UFormGroup label="Description" required>
									<FormTiptap
										v-model="form.description"
										placeholder="Enter ticket description"
										:editor-props="{
											content: form.description,
										}"
									/>
								</UFormGroup>

								<div class="grid grid-cols-2 gap-4">
									<UFormGroup label="Status">
										<USelect v-model="form.status" :options="columns" option-attribute="name" value-attribute="id" />
									</UFormGroup>

									<UFormGroup label="Priority">
										<USelect v-model="form.priority" :options="priorities" />
									</UFormGroup>
								</div>

								<UFormGroup label="Category">
									<UInput v-model="form.category" placeholder="Enter categories (comma-separated)" />
								</UFormGroup>

								<UFormGroup label="Assign To">
									<div class="space-y-2">
										<!-- Selected Users Display -->
										<div v-if="form.assigned_to.length" class="flex flex-wrap gap-2 mb-2">
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
													@click="removeUser(userId)"
												/>
											</UBadge>
										</div>

										<!-- Select Menu -->
										<USelectMenu
											v-model="selectedUser"
											:options="availableUsers"
											placeholder="Select users..."
											searchable
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
									</div>
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
const { createItem } = useDirectusItems();
const { readUsers } = useDirectusUsers();
const { user: currentUser } = useDirectusAuth();

const emit = defineEmits(['ticketCreated']);
const isExpanded = ref(false);
const isLoading = ref(false);
const userOptions = ref([]);
const selectedUser = ref(null);

const form = ref({
	title: '',
	description: '',
	status: 'pending',
	priority: 'medium',
	category: '',
	assigned_to: [],
});

const priorities = [
	{ value: 'low', label: 'Low' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'high', label: 'High' },
	{ value: 'urgent', label: 'Urgent' },
];

// Fetch users
const fetchUsers = async () => {
	try {
		const users = await readUsers({
			fields: ['id', 'first_name', 'last_name', 'email', 'avatar'],
		});

		userOptions.value = users.map((user) => ({
			id: user.id,
			label: `${user.first_name} ${user.last_name}`,
			email: user.email,
			avatar: user.avatar,
			first_name: user.first_name,
			last_name: user.last_name,
		}));

		console.log('Fetched users:', userOptions.value);
	} catch (error) {
		console.error('Error fetching users:', error);
		userOptions.value = [];
		useToast().add({
			title: 'Error',
			description: 'Failed to load users. Please refresh the page.',
			color: 'red',
		});
	}
};

// Computed for available users
const availableUsers = computed(() => {
	return userOptions.value.filter((user) => !form.value.assigned_to.includes(user.id));
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
	const user = userOptions.value.find((u) => u.id === userId);
	console.log('Getting user by id:', userId, 'Found:', user);
	return user;
};

const getUserFullName = (user) => {
	if (!user) return 'Unknown';
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
const createTicket = async () => {
	try {
		isLoading.value = true;

		// Create the ticket
		const ticket = await createItem('tickets', {
			title: form.value.title,
			description: form.value.description,
			status: form.value.status,
			priority: form.value.priority,
			category: form.value.category,
			date_created: new Date(),
			date_updated: new Date(),
		});

		console.log('Created ticket:', ticket);

		// Create user assignments
		if (form.value.assigned_to.length) {
			const assignments = await Promise.all(
				form.value.assigned_to.map((userId) =>
					createItem('tickets_directus_users', {
						tickets_id: ticket.id,
						directus_users_id: userId,
					}),
				),
			);
			console.log('Created assignments:', assignments);
		}

		useToast().add({
			title: 'Success',
			description: 'Ticket created successfully',
			color: 'green',
		});
		emit('ticketCreated');
		closeForm();
	} catch (error) {
		console.error('Error creating ticket:', error);
		useToast().add({
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
	await fetchUsers();
};

const closeForm = () => {
	isExpanded.value = false;
	document.body.style.overflow = '';
	// Reset form
	form.value = {
		title: '',
		description: '',
		status: 'pending',
		priority: 'medium',
		category: '',
		assigned_to: [],
	};
};

onMounted(() => {
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && isExpanded.value) {
			closeForm();
		}
	});
});

onUnmounted(() => {
	document.body.style.overflow = '';
});

defineProps({
	columns: {
		type: Array,
		required: true,
	},
});
</script>
