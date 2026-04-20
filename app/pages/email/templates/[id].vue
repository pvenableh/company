<script setup lang="ts">
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
const { setEntity, clearEntity, sidebarOpen, closeSidebar } = useEntityPageContext();

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
		setEntity('email', String(templateId), tpl.name || 'Email Template');
	} catch (e) {
		console.warn('[Email Template] Failed to load:', e);
	} finally {
		loading.value = false;
	}
});

onUnmounted(() => clearEntity());
</script>

<template>
	<div class="contents">
		<div v-if="loading" class="flex items-center justify-center min-h-screen">
			<div class="text-center">
				<div class="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
				<p class="text-xs text-muted-foreground">Loading template...</p>
			</div>
		</div>
		<div v-else-if="!template" class="flex items-center justify-center min-h-screen">
			<div class="text-center">
				<Icon name="lucide:alert-circle" class="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
				<p class="text-sm text-muted-foreground mb-4">Template not found</p>
				<NuxtLink to="/email">
					<button class="rounded-full px-4 py-2 text-[11px] font-medium border border-border bg-card hover:bg-muted ios-press transition-colors inline-flex items-center gap-1.5">
						<Icon name="lucide:arrow-left" class="w-3 h-3" />
						Back to Email
					</button>
				</NuxtLink>
			</div>
		</div>
		<template v-else>
			<NewsletterBlockBuilder
				:template-id="templateId"
				:template="template"
				:block-library="blockLibrary"
				:auto-open-ai="autoOpenAI"
			/>

			<!-- Floating Ask Earnest trigger (email layout has no dock) -->
			<button
				class="fixed bottom-5 right-5 z-40 inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-border bg-background shadow-md text-xs font-medium text-primary hover:bg-primary/10 hover:border-primary/30 transition-colors"
				@click="sidebarOpen = true"
			>
				<UIcon name="lucide:sparkles" class="w-3.5 h-3.5" />
				Ask Earnest
			</button>

			<!-- Contextual AI Sidebar -->
			<ClientOnly>
				<AIContextualSidebar
					v-if="sidebarOpen"
					entity-type="email"
					:entity-id="String(templateId)"
					:entity-label="template.name || 'Email Template'"
					@close="closeSidebar"
				/>
				<Transition name="overlay">
					<div v-if="sidebarOpen" class="fixed inset-0 bg-black/20 z-40" @click="closeSidebar" />
				</Transition>
			</ClientOnly>
		</template>
	</div>
</template>
