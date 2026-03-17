<template>
	<div class="md:px-6 mx-auto flex items-start justify-center flex-col md:flex-row relative px-4 pt-20 account">
		<div class="md:top-4 flex md:items-end md:justify-end flex-col w-full md:mr-6 lg:mr account__navigation">
			<UserAvatar size="md" />

			<h1 class="hidden md:inline-block mt-6">{{ user?.first_name }} {{ user?.last_name }}</h1>
			<a :class="{ active: panel === 1 }" @click.prevent="changePanel(1)">Profile</a>
			<a :class="{ active: panel === 2 }" @click.prevent="changePanel(2)">Reset Password</a>
			<a :class="{ active: panel === 3 }" @click.prevent="changePanel(3)">Earnest Score</a>
			<a :class="{ active: panel === 5 }" @click.prevent="changePanel(5)">Appearance</a>
			<a :class="{ active: panel === 6 }" @click.prevent="changePanel(6)">Notifications</a>
			<AccountLogout v-if="user" class="logout-icon" />
		</div>
		<transition-group
			name="list"
			tag="div"
			class="w-full flex flex-col items-center justify-start relative account__panels"
		>
			<div v-if="panel === 1" key="1" class="account__panel profile">
				<AccountProfile />
			</div>
			<div v-if="panel === 2" key="2" class="account__panel">
				<AccountPasswordRequest />
			</div>
			<div v-if="panel === 3" key="3" class="account__panel">
				<div class="max-w-xl">
					<h2 class="text-lg font-semibold text-foreground mb-6">Earnest Score</h2>
					<EarnestProfilePanel />
				</div>
			</div>
			<div v-if="panel === 4" key="4" class="account__panel"></div>
			<div v-if="panel === 5" key="5" class="account__panel">
				<div class="max-w-md">
					<h2 class="text-lg font-semibold text-foreground mb-6">Appearance</h2>
					<ThemeSwitcher />
				</div>
			</div>
			<div v-if="panel === 6" key="6" class="account__panel">
				<div class="max-w-md mx-auto">
					<h2 class="text-lg font-semibold text-foreground mb-6">Notification Preferences</h2>

					<!-- Desktop Notifications -->
					<div class="space-y-5">
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
								<span
									v-else-if="!desktopNotifs.isSupported.value"
									class="text-xs text-muted-foreground"
								>
									Not supported
								</span>
								<span
									v-else
									class="text-xs text-green-600 dark:text-green-400"
								>
									Enabled
								</span>
							</div>
						</div>

						<div class="border-t dark:border-gray-700" />

						<!-- Sound Notifications -->
						<div class="flex items-center justify-between">
							<div>
								<p class="text-sm font-medium">Sound Alerts</p>
								<p class="text-xs text-muted-foreground">Play sound when new notifications arrive</p>
							</div>
							<button
								class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
								:class="notifPrefs.soundEnabled ? 'bg-primary' : 'bg-muted'"
								@click="notifPrefs.soundEnabled = !notifPrefs.soundEnabled"
							>
								<span
									class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform"
									:class="notifPrefs.soundEnabled ? 'translate-x-4' : 'translate-x-0'"
								/>
							</button>
						</div>

						<!-- Email Notifications -->
						<div class="flex items-center justify-between">
							<div>
								<p class="text-sm font-medium">Email Notifications</p>
								<p class="text-xs text-muted-foreground">Receive email for important updates</p>
							</div>
							<button
								class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
								:class="notifPrefs.emailEnabled ? 'bg-primary' : 'bg-muted'"
								@click="notifPrefs.emailEnabled = !notifPrefs.emailEnabled"
							>
								<span
									class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform"
									:class="notifPrefs.emailEnabled ? 'translate-x-4' : 'translate-x-0'"
								/>
							</button>
						</div>

						<!-- Desktop enabled preference -->
						<div class="flex items-center justify-between">
							<div>
								<p class="text-sm font-medium">Desktop Alerts</p>
								<p class="text-xs text-muted-foreground">Show desktop notification popups</p>
							</div>
							<button
								class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
								:class="notifPrefs.desktopEnabled ? 'bg-primary' : 'bg-muted'"
								@click="notifPrefs.desktopEnabled = !notifPrefs.desktopEnabled"
							>
								<span
									class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform"
									:class="notifPrefs.desktopEnabled ? 'translate-x-4' : 'translate-x-0'"
								/>
							</button>
						</div>
					</div>

					<div class="mt-6 flex justify-end">
						<button
							class="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
							@click="handleSavePrefs"
						>
							Save Preferences
						</button>
					</div>
				</div>
			</div>
		</transition-group>
	</div>
</template>

<script setup lang="ts">
import { toast } from 'vue-sonner';

const { user } = useDirectusAuth();

definePageMeta({
	middleware: ['auth'],
});

const panel = ref(1);

function changePanel(val: string | number) {
	panel.value = Number(val);
}

// ── Notification preferences ────────────────────────────────────────────────
const { userPreferences, savePreferences } = useNotifications();
const desktopNotifs = useDesktopNotifications();

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
</script>
<style>
@reference "~/assets/css/tailwind.css";
.account {
	max-width: 1600px;
}

.account__navigation {
	border-bottom: thin solid var(--lightGrey);

	@media (min-width: theme('screens.md')) {
		width: 220px;
		border-bottom: none;
	}
	h1 {
		font-size: 10px;
		@apply w-full text-center md:text-right uppercase tracking-wider pb-2 mb-0 md:mb-2;
	}

	a,
	.logout-btn {
		font-size: 10px;
		@apply w-full text-center md:text-right uppercase tracking-wider pb-2 mb-0 md:mb-2 cursor-pointer;
	}

	a.active {
		color: var(--purple);
		opacity: 0.25;
	}
}

.account__panels {
	width: 100%;

	@media (min-width: theme('screens.md')) {
		width: 800px;
	}
}

.account__panel {
	@apply w-full;

	h2 {
		@apply uppercase tracking-wider font-bold text-sm text-center w-full mt-6;
	}

	.addresses__nav {
		a {
			max-width: 200px;
		}
	}
}
</style>
