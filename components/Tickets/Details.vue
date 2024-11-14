<template>
	<div class="space-y-6">
		<!-- Ticket Actions -->
		<div class="flex items-center justify-between">
			<div class="flex items-center space-x-2">
				<UButton color="gray" variant="ghost" icon="i-heroicons-paper-clip" :loading="isLoading" />
				<UButton color="gray" variant="ghost" icon="i-heroicons-share" :loading="isLoading" />
			</div>
			<UButton color="red" variant="ghost" icon="i-heroicons-archive-box" :loading="isLoading" />
		</div>

		<!-- Ticket Details Grid -->
		<div class="grid grid-cols-2 gap-4">
			<div>
				<h4 class="text-sm font-medium text-gray-500 mb-1">Status</h4>
				<USelect
					v-model="localElement.status"
					:options="columns"
					option-attribute="name"
					value-attribute="id"
					:loading="isLoading"
					@change="updateTicket({ status: localElement.status })"
				/>
			</div>
			<div>
				<h4 class="text-sm font-medium text-gray-500 mb-1">Priority</h4>
				<USelect
					v-model="localElement.priority"
					:options="priorities"
					:loading="isLoading"
					@change="updateTicket({ priority: localElement.priority })"
				/>
			</div>
			<div class="col-span-2">
				<h4 class="text-sm font-medium text-gray-500 mb-1">Assigned To</h4>
				<USelect
					v-model="localElement.assigned_to"
					:options="users"
					:loading="isLoading"
					@change="updateTicket({ assigned_to: localElement.assigned_to })"
				>
					<template #option="{ option: user }">
						<div class="flex items-center space-x-2">
							<UAvatar :src="getAvatarUrl(user)" :alt="getUserFullName(user)" size="xs" />
							<span>{{ getUserFullName(user) }}</span>
						</div>
					</template>
				</USelect>
			</div>
		</div>

		<!-- Description -->
		<div>
			<h4 class="text-sm font-medium text-gray-500 mb-2">Description</h4>
			<FormTiptap
				v-model="localElement.description"
				:loading="isLoading"
				:editable="!isLoading"
				@update:model-value="updateTicket({ description: localElement.description })"
			/>
		</div>

		<!-- Comments -->
		<div>
			<h4 class="text-sm font-medium text-gray-500 mb-2">Comments</h4>
			<!-- <CommentsContainer
        :item="localElement.id"
        collection="tickets"
      /> -->
		</div>
	</div>
</template>

<script setup>
const props = defineProps({
	element: {
		type: Object,
		required: true,
	},
	columns: {
		type: Array,
		required: true,
	},
	isLoading: {
		type: Boolean,
		default: false,
	},
});

const { updateItem } = useDirectusItems();
const localElement = ref({ ...props.element });

// Watch for changes in the element prop
watch(
	() => props.element,
	(newVal) => {
		localElement.value = { ...newVal };
	},
	{ deep: true },
);

const priorities = [
	{ value: 'low', label: 'Low' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'high', label: 'High' },
	{ value: 'urgent', label: 'Urgent' },
];

// Get users for assignment
const { data: users } = useDirectusItems({
	collection: 'directus_users',
	params: {
		fields: ['id', 'first_name', 'last_name', 'avatar'],
		sort: ['first_name'],
	},
});

const updateTicket = async (updates) => {
	try {
		await updateItem('tickets', localElement.value.id, {
			...updates,
			date_updated: new Date(),
		});
	} catch (error) {
		console.error('Error updating ticket:', error);
		useToast().add({
			title: 'Error',
			description: 'Failed to update ticket. Please try again.',
			color: 'red',
		});
	}
};

// Utility functions from previous component
const getAvatarUrl = (user) => {
	if (!user?.avatar) return null;
	return `${useRuntimeConfig().public.directusUrl}/assets/${user.avatar}?key=small`;
};

const getUserFullName = (user) => {
	if (!user) return 'Unknown';
	return `${user.first_name} ${user.last_name}`.trim();
};
</script>
