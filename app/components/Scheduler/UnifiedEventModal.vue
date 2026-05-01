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
	appointment?: any;
}>();

const emit = defineEmits(['update:modelValue', 'created', 'saved']);

const toast = useToast();
const { user } = useDirectusAuth();
const appointmentItems = useDirectusItems('appointments');
const appointmentsDirectusUsersItems = useDirectusItems('appointments_directus_users');
const { filteredUsers, fetchFilteredUsers, loading: loadingUsers } = useFilteredUsers();
const { getLeads } = useLeads();

const saving = ref(false);

// ── Modal open/close ──
const isOpen = computed({
	get: () => props.modelValue,
	set: (v) => emit('update:modelValue', v),
});

const close = () => { isOpen.value = false; };

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

// ── Reset form on open ──
watch(isOpen, (open) => {
	if (open) {
		const d = props.selectedDate || new Date();
		const defaultTime = new Date();
		defaultTime.setHours(defaultTime.getHours() + 1, 0, 0, 0);

		form.title = props.appointment?.title || '';
		form.description = props.appointment?.description || '';
		form.is_video = props.appointment ? (props.appointment.is_video ?? false) : (props.defaultVideo ?? true);
		form.meeting_type = 'general';
		form.date = format(d, 'yyyy-MM-dd');
		form.time = props.appointment ? format(new Date(props.appointment.start_time), 'HH:mm') : format(defaultTime, 'HH:mm');
		form.duration = 30;
		form.waiting_room_enabled = false;
		form.related_lead = null;
		form.members = [];
		form.guests = [];
		leadSearch.value = '';
		memberSearch.value = '';

		fetchFilteredUsers();
	}
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
			// Create video meeting via API
			const validGuests = form.guests.filter(g => g.name || g.email);
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
					related_lead: form.related_lead?.id || null,
					invitee_name: first?.name || undefined,
					invitee_email: first?.email || undefined,
					invitee_phone: first?.phone || undefined,
					invite_method: first?.invite_method || 'none',
					attendees: validGuests,
				},
			});

			if (response.data?.meetingLink) {
				await navigator.clipboard.writeText(response.data.meetingLink);
			}

			toast.add({ title: 'Video meeting created!', description: 'Link copied to clipboard', color: 'green' });
			emit('created', response.data);
		} else {
			// Create appointment via Directus
			const appointmentData = {
				title: form.title,
				description: form.description,
				start_time: format(startTime, "yyyy-MM-dd'T'HH:mm:ss"),
				end_time: format(endTime, "yyyy-MM-dd'T'HH:mm:ss"),
				status: 'pending',
				is_video: false,
			};

			if (props.appointment) {
				await appointmentItems.update(props.appointment.id, appointmentData);
				toast.add({ title: 'Appointment updated', color: 'green' });
				emit('saved');
			} else {
				const created = await $fetch<{ id: string }>('/api/appointments', {
					method: 'POST',
					body: appointmentData,
				});

				// Link team members as attendees
				if (form.members.length > 0) {
					await Promise.all(
						form.members.map(m =>
							appointmentsDirectusUsersItems.create({
								appointments_id: created.id,
								directus_users_id: m.id,
							}),
						),
					);
				}

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
</script>

<template>
	<UModal v-model="isOpen" :ui="{ base: 'overflow-hidden', rounded: 'rounded-2xl', shadow: 'shadow-lg', ring: '', background: 'bg-card', padding: '', width: 'max-w-lg' }">
		<div class="flex flex-col max-h-[calc(100vh-4rem)]">
			<!-- Header (fixed) -->
			<div class="flex-shrink-0 px-5 py-3.5 border-b border-border/30 flex items-center justify-between">
				<span class="text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground/70">
					{{ appointment ? 'Edit Event' : form.is_video ? 'New Video Meeting' : 'New Event' }}
				</span>
				<button type="button" @click="close" class="p-1.5 rounded-lg hover:bg-muted/30 transition-colors">
					<UIcon name="i-heroicons-x-mark" class="w-4 h-4 text-muted-foreground" />
				</button>
			</div>

			<!-- Form (scrollable) -->
			<form @submit.prevent="handleSubmit" class="p-5 space-y-5 overflow-y-auto flex-1">
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

					<UCheckbox v-model="form.waiting_room_enabled" label="Enable waiting room" />
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

				<!-- Actions -->
				<div class="flex justify-end gap-2 pt-2">
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
						{{ appointment ? 'Save' : 'Create' }}
					</button>
				</div>
			</form>
		</div>
	</UModal>
</template>
