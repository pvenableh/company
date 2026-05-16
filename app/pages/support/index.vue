<script setup lang="ts">
import { Button } from '~/components/ui/button';

definePageMeta({ layout: 'apps', middleware: ['auth'] });
useHead({ title: 'My reports | Earnest' });

const { openReportModal } = useReportIssue();
</script>

<template>
	<div class="flex flex-col min-h-full">
		<AppHeader title="My reports">
			<template #actions>
				<Button size="sm" @click="openReportModal('bug')">
					<Icon name="lucide:plus" class="w-4 h-4 mr-1" />
					New report
				</Button>
			</template>
		</AppHeader>
		<LayoutPageContainer>
			<p class="text-sm text-muted-foreground mb-4">
				Bugs, ideas, and questions you've sent to Earnest.
			</p>
			<SupportReportList base-path="/support" />
		</LayoutPageContainer>
	</div>
</template>
