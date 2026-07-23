<!--
  Per-project timeline: a single chronological stream that merges the project's
  events / milestones, tickets, and tasks by their most relevant date (event/due
  date, falling back to creation). This is the "what's the shape of this project
  over time" view, distinct from ActivityTimeline (which is the audit-style feed
  of who-changed-what). Rendered as the default sub-tab of the overview pulse.
-->
<script setup lang="ts">
import { notifyEntityChange } from '~/composables/useEntityStore';

const props = withDefaults(defineProps<{ projectId: string; hideHeader?: boolean }>(), { hideHeader: false });

const eventItems = useDirectusItems('project_events');
const ticketItems = useDirectusItems('tickets');
const taskItems = useDirectusItems('tasks');

type TimelineKind = 'milestone' | 'event' | 'ticket' | 'task';
interface FeedItem {
	id: string;
	rawId: string;
	kind: TimelineKind;
	title: string;
	status?: string | null;
	when: string | null;
	upcoming: boolean;
}

// Tickets and tasks open in their slide-over straight from the timeline.
const ticketSlide = useAppSlideOver('ticket');
const taskSlide = useAppSlideOver('task');
function canOpen(item: FeedItem) {
	return item.kind === 'ticket' || item.kind === 'task';
}
function open(item: FeedItem) {
	if (item.kind === 'ticket') ticketSlide.open(item.rawId);
	else if (item.kind === 'task') taskSlide.open(item.rawId);
}

// Tasks can be completed straight from the timeline via their leading checkbox.
function isTaskDone(item: FeedItem) {
	return item.status === 'completed';
}
async function toggleTaskComplete(item: FeedItem) {
	if (item.kind !== 'task') return;
	const done = !isTaskDone(item);
	const prev = item.status;
	item.status = done ? 'completed' : 'new'; // optimistic
	try {
		await taskItems.update(item.rawId, {
			status: done ? 'completed' : 'new',
			date_completed: done ? new Date().toISOString() : null,
		});
		notifyEntityChange('tasks', { id: item.rawId, op: 'update' });
	} catch {
		item.status = prev; // rollback
	}
}

const items = ref<FeedItem[]>([]);
const loading = ref(true);

const KIND_META: Record<TimelineKind, { icon: string; label: string; chip: string; dot: string }> = {
	milestone: { icon: 'lucide:flag', label: 'Milestone', chip: 'text-info bg-info/10', dot: 'bg-info' },
	event: { icon: 'lucide:calendar-days', label: 'Event', chip: 'text-primary bg-primary/10', dot: 'bg-primary' },
	ticket: { icon: 'lucide:ticket', label: 'Ticket', chip: 'text-warning bg-warning/10', dot: 'bg-warning' },
	task: { icon: 'lucide:check-circle-2', label: 'Task', chip: 'text-purple-500 bg-purple-500/10', dot: 'bg-purple-500' },
};

function firstDate(...vals: Array<string | null | undefined>): string | null {
	for (const v of vals) if (v) return v;
	return null;
}

const load = async () => {
	loading.value = true;
	try {
		const [events, tickets, tasks] = await Promise.all([
			eventItems.list({
				fields: ['id', 'title', 'status', 'date', 'event_date', 'end_date', 'is_milestone', 'date_created'],
				filter: { project: { _eq: props.projectId } },
				limit: 100,
			}).catch(() => []),
			ticketItems.list({
				fields: ['id', 'title', 'status', 'priority', 'due_date', 'date_created'],
				filter: { project: { _eq: props.projectId } },
				limit: 100,
			}).catch(() => []),
			taskItems.list({
				fields: ['id', 'title', 'status', 'due_date', 'date_created'],
				filter: { project_id: { _eq: props.projectId } },
				limit: 100,
			}).catch(() => []),
		]);

		const now = Date.now();
		const merged: FeedItem[] = [
			...(events || []).map((e: any): FeedItem => {
				const when = firstDate(e.event_date, e.date, e.end_date, e.date_created);
				return {
					id: `event-${e.id}`,
					rawId: String(e.id),
					kind: e.is_milestone ? 'milestone' : 'event',
					title: e.title || (e.is_milestone ? 'Milestone' : 'Event'),
					status: e.status,
					when,
					upcoming: !!when && new Date(when).getTime() > now,
				};
			}),
			...(tickets || []).map((t: any): FeedItem => {
				const when = firstDate(t.due_date, t.date_created);
				return {
					id: `ticket-${t.id}`,
					rawId: String(t.id),
					kind: 'ticket',
					title: t.title || 'Ticket',
					status: t.status,
					when,
					upcoming: !!t.due_date && new Date(t.due_date).getTime() > now,
				};
			}),
			...(tasks || []).map((t: any): FeedItem => {
				const when = firstDate(t.due_date, t.date_created);
				return {
					id: `task-${t.id}`,
					rawId: String(t.id),
					kind: 'task',
					title: t.title || 'Task',
					status: t.status,
					when,
					upcoming: !!t.due_date && new Date(t.due_date).getTime() > now,
				};
			}),
		];

		// Newest / soonest first — surfaces what's next and what just happened.
		merged.sort((a, b) => {
			const ta = a.when ? new Date(a.when).getTime() : 0;
			const tb = b.when ? new Date(b.when).getTime() : 0;
			return tb - ta;
		});
		items.value = merged.slice(0, 60);
	} catch (err) {
		console.error('ProjectTimelineFeed: failed to load', err);
	} finally {
		loading.value = false;
	}
};

onMounted(load);
watch(() => props.projectId, load);

const formatWhen = (ts: string | null) => {
	if (!ts) return '';
	const date = new Date(ts);
	if (Number.isNaN(date.getTime())) return '';
	const diff = Date.now() - date.getTime();
	const abs = Math.abs(diff);
	const days = Math.floor(abs / 86400000);
	if (days < 1 && diff >= 0) {
		const hours = Math.floor(abs / 3600000);
		if (hours < 1) return 'Just now';
		return `${hours}h ago`;
	}
	if (diff < 0 && days < 30) return days < 1 ? 'Today' : `in ${days}d`;
	if (days < 7) return `${days}d ago`;
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
</script>

<template>
	<div>
		<div v-if="!hideHeader" class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-2">
				<Icon name="lucide:git-commit-horizontal" class="w-5 h-5 text-primary" />
				<h3 class="text-sm font-semibold uppercase tracking-wide text-foreground/70">Timeline</h3>
			</div>
			<button :disabled="loading" class="text-xs text-primary hover:underline disabled:opacity-50" @click="load">
				Refresh
			</button>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="space-y-3">
			<div v-for="n in 5" :key="n" class="flex items-start gap-3">
				<div class="w-8 h-8 rounded-full bg-muted animate-pulse flex-shrink-0" />
				<div class="flex-1 space-y-1">
					<div class="h-3 w-40 bg-muted rounded animate-pulse" />
					<div class="h-2 w-24 bg-muted rounded animate-pulse" />
				</div>
			</div>
		</div>

		<!-- Empty -->
		<div v-else-if="!items.length" class="text-center py-12">
			<Icon name="lucide:git-commit-horizontal" class="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">No events, tickets, or tasks yet</p>
		</div>

		<!-- Timeline -->
		<div v-else class="relative">
			<div class="absolute left-4 top-0 bottom-0 w-px bg-border" />
			<div
				v-for="item in items"
				:key="item.id"
				class="group relative flex items-start gap-4 pb-6"
				:class="canOpen(item) ? 'cursor-pointer' : ''"
				:role="canOpen(item) ? 'button' : undefined"
				:tabindex="canOpen(item) ? 0 : undefined"
				@click="canOpen(item) && open(item)"
				@keydown.enter="canOpen(item) && open(item)"
			>
				<div class="relative z-10 flex-shrink-0">
					<!-- Tasks: interactive complete toggle. Everything else: kind icon. -->
					<button
						v-if="item.kind === 'task'"
						type="button"
						class="w-8 h-8 rounded-full flex items-center justify-center ring-2 ring-background transition-colors"
						:class="isTaskDone(item) ? 'bg-success text-white' : 'bg-background border-2 border-border text-transparent hover:border-success hover:text-success/40'"
						:title="isTaskDone(item) ? 'Mark as not done' : 'Mark complete'"
						:aria-pressed="isTaskDone(item) ? 'true' : 'false'"
						@click.stop="toggleTaskComplete(item)"
						@keydown.enter.stop="toggleTaskComplete(item)"
					>
						<Icon name="lucide:check" class="w-4 h-4" />
					</button>
					<div
						v-else
						class="w-8 h-8 rounded-full flex items-center justify-center ring-2 ring-background"
						:class="KIND_META[item.kind].chip"
					>
						<Icon :name="KIND_META[item.kind].icon" class="w-4 h-4" />
					</div>
				</div>
				<div class="flex-1 min-w-0 pt-0.5">
					<div class="flex items-center gap-2 flex-wrap">
						<span
							class="text-sm font-medium truncate"
							:class="[
								canOpen(item) ? 'group-hover:text-primary transition-colors' : '',
								item.kind === 'task' && isTaskDone(item) ? 'line-through text-muted-foreground' : 'text-foreground',
							]"
						>{{ item.title }}</span>
						<span v-if="item.upcoming" class="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full text-success bg-success/10">
							Upcoming
						</span>
						<Icon
							v-if="canOpen(item)"
							name="lucide:arrow-up-right"
							class="w-3.5 h-3.5 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
						/>
					</div>
					<div class="flex items-center gap-2 mt-1">
						<span
							class="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full"
							:class="KIND_META[item.kind].chip"
						>
							<Icon :name="KIND_META[item.kind].icon" class="w-3 h-3" />
							{{ KIND_META[item.kind].label }}
						</span>
						<span v-if="item.status" class="text-[10px] text-muted-foreground capitalize">{{ String(item.status).replace(/_/g, ' ') }}</span>
						<span class="text-[10px] text-muted-foreground ml-auto">{{ formatWhen(item.when) }}</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>
