<template>
	<div class="ticket-activity">
		<h4 class="w-full uppercase block font-medium text-gray-700 dark:text-gray-200 tracking-wider mb-4">Activity</h4>

		<div v-if="loading" class="flex justify-center py-4">
			<UIcon name="i-heroicons-arrow-path" class="animate-spin h-5 w-5" />
		</div>

		<div v-else-if="!activityItems.length" class="text-center py-6 bg-gray-50 dark:bg-gray-800 rounded-lg">
			<p class="text-gray-500">No activity history available</p>
		</div>

		<div v-else>
			<!-- Activity Feed -->
			<div class="space-y-4">
				<div
					v-for="(item, index) in activityItems"
					:key="`${item.type}-${item.id}-${index}`"
					class="activity-item bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-3 relative"
				>
					<!-- Activity icon (left side) -->
					<div
						class="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-900/20"
					>
						<UIcon :name="getActionIcon(item)" class="text-primary-500 h-4 w-4" />
					</div>

					<!-- Content container (with left margin for icon) -->
					<div class="ml-12">
						<!-- Activity header with user info -->
						<div class="flex items-center gap-2 mb-2">
							<span class="font-medium text-sm">{{ getActionText(item) }}</span>
							<UBadge
								v-if="item.type === 'revision' && item.action === 'update' && item.updatedFields?.length"
								color="blue"
								variant="soft"
								class="text-[9px]"
							>
								{{ item.updatedFields.length }} change{{ item.updatedFields.length > 1 ? 's' : '' }}
							</UBadge>
						</div>

						<!-- User and timestamp info -->
						<div class="flex items-center text-xs text-gray-500 mb-3">
							<UAvatar :src="getUserAvatar(item.user)" :alt="getUserName(item.user)" size="2xs" class="mr-2" />
							<span>{{ getUserName(item.user) }}</span>
							<span class="mx-2">•</span>
							<span>{{ formatDate(item.timestamp) }}</span>
						</div>

						<!-- Comment content -->
						<div
							v-if="item.type === 'comment'"
							class="mt-2 text-sm bg-gray-50 dark:bg-gray-800/50 p-2 rounded comment-content"
						>
							<!-- Using v-html with trusted content from Directus -->
							<div v-html="item.content"></div>
						</div>

						<!-- Task activity content -->
						<div v-if="item.type === 'task'" class="mt-2">
							<div class="mt-2 text-sm bg-gray-50 dark:bg-gray-800/50 p-2 rounded flex items-start gap-2">
								<UCheckbox :model-value="item.task.status === 'completed'" disabled class="mt-0.5" />
								<div v-html="item.task.description"></div>
							</div>
						</div>

						<!-- Revision changes display -->
						<div
							v-if="
								item.type === 'revision' && item.action === 'update' && showChangeDetails && item.updatedFields?.length
							"
							class="mt-2"
						>
							<div class="border-l-2 border-gray-200 dark:border-gray-700 pl-3 py-1">
								<div class="text-xs text-gray-700 dark:text-gray-300 font-medium mb-2">Changed:</div>

								<div class="space-y-2">
									<div
										v-for="field in item.updatedFields"
										:key="field.name"
										class="bg-gray-50 dark:bg-gray-800/50 rounded p-2"
									>
										<div class="font-medium text-xs text-gray-700 dark:text-gray-300 mb-1">
											{{ formatFieldName(field.name) }}
										</div>

										<!-- Team changes (special handling) -->
										<div v-if="field.name === 'team'" class="flex flex-col text-xs">
											<div class="text-red-500 dark:text-red-400 line-through flex items-center">
												<UIcon name="i-heroicons-minus-circle" class="h-3 w-3 mr-1" />
												<span>{{ getTeamName(field.oldValue) }}</span>
											</div>
											<div class="text-green-500 dark:text-green-400 flex items-center">
												<UIcon name="i-heroicons-plus-circle" class="h-3 w-3 mr-1" />
												<span>{{ getTeamName(field.newValue) }}</span>
											</div>
										</div>

										<!-- Status changes (special handling) -->
										<div v-else-if="field.name === 'status'" class="flex flex-col text-xs">
											<div class="text-red-500 dark:text-red-400 line-through flex items-center">
												<UIcon name="i-heroicons-minus-circle" class="h-3 w-3 mr-1" />
												<span>{{ field.oldValue }}</span>
											</div>
											<div class="text-green-500 dark:text-green-400 flex items-center">
												<UIcon name="i-heroicons-plus-circle" class="h-3 w-3 mr-1" />
												<span>{{ field.newValue }}</span>
											</div>
										</div>

										<!-- Regular field changes -->
										<div v-else class="flex flex-col text-xs">
											<div class="text-red-500 dark:text-red-400 line-through flex items-center">
												<UIcon name="i-heroicons-minus-circle" class="h-3 w-3 mr-1" />
												<span>{{ formatFieldValue(field.oldValue) }}</span>
											</div>
											<div class="text-green-500 dark:text-green-400 flex items-center">
												<UIcon name="i-heroicons-plus-circle" class="h-3 w-3 mr-1" />
												<span>{{ formatFieldValue(field.newValue) }}</span>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>

						<!-- For create actions, we want to show a summary of initial values -->
						<div
							v-if="item.type === 'revision' && item.action === 'create'"
							class="mt-2 border-l-2 border-green-200 dark:border-green-700 pl-3 py-1"
						>
							<div class="text-xs text-gray-700 dark:text-gray-300 font-medium mb-2">Initial details:</div>
							<div class="space-y-2">
								<div v-if="item.initialDetails?.length > 0">
									<div
										v-for="field in item.initialDetails"
										:key="field.name"
										class="bg-gray-50 dark:bg-gray-800/50 rounded p-2 mb-1"
									>
										<div class="font-medium text-xs text-gray-700 dark:text-gray-300 mb-1">
											{{ formatFieldName(field.name) }}
										</div>
										<div class="text-green-500 dark:text-green-400 text-xs flex items-center">
											<UIcon name="i-heroicons-plus-circle" class="h-3 w-3 mr-1" />
											<span>{{ formatFieldValue(field.value) }}</span>
										</div>
									</div>
								</div>
								<div v-else class="text-xs text-gray-500 italic">No initial details available</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Load more button -->
			<div v-if="hasMore" class="w-full flex justify-center mt-4">
				<UButton size="sm" variant="ghost" @click="loadMore" :loading="loadingMore" :disabled="loadingMore">
					Load More Activity
				</UButton>
			</div>
		</div>
	</div>
</template>

<script setup>
import { formatDistanceToNow } from 'date-fns';

const props = defineProps({
	ticketId: {
		type: String,
		required: true,
	},
	limit: {
		type: Number,
		default: 10,
	},
	showChangeDetails: {
		type: Boolean,
		default: true,
	},
	debugMode: {
		type: Boolean,
		default: false, // Set to true to enable debug info
	},
});

// State
const activityItems = ref([]);
const loading = ref(true);
const loadingMore = ref(false);
const page = ref(1);
const hasMore = ref(false);
const teams = ref([]);
const { readItems } = useDirectusItems();
const { readRevisions } = useDirectusRevisions();
const config = useRuntimeConfig();

// Computed values
const baseDirectusUrl = computed(() => config.public.directusUrl || 'https://admin.huestudios.company');

// Fetch teams for name lookup
const fetchTeams = async () => {
	try {
		const fetchedTeams = await readItems('teams', {
			fields: ['id', 'name', 'organization.id'],
		});

		teams.value = fetchedTeams || [];
		if (props.debugMode) {
			console.log('Fetched teams:', teams.value.length);
		}
	} catch (error) {
		console.error('Error fetching teams:', error);
	}
};

// Team name lookup function
const getTeamName = (teamId) => {
	if (!teamId) return 'None';

	const team = teams.value.find((t) => t.id === teamId);
	return team ? team.name : `Team ${teamId}`;
};

// Enhanced version to detect actual changes in revisions
const processRevisionChanges = (dataObj, deltaObj) => {
	// Fields we want to track (expand this list as needed)
	const interestingFields = [
		'status',
		'title',
		'priority',
		'team',
		'project',
		'description',
		'due_date',
		'organization',
	];

	const changes = [];

	// For each key present in both objects, check if they're different
	for (const key of interestingFields) {
		// Only process if both objects have this field
		if (!(key in dataObj) || !(key in deltaObj)) continue;

		// Special handling for team field which is often an object in one version and ID in another
		if (key === 'team') {
			const oldId = typeof dataObj[key] === 'object' ? dataObj[key]?.id : dataObj[key];
			const newId = typeof deltaObj[key] === 'object' ? deltaObj[key]?.id : deltaObj[key];

			if (oldId !== newId) {
				changes.push({
					name: key,
					oldValue: oldId,
					newValue: newId,
				});
			}
			continue;
		}

		// Special handling for deep objects like project
		if (key === 'project' || key === 'organization') {
			const oldId = typeof dataObj[key] === 'object' ? dataObj[key]?.id : dataObj[key];
			const newId = typeof deltaObj[key] === 'object' ? deltaObj[key]?.id : deltaObj[key];

			if (oldId !== newId) {
				changes.push({
					name: key,
					oldValue: oldId,
					newValue: newId,
				});
			}
			continue;
		}

		// For most fields, simple comparison should work
		const oldValue = dataObj[key];
		const newValue = deltaObj[key];

		// Skip undefined values
		if (oldValue === undefined && newValue === undefined) continue;

		// Use deep comparison to check if objects are equal
		const isEqual = JSON.stringify(oldValue) === JSON.stringify(newValue);

		if (!isEqual) {
			changes.push({
				name: key,
				oldValue,
				newValue,
			});
		}
	}

	return changes;
};

// Process initial values for creation revisions
const extractInitialDetails = (data) => {
	if (!data) return [];

	// These are the fields we care about for initial details
	const relevantFields = ['title', 'description', 'status', 'priority', 'team', 'project', 'organization', 'due_date'];

	const details = [];

	for (const field of relevantFields) {
		if (data[field] !== undefined && data[field] !== null && data[field] !== '') {
			details.push({
				name: field,
				value: data[field],
			});
		}
	}

	return details;
};

// Fetch all activity (comments, revisions, and tasks)
const fetchActivity = async (reset = false) => {
	if (reset) {
		page.value = 1;
		loading.value = true;
	} else {
		loadingMore.value = true;
	}

	try {
		// Fetch teams for name lookup
		await fetchTeams();

		// Fetch comments directly for the ticket
		// Use a simpler filter to avoid permission issues
		const comments = await readItems('comments', {
			fields: [
				'id',
				'comment',
				'date_created',
				'user.id',
				'user.first_name',
				'user.last_name',
				'user.avatar',
				'collection',
				'item',
			],
			filter: {
				collection: { _eq: 'tickets' },
				item: { _eq: props.ticketId },
			},
			sort: ['-date_created'],
			limit: props.limit,
			page: page.value,
		});

		if (props.debugMode) {
			console.log('Fetched comments:', comments?.length || 0);
		}

		// Fetch revisions for the ticket
		const revisions = await readRevisions({
			fields: [
				'id',
				'collection',
				'item',
				'data',
				'delta',
				'activity.action',
				'activity.timestamp',
				'activity.user.id',
				'activity.user.first_name',
				'activity.user.last_name',
				'activity.user.avatar',
			],
			filter: {
				collection: { _eq: 'tickets' },
				item: { _eq: props.ticketId },
			},
			sort: ['-activity.timestamp'],
			limit: props.limit,
			page: page.value,
		});

		if (props.debugMode) {
			console.log('Fetched revisions:', revisions?.length || 0);
		}

		// Fetch tasks for this ticket
		const tasks = await readItems('tasks', {
			fields: [
				'id',
				'description',
				'status',
				'date_created',
				'date_updated',
				'user_created.id',
				'user_created.first_name',
				'user_created.last_name',
				'user_created.avatar',
				'user_updated.id',
				'user_updated.first_name',
				'user_updated.last_name',
				'user_updated.avatar',
			],
			filter: {
				ticket_id: { _eq: props.ticketId },
			},
			sort: ['-date_updated'],
		});

		if (props.debugMode) {
			console.log('Fetched tasks:', tasks?.length || 0);
		}

		// Process the comments data with normalized timestamps
		const commentItems = (comments || []).map((comment) => ({
			id: comment.id,
			type: 'comment',
			content: comment.comment, // HTML content from Directus
			timestamp: new Date(comment.date_created).toISOString(),
			user: comment.user,
		}));

		// Process revisions with normalized timestamps
		const revisionItems = [];

		for (const revision of revisions || []) {
			// Skip if there's no activity data
			if (!revision.activity || !revision.activity.action || !revision.activity.timestamp) {
				continue;
			}

			try {
				// Normalize timestamp for consistent sorting
				const timestamp = new Date(revision.activity.timestamp).toISOString();

				// Parse data and delta objects
				const dataObj = typeof revision.data === 'string' ? JSON.parse(revision.data) : revision.data || {};
				const deltaObj = typeof revision.delta === 'string' ? JSON.parse(revision.delta) : revision.delta || {};

				// Basic revision info
				const revItem = {
					id: `revision-${revision.id}`,
					type: 'revision',
					action: revision.activity.action,
					timestamp: timestamp,
					user: revision.activity.user,
					updatedFields: [],
				};

				// For create actions, extract initial values
				if (revision.activity.action === 'create') {
					revItem.initialDetails = extractInitialDetails(deltaObj);
					revisionItems.push(revItem);
					continue;
				}

				// For updates, find the changes
				if (revision.activity.action === 'update') {
					revItem.updatedFields = processRevisionChanges(dataObj, deltaObj);

					// Only include updates with actual changes
					if (revItem.updatedFields.length > 0 || props.debugMode) {
						revisionItems.push(revItem);
					}
				}

				// Include all other revision types (delete, etc.)
				if (revision.activity.action !== 'update' && revision.activity.action !== 'create') {
					revisionItems.push(revItem);
				}
			} catch (err) {
				console.error('Error processing revision:', err, revision);
				// Add a minimal version so we still see something
				revisionItems.push({
					id: `revision-${revision.id}`,
					type: 'revision',
					action: revision.activity.action,
					timestamp: revision.activity.timestamp,
					user: revision.activity.user,
					error: true,
					updatedFields: [],
				});
			}
		}

		// Process task activities
		const taskItems = [];

		if (tasks && tasks.length > 0) {
			tasks.forEach((task) => {
				// Add task creation activity
				taskItems.push({
					id: `task-create-${task.id}`,
					type: 'task',
					action: 'create',
					timestamp: task.date_created,
					user: task.user_created,
					task: {
						id: task.id,
						description: task.description,
						status: 'active', // New tasks are always active
					},
				});

				// Add task completion activity if completed
				if (task.status === 'completed' && task.date_updated && task.user_updated) {
					taskItems.push({
						id: `task-complete-${task.id}`,
						type: 'task',
						action: 'complete',
						timestamp: task.date_updated,
						user: task.user_updated,
						task: {
							id: task.id,
							description: task.description,
							status: 'completed',
						},
					});
				}
			});
		}

		// Combine and sort by timestamp - ensure proper date comparison
		const combinedItems = [...commentItems, ...revisionItems, ...taskItems].sort((a, b) => {
			// Convert timestamps to Date objects for proper comparison
			const dateA = new Date(a.timestamp);
			const dateB = new Date(b.timestamp);

			// Sort descending (newest first)
			return dateB - dateA;
		});

		if (props.debugMode) {
			console.log('Combined items by type:', {
				comments: commentItems.length,
				revisions: revisionItems.length,
				tasks: taskItems.length,
				total: combinedItems.length,
			});
		}

		// Update state - ensure proper sorting when combining existing and new data
		if (reset) {
			activityItems.value = combinedItems;
		} else {
			// When loading more, combine everything and resort
			const allItems = [...activityItems.value, ...combinedItems].sort((a, b) => {
				const dateA = new Date(a.timestamp);
				const dateB = new Date(b.timestamp);
				return dateB - dateA;
			});

			activityItems.value = allItems;
		}

		// Determine if there are more items to load
		hasMore.value = (comments?.length || 0) + (revisions?.length || 0) >= props.limit;
		page.value++;
	} catch (error) {
		console.error('Error fetching ticket activity:', error);
	} finally {
		loading.value = false;
		loadingMore.value = false;
	}
};

// Load more history
const loadMore = async () => {
	if (loadingMore.value) return;
	await fetchActivity(false);
};

// Format functions with normalized timestamps for consistent display
const formatDate = (timestamp) => {
	if (!timestamp) return 'Unknown date';
	try {
		// Ensure we're working with a proper date object
		const date = new Date(timestamp);
		// Check if date is valid
		if (isNaN(date.getTime())) {
			return 'Invalid date';
		}
		return formatDistanceToNow(date, { addSuffix: true });
	} catch (e) {
		console.error('Date formatting error:', e);
		return String(timestamp);
	}
};

const getUserName = (user) => {
	if (!user) return 'Unknown user';
	return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.id;
};

const getUserAvatar = (user) => {
	if (!user?.avatar) return null;
	return `${baseDirectusUrl.value}/assets/${user.avatar}?key=small`;
};

const getActionIcon = (item) => {
	if (item.type === 'comment') {
		return 'i-heroicons-chat-bubble-left';
	}

	if (item.type === 'task') {
		const icons = {
			create: 'i-heroicons-clipboard-document-list',
			complete: 'i-heroicons-check-circle',
			delete: 'i-heroicons-trash',
			default: 'i-heroicons-clipboard',
		};
		return icons[item.action] || icons.default;
	}

	// For revisions
	const icons = {
		create: 'i-heroicons-plus-circle',
		update: 'i-heroicons-pencil-square',
		delete: 'i-heroicons-trash',
		default: 'i-heroicons-document-text',
	};

	return icons[item.action] || icons.default;
};

const getActionText = (item) => {
	if (item.type === 'comment') {
		return 'Added comment';
	}

	if (item.type === 'task') {
		const texts = {
			create: 'Added task',
			complete: 'Completed task',
			delete: 'Removed task',
			default: 'Modified task',
		};
		return texts[item.action] || texts.default;
	}

	// For revisions
	const texts = {
		create: 'Created ticket',
		update: 'Updated ticket',
		delete: 'Deleted ticket',
		default: 'Modified ticket',
	};

	return texts[item.action] || texts.default;
};

// Format field values for display
const formatFieldValue = (value) => {
	if (value === null || value === undefined) return 'None';

	// Handle dates
	if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
		return new Date(value).toLocaleString();
	}

	// Handle objects like relationships
	if (typeof value === 'object' && value !== null) {
		// Check if it's a relationship with an ID
		if (value.id) {
			return `${value.name || value.title || value.label || value.id}`;
		}

		// For arrays with objects
		if (Array.isArray(value) && value.length > 0) {
			if (typeof value[0] === 'object' && value[0] !== null && value[0].id) {
				return value.map((item) => item.name || item.title || item.label || item.id).join(', ');
			}
			return value.join(', ');
		}

		// For other objects, return a condensed representation
		try {
			// Check if empty object
			if (Object.keys(value).length === 0) return 'Empty';
			return JSON.stringify(value);
		} catch (e) {
			return '[Complex Object]';
		}
	}

	// For arrays
	if (Array.isArray(value)) {
		if (value.length === 0) return 'None';
		return value.join(', ');
	}

	// For booleans
	if (typeof value === 'boolean') {
		return value ? 'Yes' : 'No';
	}

	// For everything else
	return String(value);
};

const formatFieldName = (field) => {
	// Convert snake_case to Title Case
	return field
		.split('_')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
};

// Fetch initial data
onMounted(() => {
	if (props.debugMode) {
		console.log('Ticket Activity component mounted, fetching data for ticket:', props.ticketId);
	}
	fetchActivity(true);
});

// Watch for ticket ID changes
watch(
	() => props.ticketId,
	(newId) => {
		if (newId) {
			if (props.debugMode) {
				console.log('Ticket ID changed, fetching new activity data for:', newId);
			}
			fetchActivity(true);
		}
	},
);

// Expose refresh method for parent components
defineExpose({
	refresh: () => fetchActivity(true),
});
</script>

<style scoped>
/* Custom styling for activity feed */
.activity-item {
	transition: all 0.2s ease;
}

.activity-item:hover {
	transform: translateY(-1px);
	box-shadow:
		0 4px 6px -1px rgba(0, 0, 0, 0.1),
		0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

/* Comment content styling */
.comment-content :deep(a) {
	color: var(--cyan, #0ea5e9);
	text-decoration: none;
}

.comment-content :deep(a:hover) {
	text-decoration: underline;
}

.comment-content :deep(p) {
	margin-bottom: 0.5em;
}

.comment-content :deep(ul),
.comment-content :deep(ol) {
	padding-left: 1.5em;
	margin-bottom: 0.5em;
}

.comment-content :deep(li) {
	margin-bottom: 0.25em;
}

/* Set max height for long comments with scrollbar */
.comment-content {
	max-height: 300px;
	overflow-y: auto;
}
</style>
