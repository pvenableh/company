<script setup lang="ts">
/**
 * CardDeskDashboard — the full Card Desk experience (stats grid, XP bar,
 * filterable contact list, inline detail panel with rating + activity log).
 *
 * Rendered by both /carddesk (legacy direct route) and /apps/clients (as
 * the "Networking" segment) so the same surface area is reachable from
 * either entry point.
 */

const {
	stats,
	isLoading,
	fetchStats,
	fetchContacts,
	fetchContactActivities,
	updateContact,
	setIsClient,
	addActivity,
} = useCardDesk();

// Filters
const activeTab = ref<string>('all');
const searchQuery = ref('');
const currentPage = ref(1);
const contacts = ref<any[]>([]);
const contactsLoading = ref(false);

// Activity detail
const selectedContact = ref<any>(null);
const contactActivities = ref<any[]>([]);
const activitiesLoading = ref(false);

// Rating tabs feed UTabs (the project's floating-pill segmented control).
// `dotColor` paints the small status dot before each label; `count`
// renders a live counter chip on the right of the label so the user
// can read the funnel without leaving the row.
const tabItems = computed(() => [
	{ key: 'all', label: 'All', count: stats.value.totalContacts || null },
	{ key: 'hot', label: 'Hot', dotColor: 'bg-destructive', count: stats.value.hotContacts || null },
	{ key: 'warm', label: 'Warm', dotColor: 'bg-warning', count: stats.value.warmContacts || null },
	{ key: 'nurture', label: 'Nurture', dotColor: 'bg-success', count: stats.value.nurtureContacts || null },
	{ key: 'cold', label: 'Cold', dotColor: 'bg-blue-400', count: stats.value.coldContacts || null },
	{ key: 'clients', label: 'Clients', dotColor: 'bg-success', count: stats.value.convertedClients || null },
]);

const ratingColors: Record<string, string> = {
	hot: 'bg-destructive/10 text-destructive dark:bg-destructive/30 dark:text-destructive',
	warm: 'bg-warning/10 text-warning dark:bg-warning/30 dark:text-warning',
	nurture: 'bg-success/10 text-success dark:bg-success/30 dark:text-success',
	cold: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

const activityIcons: Record<string, string> = {
	email: 'i-heroicons-envelope',
	text: 'i-heroicons-chat-bubble-left',
	call: 'i-heroicons-phone',
	meeting: 'i-heroicons-users',
	linkedin: 'i-heroicons-link',
	other: 'i-heroicons-ellipsis-horizontal',
};

const loadContacts = async () => {
	contactsLoading.value = true;
	try {
		const opts: any = { page: currentPage.value };
		if (activeTab.value === 'clients') {
			opts.isClient = true;
		} else if (activeTab.value !== 'all') {
			opts.rating = activeTab.value;
		}
		if (searchQuery.value.trim()) {
			opts.search = searchQuery.value.trim();
		}
		contacts.value = await fetchContacts(opts);
	} catch (e) {
		console.warn('[CardDeskDashboard] Failed to load contacts:', e);
	} finally {
		contactsLoading.value = false;
	}
};

const openContact = async (contact: any) => {
	selectedContact.value = contact;
	activitiesLoading.value = true;
	try {
		contactActivities.value = await fetchContactActivities(contact.id);
	} catch (e) {
		console.warn('[CardDeskDashboard] Failed to load activities:', e);
		contactActivities.value = [];
	} finally {
		activitiesLoading.value = false;
	}
};

const closeDetail = () => {
	selectedContact.value = null;
	contactActivities.value = [];
};

// ── Mutations on the selected contact ─────────────────────────────────────
const savingPatch = ref(false);

const applyPatch = async (patch: Record<string, unknown>) => {
	if (!selectedContact.value) return;
	savingPatch.value = true;
	const prev = { ...selectedContact.value };
	Object.assign(selectedContact.value, patch);
	const rowInList = contacts.value.find((c) => c.id === selectedContact.value!.id);
	if (rowInList) Object.assign(rowInList, patch);
	try {
		await updateContact(selectedContact.value.id, patch);
		fetchStats();
	} catch (e) {
		console.warn('[CardDeskDashboard] Patch failed, rolling back:', e);
		Object.assign(selectedContact.value, prev);
		if (rowInList) Object.assign(rowInList, prev);
	} finally {
		savingPatch.value = false;
	}
};

const changeRating = (rating: string) => {
	if (!selectedContact.value) return;
	const next = selectedContact.value.rating === rating ? null : rating;
	applyPatch({ rating: next });
};

const toggleHibernated = () => {
	if (!selectedContact.value) return;
	applyPatch({ hibernated: !selectedContact.value.hibernated });
};

const toggleClient = async () => {
	if (!selectedContact.value) return;
	const next = !selectedContact.value.is_client;
	savingPatch.value = true;
	const prev = { ...selectedContact.value };
	Object.assign(selectedContact.value, {
		is_client: next,
		client_at: next ? new Date().toISOString() : null,
	});
	const rowInList = contacts.value.find((c) => c.id === selectedContact.value!.id);
	if (rowInList) Object.assign(rowInList, selectedContact.value);
	try {
		await setIsClient(selectedContact.value.id, next);
		fetchStats();
	} catch (e) {
		console.warn('[CardDeskDashboard] Client toggle failed, rolling back:', e);
		Object.assign(selectedContact.value, prev);
		if (rowInList) Object.assign(rowInList, prev);
	} finally {
		savingPatch.value = false;
	}
};

// ── Activity logging ──────────────────────────────────────────────────────
const activityFormOpen = ref(false);
const activityForm = reactive<{ type: string; label: string; note: string }>({
	type: 'email',
	label: '',
	note: '',
});
const activitySaving = ref(false);

const activityTypeOptions = [
	{ key: 'email', label: 'Email' },
	{ key: 'text', label: 'Text' },
	{ key: 'call', label: 'Call' },
	{ key: 'meeting', label: 'Meeting' },
	{ key: 'linkedin', label: 'LinkedIn' },
	{ key: 'other', label: 'Other' },
];

const openActivityForm = () => {
	activityForm.type = 'email';
	activityForm.label = '';
	activityForm.note = '';
	activityFormOpen.value = true;
};

const cancelActivity = () => {
	activityFormOpen.value = false;
};

const saveActivity = async () => {
	if (!selectedContact.value) return;
	activitySaving.value = true;
	try {
		const created = await addActivity(selectedContact.value.id, {
			type: activityForm.type,
			label: activityForm.label.trim() || null,
			note: activityForm.note.trim() || null,
		});
		contactActivities.value = [created, ...contactActivities.value];
		activityFormOpen.value = false;
		fetchStats();
	} catch (e) {
		console.warn('[CardDeskDashboard] Activity save failed:', e);
	} finally {
		activitySaving.value = false;
	}
};

const formatDate = (dateStr: string) => getFriendlyDateThree(dateStr);
const formatRelative = (dateStr: string) => getFriendlyDate(dateStr);

const contactDisplayName = (c: any) => {
	return c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown';
};

watch([activeTab, searchQuery], () => {
	currentPage.value = 1;
	loadContacts();
});

onMounted(async () => {
	await Promise.all([fetchStats(), loadContacts()]);
});
</script>

<template>
	<div>
		<!-- Stats Overview -->
		<div v-if="!isLoading" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
			<div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
				<div class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.totalContacts }}</div>
				<div class="text-xs text-gray-500 uppercase mt-1">Total Active</div>
			</div>
			<div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
				<div class="text-2xl font-bold text-destructive">{{ stats.hotContacts }}</div>
				<div class="text-xs text-gray-500 uppercase mt-1">Hot</div>
			</div>
			<div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
				<div class="text-2xl font-bold text-warning">{{ stats.warmContacts }}</div>
				<div class="text-xs text-gray-500 uppercase mt-1">Warm</div>
			</div>
			<div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
				<div class="text-2xl font-bold text-success">{{ stats.nurtureContacts }}</div>
				<div class="text-xs text-gray-500 uppercase mt-1">Nurture</div>
			</div>
			<div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
				<div class="text-2xl font-bold text-blue-400">{{ stats.coldContacts }}</div>
				<div class="text-xs text-gray-500 uppercase mt-1">Cold</div>
			</div>
			<div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
				<div class="text-2xl font-bold text-success">{{ stats.convertedClients }}</div>
				<div class="text-xs text-gray-500 uppercase mt-1">Clients</div>
			</div>
		</div>

		<!-- XP Bar -->
		<div v-if="stats.xp.totalXp > 0" class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 mb-6">
			<div class="flex items-center gap-4">
				<div class="flex items-center gap-2">
					<span class="text-xl">⚡</span>
					<span class="text-sm font-bold text-gray-700 dark:text-gray-200">Level {{ stats.xp.level }}</span>
					<span class="text-xs text-gray-400">{{ stats.xp.levelTitle }}</span>
				</div>
				<div class="flex-1 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
					<div
						class="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-500"
						:style="{ width: `${stats.xp.progress}%` }"
					/>
				</div>
				<span class="text-xs text-gray-400 whitespace-nowrap">
					{{ stats.xp.totalXp.toLocaleString() }} / {{ stats.xp.nextLevelXp.toLocaleString() }} XP
				</span>
				<div v-if="stats.xp.streak > 0" class="flex items-center gap-1 text-xs text-gray-500 border-l pl-4 ml-2">
					<span class="text-warning">🔥</span>
					<span class="font-medium">{{ stats.xp.streak }}-day streak</span>
				</div>
			</div>
		</div>

		<!-- Main Content -->
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
			<!-- Contact List (2/3) -->
			<div class="lg:col-span-2">
				<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
					<!-- Tabs + Search -->
					<div class="p-4 border-b border-gray-100 dark:border-gray-700">
						<UTabs
							v-model="activeTab"
							:items="tabItems"
							class="mb-3 w-fit"
						/>
						<input
							v-model="searchQuery"
							type="text"
							placeholder="Search contacts..."
							class="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/50"
						/>
					</div>

					<!-- Contact Rows -->
					<div v-if="contactsLoading" class="p-4 space-y-3">
						<div v-for="n in 5" :key="n" class="h-14 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
					</div>

					<div v-else-if="contacts.length === 0" class="p-8 text-center text-gray-400">
						<UIcon name="i-heroicons-identification" class="w-10 h-10 mx-auto mb-2" />
						<p class="text-sm">No contacts found</p>
					</div>

					<div v-else class="divide-y divide-gray-100 dark:divide-gray-700">
						<button
							v-for="contact in contacts"
							:key="contact.id"
							class="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
							:class="{ 'bg-blue-50 dark:bg-blue-900/20': selectedContact?.id === contact.id }"
							@click="openContact(contact)"
						>
							<!-- Avatar -->
							<div class="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
								<span class="text-xs font-medium text-gray-600 dark:text-gray-300">
									{{ (contactDisplayName(contact).charAt(0) || '?').toUpperCase() }}
								</span>
							</div>

							<!-- Info -->
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2">
									<span class="text-sm font-medium truncate">{{ contactDisplayName(contact) }}</span>
									<span
										v-if="contact.is_client"
										class="text-[9px] bg-success/10 text-success dark:bg-success/30 dark:text-success px-1.5 rounded-full font-medium"
									>
										Client
									</span>
								</div>
								<div class="flex items-center gap-2 text-xs text-gray-400">
									<span v-if="contact.company" class="truncate">{{ contact.company }}</span>
									<span v-if="contact.title && contact.company"> · </span>
									<span v-if="contact.title" class="truncate">{{ contact.title }}</span>
								</div>
							</div>

							<!-- Rating Badge -->
							<span
								v-if="contact.rating"
								class="text-[10px] px-2 py-0.5 rounded-full font-medium capitalize flex-shrink-0"
								:class="ratingColors[contact.rating] || 'bg-gray-100 text-gray-600'"
							>
								{{ contact.rating }}
							</span>

							<!-- Date -->
							<span class="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">
								{{ formatRelative(contact.date_created) }}
							</span>
						</button>
					</div>

					<!-- Pagination -->
					<div class="flex items-center justify-between p-3 border-t border-gray-100 dark:border-gray-700">
						<button
							:disabled="currentPage <= 1"
							class="text-xs text-primary hover:underline disabled:opacity-30 disabled:cursor-not-allowed"
							@click="currentPage--; loadContacts()"
						>
							&larr; Previous
						</button>
						<span class="text-xs text-gray-400">Page {{ currentPage }}</span>
						<button
							:disabled="contacts.length < 25"
							class="text-xs text-primary hover:underline disabled:opacity-30 disabled:cursor-not-allowed"
							@click="currentPage++; loadContacts()"
						>
							Next &rarr;
						</button>
					</div>
				</div>
			</div>

			<!-- Detail Panel (1/3) -->
			<div>
				<!-- Contact Detail -->
				<div v-if="selectedContact" class="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
					<div class="p-4 border-b border-gray-100 dark:border-gray-700">
						<div class="flex items-center justify-between mb-3">
							<h3 class="text-sm font-semibold">{{ contactDisplayName(selectedContact) }}</h3>
							<button @click="closeDetail" class="text-gray-400 hover:text-gray-600">
								<UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
							</button>
						</div>

						<div class="space-y-1.5 text-xs text-gray-500">
							<div v-if="selectedContact.company" class="flex items-center gap-2">
								<UIcon name="i-heroicons-building-office" class="w-3.5 h-3.5" />
								<span>{{ selectedContact.company }}</span>
							</div>
							<div v-if="selectedContact.title" class="flex items-center gap-2">
								<UIcon name="i-heroicons-briefcase" class="w-3.5 h-3.5" />
								<span>{{ selectedContact.title }}</span>
							</div>
							<div v-if="selectedContact.email" class="flex items-center gap-2">
								<UIcon name="i-heroicons-envelope" class="w-3.5 h-3.5" />
								<span>{{ selectedContact.email }}</span>
							</div>
							<div v-if="selectedContact.phone" class="flex items-center gap-2">
								<UIcon name="i-heroicons-phone" class="w-3.5 h-3.5" />
								<span>{{ selectedContact.phone }}</span>
							</div>
							<div v-if="selectedContact.industry" class="flex items-center gap-2">
								<UIcon name="i-heroicons-tag" class="w-3.5 h-3.5" />
								<span>{{ selectedContact.industry }}</span>
							</div>
							<div v-if="selectedContact.met_at" class="flex items-center gap-2">
								<UIcon name="i-heroicons-map-pin" class="w-3.5 h-3.5" />
								<span>Met at: {{ selectedContact.met_at }}</span>
							</div>
						</div>

						<!-- Status badges -->
						<div class="flex items-center gap-2 mt-3 flex-wrap">
							<span v-if="selectedContact.is_client" class="text-[10px] bg-success/10 text-success px-2 py-0.5 rounded-full font-medium">
								Client since {{ formatDate(selectedContact.client_at) }}
							</span>
							<span v-if="selectedContact.hibernated" class="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
								Hibernated
							</span>
						</div>

						<!-- Inline editors: rating + state toggles -->
						<div class="mt-4 space-y-3">
							<div>
								<div class="text-[10px] uppercase font-semibold text-gray-400 mb-1.5 tracking-wider">
									Rating
								</div>
								<div class="inline-flex items-center gap-1 rounded-lg bg-muted/50 p-1 border border-border">
									<button
										v-for="r in (['hot', 'warm', 'nurture', 'cold'] as const)"
										:key="r"
										type="button"
										:disabled="savingPatch"
										class="px-2.5 py-1 rounded-md text-[11px] font-semibold capitalize transition-all disabled:opacity-40"
										:class="selectedContact.rating === r
											? ratingColors[r]
											: 'text-muted-foreground hover:text-foreground'"
										@click="changeRating(r)"
									>
										{{ r }}
									</button>
								</div>
							</div>

							<div class="flex flex-wrap gap-2">
								<button
									type="button"
									:disabled="savingPatch"
									class="text-[11px] px-2.5 py-1 rounded-md font-medium border border-border transition-colors disabled:opacity-40"
									:class="selectedContact.is_client
										? 'bg-success/10 text-success border-success/30'
										: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
									@click="toggleClient"
								>
									<UIcon name="i-heroicons-trophy" class="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
									{{ selectedContact.is_client ? 'Client ✓' : 'Mark as client' }}
								</button>
								<button
									type="button"
									:disabled="savingPatch"
									class="text-[11px] px-2.5 py-1 rounded-md font-medium border border-border transition-colors disabled:opacity-40"
									:class="selectedContact.hibernated
										? 'bg-muted text-muted-foreground'
										: 'text-muted-foreground hover:text-foreground hover:bg-muted/50'"
									@click="toggleHibernated"
								>
									<UIcon name="i-heroicons-moon" class="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
									{{ selectedContact.hibernated ? 'Hibernated' : 'Hibernate' }}
								</button>
							</div>
						</div>

						<p v-if="selectedContact.notes" class="mt-3 text-xs text-gray-500 italic border-t pt-2">
							{{ selectedContact.notes }}
						</p>
					</div>

					<!-- Activity Timeline -->
					<div class="p-4">
						<div class="flex items-center justify-between mb-3">
							<h4 class="text-[10px] uppercase font-semibold text-gray-400 tracking-wider">Activity Timeline</h4>
							<button
								v-if="!activityFormOpen"
								type="button"
								class="text-[11px] text-primary hover:underline font-medium"
								@click="openActivityForm"
							>
								+ Log
							</button>
						</div>

						<!-- Inline new-activity form -->
						<div v-if="activityFormOpen" class="mb-4 p-3 rounded-lg border border-border bg-muted/30 space-y-2">
							<div class="flex flex-wrap gap-1">
								<button
									v-for="opt in activityTypeOptions"
									:key="opt.key"
									type="button"
									class="text-[10px] px-2 py-0.5 rounded-full font-medium capitalize transition-colors"
									:class="activityForm.type === opt.key
										? 'bg-foreground text-background'
										: 'bg-card text-muted-foreground hover:text-foreground border border-border'"
									@click="activityForm.type = opt.key"
								>
									<UIcon :name="activityIcons[opt.key] || activityIcons.other" class="w-3 h-3 inline -mt-0.5 mr-0.5" />
									{{ opt.label }}
								</button>
							</div>
							<input
								v-model="activityForm.label"
								type="text"
								placeholder="Short label (e.g. Sent intro email)"
								class="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
							/>
							<textarea
								v-model="activityForm.note"
								placeholder="Optional note…"
								rows="2"
								class="w-full px-2 py-1.5 text-xs border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
							/>
							<div class="flex items-center justify-end gap-2">
								<button
									type="button"
									class="text-[11px] text-muted-foreground hover:text-foreground"
									@click="cancelActivity"
								>
									Cancel
								</button>
								<button
									type="button"
									:disabled="activitySaving"
									class="text-[11px] font-medium px-2.5 py-1 rounded-md bg-foreground text-background disabled:opacity-40"
									@click="saveActivity"
								>
									{{ activitySaving ? 'Saving…' : 'Save' }}
								</button>
							</div>
						</div>

						<div v-if="activitiesLoading" class="space-y-2">
							<div v-for="n in 3" :key="n" class="h-8 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
						</div>

						<div v-else-if="contactActivities.length === 0" class="text-center py-4 text-xs text-gray-400">
							No activities recorded
						</div>

						<div v-else class="space-y-3 max-h-[400px] overflow-y-auto">
							<div
								v-for="act in contactActivities"
								:key="act.id"
								class="flex gap-2.5 text-xs"
							>
								<div class="flex flex-col items-center">
									<div class="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
										<UIcon
											:name="activityIcons[act.type] || activityIcons.other"
											class="w-3.5 h-3.5 text-gray-500"
										/>
									</div>
									<div class="w-px flex-1 bg-gray-200 dark:bg-gray-600 mt-1" />
								</div>
								<div class="pb-3 flex-1 min-w-0">
									<div class="flex items-center gap-2">
										<span class="font-medium capitalize">{{ act.type }}</span>
										<span v-if="act.is_response" class="text-[9px] bg-success/10 text-success px-1 rounded">replied</span>
										<span class="text-gray-400 ml-auto whitespace-nowrap">{{ formatDate(act.date) }}</span>
									</div>
									<p v-if="act.label" class="text-gray-500 mt-0.5">{{ act.label }}</p>
									<p v-if="act.note" class="text-gray-400 mt-0.5 italic">{{ act.note }}</p>
									<p v-if="act.is_response && act.response_note" class="text-success dark:text-success mt-0.5">
										↩ {{ act.response_note }}
									</p>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Conversion Tracking (when no contact selected) -->
				<div v-else class="space-y-4">
					<!-- Conversion Stats -->
					<div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
						<h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
							<UIcon name="i-heroicons-arrow-trending-up" class="w-4 h-4 text-success" />
							Conversion Tracking
						</h3>
						<div class="space-y-3">
							<div class="flex items-center justify-between">
								<span class="text-xs text-gray-500">Cards → Contacts</span>
								<span class="text-sm font-bold">{{ stats.totalContacts }}</span>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-xs text-gray-500">Contacts → Clients</span>
								<span class="text-sm font-bold text-success">{{ stats.convertedClients }}</span>
							</div>
							<div v-if="stats.totalContacts > 0" class="flex items-center justify-between">
								<span class="text-xs text-gray-500">Conversion Rate</span>
								<span class="text-sm font-bold text-success">
									{{ Math.round((stats.convertedClients / stats.totalContacts) * 100) }}%
								</span>
							</div>
							<div class="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mt-2">
								<div
									class="h-full bg-success rounded-full transition-all"
									:style="{ width: stats.totalContacts > 0 ? `${Math.round((stats.convertedClients / stats.totalContacts) * 100)}%` : '0%' }"
								/>
							</div>
						</div>
					</div>

					<!-- Needs Follow-up -->
					<div v-if="stats.needsFollowUp.length > 0" class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
						<h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
							<UIcon name="i-heroicons-bell-alert" class="w-4 h-4 text-warning" />
							Needs Follow-up
						</h3>
						<div class="space-y-2">
							<button
								v-for="contact in stats.needsFollowUp.slice(0, 6)"
								:key="contact.id"
								class="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
								@click="openContact(contact)"
							>
								<div class="flex items-center gap-2 min-w-0">
									<span
										class="w-2 h-2 rounded-full flex-shrink-0"
										:class="contact.rating === 'hot' ? 'bg-destructive' : 'bg-warning'"
									/>
									<span class="text-xs font-medium truncate">{{ contact.name }}</span>
								</div>
								<span class="text-[10px] text-gray-400 whitespace-nowrap ml-2">{{ contact.daysSinceContact }}d ago</span>
							</button>
						</div>
					</div>

					<!-- Recent Activity -->
					<div v-if="stats.recentActivity.length > 0" class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
						<h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
							<UIcon name="i-heroicons-clock" class="w-4 h-4 text-blue-500" />
							Recent Activity
						</h3>
						<div class="space-y-2">
							<div
								v-for="act in stats.recentActivity.slice(0, 5)"
								:key="act.id"
								class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400"
							>
								<UIcon :name="activityIcons[act.type] || activityIcons.other" class="w-3.5 h-3.5 flex-shrink-0" />
								<span class="truncate">
									{{ act.type }}{{ act.contactName ? ` with ${act.contactName}` : '' }}
								</span>
								<span v-if="act.isResponse" class="text-[9px] bg-success/10 text-success px-1 rounded">replied</span>
								<span class="text-[10px] text-gray-400 ml-auto whitespace-nowrap">{{ formatRelative(act.date) }}</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
