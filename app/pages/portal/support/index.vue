<script setup lang="ts">
import { Button } from '~/components/ui/button';

definePageMeta({
	layout: 'client-portal',
	middleware: ['auth'],
});
useHead({ title: 'My reports | Client Portal' });

const { openReportModal } = useReportIssue();
</script>

<template>
	<div class="portal-page">
		<AppHeader title="My reports">
			<template #actions>
				<Button size="sm" @click="openReportModal('bug')">
					<Icon name="lucide:plus" class="w-4 h-4 mr-1" />
					New report
				</Button>
			</template>
		</AppHeader>

		<LayoutPageContainer>
			<p class="text-sm text-muted-foreground mb-6 -mt-1">
				Bugs, ideas, and questions you've sent to Earnest.
			</p>
			<SupportReportList base-path="/portal/support" />
		</LayoutPageContainer>
	</div>
</template>
