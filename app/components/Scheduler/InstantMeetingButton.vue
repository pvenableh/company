<!--
  InstantMeetingButton

  Pre-flight popover for ad-hoc meetings. Three controls — duration, recording,
  waiting room — because the host doesn't get a chance to fix any of these once
  they're already in the room. Transcription stays at the plan default (cheap +
  drives the recap), so there's no fourth toggle exposed here.

  Last-used choices persist to localStorage so the next click is one tap if
  nothing changed.
-->
<script setup>
const emit = defineEmits(['created']);

const schedulerData = inject('schedulerData');
const { user } = schedulerData;
const { selectedOrg } = useOrganization();

const toast = useToast();
const loading = ref(false);
const open = ref(false);

const PREFS_KEY = 'earnest:instant-meeting-prefs';
const FALLBACK_DEFAULTS = {
	recording: false,
	transcription: false,
	recordingAvailable: false,
	transcriptionAvailable: false,
	plan: 'free',
};
const meetingDefaults = ref({ ...FALLBACK_DEFAULTS });
const defaultsLoaded = ref(false);

const prefs = reactive({
	duration: 30,
	recording: false,
	waitingRoom: false,
});

const durationOptions = [15, 30, 60];

function loadPrefs() {
	if (!import.meta.client) return;
	try {
		const raw = localStorage.getItem(PREFS_KEY);
		if (!raw) return;
		const parsed = JSON.parse(raw);
		if (durationOptions.includes(parsed.duration)) prefs.duration = parsed.duration;
		if (typeof parsed.recording === 'boolean') prefs.recording = parsed.recording;
		if (typeof parsed.waitingRoom === 'boolean') prefs.waitingRoom = parsed.waitingRoom;
	} catch {
		// corrupt prefs blob — ignore and let defaults stand
	}
}

function savePrefs() {
	if (!import.meta.client) return;
	try {
		localStorage.setItem(
			PREFS_KEY,
			JSON.stringify({ duration: prefs.duration, recording: prefs.recording, waitingRoom: prefs.waitingRoom }),
		);
	} catch {}
}

async function fetchDefaults() {
	if (defaultsLoaded.value || !selectedOrg.value) return;
	try {
		const res = await $fetch('/api/video/meeting-defaults', {
			params: { organization: selectedOrg.value },
		});
		meetingDefaults.value = { ...FALLBACK_DEFAULTS, ...(res?.data ?? {}) };
		defaultsLoaded.value = true;
		// If recording isn't available on this plan, force the toggle off so a
		// stale localStorage pref doesn't 402 the create call.
		if (!meetingDefaults.value.recordingAvailable) prefs.recording = false;
	} catch {
		meetingDefaults.value = { ...FALLBACK_DEFAULTS };
		defaultsLoaded.value = true;
	}
}

watch(open, (isOpen) => {
	if (isOpen) fetchDefaults();
});

onMounted(() => {
	loadPrefs();
});

const startMeeting = async () => {
	loading.value = true;
	savePrefs();
	try {
		const response = await $fetch('/api/video/create-room', {
			method: 'POST',
			body: {
				title: 'Instant Meeting',
				scheduled_start: new Date().toISOString(),
				duration: prefs.duration,
				waiting_room_enabled: prefs.waitingRoom,
				recording_enabled: prefs.recording,
				organization: selectedOrg.value || null,
			},
		});

		toast.add({ title: 'Meeting created', color: 'green' });
		open.value = false;
		window.open(`/meeting/${response.data.roomName}`, '_blank');
		emit('created');
	} catch (error) {
		toast.add({ title: 'Error creating meeting', description: error.message, color: 'red' });
	}

	loading.value = false;
};
</script>

<template>
	<UPopover v-model:open="open" :popper="{ placement: 'bottom-end', offsetDistance: 6, strategy: 'fixed' }">
		<button
			:disabled="loading"
			class="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium shadow-sm transition-colors ios-press disabled:opacity-50"
		>
			<UIcon v-if="!loading" name="i-heroicons-video-camera" class="w-4 h-4" />
			<UIcon v-else name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
			Start Instant Meeting
		</button>

		<template #content>
			<div class="w-72 p-4 space-y-3">
				<div class="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
					Start Instant Meeting
				</div>

				<!-- Duration -->
				<div>
					<div class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Duration</div>
					<div class="flex gap-1 p-1 bg-muted/40 rounded-lg">
						<button
							v-for="opt in durationOptions"
							:key="opt"
							type="button"
							@click="prefs.duration = opt"
							class="flex-1 px-2 py-1 rounded-md text-[12px] font-medium transition-all"
							:class="prefs.duration === opt
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground'"
						>
							{{ opt }}m
						</button>
					</div>
				</div>

				<!-- Recording -->
				<div class="flex items-center justify-between gap-2">
					<div class="flex items-center gap-1.5 text-[12px] text-foreground">
						<span>Record</span>
						<UIcon
							v-if="!meetingDefaults.recordingAvailable"
							name="i-heroicons-lock-closed"
							class="w-3 h-3 text-muted-foreground"
							title="Upgrade to a paid plan to record meetings"
						/>
					</div>
					<UToggle v-model="prefs.recording" :disabled="!meetingDefaults.recordingAvailable" />
				</div>

				<!-- Waiting room -->
				<div class="flex items-center justify-between gap-2">
					<span class="text-[12px] text-foreground">Waiting room</span>
					<UToggle v-model="prefs.waitingRoom" />
				</div>

				<!-- Start -->
				<button
					type="button"
					:disabled="loading"
					@click="startMeeting"
					class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[12px] font-semibold transition-colors ios-press disabled:opacity-50"
				>
					<UIcon v-if="loading" name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin" />
					<UIcon v-else name="i-heroicons-video-camera" class="w-3.5 h-3.5" />
					{{ loading ? 'Starting…' : 'Start' }}
				</button>
			</div>
		</template>
	</UPopover>
</template>
