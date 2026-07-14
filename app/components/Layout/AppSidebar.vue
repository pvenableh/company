<script setup lang="ts">
/**
 * AppSidebar — opt-in desktop navigation sidebar for the apps shell.
 *
 * A labeled, grouped, multi-level left navigation panel (the classic-sidebar
 * virtue, rebuilt on the current design system). It is NOT the AppRail dock:
 * when enabled on a large screen it REPLACES the bottom app dock and becomes
 * the single app-nav surface. The utility FloatingDock stays.
 *
 * Structure (single source of truth = `useAppNav`):
 *   - Brand header + collapse toggle.
 *   - Main apps as rows; an app with floors expands into a collapsible group
 *     of floor sub-links deep-linking to `<app.to>?<param>=<key>`.
 *   - Footer apps (Director / Organization / Account) pinned to the bottom.
 *
 * Active app + floor auto-expand and highlight. Collapse-to-icon-only is
 * cookie-persisted (`sidebarCollapsed`); collapsed rows show tooltips.
 *
 * Colours come from `useAppAccent` (same accents the rail uses) via per-row
 * CSS vars, so the sidebar re-skins with the palette. Icons render as a
 * saturated accent-hue glyph on a faint accent tint — palette-robust in both
 * light and dark, no vanishing-glyph risk from same-hue-on-same-hue chips.
 *
 * Visibility (show below xl / hide the dock) is owned by CSS media queries in
 * `layouts/apps.vue`, not JS, so there's no hydration flash — this component
 * only renders when the `desktopSidebar` preference is on.
 */
import { APP_FOOTER_ORDER, formatIconColor, type AppAccent, type AppId } from '~/composables/useAppAccent';
import { useAppNav, type AppNavItem } from '~/composables/useAppNav';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';

const { tap: hapticTap } = useHaptic();

const { apps, footer, activeAppId, activeFloorKey } = useAppNav();
const { accents } = useAppAccent();
const { sidebarCollapsed, setSidebarCollapsed } = useAppsMode();

const { countFor } = useUnreadByCategory();
// Channels unread is read-state driven (channel_members), not notification
// categories — refresh it here so the sidebar badge stays live while the
// AppRail (which normally owns this poll) is hidden.
const channelUnread = useChannelUnread();
let channelUnreadTimer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
	channelUnread.refresh();
	channelUnreadTimer = setInterval(() => channelUnread.refresh(), 45_000);
});
onBeforeUnmount(() => {
	if (channelUnreadTimer) clearInterval(channelUnreadTimer);
});

function badgeFor(app: AppNavItem): number {
	if (app.id === 'channels') return channelUnread.total.value;
	const cats = accents.value[app.id]?.notificationCategories;
	if (!cats?.length) return 0;
	return cats.reduce((sum, cat) => sum + countFor(cat), 0);
}
function badgeLabel(count: number) {
	return count > 99 ? '99+' : String(count);
}

// Per-row accent CSS vars — mirrors the rail's `styleFor` so the palette drives
// both surfaces identically.
function styleFor(app: AppNavItem) {
	const a: AppAccent | undefined = accents.value[app.id];
	if (!a) return {};
	return {
		'--row-h': String(a.h),
		'--row-s': `${a.s}%`,
		'--row-l': `${a.l}%`,
		'--row-icon': formatIconColor(a),
	};
}

// ── Collapsible groups ──────────────────────────────────────────────────────
// Expanded state per app id. The active app auto-expands; the user can toggle
// any other group open/closed. Collapsing the whole sidebar hides floors, so
// this only matters in the expanded layout.
const expanded = reactive<Record<string, boolean>>({});
watchEffect(() => {
	const id = activeAppId.value;
	if (id) expanded[id] = true;
});
function toggleGroup(id: AppId) {
	expanded[id] = !expanded[id];
}

function isActiveApp(app: AppNavItem) {
	return activeAppId.value === app.id;
}
function isActiveFloor(app: AppNavItem, key: string) {
	return activeAppId.value === app.id && activeFloorKey.value === key;
}

function floorLinkTo(app: AppNavItem, key: string) {
	return { path: app.to, query: { [app.floorParam]: key } };
}

function toggleCollapsed() {
	setSidebarCollapsed(!sidebarCollapsed.value);
}

// Director sits in the footer with a bespoke tile (chair glyph) in the rail;
// here it renders as an ordinary app row. Give it a sane accent fallback via
// its published `--app-director-*` vars.
const isDirector = (id: AppId) => id === 'director';
// Footer apps that carry a real accent (organization/account) vs Director.
const footerAccentApps = new Set<AppId>([...APP_FOOTER_ORDER]);
</script>

<template>
	<TooltipProvider :delay-duration="120">
		<aside
			class="app-sidebar"
			:class="{ 'app-sidebar--collapsed': sidebarCollapsed }"
			aria-label="Navigation"
		>
			<!-- Brand + collapse toggle -->
			<div class="app-sidebar__brand">
				<NuxtLink to="/" class="app-sidebar__brand-link" aria-label="Dashboard">
					<span class="app-sidebar__brand-mark">
						<EarnestIcon class="size-5" />
					</span>
					<span v-if="!sidebarCollapsed" class="app-sidebar__brand-name">Earnest</span>
				</NuxtLink>
				<Tooltip v-if="sidebarCollapsed">
					<TooltipTrigger as-child>
						<button
							type="button"
							class="app-sidebar__collapse"
							aria-label="Expand sidebar"
							@click="toggleCollapsed"
						>
							<Icon name="lucide:chevrons-right" class="size-4" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="right" :side-offset="8" class="z-[70]">Expand</TooltipContent>
				</Tooltip>
				<button
					v-else
					type="button"
					class="app-sidebar__collapse"
					aria-label="Collapse sidebar"
					@click="toggleCollapsed"
				>
					<Icon name="lucide:chevrons-left" class="size-4" />
				</button>
			</div>

			<!-- Scrollable nav body -->
			<nav class="app-sidebar__nav">
				<ul class="app-sidebar__group">
					<li v-for="app in apps" :key="app.id" class="app-sidebar__item">
						<!-- App row: link to the app landing; chevron toggles its floors. -->
						<div
							class="app-sidebar__row"
							:class="{ 'app-sidebar__row--active': isActiveApp(app) }"
							:style="styleFor(app)"
						>
							<Tooltip v-if="sidebarCollapsed">
								<TooltipTrigger as-child>
									<NuxtLink
										:to="app.to"
										class="app-sidebar__link"
										:aria-label="app.name"
										@click="!isActiveApp(app) && hapticTap()"
									>
										<span class="app-sidebar__chip">
											<Icon :name="app.icon" class="app-sidebar__icon" />
											<span
												v-if="badgeFor(app) > 0"
												class="app-sidebar__badge"
												:aria-label="`${badgeFor(app)} unread`"
											>{{ badgeLabel(badgeFor(app)) }}</span>
										</span>
									</NuxtLink>
								</TooltipTrigger>
								<TooltipContent side="right" :side-offset="8" class="z-[70]">{{ app.name }}</TooltipContent>
							</Tooltip>

							<template v-else>
								<NuxtLink
									:to="app.to"
									class="app-sidebar__link"
									:aria-label="app.name"
									@click="!isActiveApp(app) && hapticTap()"
								>
									<span class="app-sidebar__chip">
										<Icon :name="app.icon" class="app-sidebar__icon" />
										<span
											v-if="badgeFor(app) > 0"
											class="app-sidebar__badge"
											:aria-label="`${badgeFor(app)} unread`"
										>{{ badgeLabel(badgeFor(app)) }}</span>
									</span>
									<span class="app-sidebar__label">{{ app.name }}</span>
								</NuxtLink>
								<button
									v-if="app.floors.length"
									type="button"
									class="app-sidebar__chevron"
									:class="{ 'app-sidebar__chevron--open': expanded[app.id] }"
									:aria-expanded="!!expanded[app.id]"
									:aria-label="`${expanded[app.id] ? 'Collapse' : 'Expand'} ${app.name} sections`"
									@click="toggleGroup(app.id)"
								>
									<Icon name="lucide:chevron-right" class="size-3.5" />
								</button>
							</template>
						</div>

						<!-- Floor sub-links (expanded layout only) -->
						<ul
							v-if="!sidebarCollapsed && app.floors.length"
							v-show="expanded[app.id]"
							class="app-sidebar__floors"
						>
							<li v-for="fl in app.floors" :key="fl.key">
								<NuxtLink
									:to="floorLinkTo(app, fl.key)"
									class="app-sidebar__floor"
									:class="{ 'app-sidebar__floor--active': isActiveFloor(app, fl.key) }"
									@click="hapticTap()"
								>
									<EarnestIcon v-if="fl.icon === 'earnest'" class="app-sidebar__floor-icon" />
									<Icon v-else :name="fl.icon" class="app-sidebar__floor-icon" />
									<span class="app-sidebar__floor-label">{{ fl.label }}</span>
								</NuxtLink>
							</li>
						</ul>

						<!-- Floor icons (collapsed layout) — every nested section stays
						     reachable as a tooltip'd icon so the narrow rail remains a
						     full launcher, not just top-level apps. -->
						<ul
							v-if="sidebarCollapsed && app.floors.length"
							class="app-sidebar__floors-collapsed"
						>
							<li v-for="fl in app.floors" :key="fl.key">
								<Tooltip>
									<TooltipTrigger as-child>
										<NuxtLink
											:to="floorLinkTo(app, fl.key)"
											class="app-sidebar__floor-icon-link"
											:class="{ 'app-sidebar__floor-icon-link--active': isActiveFloor(app, fl.key) }"
											:aria-label="fl.label"
											@click="hapticTap()"
										>
											<EarnestIcon v-if="fl.icon === 'earnest'" class="size-4" />
											<Icon v-else :name="fl.icon" class="size-4" />
										</NuxtLink>
									</TooltipTrigger>
									<TooltipContent side="right" :side-offset="8" class="z-[70]">{{ fl.label }}</TooltipContent>
								</Tooltip>
							</li>
						</ul>
					</li>
				</ul>
			</nav>

			<!-- Footer apps pinned to the bottom -->
			<div class="app-sidebar__footer">
				<ul class="app-sidebar__group">
					<li v-for="app in footer" :key="app.id" class="app-sidebar__item">
						<div
							class="app-sidebar__row"
							:class="{ 'app-sidebar__row--active': isActiveApp(app) }"
							:style="footerAccentApps.has(app.id) ? styleFor(app) : undefined"
							:data-director="isDirector(app.id) ? '' : undefined"
						>
							<Tooltip v-if="sidebarCollapsed">
								<TooltipTrigger as-child>
									<NuxtLink :to="app.to" class="app-sidebar__link" :aria-label="app.name" @click="!isActiveApp(app) && hapticTap()">
										<span class="app-sidebar__chip">
											<Icon :name="app.icon" class="app-sidebar__icon" />
										</span>
									</NuxtLink>
								</TooltipTrigger>
								<TooltipContent side="right" :side-offset="8" class="z-[70]">{{ app.name }}</TooltipContent>
							</Tooltip>
							<NuxtLink
								v-else
								:to="app.to"
								class="app-sidebar__link"
								:aria-label="app.name"
								@click="!isActiveApp(app) && hapticTap()"
							>
								<span class="app-sidebar__chip">
									<Icon :name="app.icon" class="app-sidebar__icon" />
								</span>
								<span class="app-sidebar__label">{{ app.name }}</span>
							</NuxtLink>
						</div>
					</li>
				</ul>
			</div>
		</aside>
	</TooltipProvider>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.app-sidebar {
	@apply fixed top-0 left-0 z-40 flex flex-col
		border-r border-border/40 bg-background/95 select-none;
	width: var(--app-sidebar-w, 208px);
	height: 100vh;
	height: 100dvh;
	backdrop-filter: blur(18px) saturate(150%);
	-webkit-backdrop-filter: blur(18px) saturate(150%);
	transition: width 220ms cubic-bezier(0.36, 0.66, 0.04, 1);
}

.app-sidebar--collapsed {
	--app-sidebar-w: 72px;
}

/* ── Brand ───────────────────────────────────────────────────────── */
.app-sidebar__brand {
	@apply flex items-center gap-2 px-3 shrink-0 border-b border-border/40;
	min-height: 56px;
}
.app-sidebar--collapsed .app-sidebar__brand {
	@apply justify-center px-0;
}

.app-sidebar__brand-link {
	@apply flex items-center gap-2.5 flex-1 min-w-0 rounded-xl px-1.5 py-1
		no-underline transition-transform active:scale-95;
}
.app-sidebar--collapsed .app-sidebar__brand-link {
	@apply flex-none justify-center px-0;
}

.app-sidebar__brand-mark {
	@apply flex items-center justify-center size-8 rounded-full shrink-0
		bg-primary/10 text-primary;
}

.app-sidebar__brand-name {
	@apply text-sm font-semibold text-foreground truncate;
}

.app-sidebar__collapse {
	@apply flex items-center justify-center size-7 rounded-full shrink-0
		text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors;
}
/* Collapsed: stack the brand mark over the expand toggle so both stay reachable
 * in the narrow 72px rail. */
.app-sidebar--collapsed .app-sidebar__brand {
	@apply flex-col gap-1 py-2;
}

/* ── Nav body ────────────────────────────────────────────────────── */
.app-sidebar__nav {
	@apply flex-1 overflow-y-auto overflow-x-hidden px-2 py-3;
}

.app-sidebar__group {
	@apply flex flex-col gap-0.5 list-none m-0 p-0;
}

.app-sidebar__footer {
	@apply shrink-0 border-t border-border/40 px-2 py-2;
}

.app-sidebar__item {
	@apply flex flex-col;
}

/* ── App row ─────────────────────────────────────────────────────── */
.app-sidebar__row {
	@apply flex items-center gap-1 rounded-xl;
}
.app-sidebar--collapsed .app-sidebar__row {
	@apply justify-center;
}

.app-sidebar__link {
	@apply flex flex-1 min-w-0 items-center gap-2.5 rounded-xl px-1.5 py-1.5
		no-underline text-muted-foreground transition-colors
		hover:bg-muted/50 hover:text-foreground;
}
.app-sidebar--collapsed .app-sidebar__link {
	@apply flex-none justify-center px-0 py-1.5;
}

/* Accent-tinted glyph tile — saturated accent-hue icon on a faint accent
 * wash. Palette-robust: readable in light + dark without a full gradient
 * chip (so a same-hue glyph can never vanish into a same-hue background). */
.app-sidebar__chip {
	@apply relative flex items-center justify-center shrink-0 rounded-full;
	width: 30px;
	height: 30px;
	background: hsl(var(--row-h, 220) var(--row-s, 10%) var(--row-l, 50%) / 0.14);
	color: hsl(var(--row-h, 220) var(--row-s, 10%) 42%);
	transition: background 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
.dark .app-sidebar__chip {
	color: hsl(var(--row-h, 220) var(--row-s, 10%) 70%);
	background: hsl(var(--row-h, 220) var(--row-s, 10%) var(--row-l, 50%) / 0.20);
}

.app-sidebar__icon {
	@apply size-[18px];
}

.app-sidebar__label {
	@apply text-xs font-medium uppercase tracking-wide truncate;
}

/* Active app row — tile saturates, label lifts to full foreground, a thin
 * accent bar marks the row. */
.app-sidebar__row--active .app-sidebar__link {
	@apply text-foreground bg-muted/40;
}
.app-sidebar__row--active .app-sidebar__chip {
	background: hsl(var(--row-h, 220) var(--row-s, 10%) var(--row-l, 50%) / 0.28);
}
.dark .app-sidebar__row--active .app-sidebar__chip {
	background: hsl(var(--row-h, 220) var(--row-s, 10%) var(--row-l, 50%) / 0.34);
}
.app-sidebar__row--active .app-sidebar__label {
	@apply font-semibold;
}

/* Director footer tile has no per-app accent gradient — fall back to a
 * neutral muted tile so it reads consistently. */
.app-sidebar__row[data-director] .app-sidebar__chip {
	background: hsl(var(--muted) / 0.8);
	color: hsl(var(--muted-foreground));
}

/* ── Group chevron ───────────────────────────────────────────────── */
.app-sidebar__chevron {
	@apply flex items-center justify-center size-6 rounded-md shrink-0
		text-muted-foreground/60 hover:text-foreground hover:bg-muted/60
		transition-colors;
}
.app-sidebar__chevron :deep(svg) {
	transition: transform 200ms cubic-bezier(0.36, 0.66, 0.04, 1);
}
.app-sidebar__chevron--open :deep(svg) {
	transform: rotate(90deg);
}

/* ── Floor sub-links ─────────────────────────────────────────────── */
.app-sidebar__floors {
	@apply flex flex-col gap-0.5 list-none m-0 mt-0.5 pl-4 pr-0 pb-1;
	/* Guide rail down the indented column. */
	margin-left: 15px;
	border-left: 1px solid hsl(var(--border) / 0.5);
}

.app-sidebar__floor {
	@apply flex items-center gap-2 rounded-lg px-2 py-1.5 no-underline
		text-muted-foreground transition-colors
		hover:bg-muted/50 hover:text-foreground;
}

.app-sidebar__floor-icon {
	@apply size-4 shrink-0 opacity-80;
}

.app-sidebar__floor-label {
	@apply text-[13px] font-medium truncate;
}

.app-sidebar__floor--active {
	@apply text-foreground;
	background: hsl(var(--primary) / 0.1);
}
.app-sidebar__floor--active .app-sidebar__floor-icon {
	@apply opacity-100;
	color: hsl(var(--primary));
}
.app-sidebar__floor--active .app-sidebar__floor-label {
	@apply font-semibold;
	color: hsl(var(--primary));
}

/* ── Collapsed floor icons ───────────────────────────────────────── */
.app-sidebar__floors-collapsed {
	@apply flex flex-col items-center gap-0.5 list-none m-0 mt-0.5 mb-1 p-0;
}
.app-sidebar__floor-icon-link {
	@apply flex items-center justify-center size-8 rounded-full
		text-muted-foreground/70 transition-colors
		hover:bg-muted/50 hover:text-foreground;
}
.app-sidebar__floor-icon-link--active {
	color: hsl(var(--primary));
	background: hsl(var(--primary) / 0.12);
}

/* ── Badge ───────────────────────────────────────────────────────── */
.app-sidebar__badge {
	@apply absolute inline-flex items-center justify-center rounded-full
		font-bold tabular-nums text-primary-foreground bg-primary;
	top: -5px;
	right: -5px;
	min-width: 16px;
	height: 16px;
	padding: 0 4px;
	font-size: 9px;
	line-height: 1;
	box-shadow: 0 0 0 1.5px hsl(var(--background));
	pointer-events: none;
}

/* ── Collapsed layout tweaks ─────────────────────────────────────── */
.app-sidebar--collapsed .app-sidebar__label,
.app-sidebar--collapsed .app-sidebar__brand-name {
	@apply sr-only;
}

/* Large-screens only. The sidebar is the app-nav surface at xl (1280px+); below
 * that we always fall back to the bottom dock regardless of the preference.
 * This lives here (later than the base rule, same file) so it deterministically
 * wins over the base `display:flex` — no cross-component ordering risk. */
@media (max-width: 1279px) {
	.app-sidebar {
		display: none;
	}
}
</style>
