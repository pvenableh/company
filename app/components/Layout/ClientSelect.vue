<script setup>
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

/**
 * Org switcher button (formerly the org + global-client picker). The global
 * client FILTER was removed from the app chrome — it was honored by only a
 * handful of widgets, so it read as a broken promise. Client-scoped work now
 * lives on the client detail page. This component is kept as the org-switcher
 * entry point in the shell chrome. See docs/dashboard-filters-localization-poc.md.
 */
const props = defineProps({
	user: {
		type: Object,
		default: null,
	},
});

const emit = defineEmits(['open-org-switcher']);

const { currentOrg, hasMultipleOrgs, organizations } = useOrganization();
// Hide for orgless users — the org switcher needs at least one membership.
const hasOrg = computed(() => organizations.value.length > 0);
const config = useRuntimeConfig();

const getIconUrl = (item) => {
	const icon = item?.logo || item?.icon;
	if (!icon) return undefined;
	const assetId = typeof icon === 'object' ? icon.id : icon;
	if (!assetId) return undefined;
	return `${config.public.directusUrl}/assets/${assetId}?key=avatar`;
};

const getInitials = (item) => {
	if (!item?.name) return '';
	return item.name
		.split(' ')
		.map((word) => word[0])
		.join('')
		.toUpperCase()
		.substring(0, 2);
};
</script>

<template>
	<div v-if="hasOrg" class="flex items-center gap-1.5">
		<!-- Org icon — always opens the org switcher modal. Single-org users
		     still get the modal so they can register/switch orgs from there. -->
		<button
			class="flex items-center rounded-full border-2 border-[var(--cyan)] p-0.5 shadow-inner overflow-hidden transition-opacity cursor-pointer hover:opacity-80"
			:title="hasMultipleOrgs ? 'Switch organization' : currentOrg?.name"
			@click="emit('open-org-switcher')"
		>
			<Avatar class="size-7">
				<AvatarImage v-if="getIconUrl(currentOrg)" :src="getIconUrl(currentOrg)" :alt="currentOrg?.name" />
				<AvatarFallback class="text-xs font-medium">
					{{ getInitials(currentOrg) }}
				</AvatarFallback>
			</Avatar>
		</button>
	</div>
</template>
