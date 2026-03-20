<script setup>
const props = defineProps({
	projectId: { type: String, required: true },
});

const activityItems = useDirectusItems('directus_activity');
const commentItems = useDirectusItems('comments');
const ticketItems = useDirectusItems('tickets');
const taskItems = useDirectusItems('project_tasks');

const activities = ref([]);
const loading = ref(true);

const collectionLabels = {
	projects: 'project',
	tickets: 'ticket',
	project_tasks: 'task',
	invoices: 'invoice',
	comments: 'comment',
};

const collectionIcons = {
	projects: 'i-heroicons-folder',
	tickets: 'i-heroicons-square-3-stack-3d',
	project_tasks: 'i-heroicons-check-circle',
	invoices: 'i-heroicons-document-currency-dollar',
	comments: 'i-heroicons-chat-bubble-left',
};

const collectionColors = {
	projects: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20',
	tickets: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20',
	project_tasks: 'text-purple-500 bg-purple-50 dark:bg-purple-900/20',
	invoices: 'text-green-500 bg-green-50 dark:bg-green-900/20',
	comments: 'text-pink-500 bg-pink-50 dark:bg-pink-900/20',
};

const actionLabels = { create: 'Created', update: 'Updated', delete: 'Deleted' };

const loadActivity = async () => {
	loading.value = true;
	try {
		// First, get ticket and task IDs belonging to this project
		const [projectTickets, projectTasks] = await Promise.all([
			ticketItems.list({ fields: ['id'], filter: { project: { _eq: props.projectId } }, limit: 200 }),
			taskItems.list({ fields: ['id'], filter: { project: { _eq: props.projectId } }, limit: 200 }),
		]);
		const ticketIds = (projectTickets || []).map((t) => t.id);
		const taskIds = (projectTasks || []).map((t) => t.id);

		// Fetch activity scoped to this project's items
		const activityFields = ['id', 'action', 'timestamp', 'collection', 'item', 'user.id', 'user.first_name', 'user.last_name', 'user.avatar'];
		const [projectAct, ticketAct, taskAct, comments] = await Promise.all([
			activityItems.list({
				fields: activityFields,
				filter: { _and: [{ collection: { _eq: 'projects' } }, { item: { _eq: props.projectId } }] },
				sort: ['-timestamp'],
				limit: 20,
			}),
			ticketIds.length > 0 ? activityItems.list({
				fields: activityFields,
				filter: { _and: [{ collection: { _eq: 'tickets' } }, { item: { _in: ticketIds } }] },
				sort: ['-timestamp'],
				limit: 20,
			}) : Promise.resolve([]),
			taskIds.length > 0 ? activityItems.list({
				fields: activityFields,
				filter: { _and: [{ collection: { _eq: 'project_tasks' } }, { item: { _in: taskIds } }] },
				sort: ['-timestamp'],
				limit: 20,
			}) : Promise.resolve([]),
			commentItems.list({
				fields: ['id', 'comment', 'date_created', 'user.id', 'user.first_name', 'user.last_name', 'user.avatar', 'collection', 'item'],
				filter: { _and: [{ collection: { _eq: 'projects' } }, { item: { _eq: props.projectId } }] },
				sort: ['-date_created'],
				limit: 20,
			}),
		]);

		// Merge and sort
		const merged = [
			...(projectAct || []).map(a => ({ ...a, type: 'activity' })),
			...(ticketAct || []).map(a => ({ ...a, type: 'activity' })),
			...(taskAct || []).map(a => ({ ...a, type: 'activity' })),
			...(comments || []).map(c => ({
				id: `comment-${c.id}`,
				type: 'comment',
				action: 'comment',
				collection: 'comments',
				timestamp: c.date_created,
				user: c.user,
				content: c.comment,
			})),
		];

		merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
		activities.value = merged.slice(0, 50);
	} catch (err) {
		console.error('ProjectActivity: Error loading', err);
	} finally {
		loading.value = false;
	}
};

onMounted(loadActivity);

const formatTime = (ts) => {
	if (!ts) return '';
	const date = new Date(ts);
	const now = new Date();
	const diff = now - date;
	const mins = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);
	if (mins < 1) return 'Just now';
	if (mins < 60) return `${mins}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 7) return `${days}d ago`;
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getUserName = (u) => {
	if (!u) return 'System';
	return [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Unknown';
};

const _config = useRuntimeConfig();
const getUserAvatar = (u) => {
	if (!u?.avatar) return null;
	return `${_config.public.directusUrl}/assets/${u.avatar}?width=64&height=64&fit=cover`;
};
</script>

<template>
	<div>
		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<UIcon name="i-heroicons-clock" class="w-5 h-5 text-primary" />
				<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">Activity</h3>
			</div>
			<button @click="loadActivity" :disabled="loading" class="text-xs text-primary hover:underline disabled:opacity-50">
				Refresh
			</button>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="space-y-3">
			<div v-for="n in 5" :key="n" class="flex items-start gap-3">
				<div class="w-8 h-8 rounded-full bg-muted animate-pulse flex-shrink-0" />
				<div class="flex-1 space-y-1">
					<div class="h-3 w-40 bg-muted rounded animate-pulse" />
					<div class="h-2 w-24 bg-muted rounded animate-pulse" />
				</div>
			</div>
		</div>

		<!-- Empty -->
		<div v-else-if="activities.length === 0" class="text-center py-12">
			<UIcon name="i-heroicons-clock" class="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">No activity yet</p>
		</div>

		<!-- Activity list -->
		<div v-else class="relative">
			<!-- Vertical line -->
			<div class="absolute left-4 top-0 bottom-0 w-px bg-border" />

			<div v-for="item in activities" :key="item.id" class="relative flex items-start gap-4 pb-6">
				<!-- Avatar / icon -->
				<div class="relative z-10 flex-shrink-0">
					<UAvatar
						v-if="item.user"
						:src="getUserAvatar(item.user)"
						:alt="getUserName(item.user)"
						size="xs"
						class="ring-2 ring-background"
					/>
					<div v-else class="w-8 h-8 rounded-full bg-muted flex items-center justify-center ring-2 ring-background">
						<UIcon :name="collectionIcons[item.collection] || 'i-heroicons-information-circle'" class="w-4 h-4 text-muted-foreground" />
					</div>
				</div>

				<!-- Content -->
				<div class="flex-1 min-w-0 pt-0.5">
					<div class="flex items-center gap-2 flex-wrap">
						<span class="text-sm font-medium text-foreground">{{ getUserName(item.user) }}</span>
						<span v-if="item.type === 'activity'" class="text-xs text-muted-foreground">
							{{ actionLabels[item.action] || item.action }} a {{ collectionLabels[item.collection] || item.collection }}
						</span>
						<span v-else class="text-xs text-muted-foreground">commented</span>
					</div>

					<!-- Comment content -->
					<div v-if="item.type === 'comment' && item.content" class="mt-1 p-2 bg-muted/30 rounded-lg text-sm text-foreground/80" v-html="item.content" />

					<!-- Collection badge + time -->
					<div class="flex items-center gap-2 mt-1">
						<span
							class="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full"
							:class="collectionColors[item.collection] || 'text-muted-foreground bg-muted'"
						>
							<UIcon :name="collectionIcons[item.collection] || 'i-heroicons-document'" class="w-3 h-3" />
							{{ collectionLabels[item.collection] || item.collection }}
						</span>
						<span class="text-[10px] text-muted-foreground">{{ formatTime(item.timestamp) }}</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
