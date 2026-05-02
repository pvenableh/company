<template>
	<LayoutPageContainer>
		<div class="flex items-center justify-between mb-6">
			<div>
				<h2 class="text-2xl font-semibold">Service Templates</h2>
				<p class="text-sm t-text-secondary mt-1">
					Reusable service offerings the AI proposal-drafter pulls from on
					<NuxtLink to="/leads" class="underline">leads</NuxtLink>.
				</p>
			</div>
			<UButton color="primary" @click="openNew">
				<UIcon name="i-heroicons-plus" class="h-4 w-4" />
				New template
			</UButton>
		</div>

		<UAlert
			v-if="!selectedOrg"
			class="mb-6"
			title="No organization selected"
			description="Pick an organization from the global header to manage templates."
			color="blue"
		/>

		<div v-else-if="loading" class="flex justify-center py-12">
			<UIcon name="i-heroicons-arrow-path" class="animate-spin h-8 w-8" />
		</div>

		<UCard v-else-if="!templates.length" class="text-center py-10">
			<UIcon name="i-heroicons-rectangle-stack" class="mx-auto h-10 w-10 text-gray-300 mb-3" />
			<h3 class="text-base font-medium mb-1">No templates yet</h3>
			<p class="t-text-secondary text-sm mb-4 max-w-md mx-auto">
				Add the services you offer most often. The AI uses these as a baseline when drafting proposals from leads, blending your scope copy with the lead's specific brief.
			</p>
			<UButton color="primary" @click="openNew">Add your first template</UButton>
		</UCard>

		<div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			<button
				v-for="t in templates"
				:key="t.id"
				class="text-left ios-card p-4 hover:border-primary/40 transition-colors"
				:class="t.status === 'archived' ? 'opacity-60' : ''"
				@click="openEdit(t)"
			>
				<div class="flex items-start justify-between gap-2 mb-2">
					<div class="flex-1 min-w-0">
						<p class="text-[10px] uppercase tracking-wider t-text-muted">{{ t.category || 'other' }}</p>
						<h3 class="text-base font-semibold truncate">{{ t.name }}</h3>
					</div>
					<span
						class="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full"
						:class="statusChipClass(t.status)"
					>{{ t.status }}</span>
				</div>
				<p v-if="t.description" class="text-sm t-text-secondary line-clamp-2 mb-3">{{ t.description }}</p>
				<div class="flex items-center justify-between text-xs t-text-muted">
					<span v-if="t.default_total != null">{{ formatMoney(t.default_total) }}</span>
					<span v-else>—</span>
					<span v-if="t.default_duration_days">{{ t.default_duration_days }} days</span>
				</div>
			</button>
		</div>

		<ServiceTemplatesFormModal
			v-model="modalOpen"
			:template="selectedTemplate"
			@created="onCreated"
			@updated="onUpdated"
			@deleted="onDeleted"
		/>
	</LayoutPageContainer>
</template>

<script setup lang="ts">
import type { ServiceTemplate } from '~/composables/useServiceTemplates';

definePageMeta({ middleware: ['auth'] });
useHead({ title: 'Service Templates | Earnest' });

const { selectedOrg } = useOrganization();
const { list } = useServiceTemplates();

const templates = ref<ServiceTemplate[]>([]);
const loading = ref(false);
const modalOpen = ref(false);
const selectedTemplate = ref<Partial<ServiceTemplate> | null>(null);

function statusChipClass(status: string) {
	if (status === 'published') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
	if (status === 'draft') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
	return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

function formatMoney(n: number) {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

async function fetchTemplates() {
	if (!selectedOrg.value) return;
	loading.value = true;
	try {
		templates.value = await list({ includeArchived: true });
	} finally {
		loading.value = false;
	}
}

function openNew() {
	selectedTemplate.value = null;
	modalOpen.value = true;
}

function openEdit(t: ServiceTemplate) {
	selectedTemplate.value = t;
	modalOpen.value = true;
}

function onCreated(t: ServiceTemplate) {
	templates.value = [t, ...templates.value];
}

function onUpdated(t: ServiceTemplate) {
	const idx = templates.value.findIndex((x) => x.id === t.id);
	if (idx !== -1) templates.value[idx] = t;
}

function onDeleted(id: string) {
	templates.value = templates.value.filter((t) => t.id !== id);
}

watch(() => selectedOrg.value, fetchTemplates, { immediate: true });
</script>
