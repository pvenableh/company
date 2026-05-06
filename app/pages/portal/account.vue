<script setup lang="ts">
definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Account | Client Portal' });

const { user } = useDirectusAuth();
const { clientName } = useClientPortalUser();

type PanelKey = 'profile' | 'password' | 'appearance';

const panel = ref<PanelKey>('profile');

const sections: Array<{ key: PanelKey; label: string; icon: string }> = [
	{ key: 'profile', label: 'Profile', icon: 'lucide:user' },
	{ key: 'password', label: 'Password', icon: 'lucide:lock' },
	{ key: 'appearance', label: 'Appearance', icon: 'lucide:sun' },
];
</script>

<template>
	<LayoutPageContainer>
		<div class="mb-6">
			<h1 class="text-xl font-semibold">Account</h1>
			<p class="text-sm text-muted-foreground mt-0.5">
				<template v-if="user?.first_name">
					{{ user.first_name }} {{ user.last_name }}
				</template>
				<template v-if="clientName"> · {{ clientName }}</template>
			</p>
		</div>

		<div class="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
			<!-- Side nav -->
			<nav class="flex md:flex-col gap-1">
				<button
					v-for="s in sections"
					:key="s.key"
					class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors text-left"
					:class="panel === s.key
						? 'bg-muted text-foreground font-medium'
						: 'text-muted-foreground hover:text-foreground hover:bg-muted/60'"
					@click="panel = s.key"
				>
					<Icon :name="s.icon" class="w-4 h-4" />
					{{ s.label }}
				</button>

				<AccountLogout class="md:mt-auto md:pt-3 md:border-t md:border-border/40">
					<template #default="{ logout }">
						<button
							class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-left w-full"
							@click="logout"
						>
							<Icon name="lucide:log-out" class="w-4 h-4" />
							Sign out
						</button>
					</template>
				</AccountLogout>
			</nav>

			<!-- Panels -->
			<div class="ios-card p-5 md:p-6">
				<div v-if="panel === 'profile'">
					<AccountProfile />
				</div>

				<div v-else-if="panel === 'password'">
					<h2 class="text-lg font-semibold mb-6">Reset Password</h2>
					<AccountPasswordRequest />
				</div>

				<div v-else-if="panel === 'appearance'">
					<h2 class="text-lg font-semibold mb-6">Appearance</h2>
					<ThemeSwitcher />
				</div>
			</div>
		</div>
	</LayoutPageContainer>
</template>
