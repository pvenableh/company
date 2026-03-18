<template>
	<div class="p-4 md:p-6 max-w-7xl mx-auto">
		<!-- Header -->
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
			<div>
				<h1 class="text-2xl font-bold text-foreground">People</h1>
				<p class="text-sm text-muted-foreground mt-1">
					Your unified CRM — contacts, clients, and networking connections
				</p>
			</div>
		</div>

		<!-- Quick stats -->
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
			<NuxtLink
				to="/contacts"
				class="group rounded-xl border bg-card p-5 hover:shadow-md hover:border-orange-500/30 transition-all"
			>
				<div class="flex items-center gap-3 mb-3">
					<div class="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center">
						<Icon name="i-heroicons-user-group" class="w-5 h-5 text-white" />
					</div>
					<div>
						<h3 class="font-semibold text-foreground group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">Contacts</h3>
						<p class="text-xs text-muted-foreground">{{ contactCount }} total</p>
					</div>
				</div>
				<p class="text-xs text-muted-foreground">Manage contacts, lists, and email subscribers</p>
			</NuxtLink>

			<NuxtLink
				to="/clients"
				class="group rounded-xl border bg-card p-5 hover:shadow-md hover:border-red-500/30 transition-all"
			>
				<div class="flex items-center gap-3 mb-3">
					<div class="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
						<Icon name="i-heroicons-building-office-2" class="w-5 h-5 text-white" />
					</div>
					<div>
						<h3 class="font-semibold text-foreground group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">Clients</h3>
						<p class="text-xs text-muted-foreground">{{ clientCount }} total</p>
					</div>
				</div>
				<p class="text-xs text-muted-foreground">Active clients, prospects, and companies</p>
			</NuxtLink>

			<NuxtLink
				to="/carddesk"
				class="group rounded-xl border bg-card p-5 hover:shadow-md hover:border-orange-500/30 transition-all"
			>
				<div class="flex items-center gap-3 mb-3">
					<div class="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
						<Icon name="i-heroicons-identification" class="w-5 h-5 text-white" />
					</div>
					<div>
						<h3 class="font-semibold text-foreground group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">Networking</h3>
						<p class="text-xs text-muted-foreground">{{ networkCount }} connections</p>
					</div>
				</div>
				<p class="text-xs text-muted-foreground">CardDesk networking contacts and activities</p>
			</NuxtLink>
		</div>

		<!-- Getting started (shown when no data) -->
		<div v-if="!contactCount && !clientCount && !networkCount && !search" class="rounded-xl border bg-card p-8 mb-8 text-center">
			<Icon name="i-heroicons-user-group" class="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
			<h3 class="text-base font-semibold text-foreground mb-1">Get started with People</h3>
			<p class="text-sm text-muted-foreground max-w-lg mx-auto mb-6">
				People is your unified CRM — manage contacts, clients, and networking connections in one place. Here's how to get started:
			</p>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-left max-w-2xl mx-auto">
				<NuxtLink to="/clients?new=true" class="group rounded-lg border p-4 hover:border-primary/30 hover:bg-primary/5 transition-all">
					<Icon name="i-heroicons-building-office-2" class="w-5 h-5 text-red-500 mb-2" />
					<h4 class="text-sm font-medium text-foreground mb-1">Add your first client</h4>
					<p class="text-xs text-muted-foreground">Create a client profile to start organizing work and building your CRM.</p>
				</NuxtLink>
				<NuxtLink to="/contacts?new=true" class="group rounded-lg border p-4 hover:border-primary/30 hover:bg-primary/5 transition-all">
					<Icon name="i-heroicons-user-plus" class="w-5 h-5 text-orange-500 mb-2" />
					<h4 class="text-sm font-medium text-foreground mb-1">Add a contact</h4>
					<p class="text-xs text-muted-foreground">Add individual contacts and link them to clients for easy management.</p>
				</NuxtLink>
				<NuxtLink to="/contacts/import" class="group rounded-lg border p-4 hover:border-primary/30 hover:bg-primary/5 transition-all">
					<Icon name="i-heroicons-arrow-up-tray" class="w-5 h-5 text-blue-500 mb-2" />
					<h4 class="text-sm font-medium text-foreground mb-1">Import contacts</h4>
					<p class="text-xs text-muted-foreground">Upload a CSV to quickly populate your CRM with existing contacts.</p>
				</NuxtLink>
			</div>
		</div>

		<!-- Unified search -->
		<div class="relative mb-6">
			<Icon name="i-heroicons-magnifying-glass" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
			<input
				v-model="search"
				type="text"
				placeholder="Search across all contacts, clients, and connections..."
				class="w-full rounded-xl border bg-background pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all placeholder:text-muted-foreground/60"
			/>
		</div>

		<!-- Recent activity or search results -->
		<div v-if="!search" class="space-y-4">
			<h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Quick Actions</h3>
			<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
				<NuxtLink
					to="/contacts?new=true"
					class="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted/50 transition-colors"
				>
					<Icon name="i-heroicons-plus" class="w-4 h-4 text-orange-500" />
					New Contact
				</NuxtLink>
				<NuxtLink
					to="/clients?new=true"
					class="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted/50 transition-colors"
				>
					<Icon name="i-heroicons-plus" class="w-4 h-4 text-red-500" />
					New Client
				</NuxtLink>
				<NuxtLink
					to="/contacts/import"
					class="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted/50 transition-colors"
				>
					<Icon name="i-heroicons-arrow-up-tray" class="w-4 h-4 text-blue-500" />
					Import Contacts
				</NuxtLink>
				<NuxtLink
					to="/carddesk"
					class="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted/50 transition-colors"
				>
					<Icon name="i-heroicons-identification" class="w-4 h-4 text-purple-500" />
					Scan Card
				</NuxtLink>
			</div>
		</div>

		<!-- Search results -->
		<div v-else-if="searchLoading" class="py-12 text-center">
			<Icon name="lucide:loader-2" class="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
			<p class="text-sm text-muted-foreground mt-2">Searching...</p>
		</div>
		<div v-else-if="searchResults.length > 0" class="space-y-2">
			<p class="text-xs text-muted-foreground mb-3">{{ searchResults.length }} result{{ searchResults.length !== 1 ? 's' : '' }}</p>
			<NuxtLink
				v-for="result in searchResults"
				:key="`${result.source}-${result.id}`"
				:to="result.route"
				class="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
			>
				<div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white"
					:class="result.source === 'contacts' ? 'bg-orange-500' : result.source === 'clients' ? 'bg-red-500' : 'bg-purple-500'"
				>
					{{ result.initials }}
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-sm font-medium text-foreground truncate">{{ result.name }}</p>
					<p class="text-xs text-muted-foreground truncate">{{ result.detail }}</p>
				</div>
				<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground uppercase tracking-wider">
					{{ result.source === 'carddesk' ? 'network' : result.source }}
				</span>
			</NuxtLink>
		</div>
		<div v-else-if="search && !searchLoading" class="py-12 text-center">
			<p class="text-sm text-muted-foreground">No results found for "{{ search }}"</p>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'People | Earnest' });

const { getContacts } = useContacts();
const { getClients } = useClients();
const { fetchContacts: fetchCdContacts } = useCardDesk();

const search = ref('');
const searchLoading = ref(false);
const searchResults = ref<Array<{
	id: string;
	name: string;
	detail: string;
	initials: string;
	source: string;
	route: string;
}>>([]);

const contactCount = ref(0);
const clientCount = ref(0);
const networkCount = ref(0);

// Load counts
onMounted(async () => {
	try {
		const [contacts, clients] = await Promise.all([
			getContacts({ limit: 1, page: 1 }),
			getClients({ limit: 1, page: 1 }),
		]);
		contactCount.value = contacts.total;
		clientCount.value = clients.total;
	} catch { /* counts are non-critical */ }

	try {
		const cdResult = await fetchCdContacts({ page: 1 });
		networkCount.value = cdResult?.length || 0;
	} catch { /* counts are non-critical */ }
});

function getInitials(name: string): string {
	return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

const doSearch = useDebounceFn(async () => {
	if (!search.value.trim()) {
		searchResults.value = [];
		return;
	}

	searchLoading.value = true;
	const results: typeof searchResults.value = [];

	try {
		const [contacts, clients] = await Promise.all([
			getContacts({ search: search.value, limit: 10, page: 1 }),
			getClients({ search: search.value, limit: 10, page: 1 }),
		]);

		for (const c of contacts.data) {
			const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Unknown';
			results.push({
				id: c.id,
				name,
				detail: [c.company, c.email].filter(Boolean).join(' · '),
				initials: getInitials(name),
				source: 'contacts',
				route: `/contacts/${c.id}`,
			});
		}

		for (const c of clients.data as any[]) {
			const name = c.name || 'Unnamed Client';
			results.push({
				id: c.id,
				name,
				detail: [c.industry, c.status].filter(Boolean).join(' · '),
				initials: getInitials(name),
				source: 'clients',
				route: `/clients/${c.id}`,
			});
		}
	} catch { /* search errors are non-critical */ }

	searchResults.value = results;
	searchLoading.value = false;
}, 300);

watch(search, doSearch);
</script>
