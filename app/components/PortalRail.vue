<script setup lang="ts">
/**
 * PortalRail — top-level navigation rail for the client portal.
 *
 * Mirrors `AppRail` exactly so the portal shell shares the same iOS
 * liquid-glass language as the main apps shell. Icons + colours come
 * from `usePortalAccent` (single source of truth). Active chip
 * is brighter + ringed; non-active items render with the per-app
 * gradient at standard intensity. Where labels are hidden (vertical +
 * floating + mobile bottom) a hover tooltip surfaces the section name.
 *
 * Visibility: items whose `availabilityKey` returns false from
 * `/api/portal/nav-availability` are hidden so clients without social
 * data, marketing data, etc. don't see dead rail entries.
 *
 * Position respects `useAppsMode().railPosition` — the portal reuses
 * the same per-user preference as the main app so the user's chosen
 * rail layout follows them between shells.
 */
import {
	PORTAL_ACCENTS,
	PORTAL_ORDER,
	PORTAL_FOOTER_ORDER,
	type PortalAppAccent,
} from '~/composables/usePortalAccent';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip';

const route = useRoute();
const { railPosition } = useAppsMode();
const { user } = useDirectusAuth();

// Availability: which portal sections have data for the active client.
// The endpoint returns `{ social: bool, marketing: bool, proposals: bool,
// contracts: bool }`. Defaults to "show everything" so the rail never
// flickers empty on first paint.
type AvailabilityKey = NonNullable<PortalAppAccent['availabilityKey']>;
const availability = ref<Partial<Record<AvailabilityKey, boolean>>>({
	social: true,
	marketing: true,
	proposals: true,
	contracts: true,
});

async function loadAvailability() {
	if (!user.value) return;
	try {
		availability.value = await $fetch('/api/portal/nav-availability');
	} catch {
		// Keep defaults — better to show optional items than confuse the user.
	}
}

onMounted(() => {
	if (import.meta.client) loadAvailability();
});
watch(() => user.value?.id, (id) => {
	if (id) loadAvailability();
});

function shouldShow(app: PortalAppAccent): boolean {
	if (!app.availabilityKey) return true;
	return availability.value[app.availabilityKey] !== false;
}

const apps = computed<PortalAppAccent[]>(() =>
	PORTAL_ORDER.map((id) => PORTAL_ACCENTS[id]).filter(shouldShow),
);
const footer = computed<PortalAppAccent[]>(() =>
	PORTAL_FOOTER_ORDER.map((id) => PORTAL_ACCENTS[id]).filter(shouldShow),
);

const activeId = computed(() => {
	const path = route.path;
	if (path === '/portal' || path === '/portal/') return 'dashboard';
	// Walk longest-prefix first so /portal/invoices/[id] resolves to invoices.
	const ordered: Array<[string, string]> = [
		['account', '/portal/account'],
		['proposals', '/portal/proposals'],
		['contracts', '/portal/contracts'],
		['invoices', '/portal/invoices'],
		['projects', '/portal/projects'],
		['tickets', '/portal/tickets'],
		['tasks', '/portal/tasks'],
		['social', '/portal/social'],
		['marketing', '/portal/marketing'],
		['messages', '/portal/messages'],
	];
	for (const [id, prefix] of ordered) {
		if (path === prefix || path.startsWith(`${prefix}/`)) return id;
	}
	return null;
});

const isHorizontal = computed(() =>
	railPosition.value === 'top'
	|| railPosition.value === 'bottom'
	|| railPosition.value === 'floating',
);

const showTooltip = computed(() =>
	railPosition.value === 'left'
	|| railPosition.value === 'right'
	|| railPosition.value === 'floating',
);

const tooltipSide = computed<'top' | 'bottom' | 'left' | 'right'>(() => {
	if (railPosition.value === 'left') return 'right';
	if (railPosition.value === 'right') return 'left';
	return 'top';
});

function styleFor(app: PortalAppAccent) {
	return {
		'--rail-h': String(app.h),
		'--rail-s': `${app.s}%`,
		'--rail-l': `${app.l}%`,
	};
}
</script>

<template>
	<TooltipProvider :delay-duration="120">
		<nav
			class="portal-rail"
			:class="[
				`portal-rail--${railPosition}`,
				isHorizontal ? 'portal-rail--horizontal' : 'portal-rail--vertical',
			]"
			aria-label="Portal sections"
		>
			<ul class="portal-rail__group portal-rail__group--main">
				<li v-for="app in apps" :key="app.id">
					<Tooltip>
						<TooltipTrigger as-child>
							<NuxtLink
								:to="app.to"
								class="portal-rail__item"
								:class="{ 'portal-rail__item--active': activeId === app.id }"
								:style="styleFor(app)"
								:aria-label="app.name"
							>
								<span class="portal-rail__chip">
									<span class="portal-rail__icon">
										<Icon :name="app.icon" class="portal-rail__icon-layer portal-rail__icon-base" />
										<span class="portal-rail__icon-layer portal-rail__icon-highlight-mask" aria-hidden="true">
											<Icon :name="app.icon" class="portal-rail__icon-highlight" />
										</span>
									</span>
								</span>
								<span class="portal-rail__label">{{ app.name }}</span>
							</NuxtLink>
						</TooltipTrigger>
						<TooltipContent v-if="showTooltip" :side="tooltipSide" :side-offset="8">
							{{ app.name }}
						</TooltipContent>
					</Tooltip>
				</li>
			</ul>

			<span class="portal-rail__divider" aria-hidden="true" />

			<ul class="portal-rail__group portal-rail__group--footer">
				<li v-for="app in footer" :key="app.id">
					<Tooltip>
						<TooltipTrigger as-child>
							<NuxtLink
								:to="app.to"
								class="portal-rail__item"
								:class="{ 'portal-rail__item--active': activeId === app.id }"
								:style="styleFor(app)"
								:aria-label="app.name"
							>
								<span class="portal-rail__chip">
									<span class="portal-rail__icon">
										<Icon :name="app.icon" class="portal-rail__icon-layer portal-rail__icon-base" />
										<span class="portal-rail__icon-layer portal-rail__icon-highlight-mask" aria-hidden="true">
											<Icon :name="app.icon" class="portal-rail__icon-highlight" />
										</span>
									</span>
								</span>
								<span class="portal-rail__label">{{ app.name }}</span>
							</NuxtLink>
						</TooltipTrigger>
						<TooltipContent v-if="showTooltip" :side="tooltipSide" :side-offset="8">
							{{ app.name }}
						</TooltipContent>
					</Tooltip>
				</li>
			</ul>
		</nav>
	</TooltipProvider>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

/* The portal rail intentionally mirrors AppRail's styling — same iOS
 * liquid-glass chip recipe, same active-state ring, same hover lift.
 * Keeping these in lockstep means the user moving between the main app
 * and the portal never experiences a visual stutter; the cosmetic
 * grammar is identical, only the route list differs. */

.portal-rail {
	@apply flex bg-background border-border/40 select-none;
	--rail-gap: 8px;
}

/* ── Layout ──────────────────────────────────────────────────────── */
.portal-rail--vertical {
	@apply flex-col w-[56px] shrink-0 py-2;
	row-gap: var(--rail-gap);
	justify-content: center;
}

.portal-rail--horizontal {
	@apply flex-row w-full px-3 py-1.5 overflow-x-auto justify-center items-center;
	column-gap: 14px;
}

.portal-rail--left { @apply border-r; }
.portal-rail--right { @apply border-l; }

.portal-rail--top,
.portal-rail--bottom,
.portal-rail--floating {
	@apply fixed left-1/2 -translate-x-1/2 z-40
		rounded-full border border-border/40 shadow-2xl
		bg-background/85 backdrop-blur-md
		w-auto;
}

.portal-rail--top {
	top: calc(56px + 0.75rem);
}

.portal-rail--bottom,
.portal-rail--floating {
	bottom: calc(0.75rem + env(safe-area-inset-bottom));
}

/* ── Groups ──────────────────────────────────────────────────────── */
.portal-rail__group {
	@apply flex list-none m-0 p-0;
}

.portal-rail--vertical .portal-rail__group {
	@apply flex-col items-stretch w-full;
	row-gap: 6px;
}

.portal-rail--horizontal .portal-rail__group {
	@apply flex-row items-center;
	column-gap: 4px;
}

.portal-rail--vertical .portal-rail__group--main,
.portal-rail--vertical .portal-rail__group--footer {
	@apply px-1;
}

.portal-rail__divider {
	@apply bg-border/40 self-center shrink-0;
}

.portal-rail--vertical .portal-rail__divider {
	@apply h-px w-6 my-1;
}

.portal-rail--horizontal .portal-rail__divider {
	@apply w-px h-6 mx-1;
}

.portal-rail--floating .portal-rail__divider {
	display: none;
}

/* ── Item ─────────────────────────────────────────────────────────── */
.portal-rail__item {
	@apply flex flex-col items-center justify-center
		rounded-lg
		text-muted-foreground
		transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]
		no-underline;
	padding: 2px;
}

.portal-rail--horizontal .portal-rail__item,
.portal-rail--floating .portal-rail__item {
	@apply flex-row gap-2;
	padding: 4px 10px;
}

/* ── Chip ────────────────────────────────────────────────────────── */
.portal-rail__chip {
	@apply flex items-center justify-center shrink-0
		rounded-md
		transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)];
	position: relative;
	width: 32px;
	height: 32px;
	background:
		linear-gradient(335deg, rgba(0, 0, 0, 0.32) 0%, rgba(0, 0, 0, 0.08) 60%),
		linear-gradient(
			155deg,
			hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.85),
			hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 10%) / 0.78) 55%,
			hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 22%) / 0.7)
		);
	backdrop-filter: blur(10px);
	-webkit-backdrop-filter: blur(10px);
	box-shadow:
		inset 0 -1.5px 2px hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 35%) / 0.45),
		inset 0 0.5px 0 hsl(0 0% 100% / 0.45),
		0 0 0 0.5px hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) + 12%) / 0.5) inset,
		0 2px 8px -2px hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.3);
}

.portal-rail__chip::after {
	content: '';
	position: absolute;
	inset: 0;
	border-radius: inherit;
	background: linear-gradient(
		335deg,
		hsl(0 0% 100% / 0) 50%,
		hsl(0 0% 100% / 0.18) 80%,
		hsl(0 0% 100% / 0.42) 100%
	);
	mix-blend-mode: plus-lighter;
	pointer-events: none;
}

.portal-rail--horizontal .portal-rail__chip,
.portal-rail--floating .portal-rail__chip {
	width: 26px;
	height: 26px;
}

/* ── Icon (stacked base + masked highlight) ─────────────────────── */
.portal-rail__icon {
	@apply relative inline-block;
	width: 18px;
	height: 18px;
	z-index: 2;
	transition: transform 0.2s ease;
}

.portal-rail--horizontal .portal-rail__icon,
.portal-rail--floating .portal-rail__icon {
	width: 17px;
	height: 17px;
}

.portal-rail__icon-layer {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	display: block;
	stroke-width: 1.75;
}

.portal-rail__icon-base {
	color: hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) + 32%));
	filter: drop-shadow(0 1.5px 2px hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 18%) / 0.6));
	z-index: 0;
}

.portal-rail__icon-highlight-mask {
	-webkit-mask-image: linear-gradient(180deg, black 0%, rgba(0, 0, 0, 0.5) 35%, transparent 70%);
	mask-image: linear-gradient(180deg, black 0%, rgba(0, 0, 0, 0.5) 35%, transparent 70%);
	pointer-events: none;
	z-index: 1;
}

.portal-rail__icon-highlight {
	display: block;
	width: 100%;
	height: 100%;
	color: hsl(0 0% 100% / 0.8);
}

/* ── Hover ───────────────────────────────────────────────────────── */
.portal-rail__item:hover .portal-rail__chip {
	transform: translateY(-1px);
	box-shadow:
		0 0 0 0.5px hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) + 14%) / 0.5) inset,
		0 1px 0 0 hsl(0 0% 100% / 0.65) inset,
		0 4px 12px -2px hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.3);
}

@media (hover: hover) {
	.portal-rail__item:not(.portal-rail__item--active):hover .portal-rail__chip {
		outline: 1.5px solid hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.55);
		outline-offset: 2px;
	}
}

.portal-rail__item:hover {
	@apply text-foreground;
}

/* ── Active state ────────────────────────────────────────────────── */
.portal-rail__item--active {
	@apply text-foreground;
}

.portal-rail__item--active .portal-rail__chip {
	background:
		linear-gradient(335deg, rgba(0, 0, 0, 0.36) 0%, rgba(0, 0, 0, 0.1) 60%),
		linear-gradient(
			155deg,
			hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) + 4%) / 0.95),
			hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 10%) / 0.88) 55%,
			hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 22%) / 0.82)
		);
	box-shadow:
		inset 0 -1.5px 2px hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 35%) / 0.5),
		inset 0 0.5px 0 hsl(0 0% 100% / 0.55),
		0 0 0 0.5px hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) + 12%) / 0.65) inset,
		0 4px 14px -2px hsl(var(--rail-h) var(--rail-s) var(--rail-l) / 0.45);
	outline: 1.5px solid hsl(var(--rail-h) var(--rail-s) var(--rail-l));
	outline-offset: 2px;
}

.portal-rail__item--active .portal-rail__chip::after {
	background: linear-gradient(
		335deg,
		hsl(0 0% 100% / 0) 45%,
		hsl(0 0% 100% / 0.22) 78%,
		hsl(0 0% 100% / 0.5) 100%
	);
}

.portal-rail__item--active .portal-rail__icon-base {
	color: hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) + 38%));
	filter: drop-shadow(0 1.5px 3px hsl(var(--rail-h) var(--rail-s) calc(var(--rail-l) - 20%) / 0.65));
}

.portal-rail__item--active .portal-rail__icon-highlight {
	color: hsl(0 0% 100% / 0.85);
}

/* ── Label ───────────────────────────────────────────────────────── */
.portal-rail--vertical .portal-rail__label,
.portal-rail--floating .portal-rail__label {
	@apply sr-only;
}

@media (max-width: 767px) {
	.portal-rail--horizontal .portal-rail__label {
		@apply sr-only;
	}
}

.portal-rail__label {
	font-size: 11px;
	font-weight: 500;
	letter-spacing: 0.02em;
	line-height: 1;
	color: hsl(var(--muted-foreground));
	transition: color 0.2s ease;
}

.portal-rail__item:hover .portal-rail__label {
	color: hsl(var(--foreground));
}

.portal-rail__item--active .portal-rail__label {
	color: hsl(var(--foreground));
	font-weight: 600;
}
</style>
