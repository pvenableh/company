<script setup lang="ts">
/**
 * PortalUserMenu — avatar-anchored dropdown for the client portal.
 *
 * Visually identical to the staff `LayoutUserMenu` (same iOS dropdown
 * tile, same iOS-style dark-mode switch) so the portal chrome reads
 * as the same product. Surfaces only portal-relevant destinations:
 *
 *   Profile (→ /portal/account) · Dark-mode toggle · Sign out
 *
 * Notably omits Subscription / Organization / Layout-mode — those are
 * staff routes that would 403 or simply not apply to portal users.
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
const route = useRoute();
const config = useRuntimeConfig();
const { user } = useDirectusAuth();
const { logout } = useLogout();
const { isAppsMode, setMode } = useAppsMode();

const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === 'dark');
function toggleDark() {
	colorMode.preference = isDark.value ? 'light' : 'dark';
}

async function toggleLayoutMode() {
	const next = isAppsMode.value ? 'classic' : 'apps';
	void setMode(next).catch(() => {});
	// Stay on the same portal page — the global middleware will pick up
	// the new mode and swap the underlying shell on next nav.
	await router.replace(route.fullPath);
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

function goTo(path: string) {
	router.push(path);
}

function handleLogout() {
	logout();
}
</script>

<template>
	<DropdownMenu>
		<DropdownMenuTrigger as-child>
			<button
				type="button"
				class="portal-user-menu__trigger"
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

			<DropdownMenuItem @select="goTo('/portal/account')">
				<Icon name="lucide:user-round" class="size-4 mr-2 shrink-0" />
				<span>Account</span>
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
					class="portal-user-menu__switch"
					:class="isDark ? 'portal-user-menu__switch--on' : 'portal-user-menu__switch--off'"
					aria-hidden="true"
				>
					<span class="portal-user-menu__switch-knob" />
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
					class="portal-user-menu__switch"
					:class="isAppsMode ? 'portal-user-menu__switch--on' : 'portal-user-menu__switch--off'"
					aria-hidden="true"
				>
					<span class="portal-user-menu__switch-knob" />
				</span>
			</DropdownMenuItem>

			<DropdownMenuSeparator />

			<DropdownMenuItem class="text-destructive focus:text-destructive" @select="handleLogout">
				<Icon name="lucide:log-out" class="size-4 mr-2 shrink-0" />
				<span>Sign out</span>
			</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.portal-user-menu__trigger {
	@apply rounded-full ring-0 outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow;
}

/* Compact iOS-style switch for the inline dark-mode toggle. Matches
 * the staff UserMenu so muscle memory carries over. */
.portal-user-menu__switch {
	@apply relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors;
}

.portal-user-menu__switch--off {
	@apply bg-muted-foreground/30;
}

.portal-user-menu__switch--on {
	@apply bg-primary;
}

.portal-user-menu__switch-knob {
	@apply absolute top-0.5 left-0.5 size-3 rounded-full bg-background transition-transform;
}

.portal-user-menu__switch--on .portal-user-menu__switch-knob {
	transform: translateX(0.75rem);
}
</style>
