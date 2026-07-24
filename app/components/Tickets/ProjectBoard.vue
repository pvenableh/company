<!--
  TicketsProjectBoard — project-scoped tickets kanban that mirrors the Tasks
  board (Tasks/Board.vue): identical column chrome, drag-to-change-status,
  quick-add per column, and entity-bus realtime (subscribeToCollection).

  Why not the global <TicketsBoard>? That one carries the cross-project floor
  filter state (assigned-to / due-date / client / team scope) + a Directus
  WebSocket subscription + fixed-width overflow columns. Inside a single
  project those global filters leak in and hide the project's tickets, and
  the fixed columns overflow the narrow slide-over. This board shows ALL of
  the project's tickets, fit to the container, and repaints from the entity
  bus the moment the ticket slide-over saves a change.
-->
<template>
	<div class="ticket-board">
		<!-- Header: completed / total + progress bar (mirrors the tasks board). -->
		<div class="flex items-center justify-between mb-4">
			<div class="flex items-center gap-3">
				<span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
					{{ completedCount }}/{{ allCount }} completed
				</span>
				<div v-if="allCount" class="w-24 h-1.5 bg-muted/30 rounded-full overflow-hidden">
					<div
						class="h-full rounded-full transition-all duration-500"
						:class="progressPercent > 75 ? 'bg-success' : progressPercent > 25 ? 'bg-warning' : 'bg-primary'"
						:style="{ width: `${progressPercent}%` }"
					/>
				</div>
			</div>
		</div>

		<!-- Loading -->
		<div v-if="loading" class="grid grid-cols-2 gap-4">
			<div v-for="n in 4" :key="n" class="space-y-2">
				<div class="h-6 bg-muted/40 rounded animate-pulse w-20" />
				<div class="h-20 bg-muted/20 rounded-xl animate-pulse" />
			</div>
		</div>

		<!-- Board columns — one horizontal row of all statuses, scrolling
		     sideways when the host is too narrow to show them all (a true
		     kanban; tickets have more statuses than tasks). -->
		<div v-else class="flex gap-0 overflow-x-auto -mx-1 px-1 scrollbar-hide">
			<div v-for="col in columns" :key="col.key" class="flex flex-col shrink-0 w-[15rem] ticket-board__col">
				<!-- Column header -->
				<div class="ticket-board__col-header">
					<div class="flex items-center gap-2 flex-1">
						<span class="h-5 w-1 rounded-full" :class="col.dotColor" />
						<span class="text-xs font-semibold uppercase tracking-wider text-foreground/70">{{ col.label }}</span>
					</div>
					<span
						class="text-[10px] font-bold tabular-nums min-w-[20px] h-5 flex items-center justify-center rounded-full px-1.5"
						:class="col.badgeClass"
					>
						{{ columnTickets[col.key].length }}
					</span>
				</div>

				<!-- Ticket cards -->
				<div class="ticket-board__col-content">
					<VueDraggable
						v-model="columnTickets[col.key]"
						item-key="id"
						:group="{ name: 'tickets' }"
						ghost-class="ghost"
						chosen-class="chosen"
						drag-class="drag"
						:animation="200"
						class="min-h-[120px]"
						:class="{ 'is-dragging': isDragging }"
						@start="isDragging = true"
						@end="isDragging = false"
						@change="(evt) => handleColumnChange(col.key, evt)"
					>
						<template #item="{ element: ticket }">
							<div class="ticket-wrapper">
								<TicketsProjectCard
									:ticket="ticket"
									@select="openTicketSlideOver(ticket, $event)"
								/>
							</div>
						</template>
					</VueDraggable>

					<!-- Quick add -->
					<div class="flex items-center gap-1.5 mt-2 h-8 rounded-lg border border-dashed border-border px-2 focus-within:border-primary/50 focus-within:bg-primary/5 transition-colors">
						<Icon name="lucide:plus" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
						<input
							v-model="newTitles[col.key]"
							type="text"
							placeholder="Add ticket"
							class="flex-1 min-w-0 bg-transparent text-[11px] placeholder:text-muted-foreground/60 focus:outline-none"
							@keydown.enter="quickAdd(col.key)"
						/>
						<button
							v-if="newTitles[col.key]?.trim()"
							class="shrink-0 text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors"
							@click="quickAdd(col.key)"
						>
							Add
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import VueDraggable from 'vuedraggable';
import { subscribeToCollection } from '~/composables/useEntityStore';

const props = defineProps<{
	projectId: string;
	organizationId?: string;
	/** Narrow slide-over host → 2-up columns instead of 4-up. */
	compact?: boolean;
}>();

const emit = defineEmits<{ statsChanged: [] }>();

const ticketItems = useDirectusItems('tickets');
const commentItems = useDirectusItems('comments');
const ticketSlide = useAppSlideOver('ticket');

function openTicketSlideOver(ticket: any, ev?: MouseEvent) {
	const flipFrom = flipPayloadFrom(ev?.currentTarget as HTMLElement | null | undefined);
	ticketSlide.open(String(ticket.id), { flipFrom });
}

// Columns mirror TICKET_BOARD_COLUMNS (status is the key) with the tasks
// board's chrome (accent dot + tinted count badge).
type Col = { key: string; label: string; dotColor: string; badgeClass: string };
const columns: Col[] = [
	{ key: 'Pending', label: 'Pending', dotColor: 'bg-blue-500', badgeClass: 'bg-blue-500/15 text-blue-600' },
	{ key: 'Scheduled', label: 'Scheduled', dotColor: 'bg-sky-500', badgeClass: 'bg-sky-500/15 text-sky-600' },
	{ key: 'In Progress', label: 'In Progress', dotColor: 'bg-warning', badgeClass: 'bg-warning/15 text-warning' },
	{ key: 'Completed', label: 'Completed', dotColor: 'bg-success', badgeClass: 'bg-success/15 text-success' },
];
const COLUMN_KEYS = columns.map((c) => c.key);

const allTickets = ref<any[]>([]);
const loading = ref(true);
const isDragging = ref(false);
const newTitles = reactive<Record<string, string>>({ Pending: '', Scheduled: '', 'In Progress': '', Completed: '' });
const columnTickets = reactive<Record<string, any[]>>({ Pending: [], Scheduled: [], 'In Progress': [], Completed: [] });

const completedCount = computed(() => columnTickets['Completed'].length);
const allCount = computed(() => COLUMN_KEYS.reduce((n, k) => n + columnTickets[k].length, 0));
const progressPercent = computed(() => (allCount.value ? Math.round((completedCount.value / allCount.value) * 100) : 0));

function distribute() {
	const buckets: Record<string, any[]> = { Pending: [], Scheduled: [], 'In Progress': [], Completed: [] };
	for (const t of allTickets.value) {
		// Unknown/legacy statuses land in Pending so nothing silently vanishes.
		const key = COLUMN_KEYS.includes(t.status) ? t.status : 'Pending';
		buckets[key].push(t);
	}
	for (const k of COLUMN_KEYS) columnTickets[k] = buckets[k];
}

// Batch comment counts (one grouped aggregate) so each card can show how much
// discussion a ticket carries — mirrors the old board's attachCommentCounts.
async function attachCommentCounts(rows: any[]) {
	const ids = rows.map((r) => r.id).filter(Boolean);
	if (!ids.length) return;
	try {
		const counts = await commentItems.list({
			filter: { collection: { _eq: 'tickets' }, item: { _in: ids } },
			fields: ['item'],
			aggregate: { count: ['*'] },
			groupBy: ['item'],
		});
		const map: Record<string, number> = {};
		if (Array.isArray(counts)) {
			for (const c of counts as any[]) {
				if (c?.item) map[c.item] = parseInt(c.count, 10) || 0;
			}
		}
		for (const r of rows) r.commentsCount = map[r.id] || 0;
	} catch (err) {
		// Comments read perms can be absent — degrade to no count, never block.
		for (const r of rows) r.commentsCount = 0;
	}
}

async function fetchTickets() {
	loading.value = true;
	try {
		const data = await ticketItems.list({
			fields: [
				'id', 'title', 'status', 'priority', 'due_date', 'date_updated',
				'project',
				'tasks.id', 'tasks.status',
				'assigned_to.directus_users_id.id',
				'assigned_to.directus_users_id.first_name',
				'assigned_to.directus_users_id.last_name',
				'assigned_to.directus_users_id.avatar',
			],
			// Project scope only — no global floor filters. Exclude archived so
			// they don't fall into Pending via the distribute() fallback.
			filter: { _and: [{ status: { _neq: 'Archived' } }, { project: { _eq: props.projectId } }] },
			sort: ['-date_updated'],
			limit: -1,
		});
		const rows = (data || []) as any[];
		await attachCommentCounts(rows);
		allTickets.value = rows;
		distribute();
	} catch (err) {
		console.error('Failed to load project tickets:', err);
		allTickets.value = [];
		distribute();
	} finally {
		loading.value = false;
	}
}

async function quickAdd(status: string) {
	const title = newTitles[status]?.trim();
	if (!title) return;
	try {
		const created = await ticketItems.create({
			title,
			status,
			project: props.projectId,
			organization: props.organizationId,
			priority: 'medium',
		});
		if (created) {
			allTickets.value.push(created);
			columnTickets[status].push(created);
		}
		newTitles[status] = '';
		emit('statsChanged');
	} catch (err) {
		console.error('Failed to create ticket:', err);
	}
}

async function handleColumnChange(columnKey: string, evt: any) {
	if (!evt.added) return;
	const ticket = evt.added.element;
	const oldStatus = ticket.status;
	ticket.status = columnKey;
	try {
		await ticketItems.update(ticket.id, { status: columnKey });
		emit('statsChanged');
	} catch (err) {
		console.error('Failed to update ticket status:', err);
		ticket.status = oldStatus;
		await fetchTickets();
	}
}

onMounted(fetchTickets);
watch(() => props.projectId, fetchTickets);

// Slide-over edits/status changes notify the entity bus → repaint live,
// matching the tasks board's realtime feel (no Directus WS subscription).
const unsubscribe = subscribeToCollection('tickets', () => {
	fetchTickets().then(() => emit('statsChanged'));
});
onBeforeUnmount(() => unsubscribe());
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.ticket-board__col {
	@apply border-r border-border/50;
}
.ticket-board__col:last-child {
	@apply border-r-0;
}

.ticket-board__col-header {
	@apply flex items-center gap-2 py-4 px-4 border-b border-border sticky top-0 z-10;
	background: rgba(255, 255, 255, 0.78);
	-webkit-backdrop-filter: saturate(180%) blur(20px);
	backdrop-filter: saturate(180%) blur(20px);
}
:is(.dark) .ticket-board__col-header {
	background: rgba(20, 20, 20, 0.78);
}

.ticket-board__col-content {
	@apply py-3 px-3 bg-muted/20 dark:bg-card/30 min-h-[200px];
}

.ticket-wrapper {
	@apply mb-2;
	transition: all 0.3s ease;
}

.ghost { opacity: 0.5; background: #f0f0f0; }
.chosen { box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1); }
.drag { opacity: 0.9; box-shadow: 0 15px 25px rgba(0, 0, 0, 0.15); }
.is-dragging { transition: all 0.3s ease; }
</style>
