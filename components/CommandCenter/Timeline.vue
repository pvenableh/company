<script setup>
const { selectedOrg, getOrganizationFilter } = useOrganization();
const { readRevisions } = useDirectusRevisions();

const activityItems = useDirectusItems('directus_activity');
const projectItems = useDirectusItems('projects');
const ticketItems = useDirectusItems('tickets');
const invoiceItems = useDirectusItems('invoices');

// ── Timeline icon theme ──
const { collectionIcons: themedCollectionIcons, actionIcons: themedActionIcons } = useTimelineTheme();

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
const expandedComments = ref(new Set());
const commentCounts = ref({});

// ── Collections we care about ──
const trackedCollections = [
	'projects', 'tickets', 'invoices', 'project_tasks', 'tasks',
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
	tasks: 'Quick Task',
};

// Collection icons now driven by useTimelineTheme() — see themedCollectionIcons above
const collectionIcons = themedCollectionIcons;

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
	tasks: 'text-violet-500',
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
	tasks: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
};

const actionLabels = {
	create: 'created',
	update: 'updated',
	delete: 'deleted',
};

// ── Fun, collection-aware action phrases (article included where needed) ──
const actionPhrases = {
	projects:      { create: 'Kicked off a',     update: 'Made progress on a',  delete: 'Removed a' },
	tickets:       { create: 'Opened a',          update: 'Moved forward on a',  delete: 'Closed out a' },
	project_tasks: { create: 'Queued up a',       update: 'Worked on a',         delete: 'Cleared a' },
	tasks:         { create: 'Added a',           update: 'Tackled a',           delete: 'Cleared a' },
	invoices:      { create: 'Drafted an',        update: 'Updated an',          delete: 'Voided an' },
	emails:        { create: 'Composed an',       update: 'Edited an',           delete: 'Discarded an' },
	contacts:      { create: 'Added a',           update: 'Updated a',           delete: 'Removed a' },
	cd_contacts:   { create: 'Added a',           update: 'Updated a',           delete: 'Removed a' },
	cd_activities: { create: 'Logged an',         update: 'Updated an',          delete: 'Removed an' },
	clients:       { create: 'Welcomed a',        update: 'Updated a',           delete: 'Removed a' },
};

const getActionPhrase = (item) => {
	const phrase = actionPhrases[item.collection]?.[item.action];
	if (phrase) return phrase;
	const label = collectionLabels[item.collection] || item.collection;
	const verb = (actionLabels[item.action] || item.action).replace(/^\w/, (c) => c.toUpperCase());
	const article = /^[aeiou]/i.test(label) ? 'an' : 'a';
	return `${verb} ${article}`;
};

// ── Milestone flavor text – short motivational one-liners ──
const flavorTexts = {
	taskCompleted: [
		'Another one done — nice work!',
		'Checked off and crushing it!',
		'One less thing on the list!',
		'Progress feels good, right?',
		'That\'s momentum right there!',
		'Steady progress pays off!',
		'Knock \'em out one by one!',
		'Moving right along!',
	],
	projectCreated: [
		'New adventures ahead!',
		'Fresh canvas, let\'s go!',
		'Big things start here.',
		'And so it begins!',
		'Off to a great start!',
	],
	clientCreated: [
		'Growing the network!',
		'Another client on board!',
		'Welcome to the crew!',
		'The roster keeps growing!',
		'Great partnerships start here.',
	],
	invoiceCreated: [
		'Invoice on the way!',
		'Billing in motion.',
		'Another one out the door!',
		'Keeping the books tidy!',
		'Time to get paid!',
	],
	emailSent: [
		'Message delivered!',
		'Sent and sealed!',
		'Off it goes!',
		'Another one in the outbox!',
		'Communication is key!',
	],
	contactCreated: [
		'New connection made!',
		'Building bridges!',
		'The network grows!',
		'Another name in the book!',
		'Connections drive progress.',
	],
	ticketCreated: [
		'On it!',
		'Tracked and ready to roll!',
		'Logged and on the radar!',
		'Nothing slips through the cracks!',
		'Let\'s get this sorted!',
	],
};

const pickFlavor = (pool, seed) => {
	if (!pool || pool.length === 0) return '';
	// Use a simple hash of the seed for consistent but varied picks
	let hash = 0;
	for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
	return pool[Math.abs(hash) % pool.length];
};

const getFlavorText = (item) => {
	const id = item.id || '';
	// Task completed
	if (item.collection === 'tasks' && item.itemData?.status === 'completed') return pickFlavor(flavorTexts.taskCompleted, id);
	if (item.collection === 'project_tasks' && item.itemData?.completed) return pickFlavor(flavorTexts.taskCompleted, id);
	// Creates
	if (item.action === 'create') {
		if (item.collection === 'projects') return pickFlavor(flavorTexts.projectCreated, id);
		if (item.collection === 'clients') return pickFlavor(flavorTexts.clientCreated, id);
		if (item.collection === 'invoices') return pickFlavor(flavorTexts.invoiceCreated, id);
		if (item.collection === 'tickets') return pickFlavor(flavorTexts.ticketCreated, id);
		if (item.collection === 'contacts' || item.collection === 'cd_contacts') return pickFlavor(flavorTexts.contactCreated, id);
	}
	// Email sent
	if (item.collection === 'emails' && item.itemData?.status === 'sent') return pickFlavor(flavorTexts.emailSent, id);
	return '';
};

// Action icons now driven by useTimelineTheme() — see themedActionIcons above
const actionIcons = themedActionIcons;

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
		fetchCommentCounts(items);
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
		fetchCommentCounts(items);
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

// ── UUID detection ──
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (str) => typeof str === 'string' && UUID_RE.test(str.trim());

// ── Build a human-readable title when the raw title is missing or a UUID ──
const truncate = (str, max = 60) => str.length > max ? str.slice(0, max - 3) + '…' : str;

// ── HTML detection + sanitization for rich-text fields ──
const containsHtml = (str) => /<[a-z][\s\S]*>/i.test(str);

const sanitizeHtml = (html) => {
	if (!html) return '';
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		for (const tag of ['script', 'iframe', 'object', 'embed', 'style']) {
			doc.querySelectorAll(tag).forEach((el) => el.remove());
		}
		return doc.body.innerHTML;
	} catch {
		return '';
	}
};

const humanizeItemTitle = (act, itemData) => {
	const raw = itemData?.title || itemData?.invoice_code || itemData?.name || itemData?.subject || '';
	if (raw && !isUUID(raw)) return raw;

	const label = collectionLabels[act.collection] || act.collection;

	// ── Quick tasks ──
	if (act.collection === 'tasks' && itemData) {
		if (itemData.description && !isUUID(itemData.description)) return truncate(itemData.description);
		const parts = [];
		if (itemData.status === 'completed') parts.push('Completed');
		if (itemData.priority && itemData.priority !== 'medium') {
			parts.push(itemData.priority.charAt(0).toUpperCase() + itemData.priority.slice(1) + ' Priority');
		}
		if (itemData.schedule && itemData.schedule !== 'unscheduled') {
			const scheduleMap = { today: 'Today', week: 'This Week', later: 'Later' };
			parts.push(scheduleMap[itemData.schedule] || itemData.schedule);
		}
		if (parts.length > 0) return `${label} · ${parts.join(' · ')}`;
		return label;
	}

	// ── Project tasks ──
	if (act.collection === 'project_tasks' && itemData) {
		if (itemData.completed) return `${label} · Done`;
		if (itemData.status) return `${label} · ${itemData.status.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`;
		return label;
	}

	// ── Contacts ──
	if ((act.collection === 'contacts' || act.collection === 'cd_contacts') && itemData) {
		const fullName = [itemData.first_name, itemData.last_name].filter(Boolean).join(' ');
		if (fullName) return fullName;
		if (itemData.email) return itemData.email;
		if (itemData.company) return `Contact at ${itemData.company}`;
		return act.action === 'create' ? 'New Contact' : label;
	}

	// ── Clients ──
	if (act.collection === 'clients' && itemData) {
		if (itemData.industry) return `${label} · ${itemData.industry}`;
		return act.action === 'create' ? 'New Client' : label;
	}

	// ── Invoices ──
	if (act.collection === 'invoices' && itemData) {
		if (itemData.status) return `Invoice · ${itemData.status.replace(/\b\w/g, c => c.toUpperCase())}`;
		return act.action === 'create' ? 'New Invoice' : 'Invoice';
	}

	// ── Emails ──
	if (act.collection === 'emails' && itemData) {
		if (itemData.status === 'sent') return 'Sent Email';
		if (itemData.status === 'draft') return 'Draft Email';
		return act.action === 'create' ? 'New Email' : 'Email';
	}

	// ── CardDesk activities ──
	if (act.collection === 'cd_activities' && itemData) {
		if (itemData.type) return itemData.type.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
		return act.action === 'create' ? 'New Activity' : 'Activity';
	}

	// ── Projects ──
	if (act.collection === 'projects') {
		return act.action === 'create' ? 'New Project' : 'Project';
	}

	// ── Tickets ──
	if (act.collection === 'tickets') {
		return act.action === 'create' ? 'New Ticket' : 'Ticket';
	}

	// ── Generic fallback ──
	return act.action === 'create' ? `New ${label}` : label;
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
			if (collection === 'tasks') fields = ['id', 'title', 'description', 'status', 'priority', 'schedule', 'date_completed'];
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

	await Promise.all(fetchPromises);

	// Build enriched timeline entries
	return activities.map((act) => {
		const itemData = itemCache[`${act.collection}:${act.item}`];
		let itemTitle = humanizeItemTitle(act, itemData);
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

const updateCommentCount = (itemId, count) => {
	commentCounts.value[itemId] = count;
};

const fetchCommentCounts = async (items) => {
	const activityIds = items.map(item => String(item.activityId)).filter(Boolean);
	if (!activityIds.length) return;
	try {
		const commentItems = useDirectusItems('comments');
		const results = await commentItems.aggregate({
			aggregate: { count: ['*'] },
			groupBy: ['item'],
			filter: {
				collection: { _eq: 'directus_activity' },
				item: { _in: activityIds },
			},
		});
		// Map activityId back to timeline item.id
		const activityToId = {};
		for (const item of items) {
			activityToId[String(item.activityId)] = item.id;
		}
		for (const row of (results || [])) {
			const timelineId = activityToId[row.item];
			if (timelineId) commentCounts.value[timelineId] = Number(row.count);
		}
	} catch (err) {
		console.warn('Timeline: Could not fetch comment counts', err);
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
								{{ getActionPhrase(item) }} {{ collectionLabels[item.collection] || item.collection }}
							</span>
						</div>

						<!-- Item title (clickable) — render HTML when present (e.g. rich-text descriptions) -->
						<NuxtLink
							v-if="getItemRoute(item)"
							:to="getItemRoute(item)"
							class="text-[15px] font-semibold text-foreground hover:text-primary transition-colors leading-snug"
						>
							<span v-if="containsHtml(item.itemTitle)" v-html="sanitizeHtml(item.itemTitle)" />
							<template v-else>{{ item.itemTitle }}</template>
						</NuxtLink>
						<p v-else class="text-[15px] font-semibold text-foreground leading-snug">
							<span v-if="containsHtml(item.itemTitle)" v-html="sanitizeHtml(item.itemTitle)" />
							<template v-else>{{ item.itemTitle }}</template>
						</p>

						<!-- Motivational flavor text for milestones -->
						<p v-if="getFlavorText(item)" class="text-xs text-primary/70 font-medium mt-1 italic">
							{{ getFlavorText(item) }}
						</p>

						<!-- CardDesk activity note (left column, text content) -->
						<p v-if="item.collection === 'cd_activities' && item.itemData?.note" class="text-xs text-muted-foreground mt-1 line-clamp-2">
							<span v-if="containsHtml(item.itemData.note)" v-html="sanitizeHtml(item.itemData.note)" />
							<template v-else>{{ item.itemData.note }}</template>
						</p>
					</div>

					<!-- Right column: detail badges -->
					<div class="flex flex-col items-end gap-1.5 pt-1">
						<!-- Task completion badge -->
						<span v-if="item.collection === 'project_tasks' && item.itemData?.completed" class="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
							<UIcon name="i-heroicons-check" class="w-3 h-3" />
							Completed
						</span>
						<!-- Quick task completion badge -->
						<span v-if="item.collection === 'tasks' && item.itemData?.status === 'completed'" class="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
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
							<span v-if="commentCounts[item.id] > 0">{{ commentCounts[item.id] }}</span>
							<span v-else>Comment</span>
						</button>
					</div>
				</div>

				<!-- Expanded comments section -->
				<Transition name="slide-down">
					<div v-if="expandedComments.has(item.id)" class="border-t border-border/50 bg-muted/20 p-4">
						<CommentsSystem
							:item-id="item.activityId"
							collection="directus_activity"
							hide-sort
							@update:comment-count="(count) => updateCommentCount(item.id, count)"
						/>
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
