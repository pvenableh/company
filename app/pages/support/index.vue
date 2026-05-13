<script setup lang="ts">
import { Button } from '~/components/ui/button';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'My reports | Earnest' });

const { openReportModal } = useReportIssue();
</script>

<template>
	<LayoutPageContainer>
		<LayoutPageHeader title="My reports" subtitle="Bugs, ideas, and questions you've sent to Earnest">
			<template #actions>
				<Button size="sm" @click="openReportModal('bug')">
					<Icon name="lucide:plus" class="w-4 h-4 mr-1" />
					New report
				</Button>
			</template>
		</LayoutPageHeader>

		<SupportReportList base-path="/support" />
	</LayoutPageContainer>
</template>
