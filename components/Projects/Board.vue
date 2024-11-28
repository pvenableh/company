<script setup>
import VueDraggable from 'vuedraggable';
const { readItems, updateItem } = useDirectusItems();
const { user } = useDirectusAuth();

const columns = [
	{ id: 'draft', name: 'Draft', color: 'gray' },
	{ id: 'in-progress', name: 'In Progress', color: 'blue' },
	{ id: 'review', name: 'Review', color: 'yellow' },
	{ id: 'published', name: 'Published', color: 'green' },
];

const activeColumn = ref(columns[0].id);
const isMobile = ref(false);
const updatingProjects = ref(new Set());
const isDragging = ref(false);

const ADMIN_ROLE = '3a63a4e1-c82e-46f8-9993-7f11ac6a4b01';
const isAdmin = computed(() => user.value?.role === ADMIN_ROLE);
const selectedOrg = ref(null);

const localProjects = ref(
	columns.reduce((acc, column) => {
		acc[column.id] = [];
		return acc;
	}, {}),
);

const fields = [
	'id',
	'title',
	'description',
	'status',
	'date_created',
	'date_updated',
	'user_created.first_name',
	'user_created.last_name',
	'user_updated.first_name',
	'user_updated.last_name',
	'organization.id',
	'organization.name',
	'tickets',
	'events',
	'service.name',
	'sort',
];

const getFilter = () => {
	const filter = {
		_and: [],
	};

	if (!isAdmin.value) {
		filter._and.push({
			organization: {
				_in: user.value?.organizations.map((org) => org.organizations_id.id),
			},
		});
	} else if (selectedOrg.value) {
		filter._and.push({
			organization: { _eq: selectedOrg.value },
		});
	}

	return filter._and.length ? filter : {};
};

const {
	data: projects,
	isLoading,
	isConnected,
	refresh,
} = useRealtimeSubscription('projects', fields, getFilter(), ['sort', '-date_updated']);

watch([() => projects.value, selectedOrg], ([newProjects]) => {
	if (!newProjects) return;

	const filtered = newProjects.filter(
		(project) => !selectedOrg.value || project.organization?.id === selectedOrg.value,
	);

	columns.forEach((column) => {
		localProjects.value[column.id] = filtered.filter((project) => project.status === column.id);
	});
});

const updateProjectStatus = async (columnId, event) => {
	if (!event.added) return;

	const projectId = event.added.element.id;
	updatingProjects.value.add(projectId);

	try {
		await updateItem('projects', projectId, {
			status: columnId,
			date_updated: new Date(),
		});

		const project = event.added.element;
		project.status = columnId;
	} catch (error) {
		console.error('Error updating project:', error);
		const originalStatus = event.added.element.status;
		localProjects.value[originalStatus].push(event.added.element);
		localProjects.value[columnId] = localProjects.value[columnId].filter((p) => p.id !== projectId);

		useToast().add({
			title: 'Error',
			description: 'Failed to update project status',
			color: 'red',
		});
	} finally {
		updatingProjects.value.delete(projectId);
	}
};

onMounted(() => {
	checkMobile();
	window.addEventListener('resize', checkMobile);
});

onUnmounted(() => {
	window.removeEventListener('resize', checkMobile);
});

function checkMobile() {
	isMobile.value = window.innerWidth < 768;
}
</script>

<template>
	<div class="w-full mx-auto max-w-[2000px]">
		<!-- Connection Status -->
		<div v-if="!isConnected && !isLoading" class="mb-4">
			<UAlert title="Connection Lost" color="yellow">
				<template #footer>
					<UButton size="sm" color="yellow" @click="refresh">Retry</UButton>
				</template>
			</UAlert>
		</div>

		<!-- Board Layout -->
		<div class="w-full flex px-4 gap-4 min-h-svh">
			<div v-for="column in columns" :key="column.id" class="flex-grow w-full basis-0 shadow h-full min-h-dvh">
				<!-- Column Header -->
				<div class="p-3 bg-gray-200 mb-3 shadow-lg">
					<div class="flex items-center justify-between">
						<h3 class="text-xs font-bold uppercase tracking-wide">{{ column.name }}</h3>
						<UBadge :color="column.color" class="ml-2 w-6 h-6 text-center">
							{{ localProjects[column.id]?.length || 0 }}
						</UBadge>
					</div>
				</div>

				<!-- Loading State -->
				<div
					v-if="isLoading && !localProjects[column.id]?.length"
					class="min-h-[50vh] p-2 bg-gray-100 dark:bg-gray-800"
				>
					<div class="space-y-3">
						<USkeleton v-for="n in 3" :key="n" class="h-24 w-full" />
					</div>
				</div>

				<!-- Draggable Container -->
				<VueDraggable
					v-else
					v-model="localProjects[column.id]"
					:group="{ name: 'projects' }"
					item-key="id"
					class="min-h-svh h-full py-2 px-2 bg-gray-100 dark:bg-gray-800 shadow-inner"
					:class="{ 'is-dragging': isDragging }"
					ghost-class="ghost"
					chosen-class="chosen"
					drag-class="drag"
					@change="(event) => updateProjectStatus(column.id, event)"
				>
					<template #item="{ element }">
						<div :id="element.id" class="project-wrapper">
							<div class="relative">
								<div
									v-if="updatingProjects.has(element.id)"
									class="absolute inset-0 bg-white/50 dark:bg-gray-900/50 rounded-lg flex items-center justify-center z-10"
								>
									<UIcon name="i-heroicons-arrow-path" class="animate-spin h-5 w-5" />
								</div>
								<ProjectsCard
									:project="element"
									:class="{ 'opacity-50': updatingProjects.has(element.id) }"
									class="my-2"
								/>
							</div>
						</div>
					</template>
				</VueDraggable>
			</div>
		</div>
	</div>
</template>

<style scoped>
.ghost {
	opacity: 0.5;
	background: #f0f0f0;
}

.chosen {
	transform: scale(1.05);
	box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
}

.drag {
	opacity: 0.9;
	transform: scale(1.05);
	box-shadow: 0 15px 25px rgba(0, 0, 0, 0.15);
}

.project-wrapper {
	transition: all 0.3s ease;
}
</style>
