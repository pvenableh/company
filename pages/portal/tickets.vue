<script setup lang="ts">
import { Button } from '~/components/ui/button';
import { toast } from 'vue-sonner';

definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});

const { selectedOrg } = useOrganization();
const { clientScope, hasPermission } = useOrgRole();
const { user } = useDirectusAuth();

const ticketItems = useDirectusItems('tickets');

const loading = ref(true);
const tickets = ref<any[]>([]);
const filter = ref<'all' | 'open' | 'completed'>('open');

// Create ticket
const showCreateForm = ref(false);
const creating = ref(false);
const newTicket = ref({
	title: '',
	description: '',
	priority: 'normal',
});

const canCreateTickets = computed(() => hasPermission('tickets', 'create'));

async function loadTickets() {
	if (!selectedOrg.value) return;
	loading.value = true;

	try {
		const conditions: any[] = [];

		if (clientScope.value) {
			conditions.push({ client: { _eq: clientScope.value } });
		}

		if (filter.value === 'open') {
			conditions.push({ status: { _in: ['open', 'in_progress', 'pending'] } });
		} else if (filter.value === 'completed') {
			conditions.push({ status: { _eq: 'completed' } });
		}

		tickets.value = await ticketItems.list({
			filter: conditions.length ? { _and: conditions } : undefined,
			fields: [
				'id',
				'title',
				'description',
				'status',
				'priority',
				'date_created',
				'date_updated',
				'assigned_to.id',
				'assigned_to.first_name',
				'assigned_to.last_name',
				'project.id',
				'project.title',
			],
			sort: ['-date_updated'],
			limit: 100,
		});
	} catch (err) {
		console.error('Failed to load tickets:', err);
	} finally {
		loading.value = false;
	}
}

async function createTicket() {
	if (!newTicket.value.title.trim()) return;
	creating.value = true;

	try {
		const data: any = {
			title: newTicket.value.title.trim(),
			description: newTicket.value.description.trim() || undefined,
			priority: newTicket.value.priority,
			status: 'open',
			user_created: user.value?.id,
		};

		if (clientScope.value) {
			data.client = clientScope.value;
		}

		await ticketItems.create(data);
		toast.success('Ticket created successfully');
		newTicket.value = { title: '', description: '', priority: 'normal' };
		showCreateForm.value = false;
		await loadTickets();
	} catch (err: any) {
		toast.error(err?.message || 'Failed to create ticket');
	} finally {
		creating.value = false;
	}
}

const statusIcon: Record<string, string> = {
	open: 'lucide:circle',
	in_progress: 'lucide:loader',
	pending: 'lucide:clock',
	completed: 'lucide:check-circle-2',
};

const statusColor: Record<string, string> = {
	open: 'text-amber-500',
	in_progress: 'text-blue-500',
	pending: 'text-purple-500',
	completed: 'text-green-500',
};

const priorityBadge: Record<string, string> = {
	urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
	high: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
	normal: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
	low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

onMounted(() => loadTickets());
watch(() => selectedOrg.value, () => loadTickets());
watch(filter, () => loadTickets());
</script>

<template>
	<div class="p-6 max-w-5xl mx-auto">
		<!-- Header -->
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-xl font-semibold">Tickets</h1>
				<p class="text-sm text-muted-foreground mt-0.5">Track and manage your support requests.</p>
			</div>
			<Button
				v-if="canCreateTickets"
				size="sm"
				@click="showCreateForm = !showCreateForm"
			>
				<Icon :name="showCreateForm ? 'lucide:x' : 'lucide:plus'" class="w-4 h-4 mr-1" />
				{{ showCreateForm ? 'Cancel' : 'New Ticket' }}
			</Button>
		</div>

		<!-- Create Ticket Form -->
		<Transition name="expand">
			<div v-if="showCreateForm" class="ios-card p-5 mb-6">
				<h2 class="font-medium mb-4">Create New Ticket</h2>
				<form class="space-y-4" @submit.prevent="createTicket">
					<div>
						<label class="text-sm font-medium mb-1 block">Title</label>
						<input
							v-model="newTicket.title"
							type="text"
							placeholder="Brief description of your issue..."
							class="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
							required
						/>
					</div>

					<div>
						<label class="text-sm font-medium mb-1 block">Description</label>
						<textarea
							v-model="newTicket.description"
							rows="4"
							placeholder="Provide additional details..."
							class="w-full rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
						/>
					</div>

					<div>
						<label class="text-sm font-medium mb-1 block">Priority</label>
						<select
							v-model="newTicket.priority"
							class="rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
						>
							<option value="low">Low</option>
							<option value="normal">Normal</option>
							<option value="high">High</option>
							<option value="urgent">Urgent</option>
						</select>
					</div>

					<div class="flex justify-end">
						<Button type="submit" :disabled="creating || !newTicket.title.trim()">
							<Icon v-if="creating" name="lucide:loader-2" class="w-4 h-4 mr-1 animate-spin" />
							{{ creating ? 'Creating...' : 'Submit Ticket' }}
						</Button>
					</div>
				</form>
			</div>
		</Transition>

		<!-- Filter Tabs -->
		<div class="flex gap-1 mb-5 p-1 rounded-xl bg-muted/50 w-fit">
			<button
				v-for="f in (['open', 'completed', 'all'] as const)"
				:key="f"
				class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize"
				:class="filter === f ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
				@click="filter = f"
			>
				{{ f }}
			</button>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="flex items-center justify-center py-24">
			<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
		</div>

		<!-- Empty State -->
		<div v-else-if="!tickets.length" class="flex flex-col items-center justify-center py-24 gap-3">
			<Icon name="lucide:ticket" class="w-10 h-10 text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">
				{{ filter === 'open' ? 'No open tickets.' : filter === 'completed' ? 'No completed tickets.' : 'No tickets found.' }}
			</p>
			<Button v-if="canCreateTickets" size="sm" variant="outline" @click="showCreateForm = true">
				<Icon name="lucide:plus" class="w-4 h-4 mr-1" />
				Create a Ticket
			</Button>
		</div>

		<!-- Ticket List -->
		<div v-else class="space-y-2">
			<div
				v-for="ticket in tickets"
				:key="ticket.id"
				class="ios-card p-4 hover:shadow-md transition-shadow"
			>
				<div class="flex items-start gap-3">
					<!-- Status icon -->
					<Icon
						:name="statusIcon[ticket.status] || 'lucide:circle'"
						class="w-5 h-5 mt-0.5 shrink-0"
						:class="statusColor[ticket.status] || 'text-muted-foreground'"
					/>

					<div class="flex-1 min-w-0">
						<div class="flex items-start justify-between gap-2">
							<h3 class="text-sm font-medium">{{ ticket.title }}</h3>
							<span
								v-if="ticket.priority"
								class="text-xs px-2 py-0.5 rounded-full shrink-0"
								:class="priorityBadge[ticket.priority] || priorityBadge.normal"
							>
								{{ ticket.priority }}
							</span>
						</div>

						<p v-if="ticket.description" class="text-xs text-muted-foreground mt-1 line-clamp-2">
							{{ ticket.description }}
						</p>

						<div class="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
							<span v-if="ticket.project?.title" class="flex items-center gap-1">
								<Icon name="lucide:folder" class="w-3 h-3" />
								{{ ticket.project.title }}
							</span>
							<span v-if="ticket.assigned_to">
								<Icon name="lucide:user" class="w-3 h-3 inline" />
								{{ ticket.assigned_to.first_name }} {{ ticket.assigned_to.last_name }}
							</span>
							<span>
								{{ ticket.date_updated ? new Date(ticket.date_updated).toLocaleDateString() : '' }}
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.expand-enter-active,
.expand-leave-active {
	transition: all 0.2s ease;
}
.expand-enter-from,
.expand-leave-to {
	opacity: 0;
	transform: translateY(-8px);
}
</style>
