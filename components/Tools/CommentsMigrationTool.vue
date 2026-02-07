<template>
	<div class="migration-tool p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
		<h2 class="text-2xl font-bold mb-6">Comments Migration Tool</h2>

		<div class="mb-6">
			<p class="text-gray-600 dark:text-gray-300 mb-2">
				This tool will migrate comments from junction tables to the new polymorphic structure.
			</p>
			<UAlert v-if="!confirmed" title="Warning" color="yellow" class="mb-4">
				Please back up your database before proceeding. This operation modifies data.
			</UAlert>
		</div>

		<div v-if="!migrationStarted" class="mb-6">
			<UCheckbox v-model="confirmed" label="I have backed up my database" class="mb-4" />
			<UButton color="primary" :disabled="!confirmed || isLoading" :loading="isLoading" @click="startMigration">
				Start Migration
			</UButton>
		</div>

		<div v-if="migrationStarted">
			<div class="mb-4">
				<UProgress :value="progress" color="primary" />
				<p class="text-sm mt-2">{{ progressMessage }}</p>
			</div>

			<div
				class="space-y-2 max-h-60 overflow-y-auto border dark:border-gray-700 rounded p-4 mb-4 bg-gray-50 dark:bg-gray-900"
			>
				<p v-for="(log, index) in logs" :key="index" class="text-xs font-mono" :class="getLogClass(log)">
					{{ log }}
				</p>
			</div>

			<UButton v-if="migrationComplete" color="green" @click="reset">Migration Complete</UButton>
			<UButton v-if="migrationFailed" color="red" @click="reset">Migration Failed</UButton>
		</div>
	</div>
</template>

<script setup>
import { ref, computed } from 'vue';

const ticketsCommentsItems = useDirectusItems('tickets_comments');
const projectsCommentsItems = useDirectusItems('projects_comments');
const projectEventsCommentsItems = useDirectusItems('project_events_comments');
const commentItems = useDirectusItems('comments');

const junctionItemsMap = {
	'tickets_comments': ticketsCommentsItems,
	'projects_comments': projectsCommentsItems,
	'project_events_comments': projectEventsCommentsItems,
};

const isLoading = ref(false);
const confirmed = ref(false);
const migrationStarted = ref(false);
const migrationComplete = ref(false);
const migrationFailed = ref(false);
const progress = ref(0);
const logs = ref([]);
const progressMessage = ref('Preparing migration...');

// Define the collections to migrate
const junctionTables = [
	{ table: 'tickets_comments', collection: 'tickets', field: 'tickets_id' },
	{ table: 'projects_comments', collection: 'projects', field: 'projects_id' },
	{ table: 'project_events_comments', collection: 'project_events', field: 'project_events_id' },
	// Add other junction tables as needed
];

const getLogClass = (log) => {
	if (log.includes('Error') || log.includes('Failed')) {
		return 'text-red-500';
	} else if (log.includes('Success') || log.includes('Updated') || log.includes('Completed')) {
		return 'text-green-500';
	} else {
		return 'text-gray-500';
	}
};

const addLog = (message) => {
	const timestamp = new Date().toLocaleTimeString();
	logs.value.push(`[${timestamp}] ${message}`);
	// Auto-scroll to bottom of log container
	nextTick(() => {
		const logContainer = document.querySelector('.overflow-y-auto');
		if (logContainer) {
			logContainer.scrollTop = logContainer.scrollHeight;
		}
	});
};

const updateProgress = (percent, message) => {
	progress.value = percent;
	progressMessage.value = message;
};

const reset = () => {
	migrationStarted.value = false;
	migrationComplete.value = false;
	migrationFailed.value = false;
	progress.value = 0;
	logs.value = [];
	progressMessage.value = 'Preparing migration...';
	confirmed.value = false;
};

const startMigration = async () => {
	if (!confirmed.value) return;

	isLoading.value = true;
	migrationStarted.value = true;

	try {
		addLog('Starting migration process...');
		updateProgress(5, 'Initializing...');

		// Calculate total operations for progress tracking
		let totalOperations = 0;
		let completedOperations = 0;

		// First, count how many operations we'll need to do
		addLog('Counting records to migrate...');

		for (const { table } of junctionTables) {
			try {
				const count = await junctionItemsMap[table].list({ limit: -1, aggregate: { count: 'id' } });
				const recordCount = count?.[0]?.count?.id || 0;
				totalOperations += recordCount;
				addLog(`Found ${recordCount} records in ${table}`);
			} catch (error) {
				addLog(`Error counting records in ${table}: ${error.message}`);
			}
		}

		updateProgress(10, `Found ${totalOperations} total records to migrate`);

		if (totalOperations === 0) {
			addLog('No records to migrate. Process complete.');
			migrationComplete.value = true;
			updateProgress(100, 'Migration complete');
			isLoading.value = false;
			return;
		}

		// Process each junction table
		for (const { table, collection, field } of junctionTables) {
			addLog(`Processing ${table}...`);
			updateProgress(10 + (completedOperations / totalOperations) * 80, `Processing ${table}...`);

			try {
				// Fetch records from the junction table
				const junctionRecords = await junctionItemsMap[table].list({
					fields: ['id', field, 'comments_id'],
				});

				addLog(`Found ${junctionRecords.length} records in ${table}`);

				// Process each record
				for (const record of junctionRecords) {
					if (!record[field] || !record.comments_id) {
						addLog(`Skipping invalid record: ${JSON.stringify(record)}`);
						completedOperations++;
						continue;
					}

					try {
						// Update the comment with collection and item fields
						await commentItems.update(record.comments_id, {
							collection: collection,
							item: record[field],
						});

						addLog(`Updated comment ${record.comments_id} to point to ${collection}/${record[field]}`);
					} catch (error) {
						addLog(`Error updating comment ${record.comments_id}: ${error.message}`);
					}

					completedOperations++;
					updateProgress(
						10 + (completedOperations / totalOperations) * 80,
						`Processed ${completedOperations} of ${totalOperations}`,
					);
				}
			} catch (error) {
				addLog(`Error processing ${table}: ${error.message}`);
			}
		}

		addLog('Migration completed successfully!');
		updateProgress(100, 'Migration complete');
		migrationComplete.value = true;
	} catch (error) {
		addLog(`Migration failed: ${error.message}`);
		migrationFailed.value = true;
		updateProgress(100, 'Migration failed');
	} finally {
		isLoading.value = false;
	}
};

// Handle automatic cleanup
onBeforeUnmount(() => {
	// Clean up if needed
});
</script>

<style scoped>
.migration-tool {
	max-width: 800px;
	margin: 0 auto;
}
</style>
