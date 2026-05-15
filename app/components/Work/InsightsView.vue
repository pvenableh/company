<template>
	<div>
		<!-- Loading -->
		<div v-if="loading && !snapshot" class="flex flex-col items-center justify-center py-24 gap-3">
			<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
			<p class="text-sm text-muted-foreground">Computing insights…</p>
		</div>

		<template v-else-if="snapshot">
			<!-- KPI strip -->
			<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
				<div class="ios-card p-4 flex flex-col gap-2">
					<div class="flex items-center justify-between">
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Active Projects</p>
						<Icon name="lucide:folder-kanban" class="w-3.5 h-3.5 text-muted-foreground" />
					</div>
					<div class="flex items-baseline gap-2">
						<p class="text-2xl font-bold">{{ snapshot.metrics?.activeProjects ?? 0 }}</p>
					</div>
					<p class="text-[11px]" :class="overdueProjects > 0 ? 'text-destructive' : 'text-muted-foreground'">
						{{ overdueProjects }} overdue
					</p>
				</div>

				<div class="ios-card p-4 flex flex-col gap-2">
					<div class="flex items-center justify-between">
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Avg Completion</p>
						<Icon name="lucide:gauge" class="w-3.5 h-3.5 text-muted-foreground" />
					</div>
					<div class="flex items-baseline gap-1">
						<p class="text-2xl font-bold">{{ avgCompletionDays ?? '—' }}</p>
						<span class="text-[10px] text-muted-foreground">days</span>
					</div>
					<p class="text-[11px] text-muted-foreground">across last 6 mo</p>
				</div>

				<div class="ios-card p-4 flex flex-col gap-2">
					<div class="flex items-center justify-between">
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Ticket Resolution</p>
						<Icon name="lucide:ticket" class="w-3.5 h-3.5 text-muted-foreground" />
					</div>
					<div class="flex items-baseline gap-1">
						<p class="text-2xl font-bold">{{ snapshot.metrics?.avgResolutionDays ?? '—' }}</p>
						<span class="text-[10px] text-muted-foreground">days avg</span>
					</div>
					<p class="text-[11px]" :class="overdueTickets > 0 ? 'text-warning' : 'text-muted-foreground'">
						{{ overdueTickets }} overdue · {{ unassignedTickets }} unassigned
					</p>
				</div>

				<div class="ios-card p-4 flex flex-col gap-2">
					<div class="flex items-center justify-between">
						<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Tasks</p>
						<Icon name="lucide:check-square" class="w-3.5 h-3.5 text-muted-foreground" />
					</div>
					<div class="flex items-baseline gap-2">
						<p class="text-2xl font-bold">{{ taskCompletion }}<span class="text-lg">%</span></p>
					</div>
					<p class="text-[11px] text-muted-foreground">{{ tasksCompleted }} done / {{ tasksTotal }} total</p>
				</div>
			</div>

			<!-- Project Status Donut + Ticket Priority -->
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
				<div class="ios-card p-5">
					<div class="flex items-center justify-between mb-3">
						<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Project Status Mix</h3>
						<span class="text-[10px] text-muted-foreground">{{ projectStatusTotal }} total</span>
					</div>
					<div v-if="projectStatusRows.length" class="space-y-2.5">
						<div v-for="row in projectStatusRows" :key="row.status" class="flex items-center gap-3">
							<span class="text-[11px] font-medium w-24 shrink-0 capitalize">{{ row.status }}</span>
							<div class="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
								<div
									class="h-full rounded-full"
									:class="statusColor(row.status)"
									:style="{ width: projectStatusBarWidth(row.count) + '%' }"
								/>
							</div>
							<span class="text-[11px] tabular-nums w-10 text-right">{{ row.count }}</span>
						</div>
					</div>
					<div v-else class="py-8 text-center text-[11px] text-muted-foreground">
						No project data yet.
					</div>
				</div>

				<div class="ios-card p-5">
					<div class="flex items-center justify-between mb-3">
						<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Ticket Priority Mix</h3>
						<span class="text-[10px] text-muted-foreground">last 30 days</span>
					</div>
					<div v-if="ticketPriorityRows.length" class="space-y-2.5">
						<div v-for="row in ticketPriorityRows" :key="row.priority" class="flex items-center gap-3">
							<span class="text-[11px] font-medium w-24 shrink-0 capitalize">{{ row.priority }}</span>
							<div class="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
								<div
									class="h-full rounded-full"
									:class="priorityColor(row.priority)"
									:style="{ width: ticketPriorityBarWidth(row.count) + '%' }"
								/>
							</div>
							<span class="text-[11px] tabular-nums w-10 text-right">{{ row.count }}</span>
						</div>
					</div>
					<div v-else class="py-8 text-center text-[11px] text-muted-foreground">
						No tickets in the last 30 days.
					</div>
				</div>
			</div>

			<!-- Needs Attention -->
			<div v-if="needsAttention.length" class="ios-card p-5">
				<h3 class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
					Needs Attention
					<span class="text-warning ml-1">({{ needsAttention.length }})</span>
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
								:class="item.urgency === 'high' ? 'bg-destructive' : 'bg-warning'"
							/>
							<div class="min-w-0">
								<p class="text-sm font-medium truncate">{{ item.title }}</p>
								<p class="text-[11px] text-muted-foreground">{{ item.reason }}</p>
							</div>
						</div>
						<span class="text-xs font-medium text-primary shrink-0 ml-3">{{ item.action }}</span>
					</NuxtLink>
				</div>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{
	snapshot: any;
	loading: boolean;
}>();

const overdueProjects = computed(() => props.snapshot?.metrics?.overdueProjects ?? 0);
const overdueTickets = computed(() => props.snapshot?.metrics?.overdueTickets ?? 0);
const unassignedTickets = computed(() => props.snapshot?.metrics?.unassignedTickets ?? 0);
const avgCompletionDays = computed(() => props.snapshot?.metrics?.avgCompletionDays ?? null);

const tasksTotal = computed(() => props.snapshot?.metrics?.tasksTotal ?? 0);
const tasksCompleted = computed(() => props.snapshot?.metrics?.tasksCompleted ?? 0);
const taskCompletion = computed(() => {
	const t = tasksTotal.value;
	const c = tasksCompleted.value;
	return t > 0 ? Math.round((c / t) * 100) : 0;
});

const projectStatusRows = computed<Array<{ status: string; count: number }>>(() => {
	const byStatus = props.snapshot?.metrics?.projectsByStatus || {};
	return Object.entries(byStatus)
		.map(([status, count]) => ({ status, count: Number(count) }))
		.sort((a, b) => b.count - a.count);
});
const projectStatusTotal = computed(() => projectStatusRows.value.reduce((s, r) => s + r.count, 0));
const maxProjectStatusCount = computed(() => Math.max(1, ...projectStatusRows.value.map((r) => r.count)));
function projectStatusBarWidth(n: number): number {
	return Math.max(4, (n / maxProjectStatusCount.value) * 100);
}
function statusColor(status: string): string {
	if (status === 'overdue') return 'bg-destructive/70';
	if (status === 'completed') return 'bg-success/70';
	return 'bg-primary/70';
}

const ticketPriorityRows = computed<Array<{ priority: string; count: number }>>(() => {
	const byPriority = props.snapshot?.metrics?.ticketsByPriority || {};
	return Object.entries(byPriority)
		.map(([priority, count]) => ({ priority, count: Number(count) }))
		.sort((a, b) => b.count - a.count);
});
const maxTicketPriorityCount = computed(() => Math.max(1, ...ticketPriorityRows.value.map((r) => r.count)));
function ticketPriorityBarWidth(n: number): number {
	return Math.max(4, (n / maxTicketPriorityCount.value) * 100);
}
function priorityColor(priority: string): string {
	if (priority === 'overdue' || priority === 'urgent') return 'bg-destructive/70';
	if (priority === 'unassigned' || priority === 'high') return 'bg-warning/70';
	return 'bg-primary/70';
}

const needsAttention = computed<Array<{ id: string; title: string; reason: string; urgency: 'high' | 'medium'; route: string; action: string }>>(() => {
	const items: Array<{ id: string; title: string; reason: string; urgency: 'high' | 'medium'; route: string; action: string }> = [];
	for (const t of (props.snapshot?.overdueTickets || []).slice(0, 5)) {
		items.push({
			id: `t-${t.title}`,
			title: t.title,
			reason: `Overdue · ${t.client || 'no client'} · ${t.priority}`,
			urgency: t.priority === 'urgent' || t.priority === 'high' ? 'high' : 'medium',
			route: '/tickets',
			action: 'Resolve',
		});
	}
	for (const p of (props.snapshot?.overdueProjects || []).slice(0, 5)) {
		items.push({
			id: `p-${p.title}`,
			title: p.title,
			reason: `Project past due · ${p.client || 'no client'}`,
			urgency: 'high',
			route: '/projects',
			action: 'Review',
		});
	}
	return items.slice(0, 8);
});
</script>
