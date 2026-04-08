<!-- pages/meeting/[roomName].vue -->
<!-- Daily.co prebuilt iframe integration (replaces Twilio Video) -->
<template>
	<div class="min-h-screen bg-gray-900 text-white">
		<!-- Loading State -->
		<div v-if="loading" class="flex items-center justify-center min-h-screen">
			<div class="text-center">
				<UIcon name="i-lucide-loader-2" class="w-12 h-12 animate-spin mx-auto text-gray-400" />
				<p class="mt-4 text-gray-400">Loading meeting...</p>
			</div>
		</div>

		<!-- Meeting Not Found -->
		<div v-else-if="!meeting" class="flex items-center justify-center min-h-screen">
			<div class="text-center max-w-md">
				<UIcon name="i-lucide-video-off" class="w-16 h-16 mx-auto text-gray-500" />
				<h1 class="text-2xl font-bold mt-4">Meeting Not Found</h1>
				<p class="text-gray-400 mt-2">This meeting doesn't exist or has ended.</p>
				<UButton to="/" class="mt-6" color="gray">Go Home</UButton>
			</div>
		</div>

		<!-- Meeting Ended -->
		<div v-else-if="meetingEnded" class="flex items-center justify-center min-h-screen">
			<div class="text-center max-w-md">
				<UIcon name="i-lucide-check-circle-2" class="w-16 h-16 mx-auto text-green-500" />
				<h1 class="text-2xl font-bold mt-4">Meeting Ended</h1>
				<p class="text-gray-400 mt-2">Thanks for joining!</p>
				<UButton to="/" class="mt-6" color="gray">Go Home</UButton>
			</div>
		</div>

		<!-- Guest Entry Form (not joined yet, not host) -->
		<div v-else-if="!hasJoined && !isHost" class="flex items-center justify-center min-h-screen p-4">
			<UCard class="w-full max-w-md bg-gray-800 border-gray-700">
				<div class="text-center mb-6">
					<UIcon name="i-lucide-video" class="w-12 h-12 mx-auto text-green-500" />
					<h1 class="text-xl font-bold mt-4">{{ meeting.title }}</h1>
					<p class="text-gray-400 text-sm mt-1">Hosted by {{ meeting.host_user?.first_name || 'Host' }}</p>
					<p v-if="meeting.scheduled_start" class="text-gray-500 text-xs mt-2">
						{{ formatDateTime(meeting.scheduled_start) }}
					</p>
				</div>

				<form @submit.prevent="joinMeeting" class="space-y-4">
					<UFormGroup label="Your Name" required>
						<UInput v-model="guestName" placeholder="Enter your name" size="lg" :disabled="joining" />
					</UFormGroup>

					<UFormGroup label="Email" required>
						<UInput v-model="guestEmail" type="email" placeholder="your@email.com" size="lg" :disabled="joining" required />
					</UFormGroup>

					<UButton type="submit" color="green" size="lg" block :loading="joining" icon="i-lucide-video">
						{{ meeting.waiting_room_enabled ? 'Ask to Join' : 'Join Meeting' }}
					</UButton>
				</form>
			</UCard>
		</div>

		<!-- Waiting Room -->
		<div v-else-if="inWaitingRoom && !isHost" class="flex items-center justify-center min-h-screen p-4">
			<UCard class="w-full max-w-md bg-gray-800 border-gray-700 text-center">
				<UIcon name="i-lucide-clock" class="w-16 h-16 mx-auto text-yellow-500 animate-pulse" />
				<h1 class="text-xl font-bold mt-4">Waiting to be admitted</h1>
				<p class="text-gray-400 mt-2">The host will let you in soon...</p>
				<p class="text-gray-500 text-sm mt-4">{{ meeting.title }}</p>
				<UButton color="gray" variant="soft" class="mt-6" @click="leaveWaitingRoom">Leave</UButton>
			</UCard>
		</div>

		<!-- Rejected -->
		<div v-else-if="wasRejected" class="flex items-center justify-center min-h-screen p-4">
			<UCard class="w-full max-w-md bg-gray-800 border-gray-700 text-center">
				<UIcon name="i-lucide-x-circle" class="w-16 h-16 mx-auto text-red-500" />
				<h1 class="text-xl font-bold mt-4">Unable to Join</h1>
				<p class="text-gray-400 mt-2">The host did not admit you to this meeting.</p>
				<UButton to="/" color="gray" class="mt-6">Go Home</UButton>
			</UCard>
		</div>

		<!-- In Meeting — Daily.co Prebuilt Iframe -->
		<div v-else class="h-screen w-screen">
			<div v-if="loadingToken" class="flex items-center justify-center h-full">
				<div class="text-center">
					<UIcon name="i-lucide-loader-2" class="w-10 h-10 animate-spin mx-auto text-gray-400" />
					<p class="mt-3 text-gray-400">Connecting to meeting...</p>
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
	</div>
</template>

<script setup>
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
// Uses formatDateTimeFull from utils/dates.ts
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
			} catch (e) {
				console.error('Error registering host as attendee:', e);
			}

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
				console.error('Error auto-joining:', e);
				toast.add({ title: 'Failed to join meeting', description: e.message, color: 'red' });
			}
		}
	} catch (error) {
		console.error('Error fetching meeting:', error);
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
		console.error('Error joining meeting:', error);
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
		console.error('Error connecting to Daily.co:', error);
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
		} catch (e) {
			console.error('Status poll error:', e);
		}
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
