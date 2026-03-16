<script setup lang="ts">
definePageMeta({
	middleware: ['auth'],
});

const { stats, isLoading, error, fetchStats, fetchContacts, fetchContactActivities } = useCardDesk();

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

const tabs = [
	{ key: 'all', label: 'All' },
	{ key: 'hot', label: 'Hot', color: 'text-red-500' },
	{ key: 'warm', label: 'Warm', color: 'text-amber-500' },
	{ key: 'nurture', label: 'Nurture', color: 'text-green-500' },
	{ key: 'cold', label: 'Cold', color: 'text-blue-400' },
	{ key: 'clients', label: 'Clients', color: 'text-emerald-600' },
];

const ratingColors: Record<string, string> = {
	hot: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
	warm: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
	nurture: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
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
		console.warn('[CardDesk Page] Failed to load contacts:', e);
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
		console.warn('[CardDesk Page] Failed to load activities:', e);
		contactActivities.value = [];
	} finally {
		activitiesLoading.value = false;
	}
};

const closeDetail = () => {
	selectedContact.value = null;
	contactActivities.value = [];
};

const formatDate = (dateStr: string) => {
	if (!dateStr) return '';
	const d = new Date(dateStr);
	return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatRelative = (dateStr: string) => {
	if (!dateStr) return '';
	const d = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - d.getTime();
	const diffDays = Math.floor(diffMs / 86400000);
	if (diffDays === 0) return 'Today';
	if (diffDays === 1) return 'Yesterday';
	if (diffDays < 7) return `${diffDays}d ago`;
	if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
	return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const contactDisplayName = (c: any) => {
	return c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown';
};

// Watch filters
watch([activeTab, searchQuery], () => {
	currentPage.value = 1;
	loadContacts();
});

onMounted(async () => {
	await Promise.all([fetchStats(), loadContacts()]);
});
</script>

<template>
	<div class="min-h-screen">
		<div class="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
			<!-- Header -->
			<div class="flex items-center justify-between mb-6">
				<div class="flex items-center gap-3">
					<div class="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
						<UIcon name="i-heroicons-identification" class="w-6 h-6 text-white" />
					</div>
					<div>
						<h1 class="text-2xl font-bold text-gray-900 dark:text-white">CardDesk</h1>
						<p class="text-sm text-gray-500">Networking Pipeline & Contact Management</p>
					</div>
				</div>
				<nuxt-link to="/command-center" class="text-sm text-primary hover:underline">
					&larr; Command Center
				</nuxt-link>
			</div>

			<!-- Stats Overview -->
			<div v-if="!isLoading" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
				<div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
					<div class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats.totalContacts }}</div>
					<div class="text-xs text-gray-500 uppercase mt-1">Total Active</div>
				</div>
				<div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
					<div class="text-2xl font-bold text-red-500">{{ stats.hotContacts }}</div>
					<div class="text-xs text-gray-500 uppercase mt-1">Hot</div>
				</div>
				<div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
					<div class="text-2xl font-bold text-amber-500">{{ stats.warmContacts }}</div>
					<div class="text-xs text-gray-500 uppercase mt-1">Warm</div>
				</div>
				<div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
					<div class="text-2xl font-bold text-green-500">{{ stats.nurtureContacts }}</div>
					<div class="text-xs text-gray-500 uppercase mt-1">Nurture</div>
				</div>
				<div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
					<div class="text-2xl font-bold text-blue-400">{{ stats.coldContacts }}</div>
					<div class="text-xs text-gray-500 uppercase mt-1">Cold</div>
				</div>
				<div class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 text-center">
					<div class="text-2xl font-bold text-emerald-600">{{ stats.convertedClients }}</div>
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
						<span class="text-amber-500">🔥</span>
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
							<div class="inline-flex items-center gap-1 rounded-xl bg-muted/50 p-1 border border-border mb-3">
								<button
									v-for="tab in tabs"
									:key="tab.key"
									class="flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] uppercase tracking-wider font-semibold transition-all duration-200"
									:class="activeTab === tab.key
										? 'bg-card text-foreground shadow-sm'
										: 'text-muted-foreground hover:text-foreground'"
									@click="activeTab = tab.key"
								>
									{{ tab.label }}
								</button>
							</div>
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
											class="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-1.5 rounded-full font-medium"
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
							<div class="flex items-center gap-2 mt-3">
								<span
									v-if="selectedContact.rating"
									class="text-[10px] px-2 py-0.5 rounded-full font-medium capitalize"
									:class="ratingColors[selectedContact.rating]"
								>
									{{ selectedContact.rating }}
								</span>
								<span v-if="selectedContact.is_client" class="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
									Client since {{ formatDate(selectedContact.client_at) }}
								</span>
								<span v-if="selectedContact.hibernated" class="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
									Hibernated
								</span>
							</div>

							<p v-if="selectedContact.notes" class="mt-3 text-xs text-gray-500 italic border-t pt-2">
								{{ selectedContact.notes }}
							</p>
						</div>

						<!-- Activity Timeline -->
						<div class="p-4">
							<h4 class="text-[10px] uppercase font-semibold text-gray-400 mb-3 tracking-wider">Activity Timeline</h4>

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
											<span v-if="act.is_response" class="text-[9px] bg-green-100 text-green-700 px-1 rounded">replied</span>
											<span class="text-gray-400 ml-auto whitespace-nowrap">{{ formatDate(act.date) }}</span>
										</div>
										<p v-if="act.label" class="text-gray-500 mt-0.5">{{ act.label }}</p>
										<p v-if="act.note" class="text-gray-400 mt-0.5 italic">{{ act.note }}</p>
										<p v-if="act.is_response && act.response_note" class="text-green-600 dark:text-green-400 mt-0.5">
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
								<UIcon name="i-heroicons-arrow-trending-up" class="w-4 h-4 text-emerald-500" />
								Conversion Tracking
							</h3>
							<div class="space-y-3">
								<div class="flex items-center justify-between">
									<span class="text-xs text-gray-500">Cards → Contacts</span>
									<span class="text-sm font-bold">{{ stats.totalContacts }}</span>
								</div>
								<div class="flex items-center justify-between">
									<span class="text-xs text-gray-500">Contacts → Clients</span>
									<span class="text-sm font-bold text-emerald-600">{{ stats.convertedClients }}</span>
								</div>
								<div v-if="stats.totalContacts > 0" class="flex items-center justify-between">
									<span class="text-xs text-gray-500">Conversion Rate</span>
									<span class="text-sm font-bold text-emerald-600">
										{{ Math.round((stats.convertedClients / stats.totalContacts) * 100) }}%
									</span>
								</div>
								<div class="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mt-2">
									<div
										class="h-full bg-emerald-500 rounded-full transition-all"
										:style="{ width: stats.totalContacts > 0 ? `${Math.round((stats.convertedClients / stats.totalContacts) * 100)}%` : '0%' }"
									/>
								</div>
							</div>
						</div>

						<!-- Needs Follow-up -->
						<div v-if="stats.needsFollowUp.length > 0" class="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
							<h3 class="text-sm font-semibold mb-3 flex items-center gap-2">
								<UIcon name="i-heroicons-bell-alert" class="w-4 h-4 text-amber-500" />
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
											:class="contact.rating === 'hot' ? 'bg-red-500' : 'bg-amber-500'"
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
									<span v-if="act.isResponse" class="text-[9px] bg-green-100 text-green-700 px-1 rounded">replied</span>
									<span class="text-[10px] text-gray-400 ml-auto whitespace-nowrap">{{ formatRelative(act.date) }}</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
