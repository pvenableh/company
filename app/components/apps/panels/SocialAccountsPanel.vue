<!--
	SocialAccountsPanel — slide-over wrapper around `SocialSettingsSurface`.

	Lives at depth 1 in the universal slide-over stack. Replaces five
	per-platform Manage CTAs on `/apps/organization?floor=settings` that
	used to push `/social/settings`. The `id` prop carries the platform
	key the user clicked Manage on (`instagram` | `facebook` | `linkedin`
	| `linkedin-org` | `tiktok` | `threads` | `_`); when set to a known
	platform we scroll its card into view on mount.
-->
<script setup lang="ts">
import AppSlideOverShell from '../AppSlideOverShell.vue';

const props = defineProps<{ id: string }>();
defineEmits<{ (e: 'close'): void }>();

const VALID_PLATFORMS = ['instagram', 'facebook', 'linkedin', 'linkedin-org', 'tiktok', 'threads'];
const platformLabels: Record<string, string> = {
	instagram: 'Instagram',
	facebook: 'Facebook',
	linkedin: 'LinkedIn',
	'linkedin-org': 'LinkedIn Company Pages',
	tiktok: 'TikTok',
	threads: 'Threads',
};

const subtitle = computed(() =>
	VALID_PLATFORMS.includes(props.id) ? `Managing ${platformLabels[props.id]}` : 'Manage your connected accounts',
);

const bodyRef = ref<HTMLElement | null>(null);

function scrollToPlatform(platform: string) {
	if (!bodyRef.value || !VALID_PLATFORMS.includes(platform)) return;
	const target = bodyRef.value.querySelector<HTMLElement>(`[data-platform="${platform}"]`);
	if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

onMounted(() => {
	// Wait one tick for SettingsSurface's async account fetch to mount the
	// UCard wrappers before scrolling.
	setTimeout(() => scrollToPlatform(props.id), 32);
});

watch(() => props.id, (next) => scrollToPlatform(next));
</script>

<template>
	<AppSlideOverShell
		title="Social Accounts"
		:subtitle="subtitle"
		@close="$emit('close')"
	>
		<div ref="bodyRef">
			<SocialSettingsSurface />
		</div>
	</AppSlideOverShell>
</template>
