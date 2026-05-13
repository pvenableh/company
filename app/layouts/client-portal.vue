<template>
	<div class="relative bg-background text-foreground ios-safe-area">
		<!-- Admin preview banner — when the route carries ?previewAs=<id>,
		     this layout was opened by an admin from the main app's client
		     switcher. Make the mode obvious so they don't think it's their
		     real account, and give them a one-click escape hatch. -->
		<div
			v-if="previewClientName"
			class="fixed top-0 inset-x-0 z-[60] bg-[var(--cyan)]/15 border-b border-[var(--cyan)]/40 text-[12px] py-1.5 px-3 flex items-center justify-center gap-3"
		>
			<Icon name="lucide:eye" class="w-3.5 h-3.5 text-[var(--cyan)]" />
			<span class="text-foreground/80">
				Previewing <strong class="text-foreground">{{ previewClientName }}</strong>'s portal — read-only.
			</span>
			<button
				class="text-[10px] uppercase tracking-wider font-bold text-[var(--cyan)] hover:underline"
				@click="exitPreview"
			>
				Exit preview
			</button>
		</div>

		<div
			class="portal-shell"
			:class="[
				`portal-shell--rail-${railPosition}`,
				railIsHorizontal ? 'portal-shell--horizontal' : 'portal-shell--vertical',
				previewClientName ? 'portal-shell--with-preview' : '',
			]"
			:style="accentStyle"
		>
			<PortalRail
				v-if="railPosition === 'left' || railPosition === 'right'"
				key="rail-vertical"
				class="portal-shell__rail"
			/>

			<div class="portal-shell__main">
				<header class="portal-shell__chrome glass">
					<div class="portal-shell__chrome-left">
						<ClientOnly>
							<LayoutPortalClientSelect v-if="user" :user="user" @open-org-switcher="showUpsell = true" />
						</ClientOnly>
					</div>
					<div class="portal-shell__chrome-center">
						<LayoutEarnestBrand to="/portal" tagline="Client Portal" />
					</div>
					<div class="portal-shell__chrome-right">
						<ClientOnly>
							<LayoutAppRailPositionPicker class="hidden lg:flex" />
						</ClientOnly>
						<ClientOnly>
							<LayoutNotificationsMenu />
						</ClientOnly>
						<ClientOnly>
							<LayoutPortalUserMenu v-if="user" class="shrink-0" />
						</ClientOnly>
					</div>
				</header>

				<main
					class="portal-shell__page"
					:class="{
						'portal-shell__page--rail-top': railPosition === 'top',
						'portal-shell__page--rail-bottom': railPosition === 'bottom',
						'portal-shell__page--rail-floating': railPosition === 'floating',
					}"
				>
					<slot />
				</main>
			</div>

			<PortalRail
				v-if="railPosition === 'top' || railPosition === 'bottom' || railPosition === 'floating'"
				:key="`rail-${railPosition}`"
				class="portal-shell__rail"
			/>
		</div>

		<!-- Slide-over teleport target — portal pages push content into here
		     via AppSlideOver / <Teleport to="#app-slide-over-root">. Mirrors the
		     same hook used by the apps shell so the same component works in
		     either context. -->
		<div id="app-slide-over-root" />

		<!-- Org switcher modal — same modal the previous portal header used.
		     Lists the user's orgs (portal + own) with the active one highlighted
		     and an upsell when the user has no workspace of their own. -->
		<LayoutPortalUpsellModal v-if="user" v-model="showUpsell" />
	</div>
</template>

<script setup lang="ts">
const { user } = useDirectusAuth();
const route = useRoute();
const router = useRouter();
const { railPosition } = useAppsMode();
const { accentStyle } = usePortalAccent();

const showUpsell = ref(false);

const railIsHorizontal = computed(() =>
	railPosition.value === 'top' || railPosition.value === 'bottom',
);

// ── Admin preview mode ────────────────────────────────────────────────
// When an admin clicks "Preview <client> portal" from the main app's
// client switcher, the route carries ?previewAs=<id> and a cookie is
// set. The portal API routes pick up the cookie; the layout just labels
// the mode and offers an exit.
const previewClientId = computed(() => {
	const q = route.query?.previewAs;
	return typeof q === 'string' && q ? q : null;
});

const previewClientName = ref<string | null>(null);

async function loadPreviewClientName() {
	if (!previewClientId.value) {
		previewClientName.value = null;
		return;
	}
	try {
		const scope = await $fetch<{ root: { id: string; name: string } | null }>(
			`/api/portal/scope?previewAs=${encodeURIComponent(previewClientId.value)}`,
		);
		previewClientName.value = scope?.root?.name ?? null;
	} catch {
		previewClientName.value = null;
	}
}

watch(previewClientId, loadPreviewClientName, { immediate: true });

function exitPreview() {
	if (import.meta.client) {
		document.cookie = 'portal_preview_as=; path=/; max-age=0; samesite=lax';
	}
	router.push('/clients');
}
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

/* Mirror of `.apps-shell` — same flexbox layout flips so the user's
 * chosen rail position (left/right/top/bottom/floating) behaves
 * identically in the portal as it does in the main app shell. */
.portal-shell {
	@apply flex h-screen min-h-screen w-full;
}

.portal-shell--vertical {
	@apply flex-row;
}

.portal-shell--horizontal {
	@apply flex-col;
}

.portal-shell--rail-right {
	@apply flex-row-reverse;
}

.portal-shell--rail-bottom {
	@apply flex-col-reverse;
}

/* When the admin-preview banner is showing, nudge the shell down so the
 * fixed banner doesn't overlap the chrome row. */
.portal-shell--with-preview {
	padding-top: 30px;
	height: calc(100vh - 30px);
	min-height: calc(100vh - 30px);
}

.portal-shell__main {
	@apply flex-1 flex flex-col min-w-0 min-h-0;
}

/* Inherits .glass from the template (saturate/blur backdrop), so we
 * intentionally avoid setting bg-background here — it would mask the
 * glass effect. */
.portal-shell__chrome {
	@apply grid items-center border-b border-border/40 px-3 sm:px-4 lg:px-6 shrink-0 z-40;
	grid-template-columns: 1fr auto 1fr;
	min-height: 56px;
}

.portal-shell__chrome-left {
	@apply flex items-center gap-2 min-w-0 justify-self-start;
}

.portal-shell__chrome-center {
	@apply flex items-center justify-center;
}

.portal-shell__chrome-right {
	@apply flex items-center gap-1.5 justify-self-end;
}

.portal-shell__avatar {
	@apply flex items-center justify-center rounded-full hover:opacity-80 transition-opacity;
}

.portal-shell__page {
	@apply flex-1 overflow-auto min-h-0;
}

/* Top + bottom rails float as glass pills over the page; pad the scroll
 * area so its content never slides under them. Floating uses the same
 * bottom padding as bottom so popovers/CTAs aren't hidden. */
.portal-shell__page--rail-top {
	@apply pt-16 sm:pt-20;
}

.portal-shell__page--rail-bottom,
.portal-shell__page--rail-floating {
	@apply pb-16 sm:pb-20;
}
</style>
