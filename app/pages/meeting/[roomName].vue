<!-- pages/meeting/[roomName].vue -->
<!-- Daily.co prebuilt iframe integration -->
<template>
	<div class="min-h-screen t-bg t-text">
		<!-- Loading State -->
		<div v-if="loading" class="flex items-center justify-center min-h-screen">
			<div class="text-center">
				<div class="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
					<UIcon name="i-heroicons-video-camera" class="w-7 h-7 text-emerald-500 animate-pulse" />
				</div>
				<p class="text-[13px] text-muted-foreground">Loading meeting...</p>
			</div>
		</div>

		<!-- Meeting Not Found -->
		<div v-else-if="!meeting" class="flex items-center justify-center min-h-screen p-4">
			<div class="ios-card p-8 text-center max-w-sm w-full">
				<div class="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4">
					<UIcon name="i-heroicons-video-camera" class="w-7 h-7 text-muted-foreground" />
				</div>
				<h1 class="text-lg font-semibold text-foreground">Meeting Not Found</h1>
				<p class="text-sm text-muted-foreground mt-2">This meeting doesn't exist or has ended.</p>
				<NuxtLink
					to="/"
					class="mt-6 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-muted/30 hover:bg-muted/60 text-sm font-medium text-foreground transition-colors ios-press"
				>
					Go Home
				</NuxtLink>
			</div>
		</div>

		<!-- Meeting Ended -->
		<div v-else-if="meetingEnded" class="flex items-center justify-center min-h-screen p-4">
			<div class="ios-card p-8 text-center max-w-sm w-full">
				<div class="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
					<UIcon name="i-heroicons-check-circle" class="w-7 h-7 text-emerald-500" />
				</div>
				<h1 class="text-lg font-semibold text-foreground">Meeting Ended</h1>
				<p class="text-sm text-muted-foreground mt-2">Thanks for joining!</p>
				<NuxtLink
					to="/"
					class="mt-6 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-muted/30 hover:bg-muted/60 text-sm font-medium text-foreground transition-colors ios-press"
				>
					Go Home
				</NuxtLink>
			</div>
		</div>

		<!-- Guest Entry Form -->
		<div v-else-if="!hasJoined && !isHost" class="flex items-center justify-center min-h-screen p-4">
			<div class="ios-card p-6 w-full max-w-md">
				<!-- Meeting info header -->
				<div class="text-center mb-6 pb-5 border-b border-border/30">
					<div class="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
						<UIcon name="i-heroicons-video-camera" class="w-6 h-6 text-emerald-500" />
					</div>
					<h1 class="text-lg font-semibold text-foreground">{{ meeting.title }}</h1>
					<p class="text-[13px] text-muted-foreground mt-1">
						Hosted by {{ meeting.host_user?.first_name || 'Host' }}
					</p>
					<p v-if="meeting.scheduled_start" class="text-[11px] text-muted-foreground/60 mt-1.5">
						{{ formatDateTime(meeting.scheduled_start) }}
					</p>
				</div>

				<form @submit.prevent="joinMeeting" class="space-y-4">
					<UFormGroup label="Your Name" required>
						<UInput v-model="guestName" placeholder="Enter your name" :disabled="joining" />
					</UFormGroup>

					<UFormGroup label="Email" required>
						<UInput v-model="guestEmail" type="email" placeholder="your@email.com" :disabled="joining" required />
					</UFormGroup>

					<button
						type="submit"
						:disabled="joining"
						class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-sm transition-colors ios-press disabled:opacity-50"
					>
						<UIcon v-if="!joining" name="i-heroicons-video-camera" class="w-4 h-4" />
						<UIcon v-else name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
						{{ meeting.waiting_room_enabled ? 'Ask to Join' : 'Join Meeting' }}
					</button>
				</form>
			</div>
		</div>

		<!-- Waiting Room -->
		<div v-else-if="inWaitingRoom && !isHost" class="flex items-center justify-center min-h-screen p-4">
			<div class="ios-card p-8 text-center max-w-sm w-full">
				<div class="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
					<UIcon name="i-heroicons-clock" class="w-7 h-7 text-amber-500 animate-pulse" />
				</div>
				<h1 class="text-lg font-semibold text-foreground">Waiting to be admitted</h1>
				<p class="text-sm text-muted-foreground mt-2">The host will let you in soon...</p>
				<p class="text-[11px] text-muted-foreground/60 mt-3 pb-5 border-b border-border/20">{{ meeting.title }}</p>
				<button
					@click="leaveWaitingRoom"
					class="mt-5 px-4 py-2 rounded-xl bg-muted/30 hover:bg-muted/60 text-sm font-medium text-foreground transition-colors ios-press"
				>
					Leave
				</button>
			</div>
		</div>

		<!-- Rejected -->
		<div v-else-if="wasRejected" class="flex items-center justify-center min-h-screen p-4">
			<div class="ios-card p-8 text-center max-w-sm w-full">
				<div class="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
					<UIcon name="i-heroicons-x-circle" class="w-7 h-7 text-red-500" />
				</div>
				<h1 class="text-lg font-semibold text-foreground">Unable to Join</h1>
				<p class="text-sm text-muted-foreground mt-2">The host did not admit you to this meeting.</p>
				<NuxtLink
					to="/"
					class="mt-6 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-muted/30 hover:bg-muted/60 text-sm font-medium text-foreground transition-colors ios-press"
				>
					Go Home
				</NuxtLink>
			</div>
		</div>

		<!-- In Meeting — Daily.co Prebuilt Iframe -->
		<div v-else class="fixed inset-0 z-10">
			<div v-if="loadingToken" class="flex items-center justify-center h-full">
				<div class="text-center">
					<div class="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
						<UIcon name="i-heroicons-video-camera" class="w-6 h-6 text-emerald-500 animate-pulse" />
					</div>
					<p class="text-[13px] text-muted-foreground">Connecting to meeting...</p>
				</div>
			</div>
			<iframe
				v-else-if="dailyUrl"
				ref="dailyFrame"
				:src="dailyUrl"
				class="w-full h-full border-0"
				allow="camera; microphone; autoplay; display-capture; screen-wake-lock"
				allowfullscreen
			/>
		</div>

		<!-- Floating dock (tasks, timer, AI) — opaque bg for video overlay -->
		<ClientOnly>
			<div class="meeting-dock-override">
				<LayoutFloatingDock @open-ai="aiTrayOpen = true" />
			</div>
			<CommandCenterAITray :is-open="aiTrayOpen" @close="aiTrayOpen = false" />
		</ClientOnly>
	</div>
</template>

<script setup>
definePageMeta({ layout: 'blank' });

const route = useRoute();
const toast = useToast();
const roomName = computed(() => route.params.roomName);

const { user: sessionUser, loggedIn } = useUserSession();
const currentUser = computed(() => loggedIn.value ? sessionUser.value ?? null : null);

useHead({ title: 'Meeting | Earnest' });

// State
const loading = ref(true);
const meeting = ref(null);
const hasJoined = ref(false);
const meetingEnded = ref(false);
const joining = ref(false);
const inWaitingRoom = ref(false);
const wasRejected = ref(false);
const guestName = ref('');
const guestEmail = ref('');
const myAttendeeId = ref(null);
const loadingToken = ref(false);
const dailyUrl = ref(null);
const aiTrayOpen = ref(false);

let statusPollInterval = null;

// Computed
const isHost = computed(() => {
	if (!meeting.value || !currentUser.value) return false;
	const hostId = typeof meeting.value.host_user === 'object'
		? meeting.value.host_user?.id
		: meeting.value.host_user;
	return hostId === currentUser.value.id;
});

// Format helpers
const formatDateTime = (dateStr) => formatDateTimeFull(dateStr);

// Fetch meeting info
const fetchMeeting = async () => {
	loading.value = true;
	try {
		const response = await $fetch('/api/video/meeting-info', {
			params: { roomName: roomName.value },
		});
		meeting.value = response.data;

		// Host auto-joins
		if (isHost.value) {
			const hostDisplayName =
				`${currentUser.value.first_name || ''} ${currentUser.value.last_name || ''}`.trim() ||
				currentUser.value.email?.split('@')[0] || 'Host';
			guestName.value = hostDisplayName;

			try {
				const joinResponse = await $fetch('/api/video/join-meeting', {
					method: 'POST',
					body: {
						roomName: roomName.value,
						guestName: hostDisplayName,
						guestEmail: currentUser.value.email || '',
					},
				});
				myAttendeeId.value = joinResponse.attendeeId;
			} catch {}

			hasJoined.value = true;
			await connectToDaily();
		} else if (currentUser.value) {
			// Authenticated non-host: auto-join
			const displayName =
				`${currentUser.value.first_name || ''} ${currentUser.value.last_name || ''}`.trim() ||
				currentUser.value.email?.split('@')[0] || 'User';
			guestName.value = displayName;
			guestEmail.value = currentUser.value.email || '';

			try {
				const joinResponse = await $fetch('/api/video/join-meeting', {
					method: 'POST',
					body: {
						roomName: roomName.value,
						guestName: displayName,
						guestEmail: currentUser.value.email || '',
					},
				});
				myAttendeeId.value = joinResponse.attendeeId;

				if (joinResponse.status === 'waiting') {
					inWaitingRoom.value = true;
					startStatusPolling();
				} else if (joinResponse.status === 'admitted') {
					hasJoined.value = true;
					await connectToDaily();
				}
			} catch (e) {
				toast.add({ title: 'Failed to join meeting', description: e.message, color: 'red' });
			}
		}
	} catch {
		meeting.value = null;
	}
	loading.value = false;
};

// Guest join flow
const joinMeeting = async () => {
	if (!guestName.value.trim() || !guestEmail.value.trim()) {
		toast.add({ title: 'Please enter your name and email', color: 'yellow' });
		return;
	}

	joining.value = true;
	try {
		const joinResponse = await $fetch('/api/video/join-meeting', {
			method: 'POST',
			body: {
				roomName: roomName.value,
				guestName: guestName.value.trim(),
				guestEmail: guestEmail.value.trim(),
			},
		});
		myAttendeeId.value = joinResponse.attendeeId;

		if (joinResponse.status === 'waiting') {
			inWaitingRoom.value = true;
			startStatusPolling();
		} else if (joinResponse.status === 'admitted') {
			hasJoined.value = true;
			await connectToDaily();
		}
	} catch (error) {
		toast.add({ title: 'Failed to join meeting', description: error.message, color: 'red' });
	}
	joining.value = false;
};

// Connect to Daily.co prebuilt iframe
const connectToDaily = async () => {
	loadingToken.value = true;
	try {
		const tokenResponse = await $fetch('/api/video/token', {
			method: 'POST',
			body: {
				roomName: roomName.value,
				identity: guestName.value || undefined,
			},
		});

		const token = tokenResponse.data?.token;
		if (!token) throw new Error('No token received');

		// Build Daily.co prebuilt iframe URL
		const config = useRuntimeConfig();
		const dailyDomain = config.public?.dailyDomain || '';

		// Daily prebuilt URL format: https://DOMAIN.daily.co/ROOM?t=TOKEN
		const baseUrl = dailyDomain
			? `https://${dailyDomain}.daily.co/${roomName.value}`
			: `https://daily.co/${roomName.value}`;

		dailyUrl.value = `${baseUrl}?t=${token}`;
	} catch (error) {
		toast.add({ title: 'Failed to connect', description: error.message, color: 'red' });
	}
	loadingToken.value = false;
};

// Waiting room polling
const startStatusPolling = () => {
	statusPollInterval = setInterval(async () => {
		if (!myAttendeeId.value) return;
		try {
			const res = await $fetch('/api/video/join-meeting', {
				method: 'POST',
				body: {
					roomName: roomName.value,
					guestName: guestName.value,
					guestEmail: guestEmail.value,
					attendeeId: myAttendeeId.value,
					checkStatus: true,
				},
			});

			if (res.status === 'admitted') {
				clearInterval(statusPollInterval);
				inWaitingRoom.value = false;
				hasJoined.value = true;
				await connectToDaily();
			} else if (res.status === 'rejected') {
				clearInterval(statusPollInterval);
				inWaitingRoom.value = false;
				wasRejected.value = true;
			}
		} catch {}
	}, 3000);
};

const leaveWaitingRoom = () => {
	if (statusPollInterval) clearInterval(statusPollInterval);
	inWaitingRoom.value = false;
	hasJoined.value = false;
};

// Listen for Daily.co "left-meeting" event via postMessage
const handleDailyMessage = (e) => {
	if (e.data?.action === 'left-meeting' || e.data?.action === 'meeting-ended') {
		meetingEnded.value = true;
		dailyUrl.value = null;
	}
};

// Lifecycle
onMounted(() => {
	fetchMeeting();
	window.addEventListener('message', handleDailyMessage);
});

onBeforeUnmount(() => {
	if (statusPollInterval) clearInterval(statusPollInterval);
	window.removeEventListener('message', handleDailyMessage);
});
</script>

<style scoped>
/* Override the floating dock glass background to be opaque over the video iframe */
.meeting-dock-override :deep(.dock-bar) {
	background: hsl(var(--background));
	backdrop-filter: none;
	-webkit-backdrop-filter: none;
	border-color: hsl(var(--border));
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1);
}
</style>
