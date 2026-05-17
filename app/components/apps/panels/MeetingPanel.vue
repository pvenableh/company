<!--
  MeetingPanel — slide-over body for a single video meeting. Mirrors the
  Work meetings floor row content + a CTA to /meetings/[id] for the full
  transcript + recap surface.
-->
<script setup lang="ts">
import { Icon } from '#components';
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string }>();
defineEmits<{ (e: 'close'): void }>();

const videoMeetingsApi = useDirectusItems('video_meetings');

const meeting = ref<any | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

watch(
	() => props.id,
	async (id) => {
		if (!id) return;
		loading.value = true;
		error.value = null;
		meeting.value = null;
		try {
			meeting.value = await videoMeetingsApi.get(id, {
				fields: [
					'id', 'title', 'status', 'scheduled_start', 'actual_start',
					'actual_duration_minutes', 'recording_url', 'transcript_text',
					'summary_status',
					'host_user.id', 'host_user.first_name', 'host_user.last_name',
					'project.id', 'project.title',
					'project_event.id', 'project_event.title',
					'project_event.project.id', 'project_event.project.title',
					'related_organization.id', 'related_organization.name',
				],
			});
		} catch (err: any) {
			error.value = err?.message || 'Failed to load meeting';
		} finally {
			loading.value = false;
		}
	},
	{ immediate: true },
);

function meetingChip(m: any) {
	if (m.summary_status === 'complete') return { label: 'Recap ready', tone: 'emerald' };
	if (m.summary_status === 'generating') return { label: 'Generating…', tone: 'sky' };
	if (m.summary_status === 'failed') return { label: 'Recap failed', tone: 'red' };
	if (m.transcript_text) return { label: 'Awaiting recap', tone: 'amber' };
	if (m.status === 'completed') return { label: 'No transcript', tone: 'gray' };
	if (m.status === 'in_progress') return { label: 'In progress', tone: 'sky' };
	if (m.status === 'cancelled') return { label: 'Cancelled', tone: 'gray' };
	return { label: 'Scheduled', tone: 'gray' };
}

const meetingTone: Record<string, string> = {
	emerald: 'bg-success/10 text-success dark:text-success',
	sky: 'bg-info/10 text-info dark:text-info',
	amber: 'bg-warning/10 text-warning dark:text-warning',
	red: 'bg-destructive/10 text-destructive dark:text-destructive',
	gray: 'bg-muted/40 text-muted-foreground',
};

function formatMeetingDate(s: string | null | undefined) {
	if (!s) return '—';
	try {
		return new Date(s).toLocaleString(undefined, {
			month: 'short', day: 'numeric', year: 'numeric',
			hour: 'numeric', minute: '2-digit',
		});
	} catch {
		return s;
	}
}
</script>

<template>
	<AppSlideOverShell :title="meeting?.title || 'Meeting'" @close="$emit('close')">
		<div v-if="loading" class="flex flex-col items-center justify-center py-12 gap-3">
			<Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
			<p class="text-xs text-muted-foreground">Loading meeting…</p>
		</div>

		<div v-else-if="meeting" class="space-y-5">
			<span
				:class="[
					'inline-flex items-center px-2 h-5 rounded-full text-[10px] font-bold uppercase tracking-wider',
					meetingTone[meetingChip(meeting).tone],
				]"
			>
				{{ meetingChip(meeting).label }}
			</span>

			<div class="grid grid-cols-2 gap-3 text-sm">
				<div>
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Started</p>
					<p>{{ formatMeetingDate(meeting.actual_start || meeting.scheduled_start) }}</p>
				</div>
				<div v-if="meeting.actual_duration_minutes">
					<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Duration</p>
					<p>{{ meeting.actual_duration_minutes }} min</p>
				</div>
			</div>

			<div
				v-if="meeting.project_event?.project?.title || meeting.project?.title"
				class="text-sm"
			>
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Project</p>
				<p>{{ meeting.project_event?.project?.title || meeting.project?.title }}</p>
			</div>

			<div v-if="meeting.related_organization?.name" class="text-sm">
				<p class="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Client</p>
				<p>{{ meeting.related_organization.name }}</p>
			</div>

			<div v-if="meeting.recording_url" class="text-sm">
				<a
					:href="meeting.recording_url"
					target="_blank"
					rel="noopener"
					class="inline-flex items-center gap-1 text-primary hover:underline"
				>
					<Icon name="lucide:film" class="w-4 h-4" />
					Open recording
				</a>
			</div>

			<div class="pt-3 border-t border-border/30">
				<NuxtLink
					:to="`/meetings/${meeting.id}`"
					class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
				>
					Open meeting page
					<Icon name="lucide:external-link" class="w-3 h-3" />
				</NuxtLink>
			</div>
		</div>

		<div v-else-if="error" class="text-sm text-destructive py-10 text-center">{{ error }}</div>

		<div v-else class="text-sm text-muted-foreground py-10 text-center">
			Could not load meeting.
		</div>
	</AppSlideOverShell>
</template>
