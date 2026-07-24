<!--
  SchedulerTeammateBookingSheet — member-to-member booking entry point.

  Lists org teammates who have public booking enabled (from
  /api/scheduler/available-hosts) and hands off to each one's canonical booking
  page (/book/<org>/<slug>) in a new tab. Because the caller is a signed-in
  member, the slot engine also honours `internal`- and `client_portal`-audience
  event types for them.

  Uses the iOS-native bottom sheet so it matches the rest of the apps layout.
-->
<template>
	<AppsAppBottomSheet v-model="open" title="Book with a teammate" subtitle="Pick who you'd like to meet with">
		<div class="px-1 pb-2">
			<div v-if="loading" class="flex items-center justify-center py-12">
				<Icon name="lucide:loader-2" class="w-6 h-6 text-muted-foreground animate-spin" />
			</div>

			<div v-else-if="hosts.length === 0" class="text-center py-12">
				<Icon name="ph:calendar-plus-duotone" class="w-9 h-9 text-muted-foreground mx-auto mb-2" />
				<p class="text-sm font-medium">No teammates have booking open</p>
				<p class="text-xs text-muted-foreground mt-1">Ask them to enable their booking page in Scheduler settings.</p>
			</div>

			<div v-else class="space-y-2">
				<a
					v-for="h in hosts"
					:key="h.id"
					:href="bookingUrl(h)"
					target="_blank"
					rel="noopener"
					class="ios-card p-3.5 flex items-center gap-3 hover:bg-muted/30 transition-colors ios-press"
				>
					<EAvatar :src="userAvatar(h)" :alt="hostName(h)" size="sm" class="shrink-0" />
					<div class="min-w-0 flex-1">
						<p class="text-sm font-semibold truncate">{{ hostName(h) }}</p>
						<p v-if="h.booking_page_title" class="text-xs text-muted-foreground truncate">{{ h.booking_page_title }}</p>
						<p v-else-if="h.default_duration" class="text-xs text-muted-foreground">{{ h.default_duration }}-minute meetings</p>
					</div>
					<span class="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary shrink-0">
						Book
						<Icon name="lucide:arrow-up-right" class="w-3 h-3" />
					</span>
				</a>
			</div>
		</div>
	</AppsAppBottomSheet>
</template>

<script setup lang="ts">
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

const open = defineModel<boolean>({ required: true });

const { user } = useDirectusAuth();
const { selectedOrg } = useOrganization();

const hosts = ref<BookingHost[]>([]);
const loading = ref(false);
let loadedForOrg: string | null = null;

async function loadHosts() {
	const orgId = selectedOrg.value;
	if (!orgId) return;
	loading.value = true;
	try {
		const res = await $fetch('/api/scheduler/available-hosts', { query: { orgId } });
		// Drop myself — you don't book time with yourself.
		hosts.value = ((res as any)?.data || []).filter((h: BookingHost) => h.id !== user.value?.id);
		loadedForOrg = orgId;
	} catch {
		hosts.value = [];
	}
	loading.value = false;
}

// Lazy-load the first time the sheet opens (and re-load if the org changed).
watch(open, (isOpen) => {
	if (isOpen && (hosts.value.length === 0 || loadedForOrg !== selectedOrg.value)) {
		loadHosts();
	}
});

function hostName(h: BookingHost): string {
	return `${h.first_name || ''} ${h.last_name || ''}`.trim() || h.email || 'Teammate';
}

function bookingUrl(h: BookingHost): string {
	return `/book/${h.org_slug || '—'}/${h.booking_page_slug || h.id}`;
}
</script>
