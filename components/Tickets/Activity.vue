<!-- Template section remains largely the same, but we'll update the revision changes display -->
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
						class="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10"
					>
						<UIcon :name="getActionIcon(item)" class="text-primary h-4 w-4" />
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
								item.type === 'revision' &&
								item.action === 'update' &&
								showChangeDetails &&
								item.updatedFields &&
								Array.isArray(item.updatedFields) &&
								hasChanges(item.updatedFields)
							"
							class="mt-2"
						>
							<div class="border-l-2 border-green-200 dark:border-green-700 pl-3 py-1">
								<div class="text-xs text-gray-700 dark:text-gray-300 font-medium mb-2">Changed to:</div>

								<div class="space-y-2">
									<div
										v-for="field in item.updatedFields"
										:key="field.name"
										class="bg-gray-50 dark:bg-gray-800/50 rounded p-2"
									>
										<div class="font-medium text-xs text-gray-700 dark:text-gray-300 mb-1">
											{{ formatFieldName(field.name) }}
										</div>

										<!-- Team changes -->
										<div v-if="field.name === 'team'" class="text-sm">
											<div class="text-green-500 dark:text-green-400 flex items-center">
												<UIcon name="i-heroicons-arrow-right" class="h-3 w-3 mr-1" />
												<span class="font-medium">{{ getTeamName(field.newValue) }}</span>
											</div>
										</div>

										<!-- Status changes -->
										<div v-else-if="field.name === 'status'" class="text-sm">
											<div class="text-green-500 dark:text-green-400 flex items-center">
												<UIcon name="i-heroicons-arrow-right" class="h-3 w-3 mr-1" />
												<span class="font-medium">{{ field.newValue || 'None' }}</span>
											</div>
										</div>

										<!-- Due date changes -->
										<div v-else-if="field.name === 'due_date'" class="text-sm">
											<div class="text-green-500 dark:text-green-400 flex items-center">
												<UIcon name="i-heroicons-arrow-right" class="h-3 w-3 mr-1" />
												<span class="font-medium">{{ formatDate(field.newValue, true) }}</span>
											</div>
										</div>

										<!-- Description changes -->
										<div v-else-if="field.name === 'description'" class="text-sm">
											<div class="text-green-500 dark:text-green-400 flex items-start">
												<UIcon name="i-heroicons-arrow-right" class="h-3 w-3 mr-1 mt-1 flex-shrink-0" />
												<div class="description-preview" v-html="sanitizeHtml(field.newValue)"></div>
											</div>
										</div>

										<!-- Regular field changes -->
										<div v-else class="text-sm">
											<div class="text-green-500 dark:text-green-400 flex items-center">
												<UIcon name="i-heroicons-arrow-right" class="h-3 w-3 mr-1" />
												<span class="font-medium">{{ formatFieldValue(field.newValue) }}</span>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>

						<!-- For create actions, show a summary of initial values -->
						<div
							v-if="item.type === 'revision' && item.action === 'create' && item.initialDetails?.length"
							class="mt-2 border-l-2 border-green-200 dark:border-green-700 pl-3 py-1"
						>
							<div class="text-xs text-gray-700 dark:text-gray-300 font-medium mb-2">Initial details:</div>
							<div class="space-y-2">
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
										<!-- Special handling for description -->
										<div v-if="field.name === 'description'" v-html="sanitizeHtml(field.value)"></div>
										<span v-else>{{ formatFieldValue(field.value) }}</span>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			// If using debug mode, add debugging info at the bottom
			<div
				v-if="props.debugMode"
				class="mt-6 p-4 border border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-900 rounded-lg"
			>
				<h5 class="text-red-600 dark:text-red-400 font-bold mb-2">Debug Mode Enabled</h5>
				<p class="text-xs mb-2">Debug information is being logged to the browser console.</p>
				<UButton size="xs" color="red" @click="toggleDebugInfo">
					{{ showDebugInfo ? 'Hide Debug Info' : 'Show Debug Info' }}
				</UButton>

				<pre v-if="showDebugInfo" class="mt-4 text-xs bg-black text-green-400 p-4 rounded overflow-auto max-h-96">{{
					debugInfo
				}}</pre>
			</div>
		</div>
	</div>
</template>

<script setup>
import { formatDistanceToNow } from 'date-fns';

// Add a props option to enable debug mode directly in the template
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

// Debug info display state
const showDebugInfo = ref(false);
const debugInfo = ref('No debug data collected yet');

// Toggle debug info display
const toggleDebugInfo = () => {
	showDebugInfo.value = !showDebugInfo.value;

	// If showing debug info, collect the current state
	if (showDebugInfo.value) {
		let debugData = {
			activityItems: activityItems.value,
			ticketId: props.ticketId,
			lastFetched: new Date().toISOString(),
		};

		debugInfo.value = JSON.stringify(debugData, null, 2);
	}
};

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

// Function to sanitize HTML content safely
const sanitizeHtml = (htmlContent) => {
	if (!htmlContent) return '';

	try {
		// Create a new DOMParser to safely parse the HTML
		const parser = new DOMParser();
		const doc = parser.parseFromString(htmlContent, 'text/html');

		// Remove any potentially dangerous elements
		const dangerousTags = ['script', 'iframe', 'object', 'embed'];
		dangerousTags.forEach((tag) => {
			const elements = doc.querySelectorAll(tag);
			for (const el of elements) {
				el.parentNode.removeChild(el);
			}
		});

		// Extract the safe HTML from the parsed document
		const safeHtml = doc.body.innerHTML;
		return truncateHtml(safeHtml);
	} catch (e) {
		console.error('Error sanitizing HTML:', e);
		// If there's an error, return a plain text version or empty string
		return truncateHtml(htmlContent) || '';
	}
};

// Function to truncate HTML content safely
const truncateHtml = (htmlContent, maxLength = 200) => {
	if (!htmlContent) return '';

	try {
		// Create a temporary div to work with the HTML
		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = htmlContent;
		const text = tempDiv.textContent || tempDiv.innerText || '';

		// If it's already short, just return the original HTML
		if (text.length <= maxLength) {
			return htmlContent;
		}

		// Otherwise create a truncated version with ellipsis
		const truncated = text.substring(0, maxLength) + '...';

		// Return a sanitized version of the truncated text
		return `<span class="truncated-content">${truncated}</span>`;
	} catch (e) {
		console.error('Error truncating HTML:', e);
		return htmlContent.substring(0, maxLength) + '...';
	}
};

// Enhanced debug mode - logs detailed information about revision processing
const debugLogRevision = (revision, title) => {
	if (!props.debugMode) return;

	try {
		console.group(`DEBUG: ${title || 'Revision Processing'}`);
		console.log('Revision ID:', revision.id);
		console.log('Action:', revision.activity?.action);
		console.log('Timestamp:', revision.activity?.timestamp);

		// Parse and prettify the data objects for better reading
		const fullData = typeof revision.data === 'string' ? JSON.parse(revision.data) : revision.data;
		const deltaData = typeof revision.delta === 'string' ? JSON.parse(revision.delta) : revision.delta;

		console.log('Full Data:', fullData);
		console.log('Delta Data:', deltaData);

		// Extract just the keys that are present in the delta object
		const deltaKeys = Object.keys(deltaData || {});
		console.log('Delta Keys (changed fields):', deltaKeys);

		console.groupEnd();
	} catch (error) {
		console.error('Error in debug logging:', error);
		console.groupEnd();
	}
};

// Completely rewritten to focus exclusively on delta changes
const processRevisionChanges = (dataObj, deltaObj) => {
	// Fields we want to track if they changed
	const interestingFields = [
		'status',
		'title',
		'priority',
		'team',
		'project',
		'description',
		'due_date',
		'organization',
		'assigned_to',
	];

	const changes = [];

	try {
		// Parse objects if they're strings
		const fullData = typeof dataObj === 'string' ? JSON.parse(dataObj) : dataObj || {};
		const deltaData = typeof deltaObj === 'string' ? JSON.parse(deltaObj) : deltaObj || {};

		if (props.debugMode) {
			console.group('DEBUG: Processing Revision Changes');
			console.log('Full Data Object:', fullData);
			console.log('Delta Data Object:', deltaData);
		}

		// Get only fields that exist in the delta (these are the ones that changed)
		const changedKeys = Object.keys(deltaData);

		// Log what keys actually changed
		if (props.debugMode) {
			console.log('All Changed Keys:', changedKeys);
		}

		// Keep only the fields we're interested in tracking
		const relevantChangedKeys = changedKeys.filter((key) => interestingFields.includes(key));

		if (props.debugMode) {
			console.log('Relevant Changed Keys:', relevantChangedKeys);
		}

		// Process each changed field we care about
		for (const key of relevantChangedKeys) {
			// Get the new value from the delta
			const newValue = deltaData[key];

			if (props.debugMode) {
				console.log(`Processing field "${key}":`, newValue);
			}

			// Create a change object for this field
			const change = { name: key };

			// Handle different field types appropriately
			switch (key) {
				case 'team':
					// Normalize team ID references
					change.newValue = typeof newValue === 'object' ? newValue?.id : newValue;
					break;

				case 'project':
				case 'organization':
					// Normalize relation ID references
					change.newValue = typeof newValue === 'object' ? newValue?.id : newValue;
					break;

				case 'assigned_to':
					// Extract user IDs from assigned_to array
					if (Array.isArray(newValue)) {
						change.newValue = newValue
							.map((item) => (typeof item === 'object' ? item.directus_users_id?.id : item))
							.filter(Boolean);
					} else {
						change.newValue = []; // Empty array for empty assignments
					}
					break;

				default:
					// For all other fields, use the value directly
					change.newValue = newValue;
			}

			// Add this change to the list
			changes.push(change);
		}

		if (props.debugMode) {
			console.log('Final Processed Changes:', changes);
			console.groupEnd();
		}
	} catch (error) {
		console.error('Error processing revision changes:', error);
		if (props.debugMode) {
			console.log('Error occurred during processing');
			console.groupEnd();
		}
		return [];
	}

	return changes;
};

// Helper to check if any fields have valid changes
const hasChanges = (fields) => {
	if (!fields || !Array.isArray(fields)) return false;

	// Consider only fields with meaningful values (not just empty/null values)
	const meaningfulFields = fields.filter((field) => {
		// Status is always meaningful
		if (field.name === 'status') return true;

		// For other fields, make sure newValue isn't null/undefined/empty
		if (field.newValue === null || field.newValue === undefined || field.newValue === '') return false;

		// For arrays (like assigned_to), make sure they're not empty
		if (Array.isArray(field.newValue) && field.newValue.length === 0) return false;

		return true;
	});

	return meaningfulFields.length > 0;
};

// Process initial values for creation revisions
const extractInitialDetails = (data) => {
	if (!data) return [];

	try {
		// Process object if it's a string
		const dataObj = typeof data === 'string' ? JSON.parse(data) : data || {};

		// These are the fields we care about for initial details
		const relevantFields = [
			'title',
			'description',
			'status',
			'priority',
			'team',
			'project',
			'organization',
			'due_date',
		];

		const details = [];

		for (const field of relevantFields) {
			if (dataObj[field] !== undefined && dataObj[field] !== null && dataObj[field] !== '') {
				details.push({
					name: field,
					value: dataObj[field],
				});
			}
		}

		return details;
	} catch (e) {
		console.error('Error extracting initial details:', e, data);
		return [];
	}
};

// Fetch all activity (comments, revisions, and tasks)
const fetchActivity = async (reset = false) => {
	if (reset) {
		page.value = 1;
		loading.value = true;
		// Clear existing data to avoid any DOM update conflicts
		activityItems.value = [];
	} else {
		loadingMore.value = true;
	}

	try {
		// Fetch teams for name lookup
		await fetchTeams();

		// Construct item batches to ensure proper error handling for each
		let commentsData = [];
		let revisionsData = [];
		let tasksData = [];

		try {
			// Fetch comments directly for the ticket
			commentsData =
				(await readItems('comments', {
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
				})) || [];

			if (props.debugMode) {
				console.log('Fetched comments:', commentsData.length);
			}
		} catch (error) {
			console.error('Error fetching comments:', error);
		}

		try {
			// Fetch revisions for the ticket
			revisionsData =
				(await readRevisions({
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
				})) || [];

			if (props.debugMode) {
				console.group('Fetched Revisions Data');
				console.log('Count:', revisionsData.length);
				console.log('Raw revisions data:', revisionsData);

				// Log the first revision's delta in detail to help debugging
				if (revisionsData.length > 0) {
					const firstRev = revisionsData[0];
					console.log('First Revision ID:', firstRev.id);
					console.log('First Revision Action:', firstRev.activity?.action);

					try {
						const deltaData = typeof firstRev.delta === 'string' ? JSON.parse(firstRev.delta) : firstRev.delta;
						console.log('First Revision Delta:', deltaData);
						console.log('Delta Keys:', Object.keys(deltaData || {}));
					} catch (e) {
						console.error('Error parsing first revision delta:', e);
					}
				}

				console.groupEnd();
			}
		} catch (error) {
			console.error('Error fetching revisions:', error);
		}

		try {
			// Fetch tasks for this ticket
			tasksData =
				(await readItems('tasks', {
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
				})) || [];

			if (props.debugMode) {
				console.log('Fetched tasks:', tasksData.length);
			}
		} catch (error) {
			console.error('Error fetching tasks:', error);
		}

		// Process the comments data with normalized timestamps
		const commentItems = (commentsData || []).map((comment) => ({
			id: comment.id,
			type: 'comment',
			content: sanitizeHtml(comment.comment), // Sanitize HTML content
			timestamp: new Date(comment.date_created).toISOString(),
			user: comment.user,
		}));

		// Process revisions with normalized timestamps
		const revisionItems = [];

		if (revisionsData && revisionsData.length) {
			for (const revision of revisionsData) {
				// Skip if there's no activity data
				if (!revision.activity || !revision.activity.action || !revision.activity.timestamp) {
					continue;
				}

				try {
					// Normalize timestamp for consistent sorting
					const timestamp = new Date(revision.activity.timestamp).toISOString();

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
						revItem.initialDetails = extractInitialDetails(revision.delta);
						revisionItems.push(revItem);
						continue;
					}

					// For updates, find the changes
					if (revision.activity.action === 'update') {
						if (props.debugMode) {
							debugLogRevision(revision, 'Processing Update Revision');
						}

						// Process only the delta fields that actually changed
						revItem.updatedFields = processRevisionChanges(revision.data, revision.delta);

						// Only include updates that have meaningful changes
						if (hasChanges(revItem.updatedFields)) {
							revisionItems.push(revItem);
						}
					}

					// Include all other revision types (delete, etc.)
					if (revision.activity.action !== 'update' && revision.activity.action !== 'create') {
						revisionItems.push(revItem);
					}
				} catch (err) {
					console.error('Error processing revision:', err, revision);
					// Continue processing other revisions
				}
			}
		}

		// Process task activities
		const taskItems = [];

		if (tasksData && tasksData.length > 0) {
			tasksData.forEach((task) => {
				// Add task creation activity
				taskItems.push({
					id: `task-create-${task.id}`,
					type: 'task',
					action: 'create',
					timestamp: task.date_created,
					user: task.user_created,
					task: {
						id: task.id,
						description: sanitizeHtml(task.description),
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
							description: sanitizeHtml(task.description),
							status: 'completed',
						},
					});
				}
			});
		}

		// Validate and prepare items array
		const validItems = [];

		// Validate and add comment items
		for (const item of commentItems) {
			if (item && item.id && item.type && item.timestamp) {
				validItems.push(item);
			}
		}

		// Validate and add revision items
		for (const item of revisionItems) {
			if (item && item.id && item.type && item.timestamp) {
				validItems.push(item);
			}
		}

		// Validate and add task items
		for (const item of taskItems) {
			if (item && item.id && item.type && item.timestamp) {
				validItems.push(item);
			}
		}

		// Sort by timestamp - ensure proper date comparison
		validItems.sort((a, b) => {
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
				total: validItems.length,
			});
		}

		// Update state - ensure proper merging when combining existing and new data
		if (reset) {
			activityItems.value = validItems;
		} else {
			// When loading more, add new items and sort
			const newItems = [...activityItems.value];

			// Add only items that don't already exist (based on unique ID)
			for (const item of validItems) {
				if (!newItems.some((existing) => existing.id === item.id)) {
					newItems.push(item);
				}
			}

			// Sort the combined array
			newItems.sort((a, b) => {
				const dateA = new Date(a.timestamp);
				const dateB = new Date(b.timestamp);
				return dateB - dateA;
			});

			activityItems.value = newItems;
		}

		// Determine if there are more items to load
		hasMore.value = (commentsData?.length || 0) + (revisionsData?.length || 0) >= props.limit;
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

// Format date with option for full date display
const formatDate = (timestamp, fullFormat = false) => {
	if (!timestamp) return 'Unknown date';

	try {
		// Ensure we're working with a proper date object
		const date = new Date(timestamp);

		// Check if date is valid
		if (isNaN(date.getTime())) {
			return 'Invalid date';
		}

		// Return full date format if requested
		if (fullFormat) {
			return date.toLocaleString(undefined, {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
			});
		}

		// Otherwise return relative time
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
	if (props.ticketId) {
		fetchActivity(true);
	}
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

<style>
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

/* Description preview styling */
.description-preview {
	max-height: 100px;
	overflow: hidden;
	word-break: break-word;
}

.truncated-content {
	white-space: pre-line;
}
</style>
