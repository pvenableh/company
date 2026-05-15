<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Building2, Sparkles, ArrowRight, PlayCircle, Check, ExternalLink, UserCog, Plus } from 'lucide-vue-next';

const props = defineProps<{
	modelValue: boolean;
}>();

const emit = defineEmits<{
	(e: 'update:modelValue', value: boolean): void;
}>();

const config = useRuntimeConfig();
const route = useRoute();

const {
	visibleOrganizations,
	selectedOrg,
	currentOrg,
	setOrganization,
} = useOrganization();
const { clearClient } = useClients();

const isOpen = computed({
	get: () => props.modelValue,
	set: (val) => emit('update:modelValue', val),
});

// User has their own workspace if any of their orgs has a real staff
// membership (member/manager/admin/owner). When true, suppress the upsell —
// they already have what we'd be selling.
const hasOwnWorkspace = computed(() =>
	visibleOrganizations.value.some((o: any) => !!o.membership),
);

const hasMultiple = computed(() => visibleOrganizations.value.length > 1);

const activeOrgName = computed(() => currentOrg.value?.name ?? null);

function getIconUrl(org: any) {
	if (!org?.icon) return undefined;
	return `${config.public.directusUrl}/assets/${org.icon}?key=avatar`;
}

function getInitials(org: any) {
	if (!org?.name) return '';
	return org.name
		.split(' ')
		.map((word: string) => word[0])
		.join('')
		.toUpperCase()
		.substring(0, 2);
}

function roleLabel(org: any) {
	const slug = org?.membership?.role?.slug;
	if (!slug) return null;
	return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function handleSelectOrg(orgId: string) {
	if (orgId !== selectedOrg.value) {
		setOrganization(orgId);
		clearClient();

		// Leaving the portal: if the new org has no portal row, drop back to /
		// so the user isn't stranded on a /portal/* route in staff context.
		const newOrg = visibleOrganizations.value.find((o: any) => o.id === orgId);
		if (route.path.startsWith('/portal') && !newOrg?.clientPortal) {
			navigateTo('/');
		} else if (import.meta.client) {
			// Re-fetch portal-scoped data for the new org.
			window.location.reload();
		}
	}
	isOpen.value = false;
}

function goToSignup() {
	isOpen.value = false;
	navigateTo('/organization/new');
}

function goToDemo() {
	isOpen.value = false;
	navigateTo('/try-demo');
}
</script>

<template>
	<UModal v-model="isOpen" :ui="{ width: 'max-w-md' }">
		<div class="p-6">
			<div class="flex items-center gap-3 mb-5">
				<div
					class="w-10 h-10 rounded-xl flex items-center justify-center"
					:class="hasOwnWorkspace ? 'bg-gray-100' : 'bg-info/10'"
				>
					<Building2 v-if="hasOwnWorkspace" class="size-5 text-gray-500" />
					<Sparkles v-else class="size-5 text-[var(--cyan)]" />
				</div>
				<div>
					<h2 class="text-lg font-semibold text-gray-900">
						{{ hasMultiple ? 'Switch Organization' : 'Run your business on Earnest' }}
					</h2>
					<p class="text-sm text-gray-500">
						<template v-if="hasMultiple">Pick which workspace to use.</template>
						<template v-else>A workspace built for studios, agencies, and operators.</template>
					</p>
				</div>
			</div>

			<!-- Org list — visible whenever the user has any orgs at all. The
			     active one is highlighted with the cyan ring; click to switch. -->
			<div v-if="visibleOrganizations.length > 0" class="space-y-2 mb-4 max-h-[55vh] overflow-y-auto">
				<div
					v-for="org in visibleOrganizations"
					:key="org.id"
					role="button"
					tabindex="0"
					class="w-full flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer"
					:class="[
						selectedOrg === org.id
							? 'border-[var(--cyan)] bg-info/10'
							: 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
					]"
					@click="handleSelectOrg(org.id)"
					@keydown.enter.prevent="handleSelectOrg(org.id)"
					@keydown.space.prevent="handleSelectOrg(org.id)"
				>
					<Avatar class="size-10">
						<AvatarImage v-if="getIconUrl(org)" :src="getIconUrl(org)" :alt="org.name" />
						<AvatarFallback class="text-sm font-medium">
							{{ getInitials(org) }}
						</AvatarFallback>
					</Avatar>

					<div class="flex-1 text-left min-w-0">
						<p class="text-sm font-medium text-gray-900 truncate">{{ org.name }}</p>
						<div class="flex items-center gap-1.5 mt-1 flex-wrap">
							<span
								v-if="roleLabel(org)"
								class="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded"
							>
								<UserCog class="size-3" />
								{{ roleLabel(org) }}
							</span>
							<span
								v-if="org.clientPortal"
								class="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--cyan)] bg-info/10 px-1.5 py-0.5 rounded"
							>
								<ExternalLink class="size-3" />
								Client Portal
							</span>
							<span v-if="org.plan" class="text-[10px] text-[var(--cyan)] uppercase">
								{{ org.plan }}
							</span>
						</div>
					</div>

					<Check
						v-if="selectedOrg === org.id"
						class="size-5 text-[var(--cyan)] shrink-0"
					/>
				</div>
			</div>

			<!-- Upsell — only when the user doesn't already have their own
			     workspace. Pitches "be like {activeOrg} and run your own". -->
			<template v-if="!hasOwnWorkspace">
				<div class="rounded-xl border border-gray-200 bg-gray-50/50 p-4 mb-3">
					<div class="flex items-center gap-2 mb-2">
						<Building2 class="size-4 text-gray-400" />
						<span class="text-xs uppercase tracking-wider text-gray-500 font-medium">
							{{ activeOrgName || 'This team' }} is using Earnest
						</span>
					</div>
					<p class="text-sm text-gray-700 leading-relaxed">
						You can be like {{ activeOrgName || 'them' }} — sign up for your own Earnest
						workspace and run your business with the same tools: projects, tickets,
						invoices, contracts, marketing, and more.
					</p>
				</div>

				<button
					class="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--cyan)] hover:bg-[var(--cyan)]/90 transition-colors group"
					@click="goToSignup"
				>
					<span class="text-sm font-medium text-white">Start your Earnest workspace</span>
					<ArrowRight class="size-4 text-white group-hover:translate-x-0.5 transition-transform" />
				</button>

				<button
					class="w-full mt-2 flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-200 hover:border-[var(--cyan)] hover:bg-info/10 transition-colors group"
					@click="goToDemo"
				>
					<div class="flex items-center gap-2">
						<PlayCircle class="size-4 text-gray-400 group-hover:text-[var(--cyan)] transition-colors" />
						<div class="text-left">
							<div class="text-sm font-medium text-gray-700">Try a live demo first</div>
							<div class="text-[11px] text-gray-400">Solo or agency workspace, pre-loaded with sample data</div>
						</div>
					</div>
					<ArrowRight class="size-4 text-gray-400 shrink-0 group-hover:text-[var(--cyan)] group-hover:translate-x-0.5 transition-all" />
				</button>
			</template>

			<!-- Has own workspace already — replace the upsell with a discreet
			     "Register new organization" footer that mirrors OrgSwitcher. -->
			<div v-else class="border-t border-gray-200 pt-4">
				<button
					class="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-gray-300 hover:border-[var(--cyan)] hover:bg-info/10 transition-all group"
					@click="goToSignup"
				>
					<div class="w-10 h-10 rounded-xl bg-gray-100 group-hover:bg-info/10 flex items-center justify-center transition-colors">
						<Plus class="size-5 text-gray-400 group-hover:text-[var(--cyan)] transition-colors" />
					</div>
					<div class="text-left">
						<p class="text-sm font-medium text-gray-700 group-hover:text-gray-900">Register New Organization</p>
						<p class="text-xs text-gray-400">Requires a new subscription</p>
					</div>
				</button>
			</div>

			<button
				class="w-full mt-2 p-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
				@click="isOpen = false"
			>
				Close
			</button>
		</div>
	</UModal>
</template>
