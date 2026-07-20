<script setup lang="ts">
definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'Account | Client Portal' });

const { user } = useDirectusAuth();
const { clientName } = useClientPortalUser();

type PanelKey = 'profile' | 'password' | 'appearance';

const sections: Array<{ key: PanelKey; label: string; icon: string }> = [
	{ key: 'profile', label: 'Profile', icon: 'lucide:user' },
	{ key: 'password', label: 'Password', icon: 'lucide:lock' },
	{ key: 'appearance', label: 'Appearance', icon: 'lucide:sun' },
];

// Deep-linkable via ?section= (the avatar menu's "Appearance" link lands here).
const route = useRoute();
const initialPanel = sections.some((s) => s.key === route.query.section)
	? (route.query.section as PanelKey)
	: 'profile';
const panel = ref<PanelKey>(initialPanel);
</script>

<template>
	<div class="portal-page">
		<AppHeader title="Account" />

		<LayoutPageContainer>
			<p v-if="user?.first_name || clientName" class="text-sm text-muted-foreground mb-4 -mt-1">
				<template v-if="user?.first_name">
					{{ user.first_name }} {{ user.last_name }}
				</template>
				<template v-if="clientName"> · {{ clientName }}</template>
			</p>

			<!-- Sub-nav matches the staff apps' sectioned settings via AppFloorStrip. -->
			<AppFloorStrip v-model="panel" :items="sections" aria-label="Account section" />

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
					<div class="mt-8 pt-6 border-t border-border/40">
						<ClientOnly>
							<LayoutAppRailSettingsPanel :show-sidebar-toggle="false" />
						</ClientOnly>
					</div>
				</div>
			</div>
		</LayoutPageContainer>
	</div>
</template>
