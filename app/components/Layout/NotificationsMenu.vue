<template>
	<div>
		<!-- Notification Bell with Popover -->
		<Popover v-model:open="isPopoverOpen">
			<PopoverTrigger as-child>
				<button
					class="notif-bell"
					:class="{ 'notif-bell--has-unread': unreadCount > 0 }"
					:disabled="!user"
					:aria-label="unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'"
				>
					<component :is="unreadCount ? BellRing : Bell" class="size-4" />
					<span
						v-if="unreadCount > 0"
						class="notif-bell__badge"
						:aria-hidden="true"
					>
						{{ unreadCount > 99 ? '99+' : unreadCount }}
					</span>
				</button>
			</PopoverTrigger>

			<PopoverContent
				align="end"
				:side-offset="10"
				class="notif-pop w-[400px] max-w-[calc(100vw-1.5rem)] p-0 overflow-hidden"
			>
				<!-- Header — apps-shell chrome language: tiny uppercase eyebrow + count -->
				<div class="notif-pop__header">
					<div class="min-w-0">
						<p class="notif-pop__eyebrow">Notifications</p>
						<p class="notif-pop__count">
							<span v-if="unreadCount > 0">{{ unreadCount }} unread</span>
							<span v-else class="text-muted-foreground font-normal">All caught up</span>
						</p>
					</div>
					<div class="notif-pop__head-actions">
						<button
							v-if="unreadCount > 0"
							class="notif-pop__icon-btn"
							:disabled="isMarkingAll"
							aria-label="Mark all read"
							title="Mark all read"
							@click="handleMarkAllAsRead"
						>
							<Check class="size-3.5" />
						</button>
						<button
							class="notif-pop__icon-btn"
							aria-label="Open full notifications"
							title="View all"
							@click="openSheet"
						>
							<Icon name="lucide:arrow-up-right" class="size-3.5" />
						</button>
					</div>
				</div>

				<!-- Category quick-filter — segmented strip matching AppFloorStrip -->
				<div v-if="popoverFilters.length > 1" class="notif-pop__filter-row">
					<div class="notif-pop__filter-scroll">
						<button
							v-for="f in popoverFilters"
							:key="f.value"
							type="button"
							class="notif-pop__chip"
							:class="{ 'notif-pop__chip--active': popoverTypeFilter === f.value }"
							@click="popoverTypeFilter = f.value"
						>
							<span
								v-if="f.dot"
								class="notif-pop__chip-dot"
								:class="f.dot"
							/>
							<span>{{ f.label }}</span>
							<span v-if="f.count" class="notif-pop__chip-count">{{ f.count }}</span>
						</button>
					</div>
				</div>

				<!-- List -->
				<div class="notif-pop__list">
					<template v-if="popoverNotifications.length">
						<LayoutNotificationItem
							v-for="notification in popoverNotifications"
							:key="notification.id"
							:notification="notification"
							:loading="loadingNotifications.has(notification.id)"
							@mark-read="handleMarkAsRead"
							@navigate="viewNotification"
							compact
						/>
					</template>

					<div v-else-if="isLoading" class="notif-pop__empty">
						<Loader2 class="size-4 animate-spin mb-1.5 text-muted-foreground" />
						<p class="text-xs text-muted-foreground">Loading notifications…</p>
					</div>

					<div v-else class="notif-pop__empty">
						<div class="notif-pop__empty-icon">
							<BellOff class="size-5 text-muted-foreground/60" />
						</div>
						<p class="text-xs text-muted-foreground">
							{{ popoverTypeFilter === 'all' ? 'No new notifications' : 'Nothing here right now' }}
						</p>
					</div>
				</div>

				<!-- Footer — single CTA -->
				<div class="notif-pop__footer">
					<button
						class="notif-pop__view-all"
						@click="openSheet"
					>
						<span>View all & settings</span>
						<Icon name="lucide:chevron-right" class="size-3" />
					</button>
				</div>
			</PopoverContent>
		</Popover>

		<!-- Full Notifications Sheet -->
		<Sheet v-model:open="isSheetOpen">
			<SheetContent side="right" class="sm:max-w-lg p-0 flex flex-col" :show-close-button="false">
				<!-- Sheet Header -->
				<SheetHeader class="px-6 py-4 border-b dark:border-gray-700 space-y-0">
					<div class="flex items-center justify-between">
						<SheetTitle class="text-lg">Notifications</SheetTitle>
						<SheetClose as-child>
							<Button variant="ghost" size="icon-sm">
								<X class="size-4" />
							</Button>
						</SheetClose>
					</div>
					<SheetDescription>
						{{ unreadCount }} unread notification{{ unreadCount !== 1 ? 's' : '' }}
					</SheetDescription>
				</SheetHeader>

				<!-- Actions and Filters -->
				<div class="px-6 py-3 bg-muted/50 border-b dark:border-gray-700">
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div class="flex items-center space-x-2">
							<Button
								v-if="unreadCount > 0"
								size="sm"
								class="bg-[var(--cyan)] hover:bg-[var(--cyan)]/90 text-white"
								:disabled="isMarkingAll"
								@click="handleMarkAllAsRead"
							>
								Mark All as Read
							</Button>

							<Select v-model="statusFilter">
								<SelectTrigger class="w-28 h-8">
									<SelectValue placeholder="Filter" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="inbox">Unread</SelectItem>
									<SelectItem value="archived">Read</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<Button
							variant="outline"
							size="sm"
							@click="showSettings = !showSettings"
						>
							<Settings class="size-3.5 mr-1" />
							Settings
						</Button>
					</div>

					<!-- Type filter chips -->
					<div class="flex flex-wrap gap-1.5 mt-2">
						<button
							v-for="tf in typeFilters"
							:key="tf.value"
							class="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
							:class="typeFilter === tf.value
								? 'bg-primary text-primary-foreground'
								: 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'"
							@click="typeFilter = tf.value"
						>
							{{ tf.label }}
						</button>
					</div>
				</div>

				<!-- Settings Panel -->
				<div v-if="showSettings" class="mx-4 my-3 border rounded-lg">
					<div class="flex items-center justify-between p-4 pb-2">
						<h3 class="text-sm font-medium">Notification Settings</h3>
						<Button variant="ghost" size="icon-sm" class="size-6" @click="showSettings = false">
							<X class="size-3" />
						</Button>
					</div>

					<div class="space-y-4 p-4 pt-2">
						<div class="flex items-center justify-between">
							<div>
								<div class="font-medium text-sm">Sound Alerts</div>
								<div class="text-xs text-muted-foreground">Play sound when new notifications arrive</div>
							</div>
							<Switch :model-value="preferences.soundEnabled" @update:model-value="preferences.soundEnabled = $event" />
						</div>

						<div class="flex items-center justify-between">
							<div>
								<div class="font-medium text-sm">Email Notifications</div>
								<div class="text-xs text-muted-foreground">Master switch — turn off to silence all email</div>
							</div>
							<Switch :model-value="preferences.emailEnabled" @update:model-value="preferences.emailEnabled = $event" />
						</div>

						<div class="pl-4 space-y-3 border-l-2 border-muted">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In-app + email</div>
							<div
								v-for="opt in emailableCategoryOptions"
								:key="opt.key"
								class="flex items-center justify-between"
							>
								<div>
									<div class="font-medium text-sm">{{ opt.label }}</div>
									<div class="text-xs text-muted-foreground">{{ opt.hint }}</div>
								</div>
								<Switch
									:model-value="preferences.categoryPrefs[opt.key] !== false"
									@update:model-value="preferences.categoryPrefs[opt.key] = $event"
								/>
							</div>
						</div>

						<div class="pl-4 space-y-3 border-l-2 border-muted">
							<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">In-app only</div>
							<div class="flex items-center justify-between">
								<div>
									<div class="font-medium text-sm">Reactions</div>
									<div class="text-xs text-muted-foreground">Bell only — reactions never send email</div>
								</div>
								<Switch
									:model-value="preferences.categoryPrefs.reactions !== false"
									@update:model-value="preferences.categoryPrefs.reactions = $event"
								/>
							</div>
						</div>

						<details class="pl-4 border-l-2 border-muted">
							<summary class="text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer">
								Per-meeting-type email controls
							</summary>
							<div class="space-y-3 mt-3">
								<div
									v-for="opt in meetingEmailOptions"
									:key="opt.key"
									class="flex items-center justify-between"
								>
									<div>
										<div class="font-medium text-sm">{{ opt.label }}</div>
										<div class="text-xs text-muted-foreground">{{ opt.hint }}</div>
									</div>
									<Switch
										:model-value="preferences.categoryPrefs[opt.key] !== false"
										@update:model-value="preferences.categoryPrefs[opt.key] = $event"
									/>
								</div>
							</div>
						</details>
					</div>

					<div class="flex justify-end gap-2 p-4 pt-2 border-t">
						<Button size="sm" :disabled="savingPrefs" @click="savePreferences">
							<Loader2 v-if="savingPrefs" class="size-3 mr-1 animate-spin" />
							Save Settings
						</Button>
					</div>
				</div>

				<!-- Notifications List with Infinite Scroll -->
				<div class="relative flex-1 overflow-auto" ref="notificationsContainer">
					<div
						v-if="isLoading && !filteredNotifications.length"
						class="absolute inset-0 flex items-center justify-center"
					>
						<Loader2 class="size-10 animate-spin text-muted-foreground" />
					</div>

					<div v-else-if="filteredNotifications.length === 0" class="flex flex-col items-center justify-center h-full">
						<BellOff class="size-16 text-muted-foreground/30 mb-4" />
						<p class="text-lg text-muted-foreground">No notifications</p>
						<p class="text-sm text-muted-foreground/70">
							{{
								statusFilter === 'archived'
									? "You don't have any read notifications"
									: "You don't have any unread notifications"
							}}
						</p>
					</div>

					<div v-else class="divide-y divide-gray-200 dark:divide-gray-700">
						<LayoutNotificationItem
							v-for="notification in filteredNotifications"
							:key="notification.id"
							:notification="notification"
							:loading="loadingNotifications.has(notification.id)"
							:is-archived="isRead(notification)"
							@mark-read="handleMarkAsRead"
							@navigate="viewNotification"
							class="px-4 py-4 sm:px-6 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
						/>

						<!-- Loading indicator for infinite scroll -->
						<div v-if="isLoadingMore" class="py-4 text-center">
							<Loader2 class="size-5 animate-spin mx-auto text-muted-foreground" />
							<p class="text-xs text-muted-foreground mt-2">Loading more notifications...</p>
						</div>

						<!-- End of list message -->
						<div
							v-if="!hasMoreToLoad && filteredNotifications.length > 0"
							class="py-4 text-center text-sm text-muted-foreground"
						>
							End of notifications
						</div>

						<!-- VueUse infinite scroll target element -->
						<div v-if="hasMoreToLoad" ref="loadMoreTrigger" class="h-1"></div>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	</div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useInfiniteScroll } from '@vueuse/core';
import { useNotifications } from '~/composables/useNotifications';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Bell, BellRing, BellOff, Check, Maximize2, Loader2, X, Settings } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const { user } = useDirectusAuth();
const {
	notifications,
	archivedNotifications,
	archivedPagination,
	isLoadingArchived,
	fetchArchivedNotifications,
	loadMoreArchivedNotifications,
	unreadCount,
	loadingNotifications,
	markAsRead,
	markAllAsRead,
	userPreferences,
	savePreferences: saveUserPreferences,
	navigateToItem,
} = useNotifications();

const isLoading = ref(false);
const isPopoverOpen = ref(false);
const isSheetOpen = ref(false);
const popoverTypeFilter = ref('all');
const showSettings = ref(false);
const isMarkingAll = ref(false);
const statusFilter = ref('inbox');
const typeFilter = ref('all');
// Local form state. Mirrors the composable's local-only flags PLUS the
// server-persisted email_notifications + the per-category/per-event-type
// opt-out map. Both top-level category keys (conversations, tickets,
// projects, invoices, contracts, proposals, meetings, reactions) AND the
// granular per-meeting-type keys (meeting_invited, …) live in the same
// flat `notification_preferences` JSON map. Missing keys default to opt-in.
const preferences = ref({
	...userPreferences.value,
	categoryPrefs: /** @type {Record<string, boolean>} */ ({}),
});
const savingPrefs = ref(false);

// Top-level categories that can send email. Reactions are deliberately
// excluded from this list — they render in a separate "In-app only"
// section because the email-delivery branch hardcodes a skip.
const emailableCategoryOptions = [
	{ key: 'conversations', label: 'Conversations', hint: 'Comments and replies on tickets, projects, and other items' },
	{ key: 'tickets', label: 'Tickets', hint: 'Status changes and new assignments' },
	{ key: 'projects', label: 'Projects', hint: 'Status changes, due-date shifts, and project completion' },
	{ key: 'invoices', label: 'Invoices', hint: 'When an invoice is issued or paid' },
	{ key: 'contracts', label: 'Contracts', hint: 'When a contract is sent or signed' },
	{ key: 'proposals', label: 'Proposals', hint: 'When a proposal is sent, accepted, or declined' },
	{ key: 'meetings', label: 'Meetings', hint: 'Invites, reschedules, reminders, cancellations' },
];

// Granular per-meeting-type controls. Tucked under a details/summary so the
// main panel stays tidy — most users just want the category toggle.
const meetingEmailOptions = [
	{ key: 'meeting_invited', label: 'Added to a meeting', hint: 'When someone adds you to a meeting' },
	{ key: 'meeting_time_changed', label: 'Time changed', hint: 'When a meeting you are on is rescheduled' },
	{ key: 'meeting_removed', label: 'Removed from a meeting', hint: 'When you are taken off a meeting' },
	{ key: 'meeting_cancelled', label: 'Meeting cancelled', hint: 'When a meeting you are on is cancelled' },
	{ key: 'meeting_reminder', label: 'Reminders', hint: '15 minutes before a meeting starts' },
];

// Pull persisted prefs from the server (email_notifications + the JSON map)
// the first time the settings panel opens.
const prefsHydrated = ref(false);
async function hydratePrefs() {
	if (prefsHydrated.value) return;
	prefsHydrated.value = true;
	try {
		const data = await $fetch('/api/user/notification-preferences');
		if (data?.email_notifications === false) {
			preferences.value.emailEnabled = false;
		} else if (data?.email_notifications === true) {
			preferences.value.emailEnabled = true;
		}
		if (data?.notification_preferences && typeof data.notification_preferences === 'object') {
			preferences.value.categoryPrefs = { ...data.notification_preferences };
		}
	} catch (err) {
		console.warn('[NotificationsMenu] could not hydrate prefs:', err);
	}
}
watch(showSettings, (open) => { if (open) hydratePrefs(); });
const notificationsContainer = ref(null);
const loadMoreTrigger = ref(null);

// Status filter options
const statusOptions = [
	{ label: 'Unread', value: 'inbox' },
	{ label: 'Read', value: 'archived' },
];

// Type filter options. The "type" axis is the user-visible category from
// the bell row's `metadata.category` (falling back to a heuristic for
// legacy rows that predate the category stamp).
const typeFilters = [
	{ label: 'All', value: 'all' },
	{ label: 'Conversations', value: 'conversations' },
	{ label: 'Reactions', value: 'reactions' },
	{ label: 'Tickets', value: 'tickets' },
	{ label: 'Projects', value: 'projects' },
	{ label: 'Invoices', value: 'invoices' },
	{ label: 'Contracts', value: 'contracts' },
	{ label: 'Proposals', value: 'proposals' },
	{ label: 'Meetings', value: 'meetings' },
];

// Resolve the category for a notification. Derived from subject + collection
// heuristically — the Directus directus_notifications system collection has
// no metadata column, so we don't try to read one.
function getNotificationType(notification) {
	const subject = (notification.subject || '').toLowerCase();
	if (subject.includes('react')) return 'reactions';
	if (subject.includes('mention')) return 'conversations';
	if (subject.startsWith('new comment') || subject.includes('comment on')) return 'conversations';

	const collectionMap = {
		comments: 'conversations',
		messages: 'conversations',
		tickets: 'tickets',
		projects: 'projects',
		project_tasks: 'projects',
		project_events: 'projects',
		invoices: 'invoices',
		contracts: 'contracts',
		proposals: 'proposals',
		video_meetings: 'meetings',
		appointments: 'meetings',
	};
	return collectionMap[notification.collection] || 'system';
}

// Computed properties for pagination
const hasMoreToLoad = computed(() => {
	return statusFilter.value === 'archived' && archivedPagination.value.hasMore;
});

const isLoadingMore = computed(() => {
	return statusFilter.value === 'archived' && isLoadingArchived.value;
});

// Set up infinite scroll using VueUse
useInfiniteScroll(
	loadMoreTrigger,
	() => {
		if (statusFilter.value === 'archived' && !isLoadingArchived.value && archivedPagination.value.hasMore) {
			loadMoreArchivedNotifications();
		}
	},
	{
		distance: 200,
		throttle: 300,
	},
);

watch(statusFilter, async (newValue) => {
	if (newValue === 'archived' && archivedNotifications.value.length === 0) {
		await fetchArchivedNotifications(true);
	}
});

watch(isSheetOpen, async (isOpen) => {
	if (isOpen && statusFilter.value === 'archived' && archivedNotifications.value.length === 0) {
		await fetchArchivedNotifications(true);
	}
});

// Filtered notifications based on status and type
const filteredNotifications = computed(() => {
	const source = statusFilter.value === 'inbox'
		? notifications.value
		: archivedNotifications.value;

	// Apply type filter
	if (typeFilter.value === 'all') return source;

	return source.filter((n) => getNotificationType(n) === typeFilter.value);
});

// Popover-only: small "live" version of the type filter that shows just
// the categories that have unread items right now. Cuts the noise on the
// compact surface — the full sheet still has the static 9-chip set.
const popoverCategoryCounts = computed(() => {
	const out = {};
	for (const n of notifications.value || []) {
		const cat = getNotificationType(n);
		out[cat] = (out[cat] || 0) + 1;
	}
	return out;
});

const POPOVER_FILTER_META = [
	{ value: 'all', label: 'All' },
	{ value: 'conversations', label: 'Conversations', dot: 'bg-info' },
	{ value: 'reactions', label: 'Reactions', dot: 'bg-pink-400' },
	{ value: 'tickets', label: 'Tickets', dot: 'bg-warning' },
	{ value: 'projects', label: 'Projects', dot: 'bg-success' },
	{ value: 'invoices', label: 'Invoices', dot: 'bg-emerald-400' },
	{ value: 'contracts', label: 'Contracts', dot: 'bg-violet-400' },
	{ value: 'proposals', label: 'Proposals', dot: 'bg-fuchsia-400' },
	{ value: 'meetings', label: 'Meetings', dot: 'bg-blue-400' },
];

const popoverFilters = computed(() => {
	const counts = popoverCategoryCounts.value;
	const total = (notifications.value || []).length;
	return POPOVER_FILTER_META
		.map((meta) => {
			const count = meta.value === 'all' ? total : counts[meta.value] || 0;
			return { ...meta, count };
		})
		.filter((f) => f.value === 'all' || f.count > 0);
});

const popoverNotifications = computed(() => {
	const source = notifications.value || [];
	const filtered = popoverTypeFilter.value === 'all'
		? source
		: source.filter((n) => getNotificationType(n) === popoverTypeFilter.value);
	return filtered.slice(0, 8);
});

// Reset the popover filter whenever it closes so a returning visit
// always opens on "All" — matches typical inbox-style expectations.
watch(isPopoverOpen, (open) => {
	if (!open) popoverTypeFilter.value = 'all';
});

const isRead = (notification) => {
	return notification.status === 'archived';
};

const openSheet = () => {
	isPopoverOpen.value = false;
	isSheetOpen.value = true;
	statusFilter.value = 'inbox';
};

const handleMarkAsRead = async (notificationId) => {
	try {
		await markAsRead(notificationId);
	} catch (error) {
		toast.error('Failed to mark notification as read');
	}
};

const handleMarkAllAsRead = async () => {
	try {
		isMarkingAll.value = true;
		await markAllAsRead();
	} catch (error) {
		toast.error('Failed to mark all notifications as read');
	} finally {
		isMarkingAll.value = false;
	}
};

const viewNotification = (notification) => {
	if (!isRead(notification)) {
		handleMarkAsRead(notification.id);
	}

	navigateToItem(notification);

	isPopoverOpen.value = false;
	isSheetOpen.value = false;
};

const savePreferences = async () => {
	savingPrefs.value = true;
	try {
		// Local-only flags (sound, desktop) still go through the composable's
		// localStorage path. Email + per-type prefs hit the server.
		await saveUserPreferences({
			soundEnabled: preferences.value.soundEnabled,
			emailEnabled: preferences.value.emailEnabled,
			desktopEnabled: preferences.value.desktopEnabled,
		});
		await $fetch('/api/user/notification-preferences', {
			method: 'PATCH',
			body: {
				email_notifications: preferences.value.emailEnabled,
				notification_preferences: preferences.value.categoryPrefs || {},
			},
		});
		toast.success('Notification settings saved');
		showSettings.value = false;
	} catch (err) {
		console.error('[NotificationsMenu] save failed:', err);
		toast.error(err?.data?.message || err?.message || 'Could not save settings');
	} finally {
		savingPrefs.value = false;
	}
};

watch(
	() => notifications.value,
	(newVal) => {
		isLoading.value = !newVal;
	},
	{ immediate: true },
);
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

/* ── Bell button ────────────────────────────────────────────────────── */
.notif-bell {
	@apply relative inline-flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground transition-colors;
	background: transparent;
}

.notif-bell:hover {
	background: hsl(var(--muted) / 0.5);
}

.notif-bell:disabled {
	@apply opacity-50 cursor-not-allowed;
}

.notif-bell--has-unread {
	color: hsl(var(--foreground));
}

.notif-bell__badge {
	@apply absolute font-bold inline-flex items-center justify-center;
	top: -2px;
	right: -2px;
	min-width: 16px;
	height: 16px;
	padding: 0 4px;
	border-radius: 999px;
	font-size: 9px;
	line-height: 1;
	background: hsl(var(--primary));
	color: hsl(var(--primary-foreground));
	box-shadow: 0 0 0 1.5px hsl(var(--background)), 0 1px 3px hsl(0 0% 0% / 0.25);
}

/* ── Popover shell — glass card matching apps-shell chrome ───────────── */
:deep(.notif-pop) {
	border: 1px solid hsl(var(--border) / 0.5);
	border-radius: 16px;
	background: hsl(var(--background) / 0.96);
	backdrop-filter: blur(12px) saturate(1.2);
	-webkit-backdrop-filter: blur(12px) saturate(1.2);
	box-shadow:
		0 10px 30px -10px hsl(0 0% 0% / 0.25),
		0 4px 12px -4px hsl(0 0% 0% / 0.12),
		inset 0 1px 0 hsl(0 0% 100% / 0.4);
}

.dark :deep(.notif-pop) {
	background: hsl(0 0% 12% / 0.94);
	box-shadow:
		0 10px 30px -10px hsl(0 0% 0% / 0.5),
		0 4px 12px -4px hsl(0 0% 0% / 0.3),
		inset 0 1px 0 hsl(0 0% 100% / 0.06);
}

/* ── Header ─────────────────────────────────────────────────────────── */
.notif-pop__header {
	@apply flex items-start justify-between gap-3 px-4 py-3 border-b border-border/40;
}

.notif-pop__eyebrow {
	@apply text-[10px] font-semibold uppercase tracking-wider text-muted-foreground;
	letter-spacing: 0.08em;
}

.notif-pop__count {
	@apply text-sm font-semibold text-foreground mt-0.5 leading-none;
}

.notif-pop__head-actions {
	@apply flex items-center gap-1 shrink-0;
}

.notif-pop__icon-btn {
	@apply inline-flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground transition-colors;
}

.notif-pop__icon-btn:hover {
	@apply text-foreground;
	background: hsl(var(--muted) / 0.6);
}

.notif-pop__icon-btn:disabled {
	@apply opacity-50 cursor-not-allowed;
}

/* ── Filter row — segmented pill set like AppFloorStrip ──────────────── */
.notif-pop__filter-row {
	@apply px-3 py-2 border-b border-border/40;
}

.notif-pop__filter-scroll {
	@apply flex items-center gap-1 overflow-x-auto;
	scrollbar-width: none;
}

.notif-pop__filter-scroll::-webkit-scrollbar {
	display: none;
}

.notif-pop__chip {
	@apply inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-muted-foreground transition-all;
	background: transparent;
	border: 1px solid transparent;
}

.notif-pop__chip:hover {
	@apply text-foreground;
	background: hsl(var(--muted) / 0.5);
}

.notif-pop__chip--active {
	@apply text-foreground;
	background: hsl(var(--muted));
	border-color: hsl(var(--border));
}

.notif-pop__chip-dot {
	@apply inline-block w-1.5 h-1.5 rounded-full;
}

.notif-pop__chip-count {
	@apply inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold leading-none;
	background: hsl(var(--muted-foreground) / 0.15);
	color: hsl(var(--muted-foreground));
}

.notif-pop__chip--active .notif-pop__chip-count {
	background: hsl(var(--primary) / 0.18);
	color: hsl(var(--primary));
}

/* ── List ───────────────────────────────────────────────────────────── */
.notif-pop__list {
	@apply max-h-[55vh] overflow-y-auto;
}

.notif-pop__empty {
	@apply flex flex-col items-center justify-center py-8 gap-2;
}

.notif-pop__empty-icon {
	@apply w-10 h-10 rounded-full bg-muted/40 flex items-center justify-center;
}

/* ── Footer ─────────────────────────────────────────────────────────── */
.notif-pop__footer {
	@apply border-t border-border/40 px-3 py-2 flex justify-end;
}

.notif-pop__view-all {
	@apply inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors;
	letter-spacing: 0.08em;
}

.notif-pop__view-all:hover {
	@apply text-foreground;
	background: hsl(var(--muted) / 0.5);
}
</style>
