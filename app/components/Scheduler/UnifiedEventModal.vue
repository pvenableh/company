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
const { filteredUsers, fetchFilteredUsers, loading: loadingUsers } = useFilteredUsers();
const { getLeads } = useLeads();
const { selectedOrg } = useOrganization();

const saving = ref(false);
const deleting = ref(false);
// Drives the inline send-invite form (rendered above the footer in edit mode).
const showSendInvite = ref(false);

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
	// Team/client members (Directus users)
	members: [] as Array<{ id: string; first_name: string; last_name: string; email: string; avatar?: string; label: string }>,
	// External guests (non-Directus users)
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
	});
}

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
		form.guests = [];
		leadSearch.value = '';
		memberSearch.value = '';

		// In edit mode, pre-populate members from the appointment's junction so
		// the host can add/remove without losing existing teammates.
		const editAppointmentId = m?.related_appointment?.id
			|| m?.related_appointment
			|| props.appointment?.id;
		if (isEditing.value && editAppointmentId) {
			await loadExistingMembers(editAppointmentId);
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
						project: props.projectId || null,
						members: form.members.map(m => m.id),
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
						project: props.projectId || null,
						organization: selectedOrg.value || null,
						invitee_name: first?.name || undefined,
						invitee_email: first?.email || undefined,
						invitee_phone: first?.phone || undefined,
						invite_method: first?.invite_method || 'none',
						attendees: validGuests,
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
				<!-- Project context badge -->
				<div v-if="projectData" class="flex items-center gap-2 px-3 py-2 bg-cyan-500/5 border border-cyan-500/20 rounded-lg">
					<UIcon name="i-heroicons-folder" class="w-4 h-4 text-cyan-500 shrink-0" />
					<span class="text-xs font-medium text-foreground">{{ projectData.title }}</span>
					<span class="text-[9px] uppercase tracking-wider text-muted-foreground">Project</span>
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

				<!-- Description -->
				<UFormGroup label="Description">
					<UTextarea v-model="form.description" placeholder="Agenda or notes..." rows="2" />
				</UFormGroup>

				<!-- CRM Lead Link (video only) -->
				<template v-if="form.is_video">
					<div class="flex items-center gap-3">
						<div class="flex-1 h-px bg-border/30" />
						<span class="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">CRM</span>
						<div class="flex-1 h-px bg-border/30" />
					</div>

					<div class="relative" @click.stop>
						<UInput
							v-model="leadSearch"
							placeholder="Link to lead..."
							size="sm"
							icon="i-heroicons-funnel"
							@input="debouncedSearchLeads"
							@focus="showLeadDropdown = true"
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
						<div v-if="form.related_lead" class="flex items-center gap-2 mt-2 px-2.5 py-1.5 bg-muted/20 rounded-lg">
							<span class="w-2 h-2 rounded-full" :style="{ backgroundColor: LEAD_STAGE_COLORS[form.related_lead.stage] || '#9CA3AF' }" />
							<span class="text-xs font-medium text-foreground">{{ getLeadContactName(form.related_lead) }}</span>
							<button type="button" class="ml-auto text-muted-foreground hover:text-foreground" @click="clearLead">
								<UIcon name="i-heroicons-x-mark" class="w-3 h-3" />
							</button>
						</div>
					</div>

					<div class="space-y-2">
						<UCheckbox v-model="form.waiting_room_enabled" label="Enable waiting room" />
						<div>
							<UCheckbox
								v-model="form.recording_enabled"
								:disabled="!meetingDefaults.recordingAvailable"
								label="Cloud recording"
							/>
							<p class="ml-6 text-[11px] text-muted-foreground">
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
							<p class="ml-6 text-[11px] text-muted-foreground">
								<template v-if="meetingDefaults.transcriptionAvailable">{{ meetingDefaults.transcriptionCostNote }}</template>
								<template v-else>
									<UIcon name="i-heroicons-lock-closed" class="w-3 h-3 inline -mt-0.5" />
									Upgrade to a paid plan for live transcripts
								</template>
							</p>
						</div>
					</div>
				</template>

				<!-- People -->
				<div class="flex items-center gap-3">
					<div class="flex-1 h-px bg-border/30" />
					<span class="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">People</span>
					<div class="flex-1 h-px bg-border/30" />
				</div>

				<!-- Team / Client Members -->
				<div class="relative" @click.stop>
					<UInput
						v-model="memberSearch"
						placeholder="Add team or client member..."
						size="sm"
						icon="i-heroicons-users"
						@focus="showMemberDropdown = true"
					/>
					<div
						v-if="showMemberDropdown && memberSearchResults.length > 0"
						class="absolute z-50 mt-1 w-full bg-card border border-border/50 rounded-xl shadow-lg overflow-hidden"
					>
						<div
							v-for="member in memberSearchResults"
							:key="member.id"
							class="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/40 cursor-pointer transition-colors"
							@click="addMember(member)"
						>
							<UAvatar :src="getAvatarUrl(member)" :alt="member.label" size="2xs" />
							<div class="flex-1 min-w-0">
								<span class="text-[12px] font-medium text-foreground">{{ member.label }}</span>
								<span class="text-[10px] text-muted-foreground ml-2">{{ member.email }}</span>
							</div>
						</div>
					</div>
				</div>

				<!-- Added members -->
				<div v-if="form.members.length > 0" class="flex flex-wrap gap-1.5">
					<div
						v-for="member in form.members"
						:key="member.id"
						class="flex items-center gap-1.5 pl-1 pr-2 py-1 bg-muted/20 rounded-full"
					>
						<UAvatar :src="getAvatarUrl(member)" :alt="member.label" size="3xs" />
						<span class="text-[11px] font-medium text-foreground">{{ member.label }}</span>
						<button type="button" @click="removeMember(member.id)" class="text-muted-foreground hover:text-foreground">
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
							class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium text-red-600 hover:bg-red-500/10 transition-colors ios-press disabled:opacity-50"
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
							class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium text-red-600 hover:bg-red-500/10 transition-colors ios-press disabled:opacity-50"
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
