<script setup lang="ts">
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const open = defineModel<boolean>({ required: true });

const { user } = useDirectusAuth();
const { selectedOrg } = useOrganization();
const { canAccess } = useOrgRole();
const { usageSummary, refresh: refreshTokenUsage } = useAITokens();
const toast = useToast();
const router = useRouter();

const canManageTokens = computed(() => canAccess('org_settings'));

const tokenPackages = [
	{ id: 'tokens_100k', name: '100K', tokens: 100_000, price: 9 },
	{ id: 'tokens_500k', name: '500K', tokens: 500_000, price: 39 },
	{ id: 'tokens_1_5m', name: '1.5M', tokens: 1_500_000, price: 99 },
];

const buyLoading = ref<string | null>(null);

async function buyTokens(packageId: string) {
	if (!user.value || !selectedOrg.value) return;
	buyLoading.value = packageId;
	try {
		const data = await $fetch<{ url: string }>('/api/stripe/tokens/checkout', {
			method: 'POST',
			body: {
				email: (user.value as any).email,
				customerId: (user.value as any).stripe_customer_id,
				packageId,
				organizationId: (selectedOrg.value as any)?.id || selectedOrg.value,
			},
		});
		if (data?.url) window.location.href = data.url;
	} catch (err: any) {
		toast.add({
			title: 'Could not start checkout',
			description: err?.data?.message || err?.message || 'Please try again',
			color: 'red',
		});
	} finally {
		buyLoading.value = null;
	}
}

function viewDetailedUsage() {
	router.push('/organization?tab=ai-usage');
	open.value = false;
}

watch(open, (isOpen) => {
	if (isOpen) refreshTokenUsage();
});
</script>

<template>
	<Dialog v-model:open="open">
		<DialogContent class="max-w-md">
			<DialogHeader>
				<DialogTitle class="flex items-center gap-2">
					<UIcon name="i-heroicons-bolt" class="w-4 h-4 text-primary" />
					AI Tokens
				</DialogTitle>
				<DialogDescription class="text-xs">
					Tokens power AI features across Earnest. Top up anytime.
				</DialogDescription>
			</DialogHeader>

			<!-- Usage summary -->
			<OrganizationTokenMeter :show-cta="false" />

			<!-- Buy tokens -->
			<div v-if="canManageTokens" class="space-y-3">
				<h4 class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Buy more tokens</h4>
				<div class="grid grid-cols-3 gap-2">
					<button
						v-for="pkg in tokenPackages"
						:key="pkg.id"
						class="flex flex-col items-center gap-1 px-3 py-3 rounded-xl border border-border/40 bg-background hover:border-primary/40 hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						:disabled="buyLoading === pkg.id"
						@click="buyTokens(pkg.id)"
					>
						<span class="text-sm font-bold text-foreground">{{ pkg.name }}</span>
						<span class="text-[10px] text-muted-foreground">tokens</span>
						<span class="text-xs font-semibold text-primary">${{ pkg.price }}</span>
						<UIcon
							v-if="buyLoading === pkg.id"
							name="i-heroicons-arrow-path"
							class="w-3 h-3 text-primary animate-spin mt-0.5"
						/>
					</button>
				</div>
				<p class="text-[10px] text-muted-foreground text-center">
					Tokens never expire and stack on top of your monthly allotment.
				</p>
			</div>

			<p v-else class="text-[11px] text-muted-foreground">
				Only organization admins can purchase tokens.
			</p>

			<!-- Detailed usage link -->
			<button
				class="w-full text-xs text-primary hover:underline flex items-center justify-center gap-1 pt-2"
				@click="viewDetailedUsage"
			>
				View detailed usage and history
				<UIcon name="i-heroicons-arrow-top-right-on-square" class="w-3 h-3" />
			</button>
		</DialogContent>
	</Dialog>
</template>
