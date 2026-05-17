<script setup lang="ts">
import { Button } from '~/components/ui/button';

definePageMeta({
	layout: 'apps',
	middleware: ['auth'],
});
useHead({ title: 'Card Desk | Earnest' });
</script>

<template>
	<div class="apps-page">
		<AppHeader title="Card Desk">
			<template #actions>
				<Button as-child variant="outline" size="sm">
					<NuxtLink to="/apps/clients?view=contacts">
						<Icon name="lucide:users" class="w-4 h-4 mr-1" />
						View all contacts
					</NuxtLink>
				</Button>
			</template>
		</AppHeader>

		<LayoutPageContainer>
			<CardDeskDashboard />
		</LayoutPageContainer>
	</div>
</template>

<style scoped>
@reference "~/assets/css/tailwind.css";

.apps-page {
	@apply flex flex-col min-h-full;
}
</style>
