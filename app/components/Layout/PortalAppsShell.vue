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
			class="portal-shell portal-shell--floating-rail"
			:class="[
				`portal-shell--rail-${railPosition}`,
				previewClientName ? 'portal-shell--with-preview' : '',
			]"
			:style="accentStyle"
		>
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
						<div class="hidden sm:block">
							<WalkthroughHelpMenu />
						</div>
						<!-- Rail/appearance settings moved out of the header: they now
						     live behind the avatar menu's "Appearance" link
						     (→ /portal/account?section=appearance), where the same
						     LayoutAppRailSettingsPanel renders inline. -->
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
						'portal-shell__page--rail-left': railPosition === 'left',
						'portal-shell__page--rail-right': railPosition === 'right',
					}"
				>
					<slot />
				</main>
			</div>

			<!-- Rail always renders as a single floating pill — left/right
			     hug the side edges (vertical), top/bottom hug those edges
			     (horizontal). Position-driven styling lives on the rail itself. -->
			<PortalRail :key="`rail-${railPosition}`" class="portal-shell__rail" />
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

		<ClientOnly>
			<WalkthroughManager />
		</ClientOnly>
	</div>
</template>

<script setup lang="ts">
const { user } = useDirectusAuth();
const route = useRoute();
const router = useRouter();
const { railPosition } = useAppsMode();
const { accentStyle } = usePortalAccent();

const showUpsell = ref(false);

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

/* Mirror of `.apps-shell` — the rail floats as a glass pill on every
 * side regardless of railPosition, so the shell stays a simple column
 * and we only pad the scroll area on the rail's edge. */
.portal-shell {
	@apply h-screen min-h-screen w-full flex flex-col;
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
	position: relative;
	z-index: 1;
}

/* Page ambient gradient — mirror of `.apps-shell__main::before`. An
 * accent-tinted radial fade below the chrome that bridges the glass header
 * into the page body so the portal reads as one continuous material, not
 * two floating slabs. The `--app-accent-*` vars are bound on the shell
 * wrapper via :style="accentStyle" (usePortalAccent), so re-tinting is
 * automatic when the active app/section accent changes. Behind content
 * (z-0) and pointer-events:none. */
.portal-shell__main::before {
	content: '';
	position: fixed;
	top: 56px;
	left: 0;
	right: 0;
	height: 360px;
	pointer-events: none;
	z-index: 0;
	background:
		radial-gradient(
			ellipse 70% 100% at 50% -10%,
			hsl(var(--app-accent-h, 220) 65% 60% / 0.08) 0%,
			hsl(var(--app-accent-h, 220) 55% 55% / 0.04) 35%,
			transparent 70%
		),
		radial-gradient(
			ellipse 50% 80% at 90% 0%,
			hsl(calc(var(--app-accent-h, 220) + 30) 60% 55% / 0.05) 0%,
			transparent 60%
		);
	mask-image: linear-gradient(180deg, black 0%, black 60%, transparent 100%);
	-webkit-mask-image: linear-gradient(180deg, black 0%, black 60%, transparent 100%);
}
.dark .portal-shell__main::before {
	background:
		radial-gradient(
			ellipse 70% 100% at 50% -10%,
			hsl(var(--app-accent-h, 220) 65% 50% / 0.10) 0%,
			hsl(var(--app-accent-h, 220) 55% 45% / 0.05) 35%,
			transparent 70%
		),
		radial-gradient(
			ellipse 50% 80% at 90% 0%,
			hsl(calc(var(--app-accent-h, 220) + 30) 60% 50% / 0.07) 0%,
			transparent 60%
		);
}
/* When the preview banner nudges the shell down, drop the wash to match. */
.portal-shell--with-preview .portal-shell__main::before {
	top: 86px;
}
@media (prefers-reduced-transparency: reduce) {
	.portal-shell__main::before { display: none; }
}

/* The rail floats as a glass pill over the page regardless of side. Pad
 * the scroll area on the rail's edge so content never slides under it. */
.portal-shell__page--rail-top {
	@apply pt-16 sm:pt-20;
}

.portal-shell__page--rail-bottom {
	@apply pb-16 sm:pb-20;
}

.portal-shell__page--rail-left {
	@apply pl-16 sm:pl-20;
}

.portal-shell__page--rail-right {
	@apply pr-16 sm:pr-20;
}
</style>
