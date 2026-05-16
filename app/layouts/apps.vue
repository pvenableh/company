<template>
	<div class="relative bg-background text-foreground transition duration-150 ios-safe-area">
		<ClientOnly>
			<LayoutArchivedOrgBanner />
		</ClientOnly>

		<div
			class="apps-shell apps-shell--floating-rail"
			:class="`apps-shell--rail-${railPosition}`"
			:style="accentStyle"
		>
			<div class="apps-shell__main">
				<header class="apps-shell__chrome glass">
					<div class="apps-shell__chrome-left">
						<ClientOnly>
							<LayoutClientSelect v-if="user" :user="user" @open-org-switcher="showOrgSwitcher = true" />
						</ClientOnly>
					</div>
					<div class="apps-shell__chrome-center">
						<LayoutEarnestBrand to="/" tagline="Do good work." />
					</div>
					<div class="apps-shell__chrome-right">
						<button
							class="apps-shell__chrome-btn hidden sm:flex"
							aria-label="Search"
							@click="spotlightOpen = true"
						>
							<Icon name="lucide:search" class="size-4" />
						</button>
						<div class="hidden sm:block">
							<WalkthroughHelpMenu />
						</div>
						<ClientOnly>
							<LayoutAppRailPositionPicker class="hidden sm:flex" />
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
						<ClientOnly>
							<LayoutUserMenu v-if="user" class="shrink-0" />
						</ClientOnly>
					</div>
				</header>

				<main
					class="apps-shell__page"
					:class="{
						'apps-shell__page--rail-top': railPosition === 'top',
						'apps-shell__page--rail-bottom': railPosition === 'bottom',
						'apps-shell__page--rail-left': railPosition === 'left',
						'apps-shell__page--rail-right': railPosition === 'right',
					}"
				>
					<slot />
				</main>
			</div>

			<!-- Rail always renders as a single floating pill — left/right
			     hug the side edges (vertical), top/bottom hug those edges
			     (horizontal). Position-driven styling lives on the rail itself. -->
			<AppRail :key="`rail-${railPosition}`" class="apps-shell__rail" />
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

		<ClientOnly>
			<WalkthroughManager />
		</ClientOnly>

		<LayoutOrgSwitcher v-model="showOrgSwitcher" />
	</div>
</template>

<script setup lang="ts">
import { timeTrackerModalOpen } from '~/composables/useTimeTrackerModal';
import { tokenModalOpen } from '~/composables/useTokenModal';
import { aiTrayOpen, aiTrayInitialPrompt, openAITray, closeAITray } from '~/composables/useAITray';

const { user } = useDirectusAuth();
const { railPosition } = useAppsMode();
const { accentStyle } = useAppAccent();

const { isOnEntityPage, openSidebar: openEntitySidebar } = useEntityPageContext();

const handleOpenAI = () => {
	if (isOnEntityPage.value) {
		openEntitySidebar();
	} else {
		openAITray();
	}
};

const spotlightOpen = ref(false);
const showOrgSwitcher = ref(false);
const timeTrackerModalVisible = timeTrackerModalOpen;
const tokenModalVisible = tokenModalOpen;

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
	@apply h-screen min-h-screen w-full flex flex-col;
}

.apps-shell__main {
	@apply flex-1 flex flex-col min-w-0 min-h-0;
}

.apps-shell__chrome {
	@apply grid items-center border-b border-border/40 px-3 sm:px-4 lg:px-6 shrink-0 z-40;
	grid-template-columns: 1fr auto 1fr;
	min-height: 56px;
}

.apps-shell__chrome-left {
	@apply flex items-center gap-2 min-w-0 justify-self-start;
}

.apps-shell__chrome-center {
	@apply flex items-center justify-center;
}

.apps-shell__chrome-right {
	@apply flex items-center gap-1.5 justify-self-end;
}

.apps-shell__chrome-btn {
	@apply flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted/50 text-muted-foreground transition-colors;
}

.apps-shell__page {
	@apply flex-1 overflow-auto min-h-0;
}

/* The rail floats as a glass pill over the page regardless of side. Pad
 * the scroll area on the rail's edge so content never slides under it.
 * Top + bottom keep their original padding; left + right add horizontal
 * room for the vertical pill (chip width + breathing gap). */
.apps-shell__page--rail-top {
	@apply pt-16 sm:pt-20;
}

.apps-shell__page--rail-bottom {
	@apply pb-16 sm:pb-20;
}

.apps-shell__page--rail-left {
	@apply pl-16 sm:pl-20;
}

.apps-shell__page--rail-right {
	@apply pr-16 sm:pr-20;
}
</style>
