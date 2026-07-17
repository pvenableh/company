<!-- components/Scheduler/BookingPageShell.vue -->
<!--
  Shared chrome for the public booking pages (/book/**). Owns the host header
  (avatar, name, job title, org, CardDesk card link + Save-contact vCard), a
  min-height content region so the "Powered by Earnest" footer doesn't jump
  between the loading and loaded states, and a fade/slide transition between
  them. The actual booking flow is passed as the default slot.
-->
<script setup>
import { userAvatar } from '~/utils/user-name';

const props = defineProps({
	data: { type: Object, default: null },
	loading: { type: Boolean, default: false },
});

const config = useRuntimeConfig();

const host = computed(() => props.data?.user || null);
const org = computed(() => props.data?.organization || null);

const hostName = computed(() =>
	host.value ? `${host.value.first_name || ''} ${host.value.last_name || ''}`.trim() : '',
);
// Display avatar always resolves (userAvatar falls back to a generated placeholder).
const avatarSrc = computed(() => (host.value ? userAvatar(host.value) : undefined));
// Only a REAL uploaded avatar is embedded in the vCard photo.
const realAvatar = computed(() => (host.value?.avatar ? userAvatar(host.value) : null));

const cardUrl = computed(() =>
	host.value?.id
		? `${config.public.cardDeskUrl || 'https://carddesk.earnest.guru'}/c/${host.value.id}`
		: null,
);

function esc(t) {
	return String(t).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
}

// Build + download a vCard 3.0 for the host so an invitee can save them to their
// phone/desktop contacts. Mirrors the download flow in Account/MyCardSheet.vue.
function saveContact() {
	if (!host.value || !import.meta.client) return;
	const lines = [
		'BEGIN:VCARD',
		'VERSION:3.0',
		`N:${esc(host.value.last_name || '')};${esc(host.value.first_name || '')};;;`,
		`FN:${esc(hostName.value)}`,
	];
	if (host.value.title) lines.push(`TITLE:${esc(host.value.title)}`);
	if (org.value?.name) lines.push(`ORG:${esc(org.value.name)}`);
	if (org.value?.website) lines.push(`URL:${org.value.website}`);
	if (cardUrl.value) lines.push(`URL:${cardUrl.value}`);
	if (realAvatar.value) lines.push(`PHOTO;VALUE=URI:${realAvatar.value}`);
	lines.push('END:VCARD');

	const blob = new Blob([lines.join('\r\n')], { type: 'text/vcard;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `${hostName.value || 'contact'}.vcf`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}
</script>

<template>
	<div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
		<!-- Host header -->
		<div class="bg-white dark:bg-gray-800 border-b border-border">
			<div class="max-w-3xl mx-auto px-4 py-6">
				<div class="flex items-start gap-4">
					<UAvatar :src="avatarSrc" :alt="hostName || 'Host'" size="lg" />
					<div class="min-w-0 flex-1">
						<template v-if="loading && !host">
							<div class="h-7 w-44 rounded bg-muted animate-pulse mb-2" />
							<div class="h-4 w-28 rounded bg-muted animate-pulse" />
						</template>
						<template v-else-if="host">
							<h1 class="text-2xl font-semibold tracking-tight truncate">{{ hostName }}</h1>
							<p v-if="host.title" class="text-sm font-medium text-muted-foreground truncate">{{ host.title }}</p>
							<p class="text-sm text-muted-foreground">
								{{ data?.settings?.booking_page_title || 'Schedule a meeting' }}
							</p>
							<p v-if="org?.name" class="text-xs text-muted-foreground mt-0.5">{{ org.name }}</p>
						</template>
					</div>

					<!-- CardDesk card + save-contact -->
					<div v-if="host && !loading" class="flex flex-col items-end gap-1.5 shrink-0">
						<a
							v-if="cardUrl"
							:href="cardUrl"
							target="_blank"
							rel="noopener"
							class="text-xs text-primary hover:underline flex items-center gap-1 whitespace-nowrap"
						>
							<UIcon name="i-heroicons-identification" class="w-3.5 h-3.5" /> View card
						</a>
						<button
							type="button"
							class="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 whitespace-nowrap"
							@click="saveContact"
						>
							<UIcon name="i-heroicons-user-plus" class="w-3.5 h-3.5" /> Save contact
						</button>
					</div>
				</div>
			</div>
		</div>

		<!-- Content — min-height keeps the footer from jumping on load -->
		<div class="flex-1 w-full max-w-3xl mx-auto px-4 py-8">
			<div class="min-h-[440px]">
				<Transition name="book-fade" mode="out-in">
					<div v-if="loading" key="loading" class="space-y-4 pt-2">
						<div class="h-16 rounded-2xl bg-muted animate-pulse" />
						<div class="h-6 w-36 rounded bg-muted animate-pulse" />
						<div class="flex flex-wrap gap-2">
							<div v-for="i in 4" :key="i" class="h-10 w-28 rounded-lg bg-muted animate-pulse" />
						</div>
						<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 pt-2">
							<div v-for="i in 12" :key="i" class="h-10 rounded-lg bg-muted animate-pulse" />
						</div>
					</div>
					<div v-else key="content">
						<slot />
					</div>
				</Transition>
			</div>
		</div>

		<!-- Footer -->
		<div class="text-center py-8 text-sm text-muted-foreground">
			<template v-if="org?.whitelabel">{{ org?.name }}</template>
			<template v-else>Powered by <a href="https://earnest.guru" class="hover:text-foreground">Earnest</a></template>
		</div>
	</div>
</template>

<style scoped>
.book-fade-enter-active,
.book-fade-leave-active {
	transition: opacity 0.2s ease, transform 0.2s ease;
}
.book-fade-enter-from {
	opacity: 0;
	transform: translateY(6px);
}
.book-fade-leave-to {
	opacity: 0;
	transform: translateY(-4px);
}
</style>
