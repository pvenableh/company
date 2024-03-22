<!-- eslint-disable no-console -->
<script setup lang="ts">
import { isOpen, closeModal } from '~/composables/useTaskModal';

const { user } = useDirectusAuth();

const props = defineProps({
	task: {
		type: Object,
		default: () => ({
			id: '',
			title: '',
			description: '',
			category: '',
			due_date: '',
			project: '',
		}),
	},
	action: {
		type: String,
		default: 'create',
	},
});

const state = ref({
	title: '',
	description: '',
	category: '',
	due_date: '',
	project: '',
});

if (props.action === 'create') {
	state.value.category = 'Scheduled';
	state.value.due_date = format(new Date(), 'YYYY-MM-DD') + 'T17:00';
}

if (props.action === 'update') {
	state.value = {
		title: props.task.title,
		description: props.task.description,
		category: props.task.category,
		due_date: props.task.due_date,
		project: props.task.project,
	};
}

const validate = (state: any): FormError[] => {
	const errors = [];
	if (!state.title) errors.push({ path: 'title', message: 'Required' });
	if (!state.category) errors.push({ path: 'category', message: 'Required' });
	return errors;
};

async function onSubmit(event: FormSubmitEvent<any>) {
	if (user?.value.id) {
		if (props.action === 'create') {
			console.log(event.data.title);

			const result = await useDirectus(
				createItem('tasks', {
					status: 'published',
					title: event.data.title,
					description: event.data.description,
					category: event.data.category,
					due_date: event.data.due_date,
				}),
			);

			console.log(result);
		} else if (props.action === 'update') {
			const result = await useDirectus(
				updateItem('tasks', props.task.id, {
					title: event.data.title,
					description: event.data.description,
					category: event.data.category,
					due_date: event.data.due_date,
					project: event.data.project,
					user_updated: user.value.id,
				}),
			);

			console.log(result);
		}
	} else {
		await navigateTo('/auth/signin');
	}
}
</script>

<template>
	<div class="w-full h-full p-6">
		<UForm :validate="validate" :state="state" class="space-y-4" @submit="onSubmit">
			<UFormGroup label="Status" name="category">
				<USelect v-model="state.category" :options="['Pending', 'Scheduled', 'In Progress', 'Completed']" required />
			</UFormGroup>
			<UFormGroup label="Title" name="title">
				<UInput v-model="state.title" required />
			</UFormGroup>
			<UFormGroup label="Description" name="description">
				<FormTiptap v-model="state.description" />
			</UFormGroup>
			<UFormGroup label="Due Date" name="due_date">
				<UInput v-model="state.due_date" type="datetime-local" />
			</UFormGroup>

			<UButton type="submit">Submit</UButton>
		</UForm>
	</div>
</template>
<style></style>
