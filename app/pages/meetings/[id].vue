<script setup>
useHead({ title: 'Meeting recap | Earnest' });

definePageMeta({
	middleware: ['auth'],
});

const route = useRoute();
const toast = useToast();
const meetingId = computed(() => String(route.params.id));

const meeting = ref(null);
const loading = ref(true);
const error = ref('');
const generating = ref(false);
const transcriptOpen = ref(false);
const promotingIndex = ref(-1);

// Notes & Decisions
const { notes, fetchNotes, addNote, removeNote, submitting: noteSubmitting } = useMeetingNotes(meetingId);
const noteDraft = ref('');
const { user: sessionUser, loggedIn } = useUserSession();
const currentUserId = computed(() => loggedIn.value ? sessionUser.value?.id || null : null);

// AI sidebar — show Earnest scoped to this meeting
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();

const fetchMeeting = async () => {
	loading.value = true;
	error.value = '';
	try {
		// /api/directus/items only has a POST handler — pass collection/operation
		// in the body, NOT as query params on a GET (which would 404).
		const res = await $fetch('/api/directus/items', {
			method: 'POST',
			body: {
				collection: 'video_meetings',
				operation: 'get',
				id: meetingId.value,
				query: {
					fields: [
						'id',
						'title',
						'description',
						'status',
						'scheduled_start',
						'actual_start',
						'actual_end',
						'actual_duration_minutes',
						'recording_url',
						'recording_enabled',
						'transcript_id',
						'transcript_text',
						'transcript_url',
						'summary',
						'summary_status',
						'summary_generated_at',
						'summary_error',
						'action_items',
						'host_user.id',
						'host_user.first_name',
						'host_user.last_name',
						'host_user.email',
						'project.id',
						'project.title',
						'project_event.id',
						'project_event.title',
						'project_event.event_date',
						'project_event.project.id',
						'project_event.project.title',
						'related_organization.id',
						'related_organization.name',
						'related_contact.id',
						'related_contact.first_name',
						'related_contact.last_name',
						'attendees.id',
						'attendees.guest_name',
						'attendees.guest_email',
						'attendees.directus_user.first_name',
						'attendees.directus_user.last_name',
					],
				},
			},
		});
		// items.post.ts returns the row directly for `get`, not wrapped in `.data`.
		meeting.value = (res && typeof res === 'object' && 'data' in res ? (res as any).data : res) || null;
		if (!meeting.value) error.value = 'Meeting not found';
	} catch (err) {
		console.error('[meetings/[id]] fetch failed', err);
		error.value = err.statusMessage || err.message || 'Failed to load meeting';
	}
	loading.value = false;
};

await fetchMeeting();
watch(meetingId, fetchMeeting);

// Hydrate notes once we have a meeting id and again whenever it changes.
watch(meetingId, async (id) => {
	if (id) await fetchNotes();
}, { immediate: true });

// Set the AI sidebar's entity so Ask Earnest works against this meeting.
watch(meeting, (m) => {
	if (m?.id) setEntity('video_meeting', String(m.id), m.title || 'Meeting');
}, { immediate: true });
onBeforeUnmount(() => clearEntity());

const generateSummary = async () => {
	if (!meeting.value?.id) return;
	generating.value = true;
	try {
		await $fetch('/api/ai/meeting-summary', {
			method: 'POST',
			body: { meetingId: meeting.value.id },
		});
		toast.add({ title: 'Recap generated', color: 'green' });
		await fetchMeeting();
	} catch (err) {
		const msg = err.statusMessage || err.data?.message || err.message || 'Failed to generate recap';
		toast.add({ title: 'Recap failed', description: msg, color: 'red' });
	}
	generating.value = false;
};

// Poll while the recap is queued or generating so the UI keeps up if the
// realtime notification gets dropped (rare but possible). The realtime
// subscription below is the primary path; this is a safety net.
let pollTimer = null;
const stopPoll = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
watch(
	() => meeting.value?.summary_status,
	(s) => {
		if ((s === 'generating' || s === 'pending') && !pollTimer) {
			pollTimer = setInterval(fetchMeeting, 8000);
		} else if (s !== 'generating' && s !== 'pending') {
			stopPoll();
		}
	},
);
onBeforeUnmount(stopPoll);

// Realtime — when a directus_notification arrives pointing at this meeting,
// refresh the record so the recap shows up without a manual reload.
const notifications = useRealtimeSubscription(
	'directus_notifications',
	['id', 'collection', 'item', 'subject', 'status', 'date_created'],
	{
		_and: [
			{ collection: { _eq: 'video_meetings' } },
			{ item: { _eq: meetingId.value } },
		],
	},
	'-date_created',
);
watch(
	() => notifications.data.value.length,
	(n, prev) => { if (n > (prev || 0)) fetchMeeting(); },
);

const formatDate = (s) => {
	if (!s) return '—';
	try {
		return new Date(s).toLocaleString(undefined, {
			weekday: 'long', month: 'long', day: 'numeric',
			hour: 'numeric', minute: '2-digit',
		});
	} catch { return s; }
};

const projectTitle = computed(() => meeting.value?.project_event?.project?.title || meeting.value?.project?.title);
const projectId = computed(() => meeting.value?.project_event?.project?.id || meeting.value?.project?.id);

const attendeesList = computed(() => {
	if (!meeting.value) return [];
	const items = [];
	const host = meeting.value.host_user;
	if (host) {
		const name = `${host.first_name || ''} ${host.last_name || ''}`.trim() || host.email || 'Host';
		items.push({ name, role: 'Host' });
	}
	for (const a of meeting.value.attendees || []) {
		const u = a.directus_user;
		if (u && typeof u === 'object') {
			const name = `${u.first_name || ''} ${u.last_name || ''}`.trim();
			if (name) { items.push({ name, role: 'Member' }); continue; }
		}
		if (a.guest_name) {
			items.push({ name: a.guest_name, role: a.guest_email || 'Guest' });
		}
	}
	return items;
});

// Light markdown renderer matching the AI sidebar's pattern.
const renderMarkdown = (text) => {
	if (!text) return '';
	let html = text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
	html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
		`<pre class="bg-muted/40 rounded-lg p-3 my-2 overflow-x-auto text-xs"><code>${code.trim()}</code></pre>`,
	);
	html = html.replace(/`([^`]+)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs font-mono">$1</code>');
	html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
	html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
	html = html.replace(/^### (.+)$/gm, '<h4 class="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-3 mb-1">$1</h4>');
	html = html.replace(/^## (.+)$/gm, '<h3 class="text-sm font-bold text-foreground mt-4 mb-2">$1</h3>');
	html = html.replace(/^# (.+)$/gm, '<h2 class="text-base font-bold text-foreground mt-4 mb-2">$1</h2>');
	html = html.replace(/^- (.+)$/gm, '<li class="ml-5 list-disc text-sm leading-relaxed my-0.5">$1</li>');
	html = html.replace(/^\d+\.\s(.+)$/gm, '<li class="ml-5 list-decimal text-sm leading-relaxed my-0.5">$1</li>');
	html = html.replace(/\n\n/g, '</p><p class="text-sm leading-relaxed my-2">');
	html = html.replace(/\n/g, '<br>');
	return `<p class="text-sm leading-relaxed my-2">${html}</p>`;
};

const summaryStatusLabel = computed(() => {
	const s = meeting.value?.summary_status;
	if (s === 'complete') return { text: 'Recap ready', tone: 'emerald' };
	if (s === 'generating') return { text: 'Generating recap…', tone: 'sky' };
	if (s === 'pending') return { text: 'Queued — recap on the way…', tone: 'sky' };
	if (s === 'failed') return { text: 'Recap failed', tone: 'red' };
	if (meeting.value?.transcript_text) return { text: 'Awaiting recap', tone: 'amber' };
	return { text: 'No transcript', tone: 'gray' };
});

const toneClass = (tone) => ({
	emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
	sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
	amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
	red: 'bg-red-500/10 text-red-600 dark:text-red-400',
	gray: 'bg-muted/40 text-muted-foreground',
}[tone] || 'bg-muted/40 text-muted-foreground');

const canRegenerate = computed(() =>
	!!meeting.value?.transcript_text
		&& meeting.value.summary_status !== 'generating'
		&& meeting.value.summary_status !== 'pending',
);

// ─── Notes & Decisions helpers ───
const groupedNotes = computed(() => {
	const decisions = [];
	const general = [];
	for (const n of notes.value || []) {
		(n.note_type === 'decision' ? decisions : general).push(n);
	}
	return { decisions, general };
});

const submitNote = async (type) => {
	const text = noteDraft.value.trim();
	if (!text || noteSubmitting.value) return;
	const created = await addNote(text, type, null);
	if (created) noteDraft.value = '';
};

const handleDeleteNote = async (id) => {
	if (!confirm('Delete this note?')) return;
	await removeNote(id);
};

const noteAuthorName = (n) => {
	const a = n?.author;
	if (!a) return 'Member';
	const name = `${a.first_name || ''} ${a.last_name || ''}`.trim();
	return name || 'Member';
};

const formatNoteTime = (n) => {
	if (n.meeting_offset_seconds != null && Number.isFinite(n.meeting_offset_seconds)) {
		const total = n.meeting_offset_seconds;
		const m = Math.floor(total / 60);
		const s = Math.floor(total % 60);
		return `+${m}:${String(s).padStart(2, '0')}`;
	}
	if (!n.date_created) return '';
	try {
		return new Date(n.date_created).toLocaleString(undefined, {
			month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
		});
	} catch { return ''; }
};

// ─── Action item promotion ───
const promoteActionItem = async (idx) => {
	if (promotingIndex.value !== -1) return;
	promotingIndex.value = idx;
	try {
		const res = await $fetch(`/api/video/meetings/${meetingId.value}/promote-action-item`, {
			method: 'POST',
			body: { index: idx },
		});
		// Mutate local copy so the UI hides the button without a full refetch.
		if (meeting.value && res?.data?.action_items) {
			meeting.value.action_items = res.data.action_items;
		}
		toast.add({ title: 'Promoted to task', color: 'green' });
	} catch (err) {
		const msg = err.statusMessage || err.data?.message || err.message || 'Failed to promote';
		toast.add({ title: 'Could not promote', description: msg, color: 'red' });
	} finally {
		promotingIndex.value = -1;
	}
};
</script>

<template>
	<div class="max-w-4xl mx-auto p-4 sm:p-6">
		<!-- Back -->
		<NuxtLink to="/meetings" class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
			<UIcon name="i-heroicons-arrow-left" class="w-3.5 h-3.5" />
			All meetings
		</NuxtLink>

		<div v-if="loading" class="text-center py-12 text-sm text-muted-foreground">Loading…</div>
		<div v-else-if="error" class="ios-card p-8 text-center">
			<div class="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-3">
				<UIcon name="i-heroicons-exclamation-triangle" class="w-6 h-6 text-red-500" />
			</div>
			<p class="text-sm text-foreground">{{ error }}</p>
		</div>

		<template v-else-if="meeting">
			<!-- Header -->
			<div class="ios-card p-5 mb-4">
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<h1 class="text-xl font-semibold text-foreground">{{ meeting.title || 'Untitled meeting' }}</h1>
						<p class="text-[13px] text-muted-foreground mt-1">
							{{ formatDate(meeting.actual_start || meeting.scheduled_start) }}
							<span v-if="meeting.actual_duration_minutes"> · {{ meeting.actual_duration_minutes }} min</span>
						</p>
					</div>
					<span
						:class="['flex-shrink-0 inline-flex items-center px-2.5 h-6 rounded-full text-[10px] font-bold uppercase tracking-wider', toneClass(summaryStatusLabel.tone)]"
					>
						{{ summaryStatusLabel.text }}
					</span>
				</div>

				<!-- Pivots -->
				<div class="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[12px]">
					<NuxtLink
						v-if="projectTitle && projectId"
						:to="`/projects/${projectId}`"
						class="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
					>
						<UIcon name="i-heroicons-folder" class="w-3.5 h-3.5" />
						{{ projectTitle }}
					</NuxtLink>
					<NuxtLink
						v-if="meeting.project_event?.id"
						:to="`/projects/${projectId}/events/${meeting.project_event.id}`"
						class="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
					>
						<UIcon name="i-heroicons-flag" class="w-3.5 h-3.5" />
						{{ meeting.project_event.title }}
					</NuxtLink>
					<span v-if="meeting.related_organization?.name" class="inline-flex items-center gap-1 text-muted-foreground">
						<UIcon name="i-heroicons-building-office" class="w-3.5 h-3.5" />
						{{ meeting.related_organization.name }}
					</span>
				</div>

				<p v-if="meeting.description" class="text-[13px] text-foreground/80 mt-3 pt-3 border-t border-border/30">
					{{ meeting.description }}
				</p>
			</div>

			<!-- Recording -->
			<div v-if="meeting.recording_url" class="ios-card p-5 mb-4">
				<div class="flex items-center justify-between mb-3">
					<h2 class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Recording</h2>
					<a
						:href="meeting.recording_url"
						target="_blank"
						rel="noopener"
						class="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1"
					>
						Open <UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3 h-3" />
					</a>
				</div>
				<video
					:src="meeting.recording_url"
					controls
					class="w-full rounded-lg bg-black aspect-video"
				/>
			</div>

			<!-- Summary -->
			<div class="ios-card p-5 mb-4">
				<div class="flex items-center justify-between mb-2">
					<h2 class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Recap</h2>
					<button
						v-if="canRegenerate"
						:disabled="generating"
						class="inline-flex items-center gap-1 h-7 px-3 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 disabled:opacity-50 transition-colors"
						@click="generateSummary"
					>
						<UIcon
							:name="generating ? 'i-heroicons-arrow-path' : (meeting.summary ? 'i-heroicons-arrow-path-rounded-square' : 'i-heroicons-sparkles')"
							:class="['w-3 h-3', generating ? 'animate-spin' : '']"
						/>
						{{ meeting.summary ? 'Regenerate' : 'Generate' }}
					</button>
				</div>

				<div v-if="meeting.summary" v-html="renderMarkdown(meeting.summary)" class="prose prose-sm max-w-none" />
				<div v-else-if="meeting.summary_status === 'generating' || meeting.summary_status === 'pending'" class="text-sm text-muted-foreground py-4 text-center">
					Earnest is reading the transcript and writing the recap. This usually takes 30-60 seconds.
				</div>
				<div v-else-if="meeting.summary_status === 'failed'" class="text-sm py-4">
					<p class="text-red-500">{{ meeting.summary_error || 'Recap generation failed.' }}</p>
					<p class="text-muted-foreground text-xs mt-1">Click Regenerate to try again.</p>
				</div>
				<div v-else-if="!meeting.transcript_text" class="text-sm text-muted-foreground py-4 text-center">
					No transcript was captured for this meeting. The host can enable transcription from the "..." menu inside the Daily.co prebuilt UI during the call.
				</div>
				<div v-else class="text-sm text-muted-foreground py-4 text-center">
					Transcript is ready — generate a recap to summarize the conversation.
				</div>

				<p v-if="meeting.summary_generated_at" class="text-[10px] text-muted-foreground/70 mt-3 pt-3 border-t border-border/30">
					Generated {{ formatDate(meeting.summary_generated_at) }}
				</p>
			</div>

			<!-- Notes & Decisions (manual capture during the meeting) -->
			<div class="ios-card p-5 mb-4">
				<h2 class="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Notes &amp; Decisions</h2>

				<!-- Capture form -->
				<div class="mb-4">
					<textarea
						v-model="noteDraft"
						rows="2"
						placeholder="Capture a follow-up thought or a decision the team agreed to…"
						class="w-full text-sm resize-none rounded-lg bg-muted/30 border border-border/40 focus:border-primary/40 focus:outline-none px-3 py-2 placeholder:text-muted-foreground/60"
					/>
					<div class="flex items-center gap-1.5 mt-2">
						<button
							class="inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 disabled:opacity-50 transition-colors"
							:disabled="!noteDraft.trim() || noteSubmitting"
							@click="submitNote('note')"
						>
							<UIcon name="i-heroicons-pencil-square" class="w-3 h-3" />
							Note
						</button>
						<button
							class="inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 disabled:opacity-50 transition-colors"
							:disabled="!noteDraft.trim() || noteSubmitting"
							@click="submitNote('decision')"
						>
							<UIcon name="i-heroicons-megaphone" class="w-3 h-3" />
							Decision
						</button>
					</div>
				</div>

				<div v-if="!notes.length" class="text-sm text-muted-foreground py-3 text-center">
					Nothing captured yet for this meeting.
				</div>

				<!-- Decisions group -->
				<div v-if="groupedNotes.decisions.length > 0" class="mb-4">
					<h3 class="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-2">Decisions</h3>
					<ul class="space-y-2">
						<li
							v-for="n in groupedNotes.decisions"
							:key="n.id"
							class="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 group"
						>
							<div class="flex items-start justify-between gap-2">
								<p class="text-[13px] text-foreground whitespace-pre-wrap leading-snug flex-1">{{ n.content }}</p>
								<button
									v-if="n.author?.id === currentUserId"
									class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500 p-0.5 flex-shrink-0"
									title="Delete"
									@click="handleDeleteNote(n.id)"
								>
									<UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5" />
								</button>
							</div>
							<p class="text-[10px] text-muted-foreground mt-1.5">
								{{ noteAuthorName(n) }} · {{ formatNoteTime(n) }}
							</p>
						</li>
					</ul>
				</div>

				<!-- General notes group -->
				<div v-if="groupedNotes.general.length > 0">
					<h3 class="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-2">Notes</h3>
					<ul class="space-y-2">
						<li
							v-for="n in groupedNotes.general"
							:key="n.id"
							class="rounded-lg border border-border/40 p-3 group"
						>
							<div class="flex items-start justify-between gap-2">
								<p class="text-[13px] text-foreground whitespace-pre-wrap leading-snug flex-1">{{ n.content }}</p>
								<button
									v-if="n.author?.id === currentUserId"
									class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500 p-0.5 flex-shrink-0"
									title="Delete"
									@click="handleDeleteNote(n.id)"
								>
									<UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5" />
								</button>
							</div>
							<p class="text-[10px] text-muted-foreground mt-1.5">
								{{ noteAuthorName(n) }} · {{ formatNoteTime(n) }}
							</p>
						</li>
					</ul>
				</div>
			</div>

			<!-- Action items -->
			<div v-if="(meeting.action_items?.length || 0) > 0" class="ios-card p-5 mb-4">
				<h2 class="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Action items</h2>
				<ul class="space-y-2">
					<li
						v-for="(item, i) in meeting.action_items"
						:key="i"
						class="flex items-start gap-2.5 text-sm"
					>
						<UIcon name="i-heroicons-arrow-right-circle" class="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
						<div class="flex-1 min-w-0">
							<p class="text-foreground" :class="item.promoted ? 'line-through text-muted-foreground' : ''">{{ item.description }}</p>
							<p v-if="item.assignee || item.due_date" class="text-[11px] text-muted-foreground mt-0.5">
								<span v-if="item.assignee">@{{ item.assignee }}</span>
								<span v-if="item.assignee && item.due_date"> · </span>
								<span v-if="item.due_date">due {{ item.due_date }}</span>
							</p>
						</div>
						<button
							v-if="!item.promoted"
							:disabled="promotingIndex === i"
							class="flex-shrink-0 inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 disabled:opacity-50 transition-colors"
							@click="promoteActionItem(i)"
						>
							<UIcon
								:name="promotingIndex === i ? 'i-heroicons-arrow-path' : 'i-heroicons-plus'"
								:class="['w-3 h-3', promotingIndex === i ? 'animate-spin' : '']"
							/>
							Task
						</button>
						<span
							v-else
							class="flex-shrink-0 inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-muted/40 text-muted-foreground"
						>
							<UIcon name="i-heroicons-check" class="w-3 h-3" />
							Promoted
						</span>
					</li>
				</ul>
			</div>

			<!-- Attendees -->
			<div v-if="attendeesList.length > 0" class="ios-card p-5 mb-4">
				<h2 class="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Attendees</h2>
				<div class="flex flex-wrap gap-2">
					<span
						v-for="(p, i) in attendeesList"
						:key="i"
						class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/30 text-[12px]"
					>
						<UIcon name="i-heroicons-user" class="w-3.5 h-3.5 text-muted-foreground" />
						<span class="font-medium">{{ p.name }}</span>
						<span class="text-muted-foreground">· {{ p.role }}</span>
					</span>
				</div>
			</div>

			<!-- Transcript -->
			<div v-if="meeting.transcript_text" class="ios-card p-5 mb-4">
				<button
					class="w-full flex items-center justify-between"
					@click="transcriptOpen = !transcriptOpen"
				>
					<h2 class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Transcript</h2>
					<UIcon
						:name="transcriptOpen ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
						class="w-4 h-4 text-muted-foreground"
					/>
				</button>
				<div v-if="transcriptOpen" class="mt-3 pt-3 border-t border-border/30">
					<pre class="text-[12px] leading-relaxed whitespace-pre-wrap text-foreground/80 font-sans">{{ meeting.transcript_text }}</pre>
				</div>
			</div>

			<!-- Discussion (async comments + reactions, polymorphic) -->
			<div class="ios-card p-5">
				<h2 class="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Discussion</h2>
				<CommentsSystem
					collection="video_meetings"
					:item-id="meeting.id"
					:organization-id="meeting.related_organization?.id || null"
				/>
			</div>
		</template>

		<!-- Contextual AI Sidebar -->
		<ClientOnly>
			<AIContextualSidebar
				v-if="sidebarOpen && meeting?.id"
				entity-type="video_meeting"
				:entity-id="meeting.id"
				:entity-label="meeting.title || 'Meeting'"
				@close="closeSidebar"
			/>
			<Transition name="overlay">
				<div v-if="sidebarOpen" class="fixed inset-0 bg-black/20 z-40" @click="closeSidebar" />
			</Transition>
		</ClientOnly>
	</div>
</template>
