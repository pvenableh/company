<script setup>
import { ref } from 'vue';

const router = useRouter();
const { user } = useDirectusAuth();
const { createItem } = useDirectusItems();

const formData = ref({
	title: '',
	description: '',
	category: 'Pending',
	due_date: null,
	assigned_to: [],
});

const loading = ref(false);
const error = ref(null);

const createTicket = async () => {
	loading.value = true;
	error.value = null;

	try {
		const ticket = createItem('tickets', {
			...formData.value,
			user_created: user.value.id,
			status: 'published',
			date_created: new Date().toISOString(),
		});

		router.push(`/tickets/${ticket.id}`);
	} catch (err) {
		error.value = 'Failed to create ticket. Please try again.';
	} finally {
		loading.value = false;
	}
};
</script>

<template>
	<div class="max-w-2xl mx-auto p-6">
		<h1 class="text-2xl font-bold mb-6">Create New Ticket</h1>

		<form @submit.prevent="createTicket" class="space-y-6">
			<UFormGroup label="Title" required>
				<UInput v-model="formData.title" placeholder="Enter ticket title" required />
			</UFormGroup>

			<UFormGroup label="Description" required>
				<UTextarea v-model="formData.description" placeholder="Enter ticket description" required />
			</UFormGroup>

			<UFormGroup label="Category">
				<USelect v-model="formData.category" :options="['Pending', 'In Progress', 'Review', 'Complete']" />
			</UFormGroup>

			<UFormGroup label="Due Date">
				<UDatePicker v-model="formData.due_date" mode="date" :min="new Date()" />
			</UFormGroup>

			<UFormGroup label="Assign To">
				<UserSelect v-model="formData.assigned_to" multiple />
			</UFormGroup>

			<div class="flex justify-end space-x-3">
				<UButton color="gray" variant="soft" @click="router.back()">Cancel</UButton>
				<UButton type="submit" color="primary" :loading="loading">Create Ticket</UButton>
			</div>

			<UAlert v-if="error" color="red" title="Error" :description="error" />
		</form>
	</div>
</template>
