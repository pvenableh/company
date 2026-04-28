<script setup>
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Building2, Plus, Check, Settings, Archive } from 'lucide-vue-next'

const props = defineProps({
	modelValue: {
		type: Boolean,
		default: false,
	},
});

const emit = defineEmits(['update:modelValue']);

const {
	selectedOrg,
	visibleOrganizations,
	hasArchivedOrgs,
	showArchived,
	setOrganization,
	hasMultipleOrgs,
} = useOrganization();
const { clearClient } = useClients();
const config = useRuntimeConfig();

const isOpen = computed({
	get: () => props.modelValue,
	set: (val) => emit('update:modelValue', val),
});

const getIconUrl = (org) => {
	if (!org?.icon) return undefined;
	return `${config.public.directusUrl}/assets/${org.icon}?key=avatar`;
};

const getInitials = (org) => {
	if (!org?.name) return '';
	return org.name
		.split(' ')
		.map((word) => word[0])
		.join('')
		.toUpperCase()
		.substring(0, 2);
};

const handleSelectOrg = (orgId) => {
	if (orgId !== selectedOrg.value) {
		setOrganization(orgId);
		clearClient();
	}
	isOpen.value = false;
};

const handleRegisterOrg = () => {
	isOpen.value = false;
	navigateTo('/organization/new');
};
</script>

<template>
	<UModal v-model="isOpen" :ui="{ width: 'max-w-md' }">
		<div class="p-6">
			<div class="flex items-center gap-3 mb-6">
				<div class="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
					<Building2 class="size-5 text-gray-500" />
				</div>
				<div>
					<h2 class="text-lg font-semibold text-gray-900">Switch Organization</h2>
					<p class="text-sm text-gray-500">Select which organization to work in</p>
				</div>
			</div>

			<!-- Organization list -->
			<div class="space-y-2 mb-3 max-h-[60vh] overflow-y-auto">
				<div
					v-for="org in visibleOrganizations"
					:key="org.id"
					role="button"
					tabindex="0"
					class="w-full flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer"
					:class="[
						selectedOrg === org.id
							? 'border-[var(--cyan)] bg-cyan-50/50'
							: 'border-gray-200 hover:border-gray-300 hover:bg-gray-50',
						org.archived_at && 'opacity-70',
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
						<p class="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
							{{ org.name }}
							<span
								v-if="org.archived_at"
								class="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded"
							>
								<Archive class="size-3" />
								Archived
							</span>
						</p>
						<div class="flex items-center gap-3 mt-0.5">
							<span v-if="org.ticketsCount > 0" class="text-[10px] text-gray-400">
								{{ org.ticketsCount }} ticket{{ org.ticketsCount !== 1 ? 's' : '' }}
							</span>
							<span v-if="org.projectsCount > 0" class="text-[10px] text-gray-400">
								{{ org.projectsCount }} project{{ org.projectsCount !== 1 ? 's' : '' }}
							</span>
							<span v-if="org.plan" class="text-[10px] text-[var(--cyan)] uppercase">
								{{ org.plan }}
							</span>
						</div>
					</div>

					<NuxtLink
						:to="`/organization`"
						class="p-1.5 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
						title="Organization settings"
						@click.stop="isOpen = false; setOrganization(org.id)"
					>
						<Settings class="size-4 text-gray-400 hover:text-gray-600" />
					</NuxtLink>
					<Check
						v-if="selectedOrg === org.id"
						class="size-5 text-[var(--cyan)] shrink-0"
					/>
				</div>

				<p v-if="visibleOrganizations.length === 0" class="text-center text-xs text-gray-400 py-4">
					{{ hasArchivedOrgs ? 'All organizations are archived. Toggle below to view.' : 'No organizations.' }}
				</p>
			</div>

			<!-- Show-archived toggle (only when archived orgs exist) -->
			<div v-if="hasArchivedOrgs" class="mb-4 px-1">
				<label class="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
					<input
						v-model="showArchived"
						type="checkbox"
						class="rounded border-gray-300 text-[var(--cyan)] focus:ring-[var(--cyan)]"
					/>
					<span class="flex items-center gap-1">
						<Archive class="size-3" />
						Show archived organizations
					</span>
				</label>
			</div>

			<!-- Register new organization -->
			<div class="border-t border-gray-200 pt-4">
				<button
					class="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-gray-300 hover:border-[var(--cyan)] hover:bg-cyan-50/30 transition-all group"
					@click="handleRegisterOrg"
				>
					<div class="w-10 h-10 rounded-xl bg-gray-100 group-hover:bg-cyan-100 flex items-center justify-center transition-colors">
						<Plus class="size-5 text-gray-400 group-hover:text-[var(--cyan)] transition-colors" />
					</div>
					<div class="text-left">
						<p class="text-sm font-medium text-gray-700 group-hover:text-gray-900">Register New Organization</p>
						<p class="text-xs text-gray-400">Requires a new subscription</p>
					</div>
				</button>
			</div>
		</div>
	</UModal>
</template>
