<script setup lang="ts">
/**
 * /portal/progress — Progress hub.
 *
 * Cross-cutting view of projects + tasks + tickets — the "where do
 * things stand" surface for the client. This page used to live at
 * /portal/index.vue and was the de-facto dashboard; relocating it
 * here frees the Home page to act as a true cross-app roll-up.
 *
 * Sub-pages (`/portal/projects`, `/portal/tasks`, `/portal/tickets`)
 * still exist for deep-dives — the hub's "View all" links route into
 * them. The rail's active-id resolver maps all four URLs to the
 * `progress` app id so the chip stays lit on every drill-down.
 */
import { Button } from '~/components/ui/button';
import { VisXYContainer, VisAxis, VisSingleContainer, VisDonut, VisLine, VisArea } from '@unovis/vue';
import { CurveType } from '@unovis/ts';

definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Progress | Client Portal' });

const { user } = useDirectusAuth();
const { selectedOrg } = useOrganization();
const { membership } = useOrgRole();

const projectItems = usePortalItems('projects');
const ticketItems = usePortalItems('tickets');
const taskItems = usePortalItems('tasks');

const loading = ref(true);
const stats = ref({
	activeProjects: 0,
	openTickets: 0,
	openTasks: 0,
	resolvedTickets: 0,
});
const recentTickets = ref<any[]>([]);
const recentProjects = ref<any[]>([]);

const projectStatusBreakdown = ref<Array<{ key: string; label: string; value: number; color: string }>>([]);
const ticketPriorityBreakdown = ref<Array<{ key: string; label: string; value: number; color: string }>>([]);
const ticketActivityWeekly = ref<Array<{ weekIdx: number; label: string; opened: number; closed: number }>>([]);

const showTicketForm = ref(false);

const STATUS_COLORS: Record<string, string> = {
	pending: '#f59e0b',
	scheduled: '#06b6d4',
	in_progress: '#3b82f6',
	completed: '#22c55e',
};

const PRIORITY_COLORS: Record<string, string> = {
	urgent: '#ef4444',
	high: '#f59e0b',
	normal: '#3b82f6',
	medium: '#3b82f6',
	low: '#9ca3af',
};

function normalizeKey(s: string | null | undefined): string {
	return (s ?? '').toLowerCase().replace(/\s+/g, '_');
}

function startOfWeek(d: Date): Date {
	const x = new Date(d);
	x.setHours(0, 0, 0, 0);
	const day = x.getDay();
	const diff = (day + 6) % 7;
	x.setDate(x.getDate() - diff);
	return x;
}

async function loadHub() {
	if (!selectedOrg.value) return;
	loading.value = true;

	try {
		const projectsActive = ['Pending', 'Scheduled', 'In Progress'];
		const ticketsActive = ['Pending', 'Scheduled', 'In Progress'];

		const [
			projects,
			tickets,
			openTaskCount,
			resolved,
			projectStatusAgg,
			ticketPriorityAgg,
			recentTicketsForActivity,
		] = await Promise.all([
			projectItems.list({
				filter: { status: { _in: projectsActive } },
				fields: ['id', 'title', 'status', 'date_updated'],
				sort: ['-date_updated'],
				limit: 5,
			}),
			ticketItems.list({
				filter: { status: { _in: ticketsActive } },
				fields: ['id', 'title', 'status', 'priority', 'date_updated'],
				sort: ['-date_updated'],
				limit: 5,
			}),
			taskItems.count({ status: { _neq: 'completed' } }).catch(() => 0),
			ticketItems.count({ status: { _eq: 'Completed' } }),
			projectItems.aggregate({
				aggregate: { count: ['*'] },
				groupBy: ['status'],
				filter: { status: { _neq: 'Archived' } },
			}).catch(() => []),
			ticketItems.aggregate({
				aggregate: { count: ['*'] },
				groupBy: ['priority'],
				filter: { status: { _neq: 'Archived' } },
			}).catch(() => []),
			ticketItems.list({
				fields: ['id', 'status', 'date_created', 'date_updated'],
				filter: {
					date_created: {
						_gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(),
					},
				},
				sort: ['-date_created'],
				limit: 500,
			}).catch(() => []),
		]);

		stats.value = {
			activeProjects: projects.length,
			openTickets: tickets.length,
			openTasks: openTaskCount || 0,
			resolvedTickets: resolved || 0,
		};

		recentProjects.value = projects;
		recentTickets.value = tickets;

		projectStatusBreakdown.value = (projectStatusAgg as any[])
			.filter((row) => row?.status)
			.map((row) => {
				const key = normalizeKey(row.status);
				return {
					key,
					label: row.status,
					value: parseInt(row.count?.id || row.count || 0) || 0,
					color: STATUS_COLORS[key] || '#9ca3af',
				};
			})
			.filter((r) => r.value > 0);

		ticketPriorityBreakdown.value = (ticketPriorityAgg as any[])
			.filter((row) => row?.priority)
			.map((row) => {
				const key = normalizeKey(row.priority);
				return {
					key,
					label: row.priority,
					value: parseInt(row.count?.id || row.count || 0) || 0,
					color: PRIORITY_COLORS[key] || '#9ca3af',
				};
			})
			.filter((r) => r.value > 0)
			.sort((a, b) => {
				const order = ['urgent', 'high', 'normal', 'medium', 'low'];
				return order.indexOf(a.key) - order.indexOf(b.key);
			});

		const weeks: Array<{ weekIdx: number; label: string; opened: number; closed: number; start: number }> = [];
		const now = new Date();
		for (let i = 7; i >= 0; i--) {
			const d = startOfWeek(new Date(now));
			d.setDate(d.getDate() - i * 7);
			weeks.push({
				weekIdx: 7 - i,
				label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
				opened: 0,
				closed: 0,
				start: d.getTime(),
			});
		}

		const weekFor = (ts: number) => {
			for (let i = weeks.length - 1; i >= 0; i--) {
				if (ts >= weeks[i]!.start) return weeks[i];
			}
			return null;
		};

		for (const t of recentTicketsForActivity as any[]) {
			if (t.date_created) {
				const w = weekFor(new Date(t.date_created).getTime());
				if (w) w.opened++;
			}
			if (t.status === 'Completed' && t.date_updated) {
				const w = weekFor(new Date(t.date_updated).getTime());
				if (w) w.closed++;
			}
		}

		ticketActivityWeekly.value = weeks.map(({ start: _start, ...rest }) => rest);
	} catch (err) {
		console.error('Failed to load progress hub:', err);
	} finally {
		loading.value = false;
	}
}

const clientName = computed(() => {
	if (!membership.value?.client) return null;
	const client = membership.value.client;
	return typeof client === 'object' ? client.name : null;
});

const projectStatusTotal = computed(() =>
	projectStatusBreakdown.value.reduce((sum, r) => sum + r.value, 0),
);

const ticketActivityTotal = computed(() =>
	ticketActivityWeekly.value.reduce((sum, w) => sum + w.opened + w.closed, 0),
);

const maxPriorityValue = computed(() =>
	Math.max(1, ...ticketPriorityBreakdown.value.map((r) => r.value)),
);

const { getPriorityBadgeClasses, getStatusBadgeClasses } = useStatusStyle();

onMounted(() => {
	loadHub();
});

watch(() => selectedOrg.value, () => {
	loadHub();
});
</script>

<template>
	<div class="portal-page">
		<AppHeader>
			<template #default>Progress</template>
			<template #actions>
				<Button size="sm" @click="showTicketForm = !showTicketForm">
					<Icon :name="showTicketForm ? 'lucide:x' : 'lucide:plus'" class="w-4 h-4 mr-1" />
					{{ showTicketForm ? 'Cancel' : 'Submit a Ticket' }}
				</Button>
			</template>
		</AppHeader>

		<LayoutPageContainer>
			<p v-if="clientName" class="text-sm text-muted-foreground mb-6 -mt-1">
				{{ clientName }} &mdash; where every active project, task, and ticket stands.
			</p>

			<div v-if="showTicketForm" class="mb-8">
				<PortalQuickTicketForm v-model:open="showTicketForm" @created="loadHub" />
			</div>

			<div v-if="loading" class="flex items-center justify-center py-24">
				<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
			</div>

			<template v-else>
				<!-- KPI Strip — four headline counts -->
				<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
					<div class="ios-card p-5">
						<div class="flex items-center gap-3">
							<div class="flex items-center justify-center w-10 h-10 rounded-full bg-info/10">
								<Icon name="lucide:folder-kanban" class="w-5 h-5 text-info" />
							</div>
							<div>
								<p class="text-2xl font-semibold">{{ stats.activeProjects }}</p>
								<p class="text-xs text-muted-foreground">Active Projects</p>
							</div>
						</div>
					</div>
					<div class="ios-card p-5">
						<div class="flex items-center gap-3">
							<div class="flex items-center justify-center w-10 h-10 rounded-full bg-warning/10">
								<Icon name="lucide:ticket" class="w-5 h-5 text-warning" />
							</div>
							<div>
								<p class="text-2xl font-semibold">{{ stats.openTickets }}</p>
								<p class="text-xs text-muted-foreground">Open Tickets</p>
							</div>
						</div>
					</div>
					<div class="ios-card p-5">
						<div class="flex items-center gap-3">
							<div class="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
								<Icon name="lucide:check-square" class="w-5 h-5 text-primary" />
							</div>
							<div>
								<p class="text-2xl font-semibold">{{ stats.openTasks }}</p>
								<p class="text-xs text-muted-foreground">Open Tasks</p>
							</div>
						</div>
					</div>
					<div class="ios-card p-5">
						<div class="flex items-center gap-3">
							<div class="flex items-center justify-center w-10 h-10 rounded-full bg-success/10">
								<Icon name="lucide:check-circle-2" class="w-5 h-5 text-success" />
							</div>
							<div>
								<p class="text-2xl font-semibold">{{ stats.resolvedTickets }}</p>
								<p class="text-xs text-muted-foreground">Resolved Tickets</p>
							</div>
						</div>
					</div>
				</div>

				<!-- Charts row -->
				<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
					<div class="ios-card p-5">
						<div class="flex items-center justify-between mb-3">
							<h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
								Projects by Status
							</h3>
							<Icon name="lucide:pie-chart" class="w-3.5 h-3.5 text-muted-foreground" />
						</div>

						<ClientOnly>
							<div v-if="projectStatusBreakdown.length" class="relative h-[160px]">
								<VisSingleContainer :data="projectStatusBreakdown" :height="160">
									<VisDonut
										:value="(d: any) => d.value"
										:arc-width="22"
										:pad-angle="0.02"
										:corner-radius="3"
										:color="(d: any) => d.color"
										:show-empty-segments="false"
										:arc-label="() => ''"
									/>
								</VisSingleContainer>
								<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
									<div class="text-center">
										<p class="text-2xl font-bold leading-none">{{ projectStatusTotal }}</p>
										<p class="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">total</p>
									</div>
								</div>
							</div>
							<div v-else class="h-[160px] flex items-center justify-center text-[11px] text-muted-foreground">
								No projects yet.
							</div>
						</ClientOnly>

						<div v-if="projectStatusBreakdown.length" class="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3">
							<div
								v-for="row in projectStatusBreakdown"
								:key="row.key"
								class="flex items-center gap-1.5 text-[11px]"
							>
								<span class="w-2 h-2 rounded-sm shrink-0" :style="{ background: row.color }" />
								<span class="text-muted-foreground truncate capitalize">{{ row.label.toLowerCase() }}</span>
								<span class="ml-auto font-medium tabular-nums">{{ row.value }}</span>
							</div>
						</div>
					</div>

					<div class="ios-card p-5">
						<div class="flex items-center justify-between mb-3">
							<h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
								Tickets by Priority
							</h3>
							<Icon name="lucide:bar-chart-2" class="w-3.5 h-3.5 text-muted-foreground" />
						</div>

						<div v-if="ticketPriorityBreakdown.length" class="space-y-3 h-[160px] flex flex-col justify-center">
							<div
								v-for="row in ticketPriorityBreakdown"
								:key="row.key"
								class="space-y-1"
							>
								<div class="flex items-baseline justify-between text-[11px]">
									<span class="text-muted-foreground capitalize">{{ row.label }}</span>
									<span class="font-medium tabular-nums">{{ row.value }}</span>
								</div>
								<div class="h-1.5 rounded-full bg-muted/40 overflow-hidden">
									<div
										class="h-full rounded-full transition-all"
										:style="{
											width: `${(row.value / maxPriorityValue) * 100}%`,
											background: row.color,
										}"
									/>
								</div>
							</div>
						</div>
						<div v-else class="h-[160px] flex items-center justify-center text-[11px] text-muted-foreground">
							No tickets yet.
						</div>
					</div>

					<div class="ios-card p-5">
						<div class="flex items-center justify-between mb-3">
							<h3 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
								Ticket Activity · 8 wks
							</h3>
							<Icon name="lucide:activity" class="w-3.5 h-3.5 text-muted-foreground" />
						</div>

						<ClientOnly>
							<div v-if="ticketActivityTotal > 0" class="h-[140px] overflow-hidden">
								<VisXYContainer
									:data="ticketActivityWeekly"
									:height="140"
									:margin="{ top: 6, right: 6, bottom: 20, left: 6 }"
								>
									<VisArea
										:x="(d: any) => d.weekIdx"
										:y="(d: any) => d.opened"
										:color="['rgba(245, 158, 11, 0.18)']"
										:opacity="1"
										:curve-type="CurveType.MonotoneX"
									/>
									<VisLine
										:x="(d: any) => d.weekIdx"
										:y="(d: any) => d.opened"
										:color="['#f59e0b']"
										:curve-type="CurveType.MonotoneX"
									/>
									<VisLine
										:x="(d: any) => d.weekIdx"
										:y="(d: any) => d.closed"
										:color="['#22c55e']"
										:curve-type="CurveType.MonotoneX"
									/>
									<VisAxis
										type="x"
										:tick-format="(i: number) => {
											const idx = Math.round(i);
											return idx >= 0 && idx < ticketActivityWeekly.length
												? ticketActivityWeekly[idx]?.label || ''
												: '';
										}"
										:grid-line="false"
										:num-ticks="4"
									/>
								</VisXYContainer>
							</div>
							<div v-else class="h-[140px] flex items-center justify-center text-[11px] text-muted-foreground">
								No ticket activity yet.
							</div>
						</ClientOnly>

						<div class="flex items-center gap-3 mt-2 text-[11px]">
							<span class="flex items-center gap-1.5 text-muted-foreground">
								<span class="w-2 h-2 rounded-full" style="background: #f59e0b" />
								Opened
							</span>
							<span class="flex items-center gap-1.5 text-muted-foreground">
								<span class="w-2 h-2 rounded-full" style="background: #22c55e" />
								Closed
							</span>
						</div>
					</div>
				</div>

				<!-- Project Timeline (Gantt) -->
				<div class="mb-6">
					<div class="flex items-center justify-between mb-3">
						<h2 class="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
							Project Timeline
						</h2>
						<UiViewLink to="/portal/projects" size="sm">Open full view</UiViewLink>
					</div>
					<ProjectTimelineUnifiedGantt portal :auto-expand-threshold="3" compact />
				</div>

				<!-- Recent Projects + Tickets -->
				<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
					<div class="ios-card p-5">
						<div class="flex items-center justify-between mb-4">
							<h2 class="font-medium flex items-center gap-2">
								<Icon name="lucide:folder-kanban" class="w-4 h-4 text-muted-foreground" />
								Recent Projects
							</h2>
							<NuxtLink to="/portal/projects" class="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide text-primary hover:underline">
								View all
								<Icon name="lucide:chevron-right" class="w-3 h-3" />
							</NuxtLink>
						</div>

						<div v-if="recentProjects.length" class="space-y-2">
							<NuxtLink
								v-for="project in recentProjects"
								:key="project.id"
								:to="`/portal/projects?highlight=${project.id}`"
								class="flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors"
							>
								<span class="text-sm font-medium truncate">{{ project.title }}</span>
								<span
									class="text-xs px-2 py-0.5 rounded-full shrink-0"
									:class="getStatusBadgeClasses(project.status)"
								>
									{{ project.status?.replace('_', ' ') }}
								</span>
							</NuxtLink>
						</div>
						<p v-else class="text-sm text-muted-foreground text-center py-6">
							No active projects yet.
						</p>
					</div>

					<div class="ios-card p-5">
						<div class="flex items-center justify-between mb-4">
							<h2 class="font-medium flex items-center gap-2">
								<Icon name="lucide:ticket" class="w-4 h-4 text-muted-foreground" />
								Recent Tickets
							</h2>
							<NuxtLink to="/portal/tickets" class="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide text-primary hover:underline">
								View all
								<Icon name="lucide:chevron-right" class="w-3 h-3" />
							</NuxtLink>
						</div>

						<div v-if="recentTickets.length" class="space-y-2">
							<NuxtLink
								v-for="ticket in recentTickets"
								:key="ticket.id"
								:to="`/portal/tickets?highlight=${ticket.id}`"
								class="flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors"
							>
								<span class="text-sm font-medium truncate">{{ ticket.title }}</span>
								<div class="flex items-center gap-2 shrink-0">
									<span
										v-if="ticket.priority"
										class="text-xs px-2 py-0.5 rounded-full"
										:class="getPriorityBadgeClasses(ticket.priority)"
									>
										{{ ticket.priority }}
									</span>
									<span
										class="text-xs px-2 py-0.5 rounded-full"
										:class="getStatusBadgeClasses(ticket.status)"
									>
										{{ ticket.status?.replace('_', ' ') }}
									</span>
								</div>
							</NuxtLink>
						</div>
						<p v-else class="text-sm text-muted-foreground text-center py-6">
							No open tickets.
						</p>
					</div>
				</div>
			</template>
		</LayoutPageContainer>
	</div>
</template>
