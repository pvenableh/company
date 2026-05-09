<template>
	<div class="relative bg-background text-foreground transition duration-150 ios-safe-area">
		<ClientOnly>
			<LayoutArchivedOrgBanner />
		</ClientOnly>

		<div
			class="apps-shell"
			:class="[
				`apps-shell--rail-${railPosition}`,
				railIsHorizontal ? 'apps-shell--horizontal' : 'apps-shell--vertical',
			]"
		>
			<AppRail v-if="railPosition !== 'floating'" class="apps-shell__rail" />

			<div class="apps-shell__main">
				<header class="apps-shell__chrome glass">
					<div class="apps-shell__chrome-left">
						<NuxtLink to="/" class="apps-shell__home">
							<LogoEarnest size="sm" />
						</NuxtLink>
					</div>
					<div class="apps-shell__chrome-right">
						<button
							class="apps-shell__chrome-btn hidden sm:flex"
							aria-label="Search"
							@click="spotlightOpen = true"
						>
							<Icon name="lucide:search" class="size-4" />
						</button>
						<ClientOnly>
							<LayoutInboxBell />
						</ClientOnly>
						<ClientOnly>
							<LayoutNotificationsMenu />
						</ClientOnly>
						<button
							class="apps-shell__chrome-btn"
							aria-label="AI assistant"
							@click="handleOpenAI"
						>
							<Icon name="lucide:sparkles" class="size-4" />
						</button>
						<NuxtLink v-if="user" to="/account" class="shrink-0">
							<Avatar class="size-7">
								<AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="userFirstName" />
								<AvatarFallback class="text-xs font-semibold">{{ initials }}</AvatarFallback>
							</Avatar>
						</NuxtLink>
					</div>
				</header>

				<main class="apps-shell__page">
					<slot />
				</main>
			</div>

			<AppRail v-if="railPosition === 'floating'" class="apps-shell__rail apps-shell__rail--floating" />
		</div>

		<!-- Slide-over teleport target — apps push content into here via <Teleport to="#app-slide-over-root"> -->
		<div id="app-slide-over-root" />

		<ClientOnly>
			<CommandCenterAITray :is-open="aiTrayOpen" :initial-prompt="aiTrayInitialPrompt" @close="closeAITray" />
		</ClientOnly>
		<ClientOnly>
			<TimeTrackerModal v-model="timeTrackerModalVisible" />
		</ClientOnly>
		<ClientOnly>
			<OrganizationTokenManagementModal v-model="tokenModalVisible" />
		</ClientOnly>
		<ClientOnly>
			<TimeTrackerFloatingIndicator class="md:hidden" />
		</ClientOnly>
		<ClientOnly>
			<LayoutFloatingDock @open-ai="handleOpenAI" />
		</ClientOnly>
		<ClientOnly>
			<LayoutSpotlightSearch :open="spotlightOpen" @close="spotlightOpen = false" />
		</ClientOnly>
	</div>
</template>

<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { timeTrackerModalOpen } from '~/composables/useTimeTrackerModal';
import { tokenModalOpen } from '~/composables/useTokenModal';
import { aiTrayOpen, aiTrayInitialPrompt, openAITray, closeAITray } from '~/composables/useAITray';

const { user } = useDirectusAuth();
const { railPosition } = useAppsMode();

const config = useRuntimeConfig();

const { isOnEntityPage, openSidebar: openEntitySidebar } = useEntityPageContext();

const handleOpenAI = () => {
	if (isOnEntityPage.value) {
		openEntitySidebar();
	} else {
		openAITray();
	}
};

const spotlightOpen = ref(false);
const timeTrackerModalVisible = timeTrackerModalOpen;
const tokenModalVisible = tokenModalOpen;

const railIsHorizontal = computed(() => railPosition.value === 'top' || railPosition.value === 'bottom');

const userFirstName = computed(() => {
	const u = user.value as Record<string, any> | null;
	return u?.first_name ?? 'User';
});

const avatarUrl = computed(() => {
	const u = user.value as Record<string, any> | null;
	if (!u?.avatar) return null;
	return `${config.public.assetsUrl}${u.avatar}?key=avatar`;
});

const initials = computed(() => {
	const u = user.value as Record<string, any> | null;
	if (!u) return 'U';
	const first = (u.first_name as string | undefined)?.[0] ?? '';
	const last = (u.last_name as string | undefined)?.[0] ?? '';
	return (first + last).toUpperCase() || 'U';
});

if (import.meta.client) {
	onMounted(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				spotlightOpen.value = !spotlightOpen.value;
			}
		};
		window.addEventListener('keydown', handler);
		onBeforeUnmount(() => window.removeEventListener('keydown', handler));
	});
}
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.apps-shell {
	@apply flex h-screen min-h-screen w-full;
}

.apps-shell--vertical {
	@apply flex-row;
}

.apps-shell--horizontal {
	@apply flex-col;
}

.apps-shell--rail-right {
	@apply flex-row-reverse;
}

.apps-shell--rail-bottom {
	@apply flex-col-reverse;
}

.apps-shell__main {
	@apply flex-1 flex flex-col min-w-0 min-h-0;
}

.apps-shell__chrome {
	@apply flex items-center justify-between border-b border-border/40 px-3 sm:px-4 lg:px-6 h-12 shrink-0 z-40;
}

.apps-shell__chrome-left {
	@apply flex items-center gap-2 min-w-0;
}

.apps-shell__chrome-right {
	@apply flex items-center gap-1.5;
}

.apps-shell__chrome-btn {
	@apply flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted/50 text-muted-foreground transition-colors;
}

.apps-shell__home {
	@apply flex items-center;
}

.apps-shell__page {
	@apply flex-1 overflow-auto min-h-0;
}
</style>
