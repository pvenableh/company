<script setup lang="ts">
definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Activity | Earnest' });
</script>

<template>
	<LayoutPageContainer>
		<div class="flex items-center justify-between pt-2 mb-6">
			<div>
				<h1 class="text-[28px] font-bold text-foreground tracking-tight leading-tight">Activity</h1>
				<p class="text-[15px] text-muted-foreground mt-0.5">Recent activity across your workspace</p>
			</div>
		</div>

		<CommandCenterTimeline />
	</LayoutPageContainer>
</template>
