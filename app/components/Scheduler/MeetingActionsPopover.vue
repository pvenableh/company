<!--
  SchedulerMeetingActionsPopover

  Slot-based popover that surfaces the row-level meeting actions
  (Join / Copy link / Send invite / Edit / Delete) from a single trigger.
  Used by both the DayTimeline rows and the month-grid CalendarEventChip
  so the click-target behaviour is consistent across the scheduler.

  Send-invite uses a nested popover because the form already lives in
  SchedulerSendInvitePopover; the rest emit upstream to the parent which
  routes to the existing handlers.
-->
<script setup lang="ts">
import type { CalendarEvent } from '~/composables/useCalendarEvents';

const props = defineProps<{
	event: CalendarEvent;
}>();

const emit = defineEmits<{
	edit: [event: CalendarEvent];
	join: [event: CalendarEvent];
	deleted: [event: CalendarEvent];
}>();

const toast = useToast();
const open = ref(false);
const deleting = ref(false);

// Tick "now" every 30s so the active-window check stays fresh while
// the popover is open without spamming intervals when it isn't.
const nowTs = ref(Date.now());
let nowInterval: ReturnType<typeof setInterval> | null = null;
watch(open, (isOpen) => {
	if (isOpen) {
		nowTs.value = Date.now();
		nowInterval = setInterval(() => { nowTs.value = Date.now(); }, 30_000);
	} else if (nowInterval) {
		clearInterval(nowInterval);
		nowInterval = null;
	}
});
onUnmounted(() => { if (nowInterval) clearInterval(nowInterval); });

const isVideo = computed(() => props.event.type === 'video_meeting');

// External-calendar overlay events are read-only mirrors of Google/Outlook
// events — none of the Earnest row actions (join/copy/invite/edit/delete) apply.
const isExternal = computed(() => props.event.type === 'external');

const isInActiveWindow = computed(() => {
	if (!isVideo.value) return false;
	if (props.event.meeting_status === 'in_progress') return true;
	if (!props.event.start_time) return false;
	const startMs = new Date(props.event.start_time).getTime();
	if (isNaN(startMs)) return false;
	return Math.abs(startMs - nowTs.value) <= 15 * 60 * 1000;
});

const meetingUrl = computed(() => {
	if (!isVideo.value) return null;
	if (props.event.room_name && import.meta.client) {
		return `${window.location.origin}/meeting/${props.event.room_name}`;
	}
	return props.event.meeting_link || null;
});

// Shape required by SchedulerSendInvitePopover.
const meetingForInvite = computed(() => {
	if (!props.event.video_meeting_id) return null;
	return {
		id: props.event.video_meeting_id,
		room_name: props.event.room_name || null,
		title: props.event.title || '',
		scheduled_start: props.event.start_time || null,
		scheduled_end: props.event.end_time || null,
		host_name: props.event.host_name || null,
		invitee_name: props.event.invitee_name || null,
		invitee_email: props.event.invitee_email || null,
		invitee_phone: props.event.invitee_phone || null,
	};
});

async function copyLink() {
	if (!meetingUrl.value) {
		toast.add({ title: 'No meeting link', color: 'red' });
		return;
	}
	try {
		await navigator.clipboard.writeText(meetingUrl.value);
		toast.add({ title: 'Link copied', color: 'green' });
		open.value = false;
	} catch {
		toast.add({ title: 'Copy failed', color: 'red' });
	}
}

function joinMeeting() {
	if (!props.event.room_name) return;
	emit('join', props.event);
	open.value = false;
}

function openEdit() {
	emit('edit', props.event);
	open.value = false;
}

function memberInitial(name: string): string {
	const trimmed = name.trim();
	if (!trimmed) return '?';
	return trimmed[0]!.toUpperCase();
}

function memberAvatarClass(role: 'host' | 'attendee' | 'invitee'): string {
	switch (role) {
		case 'host': return 'bg-primary text-primary-foreground';
		case 'invitee': return 'bg-warning text-white';
		default: return 'bg-muted-foreground text-white';
	}
}

async function deleteMeeting() {
	if (!props.event.video_meeting_id) return;
	if (!window.confirm(`Delete "${props.event.title || 'this meeting'}"? The Daily room and linked appointment will also be removed.`)) return;
	deleting.value = true;
	try {
		await $fetch(`/api/video/meetings/${props.event.video_meeting_id}`, { method: 'DELETE' });
		toast.add({ title: 'Meeting deleted', color: 'green' });
		emit('deleted', props.event);
		open.value = false;
	} catch (error: any) {
		toast.add({ title: 'Delete failed', description: error.message, color: 'red' });
	} finally {
		deleting.value = false;
	}
}
</script>

<template>
	<UPopover v-model:open="open" :popper="{ placement: 'bottom-start', offsetDistance: 6 }">
		<slot />

		<template #content>
			<div class="w-60 p-1">
				<div class="px-2.5 py-2 border-b border-border/30 mb-1">
					<p class="text-[12px] font-semibold text-foreground truncate">{{ event.title }}</p>
					<p v-if="isExternal && event.external_calendar_name" class="text-[10px] text-muted-foreground truncate mt-0.5">
						{{ event.external_calendar_name }}
					</p>
				</div>

				<!-- External overlay: read-only mirror. Offer only "open in calendar". -->
				<div v-if="isExternal" class="px-1 pb-1">
					<a
						v-if="event.external_link"
						:href="event.external_link"
						target="_blank"
						rel="noopener"
						class="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] font-medium text-foreground hover:bg-muted/40 transition-colors"
						@click="open = false"
					>
						<UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3.5 h-3.5 text-muted-foreground" />
						<span>Open in calendar</span>
					</a>
					<p v-else class="px-2.5 py-1.5 text-[11px] text-muted-foreground">
						Read-only event from a connected calendar.
					</p>
				</div>

				<div
					v-if="event.members && event.members.length"
					class="flex items-center gap-2 px-2.5 py-2 border-b border-border/30 mb-1"
					:title="event.members.map(m => `${m.name}${m.role === 'host' ? ' (host)' : m.role === 'invitee' ? ' (guest)' : ''}`).join(', ')"
				>
					<div class="flex -space-x-1.5">
						<span
							v-for="member in event.members.slice(0, 4)"
							:key="`${member.role}-${member.name}`"
							class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ring-2 ring-background"
							:class="memberAvatarClass(member.role)"
						>{{ memberInitial(member.name) }}</span>
						<span
							v-if="event.members.length > 4"
							class="w-6 h-6 rounded-full bg-muted/50 text-muted-foreground flex items-center justify-center text-[9px] font-semibold ring-2 ring-background"
						>+{{ event.members.length - 4 }}</span>
					</div>
					<span class="text-[11px] text-muted-foreground">
						{{ event.members.length }} {{ event.members.length === 1 ? 'member' : 'members' }}
					</span>
				</div>

				<!-- Primary nav links — full-width rows so both destinations
				     (recap page / live room) are obvious. Enter meeting goes
				     emerald to read as the active CTA when the meeting is in
				     its 15-minute window; outside that window it stays neutral
				     but remains clickable (no more "only enabled when live"
				     gate — the room exists for the lifetime of the meeting,
				     and pre-joining is a real use case). -->
				<div
					v-if="isVideo && event.video_meeting_id"
					class="px-1 pb-1"
				>
					<NuxtLink
						:to="`/meetings/${event.video_meeting_id}`"
						class="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] font-medium text-foreground hover:bg-muted/40 transition-colors"
						@click="open = false"
					>
						<UIcon name="i-heroicons-document-text" class="w-3.5 h-3.5 text-muted-foreground" />
						<span>Meeting details</span>
					</NuxtLink>
					<button
						v-if="event.room_name"
						type="button"
						@click="joinMeeting"
						:class="[
							'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors',
							isInActiveWindow
								? 'bg-success/15 text-success hover:bg-success/25'
								: 'text-foreground hover:bg-muted/40',
						]"
					>
						<UIcon name="i-heroicons-video-camera" class="w-3.5 h-3.5" :class="isInActiveWindow ? 'text-success' : 'text-muted-foreground'" />
						<span>Enter meeting</span>
						<span v-if="isInActiveWindow" class="ml-auto inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-success">
							<span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
							Live
						</span>
					</button>
				</div>

				<div
					v-if="isVideo && event.video_meeting_id"
					class="border-t border-border/30 my-1"
				/>

				<!-- Secondary icon-row actions: copy / invite / edit / delete. Hidden for
				     external overlay events, which are read-only. -->
				<div v-if="!isExternal" class="flex items-center justify-between gap-1 px-2 py-1.5">
					<UTooltip v-if="isVideo && meetingUrl" text="Copy link">
						<button
							type="button"
							@click="copyLink"
							class="w-8 h-8 inline-flex items-center justify-center rounded-md bg-info/10 text-info hover:bg-info/20 transition-colors"
						>
							<UIcon name="i-heroicons-link" class="w-4 h-4" />
						</button>
					</UTooltip>

					<!-- Send invite. UPopover's slot child becomes the trigger via
					     Headless UI's PopoverButton (which renders its own
					     <button>). We previously nested a real <button @click.stop>
					     inside, which both produced invalid HTML (button-in-button)
					     AND killed the click bubble that opens the popover — the
					     form never appeared and the email "silently" never sent.
					     Render a span here and let UPopover own the click. -->
					<SchedulerSendInvitePopover
						v-if="isVideo && meetingForInvite"
						:meeting="meetingForInvite"
					>
						<UTooltip text="Send invite">
							<span
								class="w-8 h-8 inline-flex items-center justify-center rounded-md bg-warning/10 text-warning hover:bg-warning/20 transition-colors cursor-pointer"
							>
								<UIcon name="i-heroicons-paper-airplane" class="w-4 h-4" />
							</span>
						</UTooltip>
					</SchedulerSendInvitePopover>

					<UTooltip text="Edit">
						<button
							type="button"
							@click="openEdit"
							class="w-8 h-8 inline-flex items-center justify-center rounded-md bg-muted/50 text-foreground hover:bg-muted transition-colors"
						>
							<UIcon name="i-heroicons-pencil-square" class="w-4 h-4" />
						</button>
					</UTooltip>

					<UTooltip v-if="event.video_meeting_id" text="Delete">
						<button
							type="button"
							:disabled="deleting"
							@click="deleteMeeting"
							class="w-8 h-8 inline-flex items-center justify-center rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
						>
							<UIcon
								:name="deleting ? 'i-heroicons-arrow-path' : 'i-heroicons-trash'"
								:class="['w-4 h-4', deleting && 'animate-spin']"
							/>
						</button>
					</UTooltip>
				</div>
			</div>
		</template>
	</UPopover>
</template>
