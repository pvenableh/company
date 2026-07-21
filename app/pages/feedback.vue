<script setup lang="ts">
/**
 * /feedback — the org's client-feedback hub (staff side).
 *
 * Shows the current org's feedback by default. A platform admin can view any
 * org by passing ?org=<id> (the /api/org/feedback endpoint authorizes both the
 * manager+-of-this-org case and the platform-admin any-org case).
 */
definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'Feedback | Earnest' });

const route = useRoute();
const { selectedOrg } = useOrganization();

const org = computed(() => (route.query.org ? String(route.query.org) : selectedOrg.value));
const viewingOther = computed(() => !!route.query.org && route.query.org !== selectedOrg.value);
</script>

<template>
	<LayoutPageContainer>
		<AppHeader title="Feedback">
			<template #actions>
				<NuxtLink v-if="viewingOther" to="/platform">
					<UiViewLink>All organizations</UiViewLink>
				</NuxtLink>
			</template>
		</AppHeader>

		<p class="text-sm text-muted-foreground mb-6 -mt-1">
			What your clients think — of your team, and the work you deliver.
		</p>

		<FeedbackHub :org="org" />
	</LayoutPageContainer>
</template>
