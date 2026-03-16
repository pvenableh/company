<template>
	<div class="w-full px-4 py-10 min-h-[50vh] flex items-center justify-start flex-col">
		<div class="w-full max-w-2xl">
			<h1 class="t-label border-b border-border">Overview</h1>
			<div class="uppercase mt-6">
				<h1 class="tracking-wide font-bold">{{ project.title }}</h1>
				<h5 class="text-[9px]">
					<span class="h-2 w-2 inline-block mr-0.5" :style="'background:' + project.service.color"></span>
					{{ project.service.name }}
				</h5>
			</div>
			<div class="flex items-center justify-between mt-12 border-b border-border">
				<h1 class="uppercase trackine text-[10px] font-bold">Project Events:</h1>
				<div class="flex items-center gap-2 mb-1">
					<Button size="sm" variant="outline" class="uppercase text-[10px] tracking-wide" @click="showTimelineWizard = true">
						<Icon name="lucide:sparkles" class="h-3 w-3 mr-1" />
						Generate Timeline
					</Button>
					<Button size="sm" variant="outline" class="uppercase text-[10px] tracking-wide" @click="showNewEventModal = true">
						<UIcon name="i-heroicons-plus" class="h-3 w-3 mr-1" />
						New Event
					</Button>
				</div>
			</div>

			<!-- Events list -->
			<div v-if="allEvents.length > 0" class="space-y-3 mt-4">
				<button
					v-for="event in allEvents"
					:key="event.id"
					class="ios-card w-full text-left p-4 ios-press"
					@click="openEventDetail(event)"
				>
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2 min-w-0">
							<div
								class="h-2.5 w-2.5 rounded-full shrink-0"
								:class="{
									'bg-blue-500': event.type === 'design',
									'bg-green-500': event.type === 'payment',
									'bg-orange-500': event.type === 'review',
									'bg-purple-500': event.type === 'meeting',
									'bg-gray-400': !['design', 'payment', 'review', 'meeting'].includes(event.type),
								}"
							/>
							<h5 class="uppercase tracking-wide font-bold text-xs truncate">{{ event.title }}</h5>
						</div>
						<div class="flex items-center gap-2 shrink-0 ml-2">
							<span v-if="event.date" class="text-[9px] text-muted-foreground">
								{{ formatEventDate(event.date || event.event_date) }}
							</span>
							<span
								class="text-[8px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full"
								:class="{
									'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': event.status === 'Active',
									'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400': event.status === 'Completed',
									'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400': event.status === 'Cancelled',
								}"
							>
								{{ event.status }}
							</span>
							<Icon name="lucide:chevron-right" class="h-3.5 w-3.5 text-muted-foreground/50" />
						</div>
					</div>
				</button>
			</div>

			<!-- Empty state -->
			<div v-else class="flex flex-col items-center justify-center py-16 text-center">
				<div class="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mb-4">
					<Icon name="lucide:calendar-days" class="h-6 w-6 text-muted-foreground/60" />
				</div>
				<p class="text-sm text-muted-foreground">There are no events for this project.</p>
				<p class="text-xs text-muted-foreground/60 mt-1">Create events manually or generate a timeline with AI.</p>
			</div>
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

		<!-- Timeline Generator Wizard -->
		<ProjectsAITimelineWizard
			v-if="showTimelineWizard"
			:project="project"
			@close="showTimelineWizard = false"
			@created="handleTimelineCreated"
		/>

		<!-- Event Detail Modal -->
		<UModal v-model="showEventDetail" class="sm:max-w-xl">
			<template #header>
				<div class="flex items-center justify-between w-full">
					<div class="flex items-center gap-2">
						<span
							class="inline-block h-2.5 w-2.5 rounded-full"
							:style="{ backgroundColor: project.service?.color || '#888' }"
						/>
						<h3 class="t-label">{{ selectedEventFull?.title || 'Event Detail' }}</h3>
					</div>
					<Button variant="ghost" size="icon-sm" @click="closeEventDetail">
						<UIcon name="i-heroicons-x-mark" class="h-4 w-4" />
					</Button>
				</div>
			</template>

			<div class="max-h-[70vh] overflow-y-auto px-4 pb-4">
				<div v-if="loadingEventDetail" class="flex items-center justify-center py-20">
					<div class="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
				</div>

				<ProjectTimelineEventDetail
					v-else-if="selectedEventFull"
					:event="selectedEventFull"
					:project="eventProjectProxy"
					@close="closeEventDetail"
					@updated="handleEventUpdated"
				/>
			</div>
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

// Timeline wizard state
const showTimelineWizard = ref(false);

const handleTimelineCreated = (count) => {
	emit('eventCreated');
};

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

// Show all events sorted by date
const allEvents = computed(() => {
	return (props.project?.events || [])
		.sort((a, b) => new Date(a.date || a.event_date || 0) - new Date(b.date || b.event_date || 0));
});

const formatEventDate = (dateStr) => {
	if (!dateStr) return '';
	return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Event detail sheet
const showEventDetail = ref(false);
const selectedEventFull = ref(null);
const loadingEventDetail = ref(false);

// Proxy object to pass to ProjectTimelineEventDetail
const eventProjectProxy = computed(() => ({
	id: props.project.id,
	title: props.project.title,
	color: props.project.service?.color || '#888',
}));

const openEventDetail = async (event) => {
	showEventDetail.value = true;
	loadingEventDetail.value = true;
	try {
		const fullEvent = await eventItems.get(event.id, {
			fields: [
				'*',
				'tasks.*',
				'files.directus_files_id.*',
				'category_id.id,category_id.name,category_id.color,category_id.text_color',
			],
		});
		selectedEventFull.value = fullEvent;
	} catch (err) {
		console.error('Error fetching event details:', err);
		// Fall back to the basic event data
		selectedEventFull.value = event;
	} finally {
		loadingEventDetail.value = false;
	}
};

const closeEventDetail = () => {
	showEventDetail.value = false;
	selectedEventFull.value = null;
};

const handleEventUpdated = () => {
	emit('eventCreated');
};
</script>
