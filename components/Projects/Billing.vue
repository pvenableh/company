<template>
	<div class="w-full px-4 py-10 min-h-[50vh] flex items-center justify-start flex-col">
		<div class="w-full max-w-2xl">
			<h1 class="t-label border-b border-border">Billing</h1>
			<div class="flex flex-col items-center justify-center py-20 text-center">
				<div class="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mb-4">
					<Icon name="lucide:receipt" class="h-6 w-6 text-muted-foreground/60" />
				</div>
				<p class="text-sm text-muted-foreground">There are no invoices for this project.</p>
			</div>
		</div>
	</div>
</template>
<script setup>
defineProps({
	project: {
		type: Object,
		default: () => null,
	},
});
</script>
