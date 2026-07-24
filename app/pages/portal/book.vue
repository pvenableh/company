<script setup lang="ts">
/**
 * /portal/book — Client-portal booking, embedded.
 *
 * Two states, both inside the portal shell (no punch-out to the public /book
 * page):
 *   1. Host grid — the org members with booking enabled.
 *   2. Embedded booking — the same <SchedulerBookingFlow> the public page uses,
 *      driven in `embedded` mode so its picker/"Change" affordances emit instead
 *      of navigating. Booking data comes from the public-booking resolver (a
 *      public endpoint the signed-in client may call); because the caller has a
 *      session, the slot engine also unlocks `client_portal`-audience types.
 *
 * Internal-audience event types are hidden — those are team-only.
 */
definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Book a meeting | Client Portal' });

const { user } = useDirectusAuth();
const route = useRoute();
const router = useRouter();

interface BookingHost {
	id: string;
	first_name?: string | null;
	last_name?: string | null;
	email?: string | null;
	avatar?: string | null;
	default_duration?: number | null;
	booking_page_slug?: string | null;
	booking_page_title?: string | null;
	org_slug?: string | null;
}

// Forward ?previewAs so admin "preview as client" resolves on the first request
// (the portal_preview_as cookie is set async by the shell — relying on it alone
// races). requirePortalContext reads previewAs off the query too.
const { data, pending, error } = await useLazyFetch<{ success: boolean; data: BookingHost[]; org: { slug: string; name: string } | null }>(
	'/api/portal/booking-hosts',
	{ query: computed(() => (route.query.previewAs ? { previewAs: route.query.previewAs } : {})) },
);

const hosts = computed(() => (data.value?.data || []) as BookingHost[]);
const orgName = computed(() => data.value?.org?.name || null);

function hostName(h: BookingHost): string {
	return `${h.first_name || ''} ${h.last_name || ''}`.trim() || h.email || 'Team member';
}

// ── Embedded booking state ───────────────────────────────────────────────────
const selectedHost = ref<BookingHost | null>(null);
const bookingData = ref<any>(null);
const activeEventType = ref<any>(null);
const flowLoading = ref(false);
const flowError = ref('');

// Bookable types for a portal client: everything except team-only internal types.
const bookableEventTypes = computed(() =>
	((bookingData.value?.eventTypes || []) as any[]).filter((et) => et.audience !== 'internal'),
);

// Prefill the invitee with the signed-in client's details.
const initialInvitee = computed(() => ({
	name: `${(user.value as any)?.first_name || ''} ${(user.value as any)?.last_name || ''}`.trim()
		|| (user.value as any)?.name
		|| '',
	email: (user.value as any)?.email || '',
}));

function hostSlugOf(h: BookingHost): string {
	return h.booking_page_slug || h.id;
}

// Reflect the current host/type in the URL (edit #1). This is what survives the
// paid Stripe round-trip: BookingFlow (embedded) preserves the query when it
// builds the success URL, so we return to /portal/book?host=…&et=…&session_id=…
// and can restore the exact flow. Also gives back-button + refresh continuity.
function syncQuery() {
	const q: Record<string, any> = { ...route.query };
	delete q.host; delete q.et;
	if (selectedHost.value) q.host = hostSlugOf(selectedHost.value);
	if (activeEventType.value?.slug) q.et = activeEventType.value.slug;
	router.replace({ query: q });
}

// A type-select from BookingFlow (picker/"Change") updates state + URL.
function onSelectEventType(et: any) {
	activeEventType.value = et;
	if (selectedHost.value) syncQuery();
}

async function openHost(h: BookingHost, targetEtSlug?: string) {
	selectedHost.value = h;
	bookingData.value = null;
	activeEventType.value = null;
	flowError.value = '';
	flowLoading.value = true;
	syncQuery();
	try {
		const org = h.org_slug || '—';
		const slug = hostSlugOf(h);
		const res = await $fetch<any>(`/api/scheduler/public-booking/${org}/${slug}`);
		bookingData.value = res;
		const types = (res?.eventTypes || []).filter((et: any) => et.audience !== 'internal');
		// Restore an explicit type when returning from Stripe; otherwise go
		// straight in for a single type, or show the picker for several (ignore
		// the host's is_default — the client is choosing what THEY want to book).
		activeEventType.value = targetEtSlug
			? types.find((et: any) => et.slug === targetEtSlug) || (types.length === 1 ? types[0] : null)
			: types.length === 1 ? types[0] : null;
		syncQuery();
	} catch (e: any) {
		flowError.value = e?.data?.message || e?.message || 'Could not load this calendar.';
	}
	flowLoading.value = false;
}

function backToList() {
	selectedHost.value = null;
	bookingData.value = null;
	activeEventType.value = null;
	flowError.value = '';
	const q: Record<string, any> = { ...route.query };
	delete q.host; delete q.et; delete q.session_id; delete q.canceled;
	router.replace({ query: q });
}

// Restore on mount (edit #3). Runs once the lazy hosts list resolves. When we
// land back from Stripe (?session_id or ?canceled) with a ?host, re-open that
// host + type so BookingFlow re-mounts with the right event type — its own
// handleStripeReturn (onMounted) then finalizes via checkout-success and shows
// the inline "done" screen. We must NOT strip session_id here — BookingFlow
// clears it after finalizing.
let restored = false;
function restoreFromQuery() {
	if (restored) return;
	const hostSlug = typeof route.query.host === 'string' ? route.query.host : null;
	if (!hostSlug || !hosts.value.length) return;
	restored = true;
	const h = hosts.value.find((x) => hostSlugOf(x) === hostSlug);
	if (h) {
		const etSlug = typeof route.query.et === 'string' ? route.query.et : undefined;
		void openHost(h, etSlug);
	}
}
watch(hosts, restoreFromQuery, { immediate: true });
onMounted(restoreFromQuery);
</script>

<template>
	<div class="portal-page">
		<AppHeader>
			<template #default>Book a meeting</template>
		</AppHeader>

		<LayoutPageContainer>
			<!-- ── State 2: embedded booking flow ── -->
			<template v-if="selectedHost">
				<button
					type="button"
					class="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-4 ios-press"
					@click="backToList"
				>
					<Icon name="lucide:arrow-left" class="w-3.5 h-3.5" />
					All team members
				</button>

				<!-- Slim host header (BookingPageShell is full-screen chrome; the
				     portal already owns the outer frame, so we render our own). -->
				<div class="ios-card p-4 mb-5 flex items-center gap-3">
					<EAvatar :src="userAvatar(selectedHost)" :alt="hostName(selectedHost)" size="md" class="shrink-0" />
					<div class="min-w-0">
						<p class="text-sm font-semibold truncate">{{ hostName(selectedHost) }}</p>
						<p v-if="selectedHost.booking_page_title" class="text-xs text-muted-foreground truncate">{{ selectedHost.booking_page_title }}</p>
					</div>
				</div>

				<div v-if="flowLoading" class="flex items-center justify-center py-20">
					<Icon name="lucide:loader-2" class="w-7 h-7 text-muted-foreground animate-spin" />
				</div>

				<div v-else-if="flowError" class="ios-card p-8 text-center">
					<Icon name="lucide:calendar-x" class="w-8 h-8 text-muted-foreground mx-auto mb-2" />
					<p class="text-sm font-medium">{{ flowError }}</p>
				</div>

				<div v-else-if="bookingData && bookableEventTypes.length === 0" class="ios-card p-8 text-center">
					<Icon name="ph:calendar-plus-duotone" class="w-9 h-9 text-muted-foreground mx-auto mb-2" />
					<p class="text-sm font-medium">Nothing to book here yet</p>
					<p class="text-xs text-muted-foreground mt-1">{{ hostName(selectedHost) }} hasn't published a bookable meeting type.</p>
				</div>

				<SchedulerBookingFlow
					v-else-if="bookingData"
					:host-user="bookingData.user"
					:host-org="bookingData.organization"
					:settings="bookingData.settings"
					:availability="bookingData.availability || []"
					:existing-meetings="bookingData.meetings || []"
					:event-types="bookableEventTypes"
					:event-type="activeEventType"
					:embedded="true"
					:initial-invitee="initialInvitee"
					@select-event-type="onSelectEventType"
				/>
			</template>

			<!-- ── State 1: host grid ── -->
			<template v-else>
				<p class="text-sm text-muted-foreground mb-6 -mt-1">
					<template v-if="orgName">Pick who you'd like to meet with at {{ orgName }}.</template>
					<template v-else>Pick who you'd like to meet with.</template>
				</p>

				<div v-if="pending" class="flex items-center justify-center py-24">
					<Icon name="lucide:loader-2" class="w-8 h-8 text-muted-foreground animate-spin" />
				</div>

				<div v-else-if="error" class="ios-card p-8 text-center">
					<Icon name="lucide:calendar-x" class="w-8 h-8 text-muted-foreground mx-auto mb-2" />
					<p class="text-sm font-medium">Couldn't load the team's availability</p>
					<p class="text-xs text-muted-foreground mt-1">Please try again in a moment.</p>
				</div>

				<div v-else-if="hosts.length === 0" class="ios-card p-8 text-center">
					<Icon name="ph:calendar-plus-duotone" class="w-9 h-9 text-muted-foreground mx-auto mb-2" />
					<p class="text-sm font-medium">No one's booking calendar is open yet</p>
					<p class="text-xs text-muted-foreground mt-1">Reach out via Messages and we'll set something up.</p>
				</div>

				<div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<button
						v-for="h in hosts"
						:key="h.id"
						type="button"
						class="ios-card p-5 flex items-center gap-4 text-left hover:bg-muted/30 transition-colors ios-press"
						@click="openHost(h)"
					>
						<EAvatar :src="userAvatar(h)" :alt="hostName(h)" size="md" class="shrink-0" />
						<div class="min-w-0 flex-1">
							<p class="text-sm font-semibold truncate">{{ hostName(h) }}</p>
							<p v-if="h.booking_page_title" class="text-xs text-muted-foreground truncate">{{ h.booking_page_title }}</p>
							<p v-else-if="h.default_duration" class="text-xs text-muted-foreground">{{ h.default_duration }}-minute meetings</p>
						</div>
						<Icon name="lucide:chevron-right" class="w-4 h-4 text-muted-foreground shrink-0" />
					</button>
				</div>
			</template>
		</LayoutPageContainer>
	</div>
</template>
