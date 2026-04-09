<script setup lang="ts">
// date-fns imports removed — using utils/dates.ts
import type { CalendarEvent } from '~/composables/useCalendarEvents';
import { LEAD_STAGE_LABELS, LEAD_STAGE_COLORS } from '~~/types/leads';
import type { LeadStage } from '~~/types/leads';

const props = defineProps<{
	todayEvents: CalendarEvent[];
	upcomingFollowUps: CalendarEvent[];
	settings?: any;
	pendingRequests: number;
}>();

const emit = defineEmits<{
	'open-requests': [];
	'open-settings': [];
}>();

const { user } = useDirectusAuth();
const router = useRouter();
const toast = useToast();

// ── Pipeline summary ──
const { getLeadStats } = useLeads();
const pipelineStats = ref<Record<string, number>>({});

onMounted(async () => {
	try {
		const stats = await getLeadStats();
		pipelineStats.value = stats?.by_stage || {};
	} catch {}
});

const topStages = computed(() => {
	const stages: LeadStage[] = ['new', 'contacted', 'qualified', 'negotiating'];
	return stages.map(s => ({
		key: s,
		label: LEAD_STAGE_LABELS[s],
		count: pipelineStats.value[s] || 0,
		color: LEAD_STAGE_COLORS[s],
	}));
});

// ── Booking link ──
const bookingUrl = computed(() => {
	const baseUrl = useRuntimeConfig().public.siteUrl || (import.meta.client ? window.location.origin : '');
	const slug = props.settings?.booking_page_slug || user.value?.id;
	return `${baseUrl}/book/${slug}`;
});

const copyBookingLink = async () => {
	await navigator.clipboard.writeText(bookingUrl.value);
	toast.add({ title: 'Booking link copied!', color: 'green', icon: 'i-heroicons-clipboard-document-check' });
};

// ── Time formatting ──
const formatEventTime = (event: CalendarEvent) => {
	if (!event.start_time) return '';
	try {
		const d = new Date(event.start_time);
		return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
	} catch { return ''; }
};

// Uses native formatting for weekday+date display
const formatFollowUpDate = (event: CalendarEvent) => {
	if (!event.start_time) return '';
	const d = new Date(event.start_time);
	if (isNaN(d.getTime())) return '';
	return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

const eventTypeIcon = (event: CalendarEvent) => {
	switch (event.type) {
		case 'video_meeting': return 'i-heroicons-video-camera';
		case 'follow_up': return 'i-heroicons-arrow-path';
		default: return 'i-heroicons-calendar';
	}
};

const eventTypeColor = (event: CalendarEvent) => {
	switch (event.type) {
		case 'video_meeting': return 'text-emerald-500';
		case 'follow_up': return 'text-amber-500';
		default: return 'text-blue-500';
	}
};
</script>

<template>
	<div class="space-y-4">
		<!-- Today's Agenda -->
		<div class="ios-card p-4">
			<div class="flex items-center gap-2 mb-3">
				<UIcon name="i-heroicons-sun" class="w-4 h-4 text-amber-500" />
				<h3 class="text-xs font-semibold uppercase tracking-wide text-foreground/70">Today's Agenda</h3>
				<span v-if="todayEvents.length" class="text-[10px] font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-full">
					{{ todayEvents.length }}
				</span>
			</div>

			<div v-if="todayEvents.length === 0" class="text-center py-4">
				<UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto text-emerald-400/60 mb-1.5" />
				<p class="text-[11px] text-muted-foreground">No events today</p>
			</div>

			<div v-else class="space-y-1.5">
				<div
					v-for="event in todayEvents.slice(0, 6)"
					:key="event.id"
					class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer ios-press"
					@click="event.type === 'follow_up' ? router.push(`/leads/${event.lead?.id}`) : undefined"
				>
					<UIcon :name="eventTypeIcon(event)" :class="eventTypeColor(event)" class="w-3.5 h-3.5 flex-shrink-0" />
					<div class="flex-1 min-w-0">
						<p class="text-[12px] font-medium text-foreground truncate">{{ event.title }}</p>
						<p class="text-[10px] text-muted-foreground">{{ formatEventTime(event) }}</p>
					</div>
					<UButton
						v-if="event.is_video && event.meeting_link"
						size="xs"
						color="green"
						variant="soft"
						icon="i-heroicons-video-camera"
						class="flex-shrink-0"
						:to="event.meeting_link"
						target="_blank"
					/>
				</div>
			</div>
		</div>

		<!-- Upcoming Follow-ups -->
		<div class="ios-card p-4">
			<div class="flex items-center gap-2 mb-3">
				<UIcon name="i-heroicons-arrow-path" class="w-4 h-4 text-amber-500" />
				<h3 class="text-xs font-semibold uppercase tracking-wide text-foreground/70">Follow-ups</h3>
				<span v-if="upcomingFollowUps.length" class="text-[10px] font-medium text-amber-600 bg-amber-100/60 dark:bg-amber-900/20 px-1.5 py-0.5 rounded-full">
					{{ upcomingFollowUps.length }}
				</span>
			</div>

			<div v-if="upcomingFollowUps.length === 0" class="text-center py-3">
				<p class="text-[11px] text-muted-foreground">No upcoming follow-ups</p>
			</div>

			<div v-else class="space-y-1.5">
				<div
					v-for="event in upcomingFollowUps.slice(0, 5)"
					:key="event.id"
					class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer ios-press"
					@click="router.push(`/leads/${event.lead?.id}`)"
				>
					<span
						class="w-2 h-2 rounded-full flex-shrink-0"
						:style="{ backgroundColor: event.lead?.stage ? LEAD_STAGE_COLORS[event.lead.stage] : '#9CA3AF' }"
					/>
					<div class="flex-1 min-w-0">
						<p class="text-[12px] font-medium text-foreground truncate">{{ event.lead?.contact_name || 'Lead' }}</p>
						<p class="text-[10px] text-muted-foreground">{{ formatFollowUpDate(event) }}</p>
					</div>
					<span class="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/70">
						{{ event.lead?.stage ? LEAD_STAGE_LABELS[event.lead.stage] : '' }}
					</span>
				</div>
			</div>
		</div>

		<!-- Pipeline Summary -->
		<div class="ios-card p-4">
			<div class="flex items-center justify-between mb-3">
				<div class="flex items-center gap-2">
					<UIcon name="i-heroicons-funnel" class="w-4 h-4 text-primary" />
					<h3 class="text-xs font-semibold uppercase tracking-wide text-foreground/70">Pipeline</h3>
				</div>
				<NuxtLink to="/leads" class="text-[10px] text-primary hover:underline">View &rarr;</NuxtLink>
			</div>

			<div class="grid grid-cols-2 gap-2">
				<div
					v-for="stage in topStages"
					:key="stage.key"
					class="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-muted/20"
				>
					<span class="w-2 h-2 rounded-full flex-shrink-0" :style="{ backgroundColor: stage.color }" />
					<div class="flex-1 min-w-0">
						<p class="text-[10px] text-muted-foreground truncate">{{ stage.label }}</p>
						<p class="text-sm font-semibold text-foreground">{{ stage.count }}</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Pending Requests -->
		<div
			v-if="pendingRequests > 0"
			class="ios-card p-4 cursor-pointer hover:shadow-md transition-shadow ios-press"
			@click="$emit('open-requests')"
		>
			<div class="flex items-center gap-3">
				<div class="p-2 bg-amber-100/60 dark:bg-amber-900/20 rounded-xl">
					<UIcon name="i-heroicons-inbox" class="w-4 h-4 text-amber-600" />
				</div>
				<div class="flex-1">
					<p class="text-[12px] font-semibold text-foreground">{{ pendingRequests }} Pending Request{{ pendingRequests > 1 ? 's' : '' }}</p>
					<p class="text-[10px] text-muted-foreground">Tap to review</p>
				</div>
				<UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-muted-foreground" />
			</div>
		</div>

		<!-- Booking Link -->
		<div v-if="settings?.public_booking_enabled" class="ios-card p-4">
			<div class="flex items-center gap-2 mb-2">
				<UIcon name="i-heroicons-link" class="w-4 h-4 text-primary" />
				<h3 class="text-xs font-semibold uppercase tracking-wide text-foreground/70">Booking Link</h3>
			</div>
			<div class="flex gap-1.5">
				<input
					:value="bookingUrl"
					readonly
					class="flex-1 text-[10px] bg-muted/30 rounded-lg px-2.5 py-1.5 text-muted-foreground truncate border border-border/30"
				/>
				<button
					@click="copyBookingLink"
					class="p-1.5 rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors ios-press"
				>
					<UIcon name="i-heroicons-clipboard" class="w-3.5 h-3.5 text-muted-foreground" />
				</button>
			</div>
		</div>
	</div>
</template>
