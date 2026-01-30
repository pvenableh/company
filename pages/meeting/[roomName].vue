<!-- pages/meeting/[roomName].vue -->
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
		<div v-else-if="meeting.status === 'completed'" class="flex items-center justify-center min-h-screen">
			<div class="text-center max-w-md">
				<UIcon name="i-lucide-check-circle-2" class="w-16 h-16 mx-auto text-green-500" />
				<h1 class="text-2xl font-bold mt-4">Meeting Ended</h1>
				<p class="text-gray-400 mt-2">This meeting has already ended.</p>
				<UButton to="/" class="mt-6" color="gray">Go Home</UButton>
			</div>
		</div>

		<!-- Guest Entry Form (not joined yet) -->
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

					<!-- Camera/Mic Preview -->
					<div class="bg-gray-900 rounded-lg p-4">
						<div class="aspect-video bg-black rounded-lg overflow-hidden mb-3 relative">
							<video ref="previewVideo" autoplay muted playsinline class="w-full h-full object-cover" />
							<div v-if="!previewStream" class="absolute inset-0 flex items-center justify-center">
								<UIcon name="i-lucide-video-off" class="w-12 h-12 text-gray-600" />
							</div>
						</div>
						<div class="flex justify-center gap-4">
							<UButton
								:color="videoEnabled ? 'green' : 'red'"
								variant="soft"
								:icon="videoEnabled ? 'i-lucide-video' : 'i-lucide-video-off'"
								@click="togglePreviewVideo"
							>
								{{ videoEnabled ? 'Camera On' : 'Camera Off' }}
							</UButton>
							<UButton
								:color="audioEnabled ? 'green' : 'red'"
								variant="soft"
								:icon="audioEnabled ? 'i-lucide-mic' : 'i-lucide-mic-off'"
								@click="togglePreviewAudio"
							>
								{{ audioEnabled ? 'Mic On' : 'Mic Off' }}
							</UButton>
						</div>
					</div>

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
				<p class="text-gray-500 text-sm mt-4">
					{{ meeting.title }}
				</p>
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

		<!-- In Meeting -->
		<div v-else class="h-screen flex flex-col">
			<!-- Meeting Header -->
			<div class="bg-gray-800 px-4 py-3 flex items-center justify-between">
				<div class="flex items-center gap-3">
					<UIcon name="i-lucide-video" class="w-5 h-5 text-green-500" />
					<span class="font-medium">{{ meeting.title }}</span>
					<UBadge color="green" variant="soft" size="xs">
						<span class="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse" />
						Live
					</UBadge>
					<UBadge v-if="anyScreenShareActive" color="blue" variant="soft" size="xs">
						<UIcon name="i-lucide-monitor" class="w-3 h-3 mr-1" />
						Screen Sharing
					</UBadge>
				</div>
				<div class="flex items-center gap-3">
					<!-- View Mode Selector -->
					<div class="flex items-center bg-gray-700 rounded-lg p-0.5">
						<button
							v-for="mode in viewModes"
							:key="mode.value"
							class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
							:class="viewMode === mode.value ? 'bg-gray-500 text-white' : 'text-gray-400 hover:text-white'"
							@click="viewMode = mode.value"
							:title="mode.label"
						>
							<UIcon :name="mode.icon" class="w-4 h-4" />
						</button>
					</div>
					<span class="text-sm text-gray-400">{{ formatDuration(meetingDuration) }}</span>
					<UButton
						color="gray"
						variant="ghost"
						size="sm"
						icon="i-lucide-users"
						@click="showParticipantsPanel = !showParticipantsPanel"
					>
						{{ participantIdentities.length + 1 }}
					</UButton>
				</div>
			</div>

			<!-- Main Content Area -->
			<div class="flex-1 flex overflow-hidden">
				<!-- Video Area -->
				<div class="flex-1 bg-black p-4 relative overflow-hidden">
					<!-- Screen Share Active Layout (Zoom-style) -->
					<div v-if="anyScreenShareActive" class="h-full flex gap-4">
						<!-- Main Screen Share Area -->
						<div class="flex-1 relative bg-gray-800 rounded-lg overflow-hidden">
							<!-- Local screen share -->
							<div v-if="screenShareEnabled" ref="screenShareContainer" class="w-full h-full screen-share-container" />
							<!-- Remote screen share -->
							<div v-else-if="remoteScreenShareParticipantSid" :ref="(el) => attachRemoteScreenShare(el)" class="w-full h-full screen-share-container" />
							<div class="absolute bottom-3 left-3 bg-black/60 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2">
								<UIcon name="i-lucide-monitor" class="w-4 h-4 text-blue-400" />
								{{ screenShareEnabled ? 'Your Screen' : remoteScreenShareIdentity + "'s Screen" }}
							</div>
						</div>
						<!-- Participant Thumbnails Strip -->
						<div class="w-48 flex flex-col gap-2 overflow-y-auto">
							<!-- Local Video Thumbnail -->
							<div class="relative bg-gray-800 rounded-lg overflow-hidden aspect-video flex-shrink-0">
								<div ref="localVideoContainer" class="w-full h-full mirror local-video-container" :class="{ 'video-enhanced': enhancementEnabled }" />
								<div class="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-xs">
									You {{ isHost ? '(Host)' : '' }}
								</div>
							</div>
							<!-- Remote Participant Thumbnails -->
							<div
								v-for="p in participantIdentities"
								:key="p.sid"
								class="relative bg-gray-800 rounded-lg overflow-hidden aspect-video flex-shrink-0"
							>
								<div :ref="(el) => attachRemoteTracks(el, p.sid)" class="w-full h-full remote-video-container" />
								<div class="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-xs">
									{{ p.identity }}
								</div>
							</div>
						</div>
					</div>

					<!-- Speaker View Layout -->
					<div v-else-if="viewMode === 'speaker'" class="h-full flex flex-col gap-4">
						<!-- Main Speaker Area -->
						<div class="flex-1 relative bg-gray-800 rounded-lg overflow-hidden">
							<template v-if="dominantSpeakerSid && dominantSpeakerSid !== '__local__'">
								<div :ref="(el) => attachRemoteTracks(el, dominantSpeakerSid)" class="w-full h-full remote-video-container" />
								<div class="absolute bottom-3 left-3 bg-black/60 px-3 py-1.5 rounded-lg text-sm">
									{{ getDominantSpeakerIdentity() }}
								</div>
							</template>
							<template v-else>
								<div ref="localVideoContainer" class="w-full h-full mirror local-video-container" :class="{ 'video-enhanced': enhancementEnabled }" />
								<div class="absolute bottom-3 left-3 bg-black/60 px-3 py-1.5 rounded-lg text-sm">
									You {{ isHost ? '(Host)' : '' }}
								</div>
							</template>
						</div>
						<!-- Bottom Strip -->
						<div class="h-28 flex gap-2 overflow-x-auto flex-shrink-0">
							<!-- Local (if not dominant) -->
							<div
								v-if="dominantSpeakerSid && dominantSpeakerSid !== '__local__'"
								class="relative bg-gray-800 rounded-lg overflow-hidden aspect-video h-full flex-shrink-0"
							>
								<div ref="localVideoContainerAlt" class="w-full h-full mirror local-video-container" :class="{ 'video-enhanced': enhancementEnabled }" />
								<div class="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-xs">
									You {{ isHost ? '(Host)' : '' }}
								</div>
							</div>
							<!-- Other remote participants (not the dominant speaker) -->
							<div
								v-for="p in nonDominantParticipants"
								:key="p.sid"
								class="relative bg-gray-800 rounded-lg overflow-hidden aspect-video h-full flex-shrink-0"
							>
								<div :ref="(el) => attachRemoteTracks(el, p.sid)" class="w-full h-full remote-video-container" />
								<div class="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-xs">
									{{ p.identity }}
								</div>
							</div>
						</div>
					</div>

					<!-- Gallery View Layout (Default) -->
					<div v-else class="h-full grid gap-4" :class="videoGridClass">
						<!-- Remote Participants -->
						<div
							v-for="p in participantIdentities"
							:key="p.sid"
							class="relative bg-gray-800 rounded-lg overflow-hidden"
						>
							<div :ref="(el) => attachRemoteTracks(el, p.sid)" class="w-full h-full remote-video-container" />
							<div class="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-sm">
								{{ p.identity }}
							</div>
						</div>

						<!-- Local Video -->
						<div class="relative bg-gray-800 rounded-lg overflow-hidden">
							<div ref="localVideoContainer" class="w-full h-full mirror local-video-container" :class="{ 'video-enhanced': enhancementEnabled }" />
							<div class="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-sm">
								You {{ isHost ? '(Host)' : '' }}
							</div>
						</div>
					</div>
				</div>

				<!-- Participants Side Panel -->
				<transition name="slide-panel">
					<div
						v-if="showParticipantsPanel"
						class="w-80 bg-gray-800 border-l border-gray-700 flex flex-col overflow-hidden flex-shrink-0"
					>
						<!-- Panel Header -->
						<div class="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
							<h3 class="font-semibold text-sm">Participants ({{ participantIdentities.length + 1 }})</h3>
							<UButton
								color="gray"
								variant="ghost"
								size="xs"
								icon="i-lucide-x"
								@click="showParticipantsPanel = false"
							/>
						</div>

						<!-- Panel Content -->
						<div class="flex-1 overflow-y-auto p-3 space-y-4">
							<!-- Waiting Section -->
							<div v-if="waitingParticipants.length > 0">
								<h4 class="text-xs font-semibold text-yellow-500 uppercase tracking-wider mb-2">
									Waiting ({{ waitingParticipants.length }})
								</h4>
								<div class="space-y-1.5">
									<div
										v-for="attendee in waitingParticipants"
										:key="attendee.id"
										class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-700/50 transition-colors"
									>
										<div class="w-8 h-8 rounded-full bg-yellow-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
											{{ getInitials(attendee.guest_name || 'G') }}
										</div>
										<div class="flex-1 min-w-0">
											<p class="text-sm font-medium truncate">{{ attendee.guest_name || 'Guest' }}</p>
											<p v-if="attendee.guest_email" class="text-xs text-gray-400 truncate">{{ attendee.guest_email }}</p>
										</div>
										<div v-if="isHost" class="flex gap-1 flex-shrink-0">
											<UButton color="green" size="xs" icon="i-lucide-check" variant="soft" @click="admitParticipant(attendee)" />
											<UButton color="red" size="xs" icon="i-lucide-x" variant="soft" @click="rejectParticipant(attendee)" />
										</div>
									</div>
								</div>
							</div>

							<!-- In Meeting Section -->
							<div>
								<h4 class="text-xs font-semibold text-green-500 uppercase tracking-wider mb-2">
									In Meeting ({{ inMeetingParticipants.length }})
								</h4>
								<div class="space-y-1.5">
									<!-- Current user (you) -->
									<div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-700/50 transition-colors">
										<div class="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
											{{ getInitials(guestName || 'You') }}
										</div>
										<div class="flex-1 min-w-0">
											<p class="text-sm font-medium truncate">
												{{ guestName || 'You' }}
												<span class="text-xs text-gray-400">(You)</span>
												<UBadge v-if="isHost" size="xs" color="blue" class="ml-1">Host</UBadge>
											</p>
										</div>
									</div>
									<!-- Other in-meeting participants -->
									<div
										v-for="attendee in inMeetingParticipants.filter(a => a.id !== myAttendeeId)"
										:key="attendee.id"
										class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-700/50 transition-colors"
									>
										<div class="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
											{{ getInitials(attendee.guest_name || attendee.directus_user?.first_name || 'G') }}
										</div>
										<div class="flex-1 min-w-0">
											<p class="text-sm font-medium truncate">
												{{ attendee.guest_name || attendee.directus_user?.first_name || 'Guest' }}
												<UBadge v-if="attendee.directus_user?.id === meeting.host_user?.id" size="xs" color="blue" class="ml-1">
													Host
												</UBadge>
											</p>
											<p v-if="attendee.guest_email" class="text-xs text-gray-400 truncate">{{ attendee.guest_email }}</p>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</transition>
			</div>

			<!-- Meeting Controls -->
			<div class="bg-gray-800 px-4 py-4">
				<div class="flex items-center justify-center gap-4">
					<UButton
						:color="audioEnabled ? 'gray' : 'red'"
						size="lg"
						:icon="audioEnabled ? 'i-lucide-mic' : 'i-lucide-mic-off'"
						@click="toggleAudio"
						class="rounded-full"
					/>
					<UButton
						:color="videoEnabled ? 'gray' : 'red'"
						size="lg"
						:icon="videoEnabled ? 'i-lucide-video' : 'i-lucide-video-off'"
						@click="toggleVideo"
						class="rounded-full"
					/>
					<UButton
						:color="backgroundBlurEnabled ? 'blue' : 'gray'"
						size="lg"
						icon="i-lucide-blur"
						@click="toggleBackgroundBlur"
						class="rounded-full"
						:title="backgroundBlurEnabled ? 'Disable background blur' : 'Blur background'"
						:disabled="!videoEnabled"
					/>
					<UButton
						:color="enhancementEnabled ? 'blue' : 'gray'"
						size="lg"
						icon="i-lucide-sparkles"
						@click="toggleEnhancement"
						class="rounded-full"
						:title="enhancementEnabled ? 'Disable enhancement' : 'Enhance image'"
						:disabled="!videoEnabled"
					/>
					<UButton
						:color="screenShareEnabled ? 'green' : 'gray'"
						size="lg"
						icon="i-lucide-monitor"
						@click="toggleScreenShare"
						class="rounded-full"
						:title="screenShareEnabled ? 'Stop sharing' : 'Share screen'"
					/>
					<UButton
						color="gray"
						size="lg"
						icon="i-lucide-users"
						@click="showParticipantsPanel = !showParticipantsPanel"
						class="rounded-full relative"
					>
						<UBadge v-if="waitingParticipants.length" color="yellow" size="xs" class="absolute -top-1 -right-1">
							{{ waitingParticipants.length }}
						</UBadge>
					</UButton>
					<UButton color="gray" size="lg" icon="i-lucide-clipboard" @click="copyMeetingLink" class="rounded-full" />
					<UButton color="red" size="lg" icon="i-lucide-phone-off" @click="leaveMeeting" class="rounded-full" />
				</div>
			</div>
		</div>
	</div>
</template>

<script setup>
import { format } from 'date-fns';
import { nextTick, watch } from 'vue';

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
const showParticipantsPanel = ref(false);

// View mode state
const viewMode = ref('gallery');
const viewModes = [
	{ value: 'gallery', label: 'Gallery View', icon: 'i-lucide-layout-grid' },
	{ value: 'speaker', label: 'Speaker View', icon: 'i-lucide-user' },
];

// Dominant speaker tracking
const dominantSpeakerSid = ref(null);

// Remote screen share tracking
const remoteScreenShareParticipantSid = ref(null);
const remoteScreenShareIdentity = ref('');
let _remoteScreenShareTrack = null;

// Media state - camera and mic start disabled until user explicitly enables
const videoEnabled = ref(false);
const audioEnabled = ref(false);
const previewStream = ref(null);
const localVideoContainer = ref(null);
const localVideoContainerAlt = ref(null);
const previewVideo = ref(null);
const screenShareEnabled = ref(false);
const screenShareContainer = ref(null);

// Camera enhancement state
const backgroundBlurEnabled = ref(false);
const enhancementEnabled = ref(false);
let _blurProcessor = null;

// Computed: is any screen share active (local or remote)
const anyScreenShareActive = computed(() => {
	return screenShareEnabled.value || !!remoteScreenShareParticipantSid.value;
});

// Twilio state - kept as plain variables (NOT reactive) to avoid Vue Proxy
// wrapping Twilio objects. Twilio's internal loglevel library has non-configurable
// properties that break when accessed through a Proxy.
let _twilioRoom = null;
let _localTracks = [];
let _screenTrack = null;

// Map of participant SID -> raw Twilio RemoteParticipant (not reactive)
const _remoteParticipantMap = new Map();

// Reactive list of participant identities for template rendering (plain data only)
const participantIdentities = ref([]);

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

const nonDominantParticipants = computed(() => {
	return participantIdentities.value.filter((p) => p.sid !== dominantSpeakerSid.value);
});

const videoGridClass = computed(() => {
	const count = participantIdentities.value.length + 1; // +1 for local
	if (count === 1) return 'grid-cols-1';
	if (count === 2) return 'grid-cols-2';
	if (count <= 4) return 'grid-cols-2 grid-rows-2';
	return 'grid-cols-3 grid-rows-2';
});

// Helper to get initials from a name
const getInitials = (name) => {
	if (!name) return '?';
	return name
		.split(' ')
		.map((n) => n[0])
		.join('')
		.toUpperCase()
		.slice(0, 2);
};

// Get dominant speaker identity
const getDominantSpeakerIdentity = () => {
	const p = participantIdentities.value.find((p) => p.sid === dominantSpeakerSid.value);
	return p ? p.identity : 'Speaker';
};

// Attach local video to the appropriate container based on current view
const attachLocalVideoToContainer = () => {
	const videoTrack = _localTracks.find((t) => t.kind === 'video');
	if (!videoTrack) return;

	// Determine which container to use
	const container = localVideoContainer.value || localVideoContainerAlt.value;
	if (container) {
		container.innerHTML = '';
		container.appendChild(videoTrack.attach());
	}
};

// Watch for view mode and dominant speaker changes to re-attach local video
watch([viewMode, dominantSpeakerSid, () => anyScreenShareActive.value], async () => {
	await nextTick();
	await nextTick();
	attachLocalVideoToContainer();
	// Re-attach all remote tracks
	participantIdentities.value.forEach((p) => {
		const els = document.querySelectorAll(`[data-participant-sid="${p.sid}"]`);
		if (els.length) {
			attachRemoteTracks(els[0], p.sid);
		}
	});
}, { flush: 'post' });

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
			const hostDisplayName =
				`${currentUser.value.first_name || ''} ${currentUser.value.last_name || ''}`.trim() ||
				currentUser.value.email?.split('@')[0] ||
				'Host';
			guestName.value = hostDisplayName;

			// Register host as attendee so they have an attendee record
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
			await connectToRoom();
		} else if (currentUser.value) {
			// Authenticated non-host user: auto-join without showing the entry form
			const displayName =
				`${currentUser.value.first_name || ''} ${currentUser.value.last_name || ''}`.trim() ||
				currentUser.value.email?.split('@')[0] ||
				'User';
			guestName.value = displayName;
			guestEmail.value = currentUser.value.email || '';

			// Register as attendee and join automatically
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
					await connectToRoom();
				}
			} catch (e) {
				console.error('Error auto-joining as authenticated user:', e);
				toast.add({ title: 'Failed to join meeting', description: e.message, color: 'red' });
			}
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
		const stream = await navigator.mediaDevices.getUserMedia({
			video: true,
			audio: true,
		});
		// Mute tracks that should be off based on current toggle state
		stream.getVideoTracks().forEach((t) => { t.enabled = videoEnabled.value; });
		stream.getAudioTracks().forEach((t) => { t.enabled = audioEnabled.value; });
		previewStream.value = stream;
		if (previewVideo.value) {
			previewVideo.value.srcObject = stream;
		}
	} catch (error) {
		console.error('Error accessing media:', error);
		toast.add({ title: 'Could not access camera/microphone', color: 'yellow' });
	}
};

// Preview-only toggles (before joining the Twilio room)
const togglePreviewVideo = async () => {
	videoEnabled.value = !videoEnabled.value;
	if (videoEnabled.value) {
		// Request camera access if we don't have a preview stream yet
		if (!previewStream.value) {
			await setupPreview();
		} else {
			previewStream.value.getVideoTracks().forEach((track) => {
				track.enabled = true;
			});
		}
	} else if (previewStream.value) {
		previewStream.value.getVideoTracks().forEach((track) => {
			track.enabled = false;
		});
	}
};

const togglePreviewAudio = async () => {
	audioEnabled.value = !audioEnabled.value;
	if (audioEnabled.value) {
		if (!previewStream.value) {
			await setupPreview();
		} else {
			previewStream.value.getAudioTracks().forEach((track) => {
				track.enabled = true;
			});
		}
	} else if (previewStream.value) {
		previewStream.value.getAudioTracks().forEach((track) => {
			track.enabled = false;
		});
	}
};

// In-meeting toggles (unpublish+stop to actually release browser devices)
const toggleVideo = async () => {
	videoEnabled.value = !videoEnabled.value;

	if (!videoEnabled.value) {
		// Remove blur processor before stopping the track
		const videoTrack = _localTracks.find((t) => t.kind === 'video');
		if (videoTrack) {
			if (_blurProcessor && backgroundBlurEnabled.value) {
				try { videoTrack.removeProcessor(_blurProcessor); } catch (e) { /* ignore */ }
			}
			if (_twilioRoom) {
				_twilioRoom.localParticipant.unpublishTrack(videoTrack);
			}
			videoTrack.stop();
			// Remove the <video> element from the local container
			if (localVideoContainer.value) {
				localVideoContainer.value.innerHTML = '';
			}
			if (localVideoContainerAlt.value) {
				localVideoContainerAlt.value.innerHTML = '';
			}
			_localTracks = _localTracks.filter((t) => t.kind !== 'video');
		}
	} else {
		// Create a new video track and publish it
		try {
			const TwilioVideo = await import('twilio-video');
			const newTrack = await TwilioVideo.createLocalVideoTrack();
			_localTracks.push(newTrack);
			// Re-apply blur processor if it was enabled
			if (backgroundBlurEnabled.value && _blurProcessor) {
				newTrack.addProcessor(_blurProcessor);
			}
			if (_twilioRoom) {
				_twilioRoom.localParticipant.publishTrack(newTrack);
			}
			await nextTick();
			attachLocalVideoToContainer();
		} catch (err) {
			console.error('Error re-enabling video:', err);
			videoEnabled.value = false;
		}
	}
};

const toggleAudio = async () => {
	audioEnabled.value = !audioEnabled.value;

	if (!audioEnabled.value) {
		// Stop and unpublish the audio track so the browser mic indicator turns off
		const audioTrack = _localTracks.find((t) => t.kind === 'audio');
		if (audioTrack) {
			if (_twilioRoom) {
				_twilioRoom.localParticipant.unpublishTrack(audioTrack);
			}
			audioTrack.stop();
			_localTracks = _localTracks.filter((t) => t.kind !== 'audio');
		}
	} else {
		// Create a new audio track and publish it
		try {
			const TwilioVideo = await import('twilio-video');
			const newTrack = await TwilioVideo.createLocalAudioTrack();
			_localTracks.push(newTrack);
			if (_twilioRoom) {
				_twilioRoom.localParticipant.publishTrack(newTrack);
			}
		} catch (err) {
			console.error('Error re-enabling audio:', err);
			audioEnabled.value = false;
		}
	}
};

// Background blur toggle
const toggleBackgroundBlur = async () => {
	const videoTrack = _localTracks.find((t) => t.kind === 'video');
	if (!videoTrack) {
		toast.add({ title: 'Enable camera first', color: 'yellow' });
		return;
	}

	backgroundBlurEnabled.value = !backgroundBlurEnabled.value;

	if (backgroundBlurEnabled.value) {
		try {
			const VideoProcessors = await import('@twilio/video-processors');
			if (!_blurProcessor) {
				_blurProcessor = new VideoProcessors.GaussianBlurBackgroundProcessor({
					assetsPath: '/twilio-video-processors/',
					blurFilterRadius: 15,
					maskBlurRadius: 5,
				});
				await _blurProcessor.loadModel();
			}
			videoTrack.addProcessor(_blurProcessor);
		} catch (err) {
			console.error('Error enabling background blur:', err);
			backgroundBlurEnabled.value = false;
			toast.add({ title: 'Failed to enable background blur', color: 'red' });
		}
	} else {
		if (_blurProcessor) {
			videoTrack.removeProcessor(_blurProcessor);
		}
	}
};

// Image enhancement toggle (brightness, contrast, saturation boost via CSS)
const toggleEnhancement = () => {
	enhancementEnabled.value = !enhancementEnabled.value;
};

// Join meeting
const joinMeeting = async () => {
	if (!guestName.value.trim()) {
		toast.add({ title: 'Please enter your name', color: 'red' });
		return;
	}

	if (!guestEmail.value.trim()) {
		toast.add({ title: 'Please enter your email', color: 'red' });
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

// Check if a track is a screen share track
const isScreenShareTrack = (track) => {
	return track.name === 'screen' || track.name === 'screen-share';
};

// Handle remote screen share track
const handleRemoteScreenShare = (track, participant) => {
	_remoteScreenShareTrack = track;
	remoteScreenShareParticipantSid.value = participant.sid;
	remoteScreenShareIdentity.value = participant.identity;

	// Wait for DOM to update then attach
	nextTick(() => {
		nextTick(() => {
			const container = document.querySelector('.screen-share-container');
			if (container && _remoteScreenShareTrack) {
				container.innerHTML = '';
				container.appendChild(_remoteScreenShareTrack.attach());
			}
		});
	});
};

// Remove remote screen share
const removeRemoteScreenShare = (track) => {
	if (_remoteScreenShareTrack === track) {
		track.detach().forEach((el) => el.remove());
		_remoteScreenShareTrack = null;
		remoteScreenShareParticipantSid.value = null;
		remoteScreenShareIdentity.value = '';
	}
};

// Attach remote screen share to container
const attachRemoteScreenShare = (el) => {
	if (!el || !_remoteScreenShareTrack) return;
	el.innerHTML = '';
	el.appendChild(_remoteScreenShareTrack.attach());
};

// Connect to Twilio room
const connectToRoom = async () => {
	try {
		// Get Twilio token
		const identity =
			guestName.value ||
			`${currentUser.value?.first_name || ''} ${currentUser.value?.last_name || ''}`.trim() ||
			'Guest';
		const tokenResponse = await $fetch('/api/video/token', {
			method: 'POST',
			body: {
				roomName: roomName.value,
				identity,
			},
		});

		// Import Twilio Video (client-side only)
		const TwilioVideo = await import('twilio-video');

		// Create local tracks
		const tracks = await TwilioVideo.createLocalTracks({
			video: videoEnabled.value,
			audio: audioEnabled.value,
		});
		_localTracks = tracks;

		// Wait for Vue to render the in-meeting DOM (hasJoined was set before this call)
		// Multiple nextTick calls ensure the v-else conditional block is fully rendered
		// and template refs are assigned
		await nextTick();
		await nextTick();

		// Attach local video to container div
		attachLocalVideoToContainer();

		// Connect to room
		const room = await TwilioVideo.connect(tokenResponse.data.token, {
			name: roomName.value,
			tracks,
			dominantSpeaker: true,
		});
		_twilioRoom = room;

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

		// Track dominant speaker
		room.on('dominantSpeakerChanged', (participant) => {
			if (participant) {
				dominantSpeakerSid.value = participant.sid;
			} else {
				// No dominant speaker - default to local
				dominantSpeakerSid.value = '__local__';
			}
		});

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

		// Stop preview stream
		if (previewStream.value) {
			previewStream.value.getTracks().forEach((t) => t.stop());
			previewStream.value = null;
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
	// Store raw Twilio object in a plain Map (no Vue reactivity)
	_remoteParticipantMap.set(participant.sid, participant);
	// Update reactive list with plain data only
	participantIdentities.value = [...participantIdentities.value, { sid: participant.sid, identity: participant.identity }];

	// Check existing tracks for screen share
	participant.tracks.forEach((publication) => {
		if (publication.track && isScreenShareTrack(publication.track)) {
			handleRemoteScreenShare(publication.track, participant);
		}
	});

	// Listen for new tracks (including screen share)
	participant.on('trackSubscribed', (track) => {
		if (isScreenShareTrack(track)) {
			handleRemoteScreenShare(track, participant);
		}
	});

	participant.on('trackUnsubscribed', (track) => {
		if (isScreenShareTrack(track)) {
			removeRemoteScreenShare(track);
		}
	});
};

const handleParticipantDisconnected = (participant) => {
	console.log('Participant disconnected:', participant.identity);
	_remoteParticipantMap.delete(participant.sid);
	participantIdentities.value = participantIdentities.value.filter((p) => p.sid !== participant.sid);

	// Clear remote screen share if this participant was sharing
	if (remoteScreenShareParticipantSid.value === participant.sid) {
		if (_remoteScreenShareTrack) {
			_remoteScreenShareTrack.detach().forEach((el) => el.remove());
			_remoteScreenShareTrack = null;
		}
		remoteScreenShareParticipantSid.value = null;
		remoteScreenShareIdentity.value = '';
	}

	// Clear dominant speaker if they disconnected
	if (dominantSpeakerSid.value === participant.sid) {
		dominantSpeakerSid.value = '__local__';
	}
};

// Attach remote participant tracks to a DOM element
const attachRemoteTracks = (el, sid) => {
	if (!el) return;
	const participant = _remoteParticipantMap.get(sid);
	if (!participant) return;

	el.innerHTML = '';
	participant.tracks.forEach((publication) => {
		if (publication.track && !isScreenShareTrack(publication.track)) {
			el.appendChild(publication.track.attach());
		}
	});

	participant.on('trackSubscribed', (track) => {
		if (!isScreenShareTrack(track)) {
			el.appendChild(track.attach());
		}
	});

	participant.on('trackUnsubscribed', (track) => {
		if (!isScreenShareTrack(track)) {
			track.detach().forEach((detachedEl) => detachedEl.remove());
		}
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

// Screen sharing
const toggleScreenShare = async () => {
	if (screenShareEnabled.value) {
		// Stop screen share
		if (_screenTrack) {
			if (_twilioRoom) {
				_twilioRoom.localParticipant.unpublishTrack(_screenTrack);
			}
			_screenTrack.stop();
			_screenTrack = null;
		}
		screenShareEnabled.value = false;
		return;
	}

	try {
		const stream = await navigator.mediaDevices.getDisplayMedia({
			video: { cursor: 'always' },
			audio: false,
		});

		const { LocalVideoTrack } = await import('twilio-video');
		const track = new LocalVideoTrack(stream.getTracks()[0], { name: 'screen-share' });

		if (_twilioRoom) {
			_twilioRoom.localParticipant.publishTrack(track);
		}

		_screenTrack = track;
		screenShareEnabled.value = true;

		// Attach screen share to local preview container
		await nextTick();
		await nextTick();
		if (screenShareContainer.value) {
			screenShareContainer.value.innerHTML = '';
			screenShareContainer.value.appendChild(track.attach());
		}

		// Handle the browser's "Stop sharing" button
		track.mediaStreamTrack.addEventListener('ended', () => {
			if (screenShareEnabled.value) {
				toggleScreenShare();
			}
		});
	} catch (error) {
		if (error.name !== 'NotAllowedError') {
			console.error('Screen share error:', error);
			toast.add({ title: 'Failed to share screen', description: error.message, color: 'red' });
		}
	}
};

const leaveMeeting = async () => {
	// Stop screen share if active
	if (_screenTrack) {
		_screenTrack.stop();
		_screenTrack = null;
		screenShareEnabled.value = false;
	}

	// Clean up remote screen share
	if (_remoteScreenShareTrack) {
		_remoteScreenShareTrack.detach().forEach((el) => el.remove());
		_remoteScreenShareTrack = null;
	}
	remoteScreenShareParticipantSid.value = null;
	remoteScreenShareIdentity.value = '';

	// Disconnect from Twilio
	if (_twilioRoom) {
		_twilioRoom.disconnect();
		_twilioRoom = null;
	}

	// Clean up blur processor
	if (_blurProcessor) {
		_blurProcessor = null;
	}
	backgroundBlurEnabled.value = false;
	enhancementEnabled.value = false;

	// Stop local tracks
	_localTracks.forEach((track) => track.stop());
	_localTracks = [];

	// Clear participant map
	_remoteParticipantMap.clear();
	participantIdentities.value = [];

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
});

onBeforeUnmount(() => {
	// Cleanup
	if (previewStream.value) {
		previewStream.value.getTracks().forEach((t) => t.stop());
	}
	if (_screenTrack) {
		_screenTrack.stop();
		_screenTrack = null;
	}
	if (_remoteScreenShareTrack) {
		_remoteScreenShareTrack.detach().forEach((el) => el.remove());
		_remoteScreenShareTrack = null;
	}
	if (_twilioRoom) {
		_twilioRoom.disconnect();
		_twilioRoom = null;
	}
	_localTracks.forEach((track) => track.stop());
	_localTracks = [];
	_remoteParticipantMap.clear();
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
.local-video-container,
.remote-video-container,
.screen-share-container {
	max-height: 100%;
	overflow: hidden;
}
.local-video-container :deep(video),
.remote-video-container :deep(video),
.screen-share-container :deep(video) {
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.screen-share-container :deep(video) {
	object-fit: contain;
}

/* Participants panel slide transition */
.slide-panel-enter-active,
.slide-panel-leave-active {
	transition: all 0.3s ease;
}
.slide-panel-enter-from,
.slide-panel-leave-to {
	transform: translateX(100%);
	opacity: 0;
}
.slide-panel-enter-to,
.slide-panel-leave-from {
	transform: translateX(0);
	opacity: 1;
}

/* Video enhancement filter - subtle brightness, contrast and saturation boost */
.video-enhanced :deep(video) {
	filter: brightness(1.08) contrast(1.1) saturate(1.15);
}
</style>
