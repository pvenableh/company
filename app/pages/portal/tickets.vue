<script setup lang="ts">
import { Button } from '~/components/ui/button';

definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Portal Tickets | Earnest' });

// Slide-over for portal-friendly ticket detail (comments + reactions live here).
// TicketsBoard emits `view-ticket` when a card is clicked in portal mode.
const selectedTicket = ref<any | null>(null);
const showDetail = ref(false);

function openTicket(ticket: any) {
	selectedTicket.value = ticket;
	showDetail.value = true;
}

const showCreateForm = ref(false);

function onTicketCreated() {
	// TicketsBoard subscribes to refresh triggers via useTicketsStore.
	const { triggerRefresh } = useTicketsStore();
	triggerRefresh();
}

function normalizeTicketStatus(s: string | undefined | null): string {
	if (!s) return 'pending';
	return s.toLowerCase().replace(/\s+/g, '_');
}

const priorityBadge: Record<string, string> = {
	urgent: 'bg-destructive/10 text-destructive dark:bg-destructive/30 dark:text-destructive',
	high: 'bg-warning/10 text-warning dark:bg-warning/30 dark:text-warning',
	normal: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
	low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};
</script>

<template>
	<div class="portal-page">
		<AppHeader title="Tickets">
			<template #actions>
				<Button size="sm" @click="showCreateForm = !showCreateForm">
					<Icon :name="showCreateForm ? 'lucide:x' : 'lucide:plus'" class="w-4 h-4 mr-1" />
					{{ showCreateForm ? 'Cancel' : 'Submit a Ticket' }}
				</Button>
			</template>
		</AppHeader>

		<LayoutPageContainer>
			<p class="text-sm text-muted-foreground mb-6 -mt-1">Track and manage your support requests.</p>

		<!-- Create Ticket Form (shared with the dashboard) -->
		<div v-if="showCreateForm" class="mb-6">
			<PortalQuickTicketForm v-model:open="showCreateForm" @created="onTicketCreated" />
		</div>

		<!-- Board — reuses agency TicketsBoard in portal mode for visual parity.
			 Card click bubbles `view-ticket` because portal users can't open
			 the agency edit form. -->
		<TicketsBoard portal @view-ticket="openTicket" />

		<!-- Ticket Detail Slide-over -->
		<Teleport to="body">
			<Transition name="slide">
				<div v-if="showDetail && selectedTicket" class="fixed inset-0 z-50 flex justify-end">
					<div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="showDetail = false" />
					<div class="relative w-full max-w-lg bg-background border-l border-border shadow-xl overflow-y-auto">
						<div class="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/40 p-4 flex items-center justify-between">
							<h2 class="font-semibold">{{ selectedTicket.title }}</h2>
							<button class="p-1.5 rounded-lg hover:bg-muted/60 transition-colors" @click="showDetail = false">
								<Icon name="lucide:x" class="w-5 h-5" />
							</button>
						</div>

						<div class="p-5 space-y-5">
							<!-- Status + Priority -->
							<div class="flex gap-4">
								<div>
									<p class="text-xs text-muted-foreground mb-1">Status</p>
									<span class="text-xs px-2.5 py-1 rounded-full font-medium"
										:class="{
											'bg-warning/10 text-warning dark:bg-warning/30 dark:text-warning': normalizeTicketStatus(selectedTicket.status) === 'scheduled',
											'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': normalizeTicketStatus(selectedTicket.status) === 'in_progress',
											'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400': normalizeTicketStatus(selectedTicket.status) === 'pending',
											'bg-success/10 text-success dark:bg-success/30 dark:text-success': normalizeTicketStatus(selectedTicket.status) === 'completed',
										}"
									>
										{{ selectedTicket.status }}
									</span>
								</div>
								<div v-if="selectedTicket.priority">
									<p class="text-xs text-muted-foreground mb-1">Priority</p>
									<span class="text-xs px-2.5 py-1 rounded-full font-medium"
										:class="priorityBadge[selectedTicket.priority] || priorityBadge.normal"
									>
										{{ selectedTicket.priority }}
									</span>
								</div>
							</div>

							<!-- Description -->
							<div v-if="selectedTicket.description">
								<p class="text-xs text-muted-foreground mb-1">Description</p>
								<div class="text-sm leading-relaxed prose prose-sm" v-html="selectedTicket.description" />
							</div>

							<!-- Project -->
							<div v-if="selectedTicket.project?.title">
								<p class="text-xs text-muted-foreground mb-1">Project</p>
								<p class="text-sm flex items-center gap-1.5">
									<Icon name="lucide:folder" class="w-3.5 h-3.5 text-muted-foreground" />
									{{ selectedTicket.project.title }}
								</p>
							</div>

							<!-- Assigned -->
							<div v-if="selectedTicket.assigned_to?.[0]?.directus_users_id">
								<p class="text-xs text-muted-foreground mb-1">Assigned To</p>
								<p class="text-sm">
									{{ selectedTicket.assigned_to[0].directus_users_id.first_name }}
									{{ selectedTicket.assigned_to[0].directus_users_id.last_name }}
								</p>
							</div>

							<!-- Date -->
							<div>
								<p class="text-xs text-muted-foreground mb-1">Opened</p>
								<p class="text-sm">{{ selectedTicket.date_created ? new Date(selectedTicket.date_created).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—' }}</p>
							</div>

							<!-- Reactions -->
							<div>
								<p class="text-xs text-muted-foreground mb-2">React</p>
								<ReactionsBar collection="tickets" :item-id="selectedTicket.id" />
							</div>

							<!-- Comments -->
							<div class="border-t border-border/30 pt-5">
								<PortalCommentThread
									collection="tickets"
									:item-id="selectedTicket.id"
									label="Comments"
								/>
							</div>
						</div>
					</div>
				</div>
			</Transition>
		</Teleport>
		</LayoutPageContainer>
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

.slide-enter-active,
.slide-leave-active {
	transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-enter-from .relative,
.slide-leave-to .relative {
	transform: translateX(100%);
}
.slide-enter-from .absolute,
.slide-leave-to .absolute {
	opacity: 0;
}
</style>
