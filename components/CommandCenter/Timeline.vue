<script setup>
const { user } = useDirectusAuth();
const { selectedOrg, getOrganizationFilter } = useOrganization();
const { readRevisions } = useDirectusRevisions();

const activityItems = useDirectusItems('directus_activity');
const commentItems = useDirectusItems('comments');
const projectItems = useDirectusItems('projects');
const ticketItems = useDirectusItems('tickets');
const invoiceItems = useDirectusItems('invoices');

// ── State ──
const timeline = ref([]);
const loading = ref(true);
const loadingMore = ref(false);
const hasMore = ref(true);
const page = ref(1);
const pageSize = 30;
const lastSeenKey = 'timeline_last_seen';
const lastSeenTimestamp = ref(null);
const newItemCount = ref(0);
const scrollContainer = ref(null);

// ── Comment state ──
const commentInputs = ref({});
const expandedComments = ref(new Set());
const postingComment = ref(null);

// ── Collections we care about ──
const trackedCollections = [
	'projects', 'tickets', 'invoices', 'project_tasks',
	'emails', 'cd_contacts', 'cd_activities', 'contacts', 'clients',
];

const collectionLabels = {
	projects: 'Project',
	tickets: 'Ticket',
	invoices: 'Invoice',
	project_tasks: 'Task',
	emails: 'Email',
	cd_contacts: 'CardDesk Contact',
	cd_activities: 'CardDesk Activity',
	contacts: 'Contact',
	clients: 'Client',
};

const collectionIcons = {
	projects: 'i-heroicons-folder',
	tickets: 'i-heroicons-square-3-stack-3d',
	invoices: 'i-heroicons-document-currency-dollar',
	project_tasks: 'i-heroicons-check-circle',
	emails: 'i-heroicons-envelope',
	cd_contacts: 'i-heroicons-identification',
	cd_activities: 'i-heroicons-phone-arrow-up-right',
	contacts: 'i-heroicons-user-plus',
	clients: 'i-heroicons-building-office',
};

const collectionColors = {
	projects: 'text-blue-500',
	tickets: 'text-amber-500',
	invoices: 'text-green-500',
	project_tasks: 'text-purple-500',
	emails: 'text-pink-500',
	cd_contacts: 'text-cyan-500',
	cd_activities: 'text-teal-500',
	contacts: 'text-indigo-500',
	clients: 'text-orange-500',
};

const collectionTagColors = {
	projects: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
	tickets: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
	invoices: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
	project_tasks: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
	emails: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
	cd_contacts: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
	cd_activities: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
	contacts: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
	clients: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

const actionLabels = {
	create: 'created',
	update: 'updated',
	delete: 'deleted',
};

const actionIcons = {
	create: 'i-heroicons-plus-circle',
	update: 'i-heroicons-pencil-square',
	delete: 'i-heroicons-trash',
};

// ── Load last seen ──
onMounted(() => {
	if (import.meta.client) {
		const stored = localStorage.getItem(lastSeenKey);
		if (stored) lastSeenTimestamp.value = stored;
	}
	loadTimeline();
});

// ── Mark as seen on scroll ──
const markAsSeen = () => {
	if (timeline.value.length > 0) {
		const newest = timeline.value[0]?.timestamp;
		if (newest) {
			lastSeenTimestamp.value = newest;
			if (import.meta.client) {
				localStorage.setItem(lastSeenKey, newest);
			}
			newItemCount.value = 0;
		}
	}
};

// ── Pull to refresh ──
const refreshTimeline = async () => {
	page.value = 1;
	hasMore.value = true;
	await loadTimeline();
	markAsSeen();
};

// ── Load timeline data ──
const loadTimeline = async () => {
	loading.value = true;
	try {
		const items = await fetchActivityPage(1);
		timeline.value = items;
		updateNewItemCount();
	} catch (err) {
		console.error('Timeline: Error loading activity', err);
	} finally {
		loading.value = false;
	}
};

// ── Load more (infinite scroll) ──
const loadMore = async () => {
	if (loadingMore.value || !hasMore.value) return;
	loadingMore.value = true;
	try {
		page.value++;
		const items = await fetchActivityPage(page.value);
		if (items.length < pageSize) hasMore.value = false;
		timeline.value.push(...items);
	} catch (err) {
		console.error('Timeline: Error loading more', err);
	} finally {
		loadingMore.value = false;
	}
};

// ── Fetch a page of activity ──
const fetchActivityPage = async (pageNum) => {
	// Fetch directus_activity for tracked collections
	const filter = {
		_and: [
			{ collection: { _in: trackedCollections } },
			{ action: { _in: ['create', 'update'] } },
		],
	};

	const activities = await activityItems.list({
		fields: [
			'id', 'action', 'timestamp', 'collection', 'item',
			'user.id', 'user.first_name', 'user.last_name', 'user.avatar', 'user.email',
		],
		filter,
		sort: ['-timestamp'],
		limit: pageSize,
		offset: (pageNum - 1) * pageSize,
	});

	if (!activities || activities.length === 0) {
		hasMore.value = false;
		return [];
	}

	// Enrich with item titles
	const enriched = await enrichActivities(activities);
	return enriched;
};

// ── Enrich activities with item context ──
const enrichActivities = async (activities) => {
	// Group items by collection for batch lookup
	const itemsByCollection = {};
	for (const act of activities) {
		if (!itemsByCollection[act.collection]) itemsByCollection[act.collection] = new Set();
		itemsByCollection[act.collection].add(act.item);
	}

	// Batch fetch item details
	const itemCache = {};
	const fetchPromises = Object.entries(itemsByCollection).map(async ([collection, ids]) => {
		const idList = [...ids];
		try {
			let fields = ['id', 'title'];
			if (collection === 'invoices') fields = ['id', 'invoice_code', 'status'];
			if (collection === 'project_tasks') fields = ['id', 'title', 'completed', 'status'];
			if (collection === 'emails') fields = ['id', 'name', 'subject', 'status', 'total_recipients', 'sent_at'];
			if (collection === 'cd_contacts') fields = ['id', 'name', 'first_name', 'last_name', 'company', 'rating', 'is_client'];
			if (collection === 'cd_activities') fields = ['id', 'type', 'label', 'note', 'contact'];
			if (collection === 'contacts') fields = ['id', 'first_name', 'last_name', 'email', 'company', 'category'];
			if (collection === 'clients') fields = ['id', 'name', 'status', 'industry'];

			const items = await useDirectusItems(collection).list({
				fields,
				filter: { id: { _in: idList } },
				limit: -1,
			});

			for (const item of (items || [])) {
				itemCache[`${collection}:${item.id}`] = item;
			}
		} catch (err) {
			// Items may have been deleted
			console.warn(`Timeline: Could not fetch ${collection} items`, err);
		}
	});

	// Batch fetch comments for these activities
	const activityIds = activities.map((act) => String(act.id));
	let commentsCache = {};
	fetchPromises.push(
		(async () => {
			try {
				const comments = await commentItems.list({
					fields: ['id', 'comment', 'item', 'date_created', 'user_created.id', 'user_created.first_name', 'user_created.last_name', 'user_created.avatar', 'user_created.email'],
					filter: {
						collection: { _eq: 'directus_activity' },
						item: { _in: activityIds },
					},
					sort: ['date_created'],
					limit: -1,
				});
				for (const c of (comments || [])) {
					if (!commentsCache[c.item]) commentsCache[c.item] = [];
					commentsCache[c.item].push({
						id: c.id,
						text: (c.comment || '').replace(/<[^>]*>/g, ''),
						user: c.user_created,
						timestamp: c.date_created,
					});
				}
			} catch (err) {
				console.warn('Timeline: Could not fetch comments', err);
			}
		})(),
	);

	await Promise.all(fetchPromises);

	// Build enriched timeline entries
	return activities.map((act) => {
		const itemData = itemCache[`${act.collection}:${act.item}`];
		let itemTitle = itemData?.title || itemData?.invoice_code || itemData?.name || itemData?.subject || `#${act.item}`;
		// Build display name for contacts
		if ((act.collection === 'contacts' || act.collection === 'cd_contacts') && itemData) {
			const fullName = [itemData.first_name, itemData.last_name].filter(Boolean).join(' ');
			if (fullName) itemTitle = fullName;
		}
		// CardDesk activity label
		if (act.collection === 'cd_activities' && itemData?.label) {
			itemTitle = itemData.label;
		}

		return {
			id: `activity-${act.id}`,
			activityId: String(act.id),
			type: 'activity',
			action: act.action,
			collection: act.collection,
			itemId: act.item,
			itemTitle,
			itemData,
			timestamp: act.timestamp,
			user: act.user,
			comments: commentsCache[String(act.id)] || [],
		};
	});
};

// ── New item count since last seen ──
const updateNewItemCount = () => {
	if (!lastSeenTimestamp.value || timeline.value.length === 0) {
		newItemCount.value = 0;
		return;
	}
	newItemCount.value = timeline.value.filter(
		(item) => new Date(item.timestamp) > new Date(lastSeenTimestamp.value),
	).length;
};

// ── Scroll to top (new items indicator) ──
const scrollToTop = () => {
	if (scrollContainer.value) {
		scrollContainer.value.scrollTo({ top: 0, behavior: 'smooth' });
	}
	markAsSeen();
};

// ── Infinite scroll observer ──
const sentinel = ref(null);
onMounted(() => {
	if (!import.meta.client) return;
	const observer = new IntersectionObserver(
		(entries) => {
			if (entries[0].isIntersecting && !loadingMore.value && hasMore.value) {
				loadMore();
			}
		},
		{ rootMargin: '200px' },
	);
	watch(sentinel, (el) => {
		if (el) observer.observe(el);
	}, { immediate: true });
	onUnmounted(() => observer.disconnect());
});

// ── Comments on timeline cards ──
const toggleComments = (itemId) => {
	const next = new Set(expandedComments.value);
	if (next.has(itemId)) {
		next.delete(itemId);
	} else {
		next.add(itemId);
	}
	expandedComments.value = next;
};

const postComment = async (item) => {
	const text = commentInputs.value[item.id]?.trim();
	if (!text) return;

	postingComment.value = item.id;
	try {
		await commentItems.create({
			comment: `<p>${text}</p>`,
			collection: 'directus_activity',
			item: item.activityId,
		});
		commentInputs.value[item.id] = '';
		// Add optimistic comment to the card
		item.comments.push({
			id: Date.now(),
			text,
			user: user.value,
			timestamp: new Date().toISOString(),
		});
	} catch (err) {
		console.error('Timeline: Error posting comment', err);
	} finally {
		postingComment.value = null;
	}
};

// ── Formatting helpers ──
const formatTimestamp = (ts) => {
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
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
};

const formatFullDate = (ts) => {
	if (!ts) return '';
	return new Date(ts).toLocaleString('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	});
};

const getUserName = (u) => {
	if (!u) return 'System';
	return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Unknown';
};

const _config = useRuntimeConfig();
const getUserAvatar = (u) => {
	if (!u?.avatar) return null;
	return `${_config.public.directusUrl}/assets/${u.avatar}?width=64&height=64&fit=cover`;
};

const getItemRoute = (item) => {
	if (item.collection === 'projects') return `/projects/${item.itemId}`;
	if (item.collection === 'tickets') return `/tickets/${item.itemId}`;
	if (item.collection === 'invoices') return `/invoices/${item.itemId}`;
	if (item.collection === 'contacts') return `/contacts/${item.itemId}`;
	if (item.collection === 'clients') return `/clients/${item.itemId}`;
	return null;
};

const isNewItem = (item) => {
	if (!lastSeenTimestamp.value) return false;
	return new Date(item.timestamp) > new Date(lastSeenTimestamp.value);
};

// ── Watch org changes ──
watch(selectedOrg, () => {
	refreshTimeline();
});
</script>

<template>
	<div class="relative h-full">
		<!-- New items indicator -->
		<Transition name="slide-down">
			<button
				v-if="newItemCount > 0"
				@click="scrollToTop"
				class="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-primary text-primary-foreground rounded-full shadow-lg text-xs font-medium flex items-center gap-1.5 ios-press"
			>
				<UIcon name="i-heroicons-arrow-up" class="w-3.5 h-3.5" />
				{{ newItemCount }} new update{{ newItemCount > 1 ? 's' : '' }}
			</button>
		</Transition>

		<!-- Pull to refresh button -->
		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<UIcon name="i-heroicons-clock" class="w-5 h-5 text-primary" />
				<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">Timeline</h3>
			</div>
			<button
				@click="refreshTimeline"
				:disabled="loading"
				class="text-xs text-primary hover:underline disabled:opacity-50 flex items-center gap-1"
			>
				<UIcon name="i-heroicons-arrow-path" class="w-3.5 h-3.5" :class="{ 'animate-spin': loading }" />
				Refresh
			</button>
		</div>

		<!-- Loading state -->
		<div v-if="loading && timeline.length === 0" class="space-y-4">
			<div v-for="n in 5" :key="n" class="ios-card p-4">
				<div class="flex items-center gap-3 mb-3">
					<div class="w-9 h-9 rounded-full bg-muted animate-pulse" />
					<div class="flex-1 space-y-1.5">
						<div class="h-3 w-32 bg-muted rounded animate-pulse" />
						<div class="h-2 w-20 bg-muted rounded animate-pulse" />
					</div>
				</div>
				<div class="h-4 w-48 bg-muted rounded animate-pulse" />
			</div>
		</div>

		<!-- Empty state -->
		<div v-else-if="!loading && timeline.length === 0" class="ios-card p-8 text-center">
			<UIcon name="i-heroicons-clock" class="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
			<p class="text-sm font-medium text-foreground">No activity yet</p>
			<p class="text-xs text-muted-foreground mt-1">Activity from projects, tickets, tasks, and invoices will appear here.</p>
		</div>

		<!-- Timeline feed -->
		<div v-else ref="scrollContainer" class="space-y-3">
			<div
				v-for="item in timeline"
				:key="item.id"
				class="ios-card overflow-hidden transition-all duration-300"
				:class="{ 'ring-2 ring-primary/20': isNewItem(item) }"
			>
				<!-- Card header: user + time | collection tag + new badge -->
				<div class="p-4 pb-2">
					<div class="flex items-start justify-between gap-3">
						<div class="flex items-center gap-3 min-w-0">
							<UAvatar
								:src="getUserAvatar(item.user)"
								:alt="getUserName(item.user)"
								size="sm"
								class="flex-shrink-0"
							/>
							<div class="min-w-0">
								<p class="text-sm font-medium text-foreground leading-tight truncate">{{ getUserName(item.user) }}</p>
								<p class="text-[11px] text-muted-foreground mt-0.5" :title="formatFullDate(item.timestamp)">
									{{ formatTimestamp(item.timestamp) }}
								</p>
							</div>
						</div>
						<div class="flex items-center gap-2 flex-shrink-0">
							<!-- Collection tag (upper-right) -->
							<span class="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full"
								:class="collectionTagColors[item.collection] || 'bg-muted text-muted-foreground'"
							>
								<UIcon :name="collectionIcons[item.collection] || 'i-heroicons-document'" class="w-3 h-3" />
								{{ collectionLabels[item.collection] || item.collection }}
							</span>
							<!-- New indicator -->
							<span v-if="isNewItem(item)" class="text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">
								New
							</span>
						</div>
					</div>
				</div>

				<!-- Card body: two-column layout -->
				<div class="px-4 pb-3 grid grid-cols-[1fr_auto] gap-4">
					<!-- Left column: action + title -->
					<div class="min-w-0">
						<div class="flex items-center gap-2 mb-1.5">
							<UIcon
								:name="actionIcons[item.action] || 'i-heroicons-information-circle'"
								class="w-4 h-4 flex-shrink-0"
								:class="collectionColors[item.collection] || 'text-muted-foreground'"
							/>
							<span class="text-xs text-muted-foreground">
								{{ actionLabels[item.action] || item.action }}
								a {{ collectionLabels[item.collection] || item.collection }}
							</span>
						</div>

						<!-- Item title (clickable) -->
						<NuxtLink
							v-if="getItemRoute(item)"
							:to="getItemRoute(item)"
							class="text-[15px] font-semibold text-foreground hover:text-primary transition-colors leading-snug"
						>
							{{ item.itemTitle }}
						</NuxtLink>
						<p v-else class="text-[15px] font-semibold text-foreground leading-snug">
							{{ item.itemTitle }}
						</p>

						<!-- CardDesk activity note (left column, text content) -->
						<p v-if="item.collection === 'cd_activities' && item.itemData?.note" class="text-xs text-muted-foreground mt-1 line-clamp-2">{{ item.itemData.note }}</p>
					</div>

					<!-- Right column: detail badges -->
					<div class="flex flex-col items-end gap-1.5 pt-1">
						<!-- Task completion badge -->
						<span v-if="item.collection === 'project_tasks' && item.itemData?.completed" class="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
							<UIcon name="i-heroicons-check" class="w-3 h-3" />
							Completed
						</span>

						<!-- Email details -->
						<template v-if="item.collection === 'emails' && item.itemData">
							<span v-if="item.itemData.status" class="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full"
								:class="{
									'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': item.itemData.status === 'sent',
									'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': item.itemData.status === 'sending',
									'bg-muted text-muted-foreground': item.itemData.status === 'draft',
								}"
							>
								{{ item.itemData.status }}
							</span>
							<span v-if="item.itemData.total_recipients" class="text-[10px] text-muted-foreground">
								{{ item.itemData.total_recipients }} recipients
							</span>
						</template>

						<!-- CardDesk contact details -->
						<template v-if="item.collection === 'cd_contacts' && item.itemData">
							<span v-if="item.itemData.company" class="text-[10px] text-muted-foreground">{{ item.itemData.company }}</span>
							<span v-if="item.itemData.rating" class="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full"
								:class="{
									'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400': item.itemData.rating === 'hot',
									'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400': item.itemData.rating === 'warm',
									'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': item.itemData.rating === 'nurture',
									'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400': item.itemData.rating === 'cold',
								}"
							>
								{{ item.itemData.rating }}
							</span>
							<span v-if="item.itemData.is_client" class="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
								Client
							</span>
						</template>

						<!-- CardDesk activity type -->
						<span v-if="item.collection === 'cd_activities' && item.itemData?.type" class="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
							{{ item.itemData.type }}
						</span>

						<!-- Client details -->
						<template v-if="item.collection === 'clients' && item.itemData">
							<span v-if="item.itemData.industry" class="text-[10px] text-muted-foreground">{{ item.itemData.industry }}</span>
							<span v-if="item.itemData.status" class="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full"
								:class="{
									'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400': item.itemData.status === 'active',
									'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400': item.itemData.status === 'prospect',
									'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400': item.itemData.status === 'inactive',
								}"
							>
								{{ item.itemData.status }}
							</span>
						</template>

						<!-- Contact details -->
						<template v-if="item.collection === 'contacts' && item.itemData">
							<span v-if="item.itemData.company" class="text-[10px] text-muted-foreground">{{ item.itemData.company }}</span>
							<span v-if="item.itemData.category" class="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
								{{ item.itemData.category }}
							</span>
						</template>
					</div>
				</div>

				<!-- View link -->
				<div v-if="getItemRoute(item)" class="px-4 pb-3 flex justify-end">
					<NuxtLink
						:to="getItemRoute(item)"
						class="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 hover:text-primary transition-colors"
					>
						View
						<UIcon name="i-heroicons-chevron-right" class="w-3 h-3" />
					</NuxtLink>
				</div>

				<!-- Combined action bar: reactions + comment -->
				<div class="border-t border-border/50 px-4 py-2 flex items-center gap-2">
					<!-- Reactions (persisted to Directus, scoped to the activity) -->
					<ReactionsBar :item-id="item.activityId" collection="directus_activity" />

					<!-- Comment + View (right side) -->
					<div class="flex items-center gap-4 ml-auto">
						<button
							@click="toggleComments(item.id)"
							class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
						>
							<UIcon name="i-heroicons-chat-bubble-left" class="w-4 h-4" />
							<span v-if="item.comments.length > 0">{{ item.comments.length }}</span>
							<span v-else>Comment</span>
						</button>
					</div>
				</div>

				<!-- Expanded comments section -->
				<Transition name="slide-down">
					<div v-if="expandedComments.has(item.id)" class="border-t border-border/50 bg-muted/20 p-4 space-y-3">
						<!-- Existing comments -->
						<div
							v-for="comment in item.comments"
							:key="comment.id"
							class="flex items-start gap-2"
						>
							<UAvatar
								:src="getUserAvatar(comment.user)"
								:alt="getUserName(comment.user)"
								size="2xs"
								class="flex-shrink-0 mt-0.5"
							/>
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2">
									<span class="text-xs font-medium text-foreground">{{ getUserName(comment.user) }}</span>
									<span class="text-[10px] text-muted-foreground">{{ formatTimestamp(comment.timestamp) }}</span>
								</div>
								<p class="text-sm text-foreground/80 mt-0.5">{{ comment.text }}</p>
							</div>
						</div>

						<!-- Comment input -->
						<div class="flex items-center gap-2">
							<UAvatar
								:src="getUserAvatar(user)"
								:alt="getUserName(user)"
								size="2xs"
								class="flex-shrink-0"
							/>
							<form @submit.prevent="postComment(item)" class="flex-1 flex items-center gap-2">
								<input
									v-model="commentInputs[item.id]"
									type="text"
									placeholder="Write a comment..."
									class="flex-1 bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
								/>
								<button
									type="submit"
									:disabled="!commentInputs[item.id]?.trim() || postingComment === item.id"
									class="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50 ios-press"
								>
									<UIcon v-if="postingComment === item.id" name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin" />
									<span v-else>Post</span>
								</button>
							</form>
						</div>
					</div>
				</Transition>
			</div>

			<!-- Load more sentinel -->
			<div ref="sentinel" class="py-4 flex justify-center">
				<div v-if="loadingMore" class="flex items-center gap-2 text-xs text-muted-foreground">
					<UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
					Loading more...
				</div>
				<p v-else-if="!hasMore" class="text-xs text-muted-foreground">You've reached the end</p>
			</div>
		</div>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.slide-down-enter-active,
.slide-down-leave-active {
	transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-down-enter-from {
	opacity: 0;
	transform: translateY(-8px);
}
.slide-down-leave-to {
	opacity: 0;
	transform: translateY(-8px);
}
</style>
