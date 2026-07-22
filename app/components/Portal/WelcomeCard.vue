<script setup lang="ts">
/**
 * PortalWelcomeCard — the branded first-login welcome for client portal users.
 *
 * The portal previously dropped a new client straight onto a data dashboard
 * with no orientation. This card greets them into the AGENCY's portal (org
 * name + brand color), says what the space is for, and offers a few first
 * destinations plus the existing `portal-welcome` guided tour.
 *
 * Shown once per client per org: dismissal is persisted in localStorage keyed
 * by user + org, so it doesn't nag on every visit but does reappear if the
 * same person is later given portal access to a different agency.
 */
const { user } = useDirectusAuth();
const { selectedOrg } = useOrganization();
const { orgName, brandStyle } = useOrgBrand();
const { clientName } = useClientPortalUser();
const { startTour } = useWalkthrough();

const firstName = computed(() => (user.value as any)?.first_name || '');

// First destinations — the four portal apps a client most likely wants first.
const links = [
	{ to: '/portal/progress', icon: 'lucide:folder-kanban', label: 'Track progress', hint: 'Projects & tasks' },
	{ to: '/portal/billing', icon: 'lucide:receipt', label: 'Billing', hint: 'Invoices & contracts' },
	{ to: '/portal/messages', icon: 'lucide:messages-square', label: 'Messages', hint: 'Talk to the team' },
	{ to: '/portal/book', icon: 'lucide:calendar', label: 'Book a call', hint: 'Grab a time' },
];

// ── Dismissal (per user + org) ──────────────────────────────────────────────
function storageKey(): string | null {
	const uid = (user.value as any)?.id;
	const oid = selectedOrg.value;
	if (!uid || !oid) return null;
	return `earnest:portal-welcome-dismissed:${uid}:${oid}`;
}

const dismissedTick = ref(0);
const visible = computed(() => {
	void dismissedTick.value; // re-evaluate after dismiss()
	if (!import.meta.client) return false;
	if (!user.value || !selectedOrg.value) return false;
	const key = storageKey();
	if (!key) return false;
	try {
		return localStorage.getItem(key) !== '1';
	} catch {
		return true;
	}
});

function dismiss() {
	const key = storageKey();
	if (key) {
		try {
			localStorage.setItem(key, '1');
		} catch {
			/* ignore — worst case it shows again next load */
		}
	}
	dismissedTick.value += 1;
}

function takeTour() {
	startTour('portal-welcome');
}
</script>

<template>
	<div v-if="visible" class="ios-card welcome-card" :style="brandStyle">
		<button
			type="button"
			class="welcome-dismiss"
			aria-label="Dismiss welcome"
			@click="dismiss"
		>
			<Icon name="lucide:x" class="w-4 h-4" />
		</button>

		<div class="welcome-body">
			<div class="welcome-badge">
				<Icon name="lucide:sparkles" class="w-5 h-5" />
			</div>

			<h2 class="welcome-title">
				Welcome{{ firstName ? `, ${firstName}` : '' }} to {{ orgName }}
			</h2>
			<p class="welcome-sub">
				This is your shared space{{ clientName ? ` for ${clientName}` : '' }} — track work in progress,
				review invoices and contracts, and message the team, all in one place.
			</p>

			<div class="welcome-links">
				<NuxtLink v-for="link in links" :key="link.to" :to="link.to" class="welcome-link">
					<span class="welcome-link__icon">
						<Icon :name="link.icon" class="w-4 h-4" />
					</span>
					<span class="min-w-0">
						<span class="welcome-link__label">{{ link.label }}</span>
						<span class="welcome-link__hint">{{ link.hint }}</span>
					</span>
				</NuxtLink>
			</div>

			<div class="welcome-actions">
				<button type="button" class="welcome-tour" @click="takeTour">
					<Icon name="lucide:compass" class="w-4 h-4" />
					Take a quick tour
				</button>
				<button type="button" class="welcome-skip" @click="dismiss">
					I'll explore on my own
				</button>
			</div>
		</div>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.welcome-card {
	position: relative;
	overflow: hidden;
	padding: 24px;
	margin-bottom: 24px;
	/* Soft brand wash behind the greeting. */
	background-image: radial-gradient(120% 80% at 0% 0%, var(--org-brand-soft) 0%, transparent 55%);
}

.welcome-dismiss {
	position: absolute;
	top: 12px;
	right: 12px;
	display: flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: 9999px;
	color: hsl(var(--muted-foreground));
	transition: color 0.15s, background 0.15s;
}

.welcome-dismiss:hover {
	color: hsl(var(--foreground));
	background: hsl(var(--muted) / 0.6);
}

.welcome-badge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 40px;
	height: 40px;
	border-radius: 12px;
	color: #fff;
	background: var(--org-brand);
	box-shadow: 0 4px 14px var(--org-brand-ring);
	margin-bottom: 14px;
}

.welcome-title {
	font-size: 20px;
	font-weight: 700;
	line-height: 1.2;
	color: hsl(var(--foreground));
	padding-right: 32px;
}

.welcome-sub {
	font-size: 14px;
	line-height: 1.5;
	color: hsl(var(--muted-foreground));
	margin-top: 6px;
	max-width: 60ch;
}

.welcome-links {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	margin-top: 18px;
}

@media (min-width: 640px) {
	.welcome-links {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.welcome-link {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 12px;
	border-radius: 14px;
	background: hsl(var(--muted) / 0.4);
	transition: background 0.15s, transform 0.1s;
	text-decoration: none;
}

.welcome-link:hover {
	background: hsl(var(--muted) / 0.75);
}

.welcome-link:active {
	transform: translateY(1px);
}

.welcome-link__icon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 32px;
	height: 32px;
	border-radius: 10px;
	flex-shrink: 0;
	color: var(--org-brand);
	background: var(--org-brand-soft);
}

.welcome-link__label {
	display: block;
	font-size: 13px;
	font-weight: 600;
	color: hsl(var(--foreground));
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.welcome-link__hint {
	display: block;
	font-size: 11px;
	color: hsl(var(--muted-foreground));
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.welcome-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	margin-top: 18px;
}

.welcome-tour {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	height: 38px;
	padding: 0 16px;
	border-radius: 10px;
	font-size: 13px;
	font-weight: 600;
	color: #fff;
	background: var(--org-brand);
	box-shadow: 0 2px 10px var(--org-brand-ring);
	transition: opacity 0.15s;
}

.welcome-tour:hover {
	opacity: 0.92;
}

.welcome-skip {
	height: 38px;
	padding: 0 12px;
	font-size: 13px;
	font-weight: 500;
	color: hsl(var(--muted-foreground));
	transition: color 0.15s;
}

.welcome-skip:hover {
	color: hsl(var(--foreground));
}
</style>
