<!--
	MeetingWorkspace — shared body for the meeting detail surface.

	Mounted by BOTH `/meetings/[id]` (full-page deep-link receiver) and
	`panels/MeetingPanel.vue` (slide-over) so the two surfaces can't drift.

	`:compact` hides the chrome that the slide-over shell already provides
	(the outer back-link, the inner h1 + date subtitle, the AIContextualSidebar
	overlay — which would render inside the slide-over's transformed container
	instead of at viewport level — see [AppSlideOverShell.vue]). It also skips
	setEntity/clearEntity so the panel doesn't hijack the page-level AI entity
	context. In compact mode, pivot links (project/event/client/contact) push
	their respective slide-over panels instead of route-navigating.
-->
<script setup>
import { sanitizeAgendaHtml } from '~~/shared/sanitize-html';

const props = defineProps({
	meetingId: { type: String, required: true },
	compact: { type: Boolean, default: false },
});

const emit = defineEmits(['loaded', 'back']);

const toast = useToast();
const router = useRouter();
const { push: pushPanel } = useAppSlideOverStack();

const meeting = ref(null);
const loading = ref(true);
const error = ref('');
const generating = ref(false);
const transcriptOpen = ref(false);
const promotingIndex = ref(-1);

// Notes & Decisions
const meetingIdRef = computed(() => props.meetingId);
const { notes, fetchNotes, addNote, removeNote, submitting: noteSubmitting } = useMeetingNotes(meetingIdRef);
const noteDraft = ref('');
const { user: sessionUser, loggedIn } = useUserSession();
const currentUserId = computed(() => loggedIn.value ? sessionUser.value?.id || null : null);

// AI sidebar — only set entity context when running as a full page (not
// inside a slide-over, where the parent surface owns the context).
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();

const fetchMeeting = async () => {
	loading.value = true;
	error.value = '';
	try {
		const res = await $fetch('/api/directus/items', {
			method: 'POST',
			body: {
				collection: 'video_meetings',
				operation: 'get',
				id: props.meetingId,
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
						'project.client.id',
						'project.client.name',
						'project_event.id',
						'project_event.title',
						'project_event.event_date',
						'project_event.project.id',
						'project_event.project.title',
						'client.id',
						'client.name',
						'related_organization.id',
						'related_organization.name',
						'related_contact.id',
						'related_contact.first_name',
						'related_contact.last_name',
						'attendees.id',
						'attendees.attendee_type',
						'attendees.invite_method',
						'attendees.guest_name',
						'attendees.guest_email',
						'attendees.directus_user.id',
						'attendees.directus_user.first_name',
						'attendees.directus_user.last_name',
						'attendees.directus_user.email',
						'attendees.contact.id',
						'attendees.contact.first_name',
						'attendees.contact.last_name',
						'attendees.contact.email',
						'attendees.contact.client.id',
						'attendees.contact.client.name',
					],
				},
			},
		});
		meeting.value = (res && typeof res === 'object' && 'data' in res ? res.data : res) || null;
		if (!meeting.value) error.value = 'Meeting not found';
		if (meeting.value) emit('loaded', meeting.value);
	} catch (err) {
		console.error('[MeetingWorkspace] fetch failed', err);
		error.value = err.statusMessage || err.message || 'Failed to load meeting';
	}
	loading.value = false;
};

watch(() => props.meetingId, fetchMeeting, { immediate: true });

// Hydrate notes once we have a meeting id and again whenever it changes.
watch(() => props.meetingId, async (id) => {
	if (id) await fetchNotes();
}, { immediate: true });

// Adaptive Earnest-AI prompts: derive from real meeting state.
const adaptivePrompts = computed(() => {
	const m = meeting.value;
	if (!m) return [];
	const out = [];

	const items = Array.isArray(m.action_items) ? m.action_items : [];
	const unpromoted = items.filter((i) => !i?.promoted);
	if (unpromoted.length > 0) {
		out.push(`Promote the ${unpromoted.length} unfinished action item${unpromoted.length === 1 ? '' : 's'} into tasks`);
	}

	if (m.summary_status === 'failed') {
		out.push('Retry the AI recap — last attempt failed');
	} else if (!m.summary && m.transcript_text) {
		out.push('Generate a recap from the transcript');
	}

	const projectTitle = m.project?.title || m.project_event?.project?.title;
	if (projectTitle) out.push(`How does this meeting affect the ${projectTitle} timeline?`);

	const eventTitle = m.project_event?.title;
	if (eventTitle) out.push(`What's left before "${eventTitle}" ships?`);

	const clientName = m.client?.name || m.project?.client?.name || m.related_organization?.name;
	if (clientName) out.push(`Draft a follow-up email to ${clientName}`);

	if (chatMessages.value.length > 0) {
		out.push('Pull insights from the in-call chat');
	}

	const decisions = notes.value?.filter?.((n) => n.note_type === 'decision') || [];
	if (decisions.length > 0) {
		out.push(`Summarize the ${decisions.length} decision${decisions.length === 1 ? '' : 's'} we captured`);
	}

	out.push('Summarize the conversation');

	return out.slice(0, 6);
});

// In-call chat log (captured from Daily prebuilt's app-message bus).
const chatMessages = ref([]);
const chatOpen = ref(false);
const fetchChat = async () => {
	if (!props.meetingId) return;
	try {
		const res = await $fetch('/api/directus/items', {
			method: 'POST',
			body: {
				collection: 'meeting_chat_messages',
				operation: 'list',
				query: {
					filter: { meeting: { _eq: props.meetingId } },
					fields: ['id', 'sender_name', 'message', 'sent_at', 'date_created'],
					sort: ['sent_at'],
					limit: 200,
				},
			},
		});
		chatMessages.value = Array.isArray(res?.data) ? res.data : [];
	} catch {
		chatMessages.value = [];
	}
};
watch(() => props.meetingId, async (id) => { if (id) await fetchChat(); }, { immediate: true });

// Register this meeting as the Earnest panel's entity so Ask Earnest works
// against it — with recap-surface adaptive prompts derived from the meeting's
// real action-item counts. Re-runs when the prompts recompute. Skip when
// compact — the parent page owns the entity context.
watch([meeting, adaptivePrompts], ([m, prompts]) => {
	if (props.compact) return;
	if (m?.id) setEntity('video_meeting', String(m.id), m.title || 'Meeting', { surface: 'recap', prompts });
}, { immediate: true });
onBeforeUnmount(() => {
	if (!props.compact) clearEntity();
});

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
		const msg = err.data?.message || err.message || err.statusMessage || 'Failed to generate recap';
		const isNoTranscript = err.statusCode === 409 || /no transcript/i.test(msg);
		toast.add({
			title: isNoTranscript ? 'No transcript yet' : 'Recap failed',
			description: msg,
			color: isNoTranscript ? 'amber' : 'red',
		});
	}
	generating.value = false;
};

// Poll while the recap is queued or generating so the UI keeps up if the
// realtime notification gets dropped (rare but possible).
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

// Realtime — refresh on incoming notification for this meeting.
const notifications = useRealtimeSubscription(
	'directus_notifications',
	['id', 'collection', 'item', 'subject', 'status', 'date_created'],
	{
		_and: [
			{ collection: { _eq: 'video_meetings' } },
			{ item: { _eq: props.meetingId } },
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

const meetingClient = computed(() => {
	const m = meeting.value;
	if (!m) return null;
	if (m.client?.id) return { id: m.client.id, name: m.client.name || 'Client' };
	if (m.project?.client?.id) return { id: m.project.client.id, name: m.project.client.name || 'Client' };
	if (m.related_organization?.name) return { id: null, name: m.related_organization.name };
	return null;
});

// ─── Pivot navigation: push panel in compact mode, land the user in the
//     apps shell with the destination slide-over already open in full-page
//     mode. Standalone /meetings/[id] is a deep-link receiver; any pivot
//     is the user crossing back into interactive app use.
function openProject(id) {
	if (!id) return;
	if (props.compact) pushPanel('work-project', String(id));
	else router.push(`/apps/work?slide=work-project:${id}`);
}
function openEvent(eventId, ev) {
	if (!eventId || !projectId.value) return;
	if (props.compact) {
		const flipFrom = flipPayloadFrom(ev?.currentTarget);
		pushPanel('project-event', String(eventId), { flipFrom });
	} else {
		router.push(
			`/apps/work?slide=work-project:${projectId.value}/project-event:${eventId}`,
		);
	}
}
function openClient(id) {
	if (!id) return;
	if (props.compact) pushPanel('client', String(id));
	else router.push(`/apps/clients?slide=client:${id}`);
}
function openContact(id) {
	if (!id) return;
	if (props.compact) pushPanel('contact', String(id));
	else router.push(`/apps/clients?view=contacts&slide=contact:${id}`);
}

// ─── Attendee chips + contact-insight lookup ───
const attendeeContacts = ref({});

const attendeesList = computed(() => {
	if (!meeting.value) return [];
	const host = [];
	const teammates = [];
	const contactRows = [];
	const guestRows = [];
	const seenUserIds = new Set();
	const seenEmails = new Set();
	const seenContactIds = new Set();

	const claimEmail = (email) => {
		const key = (email || '').toLowerCase();
		if (!key) return true;
		if (seenEmails.has(key)) return false;
		seenEmails.add(key);
		return true;
	};

	const h = meeting.value.host_user;
	if (h && typeof h === 'object') {
		const name = `${h.first_name || ''} ${h.last_name || ''}`.trim() || h.email || 'Host';
		const email = (h.email || '').toLowerCase();
		if (claimEmail(email)) {
			if (h.id) seenUserIds.add(h.id);
			host.push({
				kind: 'host',
				name,
				role: 'Host',
				userId: h.id || null,
				contactId: null,
				clientName: null,
				email,
				isYou: !!(currentUserId.value && h.id === currentUserId.value),
				contact: email ? attendeeContacts.value[email] || null : null,
			});
		}
	}

	for (const a of meeting.value.attendees || []) {
		const u = a.directus_user;
		if (u && typeof u === 'object') {
			if (u.id && seenUserIds.has(u.id)) continue;
			const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'Member';
			const email = (u.email || '').toLowerCase();
			if (!claimEmail(email)) continue;
			if (u.id) seenUserIds.add(u.id);
			teammates.push({
				kind: 'teammate',
				name,
				role: 'Member',
				userId: u.id || null,
				contactId: null,
				clientName: null,
				email,
				isYou: !!(currentUserId.value && u.id === currentUserId.value),
				contact: email ? attendeeContacts.value[email] || null : null,
			});
			continue;
		}

		const c = a.contact;
		if (c && typeof c === 'object' && c.id) {
			if (seenContactIds.has(c.id)) continue;
			const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || a.guest_name || 'Contact';
			const email = (c.email || a.guest_email || '').toLowerCase();
			if (!claimEmail(email)) continue;
			seenContactIds.add(c.id);
			const initial = (c.first_name?.[0] || c.last_name?.[0] || name[0] || '?').toUpperCase();
			contactRows.push({
				kind: 'contact',
				name,
				role: 'Contact',
				userId: null,
				contactId: c.id,
				clientName: c.client?.name || null,
				email,
				isYou: false,
				initial,
				contact: email ? attendeeContacts.value[email] || null : null,
			});
			continue;
		}

		if (a.guest_name || a.guest_email) {
			const email = (a.guest_email || '').toLowerCase();
			if (!claimEmail(email)) continue;
			guestRows.push({
				kind: 'guest',
				name: a.guest_name || a.guest_email || 'Guest',
				role: 'Guest',
				userId: null,
				contactId: null,
				clientName: null,
				email,
				isYou: false,
				contact: email ? attendeeContacts.value[email] || null : null,
			});
		}
	}

	return [...host, ...teammates, ...contactRows, ...guestRows];
});

const { selectedOrg } = useOrganization();
const refreshAttendeeContacts = async () => {
	if (!meeting.value || !selectedOrg.value) return;
	const emails = new Set();
	if (meeting.value.host_user?.email) emails.add(String(meeting.value.host_user.email).toLowerCase());
	for (const a of meeting.value.attendees || []) {
		const e = a.directus_user?.email || a.guest_email;
		if (e) emails.add(String(e).toLowerCase());
	}
	if (!emails.size) { attendeeContacts.value = {}; return; }
	try {
		const res = await $fetch('/api/directus/items', {
			method: 'POST',
			body: {
				collection: 'contacts',
				operation: 'list',
				query: {
					fields: [
						'id', 'first_name', 'last_name', 'email', 'company',
						'category', 'status',
						'last_contacted_at', 'last_contacted_channel',
						'last_opened_at', 'date_updated',
						'client.id', 'client.name',
						'leads.id', 'leads.stage', 'leads.status', 'leads.is_junk',
						'leads.estimated_value', 'leads.actual_value',
					],
					filter: {
						_and: [
							{ organizations: { organizations_id: { _eq: selectedOrg.value } } },
							{ email: { _in: Array.from(emails) } },
						],
					},
					limit: 50,
				},
			},
		});
		const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
		const map = {};
		for (const c of list) {
			const key = (c.email || '').toLowerCase();
			if (key) map[key] = c;
		}
		attendeeContacts.value = map;
	} catch (err) {
		console.warn('[MeetingWorkspace] attendee contact lookup failed', err);
	}
};
watch(() => meeting.value?.id, refreshAttendeeContacts);
watch(selectedOrg, refreshAttendeeContacts);

const selectedAttendee = ref(null);
function openAttendeeInsight(entry) {
	if (!entry?.contact || entry.isYou) return;
	selectedAttendee.value = entry;
}
function closeAttendeeInsight() { selectedAttendee.value = null; }

const selectedAttendeeOpenLeads = computed(() => {
	const leads = selectedAttendee.value?.contact?.leads;
	if (!Array.isArray(leads)) return [];
	return leads.filter((l) => !['won', 'lost'].includes(l.stage) && l.status !== 'archived' && !l.is_junk);
});
const selectedAttendeeWonLeads = computed(() => {
	const leads = selectedAttendee.value?.contact?.leads;
	if (!Array.isArray(leads)) return [];
	return leads.filter((l) => l.stage === 'won');
});
const selectedAttendeePipelineValue = computed(() =>
	selectedAttendeeOpenLeads.value.reduce((sum, l) => sum + (Number(l.estimated_value) || 0), 0),
);
const selectedAttendeeWonValue = computed(() =>
	selectedAttendeeWonLeads.value.reduce((sum, l) => sum + (Number(l.actual_value) || 0), 0),
);
const formatMoney = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(n) || 0);
const formatRelative = (s) => {
	if (!s) return null;
	const d = new Date(s).getTime();
	if (!d) return null;
	const days = Math.round((Date.now() - d) / 86400000);
	if (days === 0) return 'today';
	if (days === 1) return 'yesterday';
	if (days < 30) return `${days}d ago`;
	if (days < 365) return `${Math.round(days / 30)}mo ago`;
	return `${Math.round(days / 365)}y ago`;
};

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

const toneClass = (tone) => softTone(tone);

const canRegenerate = computed(() => meeting.value?.summary_status !== 'generating');

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

// ─── Recordings (pulled live from Daily.co) ───
const recordings = ref([]);
const recordingsLoading = ref(false);
const recordingsError = ref('');
const playingRecordingId = ref(null);
const playingUrl = ref('');
const linkLoadingId = ref('');

const fetchRecordings = async () => {
	if (!props.meetingId) return;
	recordingsLoading.value = true;
	recordingsError.value = '';
	try {
		const res = await $fetch(`/api/video/meetings/${props.meetingId}/recordings`);
		recordings.value = res?.data || [];
	} catch (err) {
		recordingsError.value = err.statusMessage || err.message || 'Could not load recordings';
		recordings.value = [];
	}
	recordingsLoading.value = false;
};

watch(() => props.meetingId, fetchRecordings, { immediate: true });
watch(
	() => meeting.value?.status,
	(s, prev) => { if (s === 'completed' && prev && prev !== 'completed') fetchRecordings(); },
);

const formatRecordingDuration = (secs) => {
	if (!secs || !Number.isFinite(secs)) return '—';
	const m = Math.floor(secs / 60);
	const s = Math.floor(secs % 60);
	return `${m}:${String(s).padStart(2, '0')}`;
};

const formatRecordingDate = (ts) => {
	if (!ts) return '';
	try {
		return new Date(ts * 1000).toLocaleString(undefined, {
			month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
		});
	} catch { return ''; }
};

const playRecording = async (recordingId) => {
	if (linkLoadingId.value) return;
	linkLoadingId.value = recordingId;
	try {
		const res = await $fetch(`/api/video/meetings/${props.meetingId}/recordings/${recordingId}/link`);
		const url = res?.data?.url;
		if (!url) throw new Error('No download link returned');
		playingRecordingId.value = recordingId;
		playingUrl.value = url;
	} catch (err) {
		const msg = err.statusMessage || err.data?.message || err.message || 'Could not load recording';
		toast.add({ title: 'Recording unavailable', description: msg, color: 'red' });
	}
	linkLoadingId.value = '';
};

const downloadRecording = async (recordingId) => {
	if (linkLoadingId.value) return;
	linkLoadingId.value = recordingId;
	try {
		const res = await $fetch(`/api/video/meetings/${props.meetingId}/recordings/${recordingId}/link`);
		const url = res?.data?.url;
		if (!url) throw new Error('No download link returned');
		window.open(url, '_blank', 'noopener');
	} catch (err) {
		const msg = err.statusMessage || err.data?.message || err.message || 'Could not load recording';
		toast.add({ title: 'Download failed', description: msg, color: 'red' });
	}
	linkLoadingId.value = '';
};

// ─── Chat export ───
const downloadChat = () => {
	if (!chatMessages.value.length) return;
	const lines = [
		`Meeting: ${meeting.value?.title || 'Untitled meeting'}`,
		meeting.value?.scheduled_start ? `Scheduled: ${meeting.value.scheduled_start}` : null,
		'',
		...chatMessages.value.map((m) => {
			const ts = m.sent_at || m.date_created;
			const stamp = ts ? `[${new Date(ts).toLocaleTimeString()}] ` : '';
			return `${stamp}${m.sender_name || 'Unknown'}: ${m.message}`;
		}),
	].filter((l) => l !== null);
	const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	const safeTitle = (meeting.value?.title || 'meeting').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
	a.download = `${safeTitle}-chat.txt`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
};

// ─── AI agenda (when description is empty + meeting hasn't started) ───
const generatingAgenda = ref(false);
const acceptingAgenda = ref(false);
const agendaSuggestion = ref(null);

const generateAgenda = async () => {
	if (generatingAgenda.value) return;
	const m = meeting.value;
	if (!m?.title?.trim()) return;
	generatingAgenda.value = true;
	try {
		const attendeeNames = (attendeesList.value || []).map((p) => p.name).filter(Boolean);
		const orgId = selectedOrg.value || m.related_organization?.id;
		const res = await $fetch('/api/ai/generate-agenda', {
			method: 'POST',
			body: {
				organizationId: orgId,
				title: m.title,
				brief: '',
				durationMinutes: m.actual_duration_minutes || 30,
				projectId: projectId.value || null,
				leadId: null,
				attendeeNames,
			},
		});
		agendaSuggestion.value = res?.html || null;
		if (!agendaSuggestion.value) {
			toast.add({ title: 'No agenda returned', color: 'amber' });
		}
	} catch (err) {
		toast.add({
			title: 'Agenda generation failed',
			description: err?.data?.message || err.message || 'Please try again',
			color: 'red',
		});
	}
	generatingAgenda.value = false;
};

const acceptAgenda = async () => {
	if (!agendaSuggestion.value || acceptingAgenda.value) return;
	acceptingAgenda.value = true;
	try {
		await $fetch(`/api/video/meetings/${props.meetingId}`, {
			method: 'PATCH',
			body: { description: agendaSuggestion.value },
		});
		agendaSuggestion.value = null;
		await fetchMeeting();
		toast.add({ title: 'Agenda saved', color: 'green' });
	} catch (err) {
		toast.add({
			title: 'Could not save agenda',
			description: err?.data?.message || err.message || 'Please try again',
			color: 'red',
		});
	}
	acceptingAgenda.value = false;
};

const dismissAgenda = () => { agendaSuggestion.value = null; };

// ─── Manual "End meeting" ───
const ending = ref(false);
const isMeetingHost = computed(() => {
	const hostId = typeof meeting.value?.host_user === 'object'
		? meeting.value.host_user?.id
		: meeting.value?.host_user;
	return !!(currentUserId.value && hostId && hostId === currentUserId.value);
});
const canEndMeeting = computed(() => {
	if (!isMeetingHost.value) return false;
	const s = meeting.value?.status;
	return s === 'in_progress' || s === 'scheduled';
});
const endMeeting = async () => {
	if (!props.meetingId || ending.value) return;
	if (!confirm('Mark this meeting as ended? Status will change to "completed".')) return;
	ending.value = true;
	try {
		const res = await $fetch(`/api/video/meetings/${props.meetingId}/end`, { method: 'POST' });
		if (meeting.value) meeting.value.status = res?.data?.status || 'completed';
		toast.add({ title: 'Meeting ended', color: 'green' });
	} catch (err) {
		const msg = err?.data?.message || err?.message || 'Failed to end meeting';
		toast.add({ title: 'Could not end meeting', description: msg, color: 'red' });
	} finally {
		ending.value = false;
	}
};

// ─── Action item promotion ───
const promoteActionItem = async (idx) => {
	if (promotingIndex.value !== -1) return;
	promotingIndex.value = idx;
	try {
		const res = await $fetch(`/api/video/meetings/${props.meetingId}/promote-action-item`, {
			method: 'POST',
			body: { index: idx },
		});
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

<style scoped>
/* This project doesn't ship the @tailwindcss/typography plugin, so the .prose
   class is a no-op. Restore the bits we actually need for agenda HTML. */
.meeting-prose :deep(ol) { list-style: decimal; padding-left: 1.25rem; margin: 0.5rem 0; }
.meeting-prose :deep(ul) { list-style: disc; padding-left: 1.25rem; margin: 0.5rem 0; }
.meeting-prose :deep(li) { margin: 0.15rem 0; }
.meeting-prose :deep(h3) { font-weight: 600; font-size: 0.95em; margin: 0.85rem 0 0.35rem; }
.meeting-prose :deep(h4) { font-weight: 600; font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-muted-foreground); margin: 0.75rem 0 0.3rem; }
.meeting-prose :deep(p) { margin: 0.35rem 0; }
.meeting-prose :deep(strong) { font-weight: 600; }
</style>

<template>
	<div :class="compact ? '' : 'max-w-4xl mx-auto p-4 sm:p-6'">
		<!-- Back (page mode only) -->
		<!-- allow-legacy-link — full-page mode renders an in-shell back link. -->
		<NuxtLink
			v-if="!compact"
			to="/apps/work?floor=meetings"
			class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4"
		>
			<UIcon name="i-heroicons-arrow-left" class="w-3.5 h-3.5" />
			All meetings
		</NuxtLink>

		<div v-if="loading" class="text-center py-12 text-sm text-muted-foreground">Loading…</div>
		<div v-else-if="error" class="ios-card p-8 text-center">
			<div class="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-3">
				<UIcon name="i-heroicons-exclamation-triangle" class="w-6 h-6 text-destructive" />
			</div>
			<p class="text-sm text-foreground">{{ error }}</p>
		</div>

		<template v-else-if="meeting">
			<!-- Header -->
			<div class="ios-card p-5 mb-4">
				<div class="flex items-start justify-between gap-3">
					<div v-if="!compact" class="min-w-0">
						<h1 class="text-xl font-semibold text-foreground">{{ meeting.title || 'Untitled meeting' }}</h1>
						<p class="text-[13px] text-muted-foreground mt-1">
							{{ formatDate(meeting.actual_start || meeting.scheduled_start) }}
							<span v-if="meeting.actual_duration_minutes"> · {{ meeting.actual_duration_minutes }} min</span>
						</p>
					</div>
					<div v-else class="min-w-0 text-[12px] text-muted-foreground">
						{{ formatDate(meeting.actual_start || meeting.scheduled_start) }}
						<span v-if="meeting.actual_duration_minutes"> · {{ meeting.actual_duration_minutes }} min</span>
					</div>
					<div class="flex flex-shrink-0 items-center gap-2">
						<button
							v-if="canEndMeeting"
							type="button"
							:disabled="ending"
							class="inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-destructive/10 hover:bg-destructive/20 text-destructive disabled:opacity-50 transition-colors"
							title="Mark this meeting as ended (host only)"
							@click="endMeeting"
						>
							<UIcon
								:name="ending ? 'i-heroicons-arrow-path' : 'i-heroicons-stop-circle'"
								:class="['w-3 h-3', ending ? 'animate-spin' : '']"
							/>
							{{ ending ? 'Ending…' : 'End meeting' }}
						</button>
						<span
							:class="['inline-flex items-center px-2.5 h-6 rounded-full text-[10px] font-bold uppercase tracking-wider', toneClass(summaryStatusLabel.tone)]"
						>
							{{ summaryStatusLabel.text }}
						</span>
					</div>
				</div>

				<!-- Pivots -->
				<div class="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[12px]">
					<button
						v-if="projectTitle && projectId"
						type="button"
						class="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
						@click="openProject(projectId)"
					>
						<UIcon name="i-heroicons-folder" class="w-3.5 h-3.5" />
						{{ projectTitle }}
					</button>
					<button
						v-if="meeting.project_event?.id"
						type="button"
						class="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
						@click="openEvent(meeting.project_event.id, $event)"
					>
						<UIcon name="i-heroicons-flag" class="w-3.5 h-3.5" />
						{{ meeting.project_event.title }}
					</button>
					<button
						v-if="meetingClient?.id"
						type="button"
						class="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
						@click="openClient(meetingClient.id)"
					>
						<UIcon name="i-heroicons-building-office" class="w-3.5 h-3.5" />
						{{ meetingClient.name }}
					</button>
					<span v-else-if="meetingClient?.name" class="inline-flex items-center gap-1 text-muted-foreground">
						<UIcon name="i-heroicons-building-office" class="w-3.5 h-3.5" />
						{{ meetingClient.name }}
					</span>
				</div>

				<div
					v-if="meeting.description"
					class="meeting-prose mt-3 pt-3 border-t border-border/30 prose prose-sm max-w-none text-[13px] text-foreground/80"
					v-html="sanitizeAgendaHtml(meeting.description)"
				/>
				<div
					v-else-if="meeting.status === 'scheduled'"
					class="mt-3 pt-3 border-t border-border/30 flex items-center justify-between gap-3"
				>
					<p class="text-[12px] text-muted-foreground italic">No agenda yet.</p>
					<button
						v-if="!agendaSuggestion"
						type="button"
						:disabled="generatingAgenda || !meeting.title?.trim()"
						class="inline-flex items-center gap-1 h-7 px-3 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/10 hover:bg-primary/20 text-primary disabled:opacity-50 transition-colors"
						:title="!meeting.title?.trim() ? 'Add a title first.' : ''"
						@click="generateAgenda"
					>
						<UIcon v-if="generatingAgenda" name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin" />
						<EarnestIcon v-else class="w-3 h-3" />
						{{ generatingAgenda ? 'Generating…' : 'Expand into agenda' }}
					</button>
				</div>

				<!-- Earnest agenda preview -->
				<div
					v-if="agendaSuggestion"
					class="mt-3 pt-3 border-t border-border/30 rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2"
				>
					<div class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
						<EarnestIcon class="w-3 h-3" />
						Suggested agenda
					</div>
					<div
						class="meeting-prose prose prose-sm max-w-none text-[13px] text-foreground"
						v-html="sanitizeAgendaHtml(agendaSuggestion)"
					/>
					<div class="flex items-center gap-2 pt-1">
						<button
							type="button"
							:disabled="acceptingAgenda"
							class="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold transition-colors disabled:opacity-50"
							@click="acceptAgenda"
						>
							{{ acceptingAgenda ? 'Saving…' : 'Accept' }}
						</button>
						<button
							type="button"
							class="px-3 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/60 text-[11px] font-medium text-foreground transition-colors"
							@click="dismissAgenda"
						>
							Dismiss
						</button>
						<span class="ml-auto text-[10px] text-muted-foreground">Sets the meeting description on Accept</span>
					</div>
				</div>
			</div>

			<!-- Recordings -->
			<div
				v-if="recordingsLoading || recordings.length > 0 || recordingsError"
				class="ios-card p-5 mb-4"
			>
				<div class="flex items-center justify-between mb-3">
					<h2 class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
						Recordings
						<span v-if="recordings.length > 0" class="ml-1.5 text-muted-foreground/70 normal-case tracking-normal">({{ recordings.length }})</span>
					</h2>
					<button
						type="button"
						class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground inline-flex items-center gap-1 disabled:opacity-50"
						:disabled="recordingsLoading"
						@click="fetchRecordings"
					>
						<UIcon
							:name="recordingsLoading ? 'i-heroicons-arrow-path' : 'i-heroicons-arrow-path-rounded-square'"
							:class="['w-3 h-3', recordingsLoading ? 'animate-spin' : '']"
						/>
						Refresh
					</button>
				</div>

				<div v-if="recordingsError" class="text-[12px] text-destructive py-2">{{ recordingsError }}</div>

				<div v-else-if="recordingsLoading && recordings.length === 0" class="text-[12px] text-muted-foreground py-3 text-center">
					Checking for recordings…
				</div>

				<ul v-else class="space-y-2">
					<li
						v-for="rec in recordings"
						:key="rec.id"
						class="rounded-lg border border-border/40 p-3"
					>
						<div class="flex items-center justify-between gap-3">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<UIcon name="i-heroicons-video-camera" class="w-4 h-4 text-muted-foreground flex-shrink-0" />
									<span class="text-[13px] font-medium text-foreground">
										{{ formatRecordingDate(rec.start_ts) }}
									</span>
									<span
										v-if="rec.status && rec.status !== 'finished'"
										class="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
										:class="rec.status === 'in-progress' ? 'bg-info/10 text-info' : 'bg-muted/40 text-muted-foreground'"
									>
										{{ rec.status }}
									</span>
								</div>
								<p class="text-[11px] text-muted-foreground mt-0.5 ml-6">
									{{ formatRecordingDuration(rec.duration) }}
									<span v-if="rec.max_participants"> · {{ rec.max_participants }} participants</span>
								</p>
							</div>
							<div class="flex items-center gap-1.5 flex-shrink-0">
								<button
									v-if="rec.status === 'finished'"
									type="button"
									:disabled="linkLoadingId === rec.id"
									class="inline-flex items-center gap-1 h-7 px-3 rounded-full text-[10px] font-bold uppercase tracking-wider bg-success/10 hover:bg-success/20 text-success disabled:opacity-50 transition-colors"
									@click="playRecording(rec.id)"
								>
									<UIcon
										:name="linkLoadingId === rec.id ? 'i-heroicons-arrow-path' : 'i-heroicons-play'"
										:class="['w-3 h-3', linkLoadingId === rec.id ? 'animate-spin' : '']"
									/>
									Play
								</button>
								<button
									v-if="rec.status === 'finished'"
									type="button"
									:disabled="linkLoadingId === rec.id"
									class="inline-flex items-center gap-1 h-7 px-3 rounded-full text-[10px] font-bold uppercase tracking-wider bg-muted/40 hover:bg-muted/60 text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
									@click="downloadRecording(rec.id)"
								>
									<UIcon name="i-heroicons-arrow-down-tray" class="w-3 h-3" />
									Download
								</button>
							</div>
						</div>
						<video
							v-if="playingRecordingId === rec.id && playingUrl"
							:src="playingUrl"
							controls
							autoplay
							class="w-full rounded-lg bg-black aspect-video mt-3"
						/>
					</li>
				</ul>
			</div>

			<!-- Summary -->
			<div class="ios-card p-5 mb-4">
				<div class="flex items-center justify-between mb-2">
					<h2 class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Recap</h2>
					<button
						v-if="canRegenerate"
						:disabled="generating"
						class="inline-flex items-center gap-1 h-7 px-3 rounded-full text-[10px] font-bold uppercase tracking-wider bg-success/10 hover:bg-success/20 text-success disabled:opacity-50 transition-colors"
						@click="generateSummary"
					>
						<UIcon v-if="generating" name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin" />
						<UIcon v-else-if="meeting.summary" name="i-heroicons-arrow-path-rounded-square" class="w-3 h-3" />
						<EarnestIcon v-else class="w-3 h-3" />
						{{ meeting.summary ? 'Regenerate' : meeting.summary_status === 'pending' ? 'Force generate' : 'Generate' }}
					</button>
				</div>

				<div v-if="meeting.summary" v-html="renderMarkdown(meeting.summary)" class="prose prose-sm max-w-none" />
				<div v-else-if="meeting.summary_status === 'generating'" class="text-sm text-muted-foreground py-4 text-center">
					Earnest is reading the transcript and writing the recap. This usually takes 30-60 seconds.
				</div>
				<div v-else-if="meeting.summary_status === 'pending'" class="text-sm text-muted-foreground py-4 text-center">
					Earnest queued the recap.
					<span class="block text-[12px] text-muted-foreground/70 mt-1">If this hangs for more than a minute, click <em>Force generate</em> above to run it now.</span>
				</div>
				<div v-else-if="meeting.summary_status === 'failed'" class="text-sm py-4">
					<p class="text-destructive">{{ meeting.summary_error || 'Recap generation failed.' }}</p>
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

			<!-- Notes & Decisions -->
			<div class="ios-card p-5 mb-4">
				<h2 class="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Notes &amp; Decisions</h2>

				<div class="mb-4">
					<textarea
						v-model="noteDraft"
						rows="2"
						placeholder="Capture a follow-up thought or a decision the team agreed to…"
						class="w-full text-sm resize-none rounded-lg bg-muted/30 border border-border/40 focus:border-primary/40 focus:outline-none px-3 py-2 placeholder:text-muted-foreground/60"
					/>
					<div class="flex items-center gap-1.5 mt-2">
						<button
							class="inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[10px] font-bold uppercase tracking-wider bg-success/10 hover:bg-success/20 text-success disabled:opacity-50 transition-colors"
							:disabled="!noteDraft.trim() || noteSubmitting"
							@click="submitNote('note')"
						>
							<UIcon name="i-heroicons-pencil-square" class="w-3 h-3" />
							Note
						</button>
						<button
							class="inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[10px] font-bold uppercase tracking-wider bg-warning/10 hover:bg-warning/20 text-warning disabled:opacity-50 transition-colors"
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

				<div v-if="groupedNotes.decisions.length > 0" class="mb-4">
					<h3 class="text-[10px] font-bold uppercase tracking-wider text-warning mb-2">Decisions</h3>
					<ul class="space-y-2">
						<li
							v-for="n in groupedNotes.decisions"
							:key="n.id"
							class="rounded-lg border border-warning/20 bg-warning/5 p-3 group"
						>
							<div class="flex items-start justify-between gap-2">
								<p class="text-[13px] text-foreground whitespace-pre-wrap leading-snug flex-1">{{ n.content }}</p>
								<button
									v-if="n.author?.id === currentUserId"
									class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5 flex-shrink-0"
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

				<div v-if="groupedNotes.general.length > 0">
					<h3 class="text-[10px] font-bold uppercase tracking-wider text-success mb-2">Notes</h3>
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
									class="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5 flex-shrink-0"
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
						<UIcon name="i-heroicons-arrow-right-circle" class="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
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
							class="flex-shrink-0 inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-success/10 hover:bg-success/20 text-success disabled:opacity-50 transition-colors"
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
					<template v-for="(p, i) in attendeesList" :key="i">
						<!-- Contact-linked attendee: avatar chip → contact slide-over (or route in full-page mode) -->
						<button
							v-if="p.kind === 'contact' && p.contactId"
							type="button"
							:title="p.clientName ? `${p.name} · ${p.clientName}` : p.name"
							class="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-[12px] transition-colors bg-warning/10 hover:bg-warning/20 ring-1 ring-inset ring-warning/30"
							@click="openContact(p.contactId)"
						>
							<span class="w-5 h-5 rounded-full bg-warning/30 text-warning flex items-center justify-center text-[10px] font-bold">
								{{ p.initial }}
							</span>
							<span class="font-medium text-foreground">{{ p.name }}</span>
							<span v-if="p.clientName" class="text-muted-foreground text-[11px]">· {{ p.clientName }}</span>
						</button>

						<component
							v-else
							:is="(p.contact && !p.isYou) ? 'button' : 'span'"
							:class="[
								'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] transition-colors',
								(p.contact && !p.isYou)
									? 'bg-muted/40 hover:bg-muted/70 cursor-pointer ring-1 ring-inset ring-border/40'
									: 'bg-muted/30',
							]"
							:title="(p.contact && !p.isYou) ? 'Open contact insights' : undefined"
							@click="(p.contact && !p.isYou) && openAttendeeInsight(p)"
						>
							<UIcon name="i-heroicons-user" class="w-3.5 h-3.5 text-muted-foreground" />
							<span class="font-medium">{{ p.name }}<span v-if="p.isYou" class="text-muted-foreground/70 font-normal"> (you)</span></span>
							<span class="text-muted-foreground">· {{ p.role }}</span>
							<UIcon
								v-if="p.contact && !p.isYou"
								name="i-heroicons-arrow-top-right-on-square"
								class="w-3 h-3 text-muted-foreground/60"
							/>
						</component>
					</template>
				</div>
			</div>

			<!-- Attendee insight modal -->
			<Teleport to="body">
				<Transition name="fade">
					<div
						v-if="selectedAttendee?.contact"
						class="fixed inset-0 z-[80] flex items-center justify-center p-4"
					>
						<div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeAttendeeInsight" />
						<div class="relative w-full max-w-md ios-card p-5 space-y-4 bg-background">
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<h3 class="text-base font-semibold truncate">
										{{ selectedAttendee.contact.first_name }} {{ selectedAttendee.contact.last_name }}
									</h3>
									<p v-if="selectedAttendee.contact.email" class="text-xs text-muted-foreground truncate">{{ selectedAttendee.contact.email }}</p>
									<p v-if="selectedAttendee.contact.company" class="text-xs text-muted-foreground/80 truncate mt-0.5">{{ selectedAttendee.contact.company }}</p>
								</div>
								<button class="p-1.5 rounded-lg hover:bg-muted/60" @click="closeAttendeeInsight">
									<UIcon name="i-heroicons-x-mark" class="w-5 h-5" />
								</button>
							</div>

							<div class="flex flex-wrap gap-2">
								<ContactsContactCategoryBadge v-if="selectedAttendee.contact.category" :category="selectedAttendee.contact.category" show-icon />
								<ContactsContactStatusBadge v-if="selectedAttendee.contact.status" :status="selectedAttendee.contact.status" />
								<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/40 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
									{{ selectedAttendee.role }}
								</span>
							</div>

							<div class="grid grid-cols-2 gap-3 pt-2 border-t border-border/30">
								<div>
									<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Open leads</p>
									<p class="text-sm font-medium">{{ selectedAttendeeOpenLeads.length }}<span v-if="selectedAttendeePipelineValue" class="text-muted-foreground font-normal"> · {{ formatMoney(selectedAttendeePipelineValue) }}</span></p>
								</div>
								<div>
									<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Won deals</p>
									<p class="text-sm font-medium">{{ selectedAttendeeWonLeads.length }}<span v-if="selectedAttendeeWonValue" class="text-muted-foreground font-normal"> · {{ formatMoney(selectedAttendeeWonValue) }}</span></p>
								</div>
								<div>
									<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Last contacted</p>
									<p class="text-sm font-medium">
										{{ formatRelative(selectedAttendee.contact.last_contacted_at || selectedAttendee.contact.last_opened_at) || '—' }}
										<span v-if="selectedAttendee.contact.last_contacted_channel" class="text-muted-foreground/70 font-normal text-[11px]">· {{ selectedAttendee.contact.last_contacted_channel }}</span>
									</p>
								</div>
								<div>
									<p class="text-[10px] uppercase tracking-wider text-muted-foreground">Linked client</p>
									<p class="text-sm font-medium truncate">{{ selectedAttendee.contact.client?.name || '—' }}</p>
								</div>
							</div>

							<div class="flex justify-between items-center gap-2 pt-3 border-t border-border/30">
								<a
									v-if="selectedAttendee.contact.email"
									:href="`mailto:${selectedAttendee.contact.email}`"
									class="text-xs text-muted-foreground hover:text-foreground"
								>
									Email
								</a>
								<button
									type="button"
									class="inline-flex items-center gap-1 text-xs font-medium text-white bg-primary hover:bg-primary/90 px-3 py-1.5 rounded-full"
									@click="() => { const id = selectedAttendee.contact.id; closeAttendeeInsight(); openContact(id); }"
								>
									Open contact
									<UIcon name="i-heroicons-arrow-right" class="w-3 h-3" />
								</button>
							</div>
						</div>
					</div>
				</Transition>
			</Teleport>

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

			<!-- In-call chat log -->
			<div v-if="chatMessages.length > 0" class="ios-card p-5 mb-4">
				<div class="flex items-center justify-between">
					<button class="flex items-center gap-2" @click="chatOpen = !chatOpen">
						<h2 class="text-xs font-bold uppercase tracking-wider text-muted-foreground">
							In-call Chat <span class="text-muted-foreground/60 ml-1">({{ chatMessages.length }})</span>
						</h2>
						<UIcon
							:name="chatOpen ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
							class="w-4 h-4 text-muted-foreground"
						/>
					</button>
					<button
						class="inline-flex items-center gap-1 h-7 px-3 rounded-full text-[10px] font-bold uppercase tracking-wider bg-muted/40 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
						title="Download chat transcript as a text file"
						@click="downloadChat"
					>
						<UIcon name="i-heroicons-arrow-down-tray" class="w-3 h-3" />
						Download
					</button>
				</div>
				<div v-if="chatOpen" class="mt-3 pt-3 border-t border-border/30 space-y-2.5 max-h-96 overflow-y-auto">
					<div
						v-for="m in chatMessages"
						:key="m.id"
						class="flex gap-2 text-[12px] leading-relaxed"
					>
						<span class="font-semibold text-foreground/90 whitespace-nowrap">{{ m.sender_name || 'Unknown' }}:</span>
						<span class="text-foreground/70 whitespace-pre-wrap break-words">{{ m.message }}</span>
					</div>
				</div>
			</div>

			<!-- Discussion -->
			<div class="ios-card p-5">
				<h2 class="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Discussion</h2>
				<CommentsSystem
					collection="video_meetings"
					:item-id="meeting.id"
					:organization-id="meeting.related_organization?.id || null"
				/>
			</div>
		</template>

	</div>
</template>
