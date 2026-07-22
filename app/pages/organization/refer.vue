<script setup lang="ts">
/**
 * /organization/refer — the subscriber referral page.
 *
 * A standalone home for the "refer another agency" flow so it's linkable and
 * doesn't complicate the main org-settings surface. Gated to org managers and
 * above (the people who'd share on the org's behalf).
 */
definePageMeta({
	middleware: ['auth'],
});
useHead({ title: 'Refer an agency | Earnest' });

const { isOrgManagerOrAbove } = useOrgRole();
</script>

<template>
	<div>
		<AppHeader title="Refer an agency" />

		<LayoutPageContainer>
			<div class="max-w-2xl mx-auto">
				<!-- Role + link are client-resolved; render client-side to avoid a
				     hydration mismatch. -->
				<ClientOnly>
					<OrganizationReferralCard v-if="isOrgManagerOrAbove" />
					<div v-else class="ios-card p-8 text-center">
						<Icon name="lucide:lock" class="w-8 h-8 text-muted-foreground/60 mx-auto mb-3" />
						<p class="text-sm text-muted-foreground">
							Referrals are managed by your organization's owners and managers.
						</p>
					</div>
				</ClientOnly>
			</div>
		</LayoutPageContainer>
	</div>
</template>
