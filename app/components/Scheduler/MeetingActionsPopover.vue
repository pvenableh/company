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
		case 'invitee': return 'bg-amber-500 text-white';
		default: return 'bg-slate-500 text-white';
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

				<div class="flex items-center justify-between gap-1 px-2 py-1.5">
					<UTooltip v-if="isInActiveWindow" text="Join meeting">
						<button
							type="button"
							@click="joinMeeting"
							class="w-8 h-8 inline-flex items-center justify-center rounded-md bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
						>
							<UIcon name="i-heroicons-video-camera" class="w-4 h-4" />
						</button>
					</UTooltip>

					<UTooltip v-if="isVideo && meetingUrl" text="Copy link">
						<button
							type="button"
							@click="copyLink"
							class="w-8 h-8 inline-flex items-center justify-center rounded-md bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors"
						>
							<UIcon name="i-heroicons-link" class="w-4 h-4" />
						</button>
					</UTooltip>

					<SchedulerSendInvitePopover
						v-if="isVideo && meetingForInvite"
						:meeting="meetingForInvite"
					>
						<UTooltip text="Send invite">
							<button
								type="button"
								class="w-8 h-8 inline-flex items-center justify-center rounded-md bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-colors"
								@click.stop
							>
								<UIcon name="i-heroicons-paper-airplane" class="w-4 h-4" />
							</button>
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
							class="w-8 h-8 inline-flex items-center justify-center rounded-md bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors disabled:opacity-50"
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
