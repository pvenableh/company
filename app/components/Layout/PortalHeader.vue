<template>
	<header class="portal-header" :class="{ retracted: isRetracted }">
		<div class="filter-controls">
			<client-only>
				<LayoutPortalClientSelect v-if="user" :user="user" @open-org-switcher="handleOrgSwitcherClick" />
			</client-only>
		</div>

		<!-- Upsell modal for portal-only users -->
		<LayoutPortalUpsellModal
			v-if="user"
			v-model="showUpsell"
			:host-org-name="currentOrg?.name ?? null"
		/>

		<!-- Standard org switcher for dual-role portal users -->
		<LayoutOrgSwitcher v-if="user && !isPortalOnly" v-model="showOrgSwitcher" />

		<LayoutEarnestBrand to="/portal" tagline="Client Portal" :retracted="isRetracted" />

		<div class="account-controls">
			<template v-if="user">
				<nuxt-link to="/portal/account" class="flex items-center justify-self-center" aria-label="Account">
					<UserAvatar class="size-8 mr-2">
						<AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="user?.first_name" />
						<AvatarFallback>{{ initials }}</AvatarFallback>
					</UserAvatar>
				</nuxt-link>
				<LayoutNotificationsMenu class="mr-2" />
			</template>
		</div>
	</header>
</template>

<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const { user } = useDirectusAuth();
const config = useRuntimeConfig();
const { organizations, currentOrg } = useOrganization();
const { isPortalUserHere } = useClientPortalUser();

const isRetracted = ref(false);
const showOrgSwitcher = ref(false);
const showUpsell = ref(false);

const avatarUrl = computed(() => {
	if (!user.value?.avatar) return null;
	return `${config.public.assetsUrl}${user.value.avatar}?key=avatar`;
});

const initials = computed(() => {
	if (!user.value) return 'U';
	const first = user.value.first_name?.[0] ?? '';
	const last = user.value.last_name?.[0] ?? '';
	return (first + last).toUpperCase() || 'U';
});

// Portal-only = single org, portal user there, no junction membership anywhere.
// Dual-role users (client at A, owner at B) get the standard switcher instead.
const isPortalOnly = computed(() => {
	if (!isPortalUserHere.value) return false;
	if (organizations.value.length !== 1) return false;
	return organizations.value.every((org: any) => !org.membership);
});

function handleOrgSwitcherClick() {
	if (isPortalOnly.value) {
		showUpsell.value = true;
	} else {
		showOrgSwitcher.value = true;
	}
}

const manageNavBarAnimations = () => {
	isRetracted.value = window.scrollY > 10;
};

onMounted(() => {
	if (import.meta.client) {
		window.addEventListener('scroll', manageNavBarAnimations);
	}
});

onUnmounted(() => {
	if (import.meta.client) {
		window.removeEventListener('scroll', manageNavBarAnimations);
	}
});
</script>

<style>
@reference "~/assets/css/tailwind.css";

.portal-header {
	position: fixed;
	background: rgba(255, 255, 255, 0.72);
	backdrop-filter: saturate(180%) blur(20px);
	-webkit-backdrop-filter: saturate(180%) blur(20px);
	@apply w-full flex items-center justify-center z-40 border-b border-border/40 transition-all duration-300 ease-in-out py-4 left-1/2 -translate-x-1/2;
}
.portal-header .filter-controls {
	@apply absolute flex items-center justify-center flex-row left-[10px] sm:pr-1 md:px-6 transition-all duration-300 ease-in-out;
}
.portal-header .account-controls {
	@apply absolute flex items-center justify-center flex-row right-[10px] sm:pr-1 md:px-6 transition-all duration-300 ease-in-out;
}

:is(.dark) .portal-header {
	background: rgba(20, 20, 20, 0.72);
}

.portal-header.retracted {
	top: 8px;
	background: rgba(255, 255, 255, 0.82);
	@apply rounded-full w-11/12 md:w-5/6 lg:w-4/5 xl:w-3/5 py-3 md:py-2.5 border border-border/30 shadow-sm;
}
.portal-header.retracted .filter-controls {
	@apply left-[5px] md:px-0;
}
.portal-header.retracted .account-controls {
	@apply right-[5px] md:px-0;
}
:is(.dark) .portal-header.retracted {
	background: rgba(20, 20, 20, 0.82);
}

@media (min-width: 1024px) {
	.portal-header {
		padding-left: 200px;
	}
}
</style>
