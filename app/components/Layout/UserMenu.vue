<script setup lang="ts">
/**
 * UserMenu — avatar-anchored dropdown for quick account actions.
 *
 * Surfaces the most common destinations one tap away:
 *   Profile · Subscription · Organization · Layout toggle ·
 *   Dark-mode toggle · Sign out
 *
 * Used by the apps shell (apps.vue). Designed to be drop-in for the
 * classic shell too if it ever wants the same affordance.
 */
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const router = useRouter();
const config = useRuntimeConfig();
const { user } = useDirectusAuth();
const { logout } = useLogout();
const { isAppsMode, setMode } = useAppsMode();
const { open: openMyCard } = useMyCard();

const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === 'dark');
function toggleDark() {
	colorMode.preference = isDark.value ? 'light' : 'dark';
}

// Build/version footer — lets the user confirm at a glance which release they're
// on, with a colour dot reflecting the live deploy check. Full detail + a manual
// re-check live in Account → About.
const { currentVersion, status, check: checkVersion } = useAppVersion();
const versionDotClass = computed(() => ({
	current: 'bg-success',
	outdated: 'bg-amber-500',
	checking: 'bg-muted-foreground/50',
	unknown: 'bg-muted-foreground/40',
}[status.value] ?? 'bg-muted-foreground/40'));
// Refresh the check when the menu opens so the dot is trustworthy on view.
function onOpenChange(open: boolean) {
	if (open) void checkVersion();
}

const avatarUrl = computed(() => {
	const u = user.value as Record<string, any> | null;
	if (!u?.avatar) return null;
	return `${config.public.assetsUrl}${u.avatar}?key=avatar`;
});

const userFirstName = computed(() => (user.value as Record<string, any> | null)?.first_name ?? 'User');

const initials = computed(() => {
	const u = user.value as Record<string, any> | null;
	if (!u) return 'U';
	const first = (u.first_name as string | undefined)?.[0] ?? '';
	const last = (u.last_name as string | undefined)?.[0] ?? '';
	return (first + last).toUpperCase() || 'U';
});

const fullName = computed(() => {
	const u = user.value as Record<string, any> | null;
	if (!u) return '';
	return [u.first_name, u.last_name].filter(Boolean).join(' ');
});

const email = computed(() => (user.value as Record<string, any> | null)?.email ?? '');

async function toggleLayoutMode() {
	const next = isAppsMode.value ? 'classic' : 'apps';
	void setMode(next).catch(() => {});
	await router.push(next === 'apps' ? '/apps/clients' : '/');
}

function goTo(path: string) {
	router.push(path);
}

function handleLogout() {
	logout();
}
</script>

<template>
	<DropdownMenu @update:open="onOpenChange">
		<DropdownMenuTrigger as-child>
			<button
				type="button"
				class="user-menu__trigger"
				:aria-label="`Account menu for ${userFirstName}`"
			>
				<Avatar class="size-7">
					<AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="userFirstName" />
					<AvatarFallback class="text-xs font-semibold">{{ initials }}</AvatarFallback>
				</Avatar>
			</button>
		</DropdownMenuTrigger>

		<DropdownMenuContent align="end" class="w-60">
			<DropdownMenuLabel class="px-2 py-2">
				<div class="flex items-center gap-2.5 min-w-0">
					<Avatar class="size-9 shrink-0">
						<AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="userFirstName" />
						<AvatarFallback class="text-xs font-semibold">{{ initials }}</AvatarFallback>
					</Avatar>
					<div class="min-w-0">
						<p class="text-sm font-semibold truncate">{{ fullName || userFirstName }}</p>
						<p class="text-[11px] text-muted-foreground truncate font-normal">{{ email }}</p>
					</div>
				</div>
			</DropdownMenuLabel>

			<DropdownMenuSeparator />

			<DropdownMenuItem @select="goTo('/account')">
				<Icon name="lucide:user-round" class="size-4 mr-2 shrink-0" />
				<span>Profile</span>
			</DropdownMenuItem>
			<DropdownMenuItem @select="openMyCard()">
				<Icon name="lucide:contact" class="size-4 mr-2 shrink-0" />
				<span>My Card</span>
			</DropdownMenuItem>
			<DropdownMenuItem @select="goTo('/account/subscription')">
				<Icon name="lucide:credit-card" class="size-4 mr-2 shrink-0" />
				<span>Subscription</span>
			</DropdownMenuItem>
			<DropdownMenuItem @select="goTo(isAppsMode ? '/apps/organization' : '/organization')">
				<Icon name="lucide:building-2" class="size-4 mr-2 shrink-0" />
				<span>Organization</span>
			</DropdownMenuItem>

			<DropdownMenuSeparator />

			<DropdownMenuItem @select="goTo('/inbox')">
				<Icon name="lucide:message-square" class="size-4 mr-2 shrink-0" />
				<span>Social inbox</span>
			</DropdownMenuItem>
			<DropdownMenuItem @select="goTo('/support')">
				<Icon name="lucide:inbox" class="size-4 mr-2 shrink-0" />
				<span>My reports</span>
			</DropdownMenuItem>

			<DropdownMenuSeparator />

			<DropdownMenuItem
				class="flex items-center justify-between cursor-pointer"
				@select="(e: Event) => { e.preventDefault(); toggleDark(); }"
			>
				<span class="inline-flex items-center">
					<Icon
						:name="isDark ? 'lucide:moon' : 'lucide:sun'"
						class="size-4 mr-2 shrink-0"
					/>
					<span>Dark mode</span>
				</span>
				<span
					class="user-menu__switch"
					:class="isDark ? 'user-menu__switch--on' : 'user-menu__switch--off'"
					aria-hidden="true"
				>
					<span class="user-menu__switch-knob" />
				</span>
			</DropdownMenuItem>

			<DropdownMenuItem
				class="flex items-center justify-between cursor-pointer"
				@select="(e: Event) => { e.preventDefault(); toggleLayoutMode(); }"
			>
				<span class="inline-flex items-center">
					<Icon
						:name="isAppsMode ? 'lucide:sidebar' : 'lucide:layout-grid'"
						class="size-4 mr-2 shrink-0"
					/>
					<span>{{ isAppsMode ? 'Using Apps Layout' : 'Use Apps Layout' }}</span>
				</span>
				<span
					class="user-menu__switch"
					:class="isAppsMode ? 'user-menu__switch--on' : 'user-menu__switch--off'"
					aria-hidden="true"
				>
					<span class="user-menu__switch-knob" />
				</span>
			</DropdownMenuItem>

			<DropdownMenuSeparator />

			<DropdownMenuItem class="text-destructive focus:text-destructive" @select="handleLogout">
				<Icon name="lucide:log-out" class="size-4 mr-2 shrink-0" />
				<span>Sign out</span>
			</DropdownMenuItem>

			<DropdownMenuSeparator />

			<DropdownMenuItem
				class="flex items-center justify-between text-[11px] text-muted-foreground cursor-pointer"
				@select="goTo('/account?section=about')"
			>
				<span class="inline-flex items-center gap-1.5">
					<span class="size-1.5 rounded-full shrink-0" :class="versionDotClass" aria-hidden="true" />
					<span>Earnest v{{ currentVersion }}</span>
				</span>
				<span v-if="status === 'outdated'" class="text-amber-600 dark:text-amber-500 font-medium">
					Update available
				</span>
			</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.user-menu__trigger {
	@apply rounded-full ring-0 outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow;
}

/* Compact iOS-style switch for the inline dark-mode toggle. */
.user-menu__switch {
	@apply relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors;
}

.user-menu__switch--off {
	@apply bg-muted-foreground/30;
}

.user-menu__switch--on {
	@apply bg-primary;
}

.user-menu__switch-knob {
	@apply absolute top-0.5 left-0.5 size-3 rounded-full bg-background transition-transform;
}

.user-menu__switch--on .user-menu__switch-knob {
	transform: translateX(0.75rem);
}
</style>
