<!--
  ActiveProjectCarousel — command-center widget.

  Horizontally scrollable strip of in-flight projects sorted by recency
  of update. Status enum from the projects collection is capitalized
  ('Pending' | 'Scheduled' | 'In Progress' | 'Completed' | 'On Hold');
  we show the three "moving" states.

  Card click opens the ProjectDetailPanel slide-over in apps mode, or
  navigates to /apps/work/projects/[id] in classic mode.
-->
<script setup lang="ts">
const { selectedOrg } = useOrganization();
const { selectedClient } = useClients();
const { isAppsMode } = useAppsMode();
const projectSlide = useAppSlideOver('work-project');
const router = useRouter();
const items = useDirectusItems('projects');

const projects = ref<any[]>([]);
const loading = ref(true);

const ACTIVE_STATUSES = ['Pending', 'Scheduled', 'In Progress'];

async function load() {
	if (!selectedOrg.value) {
		projects.value = [];
		loading.value = false;
		return;
	}
	loading.value = true;
	try {
		const filter: any = {
			_and: [
				{ organization: { _eq: selectedOrg.value } },
				{ status: { _in: ACTIVE_STATUSES } },
			],
		};
		if (selectedClient.value === 'org') {
			filter._and.push({ client: { _null: true } });
		} else if (selectedClient.value) {
			filter._and.push({ client: { _eq: selectedClient.value } });
		}
		projects.value = await items.list({
			fields: [
				'id', 'title', 'status', 'date_updated', 'due_date',
				'service.color',
				'client.id', 'client.name',
			],
			filter,
			sort: ['-date_updated'],
			limit: 12,
		}) as any[];
	} catch (err) {
		console.error('[ActiveProjectCarousel] load failed:', err);
		projects.value = [];
	} finally {
		loading.value = false;
	}
}

watch([selectedOrg, selectedClient], load, { immediate: true });

function openProject(id: string) {
	if (isAppsMode.value) {
		projectSlide.open(id);
	} else {
		router.push(`/apps/work/projects/${id}`);
	}
}

function statusChip(s: string | null | undefined) {
	switch (s) {
		case 'In Progress': return 'bg-sky-500/15 text-sky-600 dark:text-sky-400';
		case 'Scheduled':   return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
		case 'Pending':     return 'bg-muted text-muted-foreground';
		case 'On Hold':     return 'bg-rose-500/15 text-rose-600 dark:text-rose-400';
		default:            return 'bg-muted text-muted-foreground';
	}
}

function fmtDue(d: string | null | undefined) {
	if (!d) return null;
	try {
		const date = new Date(d);
		const today = new Date();
		const diffDays = Math.round((date.getTime() - today.getTime()) / 86400000);
		if (diffDays < 0) return `Overdue ${Math.abs(diffDays)}d`;
		if (diffDays === 0) return 'Due today';
		if (diffDays < 14) return `Due ${diffDays}d`;
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	} catch { return null; }
}
</script>

<template>
	<div class="ios-card p-5">
		<!-- Header -->
		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<UIcon name="i-heroicons-folder-open" class="w-5 h-5 text-primary" />
				<h3 class="text-sm font-semibold uppercase tracking-wider text-foreground/70">Active Projects</h3>
			</div>
			<NuxtLink
				to="/apps/work"
				class="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
			>
				All projects →
			</NuxtLink>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="flex gap-3 overflow-hidden">
			<div v-for="i in 4" :key="i" class="shrink-0 w-52 h-28 rounded-xl bg-muted animate-pulse" />
		</div>

		<!-- Empty -->
		<div v-else-if="!projects.length" class="flex items-center gap-3 py-1">
			<div class="w-8 h-8 rounded-full bg-muted/40 flex items-center justify-center flex-shrink-0">
				<UIcon name="i-heroicons-folder-open" class="w-4 h-4 text-muted-foreground/60" />
			</div>
			<div>
				<p class="text-sm text-foreground/80 font-medium">No active projects</p>
				<p class="text-[11px] text-muted-foreground mt-0.5">Start one and it shows up here.</p>
			</div>
		</div>

		<!-- Carousel -->
		<div v-else class="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
			<button
				v-for="project in projects"
				:key="project.id"
				type="button"
				class="shrink-0 w-52 rounded-xl border border-border bg-background hover:bg-muted/40 transition-colors p-3 text-left group"
				@click="openProject(project.id)"
			>
				<div class="flex items-start gap-2 mb-2">
					<span
						class="w-2 h-2 rounded-full mt-1.5 shrink-0"
						:style="{ backgroundColor: project.service?.color || 'var(--primary)' }"
					/>
					<p class="text-sm font-medium text-foreground line-clamp-2 leading-snug flex-1">
						{{ project.title }}
					</p>
				</div>
				<p v-if="project.client?.name" class="text-[11px] text-muted-foreground truncate mb-2">
					{{ project.client.name }}
				</p>
				<div class="flex items-center justify-between gap-1">
					<span
						class="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
						:class="statusChip(project.status)"
					>
						{{ project.status }}
					</span>
					<span v-if="fmtDue(project.due_date)" class="text-[10px] text-muted-foreground shrink-0">
						{{ fmtDue(project.due_date) }}
					</span>
				</div>
			</button>
		</div>
	</div>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar { height: 4px; }
.scrollbar-thin::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
</style>
