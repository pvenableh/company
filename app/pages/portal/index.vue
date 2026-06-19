<script setup lang="ts">
/**
 * /portal — Home.
 *
 * The cross-cutting overview. Each sub-app hub goes deep on its
 * own scope; Home is the only screen that spans them.
 *
 * Sections, top to bottom:
 *   1. "Needs your attention" — proposals/contracts/invoices/tickets
 *      that require client action. Empty state celebrates being caught
 *      up. Drives the difference between a portal clients actually
 *      open and one they ignore.
 *   2. App roll-up strip — one tile per main app (Progress, Billing,
 *      Performance, Messages), each with a single headline number and
 *      a deep-link into the hub.
 *   3. Recent activity feed — combined timeline across apps.
 *   4. Project Timeline (Gantt) — at-a-glance view of in-flight work.
 *
 * Every number on this page comes from /api/portal/summary so the
 * Home view re-renders whenever the underlying collections update.
 */
import { Button } from '~/components/ui/button';

definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Home | Client Portal' });

const { user } = useDirectusAuth();
const { selectedOrg } = useOrganization();
const { membership } = useOrgRole();

interface SummaryResponse {
	attention: Array<{
		id: string;
		type: 'proposal' | 'contract' | 'invoice' | 'ticket';
		label: string;
		detail: string;
		href: string;
		dueDate?: string | null;
		severity: 'urgent' | 'normal' | 'info';
	}>;
	kpis: {
		progress: { activeProjects: number; openTickets: number };
		billing: { outstandingTotal: number; pendingProposals: number; unsignedContracts: number };
		performance: { campaignsThisMonth: number };
		messages: { channelCount: number };
	};
	activity: Array<{
		id: string;
		type: 'project' | 'ticket' | 'invoice' | 'proposal' | 'contract';
		title: string;
		detail: string;
		href: string;
		timestamp: string;
	}>;
}

const summary = ref<SummaryResponse | null>(null);
const loading = ref(true);
const showTicketForm = ref(false);

async function loadSummary() {
	if (!selectedOrg.value) return;
	loading.value = true;
	try {
		summary.value = await $fetch<SummaryResponse>('/api/portal/summary');
	} catch (err) {
		console.error('Failed to load portal summary:', err);
	} finally {
		loading.value = false;
	}
}

const clientName = computed(() => {
	if (!membership.value?.client) return null;
	const client = membership.value.client;
	return typeof client === 'object' ? client.name : null;
});

const attention = computed(() => summary.value?.attention ?? []);
const kpis = computed(
	() => summary.value?.kpis ?? {
		progress: { activeProjects: 0, openTickets: 0 },
		billing: { outstandingTotal: 0, pendingProposals: 0, unsignedContracts: 0 },
		performance: { campaignsThisMonth: 0 },
		messages: { channelCount: 0 },
	},
);
const activity = computed(() => summary.value?.activity ?? []);

const attentionIcon: Record<string, string> = {
	proposal: 'lucide:file-text',
	contract: 'lucide:file-signature',
	invoice: 'lucide:dollar-sign',
	ticket: 'lucide:ticket',
};

const activityIcon: Record<string, string> = {
	project: 'lucide:folder-kanban',
	ticket: 'lucide:ticket',
	invoice: 'lucide:dollar-sign',
	proposal: 'lucide:file-text',
	contract: 'lucide:file-signature',
};

function formatCurrency(n: number): string {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function timeAgo(iso: string): string {
	if (!iso) return '';
	const ms = Date.now() - new Date(iso).getTime();
	const minutes = Math.floor(ms / (1000 * 60));
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

onMounted(() => loadSummary());
watch(() => selectedOrg.value, () => loadSummary());
</script>

<template>
	<div class="portal-page">
		<AppHeader>
			<template #default>
				Welcome{{ user?.first_name ? `, ${user.first_name}` : '' }}
			</template>
			<template #actions>
				<Button size="sm" @click="showTicketForm = !showTicketForm">
					<Icon :name="showTicketForm ? 'lucide:x' : 'lucide:plus'" class="w-4 h-4 mr-1" />
					{{ showTicketForm ? 'Cancel' : 'Submit a Ticket' }}
				</Button>
			</template>
		</AppHeader>

		<LayoutPageContainer>
			<p v-if="clientName" class="text-sm text-muted-foreground mb-6 -mt-1">
				{{ clientName }} &mdash; the headline view across everything.
			</p>

			<div v-if="showTicketForm" class="mb-8">
				<PortalQuickTicketForm v-model:open="showTicketForm" @created="loadSummary" />
			</div>

			<div v-if="loading" class="flex items-center justify-center py-24">
				<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
			</div>

			<template v-else>
				<!-- ── Needs Your Attention ──────────────────────────── -->
				<div class="ios-card p-5 mb-6">
					<div class="flex items-center justify-between mb-3">
						<h2 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
							Needs Your Attention
						</h2>
						<span v-if="attention.length" class="text-[11px] text-muted-foreground tabular-nums">
							{{ attention.length }} {{ attention.length === 1 ? 'item' : 'items' }}
						</span>
					</div>

					<div v-if="attention.length" class="space-y-2">
						<NuxtLink
							v-for="item in attention"
							:key="`${item.type}-${item.id}`"
							:to="item.href"
							class="flex items-center gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors"
						>
							<div
								class="flex items-center justify-center w-8 h-8 rounded-full shrink-0"
								:class="item.severity === 'urgent'
									? 'bg-destructive/10 text-destructive'
									: item.severity === 'info'
										? 'bg-muted text-muted-foreground'
										: 'bg-primary/10 text-primary'"
							>
								<Icon :name="attentionIcon[item.type] ?? 'lucide:circle-alert'" class="w-4 h-4" />
							</div>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium truncate">{{ item.label }}</p>
								<p class="text-xs text-muted-foreground truncate">{{ item.detail }}</p>
							</div>
							<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground shrink-0" />
						</NuxtLink>
					</div>
					<div v-else class="py-6 text-center">
						<Icon name="lucide:check-circle-2" class="w-8 h-8 text-success/60 mx-auto mb-2" />
						<p class="text-sm text-muted-foreground">You're all caught up &mdash; nice.</p>
					</div>
				</div>

				<!-- ── App Roll-up Strip ─────────────────────────────── -->
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
					<NuxtLink to="/portal/progress" class="ios-card p-5 hover:bg-muted/30 transition-colors group">
						<div class="flex items-center justify-between mb-2">
							<div class="flex items-center justify-center w-9 h-9 rounded-full bg-blue-500/10">
								<Icon name="lucide:square-kanban" class="w-4 h-4 text-blue-500" />
							</div>
							<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
						</div>
						<p class="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Progress</p>
						<p class="text-xl font-semibold leading-tight">{{ kpis.progress.activeProjects }} active</p>
						<p class="text-xs text-muted-foreground">{{ kpis.progress.openTickets }} open tickets</p>
					</NuxtLink>

					<NuxtLink to="/portal/billing" class="ios-card p-5 hover:bg-muted/30 transition-colors group">
						<div class="flex items-center justify-between mb-2">
							<div class="flex items-center justify-center w-9 h-9 rounded-full bg-warning/10">
								<Icon name="lucide:trending-up" class="w-4 h-4 text-warning" />
							</div>
							<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
						</div>
						<p class="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Billing</p>
						<p class="text-xl font-semibold leading-tight tabular-nums">{{ formatCurrency(kpis.billing.outstandingTotal) }}</p>
						<p class="text-xs text-muted-foreground">
							{{ kpis.billing.pendingProposals }} proposals · {{ kpis.billing.unsignedContracts }} contracts pending
						</p>
					</NuxtLink>

					<NuxtLink to="/portal/performance" class="ios-card p-5 hover:bg-muted/30 transition-colors group">
						<div class="flex items-center justify-between mb-2">
							<div class="flex items-center justify-center w-9 h-9 rounded-full bg-success/10">
								<Icon name="ph:chart-line-up-duotone" class="w-4 h-4 text-success" />
							</div>
							<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
						</div>
						<p class="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Performance</p>
						<p class="text-xl font-semibold leading-tight">{{ kpis.performance.campaignsThisMonth }} active</p>
						<p class="text-xs text-muted-foreground">campaigns in the last 30 days</p>
					</NuxtLink>

					<NuxtLink to="/portal/messages" class="ios-card p-5 hover:bg-muted/30 transition-colors group">
						<div class="flex items-center justify-between mb-2">
							<div class="flex items-center justify-center w-9 h-9 rounded-full bg-primary/10">
								<Icon name="ph:chats-circle-duotone" class="w-4 h-4 text-primary" />
							</div>
							<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
						</div>
						<p class="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Messages</p>
						<p class="text-xl font-semibold leading-tight">{{ kpis.messages.channelCount }}</p>
						<p class="text-xs text-muted-foreground">conversation {{ kpis.messages.channelCount === 1 ? 'channel' : 'channels' }}</p>
					</NuxtLink>
				</div>

				<!-- ── Recent Activity + Project Timeline ─────────────── -->
				<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
					<!-- Recent activity feed -->
					<div class="ios-card p-5 lg:col-span-1">
						<div class="flex items-center justify-between mb-4">
							<h2 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
								Recent Activity
							</h2>
							<Icon name="lucide:activity" class="w-3.5 h-3.5 text-muted-foreground" />
						</div>

						<div v-if="activity.length" class="space-y-2">
							<NuxtLink
								v-for="item in activity"
								:key="`${item.type}-${item.id}`"
								:to="item.href"
								class="flex items-start gap-3 p-2.5 rounded-xl hover:bg-muted/40 transition-colors -mx-1"
							>
								<div class="flex items-center justify-center w-7 h-7 rounded-full bg-muted shrink-0">
									<Icon :name="activityIcon[item.type] ?? 'lucide:circle'" class="w-3.5 h-3.5 text-muted-foreground" />
								</div>
								<div class="flex-1 min-w-0">
									<p class="text-sm font-medium truncate">{{ item.title }}</p>
									<p class="text-xs text-muted-foreground truncate">{{ item.detail }}</p>
								</div>
								<span class="text-[10px] text-muted-foreground tabular-nums shrink-0 mt-1">{{ timeAgo(item.timestamp) }}</span>
							</NuxtLink>
						</div>
						<p v-else class="text-sm text-muted-foreground text-center py-6">
							No recent activity.
						</p>
					</div>

					<!-- Project timeline -->
					<div class="lg:col-span-2">
						<div class="flex items-center justify-between mb-3">
							<h2 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
								Project Timeline
							</h2>
							<UiViewLink to="/portal/progress" size="sm">Open full view</UiViewLink>
						</div>
						<ProjectTimelineUnifiedGantt portal :auto-expand-threshold="3" compact />
					</div>
				</div>
			</template>
		</LayoutPageContainer>
	</div>
</template>
