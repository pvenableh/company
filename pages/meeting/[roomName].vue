<!-- pages/meeting/[roomName].vue -->
<template>
	<div class="min-h-screen bg-gray-900 text-white">
		<!-- Loading State -->
		<div v-if="loading" class="flex items-center justify-center min-h-screen">
			<div class="text-center">
				<UIcon name="i-heroicons-arrow-path" class="w-12 h-12 animate-spin mx-auto text-gray-400" />
				<p class="mt-4 text-gray-400">Loading meeting...</p>
			</div>
		</div>

		<!-- Meeting Not Found -->
		<div v-else-if="!meeting" class="flex items-center justify-center min-h-screen">
			<div class="text-center max-w-md">
				<UIcon name="i-heroicons-video-camera-slash" class="w-16 h-16 mx-auto text-gray-500" />
				<h1 class="text-2xl font-bold mt-4">Meeting Not Found</h1>
				<p class="text-gray-400 mt-2">This meeting doesn't exist or has ended.</p>
				<UButton to="/" class="mt-6" color="gray">Go Home</UButton>
			</div>
		</div>

		<!-- Meeting Ended -->
		<div v-else-if="meeting.status === 'completed'" class="flex items-center justify-center min-h-screen">
			<div class="text-center max-w-md">
				<UIcon name="i-heroicons-check-circle" class="w-16 h-16 mx-auto text-green-500" />
				<h1 class="text-2xl font-bold mt-4">Meeting Ended</h1>
				<p class="text-gray-400 mt-2">This meeting has already ended.</p>
				<UButton to="/" class="mt-6" color="gray">Go Home</UButton>
			</div>
		</div>

		<!-- Guest Entry Form (not joined yet) -->
		<div v-else-if="!hasJoined && !isHost" class="flex items-center justify-center min-h-screen p-4">
			<UCard class="w-full max-w-md bg-gray-800 border-gray-700">
				<div class="text-center mb-6">
					<UIcon name="i-heroicons-video-camera" class="w-12 h-12 mx-auto text-green-500" />
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

					<UFormGroup label="Email (optional)">
						<UInput v-model="guestEmail" type="email" placeholder="your@email.com" size="lg" :disabled="joining" />
					</UFormGroup>

					<!-- Camera/Mic Preview -->
					<div class="bg-gray-900 rounded-lg p-4">
						<div class="aspect-video bg-black rounded-lg overflow-hidden mb-3 relative">
							<video ref="previewVideo" autoplay muted playsinline class="w-full h-full object-cover" />
							<div v-if="!previewStream" class="absolute inset-0 flex items-center justify-center">
								<UIcon name="i-heroicons-video-camera-slash" class="w-12 h-12 text-gray-600" />
							</div>
						</div>
						<div class="flex justify-center gap-4">
							<UButton
								:color="videoEnabled ? 'green' : 'red'"
								variant="soft"
								:icon="videoEnabled ? 'i-heroicons-video-camera' : 'i-heroicons-video-camera-slash'"
								@click="toggleVideo"
							>
								{{ videoEnabled ? 'Camera On' : 'Camera Off' }}
							</UButton>
							<UButton
								:color="audioEnabled ? 'green' : 'red'"
								variant="soft"
								:icon="audioEnabled ? 'i-heroicons-microphone' : 'i-heroicons-microphone-slash'"
								@click="toggleAudio"
							>
								{{ audioEnabled ? 'Mic On' : 'Mic Off' }}
							</UButton>
						</div>
					</div>

					<UButton type="submit" color="green" size="lg" block :loading="joining" icon="i-heroicons-video-camera">
						{{ meeting.waiting_room_enabled ? 'Ask to Join' : 'Join Meeting' }}
					</UButton>
				</form>
			</UCard>
		</div>

		<!-- Waiting Room -->
		<div v-else-if="inWaitingRoom && !isHost" class="flex items-center justify-center min-h-screen p-4">
			<UCard class="w-full max-w-md bg-gray-800 border-gray-700 text-center">
				<UIcon name="i-heroicons-clock" class="w-16 h-16 mx-auto text-yellow-500 animate-pulse" />
				<h1 class="text-xl font-bold mt-4">Waiting to be admitted</h1>
				<p class="text-gray-400 mt-2">The host will let you in soon...</p>
				<p class="text-gray-500 text-sm mt-4">
					{{ meeting.title }}
				</p>
				<UButton color="gray" variant="soft" class="mt-6" @click="leaveWaitingRoom">Leave</UButton>
			</UCard>
		</div>

		<!-- Rejected -->
		<div v-else-if="wasRejected" class="flex items-center justify-center min-h-screen p-4">
			<UCard class="w-full max-w-md bg-gray-800 border-gray-700 text-center">
				<UIcon name="i-heroicons-x-circle" class="w-16 h-16 mx-auto text-red-500" />
				<h1 class="text-xl font-bold mt-4">Unable to Join</h1>
				<p class="text-gray-400 mt-2">The host did not admit you to this meeting.</p>
				<UButton to="/" color="gray" class="mt-6">Go Home</UButton>
			</UCard>
		</div>

		<!-- In Meeting -->
		<div v-else class="h-screen flex flex-col">
			<!-- Meeting Header -->
			<div class="bg-gray-800 px-4 py-3 flex items-center justify-between">
				<div class="flex items-center gap-3">
					<UIcon name="i-heroicons-video-camera" class="w-5 h-5 text-green-500" />
					<span class="font-medium">{{ meeting.title }}</span>
					<UBadge color="green" variant="soft" size="xs">
						<span class="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse" />
						Live
					</UBadge>
				</div>
				<div class="flex items-center gap-2">
					<span class="text-sm text-gray-400">{{ formatDuration(meetingDuration) }}</span>
					<UButton
						v-if="isHost"
						color="gray"
						variant="ghost"
						size="sm"
						icon="i-heroicons-users"
						@click="showParticipants = true"
					>
						{{ participants.length }}
					</UButton>
				</div>
			</div>

			<!-- Video Grid -->
			<div class="flex-1 bg-black p-4 relative">
				<div class="h-full grid gap-4" :class="videoGridClass">
					<!-- Remote Participants -->
					<div
						v-for="participant in remoteParticipants"
						:key="participant.sid"
						class="relative bg-gray-800 rounded-lg overflow-hidden"
					>
						<div :ref="(el) => attachParticipantTracks(el, participant)" class="w-full h-full" />
						<div class="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-sm">
							{{ participant.identity }}
						</div>
					</div>

					<!-- Local Video (smaller, corner) -->
					<div class="relative bg-gray-800 rounded-lg overflow-hidden">
						<video ref="localVideo" autoplay muted playsinline class="w-full h-full object-cover mirror" />
						<div class="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-sm">
							You {{ isHost ? '(Host)' : '' }}
						</div>
					</div>
				</div>

				<!-- Waiting Room Panel (Host Only) -->
				<div
					v-if="isHost && waitingParticipants.length > 0"
					class="absolute top-4 right-4 bg-gray-800 rounded-lg p-4 w-72 shadow-xl"
				>
					<h3 class="font-semibold mb-3 flex items-center gap-2">
						<UIcon name="i-heroicons-clock" class="w-4 h-4 text-yellow-500" />
						Waiting Room ({{ waitingParticipants.length }})
					</h3>
					<div class="space-y-2 max-h-48 overflow-y-auto">
						<div
							v-for="attendee in waitingParticipants"
							:key="attendee.id"
							class="flex items-center justify-between bg-gray-700 rounded p-2"
						>
							<span class="text-sm truncate flex-1">{{ attendee.guest_name || 'Guest' }}</span>
							<div class="flex gap-1">
								<UButton color="green" size="xs" icon="i-heroicons-check" @click="admitParticipant(attendee)" />
								<UButton
									color="red"
									size="xs"
									variant="soft"
									icon="i-heroicons-x-mark"
									@click="rejectParticipant(attendee)"
								/>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Meeting Controls -->
			<div class="bg-gray-800 px-4 py-4">
				<div class="flex items-center justify-center gap-4">
					<UButton
						:color="audioEnabled ? 'gray' : 'red'"
						size="lg"
						:icon="audioEnabled ? 'i-heroicons-microphone' : 'i-heroicons-microphone-slash'"
						@click="toggleAudio"
						class="rounded-full"
					/>
					<UButton
						:color="videoEnabled ? 'gray' : 'red'"
						size="lg"
						:icon="videoEnabled ? 'i-heroicons-video-camera' : 'i-heroicons-video-camera-slash'"
						@click="toggleVideo"
						class="rounded-full"
					/>
					<UButton
						v-if="isHost"
						color="gray"
						size="lg"
						icon="i-heroicons-users"
						@click="showParticipants = true"
						class="rounded-full relative"
					>
						<UBadge v-if="waitingParticipants.length" color="yellow" size="xs" class="absolute -top-1 -right-1">
							{{ waitingParticipants.length }}
						</UBadge>
					</UButton>
					<UButton color="gray" size="lg" icon="i-heroicons-clipboard" @click="copyMeetingLink" class="rounded-full" />
					<UButton color="red" size="lg" icon="i-heroicons-phone-x-mark" @click="leaveMeeting" class="rounded-full" />
				</div>
			</div>
		</div>

		<!-- Participants Modal -->
		<UModal v-model="showParticipants">
			<UCard class="bg-gray-800">
				<template #header>
					<h3 class="font-semibold">Participants</h3>
				</template>

				<!-- Waiting -->
				<div v-if="waitingParticipants.length" class="mb-4">
					<h4 class="text-sm text-yellow-500 font-medium mb-2">Waiting ({{ waitingParticipants.length }})</h4>
					<div class="space-y-2">
						<div
							v-for="attendee in waitingParticipants"
							:key="attendee.id"
							class="flex items-center justify-between bg-gray-700 rounded p-2"
						>
							<div>
								<p class="font-medium">{{ attendee.guest_name || 'Guest' }}</p>
								<p class="text-xs text-gray-400">{{ attendee.guest_email }}</p>
							</div>
							<div class="flex gap-1">
								<UButton color="green" size="xs" @click="admitParticipant(attendee)">Admit</UButton>
								<UButton color="red" size="xs" variant="soft" @click="rejectParticipant(attendee)">Reject</UButton>
							</div>
						</div>
					</div>
				</div>

				<!-- In Meeting -->
				<div>
					<h4 class="text-sm text-green-500 font-medium mb-2">In Meeting ({{ inMeetingParticipants.length }})</h4>
					<div class="space-y-2">
						<div
							v-for="attendee in inMeetingParticipants"
							:key="attendee.id"
							class="flex items-center justify-between bg-gray-700 rounded p-2"
						>
							<div>
								<p class="font-medium">
									{{ attendee.guest_name || attendee.directus_user?.first_name || 'Guest' }}
									<UBadge v-if="attendee.directus_user?.id === meeting.host_user?.id" size="xs" color="blue">
										Host
									</UBadge>
								</p>
								<p class="text-xs text-gray-400">{{ attendee.guest_email }}</p>
							</div>
						</div>
					</div>
				</div>
			</UCard>
		</UModal>
	</div>
</template>

<script setup>
import { format } from 'date-fns';
import { nextTick } from 'vue';

// No auth middleware - this page is public
definePageMeta({
	layout: 'blank', // Use a blank layout without nav
	auth: false, // Disable auth requirement for this page
});

const route = useRoute();
const router = useRouter();
const toast = useToast();
const config = useRuntimeConfig();

// Get session using sidebase/nuxt-auth (will be null for guests)
const { data: session } = useAuth();

// State
const loading = ref(true);
const meeting = ref(null);
const hasJoined = ref(false);
const inWaitingRoom = ref(false);
const wasRejected = ref(false);
const joining = ref(false);
const guestName = ref('');
const guestEmail = ref('');
const myAttendeeId = ref(null);
const showParticipants = ref(false);

// Media state
const videoEnabled = ref(true);
const audioEnabled = ref(true);
const previewStream = ref(null);
const localVideo = ref(null);
const previewVideo = ref(null);

// Twilio state
const twilioRoom = ref(null);
const localTracks = ref([]);
const remoteParticipants = ref([]);

// Meeting timer
const meetingStartTime = ref(null);
const meetingDuration = ref(0);
let durationInterval = null;

// Polling for waiting room status (fallback if realtime not available)
let statusPollInterval = null;

// Computed
const roomName = computed(() => route.params.roomName);

const currentUser = computed(() => session.value?.user || null);

const isHost = computed(() => {
	return currentUser.value?.id && meeting.value?.host_user?.id === currentUser.value.id;
});

const participants = computed(() => {
	return meeting.value?.attendees || [];
});

const waitingParticipants = computed(() => {
	return participants.value.filter((p) => p.status === 'waiting');
});

const inMeetingParticipants = computed(() => {
	return participants.value.filter((p) => p.status === 'in_meeting' || p.status === 'admitted');
});

const videoGridClass = computed(() => {
	const count = remoteParticipants.value.length + 1; // +1 for local
	if (count === 1) return 'grid-cols-1';
	if (count === 2) return 'grid-cols-2';
	if (count <= 4) return 'grid-cols-2 grid-rows-2';
	return 'grid-cols-3 grid-rows-2';
});

// Fetch meeting data
const fetchMeeting = async () => {
	loading.value = true;
	try {
		const response = await $fetch(`/api/video/meeting-info`, {
			params: { roomName: roomName.value },
		});
		meeting.value = response.data;

		// If user is host, pre-fill name and auto-join
		if (isHost.value) {
			guestName.value = currentUser.value.name || currentUser.value.email?.split('@')[0] || 'Host';
			hasJoined.value = true;
			await connectToRoom();
		} else if (currentUser.value) {
			// Pre-fill name for logged in non-host users
			guestName.value = currentUser.value.name || currentUser.value.email?.split('@')[0] || '';
			guestEmail.value = currentUser.value.email || '';
		}
	} catch (error) {
		console.error('Error fetching meeting:', error);
		meeting.value = null;
	}
	loading.value = false;
};

// Poll for attendee status updates (for waiting room)
const startStatusPolling = () => {
	if (statusPollInterval) return;

	statusPollInterval = setInterval(async () => {
		if (!myAttendeeId.value || !inWaitingRoom.value) {
			clearInterval(statusPollInterval);
			statusPollInterval = null;
			return;
		}

		try {
			const response = await $fetch(`/api/video/meeting-info`, {
				params: { roomName: roomName.value },
			});
			meeting.value = response.data;

			// Check if I was admitted or rejected
			const myRecord = meeting.value?.attendees?.find((a) => a.id === myAttendeeId.value);
			if (myRecord) {
				if (myRecord.status === 'admitted' && inWaitingRoom.value) {
					inWaitingRoom.value = false;
					hasJoined.value = true;
					connectToRoom();
					toast.add({ title: 'You have been admitted!', color: 'green' });
					clearInterval(statusPollInterval);
					statusPollInterval = null;
				} else if (myRecord.status === 'rejected') {
					inWaitingRoom.value = false;
					wasRejected.value = true;
					clearInterval(statusPollInterval);
					statusPollInterval = null;
				}
			}
		} catch (error) {
			console.error('Error polling status:', error);
		}
	}, 2000); // Poll every 2 seconds
};

// Setup media preview
const setupPreview = async () => {
	try {
		previewStream.value = await navigator.mediaDevices.getUserMedia({
			video: videoEnabled.value,
			audio: audioEnabled.value,
		});
		if (previewVideo.value) {
			previewVideo.value.srcObject = previewStream.value;
		}
	} catch (error) {
		console.error('Error accessing media:', error);
		toast.add({ title: 'Could not access camera/microphone', color: 'yellow' });
	}
};

const toggleVideo = async () => {
	videoEnabled.value = !videoEnabled.value;

	// Toggle preview stream tracks (pre-join)
	if (previewStream.value) {
		previewStream.value.getVideoTracks().forEach((track) => {
			track.enabled = videoEnabled.value;
		});
	}

	// Toggle Twilio local video track (in-meeting)
	const videoTracks = localTracks.value.filter((t) => t.kind === 'video');
	if (videoTracks.length > 0) {
		videoTracks.forEach((track) => {
			if (videoEnabled.value) {
				track.enable();
			} else {
				track.disable();
			}
		});
	} else if (videoEnabled.value && twilioRoom.value) {
		// Re-create video track if it was fully stopped
		try {
			const { createLocalVideoTrack } = await import('twilio-video');
			const newTrack = await createLocalVideoTrack();
			localTracks.value.push(newTrack);
			twilioRoom.value.localParticipant.publishTrack(newTrack);
			if (localVideo.value) {
				newTrack.attach(localVideo.value);
			}
		} catch (error) {
			console.error('Error re-enabling video:', error);
		}
	}
};

const toggleAudio = async () => {
	audioEnabled.value = !audioEnabled.value;

	// Toggle preview stream tracks (pre-join)
	if (previewStream.value) {
		previewStream.value.getAudioTracks().forEach((track) => {
			track.enabled = audioEnabled.value;
		});
	}

	// Toggle Twilio local audio track (in-meeting)
	const audioTracks = localTracks.value.filter((t) => t.kind === 'audio');
	if (audioTracks.length > 0) {
		audioTracks.forEach((track) => {
			if (audioEnabled.value) {
				track.enable();
			} else {
				track.disable();
			}
		});
	} else if (audioEnabled.value && twilioRoom.value) {
		// Re-create audio track if it was fully stopped
		try {
			const { createLocalAudioTrack } = await import('twilio-video');
			const newTrack = await createLocalAudioTrack();
			localTracks.value.push(newTrack);
			twilioRoom.value.localParticipant.publishTrack(newTrack);
		} catch (error) {
			console.error('Error re-enabling audio:', error);
		}
	}
};

// Join meeting
const joinMeeting = async () => {
	if (!guestName.value.trim()) {
		toast.add({ title: 'Please enter your name', color: 'red' });
		return;
	}

	joining.value = true;
	try {
		// Register as attendee
		const response = await $fetch('/api/video/join-meeting', {
			method: 'POST',
			body: {
				roomName: roomName.value,
				guestName: guestName.value,
				guestEmail: guestEmail.value,
			},
		});

		myAttendeeId.value = response.attendeeId;

		if (response.status === 'waiting') {
			// Go to waiting room
			inWaitingRoom.value = true;
			// Start polling for status updates
			startStatusPolling();
		} else if (response.status === 'admitted') {
			// Join directly (no waiting room or already admitted)
			hasJoined.value = true;
			await connectToRoom();
		}
	} catch (error) {
		console.error('Error joining meeting:', error);
		toast.add({ title: 'Failed to join meeting', description: error.message, color: 'red' });
	}
	joining.value = false;
};

// Connect to Twilio room
const connectToRoom = async () => {
	try {
		// Get Twilio token
		const tokenResponse = await $fetch('/api/video/token', {
			method: 'POST',
			body: {
				roomName: roomName.value,
				identity: guestName.value || currentUser.value?.name || 'Guest',
			},
		});

		// Import Twilio Video (client-side only)
		const { connect, createLocalTracks } = await import('twilio-video');

		// Stop preview stream before creating Twilio tracks to release the camera
		if (previewStream.value) {
			previewStream.value.getTracks().forEach((t) => t.stop());
			previewStream.value = null;
		}

		// Create local tracks
		const tracks = await createLocalTracks({
			video: videoEnabled.value,
			audio: audioEnabled.value,
		});
		localTracks.value = tracks;

		// Wait for DOM to update so the localVideo ref is available
		await nextTick();

		// Attach local video using Twilio's attach() API
		const videoTrack = tracks.find((t) => t.kind === 'video');
		if (videoTrack && localVideo.value) {
			videoTrack.attach(localVideo.value);
		}

		// Connect to room
		const room = await connect(tokenResponse.token, {
			name: roomName.value,
			tracks,
		});
		twilioRoom.value = room;

		// Start duration timer
		meetingStartTime.value = new Date();
		durationInterval = setInterval(() => {
			meetingDuration.value = Math.floor((Date.now() - meetingStartTime.value) / 1000);
		}, 1000);

		// Handle existing participants
		room.participants.forEach((participant) => {
			handleParticipantConnected(participant);
		});

		// Handle new participants
		room.on('participantConnected', handleParticipantConnected);
		room.on('participantDisconnected', handleParticipantDisconnected);

		// Update my status to in_meeting
		if (myAttendeeId.value) {
			await $fetch('/api/video/update-attendee-status', {
				method: 'POST',
				body: {
					attendeeId: myAttendeeId.value,
					status: 'in_meeting',
				},
			});
		}

		// If host, start polling for waiting room participants
		if (isHost.value) {
			startHostPolling();
		}
	} catch (error) {
		console.error('Error connecting to room:', error);
		toast.add({ title: 'Failed to connect to video', description: error.message, color: 'red' });
	}
};

// Host polling for waiting participants
let hostPollInterval = null;
const startHostPolling = () => {
	if (hostPollInterval) return;

	hostPollInterval = setInterval(async () => {
		try {
			const response = await $fetch(`/api/video/meeting-info`, {
				params: { roomName: roomName.value },
			});
			meeting.value = response.data;
		} catch (error) {
			console.error('Error polling meeting:', error);
		}
	}, 3000); // Poll every 3 seconds
};

const handleParticipantConnected = (participant) => {
	console.log('Participant connected:', participant.identity);
	remoteParticipants.value.push(participant);

	participant.tracks.forEach((publication) => {
		if (publication.track) {
			// Track is already subscribed
		}
	});

	participant.on('trackSubscribed', (track) => {
		// Track subscribed
	});
};

const handleParticipantDisconnected = (participant) => {
	console.log('Participant disconnected:', participant.identity);
	remoteParticipants.value = remoteParticipants.value.filter((p) => p.sid !== participant.sid);
};

const attachParticipantTracks = (el, participant) => {
	if (!el) return;

	el.innerHTML = '';
	participant.tracks.forEach((publication) => {
		if (publication.track) {
			el.appendChild(publication.track.attach());
		}
	});

	participant.on('trackSubscribed', (track) => {
		el.appendChild(track.attach());
	});
};

// Host actions
const admitParticipant = async (attendee) => {
	try {
		await $fetch('/api/video/update-attendee-status', {
			method: 'POST',
			body: {
				attendeeId: attendee.id,
				status: 'admitted',
			},
		});
		toast.add({ title: `${attendee.guest_name} admitted`, color: 'green' });

		// Refresh meeting data
		const response = await $fetch(`/api/video/meeting-info`, {
			params: { roomName: roomName.value },
		});
		meeting.value = response.data;
	} catch (error) {
		toast.add({ title: 'Failed to admit', color: 'red' });
	}
};

const rejectParticipant = async (attendee) => {
	try {
		await $fetch('/api/video/update-attendee-status', {
			method: 'POST',
			body: {
				attendeeId: attendee.id,
				status: 'rejected',
			},
		});
		toast.add({ title: `${attendee.guest_name} removed`, color: 'gray' });

		// Refresh meeting data
		const response = await $fetch(`/api/video/meeting-info`, {
			params: { roomName: roomName.value },
		});
		meeting.value = response.data;
	} catch (error) {
		toast.add({ title: 'Failed to remove', color: 'red' });
	}
};

const leaveWaitingRoom = () => {
	inWaitingRoom.value = false;
	hasJoined.value = false;
	if (statusPollInterval) {
		clearInterval(statusPollInterval);
		statusPollInterval = null;
	}
	router.push('/');
};

const leaveMeeting = async () => {
	// Disconnect from Twilio
	if (twilioRoom.value) {
		twilioRoom.value.disconnect();
	}

	// Stop local tracks
	localTracks.value.forEach((track) => track.stop());

	// Clear intervals
	if (durationInterval) {
		clearInterval(durationInterval);
	}
	if (hostPollInterval) {
		clearInterval(hostPollInterval);
	}
	if (statusPollInterval) {
		clearInterval(statusPollInterval);
	}

	// Update status
	if (myAttendeeId.value) {
		try {
			await $fetch('/api/video/update-attendee-status', {
				method: 'POST',
				body: {
					attendeeId: myAttendeeId.value,
					status: 'left',
				},
			});
		} catch (e) {
			// Ignore
		}
	}

	router.push('/');
};

const copyMeetingLink = async () => {
	await navigator.clipboard.writeText(window.location.href);
	toast.add({ title: 'Meeting link copied!', color: 'green' });
};

// Helpers
const formatDateTime = (date) => {
	return format(new Date(date), 'EEEE, MMMM d · h:mm a');
};

const formatDuration = (seconds) => {
	const hrs = Math.floor(seconds / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;

	if (hrs > 0) {
		return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	}
	return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Lifecycle
onMounted(() => {
	fetchMeeting();
	setupPreview();
});

onBeforeUnmount(() => {
	// Cleanup
	if (previewStream.value) {
		previewStream.value.getTracks().forEach((t) => t.stop());
	}
	if (twilioRoom.value) {
		twilioRoom.value.disconnect();
	}
	localTracks.value.forEach((track) => track.stop());
	if (durationInterval) {
		clearInterval(durationInterval);
	}
	if (hostPollInterval) {
		clearInterval(hostPollInterval);
	}
	if (statusPollInterval) {
		clearInterval(statusPollInterval);
	}
});
</script>

<style scoped>
.mirror {
	transform: scaleX(-1);
}
</style>
