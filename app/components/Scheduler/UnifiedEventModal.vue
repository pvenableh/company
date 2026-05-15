<!-- components/Scheduler/UnifiedEventModal.vue -->
<!-- Universal event/meeting creation modal.
     Shows/hides fields based on is_video toggle.
     Supports: CRM lead link, team/client member search, external guest invites. -->
<script setup lang="ts">
import { format, set } from 'date-fns';
import { LEAD_STAGE_COLORS } from '~~/shared/leads';

const props = defineProps<{
	modelValue: boolean;
	selectedDate?: Date;
	defaultVideo?: boolean;
	// Edit-mode handles. Pass `appointment` when the calendar source is an
	// appointment row; pass `meeting` when editing a video meeting directly.
	// If only `appointment` is given and `appointment.video_meeting` is
	// populated, we treat it as a video-meeting edit.
	appointment?: any;
	meeting?: any;
	// Optional context pre-fill for "Schedule meeting" launchers that already
	// know about a lead or project (e.g. /leads/[id], /projects/Overview).
	leadId?: number | string | null;
	leadData?: any;
	projectId?: string | null;
	projectData?: any;
}>();

const emit = defineEmits(['update:modelValue', 'created', 'saved', 'deleted']);

const toast = useToast();
const { user } = useDirectusAuth();
const appointmentsDirectusUsersItems = useDirectusItems('appointments_directus_users');
const projectsItems = useDirectusItems('projects');
const { filteredUsers, fetchFilteredUsers, loading: loadingUsers } = useFilteredUsers();
const { getLeads } = useLeads();
const { getContacts } = useContacts();
const { selectedOrg } = useOrganization();

const saving = ref(false);
const deleting = ref(false);
// Drives the inline send-invite form (rendered above the footer in edit mode).
const showSendInvite = ref(false);

// ── AI agenda generation ──
// Suggestion lives in a preview card above the description until the host
// accepts (replaces the description) or dismisses (drops the suggestion).
const generatingAgenda = ref(false);
const agendaSuggestion = ref<string | null>(null);

const generateAgenda = async () => {
	if (generatingAgenda.value) return;
	generatingAgenda.value = true;
	try {
		const attendeeNames = [
			...form.members.map(m => m.label),
			...form.contacts.map(c => c.label),
			...form.guests.filter(g => g.name).map(g => g.name),
		];
		const res = await $fetch<{ html: string }>('/api/ai/generate-agenda', {
			method: 'POST',
			body: {
				organizationId: selectedOrg.value,
				title: form.title,
				brief: stripHtml(form.description),
				durationMinutes: form.duration,
				projectId: props.projectId || form.project?.id || null,
				leadId: form.related_lead?.id || null,
				attendeeNames,
			},
		});
		agendaSuggestion.value = res.html || null;
		if (!agendaSuggestion.value) {
			toast.add({ title: 'No agenda returned', color: 'amber' });
		}
	} catch (err: any) {
		toast.add({ title: 'Agenda generation failed', description: err?.data?.message || err.message, color: 'red' });
	} finally {
		generatingAgenda.value = false;
	}
};

const acceptAgenda = () => {
	if (!agendaSuggestion.value) return;
	form.description = agendaSuggestion.value;
	agendaSuggestion.value = null;
};

const dismissAgenda = () => { agendaSuggestion.value = null; };

// Strip HTML for the brief sent to the LLM — Tiptap stores formatted HTML
// but the model only needs the plain intent.
const stripHtml = (html: string) => {
	if (!html) return '';
	if (typeof DOMParser === 'undefined') return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
	const doc = new DOMParser().parseFromString(html, 'text/html');
	return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
};

// Old USelect bug stored `meeting_type` as `{label, value}` (sometimes JSON
// stringified). Pull the `value` out so a corrupted row still renders the
// correct option instead of falling through to the "Select…" placeholder.
function unwrapLegacyMeetingType(raw: any): string | null {
	if (raw == null) return null;
	if (typeof raw === 'object' && 'value' in raw) return String(raw.value);
	if (typeof raw === 'string') {
		try {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === 'object' && 'value' in parsed) return String(parsed.value);
		} catch {}
		return raw;
	}
	return null;
}

// Plan-aware recording/transcription defaults. Free tier disables both
// checkboxes; solo+ unlocks transcription by default; studio+ also turns on
// cloud recording. Resolved server-side off the org's plan + per-org overrides.
const FALLBACK_DEFAULTS = {
	recording: false,
	transcription: false,
	recordingAvailable: false,
	transcriptionAvailable: false,
	recordingCostNote: '~$0.59/hr per participant (Daily cloud recording)',
	transcriptionCostNote: '~$0.26/hr per meeting (Deepgram)',
};
const meetingDefaults = ref({ ...FALLBACK_DEFAULTS });

const fetchMeetingDefaults = async () => {
	if (!selectedOrg.value) {
		meetingDefaults.value = { ...FALLBACK_DEFAULTS };
		return;
	}
	try {
		const res = await $fetch<{ data: typeof FALLBACK_DEFAULTS }>('/api/video/meeting-defaults', {
			params: { organization: selectedOrg.value },
		});
		meetingDefaults.value = { ...FALLBACK_DEFAULTS, ...(res?.data ?? {}) };
	} catch {
		meetingDefaults.value = { ...FALLBACK_DEFAULTS };
	}
};

// ── Modal open/close ──
const isOpen = computed({
	get: () => props.modelValue,
	set: (v) => emit('update:modelValue', v),
});

const close = () => {
	isOpen.value = false;
	showSendInvite.value = false;
};

// ── Form state ──
// `members` = Directus users (teammates). `contacts` = picker-added Directus
// contacts (render as compact avatar chips, persisted with a `contact` FK on
// video_meeting_attendees so we can round-trip them on edit). `guests` =
// manually-typed externals with no contact record (render as editable cards).
type ContactChip = { id: string; first_name: string; last_name: string; email: string; phone?: string; avatar_initial?: string; client_name?: string | null; label: string };
const form = reactive({
	title: '',
	description: '',
	is_video: true,
	meeting_type: 'general',
	date: '',
	time: '09:00',
	duration: 30,
	waiting_room_enabled: false,
	recording_enabled: false,
	transcription_enabled: false,
	related_lead: null as any,
	// Resolved project + client. `client_name` is shown next to the project as a
	// small badge so the meeting's billing/account context is obvious. Server
	// derives `video_meetings.client` from this; manual client-only picks aren't
	// supported yet.
	project: null as null | { id: string; title: string; client_id?: string | null; client_name?: string | null },
	members: [] as Array<{ id: string; first_name: string; last_name: string; email: string; avatar?: string; label: string }>,
	contacts: [] as ContactChip[],
	guests: [] as Array<{ name: string; email: string; phone: string; invite_method: string }>,
});

// ── Options ──
const durationOptions = [
	{ label: '15 minutes', value: 15 },
	{ label: '30 minutes', value: 30 },
	{ label: '45 minutes', value: 45 },
	{ label: '60 minutes', value: 60 },
	{ label: '90 minutes', value: 90 },
];

const meetingTypeOptions = [
	{ label: 'Consultation', value: 'consultation' },
	{ label: 'Discovery Call', value: 'discovery' },
	{ label: 'Project Review', value: 'project_review' },
	{ label: 'Presentation', value: 'presentation' },
	{ label: 'General', value: 'general' },
];

const inviteMethodOptions = [
	{ label: 'Email', value: 'email' },
	{ label: 'SMS', value: 'sms' },
	{ label: 'Both', value: 'both' },
	{ label: "Don't send", value: 'none' },
];

// ── Lead search ──
const leadSearch = ref('');
const leadResults = ref<any[]>([]);
const showLeadDropdown = ref(false);
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

const debouncedSearchLeads = () => {
	if (searchTimeout) clearTimeout(searchTimeout);
	searchTimeout = setTimeout(async () => {
		if (!leadSearch.value.trim()) { leadResults.value = []; return; }
		try {
			const results = await getLeads({ search: leadSearch.value });
			leadResults.value = (results || []).slice(0, 8);
		} catch { leadResults.value = []; }
	}, 300);
};

const getLeadContactName = (lead: any) => {
	if (!lead?.related_contact) return 'Unknown Lead';
	return `${lead.related_contact.first_name || ''} ${lead.related_contact.last_name || ''}`.trim() || 'Unknown';
};

const selectLead = (lead: any) => {
	form.related_lead = lead;
	leadSearch.value = '';
	showLeadDropdown.value = false;
	leadResults.value = [];
	// Auto-add lead contact as a guest
	if (lead.related_contact) {
		const name = getLeadContactName(lead);
		const email = lead.related_contact.email || '';
		const alreadyAdded = form.guests.some(g => g.email === email && email);
		if (!alreadyAdded && (name || email)) {
			form.guests.push({ name, email, phone: lead.related_contact.phone || '', invite_method: 'email' });
		}
	}
};

const clearLead = () => { form.related_lead = null; };

// ── Project search ──
// Picking a project also auto-derives the meeting's client (the server mirrors
// project.client onto video_meetings.client). Pinned (read-only) when the
// modal was launched with a projectId — that context shouldn't be reassignable.
const projectSearch = ref('');
const projectResults = ref<any[]>([]);
const showProjectDropdown = ref(false);
let projectSearchTimer: ReturnType<typeof setTimeout> | null = null;

const projectPinned = computed(() => !!props.projectId);

// Compact mode: project/lead picker inputs stay collapsed behind a "+ Add" pill
// until clicked. Once a value is selected, the chip replaces the pill — clearing
// the chip (X) returns to the pill state.
const showProjectField = ref(false);
const showLeadField = ref(false);

// Meeting Settings popover (waiting room / recording / transcription).
const showSettings = ref(false);
const settingsCount = computed(() => {
	let n = 0;
	if (form.waiting_room_enabled) n++;
	if (form.recording_enabled) n++;
	if (form.transcription_enabled) n++;
	return n;
});

const debouncedSearchProjects = () => {
	if (projectSearchTimer) clearTimeout(projectSearchTimer);
	projectSearchTimer = setTimeout(async () => {
		const q = projectSearch.value.trim();
		if (!q) { projectResults.value = []; return; }
		try {
			const results: any[] = await projectsItems.list({
				fields: ['id', 'title', 'status', 'client.id', 'client.name'],
				filter: { title: { _icontains: q } },
				limit: 8,
			});
			projectResults.value = results || [];
		} catch { projectResults.value = []; }
	}, 250);
};

const selectProject = (proj: any) => {
	const clientId = typeof proj.client === 'object' ? proj.client?.id : proj.client;
	const clientName = typeof proj.client === 'object' ? proj.client?.name : null;
	form.project = { id: proj.id, title: proj.title || 'Project', client_id: clientId || null, client_name: clientName || null };
	projectSearch.value = '';
	showProjectDropdown.value = false;
	projectResults.value = [];
};

const clearProject = () => { form.project = null; };

// ── Member search (team/client Directus users) ──
const memberSearch = ref('');
const showMemberDropdown = ref(false);

const memberSearchResults = computed(() => {
	if (!memberSearch.value.trim()) return [];
	const q = memberSearch.value.toLowerCase();
	const memberIds = new Set(form.members.map(m => m.id));
	return filteredUsers.value
		.filter(u => !memberIds.has(u.id) && u.id !== user.value?.id)
		.filter(u => u.label?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
		.slice(0, 8);
});

const addMember = (member: any) => {
	form.members.push({ id: member.id, first_name: member.first_name, last_name: member.last_name, email: member.email, avatar: member.avatar, label: member.label });
	memberSearch.value = '';
	showMemberDropdown.value = false;
};

const removeMember = (id: string) => {
	form.members = form.members.filter(m => m.id !== id);
};

// ── Contact search (Directus contacts → external guests) ──
// The member input doubles as a contact picker so users can pull a contact
// (e.g. Stacey Duncan) onto a meeting without typing name/email manually.
// Contacts land in `form.guests` since they aren't Directus users.
const contactSearchResults = ref<any[]>([]);
let contactSearchTimer: ReturnType<typeof setTimeout> | null = null;

// The meeting's client (auto-filled server-side from project.client). When the
// search returns contacts across multiple clients, the ones whose
// `contact.client.id` matches this one are surfaced first with a CLIENT badge.
const meetingClientId = computed<string | null>(() => {
	const fromAppointment = props.appointment?.video_meeting?.client;
	const fromMeeting = props.meeting?.client;
	const raw = fromAppointment ?? fromMeeting ?? null;
	if (!raw) return null;
	return typeof raw === 'object' ? raw.id || null : raw;
});

watch(memberSearch, (q) => {
	if (contactSearchTimer) clearTimeout(contactSearchTimer);
	if (!q.trim()) { contactSearchResults.value = []; return; }
	contactSearchTimer = setTimeout(async () => {
		try {
			const { data } = await getContacts({ search: q.trim(), limit: 8 });
			const addedEmails = new Set(form.guests.map(g => (g.email || '').toLowerCase()).filter(Boolean));
			const addedContactIds = new Set(form.contacts.map(c => c.id));
			const filtered = data.filter((c: any) => {
				if (addedContactIds.has(c.id)) return false;
				const email = (c.email || '').toLowerCase();
				return !email || !addedEmails.has(email);
			});
			// Partition: contacts that belong to the meeting's client come first.
			// Stable order within each group preserves the API's relevance sort.
			const targetClient = meetingClientId.value;
			if (targetClient) {
				const matches: any[] = [];
				const rest: any[] = [];
				for (const c of filtered) {
					const cClientId = typeof c.client === 'object' ? c.client?.id : c.client;
					if (cClientId && cClientId === targetClient) matches.push(c);
					else rest.push(c);
				}
				contactSearchResults.value = [...matches, ...rest];
			} else {
				contactSearchResults.value = filtered;
			}
		} catch {
			contactSearchResults.value = [];
		}
	}, 250);
});

const addContact = (contact: any) => {
	const name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
		|| contact.email
		|| 'Contact';
	const clientName = contact.client && typeof contact.client === 'object' ? contact.client.name || null : null;
	form.contacts.push({
		id: contact.id,
		first_name: contact.first_name || '',
		last_name: contact.last_name || '',
		email: contact.email || '',
		phone: contact.phone || '',
		avatar_initial: (contact.first_name || contact.email || '?')[0]?.toUpperCase() || '?',
		client_name: clientName,
		label: name,
	});
	memberSearch.value = '';
	showMemberDropdown.value = false;
	contactSearchResults.value = [];
};

const removeContact = (id: string) => {
	form.contacts = form.contacts.filter(c => c.id !== id);
};

// Pre-load existing video_meeting_attendees for edit mode. Attendees with a
// `contact` FK come back as avatar chips in form.contacts; attendees without a
// contact link land in form.guests as editable cards (preserves the old free-
// form invite UX). `attendee_type: 'user'` rows are skipped — teammates ride
// in via loadExistingMembers off the appointment's junction.
const meetingAttendeesItems = useDirectusItems('video_meeting_attendees');
const loadExistingAttendees = async (meetingId: string) => {
	try {
		const rows: any[] = await meetingAttendeesItems.list({
			filter: { video_meeting: { _eq: meetingId } },
			fields: [
				'id',
				'attendee_type',
				'guest_name',
				'guest_email',
				'guest_phone',
				'invite_method',
				'contact.id',
				'contact.first_name',
				'contact.last_name',
				'contact.email',
				'contact.phone',
				'contact.client.id',
				'contact.client.name',
			],
			limit: -1,
		});
		const contactChips: ContactChip[] = [];
		const guestRows: Array<{ name: string; email: string; phone: string; invite_method: string }> = [];
		for (const row of rows) {
			if (row.attendee_type === 'user') continue;
			const c = typeof row.contact === 'object' ? row.contact : null;
			if (c && c.id) {
				const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email || 'Contact';
				contactChips.push({
					id: c.id,
					first_name: c.first_name || '',
					last_name: c.last_name || '',
					email: c.email || '',
					phone: c.phone || '',
					avatar_initial: (c.first_name || c.email || '?')[0]?.toUpperCase() || '?',
					client_name: c.client && typeof c.client === 'object' ? c.client.name || null : null,
					label: name,
				});
			} else if (row.guest_name || row.guest_email) {
				guestRows.push({
					name: row.guest_name || '',
					email: row.guest_email || '',
					phone: row.guest_phone || '',
					invite_method: row.invite_method || 'email',
				});
			}
		}
		form.contacts = contactChips;
		form.guests = guestRows;
	} catch (err) {
		console.error('[UnifiedEventModal] failed to load existing attendees:', err);
	}
};

// Pre-load members linked to the appointment for edit mode. Reads the
// junction directly and resolves each user's name/email so the chips render
// the same way as the picker.
const loadExistingMembers = async (appointmentId: string) => {
	try {
		const rows: any[] = await appointmentsDirectusUsersItems.list({
			filter: { appointments_id: { _eq: appointmentId } },
			fields: [
				'id',
				'directus_users_id.id',
				'directus_users_id.first_name',
				'directus_users_id.last_name',
				'directus_users_id.email',
				'directus_users_id.avatar',
			],
			limit: -1,
		});
		form.members = rows
			.map((r) => r.directus_users_id)
			.filter((u: any) => u && u.id && u.id !== user.value?.id)
			.map((u: any) => ({
				id: u.id,
				first_name: u.first_name || '',
				last_name: u.last_name || '',
				email: u.email || '',
				avatar: u.avatar || undefined,
				label: `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'Member',
			}));
	} catch (err) {
		console.error('[UnifiedEventModal] failed to load existing members:', err);
	}
};

const getAvatarUrl = (member: any) => {
	if (!member?.avatar) return null;
	return `${useRuntimeConfig().public.directusUrl}/assets/${member.avatar}?key=small`;
};

// ── External guests ──
const addGuest = () => {
	form.guests.push({ name: '', email: '', phone: '', invite_method: 'email' });
};

const removeGuest = (index: number) => {
	form.guests.splice(index, 1);
};

// ── Close dropdown on outside click ──
if (import.meta.client) {
	document.addEventListener('click', () => {
		showLeadDropdown.value = false;
		showMemberDropdown.value = false;
		showProjectDropdown.value = false;
	});
}

// ── Host display ──
// Server pins host_user to session.user on create. On edit we surface the
// stored host_user/host_identity instead so it's clear who owns the meeting
// even when a teammate is editing.
const hostDisplay = computed<{ name: string; initial: string; avatar: string | null; isMe: boolean }>(() => {
	const m = editingMeeting.value as any;
	if (m) {
		const hu = m.host_user;
		if (hu && typeof hu === 'object') {
			const name = `${hu.first_name || ''} ${hu.last_name || ''}`.trim() || hu.email || m.host_identity || 'Host';
			return {
				name,
				initial: (hu.first_name || hu.email || name || '?')[0]?.toUpperCase() || '?',
				avatar: hu.avatar ? `${useRuntimeConfig().public.directusUrl}/assets/${hu.avatar}?key=small` : null,
				isMe: hu.id === user.value?.id,
			};
		}
		if (m.host_identity) {
			return { name: m.host_identity, initial: m.host_identity[0]?.toUpperCase() || '?', avatar: null, isMe: false };
		}
	}
	const u = user.value as any;
	const name = u ? (`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'You') : 'You';
	return {
		name,
		initial: (u?.first_name || u?.email || name || '?')[0]?.toUpperCase() || '?',
		avatar: u?.avatar ? `${useRuntimeConfig().public.directusUrl}/assets/${u.avatar}?key=small` : null,
		isMe: true,
	};
});

// Resolve the edit-mode video meeting (if any). Either `meeting` is passed
// directly or the caller passed an appointment whose `video_meeting` relation
// is populated.
const editingMeeting = computed(() =>
	props.meeting
	|| (props.appointment && typeof props.appointment.video_meeting === 'object' ? props.appointment.video_meeting : null),
);
const isEditingVideo = computed(() => !!editingMeeting.value);
const isEditingAppointment = computed(() => !!props.appointment && !isEditingVideo.value);
const isEditing = computed(() => isEditingVideo.value || isEditingAppointment.value);

// ── Reset form on open ──
watch(isOpen, async (open) => {
	if (open) {
		const d = props.selectedDate || new Date();
		const defaultTime = new Date();
		defaultTime.setHours(defaultTime.getHours() + 1, 0, 0, 0);

		const m = editingMeeting.value;

		form.title = m?.title || props.appointment?.title || '';
		form.description = m?.description || props.appointment?.description || '';
		form.is_video = m
			? true
			: props.appointment
				? (props.appointment.is_video ?? false)
				: (props.defaultVideo ?? true);
		// Unwrap legacy meeting_type values: an older version of USelect was
		// emitting the entire `{label, value}` option object as the v-model,
		// which got stored verbatim (sometimes as JSON string, sometimes as a
		// nested object after Directus round-trip). Pull `.value` back out so
		// the new select renders the right option instead of "Select…".
		form.meeting_type = unwrapLegacyMeetingType(m?.meeting_type) || 'general';

		// Normalize Directus naive datetimes to UTC ISO before parsing — otherwise
		// `new Date("2026-05-11T17:00:00")` is treated as local time and the edit
		// modal pulls in a tz-offset shift.
		const sourceStart = normalizeDirectusDate(m?.scheduled_start) || normalizeDirectusDate(props.appointment?.start_time);
		const startDate = sourceStart ? new Date(sourceStart) : d;
		form.date = format(startDate, 'yyyy-MM-dd');
		form.time = sourceStart ? format(new Date(sourceStart), 'HH:mm') : format(defaultTime, 'HH:mm');
		const aptStart = normalizeDirectusDate(props.appointment?.start_time);
		const aptEnd = normalizeDirectusDate(props.appointment?.end_time);
		form.duration = m?.duration_minutes
			|| (aptStart && aptEnd
				? Math.max(15, Math.round((new Date(aptEnd).getTime() - new Date(aptStart).getTime()) / 60000))
				: 30);

		form.waiting_room_enabled = !!m?.waiting_room_enabled;
		form.recording_enabled = !!m?.recording_enabled;
		form.transcription_enabled = !!m?.transcription_enabled;

		// Lead context: prefer explicit prop, then the editing meeting, then
		// the appointment row.
		const seedLead = props.leadData
			|| (props.appointment?.related_lead && typeof props.appointment.related_lead === 'object' ? props.appointment.related_lead : null)
			|| (m?.related_lead && typeof m.related_lead === 'object' ? m.related_lead : null)
			|| null;
		form.related_lead = seedLead;
		form.members = [];
		form.contacts = [];
		form.guests = [];
		leadSearch.value = '';
		memberSearch.value = '';
		projectSearch.value = '';
		agendaSuggestion.value = null;
		generatingAgenda.value = false;
		showProjectField.value = false;
		showLeadField.value = false;
		showSettings.value = false;

		// Seed project from (in priority): launcher-pinned projectData, an
		// expanded project object on the meeting/appointment, or — when only an
		// ID is present — a one-shot fetch to resolve the title + client.
		let seedProject: any = null;
		if (props.projectData) {
			seedProject = props.projectData;
		} else if (m?.project && typeof m.project === 'object') {
			seedProject = m.project;
		} else if (props.appointment?.video_meeting?.project && typeof props.appointment.video_meeting.project === 'object') {
			seedProject = props.appointment.video_meeting.project;
		}
		const seedProjectId: string | null = props.projectId
			|| (typeof seedProject?.id === 'string' ? seedProject.id : null)
			|| (typeof m?.project === 'string' ? m.project : null)
			|| (typeof props.appointment?.video_meeting?.project === 'string' ? props.appointment.video_meeting.project : null);
		if (seedProject && seedProject.id && (seedProject.title || seedProject.client)) {
			form.project = {
				id: seedProject.id,
				title: seedProject.title || 'Project',
				client_id: typeof seedProject.client === 'object' ? seedProject.client?.id : seedProject.client || null,
				client_name: typeof seedProject.client === 'object' ? seedProject.client?.name : null,
			};
		} else if (seedProjectId) {
			form.project = { id: seedProjectId, title: 'Project', client_id: null, client_name: null };
			try {
				const proj: any = await projectsItems.readOne(seedProjectId, {
					fields: ['id', 'title', 'client.id', 'client.name'],
				});
				if (proj) {
					form.project = {
						id: proj.id,
						title: proj.title || 'Project',
						client_id: typeof proj.client === 'object' ? proj.client?.id : null,
						client_name: typeof proj.client === 'object' ? proj.client?.name : null,
					};
				}
			} catch (err) {
				console.warn('[UnifiedEventModal] failed to hydrate project on open:', err);
			}
		} else {
			form.project = null;
		}

		// In edit mode, pre-populate members from the appointment's junction so
		// the host can add/remove without losing existing teammates. Also pull
		// existing video_meeting_attendees so picker-added contacts come back as
		// avatar chips and manual guests come back as editable cards.
		const editAppointmentId = m?.related_appointment?.id
			|| m?.related_appointment
			|| props.appointment?.id;
		if (isEditing.value && editAppointmentId) {
			await loadExistingMembers(editAppointmentId);
		}
		if (isEditingVideo.value && m?.id) {
			await loadExistingAttendees(m.id);
		}

		// Auto-add the lead contact as a guest on initial open, like the
		// retired NewMeetingModal did.
		if (seedLead?.related_contact && !isEditing.value) {
			const name = `${seedLead.related_contact.first_name || ''} ${seedLead.related_contact.last_name || ''}`.trim();
			const email = seedLead.related_contact.email || '';
			if (name || email) {
				form.guests.push({
					name,
					email,
					phone: seedLead.related_contact.phone || '',
					invite_method: 'email',
				});
			}
		}

		fetchFilteredUsers();

		// Plan-aware defaults only apply to *new* meetings; in edit mode the
		// saved values already populated above are what the row is set to.
		await fetchMeetingDefaults();
		if (!isEditing.value) {
			form.recording_enabled = meetingDefaults.value.recording;
			form.transcription_enabled = meetingDefaults.value.transcription;
		}
	}
});

// Re-resolve defaults if the active org changes mid-modal.
watch(selectedOrg, () => {
	if (isOpen.value) fetchMeetingDefaults();
});

// ── Submit ──
const handleSubmit = async () => {
	if (!form.title.trim()) {
		toast.add({ title: 'Title is required', color: 'red' });
		return;
	}

	saving.value = true;

	try {
		const startTime = new Date(`${form.date}T${form.time}`);
		const endTime = new Date(startTime.getTime() + form.duration * 60000);

		if (form.is_video) {
			const validGuests = form.guests.filter(g => g.name || g.email);
			const contactPayload = form.contacts.map(c => ({
				contact_id: c.id,
				name: c.label,
				email: c.email,
				phone: c.phone || '',
				invite_method: c.email ? 'email' : 'none',
			}));

			if (isEditingVideo.value) {
				// ── Edit: update the existing meeting row + Daily room ──
				const meetingId = editingMeeting.value!.id;
				await $fetch(`/api/video/meetings/${meetingId}`, {
					method: 'PATCH',
					body: {
						title: form.title,
						description: form.description,
						meeting_type: form.meeting_type,
						scheduled_start: startTime.toISOString(),
						duration: form.duration,
						waiting_room_enabled: form.waiting_room_enabled,
						recording_enabled: form.recording_enabled,
						transcription_enabled: form.transcription_enabled,
						related_lead: form.related_lead?.id || null,
						project: props.projectId || form.project?.id || null,
						members: form.members.map(m => m.id),
						contacts: contactPayload,
						attendees: validGuests,
					},
				});
				toast.add({ title: 'Meeting updated', color: 'green' });
				emit('saved', { id: meetingId });
			} else {
				// ── Create: POST to create-room (mints Daily room + appointment) ──
				const first = validGuests[0];
				const response = await $fetch('/api/video/create-room', {
					method: 'POST',
					body: {
						title: form.title,
						description: form.description,
						meeting_type: form.meeting_type,
						scheduled_start: startTime.toISOString(),
						duration: form.duration,
						waiting_room_enabled: form.waiting_room_enabled,
						recording_enabled: form.recording_enabled,
						transcription_enabled: form.transcription_enabled,
						related_lead: form.related_lead?.id || null,
						project: props.projectId || form.project?.id || null,
						organization: selectedOrg.value || null,
						invitee_name: first?.name || undefined,
						invitee_email: first?.email || undefined,
						invitee_phone: first?.phone || undefined,
						invite_method: first?.invite_method || 'none',
						attendees: validGuests,
						contacts: contactPayload,
						members: form.members.map(m => m.id),
					},
				});

				if (response.data?.meetingLink) {
					await navigator.clipboard.writeText(response.data.meetingLink);
				}

				toast.add({ title: 'Video meeting created!', description: 'Link copied to clipboard', color: 'green' });
				emit('created', response.data);
			}
		} else {
			// Create / update non-video appointment via server routes. Members
			// are now plumbed through the API so the server fans out
			// invited/removed/time_changed notifications instead of the client
			// writing junction rows directly.
			const appointmentData = {
				title: form.title,
				description: form.description,
				start_time: format(startTime, "yyyy-MM-dd'T'HH:mm:ss"),
				end_time: format(endTime, "yyyy-MM-dd'T'HH:mm:ss"),
				status: 'pending',
				is_video: false,
			};

			if (props.appointment) {
				await $fetch(`/api/appointments/${props.appointment.id}`, {
					method: 'PATCH',
					body: {
						...appointmentData,
						members: form.members.map(m => m.id),
					},
				});
				toast.add({ title: 'Appointment updated', color: 'green' });
				emit('saved');
			} else {
				const created = await $fetch<{ id: string }>('/api/appointments', {
					method: 'POST',
					body: {
						...appointmentData,
						members: form.members.map(m => m.id),
					},
				});

				toast.add({ title: 'Appointment created', color: 'green' });
				emit('created', created);
			}
		}

		close();
	} catch (error: any) {
		toast.add({ title: 'Error', description: error.message, color: 'red' });
	}

	saving.value = false;
};

const deleteMeeting = async () => {
	const isVideo = isEditingVideo.value && !!editingMeeting.value?.id;
	const isAppt = isEditingAppointment.value && !!props.appointment?.id;
	if (!isVideo && !isAppt) return;
	const confirmMsg = isVideo
		? 'Delete this meeting? The Daily room and linked appointment will also be removed. This cannot be undone.'
		: 'Delete this event? Anyone linked will be notified. This cannot be undone.';
	if (!window.confirm(confirmMsg)) return;
	deleting.value = true;
	try {
		if (isVideo) {
			await $fetch(`/api/video/meetings/${editingMeeting.value!.id}`, { method: 'DELETE' });
			toast.add({ title: 'Meeting deleted', color: 'green' });
			emit('deleted', { id: editingMeeting.value!.id });
			emit('saved', { id: editingMeeting.value!.id });
		} else {
			await $fetch(`/api/appointments/${props.appointment!.id}`, { method: 'DELETE' });
			toast.add({ title: 'Event deleted', color: 'green' });
			emit('deleted', { id: props.appointment!.id });
			emit('saved', { id: props.appointment!.id });
		}
		close();
	} catch (error: any) {
		toast.add({ title: 'Delete failed', description: error.message, color: 'red' });
	} finally {
		deleting.value = false;
	}
};

// Shape needed by SchedulerSendInvitePopover. Pulled off whichever source the
// modal is editing — the meeting row wins, with the appointment as fallback.
const sendInviteMeeting = computed(() => {
	const m = editingMeeting.value;
	if (!m) return null;
	return {
		id: m.id,
		room_name: m.room_name || props.appointment?.room_name || null,
		title: m.title || props.appointment?.title || '',
		scheduled_start: m.scheduled_start || props.appointment?.start_time || null,
		scheduled_end: m.scheduled_end || props.appointment?.end_time || null,
		host_name: m.host_identity || null,
		invitee_name: m.invitee_name || null,
		invitee_email: m.invitee_email || null,
		invitee_phone: m.invitee_phone || null,
	};
});
</script>

<template>
	<UModal v-model="isOpen" :ui="{ base: 'overflow-hidden', rounded: 'rounded-2xl', shadow: 'shadow-lg', ring: '', background: 'bg-card', padding: '', width: 'max-w-lg' }">
		<div class="flex flex-col max-h-[calc(100vh-4rem)]">
			<!-- Header (fixed) -->
			<div class="flex-shrink-0 px-5 py-3.5 border-b border-border/30 flex items-center">
				<span class="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/70">
					<template v-if="isEditingVideo">Edit Video Meeting</template>
					<template v-else-if="isEditingAppointment">Edit Event</template>
					<template v-else-if="form.is_video">New Video Meeting</template>
					<template v-else>New Event</template>
				</span>
			</div>

			<!-- Form (scrollable) -->
			<form @submit.prevent="handleSubmit" class="p-5 space-y-5 overflow-y-auto flex-1">
				<!-- Pinned project context (modal launched from a project page) -->
				<div v-if="projectPinned && form.project" class="flex items-center gap-2 px-3 py-2 bg-info/5 border border-info/20 rounded-lg">
					<UIcon name="i-heroicons-folder" class="w-4 h-4 text-info shrink-0" />
					<span class="text-xs font-medium text-foreground">{{ form.project.title }}</span>
					<span class="text-[9px] uppercase tracking-wider text-muted-foreground">Project</span>
					<span v-if="form.project.client_name" class="ml-auto text-[9px] uppercase tracking-wider text-info/70">{{ form.project.client_name }}</span>
				</div>

				<!-- Type + Video toggle -->
				<div class="flex items-center gap-4">
					<UFormGroup v-if="form.is_video" label="Type" class="flex-1">
						<USelect v-model="form.meeting_type" :options="meetingTypeOptions" />
					</UFormGroup>
					<div class="flex items-center gap-2.5 flex-shrink-0" :class="{ 'flex-1': !form.is_video }">
						<UToggle v-model="form.is_video" />
						<span class="text-[12px] font-medium text-foreground whitespace-nowrap">Video Meeting</span>
					</div>
				</div>

				<!-- Title -->
				<UFormGroup label="Title" required>
					<UInput v-model="form.title" placeholder="Meeting title" />
				</UFormGroup>

				<!-- Date / Time / Duration -->
				<div class="grid grid-cols-3 gap-3">
					<UFormGroup label="Date" required>
						<UInput v-model="form.date" type="date" />
					</UFormGroup>
					<UFormGroup label="Time" required>
						<UInput v-model="form.time" type="time" />
					</UFormGroup>
					<UFormGroup label="Duration">
						<USelect v-model="form.duration" :options="durationOptions" />
					</UFormGroup>
				</div>

				<!-- Description — formatted via Tiptap. The host writes a brief
				     (a sentence of intent) and can click ✨ Expand into agenda to
				     have AI turn it into a structured agenda. -->
				<div class="space-y-2">
					<div class="flex items-center justify-between gap-2">
						<label class="text-[11px] font-medium text-foreground/80">Description</label>
						<button
							v-if="form.is_video"
							type="button"
							:disabled="generatingAgenda || !form.title.trim()"
							@click="generateAgenda"
							:title="!form.title.trim() ? 'Add a title first — the AI uses it to steer the agenda.' : ''"
							class="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-[0.06em] text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
						>
							<UIcon v-if="generatingAgenda" name="i-heroicons-arrow-path" class="w-3 h-3 animate-spin" />
							<UIcon v-else name="i-heroicons-sparkles" class="w-3 h-3" />
							{{ generatingAgenda ? 'Generating…' : 'Expand into agenda' }}
						</button>
					</div>

					<!-- AI suggestion preview — sits above the field until accepted or dismissed -->
					<div
						v-if="agendaSuggestion"
						class="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2"
					>
						<div class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
							<UIcon name="i-heroicons-sparkles" class="w-3 h-3" />
							Suggested agenda
						</div>
						<div class="prose prose-sm max-w-none text-[12px] text-foreground" v-html="agendaSuggestion" />
						<div class="flex items-center gap-2 pt-1">
							<button
								type="button"
								@click="acceptAgenda"
								class="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold transition-colors ios-press"
							>
								Accept
							</button>
							<button
								type="button"
								@click="dismissAgenda"
								class="px-3 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/60 text-[11px] font-medium text-foreground transition-colors ios-press"
							>
								Dismiss
							</button>
							<span class="ml-auto text-[10px] text-muted-foreground">Replaces description on Accept</span>
						</div>
					</div>

					<FormTiptap
						v-model="form.description"
						height="min-h-16"
						custom-classes="p-3"
						:character-limit="0"
						:show-char-count="false"
						:allow-uploads="false"
					/>
				</div>

				<!-- Compact picker + settings row (video only) -->
				<template v-if="form.is_video">
					<div class="flex flex-wrap items-center gap-1.5">
						<!-- Project pill / chip — collapsed by default; expands to the
						     search field on click; replaced by a chip once selected. -->
						<button
							v-if="!projectPinned && !form.project && !showProjectField"
							type="button"
							@click="showProjectField = true"
							class="flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-border/60 text-[11px] font-medium text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
						>
							<UIcon name="i-heroicons-folder" class="w-3 h-3" />
							Project
						</button>
						<div v-if="!projectPinned && form.project" class="flex items-center gap-1.5 pl-2 pr-1.5 py-1 bg-info/5 border border-info/20 rounded-full">
							<UIcon name="i-heroicons-folder" class="w-3 h-3 text-info" />
							<span class="text-[11px] font-medium text-foreground truncate max-w-[150px]">{{ form.project.title }}</span>
							<span v-if="form.project.client_name" class="text-[9px] uppercase tracking-wider text-info/70 truncate max-w-[100px]">{{ form.project.client_name }}</span>
							<button type="button" class="text-muted-foreground hover:text-foreground" @click="clearProject">
								<UIcon name="i-heroicons-x-mark" class="w-3 h-3" />
							</button>
						</div>

						<!-- Lead pill / chip -->
						<button
							v-if="!form.related_lead && !showLeadField"
							type="button"
							@click="showLeadField = true"
							class="flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-border/60 text-[11px] font-medium text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
							title="Connects this meeting to a CRM pipeline lead — notes and outcomes auto-log to the lead timeline."
						>
							<UIcon name="i-heroicons-funnel" class="w-3 h-3" />
							Lead
						</button>
						<div v-if="form.related_lead" class="flex items-center gap-1.5 pl-2 pr-1.5 py-1 bg-muted/20 rounded-full">
							<span class="w-2 h-2 rounded-full" :style="{ backgroundColor: LEAD_STAGE_COLORS[form.related_lead.stage] || '#9CA3AF' }" />
							<span class="text-[11px] font-medium text-foreground truncate max-w-[150px]">{{ getLeadContactName(form.related_lead) }}</span>
							<button type="button" class="text-muted-foreground hover:text-foreground" @click="clearLead">
								<UIcon name="i-heroicons-x-mark" class="w-3 h-3" />
							</button>
						</div>

						<!-- Meeting Settings popover -->
						<UPopover v-model:open="showSettings" :popper="{ placement: 'bottom-start', offsetDistance: 6 }">
							<button
								type="button"
								class="flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-border/60 text-[11px] font-medium text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
								:class="{ '!border-solid !border-primary/30 !bg-primary/5 !text-primary': settingsCount > 0 }"
							>
								<UIcon name="i-heroicons-cog-6-tooth" class="w-3 h-3" />
								Settings
								<span v-if="settingsCount > 0" class="ml-0.5 text-[9px] font-semibold">{{ settingsCount }}</span>
							</button>
							<template #content>
								<div class="w-72 p-3 space-y-3">
									<UCheckbox v-model="form.waiting_room_enabled" label="Enable waiting room" />
									<div>
										<UCheckbox
											v-model="form.recording_enabled"
											:disabled="!meetingDefaults.recordingAvailable"
											label="Cloud recording"
										/>
										<p class="ml-6 text-[10px] text-muted-foreground">
											<template v-if="meetingDefaults.recordingAvailable">{{ meetingDefaults.recordingCostNote }}</template>
											<template v-else>
												<UIcon name="i-heroicons-lock-closed" class="w-3 h-3 inline -mt-0.5" />
												Upgrade to a paid plan to record meetings
											</template>
										</p>
									</div>
									<div>
										<UCheckbox
											v-model="form.transcription_enabled"
											:disabled="!meetingDefaults.transcriptionAvailable"
											label="Live transcription + AI recap"
										/>
										<p class="ml-6 text-[10px] text-muted-foreground">
											<template v-if="meetingDefaults.transcriptionAvailable">{{ meetingDefaults.transcriptionCostNote }}</template>
											<template v-else>
												<UIcon name="i-heroicons-lock-closed" class="w-3 h-3 inline -mt-0.5" />
												Upgrade to a paid plan for live transcripts
											</template>
										</p>
									</div>
								</div>
							</template>
						</UPopover>
					</div>

					<!-- Expanded project search (only when pill was clicked, no value yet) -->
					<div v-if="!projectPinned && showProjectField && !form.project" class="relative" @click.stop>
						<UInput
							v-model="projectSearch"
							placeholder="Search projects..."
							size="sm"
							icon="i-heroicons-folder"
							autofocus
							@input="debouncedSearchProjects"
							@focus="showProjectDropdown = true"
							@blur="() => { if (!projectSearch) showProjectField = false; }"
						/>
						<div
							v-if="showProjectDropdown && projectResults.length > 0"
							class="absolute z-50 mt-1 w-full bg-card border border-border/50 rounded-xl shadow-lg overflow-hidden"
						>
							<div
								v-for="proj in projectResults"
								:key="proj.id"
								class="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 cursor-pointer transition-colors text-sm"
								@click="selectProject(proj)"
							>
								<UIcon name="i-heroicons-folder" class="w-3.5 h-3.5 text-info shrink-0" />
								<span class="font-medium text-foreground">{{ proj.title }}</span>
								<span v-if="proj.client && proj.client.name" class="text-[10px] uppercase tracking-wider text-muted-foreground ml-auto">{{ proj.client.name }}</span>
							</div>
						</div>
					</div>

					<!-- Expanded lead search -->
					<div v-if="showLeadField && !form.related_lead" class="relative" @click.stop>
						<UInput
							v-model="leadSearch"
							placeholder="Search leads..."
							size="sm"
							icon="i-heroicons-funnel"
							autofocus
							@input="debouncedSearchLeads"
							@focus="showLeadDropdown = true"
							@blur="() => { if (!leadSearch) showLeadField = false; }"
						/>
						<div
							v-if="showLeadDropdown && leadResults.length > 0"
							class="absolute z-50 mt-1 w-full bg-card border border-border/50 rounded-xl shadow-lg overflow-hidden"
						>
							<div
								v-for="lead in leadResults"
								:key="lead.id"
								class="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 cursor-pointer transition-colors text-sm"
								@click="selectLead(lead)"
							>
								<span class="w-2 h-2 rounded-full flex-shrink-0" :style="{ backgroundColor: LEAD_STAGE_COLORS[lead.stage] || '#9CA3AF' }" />
								<span class="font-medium text-foreground">{{ getLeadContactName(lead) }}</span>
								<span class="text-xs text-muted-foreground">{{ lead.related_contact?.company || '' }}</span>
							</div>
						</div>
					</div>
				</template>

				<!-- Members section header + host row -->
				<label class="block text-[11px] font-medium text-foreground/80 pt-1">Members</label>

				<!-- Host row — read-only. Server pins host_user to the creator on
				     create; in edit mode we show whoever the meeting is owned by. -->
				<div class="flex items-center gap-2.5 px-2.5 py-1.5 bg-muted/15 rounded-lg">
					<template v-if="hostDisplay.avatar">
						<UAvatar :src="hostDisplay.avatar" :alt="hostDisplay.name" size="2xs" />
					</template>
					<span v-else class="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
						{{ hostDisplay.initial }}
					</span>
					<div class="flex items-baseline gap-2 min-w-0">
						<span class="text-[12px] font-medium text-foreground truncate">{{ hostDisplay.name }}</span>
						<span v-if="hostDisplay.isMe" class="text-[9px] uppercase tracking-wider text-muted-foreground/70">You</span>
					</div>
					<span class="ml-auto text-[9px] font-semibold uppercase tracking-[0.08em] text-warning dark:text-warning">Host</span>
				</div>

				<!-- Team / Client Members + Contact search -->
				<div class="relative" @click.stop>
					<UInput
						v-model="memberSearch"
						placeholder="Add teammate or contact..."
						size="sm"
						icon="i-heroicons-users"
						@focus="showMemberDropdown = true"
					/>
					<div
						v-if="showMemberDropdown && (memberSearchResults.length > 0 || contactSearchResults.length > 0)"
						class="absolute z-50 mt-1 w-full bg-card border border-border/50 rounded-xl shadow-lg overflow-hidden max-h-80 overflow-y-auto"
					>
						<template v-if="memberSearchResults.length > 0">
							<div class="px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">Teammates</div>
							<div
								v-for="member in memberSearchResults"
								:key="`u-${member.id}`"
								class="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/40 cursor-pointer transition-colors"
								@click="addMember(member)"
							>
								<UAvatar :src="getAvatarUrl(member)" :alt="member.label" size="2xs" />
								<div class="flex-1 min-w-0">
									<span class="text-[12px] font-medium text-foreground">{{ member.label }}</span>
									<span class="text-[10px] text-muted-foreground ml-2">{{ member.email }}</span>
								</div>
							</div>
						</template>
						<template v-if="contactSearchResults.length > 0">
							<div class="px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">Contacts</div>
							<div
								v-for="contact in contactSearchResults"
								:key="`c-${contact.id}`"
								class="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/40 cursor-pointer transition-colors"
								@click="addContact(contact)"
							>
								<span class="w-6 h-6 rounded-full bg-warning text-white flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
									{{ (contact.first_name || contact.email || '?')[0].toUpperCase() }}
								</span>
								<div class="flex-1 min-w-0">
									<div class="flex items-baseline gap-2 min-w-0">
										<span class="text-[12px] font-medium text-foreground truncate">{{ `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.email }}</span>
										<span v-if="contact.email" class="hidden sm:inline text-[10px] text-muted-foreground truncate">{{ contact.email }}</span>
									</div>
									<div
										v-if="contact.client && typeof contact.client === 'object' && contact.client.name"
										class="flex items-center gap-1.5 mt-0.5 min-w-0"
									>
										<span class="text-[8px] font-semibold uppercase tracking-[0.08em] text-primary/70 truncate">{{ contact.client.name }}</span>
										<span
											v-if="meetingClientId && contact.client.id === meetingClientId"
											class="text-[7px] font-bold uppercase tracking-[0.1em] px-1 py-0.5 rounded bg-warning/15 text-warning flex-shrink-0"
										>Client</span>
									</div>
								</div>
							</div>
						</template>
					</div>
				</div>

				<!-- Added members + contacts -->
				<div v-if="form.members.length > 0 || form.contacts.length > 0" class="flex flex-wrap gap-1.5">
					<div
						v-for="member in form.members"
						:key="`m-${member.id}`"
						class="flex items-center gap-1.5 pl-1 pr-2 py-1 bg-muted/20 rounded-full"
					>
						<UAvatar :src="getAvatarUrl(member)" :alt="member.label" size="3xs" />
						<span class="text-[11px] font-medium text-foreground">{{ member.label }}</span>
						<button type="button" @click="removeMember(member.id)" class="text-muted-foreground hover:text-foreground">
							<UIcon name="i-heroicons-x-mark" class="w-3 h-3" />
						</button>
					</div>
					<div
						v-for="contact in form.contacts"
						:key="`c-${contact.id}`"
						class="flex items-center gap-1.5 pl-1 pr-2 py-1 bg-warning/10 rounded-full"
						:title="contact.client_name ? `${contact.label} · ${contact.client_name}` : contact.label"
					>
						<span class="w-5 h-5 rounded-full bg-warning text-white flex items-center justify-center text-[9px] font-semibold flex-shrink-0">
							{{ contact.avatar_initial }}
						</span>
						<span class="text-[11px] font-medium text-foreground">{{ contact.label }}</span>
						<button type="button" @click="removeContact(contact.id)" class="text-muted-foreground hover:text-foreground">
							<UIcon name="i-heroicons-x-mark" class="w-3 h-3" />
						</button>
					</div>
				</div>

				<!-- External Guests -->
				<div v-if="form.guests.length > 0" class="space-y-3">
					<div
						v-for="(guest, index) in form.guests"
						:key="index"
						class="relative p-3 bg-muted/15 rounded-xl space-y-3"
					>
						<button
							type="button"
							@click="removeGuest(index)"
							class="absolute top-2 right-2 p-1 rounded-md hover:bg-muted/30 transition-colors"
						>
							<UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5 text-muted-foreground" />
						</button>
						<div class="grid grid-cols-2 gap-3 pr-6">
							<UFormGroup label="Name">
								<UInput v-model="guest.name" placeholder="Guest name" size="sm" />
							</UFormGroup>
							<UFormGroup label="Email">
								<UInput v-model="guest.email" type="email" placeholder="guest@example.com" size="sm" />
							</UFormGroup>
						</div>
						<div v-if="form.is_video" class="grid grid-cols-2 gap-3">
							<UFormGroup label="Phone">
								<UInput v-model="guest.phone" type="tel" placeholder="+1 (555) 000-0000" size="sm" />
							</UFormGroup>
							<UFormGroup label="Send Invite">
								<USelect v-model="guest.invite_method" :options="inviteMethodOptions" size="sm" />
							</UFormGroup>
						</div>
					</div>
				</div>

				<button
					type="button"
					@click="addGuest"
					class="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border/50 text-[12px] font-medium text-muted-foreground hover:bg-muted/20 hover:text-foreground transition-colors ios-press"
				>
					<UIcon name="i-heroicons-plus" class="w-3.5 h-3.5" />
					Add External Guest
				</button>

				<!-- Inline send-invite form (edit mode for video meetings) -->
				<SchedulerSendInvitePopover
					v-if="isEditingVideo && sendInviteMeeting"
					v-model="showSendInvite"
					:meeting="sendInviteMeeting"
					inline
				/>

				<!-- Actions -->
				<div class="flex items-center gap-2 pt-2">
					<!-- Edit-mode video meeting tools (left) -->
					<template v-if="isEditingVideo && sendInviteMeeting">
						<button
							type="button"
							@click="showSendInvite = !showSendInvite"
							class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium transition-colors ios-press"
							:class="showSendInvite
								? 'bg-primary/10 text-primary'
								: 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'"
						>
							<UIcon name="i-heroicons-paper-airplane" class="w-3.5 h-3.5" />
							{{ showSendInvite ? 'Hide invite' : 'Send invite' }}
						</button>
						<button
							type="button"
							@click="deleteMeeting"
							:disabled="deleting"
							class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium text-destructive hover:bg-destructive/10 transition-colors ios-press disabled:opacity-50"
						>
							<UIcon v-if="deleting" name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin" />
							<UIcon v-else name="i-heroicons-trash" class="w-3.5 h-3.5" />
							Delete
						</button>
					</template>
					<!-- Edit-mode non-video event: just the delete button -->
					<template v-else-if="isEditingAppointment">
						<button
							type="button"
							@click="deleteMeeting"
							:disabled="deleting"
							class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium text-destructive hover:bg-destructive/10 transition-colors ios-press disabled:opacity-50"
						>
							<UIcon v-if="deleting" name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin" />
							<UIcon v-else name="i-heroicons-trash" class="w-3.5 h-3.5" />
							Delete
						</button>
					</template>
					<div class="ml-auto flex items-center gap-2">
						<button
							type="button"
							@click="close"
							class="px-4 py-2 rounded-xl bg-muted/30 hover:bg-muted/60 text-sm font-medium text-foreground transition-colors ios-press"
						>
							Cancel
						</button>
						<button
							type="submit"
							:disabled="saving"
							class="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium transition-colors ios-press disabled:opacity-50"
						>
							<UIcon v-if="saving" name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin" />
							{{ isEditing ? 'Save' : 'Create' }}
						</button>
					</div>
				</div>
			</form>
		</div>
	</UModal>
</template>
