<script setup lang="ts">
import { Button } from '~/components/ui/button';

definePageMeta({
	layout: 'email',
	middleware: ['auth'],
});
useHead({ title: 'Email Template | Earnest' });

const route = useRoute();
const templateId = Number(route.params.id);
const autoOpenAI = route.query.ai === '1';

const { getTemplate } = useEmailTemplates();
const { getBlockLibrary } = useNewsletterBlocks();

const template = ref<any>(null);
const blockLibrary = ref<Record<string, any[]>>({});
const loading = ref(true);

onMounted(async () => {
	try {
		const [tpl, blocks] = await Promise.all([
			getTemplate(templateId),
			getBlockLibrary(),
		]);
		template.value = tpl;
		blockLibrary.value = blocks;
	} catch (e) {
		console.warn('[Email Template] Failed to load:', e);
	} finally {
		loading.value = false;
	}
});
</script>

<template>
	<div v-if="loading" class="flex items-center justify-center min-h-screen">
		<div class="text-center">
			<div class="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
			<p class="text-sm text-muted-foreground">Loading template...</p>
		</div>
	</div>
	<div v-else-if="!template" class="flex items-center justify-center min-h-screen">
		<div class="text-center">
			<Icon name="lucide:alert-circle" class="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
			<p class="text-muted-foreground mb-4">Template not found</p>
			<NuxtLink to="/email">
				<Button variant="outline">Back to Email</Button>
			</NuxtLink>
		</div>
	</div>
	<NewsletterBlockBuilder
		v-else
		:template-id="templateId"
		:template="template"
		:block-library="blockLibrary"
		:auto-open-ai="autoOpenAI"
	/>
</template>
