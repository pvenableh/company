<template>
	<div class="w-full px-4 py-10 min-h-svh flex items-center justify-start flex-col">
		<div class="w-full max-w-2xl">
			<h1 class="t-label border-b border-border">Overview</h1>
			<div class="uppercase mt-6">
				<h1 class="tracking-wide font-bold">{{ project.title }}</h1>
				<!-- <p>{{ project.description }}</p> -->
				<!-- <p v-if="isAdmin">${{ project.contract_value }}</p> -->
				<h5 class="text-[9px]">
					<span class="h-2 w-2 inline-block mr-0.5" :style="'background:' + project.service.color"></span>
					{{ project.service.name }}
				</h5>
			</div>
			<div class="flex items-center justify-between mt-12 border-b border-border">
				<h1 class="uppercase trackine text-[10px] font-bold">Project Events:</h1>
				<Button size="sm" variant="outline" class="uppercase text-[10px] tracking-wide mb-1" @click="showNewEventModal = true">
					<UIcon name="i-heroicons-plus" class="h-3 w-3 mr-1" />
					New Event
				</Button>
			</div>
			<div v-for="(event, index) in designEvents" :key="index" class="my-6">
				<h5 class="uppercase tracking-wide font-bold">{{ event.title }}</h5>

				<nuxt-link :to="/projects/ + project.id + '/events/' + event.id" class="text-[10px] leading-3 font-bold">
					EVENT DETAILS
					<UIcon name="i-heroicons-arrow-right" class="h-2 w-2" />
				</nuxt-link>
			</div>
			<!-- <ProjectsTimeline :project="project" />
		<ProjectsTimelineTwo :project="project" /> -->
		</div>

		<!-- New Event Modal -->
		<UModal v-model="showNewEventModal" title="New Event">
			<template #header>
				<div class="flex items-center justify-between w-full">
					<h3 class="text-sm font-bold uppercase tracking-wide">New Event</h3>
					<Button variant="ghost" size="icon-sm" @click="showNewEventModal = false">
						<UIcon name="i-heroicons-x-mark" class="h-4 w-4" />
					</Button>
				</div>
			</template>

			<form @submit.prevent="handleCreateEvent" class="space-y-4 p-4">
				<!-- Title -->
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Title *</label>
					<UInput v-model="newEventForm.title" placeholder="Event title" />
				</div>

				<!-- Description -->
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Description</label>
					<UTextarea v-model="newEventForm.description" placeholder="Event description..." :rows="3" />
				</div>

				<!-- Type & Status -->
				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-1">
						<label class="t-label text-muted-foreground">Type</label>
						<USelectMenu
							v-model="newEventForm.type"
							:options="eventTypeOptions"
							option-attribute="label"
							value-attribute="value"
							placeholder="Select type"
						/>
					</div>
					<div class="space-y-1">
						<label class="t-label text-muted-foreground">Status</label>
						<USelectMenu
							v-model="newEventForm.status"
							:options="eventStatusOptions"
							option-attribute="label"
							value-attribute="value"
							placeholder="Select status"
						/>
					</div>
				</div>

				<!-- Date & Priority -->
				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-1">
						<label class="t-label text-muted-foreground">Date</label>
						<UInput v-model="newEventForm.date" type="date" />
					</div>
					<div class="space-y-1">
						<label class="t-label text-muted-foreground">Priority</label>
						<USelectMenu
							v-model="newEventForm.priority"
							:options="priorityOptions"
							option-attribute="label"
							value-attribute="value"
							placeholder="Select priority"
						/>
					</div>
				</div>

				<!-- Prototype Link -->
				<div class="space-y-1">
					<label class="t-label text-muted-foreground">Prototype Link</label>
					<UInput v-model="newEventForm.prototype_link" placeholder="https://..." />
				</div>
			</form>

			<template #footer>
				<div class="flex justify-end gap-3 w-full">
					<Button variant="outline" size="sm" @click="showNewEventModal = false">Cancel</Button>
					<Button size="sm" :disabled="creatingEvent || !newEventForm.title.trim()" @click="handleCreateEvent">
						<UIcon v-if="creatingEvent" name="i-heroicons-arrow-path" class="animate-spin h-3 w-3 mr-1" />
						Create Event
					</Button>
				</div>
			</template>
		</UModal>
	</div>
</template>
<script setup>
import { Button } from '~/components/ui/button';

const props = defineProps({
	project: {
		type: Object,
		required: true,
	},
});

const emit = defineEmits(['eventCreated']);

const { user } = useDirectusAuth();
const { canAccess } = useRole();
const eventItems = useDirectusItems('project_events');

const isAdmin = computed(() => canAccess('projects'));

// New Event modal state
const showNewEventModal = ref(false);
const creatingEvent = ref(false);
const newEventForm = reactive({
	title: '',
	description: '',
	type: 'design',
	status: 'Active',
	date: '',
	prototype_link: '',
	priority: 'medium',
});

const eventTypeOptions = [
	{ label: 'Design', value: 'design' },
	{ label: 'Development', value: 'development' },
	{ label: 'Review', value: 'review' },
	{ label: 'Meeting', value: 'meeting' },
];

const eventStatusOptions = [
	{ label: 'Active', value: 'Active' },
	{ label: 'Completed', value: 'Completed' },
	{ label: 'Cancelled', value: 'Cancelled' },
];

const priorityOptions = [
	{ label: 'Low', value: 'low' },
	{ label: 'Medium', value: 'medium' },
	{ label: 'High', value: 'high' },
];

const resetNewEventForm = () => {
	newEventForm.title = '';
	newEventForm.description = '';
	newEventForm.type = 'design';
	newEventForm.status = 'Active';
	newEventForm.date = '';
	newEventForm.prototype_link = '';
	newEventForm.priority = 'medium';
};

const handleCreateEvent = async () => {
	if (!newEventForm.title.trim()) {
		useToast().add({
			title: 'Error',
			description: 'Event title is required',
			color: 'red',
		});
		return;
	}

	creatingEvent.value = true;
	try {
		const data = {
			title: newEventForm.title.trim(),
			type: newEventForm.type,
			status: newEventForm.status,
			priority: newEventForm.priority,
			project: props.project.id,
		};

		if (newEventForm.description?.trim()) {
			data.description = newEventForm.description.trim();
		}
		if (newEventForm.date) {
			data.date = newEventForm.date;
		}
		if (newEventForm.prototype_link?.trim()) {
			data.prototype_link = newEventForm.prototype_link.trim();
		}

		await eventItems.create(data);

		useToast().add({
			title: 'Event Created',
			description: `"${data.title}" has been created`,
			color: 'green',
		});

		emit('eventCreated');
		showNewEventModal.value = false;
		resetNewEventForm();
	} catch (error) {
		console.error('Error creating event:', error);
		useToast().add({
			title: 'Error',
			description: 'Failed to create event',
			color: 'red',
		});
	} finally {
		creatingEvent.value = false;
	}
};

const designEvents = computed(() => {
	return props.project?.events
		?.filter((event) => event.type.toLowerCase() === 'design' && event.status === 'Active')
		.sort((a, b) => new Date(a.date) - new Date(b.date))
		.map((event) => {
			return {
				id: event.id,
				title: event.title,
				description: event.description,
				prototype: event.prototype_link,
				link: event.link,
				priority: event.priority,
				approval: event.approval,
				file: event.file,
			};
		});
});
</script>
