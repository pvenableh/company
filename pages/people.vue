<template>
	<div class="p-4 md:p-6 max-w-7xl mx-auto">
		<!-- Header -->
		<div class="flex items-center justify-between mb-6">
			<h1 class="text-xl font-semibold">People</h1>
			<div class="flex items-center gap-2">
				<NuxtLink to="/contacts?new=true" class="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted/50 transition-colors">
					<Icon name="lucide:plus" class="w-4 h-4" /> Contact
				</NuxtLink>
				<NuxtLink to="/clients?new=true" class="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
					<Icon name="lucide:plus" class="w-4 h-4" /> Client
				</NuxtLink>
			</div>
		</div>

		<!-- Compact stat bar -->
		<div class="grid grid-cols-3 gap-3 mb-6">
			<NuxtLink to="/contacts" class="ios-card p-4 hover:ring-1 hover:ring-white/10 transition-all">
				<p class="text-2xl font-bold">{{ contactCount }}</p>
				<p class="text-[10px] uppercase tracking-wide text-muted-foreground">Contacts</p>
			</NuxtLink>
			<NuxtLink to="/clients" class="ios-card p-4 hover:ring-1 hover:ring-white/10 transition-all">
				<p class="text-2xl font-bold">{{ clientCount }}</p>
				<p class="text-[10px] uppercase tracking-wide text-muted-foreground">Clients</p>
			</NuxtLink>
			<NuxtLink to="/carddesk" class="ios-card p-4 hover:ring-1 hover:ring-white/10 transition-all">
				<p class="text-2xl font-bold">{{ networkCount }}</p>
				<p class="text-[10px] uppercase tracking-wide text-muted-foreground">Network</p>
			</NuxtLink>
		</div>

		<!-- Needs Attention -->
		<div v-if="needsAttention.length" class="ios-card p-5 mb-6">
			<h3 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
				Needs Attention
				<span class="text-amber-400 ml-1">({{ needsAttention.length }})</span>
			</h3>
			<div class="space-y-0.5">
				<NuxtLink
					v-for="item in needsAttention"
					:key="item.id"
					:to="item.route"
					class="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-md hover:bg-muted/30 transition-colors"
				>
					<div class="flex items-center gap-3 min-w-0 flex-1">
						<span
							class="w-2 h-2 rounded-full shrink-0"
							:class="item.urgency === 'high' ? 'bg-red-500' : 'bg-amber-500'"
						/>
						<div class="min-w-0">
							<p class="text-sm font-medium truncate">{{ item.name }}</p>
							<p class="text-[11px] text-muted-foreground">{{ item.reason }}</p>
						</div>
					</div>
					<span class="text-xs font-medium text-primary shrink-0 ml-3">{{ item.action }}</span>
				</NuxtLink>
			</div>
		</div>

		<!-- Unified search -->
		<div class="relative mb-6">
			<Icon name="i-heroicons-magnifying-glass" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
			<input
				v-model="search"
				type="text"
				placeholder="Search contacts, clients, and connections..."
				class="w-full rounded-lg border bg-background pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-muted-foreground/60"
			/>
		</div>

		<!-- Quick links (compact, only when not searching) -->
		<div v-if="!search" class="flex gap-2 mb-6 overflow-x-auto pb-1">
			<NuxtLink to="/contacts/import" class="flex items-center gap-1.5 px-3 py-2 ios-card hover:ring-1 hover:ring-white/10 transition-all shrink-0">
				<Icon name="lucide:upload" class="w-4 h-4 text-blue-400" />
				<span class="text-xs font-medium">Import CSV</span>
			</NuxtLink>
			<NuxtLink to="/carddesk" class="flex items-center gap-1.5 px-3 py-2 ios-card hover:ring-1 hover:ring-white/10 transition-all shrink-0">
				<Icon name="lucide:scan" class="w-4 h-4 text-purple-400" />
				<span class="text-xs font-medium">Scan Card</span>
			</NuxtLink>
			<NuxtLink to="/contacts" class="flex items-center gap-1.5 px-3 py-2 ios-card hover:ring-1 hover:ring-white/10 transition-all shrink-0">
				<Icon name="lucide:list" class="w-4 h-4 text-muted-foreground" />
				<span class="text-xs font-medium">All Contacts</span>
			</NuxtLink>
			<NuxtLink to="/clients" class="flex items-center gap-1.5 px-3 py-2 ios-card hover:ring-1 hover:ring-white/10 transition-all shrink-0">
				<Icon name="lucide:building-2" class="w-4 h-4 text-muted-foreground" />
				<span class="text-xs font-medium">All Clients</span>
			</NuxtLink>
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
const needsAttention = ref<Array<{ id: string; name: string; reason: string; urgency: 'high' | 'medium'; route: string; action: string }>>([]);

// Load counts + attention items
onMounted(async () => {
	try {
		const [contacts, clients] = await Promise.all([
			getContacts({ limit: 1, page: 1 }),
			getClients({ limit: 1, page: 1 }),
		]);
		contactCount.value = contacts.total;
		clientCount.value = clients.total;

		// Find clients that need attention — recently inactive or with overdue invoices
		const allClients = await getClients({ limit: 50, page: 1 });
		const invoiceItems = useDirectusItems('invoices');
		const unpaidInvoices = await invoiceItems.list({
			filter: { status: { _in: ['pending', 'processing'] } },
			fields: ['id', 'total_amount', 'due_date', 'client.id', 'client.name'],
			limit: 50,
		});

		// Group overdue invoices by client
		const clientInvoiceMap = new Map<string, any[]>();
		for (const inv of unpaidInvoices) {
			const clientId = typeof inv.client === 'object' ? inv.client?.id : inv.client;
			if (!clientId) continue;
			if (!clientInvoiceMap.has(clientId)) clientInvoiceMap.set(clientId, []);
			clientInvoiceMap.get(clientId)!.push(inv);
		}

		const items: typeof needsAttention.value = [];
		for (const [clientId, invs] of clientInvoiceMap) {
			const overdueInvs = invs.filter((inv: any) => inv.due_date && new Date(inv.due_date) < new Date());
			const clientName = typeof invs[0]?.client === 'object' ? invs[0].client?.name : 'Unknown';
			if (overdueInvs.length > 0) {
				const total = overdueInvs.reduce((s: number, inv: any) => s + (Number(inv.total_amount) || 0), 0);
				items.push({
					id: clientId,
					name: clientName || 'Unknown',
					reason: `$${total.toLocaleString()} overdue (${overdueInvs.length} invoice${overdueInvs.length > 1 ? 's' : ''})`,
					urgency: 'high',
					route: `/clients/${clientId}`,
					action: 'Follow up',
				});
			} else if (invs.length > 0) {
				const total = invs.reduce((s: number, inv: any) => s + (Number(inv.total_amount) || 0), 0);
				const soonest = invs.sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];
				const daysUntil = soonest?.due_date ? Math.ceil((new Date(soonest.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 99;
				if (daysUntil <= 7) {
					items.push({
						id: clientId,
						name: clientName || 'Unknown',
						reason: `$${total.toLocaleString()} due in ${daysUntil}d`,
						urgency: 'medium',
						route: `/clients/${clientId}`,
						action: 'Review',
					});
				}
			}
		}

		needsAttention.value = items.sort((a, b) => (a.urgency === 'high' ? -1 : 1) - (b.urgency === 'high' ? -1 : 1)).slice(0, 5);
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
