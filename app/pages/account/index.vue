<template>
	<div class="account-page">
		<AppHeader title="Account" />
		<LayoutPageContainer>
			<!-- Identity card -->
			<div class="ios-card flex items-center gap-4 p-4 mb-6">
				<UserAvatar size="md" />
				<div class="min-w-0">
					<p class="text-base font-semibold truncate">{{ fullName || 'Account' }}</p>
					<p class="text-xs text-muted-foreground truncate">{{ user?.email }}</p>
				</div>
				<div class="ml-auto">
					<AccountLogout v-if="user" />
				</div>
			</div>

			<AppFloorStrip
				v-model="section"
				:items="sections"
				aria-label="Account sections"
			/>

			<div class="account-page__panel">
				<section v-if="section === 'profile'">
					<AccountProfile />
				</section>

				<section v-else-if="section === 'password'">
					<h2 class="account-page__heading">Reset Password</h2>
					<AccountPasswordRequest />
				</section>

				<section v-else-if="section === 'score'" class="max-w-xl">
					<h2 class="account-page__heading">Earnest Score</h2>
					<EarnestProfilePanel />
				</section>

				<section v-else-if="section === 'appearance'" class="w-full">
					<h2 class="account-page__heading">Appearance</h2>

					<!-- Dark mode (top-of-section quick toggle).
					     `@click` on the row + the Switch's own click are both
					     wired to `toggleDark()` because reka-ui's Switch
					     occasionally swallows the first post-hydration click
					     when modelValue resolves through a computed that
					     finalises after mount; the row click is the reliable
					     path and the Switch's @click is the redundant one
					     that still feels natural to hit. -->
					<div
						class="ios-card flex items-center justify-between gap-4 p-4 mb-6 cursor-pointer"
						@click="toggleDark()"
					>
						<div class="flex items-center gap-3 min-w-0">
							<span class="flex items-center justify-center size-9 rounded-lg bg-muted/60 text-foreground/80 shrink-0">
								<Icon :name="isDark ? 'lucide:moon' : 'lucide:sun'" class="size-4" />
							</span>
							<div class="min-w-0">
								<p class="text-sm font-semibold">Dark mode</p>
								<p class="text-xs text-muted-foreground">Use a dark colour scheme across the entire app.</p>
							</div>
						</div>
						<Switch :model-value="isDark" @click.stop="toggleDark()" />
					</div>

					<!-- Theme + Typography (full width, modernized grid) -->
					<ThemeSwitcher />

					<!-- Layout — apps mode + rail position. Same surface as theme
					     because the two interact (palette only visibly applies in
					     apps mode) and the user thinks of them as one bucket: how
					     the app looks. -->
					<h3 class="account-page__subheading">Layout</h3>
					<div class="ios-card p-5 space-y-6 max-w-xl">
						<div
							class="flex items-start justify-between gap-4 cursor-pointer"
							@click="appsModeSaving || handleToggleAppsMode(!appsModeChecked)"
						>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium">Apps Layout</p>
								<p class="text-xs text-muted-foreground mt-1">
									App-by-app shell for Clients, Work, Money, Marketing, and
									Organization. Your classic sidebar stays available — toggle
									back any time.
								</p>
							</div>
							<Switch
								:model-value="appsModeChecked"
								:disabled="appsModeSaving"
								@click.stop="appsModeSaving || handleToggleAppsMode(!appsModeChecked)"
							/>
						</div>

						<div
							v-if="appsModeChecked"
							class="flex items-start justify-between gap-4"
						>
							<div class="flex-1 min-w-0">
								<p class="text-sm font-medium">Show app names</p>
								<p class="text-xs text-muted-foreground mt-1">
									Label each app next to its icon in the top or bottom rail. Hide
									for a cleaner icon-only pill once you know the icons — names
									still surface as tooltips on hover.
								</p>
							</div>
							<Switch
								:model-value="railShowLabels"
								@update:model-value="setRailShowLabels"
							/>
						</div>
					</div>
				</section>

				<section v-else-if="section === 'notifications'" class="max-w-xl">
					<h2 class="account-page__heading">Notifications</h2>

					<div class="ios-card p-5 space-y-5">
						<div class="flex items-center justify-between">
							<div>
								<p class="text-sm font-medium">Desktop Notifications</p>
								<p class="text-xs text-muted-foreground">Show browser notifications when tab is not focused</p>
							</div>
							<div class="flex items-center gap-2">
								<button
									v-if="desktopNotifs.permission.value !== 'granted' && desktopNotifs.isSupported.value"
									class="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
									@click="requestDesktopPermission"
								>
									Enable
								</button>
								<span v-else-if="!desktopNotifs.isSupported.value" class="text-xs text-muted-foreground">
									Not supported
								</span>
								<span v-else class="text-xs text-success dark:text-success">
									Enabled
								</span>
							</div>
						</div>

						<div class="border-t border-border/40" />

						<div class="flex items-center justify-between">
							<div>
								<p class="text-sm font-medium">Sound Alerts</p>
								<p class="text-xs text-muted-foreground">Play sound when new notifications arrive</p>
							</div>
							<Switch
								:model-value="notifPrefs.soundEnabled"
								@update:model-value="(v) => notifPrefs.soundEnabled = v"
							/>
						</div>

						<div class="flex items-center justify-between">
							<div>
								<p class="text-sm font-medium">Email Notifications</p>
								<p class="text-xs text-muted-foreground">Receive email for important updates</p>
							</div>
							<Switch
								:model-value="notifPrefs.emailEnabled"
								@update:model-value="(v) => notifPrefs.emailEnabled = v"
							/>
						</div>

						<div class="flex items-center justify-between">
							<div>
								<p class="text-sm font-medium">Desktop Alerts</p>
								<p class="text-xs text-muted-foreground">Show desktop notification popups</p>
							</div>
							<Switch
								:model-value="notifPrefs.desktopEnabled"
								@update:model-value="(v) => notifPrefs.desktopEnabled = v"
							/>
						</div>
					</div>

					<h3 class="account-page__subheading">Interaction Feedback</h3>

					<div class="ios-card p-5 space-y-5">
						<div v-if="hapticSupported" class="flex items-center justify-between">
							<div>
								<p class="text-sm font-medium">Haptic Feedback</p>
								<p class="text-xs text-muted-foreground">Vibration on interactions (mobile devices)</p>
							</div>
							<Switch
								:model-value="feedbackPrefs.hapticEnabled"
								@update:model-value="() => toggleFeedbackPref('hapticEnabled')"
							/>
						</div>

						<div class="flex items-center justify-between">
							<div>
								<p class="text-sm font-medium">Sound Feedback</p>
								<p class="text-xs text-muted-foreground">Audio cues on actions like save, delete, and errors</p>
							</div>
							<Switch
								:model-value="feedbackPrefs.soundEnabled"
								@update:model-value="() => toggleFeedbackPref('soundEnabled')"
							/>
						</div>
					</div>

					<div class="mt-5 flex justify-end">
						<button
							class="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
							@click="handleSavePrefs"
						>
							Save Preferences
						</button>
					</div>
				</section>

				<section v-else-if="section === 'about'" class="max-w-xl">
					<h2 class="account-page__heading">About</h2>

					<div class="ios-card p-5 space-y-5">
						<!-- Status line -->
						<div class="flex items-center justify-between gap-4">
							<div class="flex items-center gap-3 min-w-0">
								<span
									class="flex items-center justify-center size-9 rounded-lg shrink-0"
									:class="{
										'bg-success/15 text-success': versionStatus === 'current',
										'bg-amber-500/15 text-amber-600 dark:text-amber-500': versionStatus === 'outdated',
										'bg-muted/60 text-muted-foreground': versionStatus === 'checking' || versionStatus === 'unknown',
									}"
								>
									<Icon
										:name="versionStatus === 'current' ? 'lucide:check-circle-2'
											: versionStatus === 'outdated' ? 'lucide:arrow-down-circle'
											: versionStatus === 'checking' ? 'lucide:loader-circle'
											: 'lucide:help-circle'"
										class="size-5"
										:class="{ 'animate-spin': versionStatus === 'checking' }"
									/>
								</span>
								<div class="min-w-0">
									<p class="text-sm font-semibold">
										{{ versionStatus === 'current' ? 'Up to date'
											: versionStatus === 'outdated' ? 'Update available'
											: versionStatus === 'checking' ? 'Checking…'
											: isDevBuild ? 'Development build' : 'Unable to confirm' }}
									</p>
									<p class="text-xs text-muted-foreground">{{ lastCheckedLabel }}</p>
								</div>
							</div>
							<button
								class="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted/60 transition-colors disabled:opacity-50"
								:disabled="versionChecking || isDevBuild"
								@click="handleCheckVersion"
							>
								{{ versionChecking ? 'Checking…' : 'Check now' }}
							</button>
						</div>

						<div v-if="versionStatus === 'outdated'">
							<button
								class="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
								@click="refreshApp"
							>
								Refresh to update
							</button>
						</div>

						<div class="border-t border-border/40" />

						<!-- Version detail -->
						<dl class="space-y-3 text-sm">
							<div class="flex items-center justify-between gap-4">
								<dt class="text-muted-foreground">Version</dt>
								<dd class="font-medium tabular-nums">v{{ currentVersion }}</dd>
							</div>
							<div class="flex items-center justify-between gap-4">
								<dt class="text-muted-foreground">Build</dt>
								<dd class="font-mono text-xs text-muted-foreground">{{ shortBuildId || '—' }}</dd>
							</div>
						</dl>
					</div>

					<p class="text-xs text-muted-foreground mt-3 px-1">
						Earnest updates automatically on each deploy. If you've had this tab open a
						while, “Check now” confirms whether a newer release is live.
					</p>
				</section>
			</div>
		</LayoutPageContainer>
	</div>
</template>

<script setup lang="ts">
import { toast } from 'vue-sonner';
import { Switch } from '@/components/ui/switch';

type SectionKey = 'profile' | 'password' | 'score' | 'appearance' | 'notifications' | 'about';

const { user } = useDirectusAuth();
const { isAppsMode, railShowLabels, setMode, setRailShowLabels } = useAppsMode();
const route = useRoute();
const router = useRouter();

definePageMeta({
	layout: 'apps',
	middleware: ['auth'],
});
useHead({ title: 'Account | Earnest' });

const sections: Array<{ key: SectionKey; label: string; icon: string }> = [
	{ key: 'profile',       label: 'Profile',       icon: 'lucide:user-round' },
	{ key: 'password',      label: 'Password',      icon: 'lucide:key-round' },
	{ key: 'score',         label: 'Earnest Score', icon: 'earnest' },
	{ key: 'appearance',    label: 'Appearance',    icon: 'lucide:palette' },
	{ key: 'notifications', label: 'Notifications', icon: 'lucide:bell' },
	{ key: 'about',         label: 'About',         icon: 'lucide:info' },
];

const SECTION_KEYS: SectionKey[] = sections.map((s) => s.key);
// Legacy /account?section=layout links land on Appearance now — the
// layout controls live as a card inside that section.
const initialSection: SectionKey = (() => {
	const v = route.query.section;
	if (v === 'layout') return 'appearance';
	return typeof v === 'string' && SECTION_KEYS.includes(v as SectionKey)
		? (v as SectionKey)
		: 'profile';
})();
const section = ref<SectionKey>(initialSection);

watch(section, (next) => {
	router.replace({ query: { ...route.query, section: next === 'profile' ? undefined : next } });
});

const fullName = computed(() => {
	const u = user.value as Record<string, any> | null;
	if (!u) return '';
	return [u.first_name, u.last_name].filter(Boolean).join(' ');
});

// ── Notification preferences ────────────────────────────────────────────────
const { userPreferences, savePreferences } = useNotifications();
const desktopNotifs = useDesktopNotifications();

// ── Feedback preferences ────────────────────────────────────────────────────
const { feedback, hapticSupported, preferences: feedbackPrefs, setPreferences: setFeedbackPrefs } = useFeedback();

function toggleFeedbackPref(key: 'hapticEnabled' | 'soundEnabled') {
	setFeedbackPrefs({ [key]: !feedbackPrefs.value[key] });
	feedback('tap');
}

const notifPrefs = ref({
	soundEnabled: userPreferences.value.soundEnabled ?? true,
	emailEnabled: userPreferences.value.emailEnabled ?? true,
	desktopEnabled: userPreferences.value.desktopEnabled ?? true,
});

async function requestDesktopPermission() {
	const result = await desktopNotifs.requestPermission();
	if (result === 'granted') {
		toast.success('Desktop notifications enabled');
	} else {
		toast.error('Desktop notification permission denied');
	}
}

async function handleSavePrefs() {
	await savePreferences(notifPrefs.value);
	toast.success('Notification preferences saved');
}

// ── Apps Layout ─────────────────────────────────────────────────────────────
const appsModeChecked = computed(() => isAppsMode.value);
const appsModeSaving = ref(false);

async function handleToggleAppsMode(next: boolean) {
	appsModeSaving.value = true;
	try {
		await setMode(next ? 'apps' : 'classic');
		toast.success(next ? 'Apps Layout enabled' : 'Apps Layout disabled');
		// /account is hardcoded to the apps layout, so toggling off here
		// wouldn't change anything visible. Hand the user to the classic
		// dashboard (or back to the apps clients hub) so they can actually
		// see the layout they just picked.
		await router.push(next ? '/apps/clients' : '/');
	} catch {
		toast.error("Couldn't save layout preference");
	} finally {
		appsModeSaving.value = false;
	}
}

// ── About / version ─────────────────────────────────────────────────────────
const {
	currentVersion,
	currentBuildId,
	shortBuildId,
	status: versionStatus,
	lastCheckedAt,
	isDev: isDevBuild,
	check: checkVersion,
	refresh: refreshApp,
} = useAppVersion();

const versionChecking = ref(false);
async function handleCheckVersion() {
	versionChecking.value = true;
	try {
		const result = await checkVersion();
		if (result === 'current') toast.success("You're on the latest version");
		else if (result === 'outdated') toast.info('A newer version is available — refresh to update');
		else toast.error("Couldn't reach the server to check");
	} finally {
		versionChecking.value = false;
	}
}

const lastCheckedLabel = computed(() => {
	if (!lastCheckedAt.value) return 'Not checked yet';
	const d = new Date(lastCheckedAt.value);
	return `Checked ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
});

// Run a check whenever the user lands on the About section.
watch(section, (s) => {
	if (s === 'about') void checkVersion();
}, { immediate: true });

// ── Appearance / dark mode ──────────────────────────────────────────────────
const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === 'dark');
function toggleDark() {
	// Read the live value at click-time and flip it, so the toggle works
	// even when reka-ui's Switch emits the wrong boolean on its first
	// post-hydration click (the local vmodel can initialise stale before
	// `colorMode.value` resolves on the client).
	colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark';
}
</script>

<style scoped>
@reference "~/assets/css/tailwind.css";

.account-page {
	@apply flex flex-col min-h-full;
}

.account-page__panel {
	@apply mt-1;
}

.account-page__heading {
	@apply text-base font-semibold text-foreground mb-4;
}

.account-page__subheading {
	@apply text-sm font-semibold text-foreground mt-6 mb-3;
}
</style>
