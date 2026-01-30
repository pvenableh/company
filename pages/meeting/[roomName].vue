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
					<UBadge v-if="isScreenSharing || remoteScreenTrack" color="red" variant="soft" size="xs">
						<UIcon name="i-heroicons-computer-desktop" class="w-3 h-3 mr-1" />
						Screen Sharing
					</UBadge>
				</div>
				<div class="flex items-center gap-3">
					<!-- View Mode Selector -->
					<div class="flex items-center bg-gray-700 rounded-lg p-0.5">
						<button
							v-for="mode in viewModes"
							:key="mode.value"
							@click="viewMode = mode.value"
							class="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors"
							:class="viewMode === mode.value ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-300'"
						>
							<UIcon :name="mode.icon" class="w-3.5 h-3.5" />
							{{ mode.label }}
						</button>
					</div>

					<span class="text-sm text-gray-400">{{ formatDuration(meetingDuration) }}</span>

					<UButton
						color="gray"
						variant="ghost"
						size="sm"
						icon="i-heroicons-users"
						@click="showParticipantsPanel = !showParticipantsPanel"
						:class="showParticipantsPanel ? 'bg-gray-700' : ''"
					>
						{{ participants.length }}
					</UButton>
				</div>
			</div>

			<!-- Main Content Area -->
			<div class="flex-1 flex overflow-hidden">
				<!-- Video Area -->
				<div class="flex-1 bg-black p-4 relative flex flex-col">
					<!-- Screen Share Active: Fullscreen Layout -->
					<template v-if="remoteScreenTrack || isScreenSharing">
						<div class="flex-1 flex gap-3 min-h-0">
							<!-- Shared Screen (main area) -->
							<div class="flex-1 relative bg-gray-800 rounded-lg overflow-hidden min-w-0">
								<div
									v-if="remoteScreenTrack"
									ref="screenShareElement"
									class="w-full h-full screen-share-container"
								/>
								<div
									v-else-if="isScreenSharing"
									ref="localScreenShareElement"
									class="w-full h-full screen-share-container"
								/>
								<div class="absolute top-3 left-3 bg-black/70 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2">
									<UIcon name="i-heroicons-computer-desktop" class="w-4 h-4 text-red-400" />
									{{ screenShareIdentity || 'You' }} is sharing their screen
								</div>
							</div>

							<!-- Participant Thumbnails (side strip) -->
							<div class="w-44 flex flex-col gap-2 overflow-y-auto shrink-0">
								<!-- Remote participants -->
								<div
									v-for="participant in remoteParticipants"
									:key="participant.sid"
									class="relative bg-gray-800 rounded-lg overflow-hidden aspect-video shrink-0"
								>
									<div :ref="(el) => attachParticipantTracks(el, participant)" class="w-full h-full" />
									<div class="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-xs">
										{{ participant.identity }}
									</div>
								</div>

								<!-- Local Video -->
								<div class="relative bg-gray-800 rounded-lg overflow-hidden aspect-video shrink-0">
									<video ref="localVideo" autoplay muted playsinline class="w-full h-full object-cover mirror" />
									<div class="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-xs">
										You {{ isHost ? '(Host)' : '' }}
									</div>
								</div>
							</div>
						</div>
					</template>

					<!-- No Screen Share: Standard View Modes -->
					<template v-else>
						<!-- Gallery View -->
						<div v-if="viewMode === 'gallery'" class="h-full grid gap-4" :class="videoGridClass">
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

							<div class="relative bg-gray-800 rounded-lg overflow-hidden">
								<video ref="localVideo" autoplay muted playsinline class="w-full h-full object-cover mirror" />
								<div class="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-sm">
									You {{ isHost ? '(Host)' : '' }}
								</div>
							</div>
						</div>

						<!-- Speaker View -->
						<div v-else-if="viewMode === 'speaker'" class="h-full flex flex-col gap-3">
							<!-- Main Speaker -->
							<div class="flex-1 relative bg-gray-800 rounded-lg overflow-hidden min-h-0">
								<template v-if="activeSpeaker">
									<div :ref="(el) => attachParticipantTracks(el, activeSpeaker)" class="w-full h-full" />
									<div class="absolute bottom-3 left-3 bg-black/60 px-3 py-1.5 rounded-lg text-sm">
										{{ activeSpeaker.identity }}
									</div>
								</template>
								<template v-else>
									<video ref="localVideo" autoplay muted playsinline class="w-full h-full object-cover mirror" />
									<div class="absolute bottom-3 left-3 bg-black/60 px-3 py-1.5 rounded-lg text-sm">
										You {{ isHost ? '(Host)' : '' }}
									</div>
								</template>
							</div>

							<!-- Other Participants Strip -->
							<div v-if="speakerStripParticipants.length > 0" class="h-28 flex gap-2 shrink-0">
								<div
									v-for="participant in speakerStripParticipants"
									:key="participant.sid || 'local'"
									class="relative bg-gray-800 rounded-lg overflow-hidden aspect-video h-full"
								>
									<template v-if="participant.isLocal">
										<video ref="localVideoSpeaker" autoplay muted playsinline class="w-full h-full object-cover mirror" />
										<div class="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-xs">
											You {{ isHost ? '(Host)' : '' }}
										</div>
									</template>
									<template v-else>
										<div :ref="(el) => attachParticipantTracks(el, participant)" class="w-full h-full" />
										<div class="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-xs">
											{{ participant.identity }}
										</div>
									</template>
								</div>
							</div>
						</div>

						<!-- Sidebar View -->
						<div v-else-if="viewMode === 'sidebar'" class="h-full flex gap-3">
							<!-- Main Video -->
							<div class="flex-1 relative bg-gray-800 rounded-lg overflow-hidden min-w-0">
								<template v-if="activeSpeaker">
									<div :ref="(el) => attachParticipantTracks(el, activeSpeaker)" class="w-full h-full" />
									<div class="absolute bottom-3 left-3 bg-black/60 px-3 py-1.5 rounded-lg text-sm">
										{{ activeSpeaker.identity }}
									</div>
								</template>
								<template v-else>
									<video ref="localVideo" autoplay muted playsinline class="w-full h-full object-cover mirror" />
									<div class="absolute bottom-3 left-3 bg-black/60 px-3 py-1.5 rounded-lg text-sm">
										You {{ isHost ? '(Host)' : '' }}
									</div>
								</template>
							</div>

							<!-- Side Strip -->
							<div v-if="sidebarStripParticipants.length > 0" class="w-48 flex flex-col gap-2 overflow-y-auto shrink-0">
								<div
									v-for="participant in sidebarStripParticipants"
									:key="participant.sid || 'local'"
									class="relative bg-gray-800 rounded-lg overflow-hidden aspect-video shrink-0"
								>
									<template v-if="participant.isLocal">
										<video ref="localVideoSidebar" autoplay muted playsinline class="w-full h-full object-cover mirror" />
										<div class="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-xs">
											You {{ isHost ? '(Host)' : '' }}
										</div>
									</template>
									<template v-else>
										<div :ref="(el) => attachParticipantTracks(el, participant)" class="w-full h-full" />
										<div class="absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-xs">
											{{ participant.identity }}
										</div>
									</template>
								</div>
							</div>
						</div>
					</template>

					<!-- Waiting Room Panel (Host Only) -->
					<div
						v-if="isHost && waitingParticipants.length > 0"
						class="absolute top-4 left-4 bg-gray-800 rounded-lg p-4 w-72 shadow-xl z-10"
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

				<!-- Participants Side Panel -->
				<transition name="slide-panel">
					<div v-if="showParticipantsPanel" class="w-72 bg-gray-800 border-l border-gray-700 flex flex-col shrink-0">
						<div class="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
							<h3 class="font-semibold text-sm">Participants ({{ inMeetingParticipants.length }})</h3>
							<UButton
								color="gray"
								variant="ghost"
								size="xs"
								icon="i-heroicons-x-mark"
								@click="showParticipantsPanel = false"
							/>
						</div>

						<div class="flex-1 overflow-y-auto">
							<!-- Waiting -->
							<div v-if="waitingParticipants.length" class="p-3 border-b border-gray-700">
								<h4 class="text-xs text-yellow-500 font-medium mb-2 uppercase tracking-wide">
									Waiting ({{ waitingParticipants.length }})
								</h4>
								<div class="space-y-1.5">
									<div
										v-for="attendee in waitingParticipants"
										:key="attendee.id"
										class="flex items-center justify-between bg-gray-700/50 rounded-lg p-2"
									>
										<div class="flex items-center gap-2 min-w-0">
											<div class="w-7 h-7 rounded-full bg-yellow-500/20 flex items-center justify-center shrink-0">
												<span class="text-xs font-medium text-yellow-400">
													{{ (attendee.guest_name || 'G').charAt(0).toUpperCase() }}
												</span>
											</div>
											<div class="min-w-0">
												<p class="text-sm truncate">{{ attendee.guest_name || 'Guest' }}</p>
												<p v-if="attendee.guest_email" class="text-xs text-gray-500 truncate">{{ attendee.guest_email }}</p>
											</div>
										</div>
										<div v-if="isHost" class="flex gap-1 shrink-0 ml-2">
											<UButton color="green" size="2xs" icon="i-heroicons-check" @click="admitParticipant(attendee)" />
											<UButton color="red" size="2xs" variant="soft" icon="i-heroicons-x-mark" @click="rejectParticipant(attendee)" />
										</div>
									</div>
								</div>
							</div>

							<!-- In Meeting -->
							<div class="p-3">
								<h4 class="text-xs text-green-500 font-medium mb-2 uppercase tracking-wide">
									In Meeting ({{ inMeetingParticipants.length }})
								</h4>
								<div class="space-y-1.5">
									<div
										v-for="attendee in inMeetingParticipants"
										:key="attendee.id"
										class="flex items-center gap-2 bg-gray-700/50 rounded-lg p-2"
									>
										<div class="w-7 h-7 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
											<span class="text-xs font-medium text-green-400">
												{{ (attendee.guest_name || attendee.directus_user?.first_name || 'G').charAt(0).toUpperCase() }}
											</span>
										</div>
										<div class="min-w-0 flex-1">
											<p class="text-sm truncate flex items-center gap-1.5">
												{{ attendee.guest_name || attendee.directus_user?.first_name || 'Guest' }}
												<UBadge
													v-if="attendee.directus_user?.id === meeting.host_user?.id"
													size="xs"
													color="blue"
													variant="soft"
												>
													Host
												</UBadge>
											</p>
											<p v-if="attendee.guest_email" class="text-xs text-gray-500 truncate">{{ attendee.guest_email }}</p>
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
						:color="isScreenSharing ? 'green' : 'gray'"
						size="lg"
						icon="i-heroicons-computer-desktop"
						@click="toggleScreenShare"
						class="rounded-full"
					/>
					<UButton
						color="gray"
						size="lg"
						icon="i-heroicons-users"
						@click="showParticipantsPanel = !showParticipantsPanel"
						class="rounded-full relative"
						:class="showParticipantsPanel ? 'bg-gray-600' : ''"
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

// Participants panel state (replaces modal)
const showParticipantsPanel = ref(false);

// View mode state
const viewMode = ref('gallery');
const viewModes = [
	{ value: 'gallery', label: 'Gallery', icon: 'i-heroicons-squares-2x2' },
	{ value: 'speaker', label: 'Speaker', icon: 'i-heroicons-user' },
	{ value: 'sidebar', label: 'Sidebar', icon: 'i-heroicons-view-columns' },
];

// Screen sharing state
const isScreenSharing = ref(false);
const screenShareTrack = ref(null);
const remoteScreenTrack = ref(null);
const screenShareIdentity = ref(null);
const screenShareElement = ref(null);
const localScreenShareElement = ref(null);

// Media state
const videoEnabled = ref(true);
const audioEnabled = ref(true);
const previewStream = ref(null);
const localVideo = ref(null);
const localVideoSpeaker = ref(null);
const localVideoSidebar = ref(null);
const previewVideo = ref(null);

// Twilio state
const twilioRoom = ref(null);
const localTracks = ref([]);
const remoteParticipants = ref([]);

// Active speaker tracking
const activeSpeaker = ref(null);

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

// Speaker view: the active speaker is shown large, everyone else in a strip below
const speakerStripParticipants = computed(() => {
	const strip = [];
	// Add other remote participants (not the active speaker)
	remoteParticipants.value.forEach((p) => {
		if (!activeSpeaker.value || p.sid !== activeSpeaker.value.sid) {
			strip.push(p);
		}
	});
	// Add local video to strip if active speaker is a remote participant
	if (activeSpeaker.value) {
		strip.push({ isLocal: true, sid: 'local' });
	}
	return strip;
});

// Sidebar view: active speaker is large on left, everyone else in a column on right
const sidebarStripParticipants = computed(() => {
	const strip = [];
	remoteParticipants.value.forEach((p) => {
		if (!activeSpeaker.value || p.sid !== activeSpeaker.value.sid) {
			strip.push(p);
		}
	});
	if (activeSpeaker.value) {
		strip.push({ isLocal: true, sid: 'local' });
	}
	return strip;
});

// Watch for screen share track changes to attach to DOM
watch(remoteScreenTrack, async (track) => {
	if (track) {
		await nextTick();
		if (screenShareElement.value) {
			screenShareElement.value.innerHTML = '';
			screenShareElement.value.appendChild(track.attach());
		}
	}
});

watch(isScreenSharing, async (sharing) => {
	if (sharing && screenShareTrack.value) {
		await nextTick();
		if (localScreenShareElement.value) {
			localScreenShareElement.value.innerHTML = '';
			localScreenShareElement.value.appendChild(screenShareTrack.value.attach());
		}
	}
});

// Reattach local video when view mode changes (different refs for different views)
watch(viewMode, async () => {
	await nextTick();
	attachLocalVideoToCurrentView();
});

const attachLocalVideoToCurrentView = () => {
	const videoTrack = localTracks.value.find((t) => t.kind === 'video');
	if (!videoTrack) return;

	if (viewMode.value === 'speaker' && localVideoSpeaker.value) {
		const el = Array.isArray(localVideoSpeaker.value) ? localVideoSpeaker.value[0] : localVideoSpeaker.value;
		if (el) videoTrack.attach(el);
	} else if (viewMode.value === 'sidebar' && localVideoSidebar.value) {
		const el = Array.isArray(localVideoSidebar.value) ? localVideoSidebar.value[0] : localVideoSidebar.value;
		if (el) videoTrack.attach(el);
	} else if (localVideo.value) {
		videoTrack.attach(localVideo.value);
	}
};

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

// Screen sharing
const toggleScreenShare = async () => {
	if (isScreenSharing.value) {
		stopScreenShare();
	} else {
		await startScreenShare();
	}
};

const startScreenShare = async () => {
	try {
		const stream = await navigator.mediaDevices.getDisplayMedia({
			video: { cursor: 'always' },
			audio: false,
		});

		const screenTrack = stream.getVideoTracks()[0];

		// Import Twilio to create a LocalVideoTrack from the screen track
		const { LocalVideoTrack } = await import('twilio-video');
		const twilioScreenTrack = new LocalVideoTrack(screenTrack, { name: 'screen-share' });

		// Publish to the room
		if (twilioRoom.value) {
			twilioRoom.value.localParticipant.publishTrack(twilioScreenTrack);
		}

		screenShareTrack.value = twilioScreenTrack;
		isScreenSharing.value = true;

		// Listen for the native "stop sharing" browser button
		screenTrack.onended = () => {
			stopScreenShare();
		};

		toast.add({ title: 'Screen sharing started', color: 'green' });
	} catch (error) {
		if (error.name !== 'NotAllowedError') {
			console.error('Error starting screen share:', error);
			toast.add({ title: 'Failed to share screen', description: error.message, color: 'red' });
		}
	}
};

const stopScreenShare = () => {
	if (screenShareTrack.value) {
		// Unpublish from Twilio room
		if (twilioRoom.value) {
			twilioRoom.value.localParticipant.unpublishTrack(screenShareTrack.value);
		}
		screenShareTrack.value.stop();
		screenShareTrack.value = null;
	}
	isScreenSharing.value = false;
	toast.add({ title: 'Screen sharing stopped', color: 'gray' });
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

		// Track dominant speaker for speaker/sidebar views
		room.on('dominantSpeakerChanged', (participant) => {
			if (participant) {
				activeSpeaker.value = participant;
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

	// Set first remote participant as active speaker if none set
	if (!activeSpeaker.value) {
		activeSpeaker.value = participant;
	}

	participant.tracks.forEach((publication) => {
		if (publication.track) {
			handleTrackSubscribed(publication.track, participant);
		}
	});

	participant.on('trackSubscribed', (track) => {
		handleTrackSubscribed(track, participant);
	});

	participant.on('trackUnsubscribed', (track) => {
		handleTrackUnsubscribed(track, participant);
	});
};

const handleTrackSubscribed = (track, participant) => {
	// Detect screen share tracks from remote participants
	if (track.kind === 'video' && track.name === 'screen-share') {
		remoteScreenTrack.value = track;
		screenShareIdentity.value = participant.identity;

		track.on('disabled', () => {
			remoteScreenTrack.value = null;
			screenShareIdentity.value = null;
		});
	}
};

const handleTrackUnsubscribed = (track, participant) => {
	if (track.kind === 'video' && track.name === 'screen-share') {
		remoteScreenTrack.value = null;
		screenShareIdentity.value = null;
	}
};

const handleParticipantDisconnected = (participant) => {
	console.log('Participant disconnected:', participant.identity);
	remoteParticipants.value = remoteParticipants.value.filter((p) => p.sid !== participant.sid);

	// Clear screen share if the sharing participant left
	if (screenShareIdentity.value === participant.identity) {
		remoteScreenTrack.value = null;
		screenShareIdentity.value = null;
	}

	// Update active speaker if the disconnected one was active
	if (activeSpeaker.value?.sid === participant.sid) {
		activeSpeaker.value = remoteParticipants.value[0] || null;
	}
};

const attachParticipantTracks = (el, participant) => {
	if (!el || participant.isLocal) return;

	el.innerHTML = '';
	participant.tracks.forEach((publication) => {
		if (publication.track && publication.track.name !== 'screen-share') {
			el.appendChild(publication.track.attach());
		}
	});

	participant.on('trackSubscribed', (track) => {
		if (track.name !== 'screen-share') {
			el.appendChild(track.attach());
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

const leaveMeeting = async () => {
	// Stop screen share if active
	if (isScreenSharing.value) {
		stopScreenShare();
	}

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
	// Stop screen share
	if (screenShareTrack.value) {
		screenShareTrack.value.stop();
	}

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

.screen-share-container :deep(video) {
	width: 100%;
	height: 100%;
	object-fit: contain;
	background: #000;
}

/* Participants panel slide transition */
.slide-panel-enter-active,
.slide-panel-leave-active {
	transition: all 0.2s ease;
}

.slide-panel-enter-from,
.slide-panel-leave-to {
	transform: translateX(100%);
	opacity: 0;
}
</style>
