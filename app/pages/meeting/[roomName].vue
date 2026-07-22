<!-- pages/meeting/[roomName].vue -->
<!-- Daily.co prebuilt iframe integration -->
<template>
	<div class="min-h-screen t-bg t-text">
		<!-- Loading State -->
		<div v-if="loading" class="flex items-center justify-center min-h-screen">
			<div class="text-center">
				<div class="w-14 h-14 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-4">
					<UIcon name="i-heroicons-video-camera" class="w-7 h-7 text-success animate-pulse" />
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
				<div class="w-14 h-14 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-4">
					<UIcon name="i-heroicons-check-circle" class="w-7 h-7 text-success" />
				</div>
				<h1 class="text-lg font-semibold text-foreground">Meeting Ended</h1>
				<p class="text-sm text-muted-foreground mt-2">Thanks for joining!</p>
				<div class="mt-6 flex flex-col gap-2">
					<NuxtLink
						v-if="meeting?.id"
						:to="`/meetings/${meeting.id}`"
						class="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-success hover:bg-success text-white text-sm font-medium transition-colors ios-press"
					>
						<UIcon name="i-heroicons-document-text" class="w-4 h-4" />
						View Recap
					</NuxtLink>
					<NuxtLink
						to="/"
						class="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-muted/30 hover:bg-muted/60 text-sm font-medium text-foreground transition-colors ios-press"
					>
						Go Home
					</NuxtLink>
				</div>
			</div>
		</div>

		<!-- Guest Entry Form -->
		<div v-else-if="!hasJoined && !isHost" class="flex items-center justify-center min-h-screen p-4">
			<div class="ios-card p-6 w-full max-w-md">
				<!-- Meeting info header -->
				<div class="text-center mb-6 pb-5 border-b border-border/30">
					<div class="w-12 h-12 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-4">
						<UIcon name="i-heroicons-video-camera" class="w-6 h-6 text-success" />
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
						class="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-success hover:bg-success text-white font-medium text-sm transition-colors ios-press disabled:opacity-50"
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
				<div class="w-14 h-14 rounded-2xl bg-warning/10 flex items-center justify-center mx-auto mb-4">
					<UIcon name="i-heroicons-clock" class="w-7 h-7 text-warning animate-pulse" />
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
				<div class="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
					<UIcon name="i-heroicons-x-circle" class="w-7 h-7 text-destructive" />
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
					<div class="w-12 h-12 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-3">
						<UIcon name="i-heroicons-video-camera" class="w-6 h-6 text-success animate-pulse" />
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

			<!-- Annotation overlay covers the entire iframe so users can draw
			     directly on top of any screen-share or video tile. The canvas is
			     pointer-events:none until the user toggles annotate mode on, so
			     the toolbar is the only visible element. We render as soon as
			     `annotationAuthorId` is set (on mount) — drawing always works
			     locally; the bus silently no-ops broadcasting until Daily's
			     wrap'd iframe is joined. -->
			<MeetingAnnotationCanvas
				v-if="annotationAuthorId"
				ref="annotationCanvas"
				:bus="annotationBus"
				:author-id="annotationAuthorId"
				:is-primary="isHost"
				toolbar-position="bottom"
			/>

			<!-- Project-event back-link — moved to top-16 to clear Daily's top bar -->
			<NuxtLink
				v-if="linkedEvent"
				:to="`/projects/${linkedEvent.projectId}/events/${linkedEvent.id}`"
				target="_blank"
				class="fixed top-16 left-4 z-30 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-white text-[11px] font-medium transition-colors shadow-lg pointer-events-auto"
				title="Open milestone in a new tab"
			>
				<UIcon name="i-heroicons-flag" class="w-3.5 h-3.5" />
				<span class="opacity-70">{{ linkedEvent.projectTitle }}</span>
				<span class="opacity-40">/</span>
				<span>{{ linkedEvent.title }}</span>
				<UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3 h-3 opacity-60" />
			</NuxtLink>

			<!-- Top-right floating controls. Record + Transcribe are also owned
			     by Daily's native prebuilt toolbar, but we expose explicit pills
			     here so the host has a visible affordance regardless of which
			     prebuilt toolbar layout is active (Daily occasionally hides
			     these inside the "..." menu, especially on smaller windows).
			     Buttons are host-only and gate on `dailyJoined` so we don't
			     fire `startTranscription()` before Daily's internal state
			     machine is ready. -->
			<div v-if="hasJoined" class="fixed top-16 right-4 z-30 flex flex-wrap items-center justify-end gap-2 max-w-[calc(100vw-2rem)] pointer-events-auto">
				<button
					v-if="isHost && dailyJoined"
					:disabled="transcriptionBusy"
					:class="[
						'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md text-[11px] font-medium transition-colors shadow-lg disabled:opacity-50',
						transcribing ? 'bg-success/80 hover:bg-success text-white' : 'bg-black/60 hover:bg-black/80 text-white',
					]"
					:title="transcribing ? 'Stop live transcription' : 'Start live transcription (saves a transcript for the recap)'"
					@click="toggleTranscription"
				>
					<UIcon
						:name="transcriptionBusy ? 'i-heroicons-arrow-path' : (transcribing ? 'i-heroicons-microphone' : 'i-heroicons-microphone-solid')"
						:class="['w-3.5 h-3.5', transcriptionBusy ? 'animate-spin' : '']"
					/>
					<span>{{ transcribing ? 'Transcribing' : 'Transcribe' }}</span>
				</button>
				<button
					v-if="isHost && dailyJoined"
					:disabled="recordingBusy"
					:class="[
						'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md text-[11px] font-medium transition-colors shadow-lg disabled:opacity-50',
						recording ? 'bg-destructive/80 hover:bg-destructive text-white' : 'bg-black/60 hover:bg-black/80 text-white',
					]"
					:title="recording ? 'Stop recording' : 'Start cloud recording'"
					@click="toggleRecording"
				>
					<UIcon
						:name="recordingBusy ? 'i-heroicons-arrow-path' : (recording ? 'i-heroicons-stop' : 'i-heroicons-record')"
						:class="['w-3.5 h-3.5', recordingBusy ? 'animate-spin' : '']"
					/>
					<span>{{ recording ? 'Recording' : 'Record' }}</span>
				</button>
				<button
					v-if="isHost && hasJoined"
					:disabled="snapshotBusy"
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-white text-[11px] font-medium transition-colors shadow-lg disabled:opacity-50"
					title="Capture the screen share + annotations as a snapshot on this meeting"
					@click="captureSnapshot"
				>
					<UIcon
						:name="snapshotBusy ? 'i-heroicons-arrow-path' : 'i-heroicons-camera'"
						:class="['w-3.5 h-3.5', snapshotBusy ? 'animate-spin' : '']"
					/>
					<span>Snapshot</span>
				</button>
				<button
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-white text-[11px] font-medium transition-colors shadow-lg"
					title="Ask Earnest about this meeting"
					@click="openEarnestPanel()"
				>
					<EarnestIcon class="w-3.5 h-3.5" />
					<span>Ask Earnest</span>
				</button>
				<button
					v-if="isHost"
					:disabled="endingMeeting"
					class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/80 hover:bg-destructive backdrop-blur-md text-white text-[11px] font-medium transition-colors shadow-lg disabled:opacity-50"
					title="End the meeting for everyone, clear annotations, and generate the recap"
					@click="endMeeting"
				>
					<UIcon
						:name="endingMeeting ? 'i-heroicons-arrow-path' : 'i-heroicons-phone-x-mark'"
						:class="['w-3.5 h-3.5', endingMeeting ? 'animate-spin' : '']"
					/>
					<span>{{ endingMeeting ? 'Ending…' : 'End meeting' }}</span>
				</button>
			</div>
		</div>

		<!-- Floating dock + the unified Earnest panel. For a signed-in user the
		     panel is registered to this meeting entity (video_meeting) with the
		     live prompts, so it's the same Earnest as everywhere else, scoped to
		     this call. Anonymous guests get no assistant. -->
		<ClientOnly>
			<div class="meeting-dock-override">
				<LayoutFloatingDock />
			</div>
			<AIEarnestPanel v-if="currentUser" />
		</ClientOnly>
	</div>
</template>

<script setup>
definePageMeta({ layout: 'blank' });

const route = useRoute();
const toast = useToast();
const { awardEvent } = useArcadeAwards();
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
const dailyFrame = ref(null);
// Tracks whether the wrap'd Daily iframe has fired `joined-meeting`. Used
// only as a hint for `sendAppMessage` callers — the annotation toolbar is
// shown regardless, and the bus itself silently no-ops if the wrap object
// isn't ready yet.
const dailyJoined = ref(false);

// Live transcript buffer for THIS meeting. Daily fires
// `transcription-message` events in real time once host clicks Transcribe
// (or the token auto-starts it). We push each line into a shared store
// keyed by meeting id so the AI sidebar can ask "what's been said?" while
// the call is still happening — the persisted VTT only arrives via the
// `transcript.ready-to-download` webhook AFTER the meeting ends.
const { append: appendLiveTranscriptLine } = useLiveMeetingTranscript(() => meeting.value?.id);

let statusPollInterval = null;

// ── Host-only transcribe + record toggles ────────────────────────────────
// Daily's prebuilt has its own buttons, but they're sometimes hidden inside
// the "..." overflow on smaller windows. These pills always surface and call
// straight into the wrap'd call object so a failure (room not configured for
// transcription / Deepgram not provisioned at the domain level / etc) lands
// in a visible toast instead of a silent no-op.
const recording = ref(false);
const recordingBusy = ref(false);
const transcribing = ref(false);
const transcriptionBusy = ref(false);
const snapshotBusy = ref(false);

const toggleRecording = async () => {
	if (recordingBusy.value || !dailyCallObject || !dailyJoined.value) return;
	recordingBusy.value = true;
	try {
		if (recording.value) {
			await dailyCallObject.stopRecording();
			recording.value = false;
			toast.add({ title: 'Recording stopped', color: 'gray' });
		} else {
			await dailyCallObject.startRecording();
			recording.value = true;
			toast.add({ title: 'Recording started', color: 'green' });
		}
	} catch (err) {
		const msg = err?.errorMsg || err?.message || 'Recording failed';
		console.error('[meeting] recording toggle failed', err);
		toast.add({ title: 'Recording failed', description: msg, color: 'red' });
	} finally {
		recordingBusy.value = false;
	}
};

const toggleTranscription = async () => {
	if (transcriptionBusy.value || !dailyCallObject || !dailyJoined.value) return;
	transcriptionBusy.value = true;
	try {
		if (transcribing.value) {
			await dailyCallObject.stopTranscription();
			transcribing.value = false;
			toast.add({ title: 'Transcription stopped', color: 'gray' });
		} else {
			await dailyCallObject.startTranscription();
			transcribing.value = true;
			toast.add({
				title: 'Transcription started',
				description: 'The recap will use this transcript when the meeting ends.',
				color: 'green',
			});
		}
	} catch (err) {
		const msg = err?.errorMsg || err?.message || 'Transcription failed';
		console.error('[meeting] transcription toggle failed', err);
		toast.add({
			title: 'Transcription failed',
			description: `${msg}. If this persists, the Daily domain may not have Deepgram credentials configured.`,
			color: 'red',
		});
	} finally {
		transcriptionBusy.value = false;
	}
};

// ── Host-only snapshot ────────────────────────────────────────────────────
// Flattens the current screen-share (or active video) + the annotation marks
// into a single PNG and attaches it to the meeting. The annotation overlay is
// a DOM canvas on top of Daily's iframe, so it never lands in Daily's cloud
// recording — a composited snapshot is the only way to capture a marked-up
// frame as a durable artifact.
//
// Caveat: the marks are scaled to the full overlay area, so alignment is exact
// for a full-bleed screen share and approximate for tiled layouts (we can't
// read the prebuilt's on-screen tile rect across the cross-origin iframe).
const waitForVideoFrame = (video) =>
	new Promise((resolve) => {
		if (video.readyState >= 2 && video.videoWidth) return resolve();
		const done = () => { video.removeEventListener('loadeddata', done); resolve(); };
		video.addEventListener('loadeddata', done);
		setTimeout(done, 1500);
	});

const pickCaptureTrack = () => {
	const parts = dailyCallObject?.participants?.() || {};
	// Prefer an active screen share — that's the design-review case.
	for (const p of Object.values(parts)) {
		const sv = p?.tracks?.screenVideo;
		if (sv?.state === 'playable' && sv.persistentTrack) return sv.persistentTrack;
	}
	// Fall back to any playable camera track.
	for (const p of Object.values(parts)) {
		const v = p?.tracks?.video;
		if (v?.state === 'playable' && v.persistentTrack) return v.persistentTrack;
	}
	return null;
};

const captureSnapshot = async () => {
	if (snapshotBusy.value || !meeting.value?.id) return;
	snapshotBusy.value = true;
	let video = null;
	try {
		const annoEl = annotationCanvas.value?.getCanvasEl?.();
		const track = pickCaptureTrack();
		let canvas;

		if (track) {
			video = document.createElement('video');
			video.muted = true;
			video.playsInline = true;
			video.srcObject = new MediaStream([track]);
			try { await video.play(); } catch {}
			await waitForVideoFrame(video);
			const w = video.videoWidth || 1280;
			const h = video.videoHeight || 720;
			canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			const c = canvas.getContext('2d');
			c.drawImage(video, 0, 0, w, h);
			if (annoEl) c.drawImage(annoEl, 0, 0, w, h);
		} else if (annoEl) {
			// Marks-only fallback over a neutral background.
			canvas = document.createElement('canvas');
			canvas.width = annoEl.width;
			canvas.height = annoEl.height;
			const c = canvas.getContext('2d');
			c.fillStyle = '#111827';
			c.fillRect(0, 0, canvas.width, canvas.height);
			c.drawImage(annoEl, 0, 0);
			toast.add({
				title: 'No active video',
				description: 'Saved your annotations on their own.',
				color: 'gray',
			});
		} else {
			toast.add({ title: 'Nothing to capture', color: 'red' });
			return;
		}

		const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
		if (!blob) throw new Error('Could not render the snapshot');

		const fd = new FormData();
		fd.append('file', blob, `snapshot-${Date.now()}.png`);
		await $fetch(`/api/video/meetings/${meeting.value.id}/snapshots`, { method: 'POST', body: fd });
		toast.add({ title: 'Snapshot saved', description: 'Added to the meeting recap.', color: 'green' });
	} catch (err) {
		console.error('[meeting] snapshot failed', err);
		toast.add({
			title: 'Snapshot failed',
			description: err?.data?.message || err?.message || 'Could not capture a snapshot.',
			color: 'red',
		});
	} finally {
		if (video) video.srcObject = null;
		snapshotBusy.value = false;
	}
};

// Computed
const isHost = computed(() => {
	if (!meeting.value || !currentUser.value) return false;
	const hostId = typeof meeting.value.host_user === 'object'
		? meeting.value.host_user?.id
		: meeting.value.host_user;
	return hostId === currentUser.value.id;
});

// Adaptive Earnest-AI prompts for *during* the call. The recap surface has
// post-call counts (action items, decisions, transcript) — here we lean on
// the noun the meeting is anchored to (project / event / client) since the
// in-call story is unfolding live.
const livePrompts = computed(() => {
	const m = meeting.value;
	if (!m) return [];
	const out = [];

	const eventTitle = m.project_event?.title;
	const projectTitle = m.project?.title || m.project_event?.project?.title;
	const clientName = m.related_organization?.name;

	if (eventTitle) out.push(`What's left to ship for "${eventTitle}"?`);
	if (projectTitle) out.push(`Where are we on ${projectTitle}?`);
	if (clientName) out.push(`Open items I should raise with ${clientName}`);

	// Stable in-call fallbacks (always shown so the panel stays useful even
	// when the meeting isn't tied to a project/client).
	out.push('What have we discussed so far?');
	out.push('Capture the latest decision as a note');
	out.push('What should I cover before we wrap?');

	return out.slice(0, 6);
});

// Register this call as the unified Earnest panel's entity, so the one assistant
// is scoped to THIS meeting (video_meeting) with its live prompts. Because the
// entity type is video_meeting, useContextualChat automatically forwards the
// live transcript — so "what have we discussed so far?" still works mid-call,
// exactly as the old entity sidebar did.
const { setEntity: setEarnestEntity, clearEntity: clearEarnestEntity } = useEntityPageContext();
watch(
	[() => meeting.value?.id, () => currentUser.value?.id, livePrompts],
	([mid]) => {
		if (mid && currentUser.value) {
			setEarnestEntity('video_meeting', String(mid), meeting.value?.title || 'Meeting', { prompts: livePrompts.value, surface: 'live' });
		}
	},
	{ immediate: true },
);
onBeforeUnmount(() => clearEarnestEntity());

const linkedEvent = computed(() => {
	const pe = meeting.value?.project_event;
	if (!pe || typeof pe !== 'object') return null;
	const projectId = typeof pe.project === 'object' ? pe.project?.id : pe.project;
	if (!projectId) return null;
	return {
		id: pe.id,
		title: pe.title || 'Milestone',
		projectId,
		projectTitle: typeof pe.project === 'object' ? pe.project?.title || 'Project' : 'Project',
	};
});

// ─── Daily app-message bus + annotation sync ─────────────────────────────────
// We wrap the prebuilt iframe with @daily-co/daily-js so we can use the
// app-message API for broadcasting annotation strokes between participants.

let dailyCallObject = null;
let dailyJoinedPoll = null;
const mySessionId = ref(null);
const strokeSubscribers = new Set();
const clearSubscribers = new Set();
const clearMineSubscribers = new Set();
const undoSubscribers = new Set();
const syncRequestSubscribers = new Set();
const syncResponseSubscribers = new Set();
const annotationCanvas = ref(null);

// Stable per-tab id used to label annotation strokes. Daily's session_id from
// the prebuilt iframe doesn't always reach our wrap()'d object (the prebuilt
// owns the join), so we fall back to a UUID generated on mount.
const localAuthorId = ref('');
const annotationAuthorId = computed(() => mySessionId.value || localAuthorId.value);

const annotationBus = {
	onStroke(cb) {
		strokeSubscribers.add(cb);
		return () => strokeSubscribers.delete(cb);
	},
	onClear(cb) {
		clearSubscribers.add(cb);
		return () => clearSubscribers.delete(cb);
	},
	onClearMine(cb) {
		clearMineSubscribers.add(cb);
		return () => clearMineSubscribers.delete(cb);
	},
	onUndo(cb) {
		undoSubscribers.add(cb);
		return () => undoSubscribers.delete(cb);
	},
	onSyncRequest(cb) {
		syncRequestSubscribers.add(cb);
		return () => syncRequestSubscribers.delete(cb);
	},
	onSyncResponse(cb) {
		syncResponseSubscribers.add(cb);
		return () => syncResponseSubscribers.delete(cb);
	},
	sendStroke(segment) {
		if (!dailyCallObject || !segment) return;
		try {
			dailyCallObject.sendAppMessage({ type: 'annotation-stroke', segment }, '*');
		} catch {}
	},
	sendClear() {
		if (!dailyCallObject) return;
		try {
			dailyCallObject.sendAppMessage(
				{ type: 'annotation-clear', authorId: annotationAuthorId.value },
				'*',
			);
		} catch {}
	},
	sendClearMine(authorId) {
		if (!dailyCallObject) return;
		try {
			dailyCallObject.sendAppMessage({ type: 'annotation-clear-mine', authorId }, '*');
		} catch {}
	},
	sendUndo(strokeId) {
		if (!dailyCallObject || !strokeId) return;
		try {
			dailyCallObject.sendAppMessage({ type: 'annotation-undo', strokeId }, '*');
		} catch {}
	},
	sendSyncRequest() {
		if (!dailyCallObject) return;
		try {
			dailyCallObject.sendAppMessage(
				{ type: 'annotation-sync-request', requesterId: annotationAuthorId.value },
				'*',
			);
		} catch {}
	},
	sendSyncResponse(targetId, segments) {
		if (!dailyCallObject || !targetId || !segments?.length) return;
		try {
			// Targeted reply — only the late joiner receives the state dump.
			dailyCallObject.sendAppMessage({ type: 'annotation-sync-response', segments }, targetId);
		} catch {}
	},
};

// Daily prebuilt's chat panel broadcasts each message through `app-message`
// with a `{ event: 'chat-msg', message, name }` payload. We mirror it into
// meeting_chat_messages so the recap can replay it. Only one tab persists
// per message — the room sender — to avoid duplicates from every viewer.
const persistChatMessage = async (text, senderName, fromId) => {
	if (!meeting.value?.id) return;
	try {
		const res = await $fetch(`/api/video/meetings/${meeting.value.id}/chat-messages`, {
			method: 'POST',
			body: {
				message: text,
				senderName: senderName || null,
				senderSessionId: fromId || null,
				sentAt: new Date().toISOString(),
			},
		});
		console.log('[meeting] chat captured', { senderName, fromId, deduped: !!res?.deduped });
	} catch (err) {
		// Capture failures shouldn't disrupt the meeting — log loudly with
		// status code so it's obvious in DevTools when the route is 401/403/etc.
		console.warn(
			'[meeting] chat capture failed',
			err?.statusCode || err?.response?.status,
			err?.data?.message || err?.message || err,
		);
	}
};

const handleAppMessage = (e) => {
	const data = e?.data;
	if (!data || typeof data !== 'object') return;

	// One-line diagnostic so we can see in DevTools exactly what shapes
	// Daily's prebuilt is firing. Cheap (one console.log per message) and
	// invaluable for verifying chat-msg / annotation-* delivery without
	// having to rebuild.
	console.log('[meeting] app-message received', { fromId: e?.fromId, data });

	if (data.type === 'meeting-ended') {
		// The host ended the meeting — clear our marks and leave so we land on
		// the recap (logged-in) or the follow-up screen (guest).
		try { annotationCanvas.value?.clearAll?.(); } catch {}
		try { dailyCallObject?.leave?.(); } catch {}
		finishMeeting();
		return;
	}

	if (data.type === 'annotation-stroke') {
		if (!data.segment) return;
		for (const cb of strokeSubscribers) cb(data.segment);
		return;
	}

	if (data.type === 'annotation-clear') {
		for (const cb of clearSubscribers) cb();
		return;
	}

	if (data.type === 'annotation-clear-mine') {
		for (const cb of clearMineSubscribers) cb(data.authorId);
		return;
	}

	if (data.type === 'annotation-undo') {
		for (const cb of undoSubscribers) cb(data.strokeId);
		return;
	}

	if (data.type === 'annotation-sync-request') {
		for (const cb of syncRequestSubscribers) cb(data.requesterId);
		return;
	}

	if (data.type === 'annotation-sync-response') {
		if (Array.isArray(data.segments)) for (const cb of syncResponseSubscribers) cb(data.segments);
		return;
	}

	if (data.type === 'annotation-ping') {
		// Diagnostic ping — visible in DevTools so we can tell at a glance
		// whether app-message delivery is reaching remote participants.
		console.log('[meeting] annotation-ping received', { fromId: e?.fromId, at: data.at });
		return;
	}

	// Daily prebuilt chat (event names aren't documented in their public types
	// but have been stable: `chat-msg`). Branch defensively on shape.
	const isChat = data.event === 'chat-msg' || data.kind === 'chat-msg' || data.type === 'chat-msg';
	const text = data.message || data.msg || data.text;
	if (isChat && typeof text === 'string' && text.trim()) {
		// Every participant attempts to log the messages they receive. Daily's
		// `*` broadcast skips the sender, so the host never sees their own
		// chat — letting guests log too is what captures the host's outbound
		// messages. The server endpoint dedupes on
		// (meeting, sender_session_id, message, ±5s) so the N receivers each
		// POSTing the same line collapses into a single row.
		persistChatMessage(text.trim(), data.name || data.fromName || 'Participant', e?.fromId);
	}
};

const handleJoinedMeeting = (e) => {
	mySessionId.value = e?.participants?.local?.session_id || null;
	dailyJoined.value = true;
	// Send a one-shot diagnostic ping so we can verify app-message delivery
	// across participants (visible in receivers' console).
	try {
		dailyCallObject?.sendAppMessage(
			{ type: 'annotation-ping', at: Date.now() },
			'*',
		);
	} catch {}

	// Late-joiner sync: ask whoever's already here for the current annotation
	// state. Only the primary peer (host) answers, targeted back at us. Small
	// delay so remote wrap'd objects are listening before we fire.
	setTimeout(() => {
		try { annotationBus.sendSyncRequest(); } catch {}
	}, 1200);

	// Recording + transcription auto-start happens server-side via the meeting
	// token's `auto_start_recording` / `auto_start_transcription` properties
	// (see server/api/video/token.post.ts). Daily fires `recording-started`
	// and `transcription-started` shortly after join, which our wrap'd
	// listeners pick up to flip the pill state. The manual pills here still
	// work for toggling mid-call.
};

const handleLeftMeeting = () => {
	// Daily fires this when the local participant leaves (clicks Leave or
	// session ends). The postMessage path is unreliable on prebuilt — relying
	// on the wrap()'d event guarantees we tear down the iframe + canvas.
	finishMeeting();
};

const wrapDailyIframe = async () => {
	if (dailyCallObject) return;                        // already wrapped
	const el = dailyFrame.value;
	if (!el) return;

	try {
		const { default: DailyIframe } = await import('@daily-co/daily-js');
		dailyCallObject = DailyIframe.wrap(el);

		// Capture our own outbound chat. Daily's `sendAppMessage(data, '*')`
		// broadcasts to everyone *except* the sender, so the host's own chat
		// would never reach `app-message` on their tab. Wrap the method to
		// peek at outbound `chat-msg` payloads and push them into the same
		// persistChatMessage path the inbound branch uses.
		try {
			const originalSend = dailyCallObject.sendAppMessage?.bind(dailyCallObject);
			if (originalSend) {
				dailyCallObject.sendAppMessage = (data, to) => {
					try {
						const isChat = data?.event === 'chat-msg' || data?.kind === 'chat-msg' || data?.type === 'chat-msg';
						const text = data?.message || data?.msg || data?.text;
						if (isChat && typeof text === 'string' && text.trim()) {
							persistChatMessage(
								text.trim(),
								data?.name || data?.fromName || 'You',
								mySessionId.value || annotationAuthorId.value,
							);
						}
					} catch (err) { console.warn('[meeting] outbound chat hook failed', err); }
					return originalSend(data, to);
				};
			}
		} catch (err) {
			console.warn('[meeting] sendAppMessage wrap failed', err);
		}

		dailyCallObject.on('app-message', handleAppMessage);
		dailyCallObject.on('joined-meeting', handleJoinedMeeting);
		dailyCallObject.on('left-meeting', handleLeftMeeting);
		// Mirror native prebuilt toolbar / remote-host actions into our pills.
		dailyCallObject.on('recording-started', () => { recording.value = true; });
		dailyCallObject.on('recording-stopped', () => { recording.value = false; });
		dailyCallObject.on('transcription-started', () => { transcribing.value = true; });
		dailyCallObject.on('transcription-stopped', () => { transcribing.value = false; });
		dailyCallObject.on('transcription-error', (err) => {
			transcribing.value = false;
			console.error('[meeting] daily transcription-error', err);
			toast.add({
				title: 'Transcription error',
				description: err?.errorMsg || 'Daily reported a transcription error.',
				color: 'red',
			});
		});
		// Live transcript fan-out. Daily payload looks like
		// `{ text, participantId, user_id, user_name, is_final, timestamp }`.
		// We only buffer finalised cues so the AI sees coherent sentences
		// instead of interim word-by-word fragments.
		dailyCallObject.on('transcription-message', (msg) => {
			if (!msg || msg.is_final === false) return;
			const speaker = msg.user_name || msg.userName || msg.participantId || 'Speaker';
			const text = msg.text || '';
			if (!text.trim()) return;
			appendLiveTranscriptLine({ speaker, text });
		});
		console.log('[meeting] Daily wrap attached');
		// In case we wrapped after the join already fired
		const local = dailyCallObject.participants?.()?.local;
		if (local?.session_id) {
			mySessionId.value = local.session_id;
			dailyJoined.value = true;
		}

		// Belt-and-suspenders: the prebuilt iframe owns the join, so the wrap'd
		// object's `joined-meeting` event is not always delivered. Poll the
		// meeting state until it reports joined so the host controls (Transcribe
		// / Record / Snapshot / End) reliably appear instead of staying hidden
		// behind a `dailyJoined` flag that never flips.
		if (!dailyJoinedPoll) {
			dailyJoinedPoll = setInterval(() => {
				try {
					if (dailyCallObject?.meetingState?.() === 'joined-meeting') {
						dailyJoined.value = true;
						const l = dailyCallObject.participants?.()?.local;
						if (l?.session_id && !mySessionId.value) mySessionId.value = l.session_id;
					}
				} catch {}
				if (dailyJoined.value && dailyJoinedPoll) {
					clearInterval(dailyJoinedPoll);
					dailyJoinedPoll = null;
				}
			}, 800);
		}
	} catch (err) {
		console.warn('[meeting] Daily wrap failed', err);
	}
};

const router = useRouter();

const finishMeeting = () => {
	// Wipe the annotation canvas so strokes from this session never linger into
	// a re-join (the in-memory stroke maps would otherwise survive a remount
	// via the late-joiner sync from another still-connected participant).
	try { annotationCanvas.value?.clearAll?.(); } catch {}

	// Tear down the live iframe + annotation canvas immediately so they don't
	// linger on top of the dom while we transition.
	dailyUrl.value = null;
	hasJoined.value = false;
	meetingEnded.value = true;

	// Logged-in attendees get sent back into Earnest — the recap if we know the
	// meeting id, otherwise the scheduler. The small "Meeting Ended" card is
	// kept as the public-facing follow-up screen for unauthenticated guests.
	if (currentUser.value) {
		router.replace(meeting.value?.id ? `/meetings/${meeting.value.id}` : '/apps/work?floor=calendar');
	}
};

// Host-only: end the meeting for everyone. Clears all annotations, tells other
// participants to leave, marks the meeting completed server-side, then leaves
// the call (which fires `left-meeting` → finishMeeting → recap).
const endingMeeting = ref(false);
const endMeeting = async () => {
	if (endingMeeting.value || !meeting.value?.id) return;
	endingMeeting.value = true;
	try {
		// Wipe annotations for everyone still in the room.
		try { annotationBus.sendClear(); } catch {}
		try { annotationCanvas.value?.clearAll?.(); } catch {}
		// Ask remote participants' clients to leave + redirect.
		try { dailyCallObject?.sendAppMessage({ type: 'meeting-ended' }, '*'); } catch {}
		// Mark the meeting completed (status + actual_end).
		await $fetch(`/api/video/meetings/${meeting.value.id}/end`, { method: 'POST' });
		// Arcade reward — the meeting happened; the host who ends it earns the EP.
		awardEvent('meeting_held');
		// Leave the call — `left-meeting` fires finishMeeting() for the redirect.
		try { await dailyCallObject?.leave(); } catch {}
		finishMeeting();
	} catch (err) {
		toast.add({
			title: 'Could not end meeting',
			description: err?.data?.message || err?.message || 'Please try again.',
			color: 'red',
		});
	} finally {
		endingMeeting.value = false;
	}
};

// Wrap once the iframe element exists and dailyUrl is set.
watch([dailyFrame, dailyUrl], async ([el, url]) => {
	if (el && url && !dailyCallObject) {
		await nextTick();
		wrapDailyIframe();
	}
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

			// Retro-fit cloud recording on rooms created before it became default.
			// Fire-and-forget — failure shouldn't block the join.
			$fetch('/api/video/ensure-recording', {
				method: 'POST',
				body: { roomName: roomName.value },
			}).catch(() => {});

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

// Lifecycle
onMounted(() => {
	localAuthorId.value = `u-${(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))}`;
	fetchMeeting();
});

// Stamp the call start time on window so the dock notes panel can compute
// `meeting_offset_seconds` for transcript alignment.
watch(hasJoined, (joined) => {
	if (joined && import.meta.client) {
		window.__earnestMeetingStart = Date.now();
	}
});

onBeforeUnmount(() => {
	if (statusPollInterval) clearInterval(statusPollInterval);
	if (dailyJoinedPoll) { clearInterval(dailyJoinedPoll); dailyJoinedPoll = null; }
	if (import.meta.client) delete window.__earnestMeetingStart;
	if (dailyCallObject) {
		try { dailyCallObject.destroy(); } catch {}
		dailyCallObject = null;
	}
	strokeSubscribers.clear();
	clearSubscribers.clear();
});
</script>

<style scoped>
/* Make the floating dock opaque over the video iframe so it stays readable. */
.meeting-dock-override :deep(.dock-bar) {
	background: hsl(var(--background));
	backdrop-filter: none;
	-webkit-backdrop-filter: none;
	border-color: hsl(var(--border));
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1);
}
</style>
