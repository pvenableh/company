<script setup lang="ts">
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-vue-next';

definePageMeta({
	layout: 'blank',
});

const { signOut } = useDirectusAuth();

onMounted(async () => {
	try {
		await signOut();
		setTimeout(() => {
			window.location.href = '/';
		}, 500);
	} catch (error) {
		console.error('Logout error:', error);
		window.location.href = '/';
	}
});
</script>

<template>
	<div class="flex items-center justify-center h-screen">
		<Card class="w-full max-w-xs">
			<CardHeader class="text-center">
				<h3 class="text-lg font-medium">Logging out...</h3>
			</CardHeader>
			<CardContent class="flex justify-center">
				<Loader2 class="size-6 animate-spin text-muted-foreground" />
			</CardContent>
		</Card>
	</div>
</template>
