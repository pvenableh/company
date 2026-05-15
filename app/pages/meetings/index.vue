<script setup>
useHead({ title: 'Meetings | Earnest' });

definePageMeta({
	middleware: ['auth'],
});

const { user: sessionUser, loggedIn } = useUserSession();
const currentUser = computed(() => loggedIn.value ? sessionUser.value ?? null : null);

const videoMeetings = useDirectusItems('video_meetings');

const meetings = ref([]);
const loading = ref(true);
const search = ref('');
const filter = ref('all'); // all | with-recap | needs-recap

const fetchMeetings = async () => {
	if (!currentUser.value?.id) return;
	loading.value = true;
	try {
		const userId = currentUser.value.id;
		const rows = await videoMeetings.list({
			fields: [
				'id',
				'title',
				'status',
				'scheduled_start',
				'actual_start',
				'actual_end',
				'actual_duration_minutes',
				'recording_url',
				'transcript_text',
				'summary',
				'summary_status',
				'summary_generated_at',
				'host_user.id',
				'host_user.first_name',
				'host_user.last_name',
				'project.id',
				'project.title',
				'project.client.id',
				'project.client.name',
				'project_event.id',
				'project_event.title',
				'project_event.project.id',
				'project_event.project.title',
				'client.id',
				'client.name',
				'related_organization.id',
				'related_organization.name',
				'attendees.id',
				'attendees.directus_user',
			],
			filter: {
				_or: [
					{ host_user: { _eq: userId } },
					{ attendees: { directus_user: { _eq: userId } } },
				],
			},
			sort: ['-scheduled_start'],
			limit: 100,
		});
		meetings.value = rows || [];
	} catch (err) {
		console.error('[meetings/index] fetch failed', err);
		meetings.value = [];
	}
	loading.value = false;
};

watch(currentUser, fetchMeetings, { immediate: true });

const filtered = computed(() => {
	const q = search.value.trim().toLowerCase();
	return meetings.value.filter((m) => {
		if (filter.value === 'with-recap' && m.summary_status !== 'complete') return false;
		if (filter.value === 'needs-recap') {
			const hasTranscript = !!m.transcript_text;
			const hasSummary = m.summary_status === 'complete';
			if (!hasTranscript || hasSummary) return false;
		}
		if (q) {
			const haystack = [
				m.title,
				m.project?.title,
				m.project_event?.title,
				m.project_event?.project?.title,
				m.client?.name,
				m.project?.client?.name,
				m.related_organization?.name,
			].filter(Boolean).join(' ').toLowerCase();
			if (!haystack.includes(q)) return false;
		}
		return true;
	});
});

const formatDate = (s) => {
	if (!s) return '—';
	try {
		return new Date(s).toLocaleString(undefined, {
			month: 'short', day: 'numeric', year: 'numeric',
			hour: 'numeric', minute: '2-digit',
		});
	} catch { return s; }
};

// Prefer the meeting's own client, then the project's client, then the legacy
// related_organization label (no link when only the org label is available).
const rowClient = (m) => {
	if (m.client?.id) return { id: m.client.id, name: m.client.name || 'Client' };
	if (m.project?.client?.id) return { id: m.project.client.id, name: m.project.client.name || 'Client' };
	if (m.related_organization?.name) return { id: null, name: m.related_organization.name };
	return null;
};

const statusChip = (m) => {
	if (m.summary_status === 'complete') return { label: 'Recap ready', tone: 'emerald' };
	if (m.summary_status === 'generating') return { label: 'Generating…', tone: 'sky' };
	if (m.summary_status === 'failed') return { label: 'Recap failed', tone: 'red' };
	if (m.transcript_text) return { label: 'Awaiting recap', tone: 'amber' };
	if (m.status === 'completed') return { label: 'No transcript', tone: 'gray' };
	if (m.status === 'in_progress') return { label: 'In progress', tone: 'sky' };
	if (m.status === 'cancelled') return { label: 'Cancelled', tone: 'gray' };
	return { label: 'Scheduled', tone: 'gray' };
};

// Meeting status tones flow through the shared `softTone` helper in
// `~/utils/palette-tokens` (auto-imported by Nuxt) — same contract as
// meetings/[id].vue, kept in lockstep automatically.
const toneClass = (tone) => softTone(tone);
</script>

<template>
	<div class="max-w-6xl mx-auto p-4 sm:p-6">
		<!-- Header -->
		<div class="flex items-end justify-between gap-4 mb-6">
			<div>
				<h1 class="text-2xl font-semibold text-foreground">Meetings</h1>
				<p class="text-sm text-muted-foreground mt-1">Recordings, transcripts, and AI-written recaps for every video call.</p>
			</div>
		</div>

		<!-- Filters -->
		<div class="flex flex-wrap items-center gap-2 mb-4">
			<div class="relative flex-1 min-w-[200px] max-w-sm">
				<UIcon name="i-heroicons-magnifying-glass" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
				<input
					v-model="search"
					placeholder="Search meetings, projects, clients…"
					class="w-full h-9 pl-9 pr-3 rounded-full bg-muted/30 border border-border text-sm focus:outline-none focus:ring-2 focus:ring-success/30"
				/>
			</div>
			<div class="flex gap-1 rounded-full bg-muted/30 p-1">
				<button
					v-for="f in [
						{ key: 'all', label: 'All' },
						{ key: 'with-recap', label: 'With recap' },
						{ key: 'needs-recap', label: 'Needs recap' },
					]"
					:key="f.key"
					:class="[
						'px-3 h-7 rounded-full text-[11px] font-semibold uppercase tracking-wider transition-colors',
						filter === f.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
					]"
					@click="filter = f.key"
				>
					{{ f.label }}
				</button>
			</div>
		</div>

		<!-- List -->
		<div v-if="loading" class="text-center py-12 text-sm text-muted-foreground">Loading meetings…</div>
		<div v-else-if="filtered.length === 0" class="ios-card p-12 text-center">
			<div class="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4">
				<UIcon name="i-heroicons-video-camera" class="w-7 h-7 text-muted-foreground" />
			</div>
			<h2 class="text-base font-semibold text-foreground">No meetings yet</h2>
			<p class="text-sm text-muted-foreground mt-1.5 max-w-sm mx-auto">
				Schedule a meeting from any project event or directly from your calendar. Recaps appear here after the host enables transcription during the call.
			</p>
		</div>
		<div v-else class="space-y-2">
			<NuxtLink
				v-for="m in filtered"
				:key="m.id"
				:to="`/meetings/${m.id}`"
				class="ios-card block px-4 py-3 hover:bg-muted/30 transition-colors"
			>
				<div class="flex items-start gap-3">
					<div class="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center flex-shrink-0">
						<UIcon name="i-heroicons-video-camera" class="w-5 h-5 text-success" />
					</div>
					<div class="flex-1 min-w-0">
						<div class="flex items-start justify-between gap-2">
							<h3 class="text-sm font-semibold text-foreground truncate">{{ m.title || 'Untitled meeting' }}</h3>
							<span
								:class="[
									'flex-shrink-0 inline-flex items-center px-2 h-5 rounded-full text-[10px] font-bold uppercase tracking-wider',
									toneClass(statusChip(m).tone),
								]"
							>
								{{ statusChip(m).label }}
							</span>
						</div>
						<div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-muted-foreground">
							<span class="inline-flex items-center gap-1">
								<UIcon name="i-heroicons-clock" class="w-3 h-3" />
								{{ formatDate(m.actual_start || m.scheduled_start) }}
							</span>
							<span v-if="m.actual_duration_minutes" class="inline-flex items-center gap-1">
								<UIcon name="i-heroicons-play" class="w-3 h-3" />
								{{ m.actual_duration_minutes }}m
							</span>
							<span v-if="m.project_event?.project?.title || m.project?.title" class="inline-flex items-center gap-1">
								<UIcon name="i-heroicons-folder" class="w-3 h-3" />
								{{ m.project_event?.project?.title || m.project?.title }}
							</span>
							<span v-if="m.project_event?.title" class="inline-flex items-center gap-1">
								<UIcon name="i-heroicons-flag" class="w-3 h-3" />
								{{ m.project_event.title }}
							</span>
							<span v-if="rowClient(m)?.name" class="inline-flex items-center gap-1">
								<UIcon name="i-heroicons-building-office" class="w-3 h-3" />
								{{ rowClient(m).name }}
							</span>
							<span v-if="m.recording_url" class="inline-flex items-center gap-1 text-success dark:text-success">
								<UIcon name="i-heroicons-film" class="w-3 h-3" />
								Recording
							</span>
						</div>
					</div>
				</div>
			</NuxtLink>
		</div>
	</div>
</template>
